/* =====================================================================
   ATHENAEUM SCHEMA
   ---------------------------------------------------------------------
   Every content type the site knows about is declared here. The store
   (scripts/core/store.js), the validator (tools/validate.js) and the
   admin dashboard all read this file; nothing else describes the data.

   RULES
   - Type X lives in the file named by `file`: a flat JSON array of
     records. Nothing is nested inside another record.
   - Every record has `id` (stable, never renamed), `name`, `aliases`.
   - Place types also have `parent`: the id of the place they sit in.
   - References are ids, stored once, on the record that points.
     Inverse lists (a POI's residents, a faction's members) are computed
     by the store, never stored.
   - `map` = this record's pin on its PARENT's map image.
   - Long text is Markdown. Presentation (drop caps, colours) belongs to
     the page templates, not the data.
   - Fields marked `private: true` are never written to the public
     files: they live in data/private.json (git-ignored) and only your
     local copy sees them.

   FIELD KINDS
   text · markdown · number · boolean · image · url · list (of strings)
   enum (options | enum: '<name of a shared enum below>')
   ref / refs (to: [types]) · map ({x, y, icon, layer}) · mapImage
   object (fields) · objects (array; fields) · json (free-form, raw)
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const PLACE_FIELDS = {
        subtitle: { kind: 'text', label: 'Subtitle' },
        codex:    { kind: 'text', label: 'Codex entry' },
        summary:  { kind: 'text', label: 'One-line summary', long: true },
        body:     { kind: 'markdown', label: 'Lore' },
        danger:   { kind: 'boolean', label: 'Dangerous place' },
    };

    ATH.schema = {
        version: 1,

        /* The world map is the root every continent is pinned on. */
        world: {
            name: 'Eraldom',
            page: 'world.html',
            mapImage: { src: 'images/eraldom_world_map.png', width: 1920, height: 1078 },
        },

        /* Value lists shared by several fields. */
        enums: {
            relation: ['Ally', 'Ally (Friendly)', 'Neutral', 'Displeased', 'Hostile', 'Hostile (Threat)', 'Enemy', 'Killed', 'Unknown'],
            factionStatus: ['Allied', 'Neutral', 'Hostile', 'Unknown'],
            threatLevel: ['Low', 'Moderate', 'Severe', 'Omega'],
            mapLayer: ['locations', 'cartographic', 'political', 'relic', 'events', 'hazards'],
            menuCategory: [
                { id: 'drinks', label: 'Drinks' },
                { id: 'meals',  label: 'Hearty Fare' },
                { id: 'bites',  label: 'Small Plates & Sweets' },
            ],
            /* 5e lifestyle tiers. Pool items and services cost basePrice x mult. */
            tavernTier: [
                { id: 'squalid',      label: 'Squalid',      mult: 0.5 },
                { id: 'poor',         label: 'Poor',         mult: 0.75 },
                { id: 'modest',       label: 'Modest',       mult: 1 },
                { id: 'comfortable',  label: 'Comfortable',  mult: 1.5 },
                { id: 'wealthy',      label: 'Wealthy',      mult: 2.5 },
                { id: 'aristocratic', label: 'Aristocratic', mult: 4 },
            ],
        },

        types: {
            /* ---------------------------------------------------- PLACES */
            continent: {
                label: 'Continent', plural: 'Continents', icon: 'public',
                file: 'data/continents.json',
                page: 'continent.html?id={id}',
                place: true, parent: [], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    map:      { kind: 'map', label: 'Pin on the world map' },
                    mapImage: { kind: 'mapImage', label: 'Continent map' },
                },
            },
            country: {
                label: 'Country', plural: 'Countries', icon: 'flag',
                file: 'data/countries.json',
                page: 'country.html?id={id}',
                place: true, parent: ['continent'], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    loreTitle: { kind: 'text', label: 'Lore heading' },
                    map:       { kind: 'map', label: 'Pin on the continent map' },
                    mapImage:  { kind: 'mapImage', label: 'Country map' },
                },
            },
            settlement: {
                label: 'Settlement', plural: 'Settlements', icon: 'location_city',
                file: 'data/settlements.json',
                page: 'settlement.html?id={id}',
                place: true, parent: ['country'], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    map: { kind: 'map', label: 'Pin on the country map' },
                },
            },
            district: {
                label: 'District', plural: 'Districts', icon: 'holiday_village',
                file: 'data/districts.json',
                page: 'settlement.html?id={parent}&district={id}',
                place: true, parent: ['settlement'], autolink: true,
                fields: {
                    shortName: { kind: 'text', label: 'Short name (district tabs)' },
                    ...PLACE_FIELDS,
                    mapImage:  { kind: 'mapImage', label: 'District map' },
                },
            },
            poi: {
                label: 'Point of interest', plural: 'Points of interest', icon: 'location_on',
                file: 'data/pois.json',
                page: 'poi.html?id={id}',
                place: true, parent: ['district', 'settlement', 'country'], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    image:    { kind: 'image', label: 'Image' },
                    featured: { kind: 'boolean', label: 'Featured landmark' },
                    safe:     { kind: 'boolean', label: 'Safe haven' },
                    map:      { kind: 'map', label: 'Pin on the parent map' },
                    tavern:   {
                        kind: 'object', label: 'Tavern', optional: true,
                        help: 'Fill this in to give the POI a tavern page with a seeded menu. Staff = NPCs whose home is this POI.',
                        fields: {
                            tier:        { kind: 'enum', enum: 'tavernTier', label: 'Quality tier', required: true },
                            hours:       { kind: 'text', label: 'Opening hours' },
                            picks:       { kind: 'object', label: 'Random picks per category', fields: {
                                drinks: { kind: 'number', label: 'Drinks' },
                                meals:  { kind: 'number', label: 'Hearty fare' },
                                bites:  { kind: 'number', label: 'Small plates' },
                            } },
                            includeTags: { kind: 'list', label: 'Only pool items with one of these tags' },
                            excludeTags: { kind: 'list', label: 'Never pool items with these tags' },
                            signature:   { kind: 'objects', label: 'Signature items (always served)', itemLabel: 'name', fields: {
                                category: { kind: 'enum', enum: 'menuCategory', label: 'Category' },
                                name:     { kind: 'text', label: 'Name' },
                                desc:     { kind: 'text', label: 'Description' },
                                price:    { kind: 'number', label: 'Price (cp, as written)' },
                            } },
                            services:       { kind: 'refs', to: ['service'], label: 'Services from the catalogue' },
                            customServices: { kind: 'objects', label: 'House-only services', itemLabel: 'name', fields: {
                                name:  { kind: 'text', label: 'Name' },
                                desc:  { kind: 'text', label: 'Description' },
                                price: { kind: 'number', label: 'Price (cp, as written)' },
                                unit:  { kind: 'text', label: 'Unit' },
                            } },
                        },
                    },
                },
            },

            /* ---------------------------------------------------- PEOPLE */
            npc: {
                label: 'NPC', plural: 'NPCs', icon: 'group',
                file: 'data/npcs.json',
                page: 'npc.html?id={id}',
                autolink: true,
                fields: {
                    role:      { kind: 'text', label: 'Role / title' },
                    quote:     { kind: 'text', label: 'Quote' },
                    portrait:  { kind: 'image', label: 'Portrait' },
                    avatar:    { kind: 'image', label: 'Avatar (small)' },
                    home:      { kind: 'ref', to: ['poi', 'district', 'settlement', 'country'], label: 'Where they are found' },
                    species:   { kind: 'text', label: 'Species' },
                    age:       { kind: 'text', label: 'Age' },
                    gender:    { kind: 'text', label: 'Gender' },
                    factions:  { kind: 'refs', to: ['faction'], label: 'Factions' },
                    relation:  { kind: 'enum', enum: 'relation', label: 'Relation to the party' },
                    biography: { kind: 'markdown', label: 'Biography' },
                    secrets:   { kind: 'markdown', label: 'Secrets (DM only)', private: true },
                },
            },
            faction: {
                label: 'Faction', plural: 'Factions', icon: 'swords',
                file: 'data/factions.json',
                page: 'factions.html?id={id}',
                autolink: true,
                fields: {
                    stub:           { kind: 'boolean', label: 'Stub (named somewhere, not written up yet)' },
                    crest:          { kind: 'image', label: 'Crest' },
                    status:         { kind: 'enum', enum: 'factionStatus', label: 'Standing with the party' },
                    quote:          { kind: 'text', label: 'Motto / quote' },
                    reputation:     { kind: 'number', label: 'Reputation (0-100)' },
                    reputationText: { kind: 'text', label: 'Reputation label' },
                    base:           { kind: 'text', label: 'Base of operations' },
                    scale:          { kind: 'text', label: 'Scale of influence' },
                    mo:             { kind: 'text', label: 'Modus operandi' },
                    threatLevel:    { kind: 'enum', enum: 'threatLevel', label: 'Threat level' },
                    allies:         { kind: 'refs', to: ['faction'], label: 'Allies' },
                    rivals:         { kind: 'refs', to: ['faction'], label: 'Rivals' },
                    assets:         { kind: 'list', label: 'Known assets' },
                    directives:     { kind: 'list', label: 'Active directives' },
                    rumors:         { kind: 'list', label: 'Unverified rumours' },
                    intel:          { kind: 'json', label: 'Field evidence cards' },
                },
            },

            /* ---------------------------------------------------- TAVERNS */
            menuItem: {
                label: 'Menu item', plural: 'Tavern menu pool', icon: 'restaurant',
                file: 'data/menu-items.json',
                fields: {
                    category:  { kind: 'enum', enum: 'menuCategory', label: 'Category', required: true },
                    desc:      { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true },
                    minTier:   { kind: 'enum', enum: 'tavernTier', label: 'Cheapest tavern that serves it', required: true },
                    maxTier:   { kind: 'enum', enum: 'tavernTier', label: 'Finest tavern that serves it', required: true },
                    tags:      { kind: 'list', label: 'Tags' },
                },
            },
            service: {
                label: 'Tavern service', plural: 'Tavern services', icon: 'bed',
                file: 'data/services.json',
                fields: {
                    desc:      { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true },
                    unit:      { kind: 'text', label: 'Unit (per night, each…)' },
                },
            },
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);
