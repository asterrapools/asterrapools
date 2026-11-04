// Charts for pools with a short trading history, drawn trade by trade. Hourly candles put a young pool's first hour of
// trading on a single point, so its chart stays flat for hours even while it trades.

export interface Trade {
  ts: string;
  /** pool price (token1 per token0) after the trade */
  price: number | null;
  amount_usd: number | null;
  fee_usd: number | null;
}

/**
 * Most trades in the chart window that are still drawn one by one; busier pools use hourly candles.
 * shortcut: a pool that trades past this within its first hour falls back to hourly points; bucket by minutes then.
 */
export const TRADE_CHART_MAX = 400;

/** Price line, one point per trade, oldest first, led by the price before the first trade when it is known. */
export function tradePrices(trades: Trade[], before: { t: string; price: number } | null): { t: string; price: number }[] {
  const pts = trades.filter((x) => x.price !== null && Number.isFinite(x.price)).map((x) => ({ t: x.ts, price: x.price as number }));
  return before && pts.length ? [before, ...pts] : pts;
}

/**
 * Volume and fees in equal time buckets from the first trade to `now` (at most `n`, each at least a minute wide).
 * Quiet buckets stay in as zero, so the bars keep real time between trades.
 */
export function tradeFlow(trades: Trade[], n = 24, now = Date.now()): { t: string; volume_usd: number; fees_usd: number }[] {
  if (!trades.length) return [];
  const start = Math.min(...trades.map((x) => Date.parse(x.ts)));
  const width = Math.max(60_000, Math.ceil((Math.max(now, start) - start + 1) / n));
  const count = Math.max(1, Math.ceil((Math.max(now, start) - start + 1) / width));
  const out = Array.from({ length: count }, (_, i) => ({ t: new Date(start + i * width).toISOString(), volume_usd: 0, fees_usd: 0 }));
  for (const x of trades) {
    const b = out[Math.min(count - 1, Math.floor((Date.parse(x.ts) - start) / width))]!;
    b.volume_usd += x.amount_usd ?? 0;
    b.fees_usd += x.fee_usd ?? 0;
  }
  return out;
}
