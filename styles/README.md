# Stylesheets

Plain CSS, no build step. Every page loads, in this order:

| File | What it holds |
|---|---|
| `tokens.css` | Colours (`--color-*`), fonts (`--font-headline`, `--font-body`, `--font-label`) and the shared easing (`--ease`). Change a colour here and it changes everywhere. |
| `base.css` | Browser reset, form defaults, the `.hidden` helper and the shared `@keyframes` (pulse, float, glow…). |
| `components.css` | Pieces used on every page: header, atlas sidebar, footer, mobile orb menu. |
| `pages/<page>.css` | Everything specific to one page, e.g. `pages/npc.css` for `npc.html`. |
| `main-style.css`, `atlas-style.css`, `poi-style.css` | Older hand-written styles (lore text, keyword links, map tweaks, POI entries). |

## Conventions

- **Class names describe the thing, not its look**: `npc-card`, `npc-card__name`, `npc-modal__close`.
  `block__part` for the parts of a block, `block--variant` for a variant (`tag--gold`, `poi-pill--danger`).
- **State classes** are toggled by the page scripts: `is-active` (selected tab or button), `is-open` (open menu), `is-visible`, and `hidden` (display: none).
- **Colours with transparency** are written `color-mix(in srgb, var(--color-secondary) 30%, transparent)` — read it as "secondary at 30%".
- Breakpoints follow the old Tailwind ones: 640px (sm), 768px (md), 1024px (lg), 1280px (xl), 1536px (2xl).

## Not converted yet

The library pages (tomes, handouts, bestiary, beast, heroes, scriptorium, library) still use Tailwind through `output.css`. They are converted during pass 2; `output.css`, `input.css`, `tailwind.config.js` and the npm files are deleted once the last one is done.
