#!/usr/bin/env bash
# Jalankan di: ROOT
# Deploys AsterraPools to the local Anvil fork by impersonating the deployer (no private key).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOYER_ADDRESS="${DEPLOYER_ADDRESS:-0xd09D9c87ECfe008B4D6D3cEbeAd25103c16d9a7C}"
RPC="${LOCAL_RPC_URL:-http://127.0.0.1:8545}"
cast rpc anvil_setBalance "$DEPLOYER_ADDRESS" 0x56BC75E2D63100000 --rpc-url "$RPC" >/dev/null  # 100 ETH
cd "$ROOT/packages/contracts"
NETWORK=local forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --unlocked --sender "$DEPLOYER_ADDRESS" --broadcast --slow "$@"
# same four steps as scripts/testnet-deploy.sh, so a local run rehearses the testnet release
SEED_WETH=${SEED_WETH:-1000000000000000} NETWORK=local forge script script/SetupMarkets.s.sol:SetupMarkets --rpc-url "$RPC" --unlocked --sender "$DEPLOYER_ADDRESS" --broadcast --slow
STABLECOIN="$(node -e "console.log(require('$ROOT/packages/sdk/src/addresses/local.json').tokens.aUSD.address)")" \
  NETWORK=local forge script script/DeployGated.s.sol:DeployGated --rpc-url "$RPC" --unlocked --sender "$DEPLOYER_ADDRESS" --broadcast --slow
SEED_WETH=0 NETWORK=local forge script script/testnet/DeepenLiquidity.s.sol:DeepenLiquidity --rpc-url "$RPC" --unlocked --sender "$DEPLOYER_ADDRESS" --broadcast --slow
cd "$ROOT" && node scripts/set-start-block.mjs local
cd "$ROOT" && pnpm --filter @asterrapools/sdk abis >/dev/null 2>&1 || true
echo "Local deployment written to packages/sdk/src/addresses/local.json"
