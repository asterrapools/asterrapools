#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/mainnet-v2.sh
# ASTERRAPOOLS V2.0 on mainnet: stock pools with the oracle guard and the launchpad.
#   1. registers the Chainlink feeds of WETH, USDG, TSLA, NVDA and AAPL in the hub and enables the three stock tokens
#      (5 transactions; a v4 pool with a stock opens only while both tokens have a fresh feed),
#   2. makes the launchpad a hub registrar (1 transaction), so `create` works,
#   3. opens and seeds the first stock pool, TSLA/USDG (script/mainnet/SeedStock.s.sol).
# Every call is simulated from the deployer and every feed must answer with a fresh price before anything is sent.
# Stock feeds update 24/5: a feed older than 24h halts its pool (fail closed); liquidity can always be withdrawn.
# Asks the keystore password once; the password lives only in a private temp file deleted on exit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${MAINNET_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
DEPLOYER_ADDRESS="0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/deployer}"
export SIDE_USD_E6="${SIDE_USD_E6:-750000}" # $0.75 per side of TSLA/USDG
MIN_FRESH_LEFT=1800                          # refuse when a feed has under 30 min of freshness left

[ "$(cast chain-id --rpc-url "$RPC")" = "4663" ] || { echo "RPC is not Robinhood Chain mainnet (4663)"; exit 1; }
get() { node -e "console.log(require('$ROOT/packages/sdk/src/addresses/mainnet.json').$1 ?? '')"; }
HUB="$(get hub)"; LAUNCHPAD="$(get launchpad)"
[ -n "$HUB" ] && [ -n "$LAUNCHPAD" ] || { echo "STOP: mainnet.json has no hub or launchpad. Deploy V1.0 first."; exit 1; }
WETH="0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
USDG="0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
TSLA="0x322F0929c4625eD5bAd873c95208D54E1c003b2d"
NVDA="0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"
AAPL="0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"
# Chainlink feed proxies on Robinhood Chain (description() and latestRoundData() checked on-chain)
F_WETH="0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9"
F_USDG="0x61B7e5650328764B076A108EFF5fa7282a1B9aD2"
F_TSLA="0x4A1166a659A55625345e9515b32adECea5547C38"
F_NVDA="0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15"
F_AAPL="0x6B22A786bAa607d76728168703a39Ea9C99f2cD0"
CANONICAL=1; STOCK=2
# rows: token class enabled feed maxStaleness. Windows are longer than each feed's longest observed gap: stocks up to
# ~14h overnight, WETH up to ~8h, USDG has a 24h heartbeat.
ROWS=("$WETH $CANONICAL true $F_WETH 86400" "$USDG $CANONICAL true $F_USDG 172800"
      "$TSLA $STOCK true $F_TSLA 86400" "$NVDA $STOCK true $F_NVDA 86400" "$AAPL $STOCK true $F_AAPL 86400")
SIG='setAsset(address,uint8,bool,address,uint32)'

now="$(date +%s)"
for r in "${ROWS[@]}"; do
  set -- $r
  upd="$(cast call "$4" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' --rpc-url "$RPC" | sed -n 4p | awk '{print $1}')"
  left=$(( upd + $5 - now ))
  echo "  $1 feed: $(( (now - upd) / 60 )) min old, fresh for $(( left / 60 )) more min"
  [ "$left" -gt "$MIN_FRESH_LEFT" ] || { echo "STOP: feed $4 is stale or about to be. Wait for the market to update it. Nothing was sent."; exit 1; }
  cast call "$HUB" "$SIG" "$1" "$2" "$3" "$4" "$5" --from "$DEPLOYER_ADDRESS" --rpc-url "$RPC" >/dev/null
done
cast call "$HUB" 'setRegistrar(address,bool)' "$LAUNCHPAD" true --from "$DEPLOYER_ADDRESS" --rpc-url "$RPC" >/dev/null

# USDG for both sides of TSLA/USDG (2.03 x side) plus 2% for the ETH/USDG swap
P8="$(cast call "$F_WETH" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' --rpc-url "$RPC" | sed -n 2p | awk '{print $1}')"
export ETH_FOR_USDG="${ETH_FOR_USDG:-$(node -e "console.log((BigInt('$SIDE_USD_E6') * 203n * 102n * 10n**20n / 10000n / BigInt('$P8')).toString())")}"
echo "Plan: 5 feeds, launchpad registrar, TSLA/USDG seeded with \$$(node -e "console.log($SIDE_USD_E6/1e6)") per side (buys USDG with $(cast from-wei "$ETH_FOR_USDG") ETH)"
echo "Deployer: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH. Every call simulated ok."
read -rp "Open V2.0 now? [y/N] " ok
[ "$ok" = y ] || { echo "Nothing sent."; exit 0; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
read -rsp "Keystore password for 'deployer': " pass; echo
printf '%s' "$pass" >"$TMP/pw"; chmod 600 "$TMP/pw"; unset pass
ADDR="$(cast wallet address --keystore "$KEYSTORE" --password-file "$TMP/pw")"
if [ "$(echo "$ADDR" | tr 'A-F' 'a-f')" != "$(echo "$DEPLOYER_ADDRESS" | tr 'A-F' 'a-f')" ]; then
  echo "STOP: keystore is $ADDR, expected $DEPLOYER_ADDRESS. Nothing was sent."; exit 1
fi
SEND=(--keystore "$KEYSTORE" --password-file "$TMP/pw" --rpc-url "$RPC" --json)
ok_tx() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("  tx",j.transactionHash,j.status==="0x1"?"ok":"FAILED")})'; }

echo "1/3  Feeds and stock tokens"
for r in "${ROWS[@]}"; do set -- $r; cast send "$HUB" "$SIG" "$1" "$2" "$3" "$4" "$5" "${SEND[@]}" | ok_tx; done
echo "2/3  Launchpad"
cast send "$HUB" 'setRegistrar(address,bool)' "$LAUNCHPAD" true "${SEND[@]}" | ok_tx
echo "3/3  TSLA/USDG pool"
cd "$ROOT/packages/contracts"
forge script script/mainnet/SeedStock.s.sol:SeedStock --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$TMP/pw" \
  --sender "$DEPLOYER_ADDRESS" --broadcast --slow
echo "prices (hub.tryGetPrice: price, fresh, marketOpen):"
for t in "$TSLA" "$NVDA" "$AAPL" "$WETH" "$USDG"; do
  echo "  $t  $(cast call "$HUB" 'tryGetPrice(address)(uint256,bool,bool)' "$t" --rpc-url "$RPC" | tr '\n' ' ')"
done
echo "Done. Remaining: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH"
