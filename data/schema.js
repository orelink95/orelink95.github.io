/* ===========================================================================
    ATHENAEUM SCHEMA
------------------------------------------------------------------------------
Every content type the site knows about is declared here. The store (scripts/core/store.js), the validator (tools/validate.js) and the
admin dashboard all read this file; nothing else describes the data.

※ RULES ※
- Type X lives in the file named by `file`: a flat JSON array of records. Nothing is nested inside another record.
- Every record has `id` (stable, never renamed), `name`, `aliases`.
- Place types also have `parent`: the id of the place they sit in.
- References are ids, stored once, on the record that points.
    Inverse lists (a POI's residents, a faction's members) are computed by the store, never stored.
- `map` = this record's pin on its PARENT's map image.
- Long text is Markdown. Presentation (drop caps, colours) belongs to
    the page templates, not the data.
- Fields marked `private: true` are never written to the public files: they live in data/private.json (git-ignored) and only the local copy sees them.

※ FIELD KINDS ※
text · markdown · number · boolean · image · url · list (of strings)
enum (options | enum: '<name of a shared enum below>')
ref / refs (to: [types]) · map ({x, y, icon, layer}) · mapImage
object (fields) · objects (array; fields) · json (free-form, raw)

※ TYPE OPTIONS ※
order  { by, desc, within }  store.all(type) returns the records sorted by `by` (descending if `desc`), grouped by `within` if given;
records missing `by` come last. Otherwise: file order.
sealed  text encrypted with a password ({v, salt, iv, data}); the dashboard writes it from a private plain-text field (`from`) and a private password field (`password`)
=========================================================================== */

