# Site data

> **These files are the only copy of the site's places, people and factions.**
> Edit them with the dashboard: open `admin_tools/dashboard.html` in Chrome or Edge (double-clicking the file works), link the site's root folder once, edit, then **Save** (Ctrl+S). It refuses to save while a link is broken. You can also edit the JSON by hand and check it with `node tools/validate.js`.

One file per type. Every record has an `id` (never renamed), a `name` and optional `aliases`.
`data/schema.js` declares every field; `node tools/validate.js` checks the files against it.

| Type | File | Sits in (`parent`) |
| --- | --- | --- |
| Continent | `continents.json` | — (pinned on the world map) |
| Country | `countries.json` | a continent |
| Settlement | `settlements.json` | a country |
| District | `districts.json` | a settlement |
| Point of interest | `pois.json` | a district, settlement or country |
| NPC | `npcs.json` | — (`home` = a POI, district, settlement or country) |
| Faction | `factions.json` | — (NPCs list theirs in `factions`) |
| Tavern menu pool | `menu-items.json` | — |
| Tavern services | `services.json` | — |
| World | `world.json` | one object: world lore and map |
| Site settings | `settings.json` | one object, e.g. `tavernCode` |
| DM-only fields | `private.json` | git-ignored; only your local copy has it |

- **Links are ids.** Write `"home": "gilded-goldfinch"`, never a display name. Lists such as a POI's residents or a faction's members are worked out by the site.
- **Map pins live on the child.** `map: {x, y, icon}` places a record on its parent's map.
- **Long text is Markdown.** Blank line = new paragraph; `**bold**`, `*italic*`, `[text](url)`, `> quote` with `> — Name` on the last line.
- **A tavern is a POI with a `tavern` block** (tier, picks, signature items, services). Its staff are the NPCs whose `home` is that POI. Its page is `poi.html?id=<poi id>`.
- **Tavern menus change with `tavernCode`** in `settings.json`: same code, same menu for every player. Preview another code with `poi.html?id=…&code=XYZ` (not saved).
- **NPCs somewhere off the map** (another plane…) have no `home`; put a line of text in `whereabouts` instead.
- **Check your edits** with `node tools/validate.js` (broken links, unknown values, missing images and map icons).
