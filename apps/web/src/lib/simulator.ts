/**
 * Liquidity simulator: replays a ladder of price ranges ("bins") against a pool's real trades.
 *
 * Each bin is a concentrated range [lower, upper] holding liquidity L (x = L(1/√P − 1/√Pb), y = L(√P − √Pa)), in
 * whole-token units with prices as token1 per token0. The pool's own active liquidity at each trade is read off the
 * trade itself, from the side paid out (fee free): token1 out = L·Δ√P, token0 out = L·Δ(1/√P). A trade's fee is split
 * pro rata between the pool and the ladder over the part of the price path each bin covers. The ladder rides along
 * the pool's real price path.
 */
import { shapeWeight, type BinShape } from "./dlmm";

/** [unix seconds, price after the trade, pool delta0, pool delta1, fee in the input token, amount_usd], whole tokens. */
export type SimTrade = [number, number, number, number, number, number | null];

export interface Ladder {
  /** range edges in percent from the opening price, e.g. -20 and 20 */
  minPct: number;
  maxPct: number;
  bins: number;
  shape: BinShape;
  /** deposit value in token1 */
  amount: number;
}

export interface Rung {
  lower: number;
  upper: number;
  liquidity: number;
  /** holdings at the opening price */
  amount0: number;
  amount1: number;
}

export interface SimPoint {
  t: number;
  price: number;
  /** values in token1 */
  value: number;
  fees: number;
  hold: number;
  /** token1 in USD at this moment, when the pool's trades carry USD values */
  usd1: number | null;
  /** seconds spent inside the ladder since the start */
  inRange: number;
}

export interface SimResult {
  rungs: Rung[];
  points: SimPoint[];
  /** fees earned per token, whole units */
  fees0: number;
  fees1: number;
  /** trades replayed */
  trades: number;
}

export const MAX_RUNGS = 40;

/** Holdings of one unit of liquidity in [sa, sb] (square-root prices) at √P = s. */
function unit(s: number, sa: number, sb: number): [number, number] {
  if (s <= sa) return [1 / sa - 1 / sb, 0];
  if (s >= sb) return [0, sb - sa];
  return [1 / s - 1 / sb, s - sa];
}

/** USD per token1 implied by a trade, or null when it carries no USD value. */
export function usdPerToken1(t: SimTrade): number | null {
  return t[5] !== null && t[5] > 0 && t[3] !== 0 ? t[5] / Math.abs(t[3]) : null;
}

/** Splits `ladder.amount` (token1 value) over geometric bins between the range edges, weighted by the shape. */
export function buildLadder(price: number, ladder: Ladder): Rung[] {
  const lo = price * (1 + ladder.minPct / 100);
  const hi = price * (1 + ladder.maxPct / 100);
  const n = Math.max(1, Math.min(MAX_RUNGS, Math.round(ladder.bins)));
  if (!(price > 0) || !(lo > 0) || !(hi > lo) || !(ladder.amount > 0)) return [];
  const edges = Array.from({ length: n + 1 }, (_, i) => lo * Math.pow(hi / lo, i / n));
  // the bin holding the price, or the nearest one when the range sits wholly on one side
  const active = price <= lo ? 0 : price >= hi ? n - 1 : Math.min(n - 1, edges.findIndex((e) => e > price) - 1);
  const radius = Math.max(active, n - 1 - active);
  const s = Math.sqrt(price);
  const w = edges.slice(0, n).map((_, i) => shapeWeight(ladder.shape, i - active, radius));
  const total = w.reduce((a, b) => a + b, 0);
  return w.map((wi, i) => {
    const sa = Math.sqrt(edges[i]!);
    const sb = Math.sqrt(edges[i + 1]!);
    const [x, y] = unit(s, sa, sb);
    const liquidity = (ladder.amount * wi) / total / (x * price + y);
    return { lower: edges[i]!, upper: edges[i + 1]!, liquidity, amount0: x * liquidity, amount1: y * liquidity };
  });
}

/** Replays `trades` (oldest first) from `start` at `price` until `end`; at most `maxPoints` points are kept. */
export function simulate(p: { start: number; price: number; usd1: number | null; trades: SimTrade[]; ladder: Ladder; end: number; maxPoints?: number }): SimResult | null {
  const rungs = buildLadder(p.price, p.ladder);
  if (!rungs.length) return null;
  const bins = rungs.map((r) => ({ sa: Math.sqrt(r.lower), sb: Math.sqrt(r.upper), L: r.liquidity }));
  const x0 = rungs.reduce((a, r) => a + r.amount0, 0);
  const y0 = rungs.reduce((a, r) => a + r.amount1, 0);
  const sLo = bins[0]!.sa;
  const sHi = bins[bins.length - 1]!.sb;

  let s = Math.sqrt(p.price);
  let t = p.start;
  let poolL: number | null = null;
  let fees0 = 0;
  let fees1 = 0;
  let inRange = 0;
  let usd1 = p.usd1;
  let count = 0;
  const all: SimPoint[] = [];
  const point = (at: number): SimPoint => {
    const P = s * s;
    const value = bins.reduce((a, b) => {
      const [x, y] = unit(s, b.sa, b.sb);
      return a + b.L * (x * P + y);
    }, 0);
    return { t: at, price: P, value, fees: fees0 * P + fees1, hold: x0 * P + y0, usd1, inRange };
  };
  const inside = () => s >= sLo && s <= sHi;
  all.push(point(p.start));

  for (const tr of p.trades) {
    const [ts, price, d0, d1, fee] = tr;
    if (ts < p.start || ts > p.end || !(price > 0)) continue;
    if (inside()) inRange += Math.max(0, ts - t);
    t = Math.max(t, ts);
    const s1 = Math.sqrt(price);
    const in0 = d0 > 0;
    const moved = Math.abs(s1 - s) > s * 1e-9;
    // the pool's liquidity over this move, from the token paid out
    const out = in0 ? -d1 : -d0;
    // token0 in moves the price down and pays out L·(√P0 − √P1) of token1; token1 in pays out L·(1/√P0 − 1/√P1) of token0
    const span = in0 ? s - s1 : 1 / s - 1 / s1;
    if (moved && out > 0 && span > 0) poolL = out / span;
    if (poolL !== null && fee > 0) {
      const lo = Math.min(s, s1);
      const hi = Math.max(s, s1);
      let share = 0;
      for (const b of bins) {
        if (!moved) {
          if (s >= b.sa && s < b.sb) share += b.L / (poolL + b.L);
          continue;
        }
        const a = Math.max(lo, b.sa);
        const c = Math.min(hi, b.sb);
        if (c <= a) continue;
        const frac = in0 ? (1 / a - 1 / c) / (1 / lo - 1 / hi) : (c - a) / (hi - lo);
        share += (frac * b.L) / (poolL + b.L);
      }
      if (in0) fees0 += fee * share;
      else fees1 += fee * share;
    }
    s = s1;
    count++;
    usd1 = usdPerToken1(tr) ?? usd1;
    all.push(point(ts));
  }
  if (inside()) inRange += Math.max(0, p.end - t);
  all.push(point(Math.max(p.end, t)));

  const max = p.maxPoints ?? 400;
  const step = Math.ceil(all.length / max);
  const points = step <= 1 ? all : all.filter((_, i) => i % step === 0 || i === all.length - 1);
  return { rungs, points, fees0, fees1, trades: count };
}
