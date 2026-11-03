# Releases

AsterraPools ships in four phases. Each phase starts only after the previous one is signed off.

| Phase | Release | Network | Contents | Status |
|---|---|---|---|---|
| 1 | Testnet | Robinhood Chain Testnet | Every contract deployed; V1.0 modules open, V2.0 / V3.0 modules deployed and locked on-chain | in progress |
| 2 | **ASTERRAPOOLS V1.0** | Robinhood Chain | Smart router, v4 hook (dynamic fee), DLMM + limit orders, DAMM, LP positions | planned |
| 3 | **ASTERRAPOOLS V2.0** | Robinhood Chain | Stock pools with the oracle guard, launchpad | planned |
| 4 | **ASTERRAPOOLS V3.0** | Robinhood Chain | ASTER token, buyback & burn, credit (LP positions as collateral) | planned |

## Release model

Deploy once, open in stages. Modules that are not released yet are locked **on-chain**, not just hidden in the UI:

| Module | Locked until released | Opened by |
|---|---|---|
| DLMM, DAMM, limit orders | factory is not a hub registrar | `hub.setRegistrar(factory, true)` |
| Stock pools | stock tokens registered `STOCK`, `enabled = false` | `hub.setAsset(token, STOCK, true, feed, maxStaleness)` |
| Launchpad | not a hub registrar | `hub.setRegistrar(launchpad, true)` |
| Buyback | protocol fee share 0 | `hub.setFeeConfig(buyback, treasury, share)` |
| Credit | vault caps 0, no credit manager | `vault.setCaps(...)`, `vault.setCreditManager(cm)` |

The web app reads the same gates (`hub.isRegistrar`, the address file's `hidden` block, `NEXT_PUBLIC_FEATURES`), so a
module appears as soon as it opens, without a redeploy.

## Gas budget

Budget: **$7 of gas for every release together.** Measured on a fork rehearsal of the testnet release (2026-11-04,
after every contract became an upgradeable proxy; gas used from the receipts):

| Step | Gas | Mainnet at 0.0201 gwei, ETH $2,296 |
|---|---|---|
| Core + DLMM + DAMM (`Deploy.s.sol`) | 26.64M | ≈ $1.23 |
| Locked V2/V3 modules (`DeployGated.s.sol`, ASTER proxy + launch-token beacon included) | 17.17M | ≈ $0.79 |
| **Mainnet contracts, every release** | **43.81M** | **≈ $2.02** |
| Opening a module | ≈ 0.1M each | < $0.01 |

Testnet-only steps (`SetupMarkets` 10.76M, `DeepenLiquidity` 6.15M) mint faucet tokens and seed pools; they never run on
mainnet. Mainnet deployer balance on 2026-11-04: 0.00325 ETH (≈ $7.46), so the contracts use under a third of the
budget and the rest covers seeding and opening modules. The mainnet dry run in phase 2 re-measures every step before
anything is broadcast.
