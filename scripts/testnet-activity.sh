#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/testnet-activity.sh [rounds]
# Sends a few small router swaps through every Asterra pool on Robinhood Chain Testnet, so the pool charts, analytics
# and event feed start with real history. Uses the deployer keystore (password asked once, kept in a private temp
# file deleted on exit). Each swap spends 1/800 to 1/400 of the deployer's balance of the input token.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${TESTNET_RPC_URL:-https://rpc.testnet.chain.robinhood.com}"
API="${API_URL:-https://testnet.asterrapools.tech/api}"
DEPLOYER_ADDRESS="0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/deployer}"
ROUNDS="${1:-3}"
J="$ROOT/packages/sdk/src/addresses/testnet.json"
ROUTER=$(node -e "console.log(require('$J').router ?? '')")
[ -n "$ROUTER" ] || { echo "no testnet deployment in $J"; exit 1; }
[ "$(cast chain-id --rpc-url "$RPC")" = "46630" ] || { echo "RPC is not Robinhood Chain Testnet (46630)"; exit 1; }

PW="$(mktemp)"; chmod 600 "$PW"; trap 'rm -f "$PW"' EXIT
read -rsp "Keystore password for 'deployer': " pass; echo
printf '%s' "$pass" >"$PW"; unset pass
[ "$(cast wallet address --keystore "$KEYSTORE" --password-file "$PW" | tr 'A-F' 'a-f')" = "$(echo "$DEPLOYER_ADDRESS" | tr 'A-F' 'a-f')" ] || { echo "STOP: wrong keystore"; exit 1; }
send() { cast send --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PW" "$@" >/dev/null; }

# venue pool token0 token1 dec0 dec1 fee tickSpacing hooks mode tvl
POOLS=$(curl -s "$API/chains/46630/pools" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s).data){if(p.external||p.venue==="LAUNCH")continue;
console.log([p.venue,p.pool_address??"0x0000000000000000000000000000000000000000",p.token0.address,p.token1.address,p.token0.decimals,p.token1.decimals,p.fee_pips,p.tick_spacing??0,p.hooks??"0x0000000000000000000000000000000000000000",p.mode].join(" "))}})')
[ -n "$POOLS" ] || { echo "the API lists no pools yet; wait for the indexer"; exit 1; }
MAX=0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
for tok in $(echo "$POOLS" | awk '{print $3"\n"$4}' | sort -u); do
  allowance=$(cast call --rpc-url "$RPC" "$tok" "allowance(address,address)(uint256)" "$DEPLOYER_ADDRESS" "$ROUTER" | awk '{print $1}')
  [ "$allowance" = "0" ] && send "$tok" "approve(address,uint256)" "$ROUTER" $MAX
done

for round in $(seq 1 "$ROUNDS"); do
  echo "$POOLS" | while read -r venue pool t0 t1 d0 d1 fee ts hooks mode; do
    if [ $((RANDOM % 2)) = 0 ]; then tin=$t0; tout=$t1; else tin=$t1; tout=$t0; fi
    bal=$(cast call --rpc-url "$RPC" "$tin" "balanceOf(address)(uint256)" "$DEPLOYER_ADDRESS" | awk '{print $1}')
    amt=$(node -e "console.log((BigInt('$bal') / BigInt(400 + Math.floor(Math.random()*400))).toString())")
    [ "$amt" = "0" ] && continue
    case $venue in
      V4) f=$fee; [ "$mode" != plain ] && f=8388608
          hop="[(1,0x0000000000000000000000000000000000000000,$tin,$tout,$(cast abi-encode "f((address,address,uint24,int24,address))" "($t0,$t1,$f,$ts,$hooks)"))]" ;;
      DLMM) hop="[(2,$pool,$tin,$tout,0x)]" ;;
      DAMM) hop="[(3,$pool,$tin,$tout,0x)]" ;;
      *) continue ;;
    esac
    if send "$ROUTER" "swap((uint8,address,address,address,bytes)[],uint256,uint256,address,uint256,bool)" "$hop" "$amt" 0 "$DEPLOYER_ADDRESS" $(( $(date +%s) + 1800 )) false; then echo -n "."; else echo -n "x"; fi
  done
  echo " round $round"
done
echo "Remaining balance: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH"
