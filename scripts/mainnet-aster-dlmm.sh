#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/mainnet-aster-dlmm.sh [--broadcast]
# Opens and seeds the first 2 DLMM pools: WETH/ASTER and USDG/ASTER, 21 bins of 1% each
# (script/mainnet/SeedAsterDlmm.s.sol). Without --broadcast it only simulates against live mainnet state and sends nothing.
# With --broadcast it simulates first, then asks to confirm and asks the keystore password once; the password lives only
# in a private temp file deleted on exit.
# SIDE_USD_E6 sets the USD value of each side, so a bigger seed after a top-up needs no code change.
# A re-run stops at once: each pair may hold only one DLMM pool per bin step.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${MAINNET_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
DEPLOYER_ADDRESS="0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/deployer}"
export SIDE_USD_E6="${SIDE_USD_E6:-100000}"       # $0.10 per side and pool
# another service pays gas from this wallet, up to about 0.00004 ETH a day: the seed must leave it a week of that
export RESERVE_WEI="${RESERVE_WEI:-300000000000000}" # 0.0003 ETH
MODE="${1:-}"
case "$MODE" in ""|--broadcast) ;; *) echo "usage: mainnet-aster-dlmm.sh [--broadcast]"; exit 1 ;; esac

[ "$(cast chain-id --rpc-url "$RPC")" = "4663" ] || { echo "RPC is not Robinhood Chain mainnet (4663)"; exit 1; }
cd "$ROOT/packages/contracts"
SCRIPT=script/mainnet/SeedAsterDlmm.s.sol:SeedAsterDlmm
echo "Deployer: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH"
forge script "$SCRIPT" --rpc-url "$RPC" --sender "$DEPLOYER_ADDRESS"
if [ "$MODE" != --broadcast ]; then echo "Simulated ok. Nothing sent. Add --broadcast to send."; exit 0; fi

read -rp "Open and seed the 2 DLMM ASTER pools now? [y/N] " ok
[ "$ok" = y ] || { echo "Nothing sent."; exit 0; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
read -rsp "Keystore password for 'deployer': " pass; echo
printf '%s' "$pass" >"$TMP/pw"; chmod 600 "$TMP/pw"; unset pass
ADDR="$(cast wallet address --keystore "$KEYSTORE" --password-file "$TMP/pw")"
if [ "$(echo "$ADDR" | tr 'A-F' 'a-f')" != "$(echo "$DEPLOYER_ADDRESS" | tr 'A-F' 'a-f')" ]; then
  echo "STOP: keystore is $ADDR, expected $DEPLOYER_ADDRESS. Nothing was sent."; exit 1
fi
forge script "$SCRIPT" --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$TMP/pw" \
  --sender "$DEPLOYER_ADDRESS" --broadcast --slow
echo "Done. Remaining: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" -e) ETH"
