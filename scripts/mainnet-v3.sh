#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/mainnet-v3.sh
# ASTERRAPOOLS V3.0 on mainnet: credit, LP positions as collateral. The vault and the credit manager were deployed
# locked with V1.0 (caps 0, no credit manager); this opens them:
#   1. vault.setCreditManager(creditManager), so pledged positions can borrow from the vault,
#   2. vault.setCaps(supplyCap, borrowCap): SUPPLY_CAP / BORROW_CAP in USDG, default 100,000 / 80,000 (the rate kink),
#   3. supplies the deployer's USDG to the vault (approve + deposit; skipped when it holds none), so it starts funded.
# The owner calls are simulated from the deployer before anything is sent. Raising the caps later is one owner transaction.
# Asks the keystore password once; the password lives only in a private temp file deleted on exit.
# Fork rehearsal: anvil --fork-url <mainnet> --auto-impersonate, then MAINNET_RPC_URL=http://127.0.0.1:8545 UNLOCKED=1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${MAINNET_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
DEPLOYER_ADDRESS="0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/deployer}"

[ "$(cast chain-id --rpc-url "$RPC")" = "4663" ] || { echo "RPC is not Robinhood Chain mainnet (4663)"; exit 1; }
get() { node -e "const j=require('$ROOT/packages/sdk/src/addresses/mainnet.json');console.log(j.$1 ?? j.hidden?.$1 ?? '')"; }
VAULT="$(get lendingVault)"; CM="$(get creditManager)"
[ -n "$VAULT" ] && [ -n "$CM" ] || { echo "STOP: mainnet.json has no lendingVault or creditManager."; exit 1; }
FROM=(--from "$DEPLOYER_ADDRESS" --rpc-url "$RPC")

# the credit manager must point at this vault, or borrows would go nowhere
CM_VAULT="$(cast call "$CM" 'contracts()(address,address,address,address,address)' --rpc-url "$RPC" | sed -n 3p)"
[ "$(echo "$CM_VAULT" | tr 'A-F' 'a-f')" = "$(echo "$VAULT" | tr 'A-F' 'a-f')" ] || { echo "STOP: credit manager uses vault $CM_VAULT"; exit 1; }
ASSET="$(cast call "$VAULT" 'asset()(address)' --rpc-url "$RPC")"
DEC="$(cast call "$ASSET" 'decimals()(uint8)' --rpc-url "$RPC")"
units() { node -e "console.log((BigInt(Math.round(+process.argv[1]*1e6)) * 10n**BigInt($DEC) / 1000000n).toString())" "$1"; }
SUPPLY_CAP_IN="${SUPPLY_CAP:-100000}"; BORROW_CAP_IN="${BORROW_CAP:-80000}"
SUPPLY_CAP="$(units "$SUPPLY_CAP_IN")"; BORROW_CAP="$(units "$BORROW_CAP_IN")"
SUPPLY="$(cast call "$ASSET" 'balanceOf(address)(uint256)' "$DEPLOYER_ADDRESS" --rpc-url "$RPC" | awk '{print $1}')"

cast call "$VAULT" 'setCreditManager(address)' "$CM" "${FROM[@]}" >/dev/null
cast call "$VAULT" 'setCaps(uint256,uint256)' "$SUPPLY_CAP" "$BORROW_CAP" "${FROM[@]}" >/dev/null
[ "$SUPPLY" = 0 ] || cast call "$ASSET" 'approve(address,uint256)' "$VAULT" "$SUPPLY" "${FROM[@]}" >/dev/null
read -r LTV LT BONUS _ < <(cast call "$CM" 'riskParams()(uint16,uint16,uint16,uint256)' --rpc-url "$RPC" | tr '\n' ' '; echo)

echo "Plan: credit manager $CM on vault $VAULT"
echo "      caps: supply $SUPPLY_CAP_IN / borrow $BORROW_CAP_IN USDG"
echo "      risk: max LTV $((LTV / 100))%, liquidation at $((LT / 100))%, bonus $((BONUS / 100))%"
echo "      first supply: $(node -e "console.log(Number(BigInt('$SUPPLY'))/10**$DEC)") USDG from the deployer"
echo "Deployer: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH. Owner calls simulated ok."
read -rp "Open V3.0 now? [y/N] " ok
[ "$ok" = y ] || { echo "Nothing sent."; exit 0; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -n "${UNLOCKED:-}" ]; then
  SEND=(--unlocked --from "$DEPLOYER_ADDRESS" --rpc-url "$RPC" --json) # fork rehearsal only
else
  read -rsp "Keystore password for 'deployer': " pass; echo
  printf '%s' "$pass" >"$TMP/pw"; chmod 600 "$TMP/pw"; unset pass
  ADDR="$(cast wallet address --keystore "$KEYSTORE" --password-file "$TMP/pw")"
  if [ "$(echo "$ADDR" | tr 'A-F' 'a-f')" != "$(echo "$DEPLOYER_ADDRESS" | tr 'A-F' 'a-f')" ]; then
    echo "STOP: keystore is $ADDR, expected $DEPLOYER_ADDRESS. Nothing was sent."; exit 1
  fi
  SEND=(--keystore "$KEYSTORE" --password-file "$TMP/pw" --rpc-url "$RPC" --json)
fi
ok_tx() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("  tx",j.transactionHash,j.status==="0x1"?"ok":"FAILED");if(j.status!=="0x1")process.exit(1)})'; }

echo "1/3  Credit manager"
cast send "$VAULT" 'setCreditManager(address)' "$CM" "${SEND[@]}" | ok_tx
echo "2/3  Caps"
cast send "$VAULT" 'setCaps(uint256,uint256)' "$SUPPLY_CAP" "$BORROW_CAP" "${SEND[@]}" | ok_tx
echo "3/3  First supply"
if [ "$SUPPLY" = 0 ]; then echo "  skipped, the deployer holds no USDG"; else
  cast send "$ASSET" 'approve(address,uint256)' "$VAULT" "$SUPPLY" "${SEND[@]}" | ok_tx
  cast send "$VAULT" 'deposit(uint256,address)' "$SUPPLY" "$DEPLOYER_ADDRESS" "${SEND[@]}" | ok_tx
fi
echo "vault: creditManager $(cast call "$VAULT" 'creditManager()(address)' --rpc-url "$RPC")"
echo "       caps $(cast call "$VAULT" 'caps()(uint256,uint256)' --rpc-url "$RPC" | awk '{print $1}' | tr '\n' ' ')"
echo "       totalAssets $(cast call "$VAULT" 'totalAssets()(uint256)' --rpc-url "$RPC" | awk '{print $1}')"
echo "Done. Remaining: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH"
