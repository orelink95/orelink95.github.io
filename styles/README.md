# Stylesheets

Plain CSS, no build step. Every page loads, in this order:

| File | What it holds |
|---|---|
| `tokens.css` | Colours (`--color-*`), fonts (`--font-headline`, `--font-body`, `--font-label`) and the shared easing (`--ease`). Change a colour here and it changes everywhere. |
| `base.css` | Browser reset, form defaults, the `.hidden` helper and the shared `@keyframes` (pulse, float, glow…). |
| `components.css` | Pieces used on every page: header, atlas sidebar, footer, mobile orb menu. |
| `pages/<page>.css` | Everything specific to one page, e.g. `pages/npc.css` for `npc.html`. One exception: `pages/atlas-index.css` serves the four Atlas list pages (see below). |
| `loot-card.css` | The item cards (front and opened, rarity colours), shared by the Vault and the dashboard preview. Markup: `scripts/loot-card.js`. |
| `games.css` | The gaming table of a tavern (Games tab): bone dice, the game picker, Liar's Dice (`.ld-*`) and Knucklebones (`.kb-*`). Scripts: `scripts/games/`. |
| `notice-board.css` | The cork board and its pinned notes, shared by the settlement Town Board, the POI Board tab and the dashboard preview. Markup: `scripts/notice-board.js`. |
| `spell-card.css` | The spell cards (one hue per school, symbols, materials tooltip) and their pop-ups, shared by the Book of Shadows and the heroes page. Also declares the Rieven Uncial font. Markup: `scripts/spell-card.js`. |
| `deity-card.css` | The gods' cards, one frame per tier (gold, pearl, bronze, living wood, obsidian, sealed), shared by the Pantheon, a god's page and the dashboard preview. The card scales with its box (sizes in % and `cqw`). Markup and SVG frames: `scripts/deity-card.js`. |
| `looks.css` | The look of ONE page: themes, textures, frames and banner of a POI (`poi.html`) or a creature (`beast.html`), set per record in the dashboard (card **Look**, `record.look`). Applied by `scripts/core/look.js`; loaded last on those two pages. Its header lists the `--look-*` variables and how to add a theme. |
| `atlas-style.css` | Shared by the Atlas pages: Leaflet popups, the small country/settlement pins, the popup button and "Read the lore" link, list-card flip, and the narrow-screen layout (map first, lore panel under it). Loaded after the page stylesheet, so it wins on equal selectors. |
| `main-style.css`, `poi-style.css` | Older hand-written styles (lore text, keyword links, POI entries). |

## Conventions

- **Class names describe the thing, not its look**: `npc-card`, `npc-card__name`, `npc-modal__close`.
  `block__part` for the parts of a block, `block--variant` for a variant (`tag--gold`, `poi-pill--danger`).
- **State classes** are toggled by the page scripts: `is-active` (selected tab or button), `is-open` (open menu), `is-visible`, and `hidden` (display: none).
- **Colours with transparency** are written `color-mix(in srgb, var(--color-secondary) 30%, transparent)` — read it as "secondary at 30%".
- Breakpoints follow the old Tailwind ones: 640px (sm), 768px (md), 1024px (lg), 1280px (xl), 1536px (2xl).

## No build step

Every page uses these files directly: there is no Tailwind, npm or compile step any more. Edit a `.css` file, reload the page.
The library pages share `components.css` (library header, footer and wings sidebar) like the atlas pages do.

## The Atlas

| Page | Stylesheets (besides `tokens`, `base`, `components`, `main-style`) | Script |
|---|---|---|
| `world.html` | `pages/world.css`, `atlas-style.css` | `atlas-scripts.js` |
| `continent.html?id=…` | `pages/continent.css`, `atlas-style.css` | `continent-scripts.js` |
| `country.html?id=…` | `pages/country.css`, `atlas-style.css` | `country-scripts.js` |
| `settlement.html?id=…[&district=…]` | `pages/settlement.css`, `atlas-style.css`, `notice-board.css` | `settlement-scripts.js` (town board: `market.js`, `notice-board.js`) |
| `poi.html?id=…` | `pages/poi.css`, `poi-style.css`, `notice-board.css`, `games.css` | `poi-scripts.js` (with `tavern-menu.js`, `market.js`, `notice-board.js`, `personae.js`, `games/*.js`) |
| `continents.html`, `countries.html`, `settlements.html`, `pois.html` (lists) | `pages/atlas-index.css`, `atlas-style.css` | `atlas-index-scripts.js` |

Every Atlas page also loads `scripts/atlas-common.js`: names shown to players (`Atlas.LABELS`), breadcrumbs, map set-up, pins, popups and the lore panel. An entry page opened without a valid `?id=` goes to its list page.

- **Renaming a kind of place** (e.g. "Countries"): change `Atlas.LABELS` in `scripts/atlas-common.js`, then the two hard-coded copies of the menu: `components/sidebar.html` and `MOBILE_NAV` in `scripts/general-scripts.js`.
- **The lore panel** (`.lore-panel*`) is styled in each map page's own stylesheet; `pages/continent.css` has a shorter version that sits under the map.
- **Breadcrumbs** (`.breadcrumbs*`) are filled by the script into `<nav id="atlas-breadcrumbs">`; each page stylesheet holds their look.
- **List cards** reuse the `.poi-card` / `.poi-pill` classes for every type, not only points of interest.
