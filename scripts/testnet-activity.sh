#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/testnet-activity.sh [rounds] [seconds-between-rounds]
#   e.g. bash scripts/testnet-activity.sh 30 10      (a round about every 40 s for ~20 minutes; Ctrl+C stops it)
#        bash scripts/testnet-activity.sh 96 900     (one swap per pool every 15 minutes for 24 hours)
# Sends router swaps through every Asterra pool on Robinhood Chain Testnet, so the pool charts, analytics and event feed
# get real history. Sizes and directions come from scripts/activity-plan.mjs: a slice of each pool's reserve, leaning
# back toward the oracle price, so prices move like a market and never trip the circuit breaker. Uses the deployer
# keystore (password asked once, kept in a private temp file deleted on exit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${TESTNET_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
API="${API_URL:-https://testnet.asterrapools.tech/api}"
DEPLOYER_ADDRESS="0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/deployer}"
ROUNDS="${1:-3}"
INTERVAL="${2:-0}"
# anchor prices survive between runs, so a second run does not re-anchor on a price the first one moved
ANCHORS="${XDG_CACHE_HOME:-$HOME/.cache}/asterrapools-activity-anchors.json"
J="$ROOT/packages/sdk/src/addresses/testnet.json"
ROUTER=$(node -e "console.log(require('$J').router ?? '')")
WETH=$(node -e "console.log((require('$J').weth ?? '').toLowerCase())")
[ -n "$ROUTER" ] || { echo "no testnet deployment in $J"; exit 1; }
[ "$(cast chain-id --rpc-url "$RPC")" = "46630" ] || { echo "RPC is not Robinhood Chain Testnet (46630)"; exit 1; }
node "$ROOT/scripts/activity-plan.mjs" --test >/dev/null
mkdir -p "$(dirname "$ANCHORS")"

PW="$(mktemp)"; chmod 600 "$PW"; trap 'rm -f "$PW"' EXIT
read -rsp "Keystore password for 'deployer': " pass; echo
printf '%s' "$pass" >"$PW"; unset pass
[ "$(cast wallet address --keystore "$KEYSTORE" --password-file "$PW" | tr 'A-F' 'a-f')" = "$(echo "$DEPLOYER_ADDRESS" | tr 'A-F' 'a-f')" ] || { echo "STOP: wrong keystore"; exit 1; }
send() { cast send --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PW" "$@" >/dev/null; }
balance() { cast call --rpc-url "$RPC" "$1" "balanceOf(address)(uint256)" "$DEPLOYER_ADDRESS" | awk '{print $1}'; }

PLAN=$(node "$ROOT/scripts/activity-plan.mjs" "$API" "$ANCHORS")
[ -n "$PLAN" ] || { echo "the API lists no pools yet; wait for the indexer"; exit 1; }
MAX=0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
for tok in $(echo "$PLAN" | awk '{print $3"\n"$4}' | sort -u); do
  allowance=$(cast call --rpc-url "$RPC" "$tok" "allowance(address,address)(uint256)" "$DEPLOYER_ADDRESS" "$ROUTER" | awk '{print $1}')
  [ "$allowance" = "0" ] && send "$tok" "approve(address,uint256)" "$ROUTER" $MAX
done
# the WETH pool can only be sold into with some WETH: wrap 0.0002 testnet ETH once
if [ -n "$WETH" ] && echo "$PLAN" | grep -qi "$WETH" && [ "$(node -e "console.log(BigInt('$(balance "$WETH")') < 10n**14n)")" = true ]; then
  send "$WETH" "deposit()" --value 200000000000000
fi

for round in $(seq 1 "$ROUNDS"); do
  [ "$round" = 1 ] || PLAN=$(node "$ROOT/scripts/activity-plan.mjs" "$API" "$ANCHORS")
  # the plan arrives on fd 3, so nothing inside the loop can swallow it from stdin
  while read -r -u 3 venue pool t0 t1 fee ts hooks mode tin tout amt; do
    [ -n "$venue" ] || continue
    if [ "$(node -e "console.log(BigInt('$(balance "$tin")') < BigInt('$amt'))")" = true ]; then echo -n "-"; continue; fi
    case $venue in
      V4) f=$fee; [ "$mode" != plain ] && f=8388608
          hop="[(1,0x0000000000000000000000000000000000000000,$tin,$tout,$(cast abi-encode "f((address,address,uint24,int24,address))" "($t0,$t1,$f,$ts,$hooks)"))]" ;;
      DLMM) hop="[(2,$pool,$tin,$tout,0x)]" ;;
      DAMM) hop="[(3,$pool,$tin,$tout,0x)]" ;;
      *) continue ;;
    esac
    # fixed gas limit: the hook's fee state moves with block time, so an estimate taken a block earlier can fall short.
    # cast send also exits 0 for a reverted transaction, so the receipt status decides between . and x
    out=$(cast send --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PW" --gas-limit 1000000 "$ROUTER" \
      "swap((uint8,address,address,address,bytes)[],uint256,uint256,address,uint256,bool)" "$hop" "$amt" 0 "$DEPLOYER_ADDRESS" $(( $(date +%s) + 1800 )) false 2>&1) || true
    if grep -qE "^status +1 " <<<"$out"; then echo -n "."; else echo -n "x"; fi
  done 3<<<"$PLAN"
  echo " round $round/$ROUNDS $(date +%H:%M)"
  # the indexer runs every minute; the next round plans from the prices this one left behind
  [ "$round" = "$ROUNDS" ] || sleep "$INTERVAL"
done
echo "Remaining balance: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH"
