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
| 3D star wears the logo artwork (outline fitted to the mark, 2 px rms), true colours in both themes and reduced motion; hidden until the artwork loads, so no placeholder flash on slow networks | done, e2e guarded |
| Smoothness with the space backdrop (2026-11-04, A/B against the previous build, same machine): laptop 58 vs 58 fps, phone CPU 4x 57 vs 58, budget CPU 6x 50-51 vs 50-52; p95 frame unchanged | measured |
| Landing space backdrop: nebulae + star field with cursor parallax, parting and flare | done, e2e guarded |
| Header nav sits beside the logo | done, e2e guarded |
| DLMM pools get a price from their active bin on every indexer run (before: only after a swap, so no price chart) | done |
| Activity swaps sized from pool reserves, leaning back to the oracle price; fork-simulated 35/35 swaps | done |
| No `—`, `0` or empty values; charts never empty; operator wallet never shown | done, e2e guarded |
| VPS stack (Postgres, PostgREST, edge-runtime, Caddy) rehearsed locally: migrations, cron → indexer, API | done |
| Web Docker image (standalone, 313 MB) | done |
| Build-only CI with GHCR image | written |
| Fork rehearsal of the 4-step testnet release (Deploy, SetupMarkets, DeployGated, DeepenLiquidity) | passed |
| Testnet broadcast: 119 transactions, 34/34 contracts verified on the explorer | done |
| VPS deploy + HTTPS, testnet activity swaps | done |

## Phase 2 · Mainnet V1.0 / V2.0 / V3.0

| Task | Status |
|---|---|
| No ASTER token or buyback in the mainnet deploy (token launches outside the protocol) | done |
| Landing hero: ASTERRAPOOLS CA, "Coming soon" until the address is set | done |
| Developers / SDK page removed | done |
| Stock tokens out of `mainnet.json` until V2.0 | done |
| `mainnet-launch-v1.sh` (USDG buy, WETH/USDG seed, smoke swap) and `mainnet-v2.sh` (feeds, stocks, launchpad, TSLA/USDG) | done, fork-rehearsed |
| Mainnet V1.0: 36 deploy transactions (0.000804 ETH), WETH/USDG seeded (≈ $5.4), apex serves mainnet, indexer on 4663 | done 2026-11-04 |
| Explorer verification (`pnpm mainnet:verify`, see `docs/verification/mainnet.md`) | done 2026-11-04, exact match on Sourcify |
| V2.0 open: 5 feeds, 3 stock tokens, launchpad registrar, TSLA/USDG seeded | done 2026-11-05 |
| `mainnet-v3.sh` (credit manager, caps, first supply), fork-rehearsed with pledge, borrow, repay | done |
| V3.0 open: credit manager, caps 100,000 / 80,000 USDG, first supply | done 2026-11-05 |
| ASTER in the mainnet token list | done 2026-11-06 |
| `mainnet-aster.sh` (USDG/ASTER seed, swap through Uniswap's Universal Router), fork-rehearsed | done 2026-11-06 |
| USDG/ASTER open: $0.10 per side, ±25% range, $0.01 swap through the Universal Router | done 2026-11-06 |
| `mainnet-aster-pools.sh`: WETH/ASTER (hook) and USDG, TSLA, AAPL, NVDA /ASTER (DAMM), $0.25 per side | done 2026-11-08, 29 transactions, indexed |
| `mainnet-aster-dlmm.sh`: first DLMM pools, WETH/ASTER (0x4c96…4222) and USDG/ASTER (0xCDF0…A8aa), 1% bins x 21, $0.10 per side | done 2026-11-09, 11 transactions (first run stopped after the USDG buy), indexed |
| Liquidity simulator (`/simulator`, API `pools/:id/trades`): Backtest and Paper pool modes, Spot/Curve/Bid-ask ladders replayed against indexed trades | done 2026-11-10 |

## Decisions (one line each)

- 2026-11-04: ASTERRAPOOLS token launches outside the protocol (user handles buyback & burn); SDK hidden; V3.0 = credit only; V1.0 and V2.0 the same day, about 1 hour apart; seeds from the deployer balance only.

- 2026-11-02: Backend on the VPS as a lean Supabase-compatible stack (user's choice), one database for every chain.
- 2026-11-02: Versions: V1.0 core + DLMM + DAMM + positions, V2.0 stock pools + launchpad, V3.0 ASTER + buyback + credit (user's choice).
- 2026-11-02: Protocol token `AsterraToken`, symbol ASTER (user's choice).
- 2026-11-02: Until the mainnet release, the apex domain serves the live testnet app.
- 2026-11-02: The deployer address is not in the SDK address files or the web bundle; the site recognises it by its keccak hash.
- 2026-11-02: `export-abis.mjs` keeps hand-maintained ABIs (PoolManager) in the index instead of dropping them.
- 2026-11-04: Brief re-read: generic contract names renamed with the Asterra prefix, ASTER and launch tokens made upgradeable (user's choice). The owner can freeze ASTER later by renouncing ownership.
- 2026-11-04: Vault share symbol `aeUSD` (AETHRA leftover) renamed `asUSD`.
- 2026-11-04: Landing motion follows the Ascend reference video: one 3D object fixed behind the page, moving between sections on scroll.
- 2026-11-07: The original X account is out of reach for now; a sitewide banner above the header points to @PulseOfAster (`components/layout/account-notice.tsx`).
