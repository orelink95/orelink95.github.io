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
- The order of the fields here is the order of the keys in the JSON files: add new fields at the end of a type to keep the files' diffs small.

※ FIELD KINDS ※
text · markdown · number · boolean · image · url · list (of strings)
date (YYYY-MM-DD) · time (HH:MM, 24 h)
enum (options | enum: '<name of a shared enum below>')
ref / refs (to: [types]) · map ({x, y, icon, layer, on}) · mapImage
object (fields) · objects (array; fields) · json (free-form, raw)

※ DASHBOARD ONLY (the site and the validator ignore these) ※
label     short name of the field (keep it under ~30 characters)
help      the explanation, shown under the field
section   the card the field sits in; a type lists its cards, in order, in `sections`
          (no section = the first card)
width     'quarter' | 'third' | 'half' | 'full' (default: set by the kind)
showIf    { key, is: [values] } | { key, set: true } | { key, empty: true } — shown only when the
          sibling field `key` has one of these values / has a value / has none. Hidden fields keep their value.
lines     list: one item per line in a text box, instead of tags
color     text: adds a colour picker            icon  text: Material Symbols name, previewed
focus     text: a CSS position ("50% 30%") set with two sliders
range     number: [min, max] adds a slider       choices  number: [[value, label], …] as a menu
layers    map: offers the world map's layer (continents only)
noPin     help shown instead of the pin when the parent has no map of its own

※ TYPE OPTIONS ※
order  { by, desc, within }  store.all(type) returns the records sorted by `by` (descending if `desc`), grouped by `within` if given;
records missing `by` come last. Otherwise: file order.
sealed  text encrypted with a password ({v, salt, iv, data}); the dashboard writes it from a private plain-text field (`from`) and a private password field (`password`)
=========================================================================== */

