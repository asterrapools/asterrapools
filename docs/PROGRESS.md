# Progress

## Phase 1 · Testnet

| Task | Status |
|---|---|
| Monorepo from AETHRA, renamed to Asterra (contracts, SDK, API, DB, web) | done |
| ERC-7201 slots recomputed for `asterra.storage.*` | done |
| 195 forge tests (unit, fuzz, invariant) | green |
| New brand: prism palette from the logo, Unbounded + Geist, dark and light themes | done |
| Landing: three.js prism star, DLMM/DAMM/routing/position labs, live swap card, contract registry | done |
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
