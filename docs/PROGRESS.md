# Progress

## Phase 1 · Testnet

| Task | Status |
|---|---|
| Monorepo from AETHRA, renamed to Asterra (contracts, SDK, API, DB, web) | done |
| ERC-7201 slots recomputed for `asterra.storage.*` | done |
| 202 forge tests (unit, fuzz, invariant) | green |
| New brand: prism palette from the logo, Unbounded + Geist, dark and light themes | done |
| Landing: three.js prism star, DLMM/DAMM/routing/position labs, live swap card, contract registry | done |
| Every deployed contract carries the Asterra name (`AsterraDLMMPool`, `AsterraLendingVault`, ...) | done |
| ASTER is a UUPS proxy; launch tokens are beacon proxies (every contract upgradeable) | done |
| 3 s first-visit intro (mark, DLMM bin ring reacting to the pointer, boot log), once per session | done, e2e guarded |
| Star travels with the scroll behind the whole landing (section waypoints), adaptive quality on slow GPUs | done, e2e guarded |
| Smoothness (2026-11-04, gesture scroll of the whole landing): laptop Intel UHD 1x/2x 60 fps; phone profile (CPU 4x) 58 fps; budget phone (CPU 6x) 46 fps, p95 frame 16.8 ms | measured |
| Fork rehearsal of the 4-step testnet release with the renamed, all-proxy contracts | passed, 60.7M gas |
| Software-WebGL browsers (GPU blocklisted) get the static mark instead of the scene: dropped/partial frames while scrolling 78% → 10% | measured 2026-11-04 |
| Star morphs per section (gem, ribbon, coin; bin ring Curve → Bid-Ask → Spot) and reacts to scroll speed | done |
| Near full-width layout (container up to 2240px, gutter only) | done |
| No `—`, `0` or empty values; charts never empty; operator wallet never shown | done, e2e guarded |
| VPS stack (Postgres, PostgREST, edge-runtime, Caddy) rehearsed locally: migrations, cron → indexer, API | done |
| Web Docker image (standalone, 313 MB) | done |
| Build-only CI with GHCR image | written |
| Fork rehearsal of the 4-step testnet release (Deploy, SetupMarkets, DeployGated, DeepenLiquidity) | passed |
| Testnet broadcast | waiting (B3) |
| VPS deploy + HTTPS | waiting (B1, B2) |

## Decisions (one line each)

- 2026-11-02: Backend on the VPS as a lean Supabase-compatible stack (user's choice), one database for every chain.
- 2026-11-02: Versions: V1.0 core + DLMM + DAMM + positions, V2.0 stock pools + launchpad, V3.0 ASTER + buyback + credit (user's choice).
- 2026-11-02: Protocol token `AsterraToken`, symbol ASTER (user's choice).
- 2026-11-02: Until the mainnet release, the apex domain serves the live testnet app.
- 2026-11-02: The deployer address is not in the SDK address files or the web bundle; the site recognises it by its keccak hash.
- 2026-11-02: `export-abis.mjs` keeps hand-maintained ABIs (PoolManager) in the index instead of dropping them.
- 2026-11-04: Brief re-read: generic contract names renamed with the Asterra prefix, ASTER and launch tokens made upgradeable (user's choice). The owner can freeze ASTER later by renouncing ownership.
- 2026-11-04: Vault share symbol `aeUSD` (AETHRA leftover) renamed `asUSD`.
- 2026-11-04: Landing motion follows the Ascend reference video: one 3D object fixed behind the page, moving between sections on scroll.