(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const TOOLTIP_HELP = 'Hover text when the name appears in a session transcript.';
    const PLACE_FIELDS = {
        subtitle: { kind: 'text', label: 'Subtitle', help: 'Under the name: map pop-ups, list cards and the page header.' },
        codex: { kind: 'text', label: 'Lore panel caption', section: 'Lore', help: 'Small capitals above the lore title (empty = “Codex Entry”).' },
        summary: { kind: 'text', label: 'One-line summary', long: true, help: TOOLTIP_HELP },
        body: { kind: 'markdown', label: 'Lore', section: 'Lore' },
        danger: { kind: 'boolean', label: 'Dangerous place', help: 'Red pin and a “Danger” tag.' },
    };
    /* The look of ONE page (record.look): a theme of the type plus tweaks that win over it.
       styles/looks.css holds the themes, textures and frames; scripts/core/look.js applies them. */
    const lookField = (themeEnum, withCard) => ({
        kind: 'object', label: 'Look of this page', optional: true, section: 'Look',
        help: 'Changes this one page. Pick a theme, then change any part of it below (an empty field keeps the theme’s, or the site’s).',
        fields: {
            theme: { kind: 'enum', enum: themeEnum, label: 'Theme', width: 'full', help: 'Empty = the site’s usual look. Themes are in styles/looks.css.' },
            accent: { kind: 'text', color: true, label: 'Accent', width: 'third', help: 'Titles, links, rules, prices.' },
            ink: { kind: 'text', color: true, label: 'Text', width: 'third' },
            panel: { kind: 'text', color: true, label: 'Boxes', width: 'third', help: 'Background of the panels.' },
            ...(withCard ? { card: { kind: 'text', color: true, label: 'Tabbed card', width: 'third', help: 'Menu, wares, map…' } } : {}),
            page: { kind: 'text', color: true, label: 'Page background', width: 'third' },
            ...(withCard ? {} : {
                tag: { kind: 'text', color: true, label: 'Tags', width: 'third', help: 'Background of the tags on the picture.' },
                tagInk: { kind: 'text', color: true, label: 'Tag text', width: 'third' },
            }),
            texture: { kind: 'enum', enum: 'lookTexture', label: 'Texture', width: 'third', help: 'Over the page background. Empty = the theme’s.' },
            textureImage: { kind: 'image', label: 'Texture image', showIf: { key: 'texture', is: ['image'] }, help: 'Tiled over the page. A small seamless image works best.' },
            textureStrength: { kind: 'number', label: 'Texture strength (%)', width: 'full', range: [0, 100], help: 'Empty = the theme’s (about 20).' },
            titleFont: { kind: 'enum', enum: 'lookFont', label: 'Font of the titles', width: 'half', help: 'The name and the headings.' },
            bodyFont: { kind: 'enum', enum: 'lookFont', label: 'Font of the lore & subtitle', width: 'half', help: 'Long text: keep a plain one.' },
            frame: { kind: 'enum', enum: 'lookFrame', label: 'Frame of the boxes', width: 'half', help: 'Empty = the theme’s.' },
            banner: { kind: 'image', label: 'Banner', help: 'A wide picture fading out behind the top of the page.' },
            bannerFocus: { kind: 'text', focus: true, label: 'Banner focus', showIf: { key: 'banner', set: true }, help: 'The part of the picture kept when it is cropped.' },
            bannerStrength: { kind: 'number', label: 'Banner strength (%)', range: [0, 100], showIf: { key: 'banner', set: true }, help: 'Empty = 45.' },
            ...(withCard ? { inherit: { kind: 'boolean', label: 'Also for the places inside', help: 'The POIs that sit in this one (and in those) take this whole look, unless they have a look of their own.' } } : {}),
        },
    });
    const PIN_HELP = 'Settlements have no map of their own (their maps are their districts’): put the place in a district to pin it.';

    ATH.schema = {
        version: 1,

        /* One-object files (not lists of records). The store exposes them as store.world and store.settings. */
        singletons: {
            /* The world map is the root every continent is pinned on. */
            world: {
                label: 'World', icon: 'travel_explore', group: 'Site',
                file: 'data/world.json',
                page: 'world.html',
                sections: ['Essentials', 'Lore', 'Map'],
                fields: {
                    name: { kind: 'text', label: 'Name', required: true },
                    codex: { kind: 'text', label: 'Lore panel caption', section: 'Lore', help: 'Small capitals above the lore title (empty = “Codex Entry”).' },
                    loreTitle: { kind: 'text', label: 'Lore title', section: 'Lore', help: 'Empty = the name.' },
                    body: { kind: 'markdown', label: 'Lore', section: 'Lore', help: 'Shown when no pin is selected.' },
                    mapImage: { kind: 'mapImage', label: 'World map', required: true, section: 'Map' },
                },
            },
            /* Site-wide settings. */
            settings: {
                label: 'Settings', icon: 'tune', group: 'Site',
                file: 'data/settings.json',
                fields: {
                    tavernCode: { kind: 'text', label: 'Market code', help: 'Tavern menus, shop wares, the order of rumours and the blessings are drawn from it, the same for every player. Change it to change them all.' },
                    startingPurse: { kind: 'number', label: 'Gaming purse (cp)', help: 'What every player starts with at the gaming tables (1 gp = 10 sp = 100 cp). Empty = 500 cp. The purse is kept in each player’s browser; changing this number gives everyone a fresh purse.' },
                    loanInterest: { kind: 'number', label: 'House loan interest (%)', help: 'A player who can’t cover the lowest blind borrows a starting purse from the house and owes it back with this interest; half of every win goes to the loan until it is repaid. Empty = 10. 0 = no loan: a free fresh purse instead.' },
                    currentCampaign: { kind: 'ref', to: ['campaign'], label: 'Current campaign', help: 'What every campaign drop-down opens on (NPCs, Heroes, Factions, Pantheon, boards, scriptorium) and which Elder gods are sealed by default. In the dashboard: the ✓ of rumour lists and the campaign of new rumours and notices.' },
                },
            },
            /* The "Upcoming Sessions" cards of the homepage (scripts/upcoming-sessions.js). */
            schedule: {
                label: 'Upcoming sessions', icon: 'event_upcoming', group: 'Site',
                file: 'data/schedule.json',
                page: 'index.html',
                sections: ['Homepage cards'],
                fields: {
                    length: { kind: 'number', label: 'Session length (hours)', help: 'For the “Add to calendar” events. Empty = 4.' },
                    sessions: {
                        kind: 'objects', label: 'Sessions', help: 'In the order of the homepage. A date that has passed is hidden on its own.',
                        itemLabel: ['campaign', 'title', 'number', 'date'],
                        fields: {
                            campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign' },
                            number: { kind: 'number', label: 'Session number', help: 'Empty = not shown.' },
                            date: { kind: 'date', label: 'Date', help: 'Empty = “to be announced”.' },
                            time: { kind: 'time', label: 'Time' },
                            status: { kind: 'enum', enum: 'sessionStatus', label: 'Status', help: '— = confirmed.' },
                            title: { kind: 'text', label: 'Title', help: 'Instead of the campaign name (one-shot…).' },
                            where: { kind: 'text', label: 'Where', help: 'Optional extra line: “At Max’s”, “Online”…' },
                            link: { kind: 'text', label: 'Card link', help: 'Empty = the campaign in the scriptorium.' },
                            notice: { kind: 'text', label: 'Message on the card', help: 'Reason, new date…', width: 'full' },
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
            /* Faction evidence cards (factions-script.js) and their tags (.tag--<tone> in pages/factions.css) */
            intelKind: [
                { id: 'note', label: 'Sealed note' },
                { id: 'map', label: 'Map' },
                { id: 'target', label: 'Target profile' },
            ],
            tagTone: ['gold', 'blue', 'green', 'red', 'ally', 'hostile', 'killed'],
            /* Homepage session cards; no status = confirmed */
            sessionStatus: [
                { id: 'tentative', label: 'Not confirmed yet (purple TBD card)' },
                { id: 'postponed', label: 'Postponed (amber, date struck through)' },
                { id: 'cancelled', label: 'Cancelled (red, dimmed)' },
            ],
            /* The Pantheon's sections, in page order (scripts/deity-card.js draws one frame per tier) */
            deityTier: [
                { id: 'creator', label: 'The Creators' },
                { id: 'great', label: 'The Great Pantheon' },
                { id: 'minor', label: 'Minor Gods' },
                { id: 'primordial', label: 'Primordials' },
                { id: 'elder', label: 'Elder Gods' },
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
                { id: 'crown-and-dagger', label: 'Crown and dagger' }
            ],
            /* The stakes a player can sit down at (gaming table). `blind` is what each seat puts in the
               pot per hand, in cp, at a Modest tavern: the tavern's tier multiplier (tavernTier) scales it.
               A tavern can drop the lowest ones (minStake) and lock the highest (highTableWins). */
            gameStakes: [
                { id: 'low', label: 'Low stakes', blind: 5 },
                { id: 'standard', label: 'Standard stakes', blind: 10 },
                { id: 'high', label: 'High stakes', blind: 50 }
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
            /* Institutions (poi.institution): large places with maps of their own, key
               locations (POIs whose parent is the institution) and people in groups.
               label = the page's eyebrow; map / places / people = the headings of the
               Map, Locations and People tabs; cta = the button in a map pop-up.
               Each kind has its own card colours in styles/poi-style.css
               (.poi-ledger--inst-<id>); a new kind without them takes the generic look. */
            institutionKind: [
                { id: 'university', label: 'University', map: 'Plan of the Grounds', places: 'Halls & Colleges', people: 'Masters & Scholars', cta: 'Visit the university' },
                { id: 'library', label: 'Library', map: 'Plan of the Stacks', places: 'Wings & Reading Rooms', people: 'Keepers & Scholars', cta: 'Visit the library' },
                { id: 'institution', label: 'Institution', map: 'Plan of the Grounds', places: 'Places Within', people: 'Who’s Who', cta: 'Visit the place' },
            ],
            /* Page looks (record.look; styles/looks.css). One set of themes per type:
               each id is a .look--poi-<id> / .look--creature-<id> rule in styles/looks.css. */
            poiTheme: [
                { id: 'hearth', label: 'Hearth & Timber (amber, oak)' },
                { id: 'sanctum', label: 'Sanctum (pale gold, marble)' },
                { id: 'haunted', label: 'Haunted (cold teal, fog)' },
                { id: 'arcane', label: 'Arcane (violet, stars)' },
                { id: 'sylvan', label: 'Sylvan (moss green)' },
                { id: 'frost', label: 'Frostbound (ice blue)' },
                { id: 'infernal', label: 'Infernal (embers, iron)' },
                { id: 'den', label: 'Shadowed Den (tarnished brass)' },
                { id: 'ruins', label: 'Ruins (weathered stone, lichen)' },
            ],
            creatureTheme: [
                { id: 'abyssal', label: 'Abyssal (deep sea, scales)' },
                { id: 'blighted', label: 'Blighted (sickly green)' },
                { id: 'infernal', label: 'Infernal (hellfire)' },
                { id: 'fey', label: 'Fey (rose, twilight)' },
                { id: 'void', label: 'Voidborn (violet)' },
                { id: 'frost', label: 'Frost (rime, pale blue)' },
                { id: 'bone', label: 'Ossuary (bone, ivory)' },
                { id: 'draconic', label: 'Draconic (molten gold)' },
                { id: 'ruins', label: 'Ruins (moss on fallen stone)' },
                { id: 'celestial', label: 'Celestial (radiant gold, starlight)' },
            ],
            /* .look-texture--<id> in styles/looks.css; 'image' = the page's texture image */
            lookTexture: [
                { id: 'none', label: 'None (removes the theme’s)' },
                { id: 'grain', label: 'Parchment grain' },
                { id: 'stone', label: 'Stone' },
                { id: 'wood', label: 'Wood grain' },
                { id: 'smoke', label: 'Smoke / fog' },
                { id: 'linen', label: 'Linen' },
                { id: 'grid', label: 'Drafting grid' },
                { id: 'stars', label: 'Stars' },
                { id: 'scales', label: 'Scales' },
                { id: 'image', label: 'An image…' },
            ],
            /* .look-frame--<id> in styles/looks.css */
            lookFrame: [
                { id: 'none', label: 'None (flat)' },
                { id: 'gilt', label: 'Gilt rule' },
                { id: 'double', label: 'Double rule' },
                { id: 'filigree', label: 'Filigree corners' },
                { id: 'ornate', label: 'Ornate (double rule + corners)' },
                { id: 'iron', label: 'Iron & rivets' },
                { id: 'runic', label: 'Runic glow' },
            ],
            /* Fonts a look can use, fetched from Google Fonts only on the pages that use them.
               id = the font's name; google = its "family=" parameter. */
            lookFont: [
                { id: 'Cinzel', label: 'Cinzel (Roman capitals)', google: 'Cinzel:wght@400;700' },
                { id: 'Cinzel Decorative', label: 'Cinzel Decorative (titles only)', google: 'Cinzel+Decorative:wght@400;700' },
                { id: 'Cormorant Garamond', label: 'Cormorant Garamond (elegant serif)', google: 'Cormorant+Garamond:ital,wght@0,400;0,700;1,400' },
                { id: 'EB Garamond', label: 'EB Garamond (book serif)', google: 'EB+Garamond:ital,wght@0,400;0,700;1,400' },
                { id: 'Spectral', label: 'Spectral (readable serif)', google: 'Spectral:ital,wght@0,400;0,700;1,400' },
                { id: 'IM Fell English', label: 'IM Fell English (old print)', google: 'IM+Fell+English:ital@0;1' },
                { id: 'Almendra', label: 'Almendra (calligraphic)', google: 'Almendra:ital,wght@0,400;0,700;1,400' },
                { id: 'Marcellus', label: 'Marcellus (carved)', google: 'Marcellus' },
                { id: 'Uncial Antiqua', label: 'Uncial Antiqua (uncial, titles only)', google: 'Uncial+Antiqua' },
                { id: 'MedievalSharp', label: 'MedievalSharp (titles only)', google: 'MedievalSharp' },
                { id: 'Metamorphous', label: 'Metamorphous (titles only)', google: 'Metamorphous' },
                { id: 'Pirata One', label: 'Pirata One (blackletter, titles only)', google: 'Pirata+One' },
                { id: 'Grenze Gotisch', label: 'Grenze Gotisch (gothic, titles only)', google: 'Grenze+Gotisch:wght@400;700' },
                { id: 'UnifrakturCook', label: 'UnifrakturCook (fraktur, titles only)', google: 'UnifrakturCook:wght@700' },
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
            /* Divination (poi.divination): how a practice answers */
            divinationMethod: [
                { id: 'cards', label: 'Cards (drawn from a deck, laid in a spread)' },
                { id: 'omen', label: 'Omen (one sign drawn from its own pool)' },
            ],
            /* How a spread lays its cards: a row (wraps on phones), or a cross of five
               (1 centre, 2 left, 3 right, 4 above, 5 below; any other count = a row) */
            spreadLayout: [
                { id: 'row', label: 'Row' },
                { id: 'cross', label: 'Cross (five cards)' },
            ],
        },

        types: {
            /*-------------------------------------======= PLACES =======-------------------------------------*/
            continent: {
                label: 'Continent', plural: 'Continents', icon: 'public', group: 'Places',
                file: 'data/continents.json',
                page: 'continent.html?id={id}',
                place: true, parent: [], autolink: true,
                sections: ['Essentials', 'Lore', 'Map', 'On the page'],
                fields: {
                    ...PLACE_FIELDS,
                    subtitle: { ...PLACE_FIELDS.subtitle, help: 'Under the name: world map pop-up, Continents list, page header.' },
                    era: { kind: 'text', label: 'Era', help: 'Next to the subtitle in the header (e.g. Year 1466 LF).' },
                    image: { kind: 'image', label: 'Card image', help: 'Continents list. Empty = the map.' },
                    map: { kind: 'map', label: 'Pin on the world map', section: 'Map', layers: true },
                    mapImage: { kind: 'mapImage', label: 'Continent map', section: 'Map' },
                    facts: {
                        kind: 'objects', label: 'Info cards under the map', itemLabel: 'title', section: 'On the page', fields: {
                            title: { kind: 'text', label: 'Title' },
                            text: { kind: 'text', label: 'Text', long: true },
                        }
                    },
                    notables: { kind: 'refs', to: ['npc'], label: 'Very important people', section: 'On the page' },
                    epigraph: { kind: 'text', label: 'Epigraph', long: true, section: 'On the page' },
                    epigraphSource: { kind: 'text', label: 'Epigraph source', section: 'On the page' },
                },
            },
            country: {
                label: 'Country', plural: 'Countries', icon: 'flag', group: 'Places',
                file: 'data/countries.json',
                page: 'country.html?id={id}',
                place: true, parent: ['continent'], autolink: true,
                sections: ['Essentials', 'Lore', 'Map'],
                fields: {
                    ...PLACE_FIELDS,
                    summary: { ...PLACE_FIELDS.summary, help: 'The line under the page title (else the subtitle). ' + TOOLTIP_HELP },
                    shortName: { kind: 'text', label: 'Short name', help: 'Map labels.' },
                    epithet: { kind: 'text', label: 'Epithet', help: 'Nations list of the continent page, Countries list.' },
                    unlisted: { kind: 'boolean', label: 'Unlisted', help: 'Left out of the continent’s nations and the Countries page; the map pin stays.' },
                    image: { kind: 'image', label: 'Card image', help: 'Countries list. Empty = the map.' },
                    loreTitle: { kind: 'text', label: 'Lore title', section: 'Lore', help: 'Empty = the name.' },
                    map: { kind: 'map', label: 'Pin on the continent map', section: 'Map' },
                    mapImage: { kind: 'mapImage', label: 'Country map', section: 'Map' },
                },
            },
            settlement: {
                label: 'Settlement', plural: 'Settlements', icon: 'location_city', group: 'Places',
                file: 'data/settlements.json',
                page: 'settlement.html?id={id}',
                place: true, parent: ['country'], autolink: true,
                sections: ['Essentials', 'Lore', 'Map'],
                fields: {
                    ...PLACE_FIELDS,
                    codex: { ...PLACE_FIELDS.codex, help: 'Small capitals above the lore title (empty = “Town Charter”). A selected district shows its own.' },
                    summary: { ...PLACE_FIELDS.summary, help: 'The line under the page title. ' + TOOLTIP_HELP },
                    map: { kind: 'map', label: 'Pin on the country map', section: 'Map', help: 'The settlement’s own maps are its districts’.' },
                    image: { kind: 'image', label: 'Card image', help: 'Settlements list. Empty = the first district map.' },
                },
            },
            district: {
                label: 'District', plural: 'Districts', icon: 'holiday_village', group: 'Places',
                file: 'data/districts.json',
                page: 'settlement.html?id={parent}&district={id}',
                place: true, parent: ['settlement'], autolink: true,
                sections: ['Essentials', 'Lore', 'Map'],
                fields: {
                    shortName: { kind: 'text', label: 'Short name', help: 'The district buttons of the settlement page.' },
                    codex: { ...PLACE_FIELDS.codex, help: 'Small capitals above the lore title when the district is selected (empty = the settlement’s).' },
                    summary: PLACE_FIELDS.summary,
                    body: { ...PLACE_FIELDS.body, help: 'Shown under the settlement’s lore, with the district’s name as heading.' },
                    mapImage: { kind: 'mapImage', label: 'District map', section: 'Map' },
                },
            },
            poi: {
                label: 'Point of interest', plural: 'Points of interest', icon: 'location_on', group: 'Places',
                file: 'data/pois.json',
                page: 'poi.html?id={id}',
                /* parent 'poi': a key location inside an institution (a hall of the university),
                   pinned on one of the institution's own maps (map.on = that map's id). */
                place: true, parent: ['district', 'settlement', 'country', 'poi'], autolink: true,
                sections: ['Essentials', 'Lore', 'Map', 'Institution', 'Tavern', 'Shop', 'Temple', 'Divination', 'Look'],
                fields: {
                    ...PLACE_FIELDS,
                    subtitle: { ...PLACE_FIELDS.subtitle, help: 'Under the name: page header, map pop-up, POIs list.' },
                    codex: { ...PLACE_FIELDS.codex, help: 'Small capitals above the lore panel when its pin is clicked on a map.' },
                    danger: { ...PLACE_FIELDS.danger, help: 'Red pin, red page and a “Danger” tag.' },
                    image: { kind: 'image', label: 'Picture', help: 'Page header and POIs list card.' },
                    typeLabel: { kind: 'text', label: 'Type label', help: 'Small capitals above the name on the page (e.g. “Ruins”, “Monument”, “Battlefield”). Only used when the place is not an institution, tavern, shop or temple, which name themselves. Empty = no label.' },
                    featured: { kind: 'boolean', label: 'Featured landmark', help: '“Featured” tag in the POIs list.' },
                    safe: { kind: 'boolean', label: 'Safe haven', help: '“Safe” tag in the POIs list.' },
                    map: { kind: 'map', label: 'Pin on the parent map', section: 'Map', noPin: PIN_HELP, help: 'Inside an institution: choose which of its maps the pin is on.' },
                    tavern: {
                        kind: 'object', label: 'Tavern', optional: true, section: 'Tavern',
                        help: 'Gives the page a Fare tab (seeded menu and services), plus Rumours and Games tabs when they apply.',
                        fields: {
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Quality tier', required: true, help: 'Sets the prices and what the pool may serve.' },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Behind the bar', help: 'Shown on the Fare tab. Any NPC; the people who live here are listed apart.' },
                            hours: { kind: 'text', label: 'Opening hours' },
                            picks: {
                                kind: 'object', label: 'Random dishes per category', help: 'Drawn from the tavern menu pool with the market code. Empty = none.', fields: {
                                    drinks: { kind: 'number', label: 'Drinks' },
                                    meals: { kind: 'number', label: 'Hearty fare' },
                                    bites: { kind: 'number', label: 'Small plates' },
                                }
                            },
                            includeTags: { kind: 'list', label: 'Only pool items tagged', help: 'Empty = any tag.' },
                            excludeTags: { kind: 'list', label: 'Never pool items tagged' },
                            signature: {
                                kind: 'objects', label: 'Signature items', help: 'Always on the menu. Price in cp, fixed (not scaled by the tier).', itemLabel: 'name', fields: {
                                    category: { kind: 'enum', enum: 'menuCategory', label: 'Category' },
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp)' },
                                }
                            },
                            services: { kind: 'refs', to: ['service'], label: 'Services from the catalogue' },
                            customServices: {
                                kind: 'objects', label: 'House-only services', help: 'Price in cp, fixed (not scaled by the tier).', itemLabel: 'name', fields: {
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp)' },
                                    unit: { kind: 'text', label: 'Unit' },
                                }
                            },
                            rumourDraws: { kind: 'number', label: 'Rumours per player', help: 'How many a player can hear per market code. Empty = 3; 0 = no Rumours tab.' },
                            games: { kind: 'list', enum: 'tavernGame', label: 'Gaming table', help: 'Adds a Games tab: played against the regulars.' },
                            minStake: { kind: 'enum', enum: 'gameStakes', label: 'Lowest stakes', showIf: { key: 'games', set: true }, help: 'The cheapest stakes this table takes; lower ones are not offered. Empty = all of them. Playing for fun is always possible.' },
                            houseCut: { kind: 'number', label: 'House cut (%)', showIf: { key: 'games', set: true }, help: 'The share of every pot the house keeps when it is paid out (0 to 50). Empty = none.' },
                            highTableWins: { kind: 'number', label: 'Wins to open the high table', showIf: { key: 'games', set: true }, help: 'Staked hands a player must win in this tavern before its highest stakes can be picked. Empty or 0 = open to all.' },
                        },
                    },
                    /* A POI can be a tavern AND a shop AND a temple: each block adds its tab to the page. */
                    shop: {
                        kind: 'object', label: 'Shop', optional: true, section: 'Shop',
                        help: 'Gives the page a Wares tab, drawn from the shop goods pool with the market code.',
                        fields: {
                            kind: { kind: 'enum', enum: 'shopKind', label: 'Kind of shop', required: true, help: 'Sets the shelves.' },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Shopkeepers', help: 'Shown on the Wares tab. Any NPC; the people who live here are listed apart.' },
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Quality tier', help: 'Empty = the tavern’s, else Modest.' },
                            hours: { kind: 'text', label: 'Opening hours', help: 'Empty = the tavern’s.' },
                            picks: { kind: 'number', label: 'Goods per shelf', help: 'Random picks. Empty = 5.' },
                            categories: { kind: 'list', enum: 'shopCategory', label: 'Shelves', help: 'Instead of the kind’s. None ticked = the kind’s.' },
                            markup: { kind: 'number', label: 'Price level (%)', help: 'Empty = 100; 80 = cheap, 130 = gouging.' },
                            includeTags: { kind: 'list', label: 'Only pool goods tagged', help: 'Empty = any tag.' },
                            excludeTags: { kind: 'list', label: 'Never pool goods tagged' },
                            signature: {
                                kind: 'objects', label: 'Signature wares', help: 'Always in stock. Price in cp, fixed (not scaled by the tier).', itemLabel: 'name', fields: {
                                    category: { kind: 'enum', enum: 'shopCategory', label: 'Shelf' },
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp)' },
                                    unit: { kind: 'text', label: 'Unit' },
                                }
                            },
                        },
                    },
                    temple: {
                        kind: 'object', label: 'Temple / shrine', optional: true, section: 'Temple',
                        help: 'Gives the page a Shrine tab: services, offerings and a prayer that draws a blessing.',
                        fields: {
                            deities: { kind: 'refs', to: ['deity'], label: 'Deities worshipped here' },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Tending the altar', help: 'Shown on the Shrine tab. Any NPC; the people who live here are listed apart.' },
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Wealth', help: 'Sets the prices. Empty = Modest.' },
                            hours: { kind: 'text', label: 'Hours of worship' },
                            services: { kind: 'refs', to: ['templeService'], label: 'Services from the catalogue' },
                            customServices: {
                                kind: 'objects', label: 'This temple’s own services', help: 'Price in cp, fixed (not scaled by the wealth). No price = “Donation”.', itemLabel: 'name', fields: {
                                    category: { kind: 'enum', enum: 'templeCategory', label: 'Kind' },
                                    name: { kind: 'text', label: 'Name' },
                                    desc: { kind: 'text', label: 'Description' },
                                    price: { kind: 'number', label: 'Price (cp)' },
                                    unit: { kind: 'text', label: 'Unit' },
                                }
                            },
                            noPrayer: { kind: 'boolean', label: 'No prayer button', help: 'No blessing is drawn here.' },
                        },
                    },
                    /* A seer's table: card readings and other practices (data/practices.json).
                       One reading per player per day; a campaign's prophecies come first. */
                    divination: {
                        kind: 'object', label: 'Divination', optional: true, section: 'Divination',
                        help: 'Gives the page a Readings tab: the practices offered here, and one reading per player per day.',
                        fields: {
                            practices: { kind: 'refs', to: ['practice'], label: 'Practices offered', required: true, help: 'Card reading, bone casting… The first one is chosen by default.' },
                            keepers: { kind: 'refs', to: ['npc'], label: 'Reading the signs', help: 'Shown on the Readings tab. Any NPC; the people who live here are listed apart.' },
                            title: { kind: 'text', label: 'Heading of the tab', help: 'Empty = “The Seer’s Table”.' },
                            tier: { kind: 'enum', enum: 'tavernTier', label: 'Wealth', help: 'Sets the prices. Empty = the tavern’s, else Modest.' },
                            hours: { kind: 'text', label: 'Hours' },
                        },
                    },
                    /* A university, a great library…: its own maps, its key locations and its people.
                       Key locations are ordinary POIs whose “Sits in” is this place (each has its
                       own page, pin and residents, and can be a tavern, a shop or a temple). */
                    institution: {
                        kind: 'object', label: 'Institution', optional: true, section: 'Institution',
                        help: 'Gives the page Map, Locations and People tabs. Its key locations are the POIs that sit in it.',
                        fields: {
                            kind: { kind: 'enum', enum: 'institutionKind', label: 'Kind', required: true, help: 'Sets the wording of the page.' },
                            hours: { kind: 'text', label: 'Opening hours' },
                            maps: {
                                kind: 'objects', label: 'Maps', itemLabel: 'name',
                                help: 'One per floor, wing or ground. The page opens on the first; its key locations are pinned on one of them.',
                                fields: {
                                    id: { kind: 'text', label: 'Id', required: true, width: 'half', help: 'Lowercase, no spaces (ground, floor-1…). Pins point to it: do not change it once pins are placed.' },
                                    name: { kind: 'text', label: 'Name', required: true, width: 'half', help: 'On the map picker: Ground Floor, East Wing…' },
                                    image: { kind: 'mapImage', label: 'Map image' },
                                    note: { kind: 'text', label: 'Caption', long: true, help: 'One or two lines shown under the map.' },
                                },
                            },
                            groups: {
                                kind: 'objects', label: 'People, by function', itemLabel: 'name',
                                help: 'The People tab, in this order. Anyone whose home is here (or in one of its locations) and who is in no group is listed last.',
                                fields: {
                                    name: { kind: 'text', label: 'Group', required: true, help: 'Faculty of Abjuration, Archivists, Students…' },
                                    desc: { kind: 'text', label: 'Description', long: true },
                                    members: {
                                        kind: 'objects', label: 'Members', itemLabel: 'npc', fields: {
                                            npc: { kind: 'ref', to: ['npc'], label: 'NPC', required: true },
                                            title: { kind: 'text', label: 'Title here', help: 'Empty = the NPC’s own role.' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    look: lookField('poiTheme', true),
                },
            },

            /*-------------------------------------======= PEOPLE =======-------------------------------------*/
            npc: {
                label: 'NPC', plural: 'NPCs', icon: 'group', group: 'People',
                file: 'data/npcs.json',
                page: 'npc.html?id={id}',
                autolink: true,
                sections: ['Identity', 'Where & ties', 'Campaigns', 'Biography', 'DM only'],
                fields: {
                    role: { kind: 'text', label: 'Role / title' },
                    summary: { kind: 'text', label: 'One-line summary', long: true, help: TOOLTIP_HELP },
                    quote: { kind: 'text', label: 'Quote', width: 'full' },
                    portrait: { kind: 'image', label: 'Portrait', help: 'The NPC’s card and page.' },
                    avatar: { kind: 'image', label: 'Avatar', help: 'Small round picture: lists, POI pages. Empty = the portrait.' },
                    home: { kind: 'ref', to: ['poi', 'district', 'settlement', 'country'], label: 'Where they are found', section: 'Where & ties' },
                    whereabouts: { kind: 'text', label: 'Whereabouts', section: 'Where & ties', help: 'When not a place on the site (another plane…).' },
                    species: { kind: 'text', label: 'Species', width: 'third' },
                    age: { kind: 'text', label: 'Age', width: 'third' },
                    gender: { kind: 'text', label: 'Gender', width: 'third' },
                    factions: { kind: 'refs', to: ['faction'], label: 'Factions', section: 'Where & ties' },
                    /* Campaigns the NPC belongs to, with the party's relation in each.
                       None listed = the NPC is part of every campaign, with "relation" below. */
                    campaigns: {
                        kind: 'objects', label: 'Campaigns', section: 'Campaigns', help: 'None listed = part of every campaign.', itemLabel: ['campaign', 'relation'], fields: {
                            campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign', required: true },
                            relation: { kind: 'enum', enum: 'relation', label: 'Relation to the party' },
                        }
                    },
                    relation: { kind: 'enum', enum: 'relation', label: 'Default relation', section: 'Campaigns', help: 'Used when no campaign is listed above, or a listed one sets no relation.' },
                    biography: { kind: 'markdown', label: 'Biography', section: 'Biography' },
                    secrets: { kind: 'markdown', label: 'Secrets', private: true, section: 'DM only' },
                },
            },
            faction: {
                label: 'Faction', plural: 'Factions', icon: 'swords', group: 'People',
                file: 'data/factions.json',
                page: 'factions.html?id={id}',
                autolink: true,
                sections: ['Essentials', 'Dossier', 'Relations', 'Intelligence', 'Field evidence'],
                fields: {
                    stub: { kind: 'boolean', label: 'Stub', help: 'Named somewhere, not written up yet: no dossier tab.' },
                    summary: { kind: 'text', label: 'One-line summary', long: true, help: TOOLTIP_HELP },
                    crest: { kind: 'image', label: 'Crest' },
                    status: { kind: 'enum', enum: 'factionStatus', label: 'Default standing', section: 'Relations', help: 'Used when no campaign lists this faction in its allegiances, or a listed one sets no standing.' },
                    quote: { kind: 'text', label: 'Motto / quote', width: 'full' },
                    reputation: { kind: 'number', label: 'Reputation', section: 'Dossier', range: [0, 100], help: 'The bar of the dossier (0–100).' },
                    reputationText: { kind: 'text', label: 'Reputation label', section: 'Dossier' },
                    base: { kind: 'text', label: 'Base of operations', section: 'Dossier' },
                    scale: { kind: 'text', label: 'Scale of influence', section: 'Dossier' },
                    mo: { kind: 'text', label: 'Modus operandi', section: 'Dossier' },
                    threatLevel: { kind: 'enum', enum: 'threatLevel', label: 'Threat level', section: 'Dossier' },
                    allies: { kind: 'refs', to: ['faction'], label: 'Allies', section: 'Relations' },
                    rivals: { kind: 'refs', to: ['faction'], label: 'Rivals', section: 'Relations' },
                    assets: { kind: 'list', label: 'Known assets', lines: true, section: 'Intelligence' },
                    directives: { kind: 'list', label: 'Active directives', lines: true, section: 'Intelligence' },
                    rumors: { kind: 'list', label: 'Unverified rumours', lines: true, section: 'Intelligence' },
                    intel: {
                        kind: 'objects', label: 'Evidence cards', section: 'Field evidence', itemLabel: ['type', 'title', 'name'], fields: {
                            type: { kind: 'enum', enum: 'intelKind', label: 'Kind', required: true },
                            seal: { kind: 'text', label: 'Seal letters', showIf: { key: 'type', is: ['note'] }, width: 'third' },
                            title: { kind: 'text', label: 'Title', showIf: { key: 'type', is: ['note', 'map'] } },
                            content: { kind: 'text', label: 'Text', long: true, showIf: { key: 'type', is: ['note'] } },
                            name: { kind: 'text', label: 'Name', showIf: { key: 'type', is: ['target'] } },
                            image: { kind: 'image', label: 'Picture', showIf: { key: 'type', is: ['map', 'target'] } },
                            description: { kind: 'text', label: 'Description', long: true, showIf: { key: 'type', is: ['target'] } },
                            tags: {
                                kind: 'objects', label: 'Tags', itemLabel: 'text', showIf: { key: 'type', is: ['target'] }, fields: {
                                    text: { kind: 'text', label: 'Text' },
                                    tone: { kind: 'enum', enum: 'tagTone', label: 'Colour' },
                                }
                            },
                        }
                    },
                },
            },

            /*-------------------------------------======= LIBRARY =======-------------------------------------*/
            /* A glossary term: lore, an object, a creature... that has no page of its own. Shown as a keyword (with its definition as tooltip) in the scriptorium. */
            lore: {
                label: 'Glossary term', plural: 'Glossary', icon: 'key', group: 'Library',
                file: 'data/lore.json',
                autolink: true,
                fields: {
                    kind: { kind: 'enum', enum: 'loreKind', label: 'Kind', required: true, help: 'Sets the keyword’s colour.' },
                    definition: { kind: 'markdown', label: 'Definition', help: TOOLTIP_HELP + ' Markdown: **bold**, *italic*, [links](url)…' },
                },
            },
            tome: {
                label: 'Tome', plural: 'Tomes', icon: 'menu_book', group: 'Library',
                file: 'data/tomes.json',
                page: 'tomes.html?id={id}',
                sections: ['Essentials', 'Look', 'Text'],
                fields: {
                    draft: { kind: 'boolean', label: 'Draft', help: 'Not shown on the site.' },
                    author: { kind: 'text', label: 'Author' },
                    kind: { kind: 'enum', enum: 'tomeKind', label: 'Book or scroll', required: true },
                    category: { kind: 'text', label: 'Category', help: 'The shelf filter.' },
                    spineText: { kind: 'text', label: 'Spine text', section: 'Look', showIf: { key: 'kind', is: ['Book'] } },
                    cover: { kind: 'image', label: 'Cover image', section: 'Look', showIf: { key: 'kind', is: ['Book'] } },
                    cleanCover: { kind: 'boolean', label: 'Clean cover', section: 'Look', help: 'The image alone, no title over it.', showIf: { key: 'cover', set: true } },
                    tone: { kind: 'enum', enum: 'tomeTone', label: 'Colour', section: 'Look', help: 'Scrolls, and books without a cover.' },
                    icon: { kind: 'text', label: 'Seal icon', section: 'Look', icon: true, showIf: { key: 'kind', is: ['Scroll'] }, help: 'Material Symbols name. Empty = history_edu.' },
                    iconColor: { kind: 'text', label: 'Seal icon colour', section: 'Look', color: true, showIf: { key: 'kind', is: ['Scroll'] }, help: 'Empty = the colour above.' },
                    body: { kind: 'markdown', label: 'Text', section: 'Text' },
                },
            },
            handout: {
                label: 'Handout', plural: 'Handouts', icon: 'contract', group: 'Library',
                file: 'data/handouts.json',
                page: 'handouts.html',
                sections: ['Essentials', 'Picture & file'],
                fields: {
                    draft: { kind: 'boolean', label: 'Draft', help: 'Not shown on the site.' },
                    campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign' },
                    category: { kind: 'text', label: 'Category', help: 'The filter of the Handouts page.' },
                    icon: { kind: 'text', label: 'Icon', icon: true, section: 'Picture & file', help: 'Material Symbols name.' },
                    foundAt: { kind: 'text', label: 'Where it was found' },
                    description: { kind: 'text', label: 'Description', long: true },
                    thumbnail: { kind: 'image', label: 'Card image', section: 'Picture & file' },
                    file: { kind: 'url', label: 'File to open', section: 'Picture & file', help: 'An image in the site’s folders, or a link.' },
                },
            },
            creature: {
                label: 'Creature', plural: 'Bestiary', icon: 'pest_control', group: 'Library',
                file: 'data/creatures.json',
                page: 'beast.html?id={id}',
                autolink: true,
                sections: ['Essentials', 'Stats', 'Lore', 'Field notes', 'Look'],
                fields: {
                    arcana: { kind: 'text', label: 'Arcana', help: 'e.g. I · THE GUARDIAN' },
                    specimenNo: { kind: 'text', label: 'Specimen number' },
                    location: { kind: 'text', label: 'Where it was met' },
                    image: { kind: 'image', label: 'Image' },
                    imageFocus: { kind: 'text', focus: true, label: 'Framing in the bestiary', showIf: { key: 'image', set: true }, help: 'The point the picture is centred and zoomed on, in the bestiary’s window (left → right, top → bottom). Empty = 50% 30%.' },
                    imageZoom: { kind: 'number', label: 'Zoom in the bestiary (%)', range: [100, 300], showIf: { key: 'image', set: true }, help: 'The picture fills the window; zoom in to frame it closer. Empty = 100.' },
                    threat: { kind: 'enum', enum: 'creatureThreat', label: 'Threat level', section: 'Stats' },
                    realm: { kind: 'text', label: 'Realm' },
                    phylogeny: { kind: 'text', label: 'Phylogeny' },
                    shortDesc: { kind: 'text', label: 'Short description', long: true, help: 'Bestiary card. Also the ' + TOOLTIP_HELP.toLowerCase() },
                    stats: {
                        kind: 'objects', label: 'Stat bars', section: 'Stats', itemLabel: 'label', fields: {
                            label: { kind: 'text', label: 'Stat' },
                            value: { kind: 'number', label: 'Value (0–100)', range: [0, 100] },
                        }
                    },
                    tags: { kind: 'list', label: 'Tags' },
                    habitats: { kind: 'list', label: 'Habitats' },
                    loreTitle: { kind: 'text', label: 'Lore title', section: 'Lore' },
                    body: { kind: 'markdown', label: 'Lore', section: 'Lore' },
                    behaviors: { kind: 'list', label: 'Behaviours', lines: true, section: 'Field notes' },
                    weaknesses: { kind: 'list', label: 'Weaknesses', lines: true, section: 'Field notes' },
                    drops: {
                        kind: 'objects', label: 'Harvestable parts', itemLabel: 'name', section: 'Field notes', fields: {
                            name: { kind: 'text', label: 'Name' },
                            type: { kind: 'text', label: 'Type' },
                            icon: { kind: 'text', label: 'Icon', icon: true },
                        }
                    },
                    scholarQuote: { kind: 'text', label: 'Scholar quote', long: true, section: 'Lore' },
                    scholarName: { kind: 'text', label: 'Scholar name', section: 'Lore' },
                    look: lookField('creatureTheme', false),
                },
            },
            /* A spell, shown as a card in the Spellbook (spellbook.html) and from the
               heroes' cards (heroes.html). Who knows it: campaign.spellbooks. */
            spell: {
                label: 'Spell', plural: 'Spellbook', icon: 'webhook', group: 'Library',
                file: 'data/spells.json',
                page: 'spellbook.html?spell={id}', // opens the card, whatever campaign and hero are picked
                autolink: true,
                sections: ['Card', 'Description'],
                fields: {
                    level: { kind: 'number', label: 'Level', required: true, choices: [[0, 'Cantrip (C)'], [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [5, '5th'], [6, '6th'], [7, '7th'], [8, '8th'], [9, '9th']] },
                    school: { kind: 'enum', enum: 'spellSchool', label: 'School', required: true, help: 'Sets the card’s colour and symbols.' },
                    castingTime: { kind: 'text', label: 'Casting time', help: 'e.g. 1 action', width: 'third' },
                    range: { kind: 'text', label: 'Range', help: 'e.g. 60 ft', width: 'third' },
                    duration: { kind: 'text', label: 'Duration', help: 'e.g. Up to 1 minute', width: 'third' },
                    /* same order as on the card: V S M, Conc., Rit. */
                    verbal: { kind: 'boolean', label: 'Verbal (V)' },
                    somatic: { kind: 'boolean', label: 'Somatic (S)' },
                    material: { kind: 'boolean', label: 'Material (M)' },
                    concentration: { kind: 'boolean', label: 'Concentration' },
                    ritual: { kind: 'boolean', label: 'Ritual' },
                    materials: { kind: 'text', label: 'Material components', long: true, help: 'Shown when hovering the M.', showIf: { key: 'material', set: true } },
                    summary: { kind: 'text', label: 'One-line summary', long: true, help: 'The card in the grid.' },
                    body: { kind: 'markdown', label: 'Full description', section: 'Description', help: 'The opened card.' },
                },
            },
            /* Shown as a loot card in the Artifact Vault (vault.html). Players see the items found in their campaign's sessions (session.loot) and the party's own (campaign.inventory). */
            item: {
                label: 'Item', plural: 'Items', icon: 'crown', group: 'Library',
                file: 'data/items.json',
                page: 'vault.html?item={id}',
                autolink: true,   // only items found somewhere (else the Vault link leads nowhere)
                sections: ['Card', 'Description'],
                fields: {
                    image: { kind: 'image', label: 'Picture' },
                    type: { kind: 'text', label: 'Type', help: 'e.g. Wondrous item, Weapon (dagger)' },
                    rarity: { kind: 'enum', enum: 'itemRarity', label: 'Rarity', help: 'Sets the card’s colour.' },
                    cost: { kind: 'text', label: 'Cost', help: 'e.g. 50 gp', width: 'third' },
                    weight: { kind: 'text', label: 'Weight', help: 'e.g. 1 lb.', width: 'third' },
                    attunement: { kind: 'boolean', label: 'Requires attunement' },
                    attunedBy: { kind: 'ref', to: ['hero'], label: 'Attuned to' },
                    summary: { kind: 'text', label: 'One-line description', long: true, help: 'Front of the card.' },
                    body: { kind: 'markdown', label: 'Full description', section: 'Description', help: 'The opened card.' },
                },
            },

            /*-------------------------------------======= CAMPAIGNS =======-------------------------------------*/
            campaign: {
                label: 'Campaign', plural: 'Campaigns', icon: 'auto_stories', group: 'Campaigns',
                file: 'data/campaigns.json',
                page: 'scriptorium.html?campaign={id}',
                sections: ['Story', 'Quests', 'Party', 'Allegiances', 'Spellbooks'],
                fields: {
                    preview: { kind: 'text', label: 'Teaser', long: true, help: 'The short “Story so far” of the scriptorium.' },
                    story: { kind: 'markdown', label: 'Story so far' },
                    quests: {
                        kind: 'objects', label: 'Active quests', itemLabel: 'title', section: 'Quests', fields: {
                            title: { kind: 'text', label: 'Title' },
                            description: { kind: 'text', label: 'Description', long: true },
                            status: { kind: 'enum', enum: 'questStatus', label: 'Status' },
                        }
                    },
                    partyName: { kind: 'text', label: 'Party name', section: 'Party', help: 'Empty = the campaign’s name.' },
                    party: { kind: 'refs', to: ['hero'], label: 'Heroes', section: 'Party' },
                    funds: {
                        kind: 'object', label: 'Party funds', section: 'Party', fields: {
                            gold: { kind: 'number', label: 'Gold' },
                            silver: { kind: 'number', label: 'Silver' },
                            copper: { kind: 'number', label: 'Copper' },
                        }
                    },
                    inventory: { kind: 'refs', to: ['item'], label: 'Shared inventory', section: 'Party', help: 'Besides the loot of the sessions.' },
                    standings: {
                        kind: 'objects', label: 'Factions of this campaign', section: 'Allegiances', help: 'A faction listed in no campaign is part of all of them. Shown on the Heroes page.', itemLabel: ['faction', 'status'], fields: {
                            faction: { kind: 'ref', to: ['faction', 'poi'], label: 'Faction (or place)' },
                            status: { kind: 'enum', enum: 'factionStatus', label: 'Standing' },
                        }
                    },
                    /* What each hero knows in THIS campaign (a hero can be in two campaigns) */
                    spellbooks: {
                        kind: 'objects', label: 'Spellbooks', itemLabel: 'hero', section: 'Spellbooks', help: 'What each hero knows in this campaign.', fields: {
                            hero: { kind: 'ref', to: ['hero'], label: 'Hero', help: 'One of the party.' },
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
                sections: ['Overview', 'Transcript', 'People & places', 'Loot & leads'],
                fields: {
                    campaign: { kind: 'ref', to: ['campaign'], label: 'Campaign', required: true },
                    number: { kind: 'number', label: 'Session number', required: true, help: 'Sets the order (highest = latest); not shown.' },
                    date: { kind: 'text', label: 'In-world date' },
                    region: { kind: 'text', label: 'Region' },
                    arc: { kind: 'text', label: 'Arc' },
                    summary: { kind: 'text', label: 'Summary', long: true },
                    places: { kind: 'refs', to: ['poi', 'district', 'settlement', 'country', 'continent'], label: 'Places visited', section: 'People & places' },
                    otherPlaces: { kind: 'list', label: 'Places with no page', section: 'People & places' },
                    npcs: {
                        kind: 'objects', label: 'NPCs met', itemLabel: 'npc', section: 'People & places', fields: {
                            npc: { kind: 'ref', to: ['npc'], label: 'NPC' },
                            sentiment: { kind: 'enum', enum: 'sentiment', label: 'How it went' },
                        }
                    },
                    loot: { kind: 'refs', to: ['item'], label: 'Loot obtained', section: 'Loot & leads' },
                    accomplished: { kind: 'list', label: 'Things accomplished', lines: true, section: 'Loot & leads' },
                    leadsPursued: { kind: 'list', label: 'Leads pursued', lines: true, section: 'Loot & leads' },
                    futureLeads: { kind: 'list', label: 'Future leads', lines: true, section: 'Loot & leads' },
                    keywords: { kind: 'list', label: 'Search keywords' },
                    body: { kind: 'markdown', label: 'Transcript', section: 'Transcript' },
                },
            },
            hero: {
                label: 'Hero', plural: 'Heroes', icon: 'local_fire_department', group: 'Campaigns',
                file: 'data/heroes.json',
                page: 'heroes.html',
                sections: ['Identity', 'Backstory', 'Statistics', 'Secret'],
                fields: {
                    raceClass: { kind: 'text', label: 'Race and class' },
                    level: { kind: 'number', label: 'Level' },
                    background: { kind: 'text', label: 'Background' },
                    avatar: { kind: 'image', label: 'Avatar' },
                    quote: { kind: 'text', label: 'Quote', width: 'full' },
                    backstory: { kind: 'text', label: 'Backstory', long: true, section: 'Backstory' },
                    personalGoal: { kind: 'text', label: 'Personal goal', section: 'Backstory', width: 'full' },
                    stats: {
                        kind: 'object', label: 'Statistics', section: 'Statistics', fields: {
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
                    secret: { kind: 'markdown', label: 'Secret', private: true, section: 'Secret', help: 'Revealed on the Heroes page to whoever types the password.' },
                    password: { kind: 'text', label: 'Password', private: true, section: 'Secret', help: 'Capitals don’t matter.' },
                    sealedSecret: { kind: 'sealed', from: 'secret', password: 'password', label: 'Published copy', section: 'Secret' },
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
                    desc: { kind: 'text', label: 'Description', width: 'full' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true, help: '× the tavern’s tier.' },
                    minTier: { kind: 'enum', enum: 'tavernTier', label: 'From tier', required: true, help: 'The cheapest tavern that serves it.' },
                    maxTier: { kind: 'enum', enum: 'tavernTier', label: 'Up to tier', required: true, help: 'The finest tavern that serves it.' },
                    tags: { kind: 'list', label: 'Tags', help: 'Taverns can require or exclude tags.' },
                },
            },
            service: {
                label: 'Tavern service', plural: 'Tavern services', icon: 'bed', group: 'Markets',
                file: 'data/services.json',
                fields: {
                    desc: { kind: 'text', label: 'Description', width: 'full' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true, help: '× the tavern’s tier.' },
                    unit: { kind: 'text', label: 'Unit', help: 'per night, each…' },
                },
            },
            /* The shared shop pool: a shop shows N seeded goods per shelf, among those its
               kind, tier and tags allow (price = basePrice x tier multiplier x markup). */
            shopGood: {
                label: 'Shop good', plural: 'Shop goods pool', icon: 'storefront', group: 'Markets',
                file: 'data/shop-goods.json',
                fields: {
                    category: { kind: 'enum', enum: 'shopCategory', label: 'Shelf', required: true },
                    desc: { kind: 'text', label: 'Description', width: 'full' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true, help: '× the shop’s tier and price level.' },
                    unit: { kind: 'text', label: 'Unit', help: 'each, 50 ft, 20 arrows…' },
                    minTier: { kind: 'enum', enum: 'tavernTier', label: 'From tier', required: true, help: 'The cheapest shop that stocks it.' },
                    maxTier: { kind: 'enum', enum: 'tavernTier', label: 'Up to tier', required: true, help: 'The finest shop that stocks it.' },
                    tags: { kind: 'list', label: 'Tags', help: 'illicit = only fences sell it.' },
                },
            },

            /*-------------------------------------======= FAITH =======-------------------------------------*/
            /* The Pantheon (pantheon.html) groups the gods by `tier`; each opens its own page
               (deity.html). Elder gods stay sealed (no name, no page, no keyword link) until
               a campaign lists them in `revealedIn`. Card frames: scripts/deity-card.js. */
            deity: {
                label: 'Deity', plural: 'Pantheon', icon: 'brightness_7', group: 'Faith',
                file: 'data/deities.json',
                page: 'deity.html?id={id}',
                autolink: true,   // sealed Elder gods excepted (store.revealed)
                sections: ['Essentials', 'Card', 'Lore', 'Artifact'],
                fields: {
                    tier: { kind: 'enum', enum: 'deityTier', label: 'Tier', help: 'The section of the Pantheon and the card’s frame.' },
                    epithet: { kind: 'text', label: 'Epithet', help: 'The Lady of Ashes…' },
                    summary: { kind: 'text', label: 'One-line summary', long: true, help: TOOLTIP_HELP },
                    domains: { kind: 'list', label: 'Domains / portfolio', help: 'The card shows the first three.' },
                    alignment: { kind: 'text', label: 'Alignment' },
                    portrait: { kind: 'image', label: 'Portrait', section: 'Card', help: 'Full body, upright 2:3.' },
                    portraitFocus: { kind: 'text', label: 'Portrait framing', section: 'Card', focus: true, help: 'The point the zoom centres on (left → right, top → bottom). Empty = 50% 30%.' },
                    portraitZoom: { kind: 'number', label: 'Portrait zoom (%)', section: 'Card', range: [100, 300], help: 'The portrait fills the window exactly: zoom in to frame it. Empty = 100 (whole portrait).' },
                    symbol: { kind: 'image', label: 'Holy symbol', section: 'Card', help: 'A transparent PNG, shown in the medallion.' },
                    symbolText: { kind: 'text', label: 'Holy symbol (description)', section: 'Lore' },
                    icon: { kind: 'text', label: 'Medallion icon', icon: true, section: 'Card', help: 'When there is no symbol image (Material Symbols name).', showIf: { key: 'symbol', empty: true } },
                    colour: { kind: 'text', label: 'Colour', color: true, section: 'Card', help: 'The card’s gems and glow.' },
                    worshippers: { kind: 'text', label: 'Typical worshippers', long: true, section: 'Lore' },
                    body: { kind: 'markdown', label: 'Lore', section: 'Lore' },
                    artifact: { kind: 'ref', to: ['item'], label: 'Artifact', section: 'Artifact', help: 'An item: told as a legend on this page; in the Vault only once a party finds it.' },
                    artifactLegend: { kind: 'markdown', label: 'The artifact’s legend', section: 'Artifact', showIf: { key: 'artifact', set: true } },
                    revealedIn: { kind: 'refs', to: ['campaign'], label: 'Revealed in', help: 'Campaigns where the party has learned of this Elder god. None = sealed everywhere.', showIf: { key: 'tier', is: ['elder'] } },
                },
            },
            templeService: {
                label: 'Temple service', plural: 'Temple services', icon: 'healing', group: 'Faith',
                file: 'data/temple-services.json',
                fields: {
                    category: { kind: 'enum', enum: 'templeCategory', label: 'Kind', required: true },
                    desc: { kind: 'text', label: 'Description', width: 'full' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', required: true, help: '× the temple’s wealth.' },
                    unit: { kind: 'text', label: 'Unit', help: 'per casting, each…' },
                },
            },
            /* What "Pray" at a temple can grant: drawn once per market code, per browser. */
            blessing: {
                label: 'Blessing', plural: 'Blessings', icon: 'volunteer_activism', group: 'Faith',
                file: 'data/blessings.json',
                fields: {
                    text: { kind: 'text', label: 'What the worshipper feels or sees', long: true, required: true, help: 'Shown to the player.' },
                    effect: { kind: 'text', label: 'Effect in play', width: 'full', help: 'Optional; shown under the text.' },
                    deities: { kind: 'refs', to: ['deity'], label: 'Only at the temples of', help: 'None = any temple.' },
                },
            },

            /*-------------------------------------======= TOWN LIFE =======-------------------------------------*/
            /* Heard in every tavern at or under `where`: a settlement's rumour is heard in
               all its taverns, a POI's only there. Players draw them by buying a round. */
            rumour: {
                label: 'Rumour', plural: 'Rumours', icon: 'record_voice_over', group: 'Town life',
                file: 'data/rumours.json',
                sections: ['Rumour', 'DM only'],
                fields: {
                    where: { kind: 'ref', to: ['poi', 'district', 'settlement', 'country', 'continent'], label: 'Heard in the taverns of', required: true, help: 'A tavern, or any place above it (all its taverns).' },
                    campaigns: { kind: 'refs', to: ['campaign'], label: 'Campaigns', help: 'None = every campaign.' },
                    text: { kind: 'text', label: 'The rumour', long: true, required: true, help: 'As the players hear it.' },
                    source: { kind: 'text', label: 'Who tells it', help: 'A drunk sailor, the barmaid…' },
                    truth: { kind: 'enum', enum: 'rumourTruth', label: 'Truth', private: true, section: 'DM only' },
                    note: { kind: 'text', label: 'DM note', long: true, private: true, section: 'DM only' },
                },
            },
            /* A post on a notice board: the settlement's (town board) or a POI's. */
            notice: {
                label: 'Notice', plural: 'Notice boards', icon: 'push_pin', group: 'Town life',
                file: 'data/notices.json',
                sections: ['Notice', 'Text'],
                fields: {
                    where: { kind: 'ref', to: ['settlement', 'poi'], label: 'Pinned on the board of', required: true },
                    campaigns: { kind: 'refs', to: ['campaign'], label: 'Campaigns', help: 'None = every campaign.' },
                    kind: { kind: 'enum', enum: 'noticeKind', label: 'Kind', required: true, help: 'Sets the look.' },
                    status: { kind: 'enum', enum: 'noticeStatus', label: 'Status', help: 'Empty = open. Taken or done: stamped, moved to the end.' },
                    body: { kind: 'markdown', label: 'Text of the notice', section: 'Text' },
                    reward: { kind: 'text', label: 'Reward / pay' },
                    issuer: { kind: 'ref', to: ['npc', 'faction', 'poi', 'deity'], label: 'Posted by' },
                    issuerText: { kind: 'text', label: 'Signature', help: 'When the poster is not on the site, or as a signature.' },
                    posted: { kind: 'text', label: 'Posted on', help: 'In-world date.' },
                    image: { kind: 'image', label: 'Picture', help: 'Wanted posters…' },
                },
            },

            /*-------------------------------------======= DIVINATION =======-------------------------------------*/
            /* A POI with a divination block offers practices. A card practice draws from a
               deck into a spread the player picks; an omen practice draws one sign from its
               own pool. One reading per player, per seer, per day (kept in the browser).
               A prophecy is a reading fixed by the DM: the next reading at its POI, in its
               campaign, is that one instead of a random draw. Scripts: scripts/divination.js
               (draws) and scripts/fortune-card.js (markup, styles/fortune-card.css). */
            practice: {
                label: 'Practice', plural: 'Practices', icon: 'visibility', group: 'Divination',
                file: 'data/practices.json',
                fields: {
                    method: { kind: 'enum', enum: 'divinationMethod', label: 'Method', required: true },
                    desc: { kind: 'text', label: 'Description', width: 'full', help: 'Under its name on the Readings tab.' },
                    basePrice: { kind: 'number', label: 'Base price (cp)', help: '× the seer’s wealth. Empty = “Donation”.' },
                    unit: { kind: 'text', label: 'Unit', help: 'per reading, per question…' },
                    icon: { kind: 'text', label: 'Icon', icon: true, help: 'Material Symbols name, on the omen tile. Empty = visibility.' },
                    deck: { kind: 'ref', to: ['deck'], label: 'Deck', help: 'The cards it draws from.', showIf: { key: 'method', is: ['cards'] } },
                    spreads: { kind: 'refs', to: ['spread'], label: 'Spreads offered', help: 'The player picks one. None = every spread.', showIf: { key: 'method', is: ['cards'] } },
                },
            },
            deck: {
                label: 'Deck', plural: 'Decks', icon: 'style', group: 'Divination',
                file: 'data/decks.json',
                fields: {
                    desc: { kind: 'text', label: 'Description', width: 'full' },
                    back: { kind: 'image', label: 'Back of the cards', help: 'Tarot size, upright (70 × 120). Empty = a plain patterned back.' },
                    noReversals: { kind: 'boolean', label: 'No reversed cards', help: 'Cards are always drawn upright.' },
                },
            },
            fortuneCard: {
                label: 'Card', plural: 'Cards', icon: 'playing_cards', group: 'Divination',
                file: 'data/fortune-cards.json',
                order: { by: 'number', within: 'deck' },
                sections: ['Card', 'Meanings'],
                fields: {
                    deck: { kind: 'ref', to: ['deck'], label: 'Deck', required: true },
                    number: { kind: 'number', label: 'Number', help: 'Its place in the deck (0 = The Fool). Shown as a Roman numeral when there is no picture.' },
                    image: { kind: 'image', label: 'Picture', help: 'The whole face of the card, tarot size, upright (70 × 120).' },
                    keywords: { kind: 'list', label: 'Keywords', help: 'Shown over its meaning (upright).' },
                    upright: { kind: 'text', label: 'Upright meaning', long: true, required: true, section: 'Meanings' },
                    reversedKeywords: { kind: 'list', label: 'Keywords (reversed)', section: 'Meanings' },
                    reversed: { kind: 'text', label: 'Reversed meaning', long: true, section: 'Meanings', help: 'Empty = the upright meaning, marked reversed.' },
                },
            },
            spread: {
                label: 'Spread', plural: 'Spreads', icon: 'view_column', group: 'Divination',
                file: 'data/spreads.json',
                fields: {
                    desc: { kind: 'text', label: 'Description', width: 'full', help: 'Under the spread’s name in the player’s choice.' },
                    layout: { kind: 'enum', enum: 'spreadLayout', label: 'Layout', help: 'Empty = a row.' },
                    positions: {
                        kind: 'objects', label: 'Positions', itemLabel: 'name', required: true,
                        help: 'One per card, in the order they are laid and turned.',
                        fields: {
                            name: { kind: 'text', label: 'Name', required: true, help: 'Past, Present, Future…' },
                            desc: { kind: 'text', label: 'What it speaks of', long: true },
                        },
                    },
                },
            },
            /* The pool of an omen practice: one is drawn per reading */
            omen: {
                label: 'Omen', plural: 'Omens', icon: 'flare', group: 'Divination',
                file: 'data/omens.json',
                fields: {
                    practice: { kind: 'ref', to: ['practice'], label: 'Practice', required: true, help: 'An omen practice (bone casting, tea leaves…).' },
                    text: { kind: 'text', label: 'What the seer sees', long: true, required: true },
                    meaning: { kind: 'text', label: 'What it means', long: true, help: 'Shown under it.' },
                    image: { kind: 'image', label: 'Picture', help: 'Square. Empty = the practice’s icon.' },
                },
            },
            /* A reading fixed by the DM for a campaign. A player of that campaign gets it at
               their next reading at `where` (first prophecy first), then draws go back to random. */
            prophecy: {
                label: 'Prophecy', plural: 'Prophecies', icon: 'auto_awesome', group: 'Divination',
                file: 'data/prophecies.json',
                sections: ['Prophecy', 'The reading', 'DM only'],
                fields: {
                    where: { kind: 'ref', to: ['poi'], label: 'Read at', required: true, help: 'A POI with a divination block.' },
                    campaigns: { kind: 'refs', to: ['campaign'], label: 'Campaigns', required: true },
                    practice: { kind: 'ref', to: ['practice'], label: 'Practice', required: true, help: 'One the seer offers. Whatever the player chose, this is the reading they get.' },
                    spread: { kind: 'ref', to: ['spread'], label: 'Spread', help: 'Card practices: its positions take the cards below, in order.' },
                    intro: { kind: 'text', label: 'Before the reading', long: true, section: 'The reading', help: 'What the seer says first (optional).' },
                    cards: {
                        kind: 'objects', label: 'The cards', itemLabel: 'card', section: 'The reading',
                        help: 'One per position of the spread, in order.',
                        fields: {
                            card: { kind: 'ref', to: ['fortuneCard'], label: 'Card', required: true },
                            reversed: { kind: 'boolean', label: 'Reversed' },
                            reading: { kind: 'text', label: 'What the seer reads in it', long: true, help: 'Empty = the card’s own meaning.' },
                        },
                    },
                    omen: { kind: 'text', label: 'The omen', long: true, section: 'The reading', help: 'Omen practices: what the seer sees.' },
                    omenMeaning: { kind: 'text', label: 'What the omen means', long: true, section: 'The reading' },
                    closing: { kind: 'text', label: 'After the reading', long: true, section: 'The reading', help: 'Shown once every card is turned (optional).' },
                    meaning: { kind: 'text', label: 'What it really foretells', long: true, private: true, section: 'DM only' },
                },
            },
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);