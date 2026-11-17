# Stylesheets

Plain CSS, no build step: there is no Tailwind, npm or compile step any more. Edit a `.css` file, reload the page.

Every page loads `tokens.css`, `base.css` and `components.css` first (most also `main-style.css`), then its own sheet in `pages/`, then the shared sheets of the features it shows (tables below).

## The foundation

| File | What it holds |
|---|---|
| `tokens.css` | Colours (`--color-*`: surface, primary, secondary, tertiary, error, outline, void, ethereal…), fonts (`--font-headline`, `--font-body`, `--font-label`) and the shared easing (`--ease`). Change a colour here and it changes everywhere. The fonts themselves are loaded by the Google Fonts link in each page's `<head>`. |
| `base.css` | Browser reset, form defaults, the `.hidden` helper and the shared `@keyframes` (pulse, float, glow…). |
| `components.css` | Pieces used on every page: header, section tab bars (Grand Atlas, Black Archive), the Atlas place line and neighbour cards, footer and its pop-ups, mobile orb menu, creature threat tones (`.threat--*`). |
| `chrome.css` | For standalone pages with their own complete stylesheet (`sigil-maker.html`): what the header, footer, footer pop-ups and orb menu need from `base.css` and `main-style.css`, scoped to them so the page's own look is untouched. Such a page also sets `<body class="has-site-chrome">` to clear the fixed header. |
| `main-style.css`, `poi-style.css` | Older hand-written styles: lore text, keyword links (`.kw-*`), POI entries, `.poi-button`. |

## Shared feature sheets

| File | What it holds | Loaded by | Markup / script |
|---|---|---|---|
| `preview.css` | The preview cards over linked names: the hover card (mouse, keyboard) and the bottom sheet (touch), one colour per kind of record, the same as the links. | every page that loads the store (added by `general-scripts.js`) | `scripts/core/preview.js` |
| `looks.css` | The look of ONE page: themes, textures, frames and banner of a POI, a creature or a plane, set per record in the dashboard (card **Look**, `record.look`). Its header lists the `--look-*` variables and how to add a theme. Loaded last. | `poi.html`, `beast.html`, `plane.html` | `scripts/core/look.js`; plane decorations `scripts/plane-themes.js` |
| `atlas-style.css` | Leaflet popups, the small country/settlement pins, the popup button and "Read the lore" link, list-card flip, and the narrow-screen layout (map first, lore panel under it). | Atlas pages, `plane.html`, `npc.html`, `404.html` | `scripts/atlas-common.js` |
| `personae.css` | What Dramatis Personae's three pages share: the centred page title (`.personae-hero`) and the NPCs · Heroes · Factions tab bar (`.personae-tabs`, written out in each page: keep them in step). | `npc.html`, `heroes.html`, `factions.html`, `scriptorium.html` | `scripts/personae.js` |
| `notice-board.css` | The cork board and its pinned notes. | `settlement.html` (Town Board), `poi.html` (Board tab), dashboard preview | `scripts/notice-board.js` |
| `games.css` | The gaming table (Games tab): bone dice, table chrome and game picker (`.gt-*`), the purse bar, stakes screen and Double Down, the pot, the ledger, Liar's Dice (`.ld-*`) and Knucklebones (`.kb-*`). Crown and Dagger uses the table chrome (`.gt-*`) only. | `poi.html` | `scripts/games/` |
| `pit.css` | The fighting pit (The Pit tab): tonight's card (`.pit-bout`), the fight (`.pit-corner`, `.pit-hp`, `.pit-log`), the wager (`.pit-chip`), the roster (`.pit-roster`). Ember red, so it never reads as a tavern. Buttons reuse `.poi-button`, `.gt-back`, `.gt-link`. | `poi.html` | `scripts/pit.js` |
| `fortune-card.css` | The readings of a seer: tarot-sized cards (70 × 120) that turn over, the spreads they are laid in, omens, casts and their cloth, the reading dialog. | `poi.html` (Readings tab), dashboard previews | `scripts/fortune-card.js`, draws in `scripts/divination.js` |
| `loot-card.css` | The item cards (front and opened, rarity colours). | `vault.html`, dashboard preview and printing | `scripts/loot-card.js` |
| `spell-card.css` | The spell cards (one hue per school: `.school--<name>`, symbols, level banner, materials tooltip) and their pop-ups. Also declares the Rieven Uncial font. School symbols and the back's art (`card-back.png`) are in `images/spells/`. | `spellbook.html` (Tome of Shadows), `heroes.html`, dashboard | `scripts/spell-card.js` |
| `deity-card.css` | The gods' cards, one frame per tier (Creators, Great Pantheon, Minor Gods, Primordials, Elder Gods) plus the sealed slot of an unrevealed Elder god. The card scales with its box (sizes in % and `cqw`). | `pantheon.html`, `deity.html`, dashboard preview | `scripts/deity-card.js` (markup and SVG frames) |

A new value in some enums of `data/schema.js` needs CSS here too: a spell school (`spell-card.css`), a page theme, texture or frame (`looks.css`), a faction tag tone (`pages/factions.css`), a deity tier (`deity-card.css` + `deity-card.js`).

## Page sheets (`pages/`)

One per page, named after it: `pages/npc.css` for `npc.html`. Everything specific to that page lives there.

