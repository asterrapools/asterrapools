import { derivePrices, lastOraclePrice } from "./pricing.ts";

const TSLA = "0xa";
const USDG = "0xb";
const tokens = (oraclePrice: number | null) => [
  { address: TSLA, symbol: "TSLA", kind: "stock", decimals: 18, oraclePrice },
  { address: USDG, symbol: "USDG", kind: "canonical", decimals: 6 },
];
const pool = { pool_id: "0xp", venue: "V4", token0: TSLA, token1: USDG, price: 391.8, reserve0: 10n ** 16n, reserve1: 4_000_000n };

Deno.test("lastOraclePrice keeps only a price that came from the oracle", () => {
  if (lastOraclePrice({ price_usd: 360, price_source: "oracle" }) !== 360) throw new Error("oracle price dropped");
  if (lastOraclePrice({ price_usd: 391, price_source: "pool:0xp" }) !== null) throw new Error("pool price kept");
  if (lastOraclePrice({ price_usd: null, price_source: "oracle" }) !== null) throw new Error("empty price kept");
});

Deno.test("a kept oracle price outranks the token's pool price", () => {
  const p = derivePrices(tokens(lastOraclePrice({ price_usd: 360, price_source: "oracle" })), [pool]).get(TSLA);
  if (p?.source !== "oracle" || p.price !== 360) throw new Error(`got ${JSON.stringify(p)}`);
});

Deno.test("without an oracle price the pool prices the token", () => {
  const p = derivePrices(tokens(null), [pool]).get(TSLA);
  if (p?.source !== "pool") throw new Error(`got ${JSON.stringify(p)}`);
});