(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const PLACE_FIELDS = {
        subtitle: { kind: 'text', label: 'Subtitle' },
        codex: { kind: 'text', label: 'Codex entry' },
        summary: { kind: 'text', label: 'One-line summary', long: true },
        body: { kind: 'markdown', label: 'Lore' },
        danger: { kind: 'boolean', label: 'Dangerous place' },
    };

    ATH.schema = {
        version: 1,

        /* One-object files (not lists of records). The store exposes them as store.world and store.settings. */
        singletons: {
            /* The world map is the root every continent is pinned on. */
            world: {
                label: 'World', icon: 'travel_explore', group: 'Site',
                file: 'data/world.json',
                page: 'world.html',
                fields: {
                    name: { kind: 'text', label: 'Name', required: true },
                    codex: { kind: 'text', label: 'Codex entry' },
                    loreTitle: { kind: 'text', label: 'Lore heading' },
                    body: { kind: 'markdown', label: 'Lore (shown when no pin is selected)' },
                    mapImage: { kind: 'mapImage', label: 'World map', required: true },
                },
            },
            /* Site-wide settings. */
            settings: {
                label: 'Settings', icon: 'tune', group: 'Site',
                file: 'data/settings.json',
                fields: {
                    tavernCode: { kind: 'text', label: 'Bill of fare code: every tavern menu is drawn from it, the same for everyone. Change it to change all menus.' },
                    currentCampaign: { kind: 'ref', to: ['campaign'], label: 'Campaign shown first (scriptorium, heroes)' },
                },
            },
        },

        /* Value lists shared by several fields. */
        enums: {
            relation: ['Ally', 'Ally (Friendly)', 'Neutral', 'Displeased', 'Hostile', 'Hostile (Threat)', 'Enemy', 'Killed', 'Unknown'],
            factionStatus: ['Allied', 'Neutral', 'Hostile', 'Unknown'],
            threatLevel: ['Low', 'Moderate', 'Severe', 'Omega'],
            mapLayer: ['locations', 'cartographic', 'political', 'relic', 'events', 'hazards'],
            /* Library and campaigns */
            loreKind: ['lore', 'object', 'monster', 'person', 'place', 'faction'],
            tomeKind: ['Book', 'Scroll'],
            tomeTone: ['secondary', 'primary', 'error', 'void', 'ethereal', 'cyan'],
            creatureThreat: ['Lethal', 'High', 'Moderate', 'Low', 'Harmless', 'Friendly'],
            /* Each school has its hue and symbols in styles/spell-card.css (.school--<name in lowercase>) */
            spellSchool: ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation', 'Blood', 'Chaos', 'Void'],
            questStatus: ['Primary', 'Secondary'],
            itemRarity: ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact', 'Varies', 'Unknown'],
            sentiment: [
                { id: 'like', label: 'Positive' },
                { id: 'neutral', label: 'Neutral / business' },
                { id: 'dislike', label: 'Hostile / negative' },
            ],
            menuCategory: [
                { id: 'drinks', label: 'Drinks' },
                { id: 'meals', label: 'Hearty Fare' },
                { id: 'bites', label: 'Small Plates & Sweets' },
            ],
            /* 5e lifestyle tiers. Pool items and services cost basePrice x mult. */
            tavernTier: [
                { id: 'squalid', label: 'Squalid', mult: 0.5 },
                { id: 'poor', label: 'Poor', mult: 0.75 },
                { id: 'modest', label: 'Modest', mult: 1 },
                { id: 'comfortable', label: 'Comfortable', mult: 1.5 },
                { id: 'wealthy', label: 'Wealthy', mult: 2.5 },
                { id: 'aristocratic', label: 'Aristocratic', mult: 4 },
            ],
        },

        types: {
            /*-------------------------------------======= PLACES =======-------------------------------------*/
            continent: {
                label: 'Continent', plural: 'Continents', icon: 'public', group: 'Places',
                file: 'data/continents.json',
                page: 'continent.html?id={id}',
                place: true, parent: [], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    era: { kind: 'text', label: 'Era shown on the map (e.g. Year 1466 LF)' },
                    map: { kind: 'map', label: 'Pin on the world map' },
                    mapImage: { kind: 'mapImage', label: 'Continent map' },
                    facts: {
                        kind: 'objects', label: 'Info cards under the map', itemLabel: 'title', fields: {
                            title: { kind: 'text', label: 'Title' },
                            text: { kind: 'text', label: 'Text', long: true },
                        }
                    },
                    notables: { kind: 'refs', to: ['npc'], label: 'Very important people' },
                    epigraph: { kind: 'text', label: 'Epigraph', long: true },
                    epigraphSource: { kind: 'text', label: 'Epigraph source' },
                },
            },
            country: {
                label: 'Country', plural: 'Countries', icon: 'flag', group: 'Places',
                file: 'data/countries.json',
                page: 'country.html?id={id}',
                place: true, parent: ['continent'], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    shortName: { kind: 'text', label: 'Short name (map labels)' },
                    epithet: { kind: 'text', label: 'Epithet (nations list)' },
                    unlisted: { kind: 'boolean', label: 'Hide from the nations list' },
                    loreTitle: { kind: 'text', label: 'Lore heading' },
                    map: { kind: 'map', label: 'Pin on the continent map' },
                    mapImage: { kind: 'mapImage', label: 'Country map' },
                },
            },
            settlement: {
                label: 'Settlement', plural: 'Settlements', icon: 'location_city', group: 'Places',
                file: 'data/settlements.json',
                page: 'settlement.html?id={id}',
                place: true, parent: ['country'], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    map: { kind: 'map', label: 'Pin on the country map' },
                },
            },
            district: {
                label: 'District', plural: 'Districts', icon: 'holiday_village', group: 'Places',
                file: 'data/districts.json',
                page: 'settlement.html?id={parent}&district={id}',
                place: true, parent: ['settlement'], autolink: true,
                fields: {
                    shortName: { kind: 'text', label: 'Short name (district tabs)' },
                    ...PLACE_FIELDS,
                    mapImage: { kind: 'mapImage', label: 'District map' },
                },
            },
            poi: {
                label: 'Point of interest', plural: 'Points of interest', icon: 'location_on', group: 'Places',
                file: 'data/pois.json',
                page: 'poi.html?id={id}',
                place: true, parent: ['district', 'settlement', 'country'], autolink: true,
                fields: {
                    ...PLACE_FIELDS,
                    image: { kind: 'image', label: 'Image' },
                    featured: { kind: 'boolean', label: 'Featured landmark' },
                    safe: { kind: 'boolean', label: 'Safe haven' },
                    map: { kind: 'map', label: 'Pin on the parent map' },
                    tavern: {
                        kind: 'object', label: 'Tavern', optional: true,
                        help: 'Fill this in to give the POI a tavern page with a seeded menu. Staff = NPCs whose home is this POI.',
                        fields: {
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Quality tier', required: true },
                            hours: { kind: 'text', label: 'Opening hours' },
                            picks: {
                                kind: 'object', label: 'Random picks per category', fields: {
                                    drinks: { kind: 'number', label: 'Drinks' },
                                    meals: { kind: 'number', label: 'Hearty fare' },
                                    bites: { kind: 'number', label: 'Small plates' },
                                }
                            },
                            includeTags: { kind: 'list', label: 'Only pool items with one of these tags' },
                            excludeTags: { kind: 'list', label: 'Never pool items with these tags' },
                            signature: {
                                kind: 'objects', label: 'Signature items (always served)', itemLabel: 'name', fields: {
                                    category: { kind: 'enum', enum: 'menuCategory', label: 'Category' },
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp, as written)' },
                                }
                            },
                            services: { kind: 'refs', to: ['service'], label: 'Services from the catalogue' },
                            customServices: {
                                kind: 'objects', label: 'House-only services', itemLabel: 'name', fields: {
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp, as written)' },
                                    unit: { kind: 'text', label: 'Unit' },
                                }
                            },
                        },
                    },
                },
            },

            /*-------------------------------------======= PEOPLE =======-------------------------------------*/
            npc: {
                label: 'NPC', plural: 'NPCs', icon: 'group', group: 'People',
                file: 'data/npcs.json',
                page: 'npc.html?id={id}',
                autolink: true,
                fields: {
                    role: { kind: 'text', label: 'Role / title' },
                    summary: { kind: 'text', label: 'One-line summary (keyword tooltips)', long: true },
                    quote: { kind: 'text', label: 'Quote' },
                    portrait: { kind: 'image', label: 'Portrait' },
                    avatar: { kind: 'image', label: 'Avatar (small)' },
                    home: { kind: 'ref', to: ['poi', 'district', 'settlement', 'country'], label: 'Where they are found' },
                    whereabouts: { kind: 'text', label: 'Whereabouts, when not a place on the site (e.g. another plane)' },
                    species: { kind: 'text', label: 'Species' },
                    age: { kind: 'text', label: 'Age' },
                    gender: { kind: 'text', label: 'Gender' },
                    factions: { kind: 'refs', to: ['faction'], label: 'Factions' },
                    relation: { kind: 'enum', enum: 'relation', label: 'Relation to the party' },
                    biography: { kind: 'markdown', label: 'Biography' },
                    secrets: { kind: 'markdown', label: 'Secrets (DM only)', private: true },
                },
            },
            faction: {
                label: 'Faction', plural: 'Factions', icon: 'swords', group: 'People',
                file: 'data/factions.json',
                page: 'factions.html?id={id}',
                autolink: true,
                fields: {
                    stub: { kind: 'boolean', label: 'Stub (named somewhere, not written up yet)' },
                    summary: { kind: 'text', label: 'One-line summary (keyword tooltips)', long: true },
                    crest: { kind: 'image', label: 'Crest' },
                    status: { kind: 'enum', enum: 'factionStatus', label: 'Standing with the party' },
                    quote: { kind: 'text', label: 'Motto / quote' },
                    reputation: { kind: 'number', label: 'Reputation (0-100)' },
                    reputationText: { kind: 'text', label: 'Reputation label' },
                    base: { kind: 'text', label: 'Base of operations' },
                    scale: { kind: 'text', label: 'Scale of influence' },
                    mo: { kind: 'text', label: 'Modus operandi' },
                    threatLevel: { kind: 'enum', enum: 'threatLevel', label: 'Threat level' },
                    allies: { kind: 'refs', to: ['faction'], label: 'Allies' },
                    rivals: { kind: 'refs', to: ['faction'], label: 'Rivals' },
                    assets: { kind: 'list', label: 'Known assets' },
                    directives: { kind: 'list', label: 'Active directives' },
                    rumors: { kind: 'list', label: 'Unverified rumours' },
                    intel: { kind: 'json', label: 'Field evidence cards' },
                },
            },

            /*-------------------------------------======= LIBRARY =======-------------------------------------*/
            /* A glossary term: lore, an object, a creature... that has no page of its own. Shown as a keyword (with its definition as tooltip) in the scriptorium. */
            lore: {
                label: 'Glossary term', plural: 'Glossary', icon: 'key', group: 'Library',
                file: 'data/lore.json',
                autolink: true,
                fields: {
                    kind: { kind: 'enum', enum: 'loreKind', label: 'Kind (keyword colour)', required: true },
                    definition: { kind: 'text', label: 'Definition (tooltip)', long: true },
                },
            },
            tome: {
                label: 'Tome', plural: 'Tomes', icon: 'menu_book', group: 'Library',
                file: 'data/tomes.json',
                page: 'tomes.html?id={id}',
                fields: {
                    draft: { kind: 'boolean', label: 'Draft (not shown on the site)' },
                    author: { kind: 'text', label: 'Author' },
                    kind: { kind: 'enum', enum: 'tomeKind', label: 'Book or scroll', required: true },
                    category: { kind: 'text', label: 'Category (shelf filter)' },
                    spineText: { kind: 'text', label: 'Spine text' },
                    cover: { kind: 'image', label: 'Cover image (books)' },
                    cleanCover: { kind: 'boolean', label: 'Clean cover: show the image alone, no title over it' },
                    tone: { kind: 'enum', enum: 'tomeTone', label: 'Colour (books without a cover, scrolls)' },
                    icon: { kind: 'text', label: 'Seal icon (scrolls; Material Symbols name)' },
                    iconColor: { kind: 'text', label: 'Seal icon colour (scrolls; CSS colour)' },
                    body: { kind: 'markdown', label: 'Text' },
                },
            },
            handout: {
                label: 'Handout', plural: 'Handouts', icon: 'contract', group: 'Library',
                file: 'data/handouts.json',
                page: 'handouts.html',
                fields: {
                    draft: { kind: 'boolean', label: 'Draft (not shown on the site)' },
                    campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign' },
                    category: { kind: 'text', label: 'Category (filter)' },
                    icon: { kind: 'text', label: 'Icon (Material Symbols name)' },
                    foundAt: { kind: 'text', label: 'Where it was found' },
                    description: { kind: 'text', label: 'Description', long: true },
                    thumbnail: { kind: 'image', label: 'Card image' },
                    file: { kind: 'url', label: 'File to open (image or link)' },
                },
            },
            creature: {
                label: 'Creature', plural: 'Bestiary', icon: 'pest_control', group: 'Library',
                file: 'data/creatures.json',
                page: 'beast.html?id={id}',
                autolink: true,
                fields: {
                    arcana: { kind: 'text', label: 'Arcana (e.g. I · THE GUARDIAN)' },
                    specimenNo: { kind: 'text', label: 'Specimen number' },
                    location: { kind: 'text', label: 'Where it was met' },
                    image: { kind: 'image', label: 'Image' },
                    threat: { kind: 'enum', enum: 'creatureThreat', label: 'Threat level' },
                    realm: { kind: 'text', label: 'Realm' },
                    phylogeny: { kind: 'text', label: 'Phylogeny' },
                    shortDesc: { kind: 'text', label: 'Short description', long: true },
                    stats: {
                        kind: 'objects', label: 'Stat bars (0-100)', itemLabel: 'label', fields: {
                            label: { kind: 'text', label: 'Stat' },
                            value: { kind: 'number', label: 'Value (0-100)' },
                        }
                    },
                    tags: { kind: 'list', label: 'Tags' },
                    habitats: { kind: 'list', label: 'Habitats' },
                    loreTitle: { kind: 'text', label: 'Lore heading' },
                    body: { kind: 'markdown', label: 'Lore' },
                    behaviors: { kind: 'list', label: 'Behaviours' },
                    weaknesses: { kind: 'list', label: 'Weaknesses' },
                    drops: {
                        kind: 'objects', label: 'Harvestable parts', itemLabel: 'name', fields: {
                            name: { kind: 'text', label: 'Name' },
                            type: { kind: 'text', label: 'Type' },
                            icon: { kind: 'text', label: 'Icon (Material Symbols name)' },
                        }
                    },
                    scholarQuote: { kind: 'text', label: 'Scholar quote', long: true },
                    scholarName: { kind: 'text', label: 'Scholar name' },
                },
            },
            /* A spell, shown as a card in the Spellbook (spellbook.html) and from the
               heroes' cards (heroes.html). Who knows it: campaign.spellbooks. */
            spell: {
                label: 'Spell', plural: 'Spellbook', icon: 'webhook', group: 'Library',
                file: 'data/spells.json',
                page: 'spellbook.html?spell={id}', // opens the card, whatever campaign and hero are picked
                autolink: true,
                fields: {
                    level: { kind: 'number', label: 'Level (0 = cantrip, up to 9)', required: true },
                    school: { kind: 'enum', enum: 'spellSchool', label: 'School (sets the card colour)', required: true },
                    castingTime: { kind: 'text', label: 'Casting time (e.g. 1 action)' },
                    range: { kind: 'text', label: 'Range (e.g. 60 ft)' },
                    duration: { kind: 'text', label: 'Duration (e.g. Up to 1 minute)' },
                    /* same order as on the card: V S M, Conc., Rit. */
                    verbal: { kind: 'boolean', label: 'Verbal (V)' },
                    somatic: { kind: 'boolean', label: 'Somatic (S)' },
                    material: { kind: 'boolean', label: 'Material (M)' },
                    concentration: { kind: 'boolean', label: 'Concentration' },
                    ritual: { kind: 'boolean', label: 'Ritual' },
                    materials: { kind: 'text', label: 'Material components (shown when hovering the M)', long: true },
                    summary: { kind: 'text', label: 'One-line summary (the card in the grid)', long: true },
                    body: { kind: 'markdown', label: 'Full description (the opened card)' },
                },
            },
            /* Shown as a loot card in the Artifact Vault (vault.html). Players see the items found in their campaign's sessions (session.loot) and the party's own (campaign.inventory). */
            item: {
                label: 'Item', plural: 'Items', icon: 'crown', group: 'Library',
                file: 'data/items.json',
                page: 'vault.html?item={id}',
                autolink: true,   // only items found somewhere (else the Vault link leads nowhere)
                fields: {
                    image: { kind: 'image', label: 'Picture' },
                    type: { kind: 'text', label: 'Type (e.g. Wondrous item, Weapon (dagger))' },
                    rarity: { kind: 'enum', enum: 'itemRarity', label: 'Rarity (sets the card colour)' },
                    cost: { kind: 'text', label: 'Cost (e.g. 50 gp)' },
                    weight: { kind: 'text', label: 'Weight (e.g. 1 lb.)' },
                    attunement: { kind: 'boolean', label: 'Requires attunement' },
                    attunedBy: { kind: 'ref', to: ['hero'], label: 'Attuned to' },
                    summary: { kind: 'text', label: 'One-line description (front of the card)', long: true },
                    body: { kind: 'markdown', label: 'Full description (shown when the card is opened)' },
                },
            },

            /*-------------------------------------======= CAMPAIGNS =======-------------------------------------*/
            campaign: {
                label: 'Campaign', plural: 'Campaigns', icon: 'auto_stories', group: 'Campaigns',
                file: 'data/campaigns.json',
                page: 'scriptorium.html?campaign={id}',
                fields: {
                    preview: { kind: 'text', label: 'Story so far: teaser', long: true },
                    story: { kind: 'markdown', label: 'Story so far' },
                    quests: {
                        kind: 'objects', label: 'Active quests', itemLabel: 'title', fields: {
                            title: { kind: 'text', label: 'Title' },
                            description: { kind: 'text', label: 'Description', long: true },
                            status: { kind: 'enum', enum: 'questStatus', label: 'Status' },
                        }
                    },
                    partyName: { kind: 'text', label: 'Party name' },
                    party: { kind: 'refs', to: ['hero'], label: 'Heroes' },
                    funds: {
                        kind: 'object', label: 'Party funds', fields: {
                            gold: { kind: 'number', label: 'Gold' },
                            silver: { kind: 'number', label: 'Silver' },
                            copper: { kind: 'number', label: 'Copper' },
                        }
                    },
                    inventory: { kind: 'refs', to: ['item'], label: 'Shared inventory (besides the loot from sessions)' },
                    standings: {
                        kind: 'objects', label: 'Party allegiances', itemLabel: 'faction', fields: {
                            faction: { kind: 'ref', to: ['faction', 'poi'], label: 'Faction (or place)' },
                            status: { kind: 'enum', enum: 'factionStatus', label: 'Standing' },
                        }
                    },
                    /* What each hero knows in THIS campaign (a hero can be in two campaigns) */
                    spellbooks: {
                        kind: 'objects', label: 'Spellbooks', itemLabel: 'hero', fields: {
                            hero: { kind: 'ref', to: ['hero'], label: 'Hero (one of the party)' },
                            spells: { kind: 'refs', to: ['spell'], label: 'Spells known' },
                        }
                    },
                },
            },
            session: {
                label: 'Session', plural: 'Sessions', icon: 'history_edu', group: 'Campaigns',
                file: 'data/sessions.json',
                page: 'scriptorium.html?session={id}',
                /* Newest first everywhere (store.all('session')), whatever the order in the file: grouped by campaign, highest number first. */
                order: { within: 'campaign', by: 'number', desc: true },
                fields: {
                    campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign', required: true },
                    number: { kind: 'number', label: 'Session number (highest = latest)', required: true },
                    date: { kind: 'text', label: 'In-world date' },
                    region: { kind: 'text', label: 'Region' },
                    arc: { kind: 'text', label: 'Arc' },
                    summary: { kind: 'text', label: 'Summary', long: true },
                    places: { kind: 'refs', to: ['poi', 'district', 'settlement', 'country', 'continent'], label: 'Places visited' },
                    otherPlaces: { kind: 'list', label: 'Places visited that have no page' },
                    npcs: {
                        kind: 'objects', label: 'NPCs met', itemLabel: 'npc', fields: {
                            npc: { kind: 'ref', to: ['npc'], label: 'NPC' },
                            sentiment: { kind: 'enum', enum: 'sentiment', label: 'How it went' },
                        }
                    },
                    loot: { kind: 'refs', to: ['item'], label: 'Loot obtained' },
                    accomplished: { kind: 'list', label: 'Things accomplished' },
                    leadsPursued: { kind: 'list', label: 'Leads pursued' },
                    futureLeads: { kind: 'list', label: 'Future leads' },
                    keywords: { kind: 'list', label: 'Search keywords' },
                    body: { kind: 'markdown', label: 'Transcript' },
                },
            },
            hero: {
                label: 'Hero', plural: 'Heroes', icon: 'local_fire_department', group: 'Campaigns',
                file: 'data/heroes.json',
                page: 'heroes.html',
                fields: {
                    raceClass: { kind: 'text', label: 'Race and class' },
                    level: { kind: 'number', label: 'Level' },
                    background: { kind: 'text', label: 'Background' },
                    avatar: { kind: 'image', label: 'Avatar' },
                    quote: { kind: 'text', label: 'Quote' },
                    backstory: { kind: 'text', label: 'Backstory', long: true },
                    personalGoal: { kind: 'text', label: 'Personal goal' },
                    stats: {
                        kind: 'object', label: 'Statistics', fields: {
                            ac: { kind: 'number', label: 'Armour class' },
                            hp: { kind: 'number', label: 'Hit points' },
                            speed: { kind: 'number', label: 'Speed (ft.)' },
                            str: { kind: 'number', label: 'STR' },
                            dex: { kind: 'number', label: 'DEX' },
                            con: { kind: 'number', label: 'CON' },
                            int: { kind: 'number', label: 'INT' },
                            wis: { kind: 'number', label: 'WIS' },
                            cha: { kind: 'number', label: 'CHA' },
                        }
                    },
                    factions: { kind: 'refs', to: ['faction'], label: 'Factions' },
                    secret: { kind: 'markdown', label: 'Secret (revealed by the password)', private: true },
                    password: { kind: 'text', label: 'Password for the secret', private: true },
                    sealedSecret: { kind: 'sealed', from: 'secret', password: 'password', label: 'Encrypted secret (written by the dashboard)' },
                },
            },

            /*-------------------------------------======= TAVERNS =======-------------------------------------*/
            menuItem: {
                label: 'Menu item', plural: 'Tavern menu pool', icon: 'restaurant', group: 'Taverns',
                file: 'data/menu-items.json',
                fields: {
                    category: { kind: 'enum', enum: 'menuCategory', label: 'Category', required: true },
                    desc: { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true },
                    minTier: { kind: 'enum', enum: 'tavernTier', label: 'Cheapest tavern that serves it', required: true },
                    maxTier: { kind: 'enum', enum: 'tavernTier', label: 'Finest tavern that serves it', required: true },
                    tags: { kind: 'list', label: 'Tags' },
                },
            },
            service: {
                label: 'Tavern service', plural: 'Tavern services', icon: 'bed', group: 'Taverns',
                file: 'data/services.json',
                fields: {
                    desc: { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true },
                    unit: { kind: 'text', label: 'Unit (per night, each…)' },
                },
            },
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);