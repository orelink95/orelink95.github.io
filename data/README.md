# Site data

> **These files are the only copy of the site's places, people, library and campaigns.**
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
| Glossary term | `lore.json` | — (a keyword with no page of its own) |
| Tome | `tomes.json` | — |
| Handout | `handouts.json` | — (`campaign` = where it was found) |
| Creature | `creatures.json` | — |
| Item | `items.json` | — (sessions list the items found) |
| Spell | `spells.json` | — (campaigns list who knows it in `spellbooks`) |
| Campaign | `campaigns.json` | — (story, quests, party, funds) |
| Session | `sessions.json` | — (`campaign` = its campaign; newest first) |
| Hero | `heroes.json` | — (campaigns list theirs in `party`) |
| Tavern menu pool | `menu-items.json` | — |
| Tavern services | `services.json` | — |
| World | `world.json` | one object: world lore and map |
| Site settings | `settings.json` | one object: `tavernCode`, `currentCampaign` |
| Upcoming sessions | `schedule.json` | one object: `sessions`, the homepage cards in order |
| DM-only fields | `private.json` | git-ignored; only your local copy has it |

- **Links are ids.** Write `"home": "gilded-goldfinch"`, never a display name. Lists such as a POI's residents or a faction's members are worked out by the site.
- **Map pins live on the child.** `map: {x, y, icon}` places a record on its parent's map.
- **Long text is Markdown.** Blank line = new paragraph; `**bold**`, `*italic*`, `[text](url)`, `> quote` with `> — Name` on the last line.
- **A tavern is a POI with a `tavern` block** (tier, picks, signature items, services). Its staff are the NPCs whose `home` is that POI. Its page is `poi.html?id=<poi id>`.
- **Tavern menus change with `tavernCode`** in `settings.json`: same code, same menu for every player. Preview another code with `poi.html?id=…&code=XYZ` (not saved).
- **NPCs somewhere off the map** (another plane…) have no `home`; put a line of text in `whereabouts` instead.
- **Keywords.** Names of NPCs, places, factions and creatures become links on their own. A term with no page (a war, a lost civilisation) is a glossary term in `lore.json`; its `kind` sets the colour and its `definition` the tooltip in the scriptorium. Give an NPC, faction or place a `summary` to show a tooltip for it too.
- **Hero secrets** are written in `private.json` (`secret` and `password`). The dashboard encrypts them into `sealedSecret` when it saves, so the live site shows a secret only to someone who types its password.
- **Loot cards.** Every item is a card in the Artifact Vault (`vault.html`). Players see the items listed in their campaign's sessions (`loot`) and the party's own (`inventory`). Fill in `type`, `rarity` (sets the card's colour), `cost`, `weight`, `attunement`, `attunedBy`, a one-line `summary` for the front and a full `body` for the opened card. Items from the newest session lie face down until a player turns them over. In the dashboard, **+ New** on Items asks where the party found it (a session's loot or a party's inventory) and the side panel previews the card, front and opened. The card's markup and styles are shared: `scripts/loot-card.js` and `styles/loot-card.css`.
- **Spell cards.** Every spell is a card in the Book of Shadows (`spellbook.html`): pick a campaign, then a hero. What a hero knows is written on the **campaign**, in `spellbooks` (one entry per hero: `hero` + `spells`), so a hero in two campaigns can know different spells in each. Fill in `level` (0 = cantrip, shown as C), `school` (sets the card's colour and symbols), `castingTime`, `range`, `duration`, the `concentration`, `ritual`, `verbal`, `somatic` and `material` boxes, `materials` (the components: shown when hovering the M, which is then marked with a star), a one-line `summary` for the card and a full `body` for the opened card. The same cards open from a hero's card on `heroes.html`. A spell a browser has never turned over lies face down (its back takes the school's colour); the first click turns it, the next opens it. In the dashboard, the side panel previews the card, its back and the opened card. Markup and styles: `scripts/spell-card.js` and `styles/spell-card.css`; school symbols and the back's art (`card-back.png`) in `images/spells/`.
- **Upcoming sessions** (homepage cards) are `sessions` in `schedule.json`, shown in file order: `campaign`, `number`, `date` (YYYY-MM-DD), `time` (HH:MM), optional `status` (`tentative` = purple TBD card, `postponed` = amber with the date struck through, `cancelled` = red and dimmed; none = confirmed), `notice` (a message on the card), `title`, `where`, `link`. A date that has passed is hidden on its own; the first confirmed card still to come is “Up Next”, with a countdown. Confirmed cards have an **Add to calendar** button (an .ics event lasting `length` hours, default 4, with a reminder 2 hours before). In the dashboard (Site › Upcoming sessions), **+ Add a session** prefills the next number, date and time; the side panel previews the homepage and can sort by date or remove past sessions.
- **Drafts.** A tome or handout with `"draft": true` stays off the site.
- **Check your edits** with `node tools/validate.js` (broken links, unknown values, missing images and map icons).