# The Athenaeum — Eraldom campaign site

The website of the Eraldom D&D campaigns: the Grand Atlas (maps and places), Dramatis Personae (NPCs, heroes, factions), the Scriptorium (each campaign's sessions and story) and the Black Archive (gods, planes, the Book of Days, bestiary, spells, loot, handouts).

Live at **[eraldom.linguist.fr](https://eraldom.linguist.fr)** (GitHub Pages, branch `main`).

## How it works

A static site with no server and no build step. Every page is a plain HTML file that loads the world from `data/*.json` in the browser. `data/schema.js` describes every type of record and every field; the site, the admin dashboard and the validator all read it.

## Working on it

- **View the site locally** through a local server (VS Code *Live Server*): the pages fetch their data and components, which browsers refuse from `file://`.
- **Edit the content** with the dashboard: open `admin_tools/dashboard.html` in Chrome, Edge or Brave (double-click works), link the site's root folder, edit, then **Save** (Ctrl+S).
- **Check the data**: `node tools/validate.js`.
- **Publish**: commit and push to `main`.

`data/private.json` (DM-only fields) and `data/folios.json` are git-ignored: they stay on your machine.

## Folders

| Folder | Holds |
|---|---|
| `/` | The pages (`index.html`, `world.html`, `poi.html`, `npc.html`, `scriptorium.html`, `library.html`…) |
| `data/` | The world: one JSON file per type, and `schema.js` |
| `scripts/` | One script per page, shared modules (`core/` holds the data store), the tavern games (`games/`) |
| `styles/` | Plain CSS: shared sheets, and one sheet per page in `pages/` |
| `components/` | Header and footer, loaded into every page |
| `admin_tools/` | The dashboard, the potion maker, the map coordinate tool |
| `images/` | Maps, portraits, pin icons, cards |
| `tools/` | The validator (Node) |

## Documentation

- **[data/README.md](data/README.md)**: the data. Every type and file, how records link, and how each feature (taverns, shops, temples, seers, gaming tables, the fighting pit, the Pantheon, the planes, the calendar, the Scriptorium…) is set up and edited in the dashboard.
- **[styles/README.md](styles/README.md)**: the stylesheets. What each file holds, which pages load it, and the CSS conventions.
