import { type Trade, tradeFlow, tradePrices } from "./trades.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const T0 = Date.parse("2026-11-04T11:43:00Z");
const trade = (sec: number, price: number | null, usd = 10, fee = 0.03): Trade => ({
  ts: new Date(T0 + sec * 1000).toISOString(), price, amount_usd: usd, fee_usd: fee,
});

Deno.test("price line: one point per trade, led by the price before trading, trades without a price skipped", () => {
  const pts = tradePrices([trade(0, 230), trade(40, null), trade(80, 228.5)], { t: "2026-11-04T10:00:00Z", price: 229.9 });
  assert(pts.length === 3, `3 points, got ${pts.length}`);
  assert(pts[0]!.price === 229.9 && pts[2]!.price === 228.5, "before first, then the priced trades in order");
  assert(tradePrices([], { t: "x", price: 1 }).length === 0, "no trades, no line");
});

Deno.test("flow: equal buckets up to now, quiet ones as zero, totals kept", () => {
  const trades = [trade(0, 230, 100, 0.3), trade(30, 229, 50, 0.15), trade(600, 231, 25, 0.075)];
  const now = T0 + 20 * 60_000; // 20 minutes after the first trade
  const b = tradeFlow(trades, 24, now);
  assert(b.length <= 24 && b.length >= 20, `about 20 one-minute buckets, got ${b.length}`);
  assert(b[0]!.volume_usd === 150, `first minute holds both early trades, got ${b[0]!.volume_usd}`);
  assert(b.some((x) => x.volume_usd === 0), "quiet minutes stay as zero");
  const total = b.reduce((s, x) => s + x.volume_usd, 0);
  assert(total === 175, `volume kept, got ${total}`);
  assert(Math.abs(b.reduce((s, x) => s + x.fees_usd, 0) - 0.525) < 1e-9, "fees kept");
  // a long history: buckets widen instead of multiplying
  assert(tradeFlow(trades, 24, T0 + 10 * 86_400_000).length <= 24, "never more than n buckets");
  assert(tradeFlow([], 24, now).length === 0, "no trades, no bars");
});
