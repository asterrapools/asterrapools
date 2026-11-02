# AsterraPools style guide

**The vibe in one line:** a prism in the dark. Near-black cobalt-tinted fields, glass panels with soft radii, one
signature gradient taken straight from the Asterra star (lime → cyan → cobalt → violet), wide geometric headlines
and small mono captions that read like protocol parameters.

Tokens live in `apps/web/src/styles/tokens.css` (CSS variables, both themes) and are wired into
`apps/web/tailwind.config.ts`. Components never use hard-coded colours.

## Palette

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#06080C` | `#F3F5FA` | page |
| `--surface` / `--surface-2` | `#0D1119` / `#131823` | `#FFFFFF` / `#ECEFF6` | panels, inputs |
| `--border` / `--border-strong` | `#202738` / `#323C54` | `#DADFEA` / `#BCC4D6` | hairlines |
| `--text` / `--text-2` / `--muted` | `#ECF1FA` / `#B0BAD0` / `#808BA4` | `#090C14` / `#323A4E` / `#586178` | copy |
| `--primary` | `#19E6FF` cyan | `#19E6FF` (fills), `#007091` (text) | CTAs, links, focus |
| `--accent` | `#8B5CFF` violet | `#622CE6` | DLMM/DAMM badges, second series |
| `--success` | `#D2FF3C` lime | `#388000` | live states, gains |
| `--danger` | `#FF5E7C` | `#D0224E` | losses, errors |

**Prism** (`--prism`, `bg-prism`, `.text-prism`): `115deg, lime 0%, cyan 36%, cobalt 70%, violet 100%`. Used for
headline highlights, the hover ring of every interactive control, range sliders and the outline of featured panels.
In light mode the lime stop deepens to `#80A800` so gradient text keeps contrast on white.

Charts use `--chart-1..6` (cyan, violet, lime, cobalt, magenta, muted) with deeper stops in light mode.

## Type

| Role | Font | Notes |
|---|---|---|
| Display (h1, h2, wordmark) | Unbounded 500–700 | wide geometric, `-0.03em` tracking |
| Body | Geist Sans | 15px / 1.6 |
| Numbers, labels, parameters | Geist Mono | tabular numerals, uppercase captions at `0.14em` |

All fonts are SIL OFL.

## Shape and depth

- Radii: 6 / 10 / 14 / 18 / 24 px. Buttons and chips are pills.
- Panels: `rounded-xl border bg-surface shadow-card`; featured panels swap the border for the prism ring.
- Film grain overlay (`body::after`) keeps large dark fields from looking flat.

## Motion

- `.fx-prism`: hover lifts 1px and fades in a panning prism ring; press squeezes to 0.97 and flares the ring.
- Sections reveal once on scroll (CSS transition, no scroll library). Everything respects `prefers-reduced-motion`.
- The hero three.js scene renders only while visible and draws a single frame with reduced motion.

## Content rules

- Never render `—`, `-`, an empty cell or a bare `0`: unknown values read **Syncing**, zero market figures
  **Idle**, zero amounts **None**, a flat change **Flat** (`apps/web/src/lib/format.ts`). Stats that carry no
  information are left out.
- Charts are never empty: a young pool falls back to its 24h sparkline and current TVL; tabs without data are hidden.
- The operator wallet never appears on the site; actions it signed read as "AsterraPools".
- No disclaimers or negative framing. A module that is not open yet is "arriving", never "not deployed".
