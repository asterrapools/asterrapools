#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/mainnet-launch-v1.sh
# ASTERRAPOOLS V1.0 launch on mainnet, after scripts/mainnet-deploy.sh --broadcast:
#   1. buys USDG with ETH_FOR_USDG through the deep native ETH/USDG Uniswap v4 pool (stateless V4Swapper helper that
#      this deployer already uses on mainnet; ETH input needs no approval),
#   2. opens the WETH/USDG v4 pool behind the Asterra hook at the Chainlink ETH price and seeds it full range with the
#      USDG bought plus the matching WETH (script/mainnet/SeedV1.s.sol),
#   3. smoke-tests it with a small ETH -> USDG swap through the Asterra router (also the first chart point).
# forge simulates step 2 before sending it, so a failing seed sends nothing (the USDG bought stays on the deployer). Asks for confirmation and the keystore password once; the password lives
# only in a private temp file deleted on exit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${MAINNET_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
EXPLORER="https://robinhoodchain.blockscout.com"
DEPLOYER_ADDRESS="0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/deployer}"
ETH_FOR_USDG="${ETH_FOR_USDG:-1200000000000000}" # 0.0012 ETH, the USDG side of the pool
SMOKE_ETH="${SMOKE_ETH:-50000000000000}"         # 0.00005 ETH
GAS_RESERVE=300000000000000                      # keep 0.0003 ETH for gas
SWAPPER="0x059EE2a35144208F577D55FDB007c7362E289A91"
F_WETH="0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9" # Chainlink ETH/USD on Robinhood Chain
# native ETH/USDG v4 pool (id 0xa791e516…cd35, the deepest USDG venue on the chain)
ETH_USDG_KEY="(0x0000000000000000000000000000000000000000,0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168,8388608,1,0x987E330F00B79864a07FE81dFaC344D0078ABCC0)"

[ "$(cast chain-id --rpc-url "$RPC")" = "4663" ] || { echo "RPC is not Robinhood Chain mainnet (4663)"; exit 1; }
get() { node -e "console.log(require('$ROOT/packages/sdk/src/addresses/mainnet.json').$1 ?? '')"; }
USDG="$(get tokens.USDG.address)"; WETH="$(get weth)"; ROUTER="$(get router)"; HOOK="$(get hook)"
[ -n "$ROUTER" ] || { echo "STOP: mainnet.json has no router. Run bash scripts/mainnet-deploy.sh --broadcast first."; exit 1; }

# Chainlink answer has 8 decimals; the pool price is USDG (6 decimals) per ETH
ANSWER="$(cast call "$F_WETH" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' --rpc-url "$RPC" | sed -n 2p | awk '{print $1}')"
PRICE6="$(( ANSWER / 100 ))"
ETH_BAL="$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC")"
USDG_NOW="$(cast call "$USDG" 'balanceOf(address)(uint256)' "$DEPLOYER_ADDRESS" --rpc-url "$RPC" | awk '{print $1}')"
# expected USDG after the buy (0.5% below the oracle for fees); the WETH side matches it
SEED_USDG_EST="$(node -e "console.log((BigInt('$USDG_NOW') + BigInt('$ETH_FOR_USDG') * BigInt('$PRICE6') * 995n / 1000n / 10n**18n).toString())")"
SEED_ETH_EST="$(node -e "console.log((BigInt('$SEED_USDG_EST') * 10n**18n / BigInt('$PRICE6')).toString())")"
need_eth="$(node -e "console.log((BigInt('$ETH_FOR_USDG') + BigInt('$SEED_ETH_EST') + BigInt('$SMOKE_ETH') + BigInt('$GAS_RESERVE')).toString())")"

echo "ETH price:   \$$(node -e "console.log($PRICE6/1e6)") (Chainlink)"
echo "Deployer:    $(cast from-wei "$ETH_BAL") ETH, $(node -e "console.log($USDG_NOW/1e6)") USDG"
echo "Plan:        buy USDG with $(cast from-wei "$ETH_FOR_USDG") ETH, seed WETH/USDG with about $(cast from-wei "$SEED_ETH_EST") ETH + $(node -e "console.log($SEED_USDG_EST/1e6)") USDG (≈ \$$(node -e "console.log((2*$SEED_USDG_EST/1e6).toFixed(2))"))"
if [ "$(node -e "console.log(BigInt('$ETH_BAL') < BigInt('$need_eth'))")" = true ]; then
  echo "STOP: need $(cast from-wei "$need_eth") ETH on the deployer. Lower ETH_FOR_USDG (wei) and retry."; exit 1
fi

