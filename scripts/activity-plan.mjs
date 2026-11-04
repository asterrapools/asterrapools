// Jalankan di: ROOT  ->  node scripts/activity-plan.mjs <api-url> <anchors.json>     (self-check: node scripts/activity-plan.mjs --test)
// Plans one round of testnet activity: one swap per Asterra pool, printed as
//   venue pool token0 token1 fee tickSpacing hooks mode tokenIn tokenOut amountIn
// Sizes follow the pool, not the wallet: a slice of the input side's reserve (DLMM a larger slice, since price only moves
// when a swap crosses a bin). The direction leans back toward an anchor price (the oracle reference, else the price seen
// on the first round), so the price walks around it like a market instead of drifting into the 500 bps circuit breaker.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ZERO = "0x0000000000000000000000000000000000000000";
// DAMM and V4: at most ~1.2% price move per swap; DLMM: 0.3-1.5 bins of 0.25% on the testnet layout (~9% of a side per bin)
const SLICE = { DLMM: [0.03, 0.14], DAMM: [0.0015, 0.006], V4: [0.0015, 0.006] };

/** Pool price as token1 per token0; DLMM pools fall back to their active bin. */
export function priceOf(p) {
  if (p.price) return p.price;
  if (p.venue === "DLMM" && p.active_index !== null && p.bin_step_bps)
    return Math.exp(p.active_index * Math.log1p(p.bin_step_bps / 10_000)) * 10 ** (p.token0.decimals - p.token1.decimals);
  return null;
}

/** Probability of pushing the price up: 50% at the anchor, falling to 8% at +1.4% and rising to 92% at -1.4%. */
export function upChance(price, anchor) {
  return Math.min(0.92, Math.max(0.08, 0.5 - (price / anchor - 1) * 30));
}

export function plan(pools, anchors, rand = Math.random) {
  const out = [];
  for (const p of pools) {
    const slice = SLICE[p.venue];
    const price = priceOf(p);
    if (p.external || !slice || !price) continue;
    // reference_price_usd is USD per token0; it equals token1 per token0 because every testnet pool quotes aUSD
    anchors[p.pool_id] ??= p.oracle?.reference_price_usd ?? price;
    const up = rand() < upChance(price, anchors[p.pool_id]);
    // pushing the price up means buying token0 with token1
    const [tin, tout, reserve] = up ? [p.token1.address, p.token0.address, p.reserve1] : [p.token0.address, p.token1.address, p.reserve0];
    const s = slice[0] + rand() * (slice[1] - slice[0]);
    const amount = (BigInt(reserve ?? 0) * BigInt(Math.round(s * 1e6))) / 1_000_000n;
    if (amount === 0n) continue;
    out.push([p.venue, p.pool_address ?? ZERO, p.token0.address, p.token1.address, p.fee_pips, p.tick_spacing ?? 0, p.hooks ?? ZERO, p.mode, tin, tout, amount].join(" "));
  }
  return out;
}

if (process.argv[2] === "--test") {
  const assert = (await import("node:assert/strict")).default;
  const tok = (a, d) => ({ address: a, decimals: d });
  const dlmm = { pool_id: "d", venue: "DLMM", pool_address: "0xd", price: null, active_index: -8855, bin_step_bps: 25, token0: tok("0xa", 18), token1: tok("0xu", 6), reserve0: "220000000000000000000", reserve1: "55000000000", oracle: { reference_price_usd: 250 }, mode: "oracle", fee_pips: 3000 };
  assert.ok(Math.abs(priceOf(dlmm) - 249.92) < 0.01);
  assert.equal(upChance(250, 250), 0.5);
  assert.ok(upChance(255, 250) < 0.1 && upChance(245, 250) > 0.9);
  const anchors = {};
  // rand 0 => always up (buy token0 with token1) at the smallest slice: 3% of 55,000 aUSD
  assert.deepEqual(plan([dlmm], anchors, () => 0), ["DLMM 0xd 0xa 0xu 3000 0 " + ZERO + " oracle 0xu 0xa 1650000000"]);
  assert.equal(anchors.d, 250);
  // above the anchor, a mid draw sells token0
  const high = { ...dlmm, price: 254, oracle: null, pool_id: "h" };
  assert.match(plan([high], { h: 250 }, () => 0.5)[0], / 0xa 0xu \d+$/);
  // external pools and pools without a price are skipped
  assert.deepEqual(plan([{ ...dlmm, external: true }, { ...dlmm, venue: "DAMM", price: null }], {}), []);
  console.log("activity-plan ok");
} else if (process.argv[2]) {
  const [api, file] = process.argv.slice(2);
  const anchors = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const res = await fetch(`${api}/chains/46630/pools`);
  if (!res.ok) throw new Error(`pools API ${res.status}`);
  const lines = plan((await res.json()).data, anchors);
  writeFileSync(file, JSON.stringify(anchors));
  console.log(lines.join("\n"));
}