| Section | Pages and sheets |
|---|---|
| Home | `index.css` (upcoming sessions cards, Today in Eraldom, gateways) |
| Grand Atlas | `world.css`, `continent.css`, `country.css`, `settlement.css`, `poi.css`; `atlas-index.css` serves the four list pages (see below) |
| Black Archive | `library.css` (the doors), `pantheon.css`, `deity.css`, `planes.css` (the orrery), `plane.css` (a plane's page), `timeline.css` (the Book of Days), `bestiary.css`, `beast.css`, `tomes.css`, `spellbook.css` (Tome of Shadows), `vault.css`, `handouts.css` |
| Dramatis Personae | `npc.css`, `heroes.css`, `factions.css` (with `personae.css`) |
| Scriptorium | `scriptorium.css` (with `personae.css`) |
| Other | `404.css` |

- **The Book of Days** (`pages/timeline.css`): its two tabs, the Calendar tab (“cal-”: month grid, moons drawn as lit discs with an inset shadow, the chosen day's panel; dots on phones; script `scripts/astrolabe-calendar.js`) and the timeline (look “astral manuscript”: the line of gold stars, glass panels alternating sides, the year now and its sessions, major events, the seal of an age, sealed pages; one side of the line on phones). The night sky behind it is a canvas drawn by `scripts/core/sky.js`, also used by the Pantheon and the planes.
- **The orrery** (`pages/planes.css`): the Book of Days' sky and glass panels, an engraved gold plate, flat medallions in each plane's colour. Positions and sizes are set by `scripts/planes-scripts.js` (inline styles and `--in` / `--out` / `--c`); the sheet holds the look and the motion.
- **A plane's page** (`pages/plane.css`): the shared layout; each plane's own colours and fonts are its theme in `looks.css` (`.look--plane-<id>`), and what the theme draws around the page is in `scripts/plane-themes.js`.

## Conventions

- **Class names describe the thing, not its look**: `npc-card`, `npc-card__name`, `npc-modal__close`.
  `block__part` for the parts of a block, `block--variant` for a variant (`tag--gold`, `poi-pill--danger`).
- **State classes** are toggled by the page scripts: `is-active` (selected tab or button), `is-open` (open menu), `is-visible`, and `hidden` (display: none).
- **Colours with transparency** are written `color-mix(in srgb, var(--color-secondary) 30%, transparent)` — read it as "secondary at 30%".
- Breakpoints follow the old Tailwind ones: 640px (sm), 768px (md), 1024px (lg), 1280px (xl), 1536px (2xl).
- **Every page has a phone layout.** A new or changed page is designed for phones too. (The dashboard is the exception: PC only, its styles are in `admin_tools/dashboard.html`.)

The library pages share `components.css` (library header, footer and the tab bar) like the atlas pages do. They say so with `<body data-section="archive">`: `general-scripts.js` then loads the library header and footer (`components/library-header.html`, `library-footer.html`). Their tab bar is `<nav class="section-tabs" data-section="archive">` (left out of `library.html`, whose cards lead everywhere).

## The Atlas

| Page | Stylesheets (besides `tokens`, `base`, `components`, `main-style`) | Script |
|---|---|---|
| `world.html` | `pages/world.css`, `atlas-style.css` | `atlas-scripts.js` |
| `continent.html?id=…` | `pages/continent.css`, `atlas-style.css` | `continent-scripts.js` |
| `country.html?id=…` | `pages/country.css`, `atlas-style.css` | `country-scripts.js` |
| `settlement.html?id=…[&district=…]` | `pages/settlement.css`, `atlas-style.css`, `notice-board.css` | `settlement-scripts.js` (town board: `market.js`, `notice-board.js`) |
| `poi.html?id=…` | `atlas-style.css`, `pages/poi.css`, `poi-style.css`, `notice-board.css`, `games.css`, `pit.css`, `fortune-card.css`, `looks.css` | `poi-scripts.js` (with `institution.js`, `tavern-menu.js`, `market.js`, `alchemy-engine.js`, `divination.js`, `fortune-card.js`, `notice-board.js`, `personae.js`, `games/*.js`, `pit.js`) |
| `continents.html`, `countries.html`, `settlements.html`, `pois.html` (lists) | `pages/atlas-index.css`, `atlas-style.css` | `atlas-index-scripts.js` |

On the map pages `atlas-style.css` is loaded after the page stylesheet, so it wins on equal selectors; on `poi.html` (and `plane.html`) it comes first and the page sheet wins.

Every Atlas page also loads `scripts/atlas-common.js`: names shown to players (`Atlas.LABELS`), the place line and neighbour cards, map set-up, pins, popups and the lore panel. An entry page opened without a valid `?id=` goes to its list page.

- **Renaming a kind of place** (e.g. "Countries"): change `Atlas.LABELS` in `scripts/atlas-common.js`, then its menu entry in `SITE_NAV` (`scripts/general-scripts.js`), the one list behind every menu: header highlight, mobile orb menu and the tab bars of the Grand Atlas and the Black Archive.
- **The lore panel** (`.lore-panel*`) is styled in each map page's own stylesheet; `pages/continent.css` has a shorter version that sits under the map.
- **Navigation.** Every Atlas page has the tab bar `<nav class="section-tabs" data-section="atlas">` before its `<main>` (World Map · Continents · Countries · Settlements · Points of Interest; a place's page lights the tab of its type), filled by `renderSectionTabs()` in `general-scripts.js`. A place's page (continent, country, settlement, POI) also has:
  - `<p id="atlas-place-line">`, filled by `Atlas.placeLine()`: "Settlement · Eperina, Maltona" above the heading, nearest place first, as links (a district, which has no page, as plain text). Hidden on continents, which sit in nothing.
  - `<section id="atlas-elsewhere">` at the end of `<main>`, filled by `Atlas.elsewhere()`: the places of the same type under the same parent as cards ("Elsewhere in Brightend", "Other continents"), plus a link to the list page. On phones the cards scroll sideways.
- **List cards** reuse the `.poi-card` / `.poi-pill` classes for every type, not only points of interest. The icon on the back of a card is the pin icon's `cardIcon` (`data/map-icons.json`).