# the external pool key must hash to the known pool id before any ETH goes into it
KEY_ID="$(cast keccak "$(cast abi-encode 'f(address,address,uint24,int24,address)' $(echo "$ETH_USDG_KEY" | tr -d '()' | tr ',' ' '))")"
[ "$KEY_ID" = "0xa791e5169faf703c0b63fd9552c33ec1128a773a00f5dc33a640da62a022cd35" ] || { echo "STOP: ETH/USDG pool key mismatch ($KEY_ID)"; exit 1; }
[ "$(cast code "$SWAPPER" --rpc-url "$RPC")" != "0x" ] || { echo "STOP: swapper $SWAPPER has no code"; exit 1; }
cd "$ROOT/packages/contracts"
read -rp "Open WETH/USDG at \$$(node -e "console.log($PRICE6/1e6)") and seed it? [y/N] " ok
[ "$ok" = y ] || { echo "Nothing sent."; exit 0; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
read -rsp "Keystore password for 'deployer': " pass; echo
printf '%s' "$pass" >"$TMP/pw"; chmod 600 "$TMP/pw"; unset pass
ADDR="$(cast wallet address --keystore "$KEYSTORE" --password-file "$TMP/pw")"
if [ "$(echo "$ADDR" | tr 'A-F' 'a-f')" != "$(echo "$DEPLOYER_ADDRESS" | tr 'A-F' 'a-f')" ]; then
  echo "STOP: keystore is $ADDR, expected $DEPLOYER_ADDRESS. Nothing was sent."; exit 1
fi
SEND=(--keystore "$KEYSTORE" --password-file "$TMP/pw" --rpc-url "$RPC" --json)
status() { node -e 'const j=require(process.argv[1]);console.log(j.status==="0x1"?"ok":"FAILED",j.transactionHash)' "$1"; }

echo "1/3  Buying USDG with $(cast from-wei "$ETH_FOR_USDG") ETH"
cast send "$SWAPPER" 'swap((address,address,uint24,int24,address),bool,uint256,address)' "$ETH_USDG_KEY" true "$ETH_FOR_USDG" \
  "$DEPLOYER_ADDRESS" --value "$ETH_FOR_USDG" "${SEND[@]}" >"$TMP/buy.json"
echo "     $(status "$TMP/buy.json")"
SEED_USDG="$(cast call "$USDG" 'balanceOf(address)(uint256)' "$DEPLOYER_ADDRESS" --rpc-url "$RPC" | awk '{print $1}')"
SEED_ETH="$(node -e "console.log((BigInt('$SEED_USDG') * 10n**18n / BigInt('$PRICE6')).toString())")"

echo "2/3  Opening and seeding WETH/USDG: $(cast from-wei "$SEED_ETH") ETH + $(node -e "console.log($SEED_USDG/1e6)") USDG"
SEED_ETH="$SEED_ETH" SEED_USDG="$SEED_USDG" PRICE_USDG_PER_ETH="$PRICE6" forge script script/mainnet/SeedV1.s.sol:SeedV1 \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$TMP/pw" --sender "$DEPLOYER_ADDRESS" --broadcast --slow

echo "3/3  Smoke test: $(cast from-wei "$SMOKE_ETH") ETH -> USDG through the Asterra router"
KEY="($WETH,$USDG,8388608,10,$HOOK)"
DATA="$(cast abi-encode 'f((address,address,uint24,int24,address))' "$KEY")"
HOPS="[(1,0x0000000000000000000000000000000000000000,$WETH,$USDG,$DATA)]"
QUOTE="$(cast call "$ROUTER" 'quote((uint8,address,address,address,bytes)[],uint256)(uint256,uint256[])' "$HOPS" "$SMOKE_ETH" --rpc-url "$RPC" | head -1 | awk '{print $1}')"
[ "$QUOTE" != "0" ] || { echo "STOP: the router quotes 0; check the pool before going further."; exit 1; }
MIN="$(node -e "console.log((BigInt('$QUOTE') * 99n / 100n).toString())")"
cast send "$ROUTER" 'swap((uint8,address,address,address,bytes)[],uint256,uint256,address,uint256,bool)' "$HOPS" "$SMOKE_ETH" "$MIN" \
  "$DEPLOYER_ADDRESS" "$(( $(date +%s) + 600 ))" false --value "$SMOKE_ETH" "${SEND[@]}" >"$TMP/swap.json"
echo "     quote $(node -e "console.log($QUOTE/1e6)") USDG, swap $(status "$TMP/swap.json")"
echo "Done. Remaining: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH. Explorer: $EXPLORER/address/$DEPLOYER_ADDRESS"
