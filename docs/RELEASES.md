# Releases

AsterraPools ships in four phases. Every feature is built and deployed up front; each release opens its modules on-chain
and shows them in the web app. Modules whose release has not come yet stay locked on-chain and hidden in the UI.

| Phase | Release | Network | Contents | Status |
|---|---|---|---|---|
| 1 | Testnet | Robinhood Chain Testnet | Every contract deployed; V1.0 modules open, V2.0 / V3.0 modules deployed and locked on-chain | done 2026-11-04 |
| 2 | **ASTERRAPOOLS V1.0** | Robinhood Chain | Smart router, v4 hook (dynamic fee), DLMM + limit orders, DAMM, LP positions, analytics, event feed | live 2026-11-04 |
| 3 | **ASTERRAPOOLS V2.0** | Robinhood Chain | Stock pools with the oracle guard, launchpad | live 2026-11-05 |
| 4 | **ASTERRAPOOLS V3.0** | Robinhood Chain | Credit (LP positions as collateral) | live 2026-11-05 |

Out of scope (user's decision, 2026-11-04):

- **ASTERRAPOOLS token**: launches outside the protocol on Robinhood Chain; its buyback & burn runs there too. Mainnet
  deploys no `AsterraToken` and no `AsterraBuyback`. The landing hero shows "ASTERRAPOOLS CA · Coming soon" until
  `apps/web/src/lib/token.ts` gets the contract address.
- **SDK / Developers page**: not part of the launch; removed from the web app. `packages/sdk` stays as the web app's
  internal source of ABIs and addresses.

## Release model

| Module | Locked until released | Opened by | Shown in the UI by |
|---|---|---|---|
| DLMM, DAMM, limit orders | open at deploy (V1.0) | `Deploy.s.sol` makes the factories hub registrars | `hub.isRegistrar` |
| Stock pools | stock tokens `STOCK`, `enabled = false`, no feed | `hub.setAsset(token, STOCK, true, feed, maxStaleness)` | stock tokens listed in `mainnet.json` |
| Launchpad | not a hub registrar | `hub.setRegistrar(launchpad, true)` | `FEATURES_mainnet=launchpad` (GitHub variable) + `FEATURES` on the VPS |
| Credit | vault caps 0, no credit manager | `vault.setCaps(...)`, `vault.setCreditManager(cm)` | `credit` in the same two flags |

## Mainnet runbook

V1.0 (user runs the `--broadcast` steps; each asks the keystore password):

1. `bash scripts/mainnet-deploy.sh` (dry run), then `bash scripts/mainnet-deploy.sh --broadcast`.
2. `bash scripts/mainnet-launch-v1.sh`: buys USDG with ETH, opens and seeds WETH/USDG at the Chainlink price, smoke swap.
3. Claude: commit addresses and receipts, move the apex domain to `web-mainnet`, PR `main` → `mainnet` and `testnet`,
   CI builds the images, `bash scripts/vps-deploy.sh mainnet`, verify the contracts on the explorer.

V2.0:

1. `bash scripts/mainnet-v2.sh`: 5 Chainlink feeds, 3 stock tokens enabled, launchpad registrar, TSLA/USDG seeded.
2. Claude: add TSLA, NVDA, AAPL back to `mainnet.json`, set `FEATURES_mainnet=launchpad` and `FEATURES=launchpad`,
   rebuild and redeploy.

V3.0:

1. `bash scripts/mainnet-v3.sh`: vault credit manager, caps (supply 100,000 / borrow 80,000 USDG), the deployer's
   USDG as first supply. Fork-rehearsed 2026-11-05 including pledge, borrow, repay; ≈ 0.0000045 ETH.
2. Claude: `lendingVault` and `creditManager` out of `hidden` in `mainnet.json`, `FEATURES_mainnet=launchpad,credit`
   and `FEATURES=launchpad,credit`, rebuild and redeploy. Footer v3.0.0.

USDG/ASTER pool:

1. `ASTER` in `tokens` of `mainnet.json` (the top-level `aster` key stays null, it belongs to the buyback module),
   release and redeploy. This comes first: a token the indexer meets before it is listed keeps the kind "unknown".
2. `bash scripts/mainnet-aster.sh` simulates, `--broadcast` sends: buys USDG and ASTER, opens and seeds USDG/ASTER at the
   market price (±25% range), then swaps $0.01 through Uniswap's Universal Router. `SIDE_USD_E6` sets the size per side and
   a re-run adds to the open pool. Rehearsed on a fork 2026-11-06, including the off-market and low-balance stops.
   The script refuses a seed that leaves under `RESERVE_WEI` (0.0016 ETH): another service pays about 0.00023 ETH of gas
   a day from this wallet, so its transactions can also take a nonce mid-run. If a run stops after the mint, do not
   re-run it: that seeds a second time.

ASTER moved 46% within minutes of the opening and arbitrage sold most of the ASTER side, so a wider range suits it better than ±25%.

That router swap is a manual test. Uniswap's routing engine does not consider the Asterra hook: it needs Uniswap's
allowlist, whose criteria exclude a proxy that permits upgrades.

Rehearsed end to end on a mainnet fork (2026-11-04): deploy, V1.0 seed and smoke swap, V2.0 feeds, launchpad and
TSLA/USDG pool all succeed; quotes route WETH → USDG and USDG → TSLA after V2.0.

## Gas and seed budget

Budget: **$7 of gas for every release together.** Mainnet deployer on 2026-11-04: 0.00493 ETH (≈ $11), almost no
tokens. The user chose to seed from this balance only.

| Step | Gas / ETH | ≈ USD at ETH $2,312 |
|---|---|---|
| Mainnet contracts (`DeployMainnet`, no ASTER / buyback) | 51.2M estimated incl. forge's 30% margin, at 0.02 gwei | ≈ $1.8–2.4 |
| V1.0 seed WETH/USDG (0.0012 ETH to USDG + matching WETH) | 0.0024 ETH | ≈ $5.5 pool |
| V2.0 feeds + launchpad + TSLA/USDG ($0.75 per side) | ≈ 0.0007 ETH | ≈ $1.5 pool |
| Opening a module | ≈ 0.1M gas each | < $0.01 |
| USDG/ASTER seed ($0.10 per side) + router swap | 1.5M gas + 0.00008 ETH | ≈ $0.2 pool |

With seeds this small every trade moves the price: the stock pool's circuit breaker refuses swaps above about $0.02
until more liquidity arrives. Anyone can add liquidity on the Pools page; the deployer can top up later.
