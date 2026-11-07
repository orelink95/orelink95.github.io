# Stylesheets

Plain CSS, no build step. Every page loads, in this order:

| File | What it holds |
|---|---|
| `tokens.css` | Colours (`--color-*`), fonts (`--font-headline`, `--font-body`, `--font-label`) and the shared easing (`--ease`). Change a colour here and it changes everywhere. |
| `base.css` | Browser reset, form defaults, the `.hidden` helper and the shared `@keyframes` (pulse, float, glow…). |
| `components.css` | Pieces used on every page: header, atlas sidebar, footer, mobile orb menu. |
| `pages/<page>.css` | Everything specific to one page, e.g. `pages/npc.css` for `npc.html`. |
| `loot-card.css` | The item cards (front and opened, rarity colours), shared by the Vault and the dashboard preview. Markup: `scripts/loot-card.js`. |
| `spell-card.css` | The spell cards (one hue per school, symbols, materials tooltip) and their pop-ups, shared by the Book of Shadows and the heroes page. Also declares the Rieven Uncial font. Markup: `scripts/spell-card.js`. |
| `main-style.css`, `atlas-style.css`, `poi-style.css` | Older hand-written styles (lore text, keyword links, map tweaks, POI entries). |

## Conventions

- **Class names describe the thing, not its look**: `npc-card`, `npc-card__name`, `npc-modal__close`.
  `block__part` for the parts of a block, `block--variant` for a variant (`tag--gold`, `poi-pill--danger`).
- **State classes** are toggled by the page scripts: `is-active` (selected tab or button), `is-open` (open menu), `is-visible`, and `hidden` (display: none).
- **Colours with transparency** are written `color-mix(in srgb, var(--color-secondary) 30%, transparent)` — read it as "secondary at 30%".
- Breakpoints follow the old Tailwind ones: 640px (sm), 768px (md), 1024px (lg), 1280px (xl), 1536px (2xl).

## No build step

Every page uses these files directly: there is no Tailwind, npm or compile step any more. Edit a `.css` file, reload the page.
The library pages share `components.css` (library header, footer and wings sidebar) like the atlas pages do.
