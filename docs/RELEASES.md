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

Budget: **$7 of gas for every release together.** Measured on a fork rehearsal of the testnet release (2026-11-02):

| Step | Gas | Mainnet at 0.0201 gwei, ETH $2,284 |
|---|---|---|
| Core + DLMM + DAMM (`Deploy.s.sol`) | 26.63M | ≈ $1.22 |
| Locked V2/V3 modules (`DeployGated.s.sol`) | 15.44M | ≈ $0.71 |
| Opening a module | ≈ 0.1M each | < $0.01 |

Mainnet deployer balance on 2026-11-02: 0.00156 ETH (≈ $3.56). The mainnet dry run in phase 2 re-measures every step
before anything is broadcast.
