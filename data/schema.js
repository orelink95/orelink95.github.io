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
date (YYYY-MM-DD) · time (HH:MM, 24 h)
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
                    tavernCode: { kind: 'text', label: 'Market code: tavern menus, shop wares, rumours and blessings are drawn from it, the same for everyone. Change it to change them all.' },
                    currentCampaign: { kind: 'ref', to: ['campaign'], label: 'Campaign shown first (scriptorium, heroes)' },
                },
            },
            /* The "Upcoming Sessions" cards of the homepage (scripts/upcoming-sessions.js). */
            schedule: {
                label: 'Upcoming sessions', icon: 'event_upcoming', group: 'Site',
                file: 'data/schedule.json',
                page: 'index.html',
                fields: {
                    length: { kind: 'number', label: 'Length of a session in hours (“Add to calendar” events; empty = 4)' },
                    sessions: {
                        kind: 'objects', label: 'Sessions, in the order of the homepage (a date that has passed is hidden on its own)',
                        itemLabel: ['campaign', 'title', 'number', 'date'],
                        fields: {
                            campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign' },
                            number: { kind: 'number', label: 'Session number (empty = not shown)' },
                            date: { kind: 'date', label: 'Date (empty = “to be announced”)' },
                            time: { kind: 'time', label: 'Time' },
                            status: { kind: 'enum', enum: 'sessionStatus', label: 'Status (— = confirmed)' },
                            title: { kind: 'text', label: 'Title (instead of the campaign name: one-shot…)' },
                            where: { kind: 'text', label: 'Where (optional extra line: “At Max’s”, “Online”…)' },
                            link: { kind: 'text', label: 'Card link (empty = the campaign in the scriptorium)' },
                            notice: { kind: 'text', label: 'Message on the card (reason, new date…)' },
                        },
                    },
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
            /* Homepage session cards; no status = confirmed */
            sessionStatus: [
                { id: 'tentative', label: 'Not confirmed yet (purple TBD card)' },
                { id: 'postponed', label: 'Postponed (amber, date struck through)' },
                { id: 'cancelled', label: 'Cancelled (red, dimmed)' },
            ],
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
            /* The games of a tavern's gaming table (poi.tavern.games). Each id is a game
               in scripts/games/ (register one there to add a game). */
            tavernGame: [
                { id: 'liars-dice', label: 'Liar’s Dice' },
                { id: 'knucklebones', label: 'Knucklebones' },
            ],
            /* Shops (poi.shop). Goods are sorted in these shelves, in this order. */
            shopCategory: [
                { id: 'gear', label: 'Adventuring Gear' },
                { id: 'provisions', label: 'Provisions' },
                { id: 'bread', label: 'Breads' },
                { id: 'pastries', label: 'Pastries & Cakes' },
                { id: 'sweets', label: 'Sweets & Confections' },
                { id: 'produce', label: 'Fruit & Vegetables' },
                { id: 'meat', label: 'Meat & Charcuterie' },
                { id: 'fish', label: 'Fish & Seafood' },
                { id: 'dairy', label: 'Cheese, Eggs & Dairy' },
                { id: 'pantry', label: 'Spices, Teas & Pantry' },
                { id: 'drink', label: 'Wine, Ale & Spirits' },
                { id: 'clothing', label: 'Clothing & Packs' },
                { id: 'fabrics', label: 'Cloth & Haberdashery' },
                { id: 'footwear', label: 'Boots & Leatherwork' },
                { id: 'jewellery', label: 'Jewellery & Trinkets' },
                { id: 'perfumes', label: 'Perfumes & Toiletries' },
                { id: 'tools', label: 'Tools & Kits' },
                { id: 'weapons', label: 'Weapons' },
                { id: 'ammunition', label: 'Ammunition' },
                { id: 'armour', label: 'Armour & Shields' },
                { id: 'remedies', label: 'Remedies & Potions' },
                { id: 'alchemy', label: 'Alchemical Goods' },
                { id: 'arcane', label: 'Arcane Supplies' },
                { id: 'books', label: 'Books, Maps & Paper' },
                { id: 'household', label: 'Pottery & Household' },
                { id: 'candles', label: 'Candles & Lamps' },
                { id: 'flowers', label: 'Flowers, Plants & Seeds' },
                { id: 'toys', label: 'Toys & Games' },
                { id: 'instruments', label: 'Musical Instruments' },
                { id: 'tobacco', label: 'Pipeweed & Snuff' },
                { id: 'pets', label: 'Pets & Small Beasts' },
                { id: 'curios', label: 'Curios & Antiques' },
                { id: 'funerary', label: 'Funerary Goods' },
                { id: 'mounts', label: 'Mounts & Tack' },
                { id: 'services', label: 'Trades & Services' },
            ],
            /* What a kind of shop sells: its shelves (shopCategory) and the pool tags it leaves
               out (exclude). A shop's own excludeTags are added; a tag in its includeTags is
               let back in. shelfTags narrows one shelf to goods with one of the tags: the
               services shelf of a barber shows only goods tagged barber. */
            shopKind: [
                { id: 'general', label: 'General Store', categories: ['gear', 'provisions', 'clothing', 'tools', 'ammunition', 'household', 'candles'], exclude: ['illicit'] },
                { id: 'market', label: 'Market Stall', categories: ['produce', 'bread', 'meat', 'fish', 'sweets', 'flowers'], exclude: ['illicit'] },
                /* food */
                { id: 'bakery', label: 'Bakery', categories: ['bread', 'pastries'], exclude: ['illicit'] },
                { id: 'patisserie', label: 'Pastry Shop', categories: ['pastries', 'sweets'], exclude: ['illicit'] },
                { id: 'confectioner', label: 'Sweet Shop', categories: ['sweets'], exclude: ['illicit'] },
                { id: 'grocer', label: 'Grocer', categories: ['produce', 'dairy', 'pantry', 'provisions'], exclude: ['illicit'] },
                { id: 'butcher', label: 'Butcher', categories: ['meat'], exclude: ['illicit'] },
                { id: 'fishmonger', label: 'Fishmonger', categories: ['fish'], exclude: ['illicit'] },
                { id: 'cheesemonger', label: 'Cheesemonger', categories: ['dairy', 'drink'], exclude: ['illicit'] },
                { id: 'spicer', label: 'Spice & Tea Merchant', categories: ['pantry'], exclude: ['illicit'] },
                { id: 'vintner', label: 'Wine & Spirits Merchant', categories: ['drink'], exclude: ['illicit'] },
                /* clothes and finery */
                { id: 'outfitter', label: 'Tailor & Outfitter', categories: ['clothing', 'fabrics', 'services'], shelfTags: { services: ['tailor'] }, exclude: ['illicit'] },
                { id: 'draper', label: 'Draper & Haberdasher', categories: ['fabrics'], exclude: ['illicit'] },
                { id: 'cobbler', label: 'Cobbler & Leatherworker', categories: ['footwear', 'services'], shelfTags: { services: ['cobbler'] }, exclude: ['illicit'] },
                { id: 'jeweller', label: 'Jeweller', categories: ['jewellery', 'services'], shelfTags: { services: ['jeweller'] }, exclude: ['illicit'] },
                { id: 'perfumer', label: 'Perfumer', categories: ['perfumes'], exclude: ['illicit'] },
                { id: 'barber', label: 'Barber-Surgeon', categories: ['services', 'perfumes'], shelfTags: { services: ['barber'] }, exclude: ['illicit'] },
                /* arms and gear */
                { id: 'smith', label: 'Smithy & Armoury', categories: ['weapons', 'ammunition', 'armour', 'tools', 'services'], shelfTags: { services: ['smith'] }, exclude: ['illicit'] },
                { id: 'bowyer', label: 'Bowyer & Fletcher', categories: ['weapons', 'ammunition'], shelfTags: { weapons: ['bow'] }, exclude: ['illicit'] },
                { id: 'stable', label: 'Stable & Saddler', categories: ['mounts', 'provisions', 'services'], shelfTags: { services: ['stable'] }, exclude: ['illicit'] },
                /* craft and home */
                { id: 'potter', label: 'Potter & Housewares', categories: ['household'], exclude: ['illicit'] },
                { id: 'chandler', label: 'Chandler', categories: ['candles', 'gear'], exclude: ['illicit'] },
                { id: 'florist', label: 'Florist & Seedsman', categories: ['flowers'], exclude: ['illicit'] },
                { id: 'toymaker', label: 'Toymaker', categories: ['toys'], exclude: ['illicit'] },
                { id: 'luthier', label: 'Instrument Maker', categories: ['instruments', 'services'], shelfTags: { services: ['luthier'] }, exclude: ['illicit'] },
                { id: 'tobacconist', label: 'Tobacconist', categories: ['tobacco'], exclude: ['illicit'] },
                { id: 'menagerie', label: 'Pet Shop & Menagerie', categories: ['pets'], exclude: ['illicit'] },
                /* learning and magic */
                { id: 'alchemist', label: 'Alchemist & Apothecary', categories: ['remedies', 'alchemy'], exclude: ['illicit'] },
                { id: 'arcane', label: 'Arcane Emporium', categories: ['arcane', 'books', 'remedies'], exclude: ['illicit'] },
                { id: 'scribe', label: 'Scribe & Bookseller', categories: ['books', 'arcane', 'services'], shelfTags: { services: ['scribe'] }, exclude: ['illicit'] },
                { id: 'curios', label: 'Curiosity Shop & Antiques', categories: ['curios', 'jewellery', 'books'], exclude: ['illicit'] },
                /* the rest */
                { id: 'undertaker', label: 'Undertaker', categories: ['funerary', 'services'], shelfTags: { services: ['undertaker'] }, exclude: ['illicit'] },
                { id: 'fence', label: 'Fence', categories: ['gear', 'tools', 'weapons', 'alchemy', 'jewellery', 'curios'] },
            ],
            /* Temples (poi.temple): kinds of service, in this order */
            templeCategory: [
                { id: 'healing', label: 'Healing' },
                { id: 'restoration', label: 'Restoration' },
                { id: 'divination', label: 'Divination' },
                { id: 'rites', label: 'Rites & Ceremonies' },
                { id: 'offerings', label: 'Offerings' },
            ],
            /* Rumours: DM only (data/private.json) */
            rumourTruth: [
                { id: 'true', label: 'True' },
                { id: 'partly', label: 'Partly true' },
                { id: 'false', label: 'False' },
            ],
            /* Notice board posts */
            noticeKind: [
                { id: 'job', label: 'Job' },
                { id: 'bounty', label: 'Bounty' },
                { id: 'wanted', label: 'Wanted' },
                { id: 'announcement', label: 'Announcement' },
                { id: 'personal', label: 'Personal' },
            ],
            noticeStatus: [
                { id: 'open', label: 'Open' },
                { id: 'taken', label: 'Taken (by the party or someone else)' },
                { id: 'done', label: 'Done / closed' },
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
                    image: { kind: 'image', label: 'Card image (Continents list; the map is used if empty)' },
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
                    unlisted: { kind: 'boolean', label: 'Hide from the country list of the continent page and from the Countries page (the map pin stays)' },
                    image: { kind: 'image', label: 'Card image (Countries list; the map is used if empty)' },
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
                    image: { kind: 'image', label: 'Card image (Settlements list; the first district map is used if empty)' },
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
                        help: 'Fill this in to give the POI a tavern page with a seeded menu.',
                        fields: {
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Quality tier', required: true },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Innkeeper(s), shown on the Fare tab (any NPC; the people of the POI are listed apart)' },
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
                            rumourDraws: { kind: 'number', label: 'Rumours a player can hear per market code (empty = 3; 0 = no Rumours tab)' },
                            games: { kind: 'list', enum: 'tavernGame', label: 'Gaming table: games played here (adds a Games tab, against the regulars)' },
                        },
                    },
                    /* A POI can be a tavern AND a shop AND a temple: each block adds its tab to the page. */
                    shop: {
                        kind: 'object', label: 'Shop', optional: true,
                        help: 'Fill this in to give the POI a Wares tab, drawn from the shop goods pool by the market code.',
                        fields: {
                            kind: { kind: 'enum', enum: 'shopKind', label: 'Kind of shop (sets the shelves)', required: true },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Shopkeeper(s), shown on the Wares tab (any NPC; the people of the POI are listed apart)' },
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Quality tier (empty = the tavern’s, else Modest)' },
                            hours: { kind: 'text', label: 'Opening hours (empty = the tavern’s)' },
                            picks: { kind: 'number', label: 'Random goods per shelf (empty = 5)' },
                            categories: { kind: 'list', enum: 'shopCategory', label: 'Shelves, instead of the kind’s (none ticked: the kind’s)' },
                            markup: { kind: 'number', label: 'Price level in % (empty = 100; 80 = cheap, 130 = gouging)' },
                            includeTags: { kind: 'list', label: 'Only pool goods with one of these tags' },
                            excludeTags: { kind: 'list', label: 'Never pool goods with these tags' },
                            signature: {
                                kind: 'objects', label: 'Signature wares (always in stock)', itemLabel: 'name', fields: {
                                    category: { kind: 'enum', enum: 'shopCategory', label: 'Shelf' },
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp, as written)' },
                                    unit: { kind: 'text', label: 'Unit' },
                                }
                            },
                        },
                    },
                    temple: {
                        kind: 'object', label: 'Temple / shrine', optional: true,
                        help: 'Fill this in to give the POI a Shrine tab: services, offerings and a prayer that draws a blessing.',
                        fields: {
                            deities: { kind: 'refs', to: ['deity'], label: 'Deities worshipped here' },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Priest(s) in charge, shown on the Shrine tab (any NPC; the people of the POI are listed apart)' },
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Wealth of the temple (prices; empty = Modest)' },
                            hours: { kind: 'text', label: 'Hours of worship' },
                            services: { kind: 'refs', to: ['templeService'], label: 'Services from the catalogue' },
                            customServices: {
                                kind: 'objects', label: 'Services of this temple only', itemLabel: 'name', fields: {
                                    category: { kind: 'enum', enum: 'templeCategory', label: 'Kind' },
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp, as written; empty = a donation)' },
                                    unit: { kind: 'text', label: 'Unit' },
                                }
                            },
                            noPrayer: { kind: 'boolean', label: 'No prayer button (no blessing drawn here)' },
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
                    /* Campaigns the NPC belongs to, with the party's relation in each.
                       None listed = the NPC is part of every campaign, with "relation" below. */
                    campaigns: {
                        kind: 'objects', label: 'Campaigns (none: every campaign)', itemLabel: ['campaign', 'relation'], fields: {
                            campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign', required: true },
                            relation: { kind: 'enum', enum: 'relation', label: 'Relation to the party in this campaign' },
                        }
                    },
                    relation: { kind: 'enum', enum: 'relation', label: 'Relation to the party (only when no campaign is listed above)' },
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
                    status: { kind: 'enum', enum: 'factionStatus', label: "Standing with the party (only when no campaign lists this faction in its standings)" },
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
                        kind: 'objects', label: 'Party allegiances: the factions of this campaign (a faction listed in no campaign is in all of them)', itemLabel: ['faction', 'status'], fields: {
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

            /*-------------------------------------======= MARKETS =======-------------------------------------*/
            /* Taverns, shops and temples are POIs with a tavern / shop / temple block.
               These are the shared pools and catalogues they draw from. */
            menuItem: {
                label: 'Menu item', plural: 'Tavern menu pool', icon: 'restaurant', group: 'Markets',
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
                label: 'Tavern service', plural: 'Tavern services', icon: 'bed', group: 'Markets',
                file: 'data/services.json',
                fields: {
                    desc: { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true },
                    unit: { kind: 'text', label: 'Unit (per night, each…)' },
                },
            },
            /* The shared shop pool: a shop shows N seeded goods per shelf, among those its
               kind, tier and tags allow (price = basePrice x tier multiplier x markup). */
            shopGood: {
                label: 'Shop good', plural: 'Shop goods pool', icon: 'storefront', group: 'Markets',
                file: 'data/shop-goods.json',
                fields: {
                    category: { kind: 'enum', enum: 'shopCategory', label: 'Shelf', required: true },
                    desc: { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true },
                    unit: { kind: 'text', label: 'Unit (each, 50 ft, 20 arrows…)' },
                    minTier: { kind: 'enum', enum: 'tavernTier', label: 'Cheapest shop that stocks it', required: true },
                    maxTier: { kind: 'enum', enum: 'tavernTier', label: 'Finest shop that stocks it', required: true },
                    tags: { kind: 'list', label: 'Tags (illicit = only fences sell it)' },
                },
            },

            /*-------------------------------------======= FAITH =======-------------------------------------*/
            deity: {
                label: 'Deity', plural: 'Pantheon', icon: 'brightness_7', group: 'Faith',
                file: 'data/deities.json',
                page: 'pantheon.html?id={id}',
                autolink: true,
                fields: {
                    epithet: { kind: 'text', label: 'Epithet (The Lady of Ashes…)' },
                    summary: { kind: 'text', label: 'One-line summary (card and keyword tooltips)', long: true },
                    domains: { kind: 'list', label: 'Domains / portfolio' },
                    alignment: { kind: 'text', label: 'Alignment' },
                    symbol: { kind: 'image', label: 'Holy symbol (image)' },
                    symbolText: { kind: 'text', label: 'Holy symbol (description)' },
                    icon: { kind: 'text', label: 'Icon when there is no image (Material Symbols name)' },
                    colour: { kind: 'text', label: 'Colour of the card (CSS colour, e.g. #e9c176)' },
                    worshippers: { kind: 'text', label: 'Typical worshippers', long: true },
                    body: { kind: 'markdown', label: 'Lore' },
                },
            },
            templeService: {
                label: 'Temple service', plural: 'Temple services', icon: 'healing', group: 'Faith',
                file: 'data/temple-services.json',
                fields: {
                    category: { kind: 'enum', enum: 'templeCategory', label: 'Kind', required: true },
                    desc: { kind: 'text', label: 'Description' },
                    basePrice: { kind: 'number', label: 'Base price (cp; x the temple’s tier)', required: true },
                    unit: { kind: 'text', label: 'Unit (per casting, each…)' },
                },
            },
            /* What "Pray" at a temple can grant: drawn once per market code, per browser. */
            blessing: {
                label: 'Blessing', plural: 'Blessings', icon: 'volunteer_activism', group: 'Faith',
                file: 'data/blessings.json',
                fields: {
                    text: { kind: 'text', label: 'What the worshipper feels or sees (shown to the player)', long: true, required: true },
                    effect: { kind: 'text', label: 'Effect in play (optional; shown under the text)' },
                    deities: { kind: 'refs', to: ['deity'], label: 'Only at the temples of these deities (none: any temple)' },
                },
            },

            /*-------------------------------------======= TOWN LIFE =======-------------------------------------*/
            /* Heard in every tavern at or under `where`: a settlement's rumour is heard in
               all its taverns, a POI's only there. Players draw them by buying a round. */
            rumour: {
                label: 'Rumour', plural: 'Rumours', icon: 'record_voice_over', group: 'Town life',
                file: 'data/rumours.json',
                fields: {
                    where: { kind: 'ref', to: ['poi', 'district', 'settlement', 'country', 'continent'], label: 'Heard in the taverns of', required: true },
                    campaigns: { kind: 'refs', to: ['campaign'], label: 'Campaigns (none: every campaign)' },
                    text: { kind: 'text', label: 'The rumour, as the players hear it', long: true, required: true },
                    source: { kind: 'text', label: 'Who tells it (a drunk sailor, the barmaid…)' },
                    truth: { kind: 'enum', enum: 'rumourTruth', label: 'Truth (DM only)', private: true },
                    note: { kind: 'text', label: 'DM note', long: true, private: true },
                },
            },
            /* A post on a notice board: the settlement's (town board) or a POI's. */
            notice: {
                label: 'Notice', plural: 'Notice boards', icon: 'push_pin', group: 'Town life',
                file: 'data/notices.json',
                fields: {
                    where: { kind: 'ref', to: ['settlement', 'poi'], label: 'Pinned on the board of', required: true },
                    campaigns: { kind: 'refs', to: ['campaign'], label: 'Campaigns (none: every campaign)' },
                    kind: { kind: 'enum', enum: 'noticeKind', label: 'Kind', required: true },
                    status: { kind: 'enum', enum: 'noticeStatus', label: 'Status (empty = open)' },
                    body: { kind: 'markdown', label: 'Text of the notice' },
                    reward: { kind: 'text', label: 'Reward / pay' },
                    issuer: { kind: 'ref', to: ['npc', 'faction', 'poi', 'deity'], label: 'Posted by' },
                    issuerText: { kind: 'text', label: 'Posted by (when not on the site, or a signature)' },
                    posted: { kind: 'text', label: 'Posted on (in-world date)' },
                    image: { kind: 'image', label: 'Picture (wanted posters…)' },
                },
            },
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);