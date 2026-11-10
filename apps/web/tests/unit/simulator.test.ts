import { describe, expect, it } from "vitest";
import { buildLadder, simulate, type Ladder, type SimTrade } from "@/lib/simulator";

const ladder = (o: Partial<Ladder> = {}): Ladder => ({ minPct: -10, maxPct: 10, bins: 10, shape: "spot", amount: 1000, ...o });

/** A trade on a pool of constant liquidity L moving √P from s0 to s1, with `fee` charged on the input. */
function trade(ts: number, L: number, s0: number, s1: number, fee = 0, usd: number | null = null): SimTrade {
  const dx = L * (1 / s1 - 1 / s0); // pool token0 change
  const dy = L * (s1 - s0); // pool token1 change
  return [ts, s1 * s1, dx > 0 ? dx + fee : dx, dy > 0 ? dy + fee : dy, fee, usd];
}

describe("buildLadder", () => {
  it("values every shape at the deposit", () => {
    for (const shape of ["spot", "curve", "bidask"] as const) {
      for (const [minPct, maxPct] of [[-10, 10], [5, 30], [-40, -5]]) {
        const rungs = buildLadder(2, ladder({ shape, minPct, maxPct }));
        expect(rungs).toHaveLength(10);
        expect(rungs.reduce((a, r) => a + r.amount0 * 2 + r.amount1, 0)).toBeCloseTo(1000, 6);
      }
    }
  });
  it("holds token1 below the price and token0 above it", () => {
    const rungs = buildLadder(1, ladder());
    expect(rungs[0]!.amount0).toBe(0);
    expect(rungs[9]!.amount1).toBe(0);
  });
  it("refuses an empty range or amount", () => {
    expect(buildLadder(1, ladder({ minPct: 10, maxPct: 5 }))).toEqual([]);
    expect(buildLadder(1, ladder({ amount: 0 }))).toEqual([]);
  });
});

describe("simulate", () => {
  it("earns its liquidity share of the fees", () => {
    // one bin, sized so its liquidity equals the pool's: it takes half of every fee
    const rung = buildLadder(1, ladder({ bins: 1 }))[0]!;
    const L = rung.liquidity;
    const s = (p: number) => Math.sqrt(p);
    const trades = [trade(10, L, 1, s(1.02), 1), trade(20, L, s(1.02), s(0.99), 2)];
    const r = simulate({ start: 0, price: 1, usd1: 1, trades, ladder: ladder({ bins: 1 }), end: 30 })!;
    expect(r.fees1).toBeCloseTo(0.5, 9); // first trade paid token1
    expect(r.fees0).toBeCloseTo(1, 9); // second paid token0
    const last = r.points.at(-1)!;
    expect(last.inRange).toBe(30);
    expect(last.price).toBeCloseTo(0.99, 12);
  });

  it("stops earning outside the range and holds one token", () => {
    const L = 1e6;
    const trades = [trade(10, L, 1, Math.sqrt(1.2), 5, 100)];
    const r = simulate({ start: 0, price: 1, usd1: null, trades, ladder: ladder(), end: 20 })!;
    const last = r.points.at(-1)!;
    expect(last.inRange).toBe(10);
    // above the range everything sold into token1, worth less than holding (impermanent loss)
    expect(last.value).toBeLessThan(last.hold);
    expect(r.rungs.every((x) => x.liquidity > 0)).toBe(true);
    expect(last.usd1).toBeCloseTo(100 / trades[0]![3], 9);
    expect(r.fees1).toBeGreaterThan(0);
    expect(r.fees1).toBeLessThan(5);
  });

  it("keeps the point count bounded", () => {
    const L = 1e6;
    let s = 1;
    const trades: SimTrade[] = [];
    for (let i = 1; i <= 5000; i++) {
      const s1 = s * (i % 2 ? 1.001 : 0.999);
      trades.push(trade(i, L, s, s1, 0.1));
      s = s1;
    }
    const r = simulate({ start: 0, price: 1, usd1: 1, trades, ladder: ladder(), end: 6000, maxPoints: 300 })!;
    expect(r.points.length).toBeLessThanOrEqual(301);
    expect(r.points.at(-1)!.t).toBe(6000);
  });
});
