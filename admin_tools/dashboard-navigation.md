# Dashboard navigation redesign — 13 Nov 2026

Follows `claude/dashboard-audit.md`. The rail had grown to 40 entries in 10 groups. It was replaced by workspaces, built from the clickable mockup (Design artifact "Athenaeum Dashboard — Navigation Redesign").

- **Rail.** Home · Atlas · Cast · Chronicle · Codex · Tables, plus **Site** (a gear at the bottom). The new schema key `workspace` places each type; a type without one goes to Tables.
- **Top bar.** Breadcrumb · campaign switcher · Ctrl K · problems / unsaved / Save. The campaign switcher filters NPCs, heroes, factions, sessions, handouts, rumours and notices. It also sets the campaign of new sessions, rumours and notices.
- **Home.** Next sessions, quick add, unsaved records, problems, recently opened, workspace tiles.
- **Atlas.** One collapsible tree of every place. *+ … here* adds a child to the selected place; ▾ adds any other kind. Places can be dragged among their siblings, and the tree works from the keyboard (← → ↑ ↓ Enter).
- **POI roles.** Optional blocks a place doesn't have are hidden; **+ Role** adds one. Removing a block asks for confirmation.
- **Tables.** The pools are grouped: Markets, Faith, Divination, Generators, Alchemy. Each one is a grid:
  - cells edited in place;
  - sortable columns and a filter;
  - the full form in a drawer (Esc closes it).

  The new schema key `columns` picks a grid's columns.
- **Site › Map icons.** A new one-object file, `data/map-icons.json` (id, name, `cardIcon`).
  - Gallery with previews and pin counts.
  - New icon: upload an SVG, PNG or WebP, or paste SVG code. The SVG is sanitised; a raster image is wrapped in an SVG.
  - Replace, rename (the pins follow) and delete (blocked while a pin uses the icon).
  - The pictures are written or deleted on save.
  - A pin picks its icon in a visual picker.
  - The site's Atlas list pages read `cardIcon`.
  - The store and the validator warn about an unknown pin icon or a missing picture.

Files: `admin_tools/dashboard.html`, `admin_tools/dashboard.js`, `data/schema.js`, `data/map-icons.json` (new), `scripts/core/store.js`, `scripts/atlas-index-scripts.js`, `tools/validate.js`, `data/README.md`.
