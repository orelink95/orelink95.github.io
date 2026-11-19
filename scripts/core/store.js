/* =====================================================================
   STORE  —  the only code that knows how the data files are laid out.
   ---------------------------------------------------------------------
   In a page, load in this order:
       <script src="data/schema.js"></script>
       <script src="scripts/core/markdown.js"></script>
       <script src="scripts/core/store.js"></script>
   then:
       const store = await Athenaeum.ready;
       store.get('brightend')                 -> record
       store.all('npc')                       -> records of a type
       store.typeOf('brightend')              -> 'settlement'
       store.parent(id) / store.ancestors(id) -> places above (root first)
       store.children(id, 'poi')             -> direct children
       store.descendants(id, 'poi')           -> children at any depth
       store.backrefs(id, 'npc', 'home')      -> records that point here
       store.url(id)                          -> page URL from the schema
       store.md(text, {dropCap:true})         -> HTML
       store.autolink(html, {exclude: id})    -> names turned into links
                                                 (glossary terms too, as spans,
                                                 with {terms: true}); each has
                                                 data-kw="<id>" (preview cards)
       store.find('The Gilded Goldfinch')     -> record by name or alias
       store.inCampaign(npc, 'last-sigil')    -> is an NPC / faction part of it
       store.standing(npc, 'last-sigil')      -> its relation (NPC) / status
                                                 (faction) in that campaign
       store.campaignEntries(npc)             -> [{campaign, value}] it is listed in
       store.viewCampaign()                   -> the campaign the reader is looking at
                                                 (?campaign=…, else the one picked in
                                                 this tab, else settings.currentCampaign)
       store.revealed(deity, campaignId)      -> false for an Elder god (or a hidden
                                                 event) still sealed there
                                                 (campaignId: default viewCampaign())
       store.calendar                         -> the world's calendar (scripts/core/
                                                 calendar.js, data/calendar.json):
                                                 format, compare, weekday of world dates
       store.validate()                       -> {errors, warnings}
       store.hidden                           -> Set of the ids hidden from players
                                                 (the dashboard; on the site it is empty
                                                 unless the DM preview is on)
       store.world / store.settings           -> data/world.json, data/settings.json
   Node tools build a store from files with Athenaeum.createStore().
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
    const BASE_KEYS = ['id', 'name', 'aliases', 'parent', 'hidden'];
    const LINK_CLASS = { npc: 'kw-person', faction: 'kw-faction', creature: 'kw-monster', item: 'kw-object', spell: 'kw-spell', deity: 'kw-deity', plane: 'kw-plane' };

    // Comparator for a type's `order` option (see data/schema.js)
    function comparator(order) {
        const num = v => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
        return (a, b) => {
            if (order.within) {
                const c = String(a[order.within] ?? '').localeCompare(String(b[order.within] ?? ''));
                if (c) return c;
            }
            const x = num(a[order.by]), y = num(b[order.by]);
            if (x === null || y === null) return (x === null) - (y === null);
            return order.desc ? y - x : x - y;
        };
    }
    ATH.comparator = comparator;

    /* ---------- hidden from players ----------
       `hidden: true` on any record keeps it off the site until the DM unticks it:
       no page, no card, no pin, no link (its name stays plain text). Hidden too:
       - what sits in a hidden place (`parent`, at any depth), the NPCs whose `home`
         is hidden, the handouts of a hidden campaign, and any record whose required
         link points to a hidden record (a session of a hidden campaign, a card of a
         hidden deck…);
       - a record listed only in hidden campaigns (`campaigns`).
       The site drops them before building its store (withoutHidden); the dashboard
       and the tools keep everything and mark them (store.hidden). */
    const HIDDEN_ANCHORS = { npc: ['home'], handout: ['campaign'] };
    function hiddenIds(schema, datasets) {
        const types = schema.types;
        const hidden = new Set();
        const recs = [];
        for (const [type, list] of Object.entries(datasets || {})) {
            if (!types[type] || !Array.isArray(list)) continue;
            for (const r of list) if (r && typeof r.id === 'string') { recs.push([type, r]); if (r.hidden === true) hidden.add(r.id); }
        }
        const anchorsOf = (type, r) => {
            const def = types[type], out = [];
            if (def.place && r.parent) out.push(r.parent);
            for (const [k, f] of Object.entries(def.fields)) {
                if (f.kind === 'ref' && typeof r[k] === 'string' && (f.required || (HIDDEN_ANCHORS[type] || []).includes(k))) out.push(r[k]);
            }
            return out;
        };
        const campaignsOf = (type, r) => {
            const f = types[type].fields.campaigns, v = r.campaigns;
            if (!f || !Array.isArray(v)) return [];
            if (f.kind === 'refs') return v.filter(x => typeof x === 'string');
            if (f.kind === 'objects') return v.map(e => e && e.campaign).filter(Boolean);
            return [];
        };
        for (let changed = true; changed;) {
            changed = false;
            for (const [type, r] of recs) {
                if (hidden.has(r.id)) continue;
                const camps = campaignsOf(type, r);
                if (anchorsOf(type, r).some(id => hidden.has(id)) || (camps.length && camps.every(id => hidden.has(id)))) {
                    hidden.add(r.id); changed = true;
                }
            }
        }
        return hidden;
    }
    // Why a record is hidden: 'own' (ticked), or the id of the record it follows
    function hiddenBecause(schema, datasets, id, hidden) {
        hidden = hidden || hiddenIds(schema, datasets);
        if (!hidden.has(id)) return null;
        for (const [type, list] of Object.entries(datasets || {})) {
            const r = Array.isArray(list) && list.find(x => x && x.id === id);
            if (!r || !schema.types[type]) continue;
            if (r.hidden === true) return 'own';
            const def = schema.types[type];
            if (def.place && hidden.has(r.parent)) return r.parent;
            for (const [k, f] of Object.entries(def.fields)) {
                if (f.kind === 'ref' && hidden.has(r[k]) && (f.required || (HIDDEN_ANCHORS[type] || []).includes(k))) return r[k];
            }
            return 'campaigns';
        }
        return null;
    }
    // The data with hidden records taken out, and every link to them removed:
    // a link field is emptied, a list loses the id, and an entry of a list of
    // objects (a fighter, a group member, a quote…) that names one is dropped.
    function withoutHidden(schema, datasets, privateData, singletonData) {
        const hidden = hiddenIds(schema, datasets);
        if (!hidden.size) return { datasets, privateData, singletonData, hidden };
        const gone = v => typeof v === 'string' && hidden.has(v);
        const scrub = (fields, obj) => {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
            const out = { ...obj };
            for (const [k, f] of Object.entries(fields || {})) {
                const v = out[k];
                if (v === undefined || v === null) continue;
                if (f.kind === 'ref') { if (gone(v)) delete out[k]; }
                else if (f.kind === 'refs' && Array.isArray(v)) out[k] = v.filter(x => !gone(x));
                else if (f.kind === 'object') out[k] = scrub(f.fields, v);
                else if (f.kind === 'objects' && Array.isArray(v)) {
                    const refKeys = Object.entries(f.fields || {}).filter(([, sf]) => sf.kind === 'ref').map(([sk]) => sk);
                    out[k] = v.filter(o => !(o && refKeys.some(sk => gone(o[sk])))).map(o => scrub(f.fields, o));
                }
            }
            return out;
        };
        const ds = {};
        for (const [type, list] of Object.entries(datasets || {})) {
            const def = schema.types[type];
            ds[type] = Array.isArray(list) && def ? list.filter(r => !(r && hidden.has(r.id))).map(r => scrub(def.fields, r)) : list;
        }
        let priv = privateData;
        if (privateData) {
            priv = {};
            for (const [type, entries] of Object.entries(privateData)) {
                priv[type] = {};
                for (const [id, fields] of Object.entries(entries || {})) if (!hidden.has(id)) priv[type][id] = fields;
            }
        }
        const singles = {};
        for (const [name, v] of Object.entries(singletonData || {})) {
            const def = (schema.singletons || {})[name];
            singles[name] = def && v ? scrub(def.fields, v) : v;
        }
        return { datasets: ds, privateData: priv, singletonData: singles, hidden };
    }
    ATH.hiddenIds = hiddenIds;
    ATH.hiddenBecause = hiddenBecause;
    ATH.withoutHidden = withoutHidden;

    function createStore(schema, datasets, privateData, singletonData) {
        const types = schema.types;
        const byId = new Map();
        const typeOfRec = new WeakMap();
        const byType = {};
        const raw = {};
        const loadIssues = [];

        /* ---------- load and merge ---------- */
        for (const [type, def] of Object.entries(types)) {
            const list = datasets[type];
            raw[type] = list;
            if (list === undefined && def.dmOnly) { raw[type] = []; byType[type] = []; continue; } // DM-only file absent (the site)
            if (list === undefined) { loadIssues.push(`[${type}] ${def.file} was not loaded`); byType[type] = []; continue; }
            if (!Array.isArray(list)) { loadIssues.push(`[${type}] ${def.file} must be a JSON array`); byType[type] = []; continue; }
            byType[type] = list.map(r => ({ ...r }));
            if (def.order) byType[type].sort(comparator(def.order));
            for (const rec of byType[type]) {
                typeOfRec.set(rec, type);
                if (rec && typeof rec.id === 'string' && !byId.has(rec.id)) byId.set(rec.id, rec);
            }
        }
        for (const [type, entries] of Object.entries(privateData || {})) {
            for (const [id, fields] of Object.entries(entries || {})) {
                const rec = byId.get(id);
                if (rec && typeOfRec.get(rec) === type) Object.assign(rec, fields);
            }
        }

        const singletons = {};
        for (const name of Object.keys(schema.singletons || {})) singletons[name] = Object.assign({}, (singletonData || {})[name] || {});

        // The world's calendar (scripts/core/calendar.js, loaded before this file)
        const calendar = ATH.makeCalendar ? ATH.makeCalendar(singletons.calendar) : null;

        // Hidden from players (the site has already dropped them, see withoutHidden)
        const hidden = hiddenIds(schema, datasets);

        const resolve = x => (typeof x === 'string' ? byId.get(x) : x) || null;
        const typeOf = x => { const r = resolve(x); return r ? typeOfRec.get(r) : null; };

        /* ---------- campaigns (NPCs and factions) ----------
           An NPC lists its campaigns:        npc.campaigns     [{campaign, relation}]
           A campaign lists its factions:     campaign.standings [{faction, status}]
           Listed in no campaign = part of every campaign, with its own
           npc.relation / faction.status.
           campaignId 'all' (or none) = every campaign: the value in the current
           campaign (settings.currentCampaign) when listed there, else the first. */
        function campaignEntries(x) {
            const rec = resolve(x);
            if (!rec) return [];
            const type = typeOfRec.get(rec);
            if (type === 'npc') return (rec.campaigns || []).filter(e => e && e.campaign).map(e => ({ campaign: e.campaign, value: e.relation }));
            if (type === 'festival') return (rec.campaigns || []).filter(Boolean).map(c => ({ campaign: c }));
            if (type === 'faction') return (byType.campaign || []).flatMap(c => (c.standings || []).filter(s => s && s.faction === rec.id).map(s => ({ campaign: c.id, value: s.status })));
            return [];
        }
        const isAll = cid => !cid || cid === 'all';
        function inCampaign(x, cid) {
            if (isAll(cid)) return true;
            const list = campaignEntries(x);
            return !list.length || list.some(e => e.campaign === cid);
        }
        function standing(x, cid) {
            const rec = resolve(x);
            if (!rec) return 'Unknown';
            const list = campaignEntries(rec);
            const current = (singletons.settings || {}).currentCampaign;
            const entry = list.find(e => e.campaign === cid) ||
                (isAll(cid) ? (list.find(e => e.campaign === current) || list[0]) : null);
            const own = typeOfRec.get(rec) === 'npc' ? rec.relation : rec.status;
            return (entry && entry.value) || own || 'Unknown';
        }

        /* ---------- the reader's campaign, sealed gods ----------
           viewCampaign: ?campaign=… in the address, else the choice kept for this
           browser tab by the campaign drop-downs (scripts/personae.js, same key),
           else settings.currentCampaign. In Node (tools), the current campaign. */
        const PICKED_KEY = 'athenaeum.personae.campaign';
        function viewCampaign() {
            const ids = (byType.campaign || []).map(c => c.id);
            const ok = v => !!v && (v === 'all' || ids.includes(v));
            let asked = null, kept = null;
            try { asked = new URLSearchParams(root.location.search).get('campaign'); } catch (e) { /* no address */ }
            try { kept = root.sessionStorage.getItem(PICKED_KEY); } catch (e) { /* no storage */ }
            return [asked, kept, (singletons.settings || {}).currentCampaign].find(ok) || 'all';
        }
        /* Gods of every tier are known to all, but an Elder god is sealed until a
           campaign lists it in `revealedIn`; so is an event of the timeline marked
           `sealed` (hidden history), and a plane marked `sealed`. 'all' = revealed in at least one. */
        function revealed(x, cid) {
            const rec = resolve(x);
            if (!rec) return true;
            const t = typeOfRec.get(rec);
            const sealed = (t === 'deity' && rec.tier === 'elder') || ((t === 'event' || t === 'plane') && rec.sealed);
            if (!sealed) return true;
            const list = rec.revealedIn || [];
            const c = cid === undefined ? viewCampaign() : cid;
            return isAll(c) ? list.length > 0 : list.includes(c);
        }

        // The maps of an institution that have an image (poi.institution.maps)
        const institutionMaps = poi => ((poi && poi.institution && poi.institution.maps) || [])
            .filter(m => m && m.id && m.image && m.image.src);

        /* ---------- hierarchy ---------- */
        const childIndex = new Map();
        for (const [type, list] of Object.entries(byType)) {
            if (!types[type].place) continue;
            for (const rec of list) {
                if (!rec.parent) continue;
                if (!childIndex.has(rec.parent)) childIndex.set(rec.parent, []);
                childIndex.get(rec.parent).push(rec);
            }
        }
        const parent = x => { const r = resolve(x); return r && r.parent ? resolve(r.parent) : null; };
        function ancestors(x) {
            const chain = [], seen = new Set();
            let p = parent(x);
            while (p && !seen.has(p.id)) { seen.add(p.id); chain.unshift(p); p = parent(p); }
            return chain;
        }
        function children(x, type) {
            const r = resolve(x);
            const list = r ? (childIndex.get(r.id) || []) : [];
            return type ? list.filter(c => typeOfRec.get(c) === type) : list.slice();
        }
        function descendants(x, type) {
            const out = [], seen = new Set();
            (function walk(id) {
                for (const c of childIndex.get(id) || []) {
                    if (seen.has(c.id)) continue;
                    seen.add(c.id);
                    if (!type || typeOfRec.get(c) === type) out.push(c);
                    walk(c.id);
                }
            })(typeof x === 'string' ? x : x && x.id);
            return out;
        }

        /* ---------- references ---------- */
        // Walk every ref / refs field, nested objects included.
        function eachRef(fields, value, path, fn) {
            if (!value || typeof value !== 'object') return;
            for (const [key, f] of Object.entries(fields || {})) {
                const v = value[key];
                if (v === undefined || v === null || v === '') continue;
                const p = path ? `${path}.${key}` : key;
                if (f.kind === 'ref') fn(v, f, p);
                else if (f.kind === 'refs' && Array.isArray(v)) v.forEach((id, i) => fn(id, f, `${p}[${i}]`));
                else if (f.kind === 'object') eachRef(f.fields, v, p, fn);
                else if (f.kind === 'objects' && Array.isArray(v)) v.forEach((o, i) => eachRef(f.fields, o, `${p}[${i}]`, fn));
            }
        }
        const backIndex = new Map();
        for (const [type, list] of Object.entries(byType)) {
            for (const rec of list) {
                eachRef(types[type].fields, rec, '', (id, f, p) => {
                    if (!backIndex.has(id)) backIndex.set(id, []);
                    backIndex.get(id).push({ record: rec, type, field: p.replace(/\[\d+\]/g, '') });
                });
            }
        }
        function backrefs(x, type, field) {
            const r = resolve(x);
            const hits = r ? (backIndex.get(r.id) || []) : [];
            return [...new Set(hits
                .filter(h => (!type || h.type === type) && (!field || h.field === field))
                .map(h => h.record))];
        }

        /* ---------- lookup by name (for legacy text that names things) ---------- */
        const normName = n => String(n || '').toLowerCase().replace(/[’']/g, "'").replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
        function find(name, typeList) {
            const n = normName(name);
            if (!n) return null;
            for (const t of typeList || Object.keys(types)) {
                const hit = (byType[t] || []).find(r => normName(r.name) === n || (r.aliases || []).some(a => normName(a) === n));
                if (hit) return hit;
            }
            return null;
        }

        /* ---------- URLs ---------- */
        function url(x) {
            if (x === 'world') return (schema.singletons && schema.singletons.world && schema.singletons.world.page) || null;
            const r = resolve(x);
            if (!r) return null;
            const page = types[typeOfRec.get(r)].page;
            if (!page) return null;
            return page
                .replace('{id}', encodeURIComponent(r.id))
                .replace('{parent}', encodeURIComponent(r.parent || ''));
        }

        /* ---------- the places and residents of a plane ----------
           plane.places[] and plane.groups[].members[] are not records: they live in
           their plane (plane.html), but their names link to it and have preview cards.
           Each gets an id "<plane>~<key>" (key = its own id, else made from its name)
           and an anchor on the plane's page (#place-<key>, #who-<key>). */
        const slugOf = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const partIndex = new Map();
        for (const plane of byType.plane || []) {
            const add = (item, part, extra) => {
                if (!item || !item.name) return;
                const key = slugOf(item.id || item.name);
                if (!key) return;
                const id = `${plane.id}~${key}`;
                if (!partIndex.has(id)) partIndex.set(id, { id, key, part, name: item.name, aliases: item.aliases || [], plane, item, anchor: `${part === 'place' ? 'place' : 'who'}-${key}`, ...extra });
            };
            (plane.places || []).forEach(p => add(p, 'place'));
            (plane.groups || []).forEach(g => ((g && g.members) || []).forEach(m => add(m, 'resident', { group: g })));
        }
        const planePart = id => partIndex.get(id) || null;
        const planeParts = (x, part) => { const r = resolve(x); return r ? [...partIndex.values()].filter(v => v.plane === r && (!part || v.part === part)) : []; };
        // Sealed in the campaign viewed? (its plane sealed, or itself)
        function partRevealed(x, cid) {
            const v = typeof x === 'string' ? planePart(x) : x;
            if (!v) return true;
            if (!revealed(v.plane, cid)) return false;
            if (!v.item.sealed) return true;
            const list = v.item.revealedIn || [];
            const c = cid === undefined ? viewCampaign() : cid;
            return isAll(c) ? list.length > 0 : list.includes(c);
        }
        function partUrl(x) {
            const v = typeof x === 'string' ? planePart(x) : x;
            const u = v ? url(v.plane) : null;
            return u ? `${u}#${v.anchor}` : null;
        }

        /* ---------- shared enums ---------- */
        function enumOptions(name) {
            return (schema.enums[name] || []).map(o => (typeof o === 'string' ? { id: o, label: o } : o));
        }
        function enumValues(name) { return enumOptions(name).map(o => o.id); }

        /* ---------- autolink ---------- */
        let linkIndex = null;
        // Spaces and hyphens, ' and ’ are interchangeable: "Void Air" matches "Void-air"
        const termKey = s => s.toLowerCase().replace(/[’]/g, "'").replace(/[\s-]+/g, ' ');
        const looseRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]+').replace(/['’]/g, "['’]");
        function buildLinkIndex() {
            const terms = new Map();
            for (const [type, def] of Object.entries(types)) {
                if (!def.autolink) continue;
                const typeCls = LINK_CLASS[type] || (def.place ? 'kw-place' : 'kw-lore');
                for (const rec of byType[type]) {
                    // An item nobody has found has no card to show yet (a god's
                    // artifact is only a legend until a session or a party lists it)
                    if (type === 'item' && !(backIndex.get(rec.id) || []).some(h => h.type !== 'deity')) continue;
                    // Glossary terms are coloured by their kind
                    const cls = type === 'lore' ? `kw-${rec.kind || 'lore'}` : typeCls;
                    for (const term of [rec.name, ...(rec.aliases || [])]) {
                        // Skip short terms and placeholders such as "??????".
                        if (!term || term.length < 3 || !/\p{L}/u.test(term)) continue;
                        const key = termKey(term);
                        if (!terms.has(key)) terms.set(key, { id: rec.id, href: url(rec), cls, rec });
                    }
                }
            }
            // A plane's own places and residents link to its page
            for (const v of partIndex.values()) {
                const cls = v.part === 'place' ? 'kw-place' : (v.item.divine ? 'kw-deity' : 'kw-person');
                for (const term of [v.name, ...v.aliases]) {
                    if (!term || term.length < 3 || !/\p{L}/u.test(term)) continue;
                    const key = termKey(term);
                    if (!terms.has(key)) terms.set(key, { id: v.id, href: partUrl(v), cls, rec: v.plane, part: v });
                }
            }
            const sorted = [...terms.keys()].sort((a, b) => b.length - a.length);
            const re = sorted.length
                ? new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map(looseRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
                : null;
            return { terms, re };
        }
        // Only touches text outside tags, never inside an existing <a>, nor inside
        // <span class="nolink"> (Markdown {text}); in text that is not Markdown,
        // {text} is kept plain too and loses its braces.
        // options: exclude (ids), className (added to each link), attrs (string,
        // or function(record) -> string), terms (also wrap glossary terms, which
        // have no page, in a <span>).
        function autolink(html, options = {}) {
            if (!html) return '';
            linkIndex = linkIndex || buildLinkIndex();
            if (!linkIndex.re) return html;
            const exclude = new Set([].concat(options.exclude || []));
            // A sealed Elder god stays plain text (options.campaign: default viewCampaign())
            const cid = options.campaign === undefined ? viewCampaign() : options.campaign;
            let inAnchor = 0, inCode = 0;
            const spans = [];   // for each open <span>: is it a nolink one?
            const link = text => text.replace(linkIndex.re, match => {
                    const t = linkIndex.terms.get(termKey(match));
                    if (!t || exclude.has(t.id)) return match;
                    if (!revealed(t.rec, cid)) return match;
                    if (t.part && !partRevealed(t.part, cid)) return match;
                    if (!t.href && !options.terms) return match;
                    const cls = options.className ? `${t.cls} ${options.className}` : t.cls;
                    const attrs = typeof options.attrs === 'function' ? options.attrs(t.rec, match) : options.attrs;
                    // data-kw: the record's id, for the preview cards (scripts/core/preview.js)
                    const extra = ` data-kw="${t.id}"` + (attrs ? ' ' + attrs : '');
                    return t.href
                        ? `<a href="${t.href}" class="${cls}"${extra}>${match}</a>`
                        : `<span class="${cls}"${extra}>${match}</span>`;
                });
            return html.split(/(<[^>]+>)/g).map(part => {
                if (part.startsWith('<')) {
                    if (/^<a[\s>]/i.test(part)) inAnchor++;
                    else if (/^<\/a>/i.test(part)) inAnchor = Math.max(0, inAnchor - 1);
                    else if (/^<span[\s>]/i.test(part)) spans.push(/\bclass="[^"]*\bnolink\b/.test(part));
                    else if (/^<\/span>/i.test(part)) spans.pop();
                    else if (/^<code[\s>]/i.test(part)) inCode++;
                    else if (/^<\/code>/i.test(part)) inCode = Math.max(0, inCode - 1);
                    return part;
                }
                if (!part || inCode) return part;   // code is shown as written
                // {text}: plain, without its braces
                const pieces = part.split(/\{([^{}\n]+)\}/g);
                if (inAnchor || spans.includes(true)) return pieces.join('');
                return pieces.map((p, i) => (i % 2 ? p : link(p))).join('');
            }).join('');
        }

        /* ---------- validation ---------- */
        function checkValue(f, v, where, report, isPrivateFile) {
            const { error, warn } = report;
            if (v === undefined || v === null || v === '') {
                if (f.required) error(`${where}: required`);
                return;
            }
            if (f.private && !isPrivateFile) error(`${where}: private field must live in data/private.json, not in the public file`);
            switch (f.kind) {
                case 'text': case 'markdown': case 'image': case 'url':
                    if (typeof v !== 'string') error(`${where}: expected text`);
                    break;
                case 'date': {
                    const m = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
                    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
                    if (!m || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) error(`${where}: expected a date written YYYY-MM-DD`);
                    break;
                }
                case 'time':
                    if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) error(`${where}: expected a time written HH:MM (24 h)`);
                    break;
                case 'worlddate': {
                    if (typeof v !== 'object' || Array.isArray(v)) { error(`${where}: expected a world date {year, month, day}`); break; }
                    const problem = calendar ? calendar.check(v, { yearly: !!f.yearly }) : '';
                    if (problem) error(`${where}: ${problem}`);
                    Object.keys(v).filter(k => !['year', 'month', 'day', 'approx'].includes(k)).forEach(k => warn(`${where}.${k}: not part of a world date (ignored)`));
                    break;
                }
                case 'number':
                    if (typeof v !== 'number' || Number.isNaN(v)) error(`${where}: expected a number`);
                    break;
                case 'boolean':
                    if (typeof v !== 'boolean') error(`${where}: expected true/false`);
                    break;
                case 'list':
                    if (!Array.isArray(v) || v.some(s => typeof s !== 'string')) { error(`${where}: expected a list of text`); break; }
                    // A list with `enum`: a set of ids from that enum (ticked boxes in the dashboard)
                    if (f.enum) v.filter(s => !enumValues(f.enum).includes(s)).forEach(s => error(`${where}: "${s}" is not one of ${enumValues(f.enum).join(', ')}`));
                    break;
                case 'enum': {
                    const allowed = f.enum ? enumValues(f.enum) : f.options;
                    if (!allowed.includes(v)) error(`${where}: "${v}" is not one of ${allowed.join(', ')}`);
                    break;
                }
                case 'ref': checkRef(f, v, where, report); break;
                case 'refs':
                    if (!Array.isArray(v)) { error(`${where}: expected a list of ids`); break; }
                    if (new Set(v).size !== v.length) warn(`${where}: same id listed twice`);
                    v.forEach((id, i) => checkRef(f, id, `${where}[${i}]`, report));
                    break;
                case 'map':
                    if (typeof v !== 'object' || typeof v.x !== 'number' || typeof v.y !== 'number') error(`${where}: needs numeric x and y`);
                    if (v.on !== undefined && typeof v.on !== 'string') error(`${where}.on: expected the id of a map`);
                    if (v.layer && !enumValues('mapLayer').includes(v.layer)) error(`${where}.layer: unknown layer "${v.layer}"`);
                    else if (v.layer && !f.layers) warn(`${where}.layer: only the world map has layers, so it is ignored here`);
                    break;
                case 'mapImage':
                    if (typeof v !== 'object' || !v.src || typeof v.width !== 'number' || typeof v.height !== 'number') error(`${where}: needs src, width and height`);
                    break;
                case 'object':
                    if (typeof v !== 'object' || Array.isArray(v)) { error(`${where}: expected an object`); break; }
                    checkFields(f.fields, v, where, report, isPrivateFile);
                    break;
                case 'objects':
                    if (!Array.isArray(v)) { error(`${where}: expected a list`); break; }
                    v.forEach((o, i) => checkFields(f.fields, o, `${where}[${i}]`, report, isPrivateFile));
                    break;
                case 'json': break;
                case 'sealed':
                    if (typeof v !== 'object' || ['salt', 'iv', 'data'].some(k => typeof v[k] !== 'string')) error(`${where}: expected {salt, iv, data} (written by the dashboard)`);
                    break;
                default: error(`${where}: schema uses unknown field kind "${f.kind}"`);
            }
        }
        function checkRef(f, id, where, { error }) {
            if (typeof id !== 'string') { error(`${where}: expected an id`); return; }
            const target = byId.get(id);
            if (!target) { error(`${where}: "${id}" does not exist`); return; }
            const t = typeOfRec.get(target);
            if (!f.to.includes(t)) error(`${where}: "${id}" is a ${t}, expected ${f.to.join(' or ')}`);
        }
        function checkFields(fields, obj, where, report, isPrivateFile) {
            for (const key of Object.keys(obj)) {
                if (!fields[key] && !BASE_KEYS.includes(key)) report.warn(`${where}.${key}: not in the schema (ignored by the site)`);
            }
            for (const [key, f] of Object.entries(fields)) checkValue(f, obj[key], `${where}.${key}`, report, isPrivateFile);
        }

        function validate() {
            const errors = [...loadIssues], warnings = [];
            const report = { error: m => errors.push(m), warn: m => warnings.push(m) };
            const seen = new Map();

            for (const [type, def] of Object.entries(types)) {
                (raw[type] || []).forEach((rec, i) => {
                    const where = `[${type}] ${rec && rec.id ? rec.id : `#${i}`}`;
                    if (!rec || typeof rec !== 'object') { errors.push(`${where}: not an object`); return; }
                    if (typeof rec.id !== 'string' || !ID_RE.test(rec.id)) errors.push(`${where}: id must be lowercase letters, digits, - or _`);
                    else if (seen.has(rec.id)) errors.push(`${where}: id already used by a ${seen.get(rec.id)}`);
                    else seen.set(rec.id, type);
                    if (!rec.name) errors.push(`${where}: name is missing`);
                    if (rec.aliases !== undefined && !Array.isArray(rec.aliases)) errors.push(`${where}.aliases: expected a list`);

                    if (def.place) {
                        if (def.parent.length === 0) {
                            if (rec.parent) errors.push(`${where}.parent: a ${type} sits on the world map and has no parent`);
                        } else if (!rec.parent) {
                            errors.push(`${where}.parent: required (${def.parent.join(' or ')})`);
                        } else {
                            checkRef({ to: def.parent }, rec.parent, `${where}.parent`, report);
                        }
                        if (rec.map) {
                            const host = def.parent.length === 0 ? singletons.world : parent(rec);
                            // A POI inside an institution is pinned on one of the institution's maps
                            const hostMaps = host && typeOfRec.get(host) === 'poi' ? institutionMaps(host) : [];
                            if (host && !host.mapImage && !hostMaps.length) warnings.push(`${where}.map: pinned on ${host.id || 'the world'}, which has no map image`);
                        }
                    } else if (rec.parent !== undefined) {
                        warnings.push(`${where}.parent: ${type} is not a place; use a reference field instead`);
                    }
                    checkFields(def.fields, rec, where, report, false);
                });
            }

            // Parent cycles
            for (const rec of byId.values()) {
                const seenUp = new Set([rec.id]);
                let p = parent(rec);
                while (p) {
                    if (seenUp.has(p.id)) { errors.push(`[${typeOfRec.get(rec)}] ${rec.id}.parent: cycle through ${p.id}`); break; }
                    seenUp.add(p.id); p = parent(p);
                }
            }

            // Potion cards (item.potion, made by the dashboard's “Brew a potion”): the four
            // parts of the recipe must still exist, or the card can't draw its bottle
            for (const rec of byType.item || []) {
                const recipe = rec.potion && typeof rec.potion === 'object' ? rec.potion.recipe : null;
                if (!rec.potion) continue;
                if (!recipe || typeof recipe !== 'object') { warnings.push(`[item] ${rec.id}.potion: no recipe, so the card shows no bottle`); continue; }
                for (const [part, type] of [['vessel', 'vessel'], ['solvent', 'solvent'], ['active', 'principle'], ['catalyst', 'catalyst']]) {
                    const target = byId.get(recipe[part]);
                    if (!target || typeOfRec.get(target) !== type) warnings.push(`[item] ${rec.id}.potion: its ${types[type] ? types[type].label.toLowerCase() : part} "${recipe[part] ?? ''}" no longer exists, so the card shows no bottle`);
                }
            }

            // Private overlay
            for (const [type, entries] of Object.entries(privateData || {})) {
                if (!types[type]) { errors.push(`[private] unknown type "${type}"`); continue; }
                for (const [id, fields] of Object.entries(entries || {})) {
                    const target = byId.get(id);
                    if (!target || typeOfRec.get(target) !== type) { errors.push(`[private] ${type} "${id}" does not exist`); continue; }
                    for (const [k, v] of Object.entries(fields)) {
                        const f = types[type].fields[k];
                        if (!f || !f.private) errors.push(`[private] ${type} ${id}.${k}: not a private field in the schema`);
                        else checkValue({ ...f, private: false }, v, `[private] ${id}.${k}`, report, true);
                    }
                }
            }

            // Sealed fields: a private text with no encrypted copy is not on the site yet
            for (const [type, def] of Object.entries(types)) {
                for (const [key, f] of Object.entries(def.fields)) {
                    if (f.kind !== 'sealed') continue;
                    for (const rec of byType[type]) {
                        const text = rec[f.from], pw = rec[f.password];
                        if (text && !pw) warnings.push(`[${type}] ${rec.id}.${f.password}: ${f.from} has no password, so it is not published`);
                        else if (text && pw && !rec[key]) warnings.push(`[${type}] ${rec.id}.${key}: not encrypted yet (save from the dashboard)`);
                    }
                }
            }

            // One-object files
            for (const [name, def] of Object.entries(schema.singletons || {})) {
                const v = (singletonData || {})[name];
                if (v === undefined) { if (Object.values(def.fields).some(f => f.required)) errors.push(`[${name}] ${def.file} was not loaded`); continue; }
                if (typeof v !== 'object' || Array.isArray(v)) { errors.push(`[${name}] ${def.file} must be a JSON object`); continue; }
                checkFields(def.fields, v, `[${name}]`, report, false);
            }

            // Map pins: their picture must be one of data/map-icons.json (when that list exists)
            const iconList = ((singletonData || {}).mapIcons || {}).icons;
            if (Array.isArray(iconList) && iconList.length) {
                const known = new Set();
                for (const ic of iconList) {
                    if (!ic || !ic.id) continue;
                    if (known.has(ic.id)) errors.push(`[mapIcons] icons: "${ic.id}" is listed twice`);
                    known.add(ic.id);
                }
                for (const [type, def] of Object.entries(types)) {
                    if (!def.place) continue;
                    for (const rec of byType[type] || []) {
                        const icon = rec.map && rec.map.icon;
                        if (icon && !known.has(icon)) warnings.push(`[${type}] ${rec.id}.map.icon: "${icon}" is not one of the map icons (Site › Map icons)`);
                    }
                }
            }

            // Type-specific rules
            const seenNumbers = new Map();
            for (const s of byType.session || []) {
                if (typeof s.number !== 'number') continue;
                const key = `${s.campaign}#${s.number}`;
                if (seenNumbers.has(key)) warnings.push(`[session] ${s.id}.number: ${s.number} is also used by ${seenNumbers.get(key)} in the same campaign`);
                else seenNumbers.set(key, s.id);
            }
            for (const s of byType.spell || []) {
                if (typeof s.level === 'number' && !(Number.isInteger(s.level) && s.level >= 0 && s.level <= 9)) errors.push(`[spell] ${s.id}.level: must be a whole number from 0 (cantrip) to 9`);
                if (s.materials && !s.material) warnings.push(`[spell] ${s.id}.materials: written, but "material" is not ticked, so the card hides them`);
            }
            for (const c of byType.campaign || []) {
                const heroesSeen = new Set();
                (c.spellbooks || []).forEach((b, i) => {
                    if (!b.hero) return;
                    if (!(c.party || []).includes(b.hero)) warnings.push(`[campaign] ${c.id}.spellbooks[${i}]: "${b.hero}" is not in this campaign's party`);
                    if (heroesSeen.has(b.hero)) warnings.push(`[campaign] ${c.id}.spellbooks[${i}]: "${b.hero}" has two spellbooks here (only the first is shown)`);
                    heroesSeen.add(b.hero);
                });
            }
            for (const n of byType.npc || []) {
                const seen = new Set();
                (n.campaigns || []).forEach((e, i) => {
                    if (!e || !e.campaign) return;
                    if (seen.has(e.campaign)) warnings.push(`[npc] ${n.id}.campaigns[${i}]: "${e.campaign}" is listed twice (only the first counts)`);
                    seen.add(e.campaign);
                });
            }
            const tiers = enumValues('tavernTier');
            for (const type of ['menuItem', 'shopGood']) {
                for (const item of byType[type] || []) {
                    if (tiers.indexOf(item.minTier) > tiers.indexOf(item.maxTier)) errors.push(`[${type}] ${item.id}: minTier is above maxTier`);
                }
            }
            const artifactOf = new Map();
            for (const d of byType.deity || []) {
                if (!d.tier) warnings.push(`[deity] ${d.id}.tier: not set (shown with the Great Pantheon)`);
                if ((d.revealedIn || []).length && d.tier !== 'elder') warnings.push(`[deity] ${d.id}.revealedIn: only Elder gods are sealed, so this list is ignored`);
                if (d.artifactLegend && !d.artifact) warnings.push(`[deity] ${d.id}.artifactLegend: written, but no artifact is chosen, so it is not shown`);
                if (d.artifact) {
                    if (artifactOf.has(d.artifact)) warnings.push(`[deity] ${d.id}.artifact: "${d.artifact}" is already the artifact of ${artifactOf.get(d.artifact)}`);
                    else artifactOf.set(d.artifact, d.id);
                }
            }
            // Institutions: map ids, and the pins of the places inside them
            for (const p of byType.poi || []) {
                const inst = p.institution || {};
                const ids = new Set();
                (inst.maps || []).forEach((m, i) => {
                    if (!m || !m.id) return;
                    if (!ID_RE.test(m.id)) errors.push(`[poi] ${p.id}.institution.maps[${i}].id: lowercase letters, digits, - or _ only`);
                    else if (ids.has(m.id)) errors.push(`[poi] ${p.id}.institution.maps[${i}].id: "${m.id}" is used twice`);
                    ids.add(m.id);
                });
                (inst.groups || []).forEach((g, i) => {
                    const seenNpc = new Set();
                    ((g && g.members) || []).forEach((m, j) => {
                        if (!m || !m.npc) return;
                        if (seenNpc.has(m.npc)) warnings.push(`[poi] ${p.id}.institution.groups[${i}].members[${j}]: "${m.npc}" is listed twice in this group`);
                        seenNpc.add(m.npc);
                    });
                });
                if (p.institution && !(inst.maps || []).length && !(inst.groups || []).length && !children(p, 'poi').length) {
                    warnings.push(`[poi] ${p.id}.institution: no map, no group and no place inside it yet, so its page shows nothing more`);
                }
                const host = parent(p);
                const on = p.map && p.map.on;
                if (on && (!host || typeOfRec.get(host) !== 'poi')) warnings.push(`[poi] ${p.id}.map.on: only a place inside an institution chooses a map, so it is ignored`);
                else if (on && !((host.institution || {}).maps || []).some(m => m && m.id === on)) {
                    errors.push(`[poi] ${p.id}.map.on: "${on}" is not a map of ${host.id}`);
                }
            }
            // Fighting pits: fighters, fight nights, fixed fights (scripts/pit.js)
            for (const p of byType.poi || []) {
                if (!p.pit) { if ((p.pitFixes || []).length) warnings.push(`[poi] ${p.id}.pitFixes: no fighting pit here, so they are ignored`); continue; }
                const where = `[poi] ${p.id}.pit`;
                const names = [];
                (p.pit.fighters || []).forEach((f, i) => {
                    if (!f) return;
                    if (f.npc && f.creature) warnings.push(`${where}.fighters[${i}]: both an NPC and a creature: the NPC fights`);
                    const rec = resolve(f.npc) || resolve(f.creature);
                    const name = String(f.name || '').trim() || (rec && rec.name) || '';
                    if (!name) warnings.push(`${where}.fighters[${i}]: no NPC, no creature and no name, so it never fights`);
                    else names.push(name.toLowerCase());
                });
                if (names.length < 2) warnings.push(`${where}.fighters: two fighters or more are needed, so the Pit tab shows no bout`);
                const days = ((calendar && calendar.weekdays) || []).map(w => w.toLowerCase());
                if (calendar && days.length) (p.pit.nights || []).forEach(n => {
                    if (String(n || '').trim() && !days.includes(String(n).trim().toLowerCase())) warnings.push(`${where}.nights: “${n}” is not a day of the week (${calendar.weekdays.join(', ')})`);
                });
                (p.pitFixes || []).forEach((f, i) => {
                    if (f && f.winner && !names.includes(String(f.winner).trim().toLowerCase())) warnings.push(`[poi] ${p.id}.pitFixes[${i}].winner: “${f.winner}” is not one of this pit’s fighters`);
                });
            }
            // Divination: practices, seers and the prophecies read at them
            const spreadSize = sp => ((sp && sp.positions) || []).length;
            for (const pr of byType.practice || []) {
                if (pr.method === 'cards') {
                    if (!pr.deck) { warnings.push(`[practice] ${pr.id}.deck: a card practice needs a deck`); continue; }
                    const deckSize = (byType.fortuneCard || []).filter(c => c.deck === pr.deck).length;
                    const spreads = (pr.spreads || []).length ? pr.spreads.map(resolve).filter(Boolean) : (byType.spread || []);
                    if (!spreads.some(sp => spreadSize(sp) && spreadSize(sp) <= deckSize)) warnings.push(`[practice] ${pr.id}: no spread fits its deck (${deckSize} card${deckSize === 1 ? '' : 's'}), so it gives no reading`);
                } else if (pr.method === 'cast') {
                    if (!pr.pieceSet) warnings.push(`[practice] ${pr.id}.pieceSet: a cast practice needs a piece set`);
                    else if (!(byType.castPiece || []).some(c => c.pieceSet === pr.pieceSet)) warnings.push(`[practice] ${pr.id}: its set has no piece yet, so it gives no reading`);
                } else if (pr.method === 'omen' && !(byType.omen || []).some(o => o.practice === pr.id)) {
                    warnings.push(`[practice] ${pr.id}: no omen in its pool, so it gives no reading`);
                }
            }
            for (const o of byType.omen || []) {
                const pr = resolve(o.practice);
                if (pr && pr.method !== 'omen') warnings.push(`[omen] ${o.id}.practice: "${o.practice}" draws cards, so this omen is never drawn`);
            }
            for (const p of byType.poi || []) {
                if (p.divination && !(p.divination.practices || []).length) warnings.push(`[poi] ${p.id}.divination: no practice offered, so the page has no Readings tab`);
            }
            for (const cp of byType.castPiece || []) {
                if (!cp.glyph && !cp.image) warnings.push(`[castPiece] ${cp.id}: no glyph drawn and no picture, so it shows its initial`);
            }
            // Reading rules: what they look for must be able to come up
            for (const rr of byType.readingRule || []) {
                const where = `[readingRule] ${rr.id}`;
                const cards = (rr.cards || []).map(resolve).filter(Boolean);
                if (!(rr.texts || []).some(t => String(t || '').trim())) warnings.push(`${where}.texts: nothing to say`);
                if (rr.when === 'card' || rr.when === 'together') {
                    if (!cards.length) { warnings.push(`${where}.cards: no card chosen, so it never speaks`); continue; }
                    if (rr.when === 'together' && cards.length < 2) warnings.push(`${where}.cards: "together" needs two cards or more`);
                    if (rr.when === 'together' && new Set(cards.map(c => c.deck || c.pieceSet)).size > 1) warnings.push(`${where}.cards: cards or pieces of different decks or sets are never drawn together`);
                }
                if (rr.when === 'card' && typeof rr.position === 'number') {
                    const spreads = (rr.spreads || []).length ? rr.spreads.map(resolve).filter(Boolean) : (byType.spread || []);
                    if (!spreads.some(sp => spreadSize(sp) >= rr.position)) warnings.push(`${where}.position: no spread has a position ${rr.position}`);
                }
            }
            for (const pp of byType.prophecy || []) {
                const where = `[prophecy] ${pp.id}`;
                const seer = resolve(pp.where);
                const pr = resolve(pp.practice);
                if (!(pp.campaigns || []).length) warnings.push(`${where}.campaigns: no campaign, so no one gets it`);
                if (seer && !((seer.divination || {}).practices || []).includes(pp.practice)) warnings.push(`${where}.practice: "${pp.practice}" is not offered at ${seer.id}, so no one gets it`);
                if (!pr) continue;
                if (pr.method === 'cast') { warnings.push(`${where}.practice: a cast is never fixed by a prophecy, so no one gets it`); continue; }
                if (pr.method === 'omen') {
                    if (!pp.omen) warnings.push(`${where}.omen: an omen practice, but no omen is written`);
                    continue;
                }
                const cards = (pp.cards || []).filter(c => c && c.card);
                if (!cards.length) { warnings.push(`${where}.cards: no card chosen`); continue; }
                const sp = resolve(pp.spread);
                if (!pp.spread) warnings.push(`${where}.spread: no spread, so its cards have no positions`);
                else if (sp && spreadSize(sp) !== cards.length) warnings.push(`${where}.cards: ${cards.length} card${cards.length === 1 ? '' : 's'} for a spread of ${spreadSize(sp)}`);
                const ids = cards.map(c => c.card);
                if (new Set(ids).size !== ids.length) warnings.push(`${where}.cards: the same card is laid twice`);
                cards.forEach((c, i) => {
                    const card = resolve(c.card);
                    if (card && pr.deck && card.deck !== pr.deck) warnings.push(`${where}.cards[${i}]: "${c.card}" is not in the deck of ${pr.id}`);
                });
            }
            // The orrery: every plane needs a place on it
            const planes = byType.plane || [];
            const centres = planes.filter(p => p.kind === 'centre');
            if (centres.length > 2) warnings.push(`[plane] ${centres.slice(2).map(p => p.id).join(', ')}: only the first two planes of the centre are drawn`);
            const beyond = planes.filter(p => p.kind === 'beyond');
            if (beyond.length > 3) warnings.push(`[plane] ${beyond.slice(3).map(p => p.id).join(', ')}: only three planes fit beyond the circles`);
            if (planes.filter(p => p.kind === 'between').length > 1) warnings.push('[plane] more than one plane between the planes: only the first is drawn');
            for (const p of planes) {
                const where = `[plane] ${p.id}`;
                if (p.kind === 'circle' && !(Number(p.circle) >= 1)) warnings.push(`${where}.circle: not set (it goes on circle 1)`);
                if (p.kind === 'overlay' && !p.over) warnings.push(`${where}.over: not set (its medallion sits on the first plane of the centre)`);
                if (p.kind === 'overlay' && p.over && (resolve(p.over) || {}).kind !== 'centre') warnings.push(`${where}.over: "${p.over}" is not at the centre`);
                if (p.sealed && !(p.revealedIn || []).length) warnings.push(`${where}.revealedIn: sealed and learned in no campaign yet`);
                (p.roads || []).forEach((rd, i) => {
                    const to = rd && rd.to ? resolve(rd.to) : null;
                    if (to && (to.kind || 'circle') !== 'circle') warnings.push(`${where}.roads[${i}]: “${to.name}” is not on a circle, so the road is not drawn`);
                    if ((p.kind || 'circle') === 'circle') warnings.push(`${where}.roads[${i}]: roads start from the centre, a ring or beneath it, not from a plane on a circle`);
                });
                // Its maps, places and residents
                const mapIds = (p.maps || []).map(m => m && m.id).filter(Boolean);
                const keys = new Map();
                const seen = (key, label) => { if (keys.has(key)) warnings.push(`${where}: “${label}” and “${keys.get(key)}” share the id “${key}”: set an id on one of them`); else keys.set(key, label); };
                (p.places || []).forEach((pl, i) => {
                    if (!pl || !pl.name) return;
                    seen(slugOf(pl.id || pl.name), pl.name);
                    const on = pl.pin && pl.pin.on;
                    if (pl.pin && pl.pin.x != null && !mapIds.length) warnings.push(`${where}.places[${i}]: “${pl.name}” is pinned but the plane has no map`);
                    if (on && !mapIds.includes(on)) warnings.push(`${where}.places[${i}].pin.on: no map “${on}”`);
                    if (pl.sealed && !(pl.revealedIn || []).length) warnings.push(`${where}.places[${i}]: “${pl.name}” is sealed and learned in no campaign yet`);
                });
                (p.groups || []).forEach((g, i) => ((g && g.members) || []).forEach((m, j) => {
                    if (!m || !m.name) return;
                    seen(slugOf(m.id || m.name), m.name);
                    if (m.sealed && !(m.revealedIn || []).length) warnings.push(`${where}.groups[${i}].members[${j}]: “${m.name}” is sealed and met in no campaign yet`);
                }));
            }
            // The timeline: every event needs a place on it
            for (const ev of byType.event || []) {
                const where = `[event] ${ev.id}`;
                const hasDate = ev.date && ev.date.year !== undefined && ev.date.year !== '';
                if (ev.oldDays && hasDate) warnings.push(`${where}.date: an event of the Old Days has no date (its order places it)`);
                if (!ev.oldDays && !hasDate) warnings.push(`${where}.date: no date and not in the Old Days, so it is not on the timeline`);
                if (calendar && hasDate && ev.end && ev.end.year !== undefined && !calendar.check(ev.date) && !calendar.check(ev.end) && calendar.compare(ev.end, ev.date) < 0) errors.push(`${where}.end: before its date`);
                if (ev.sealed && !(ev.revealedIn || []).length) warnings.push(`${where}.revealedIn: hidden history no campaign has learned yet (a sealed page everywhere)`);
            }
            for (const r of byType.rumour || []) {
                const w = resolve(r.where);
                if (!w) continue;
                const taverns = (typeOfRec.get(w) === 'poi' ? [w] : descendants(w, 'poi')).filter(p => p.tavern && p.tavern.tier);
                if (!taverns.length) warnings.push(`[rumour] ${r.id}.where: no tavern at or under "${r.where}", so no one hears it`);
            }

            // Hidden from players: what a visible record would leak, or lose, on the site
            if (hidden.size) {
                const label = id => { const h = byId.get(id); return h ? `“${h.name || id}”` : `"${id}"`; };
                // the names of hidden records (3+ letters), to spot them in visible texts
                const names = [];
                for (const id of hidden) {
                    const h = byId.get(id);
                    if (!h) continue;
                    for (const n of [h.name, ...(h.aliases || [])]) {
                        const t = String(n || '').trim();
                        if (t.length >= 3) names.push({ id, re: new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu') });
                    }
                }
                const eachText = (fields, value, path, fn) => {
                    if (!value || typeof value !== 'object') return;
                    for (const [key, f] of Object.entries(fields || {})) {
                        const v = value[key];
                        if (v === undefined || v === null || v === '' || f.private) continue;
                        const p = path ? `${path}.${key}` : key;
                        if ((f.kind === 'markdown' || f.kind === 'text') && typeof v === 'string') fn(v, p);
                        else if (f.kind === 'object') eachText(f.fields, v, p, fn);
                        else if (f.kind === 'objects' && Array.isArray(v)) v.forEach((o, i) => eachText(f.fields, o, `${p}[${i}]`, fn));
                    }
                };
                for (const [type, def] of Object.entries(types)) {
                    if (def.dmOnly) continue;
                    for (const rec of byType[type] || []) {
                        if (hidden.has(rec.id)) continue;
                        const seenRef = new Set();
                        eachRef(def.fields, rec, '', (id, f, p) => {
                            if (!hidden.has(id) || seenRef.has(id)) return;
                            seenRef.add(id);
                            warnings.push(`[${type}] ${rec.id}.${p}: ${label(id)} is hidden from players, so the site leaves it out here`);
                        });
                        const seenName = new Set();
                        if (names.length) eachText(def.fields, rec, '', (text, p) => {
                            for (const n of names) {
                                if (seenName.has(n.id) || !n.re.test(text)) continue;
                                seenName.add(n.id);
                                warnings.push(`[${type}] ${rec.id}.${p}: names ${label(n.id)}, which is hidden from players (the name shows, as plain text)`);
                            }
                        });
                    }
                }
            }
            if (hidden.size) {
                for (const [name, def] of Object.entries(schema.singletons || {})) {
                    eachRef(def.fields, singletons[name], '', (id, f, p) => {
                        const h = byId.get(id);
                        if (hidden.has(id)) warnings.push(`[${name}] ${p}: “${(h && h.name) || id}” is hidden from players, so the site leaves it out here`);
                    });
                }
            }
            for (const [type, list] of Object.entries(byType)) {
                for (const rec of list) if (rec.hidden !== undefined && typeof rec.hidden !== 'boolean') warnings.push(`[${type}] ${rec.id}.hidden: must be true or false`);
            }
            return { errors, warnings };
        }

        return {
            schema, settings: singletons.settings || {}, world: singletons.world || {}, singletons, get: resolve, typeOf,
            all: type => (byType[type] || []).slice(),
            find, parent, ancestors, children, descendants, backrefs,
            url, enumOptions, enumValues,
            md: (t, o) => (ATH.md ? ATH.md(t, o) : t),
            plain: t => (ATH.mdPlain ? ATH.mdPlain(t) : t),
            autolink, validate, hidden,
            campaignEntries, inCampaign, standing,
            viewCampaign, revealed, calendar,
            planePart, planeParts, partRevealed, partUrl,
        };
    }

    ATH.createStore = createStore;

    /* ---------- browser loader ---------- */
    // Pages load over HTTP automatically. The dashboard sets Athenaeum.manualLoad
    // and reads the files through the linked folder instead.
    const DRAFTS_KEY = 'athenaeum.drafts';
    function draftPreview() {
        try {
            const q = new URLSearchParams(root.location.search).get('drafts');
            if (q === '0') root.sessionStorage.removeItem(DRAFTS_KEY);
            else if (q !== null) root.sessionStorage.setItem(DRAFTS_KEY, '1');
            return root.sessionStorage.getItem(DRAFTS_KEY) === '1';
        } catch (e) { return false; }
    }
    // A small tag in the corner while hidden records are shown (DM preview)
    function draftBadge() {
        const add = () => {
            if (document.getElementById('ath-drafts')) return;
            const a = document.createElement('a');
            a.id = 'ath-drafts';
            const u = new URL(root.location.href); u.searchParams.set('drafts', '0');
            a.href = u.toString();
            a.title = 'Hidden records are shown: only on your copy (data/private.json). Click to see the site as players do.';
            a.textContent = 'DM preview · hidden content shown ✕';
            a.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:999px;font:600 12px/1.4 system-ui,sans-serif;'
                + 'background:#2a1838ee;color:#f2d68a;border:1px solid #f2d68a66;text-decoration:none;box-shadow:0 4px 14px #0008';
            document.documentElement.appendChild(a);   // (outside <body>: a page style may move fixed boxes in it)
        };
        if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
    }

    if (typeof document !== 'undefined' && typeof fetch === 'function' && !ATH.manualLoad) {
        const script = document.currentScript;
        const base = script && script.src ? script.src.replace(/scripts\/core\/store\.js(\?.*)?$/, '') : './';
        ATH.base = base;
        const getJSON = async (path, optional) => {
            const res = await fetch(base + path, { cache: 'no-cache' });
            if (!res.ok) {
                if (optional) return undefined;
                throw new Error(`${path}: HTTP ${res.status}`);
            }
            return res.json();
        };
        ATH.ready = (async () => {
            if (!ATH.schema) throw new Error('Load data/schema.js before scripts/core/store.js');
            const entries = await Promise.all(Object.entries(ATH.schema.types).map(async ([type, def]) => {
                if (def.dmOnly) return [type, undefined];   // DM-only types never reach the site
                try { return [type, await getJSON(def.file)]; }
                catch (e) { console.error('[Athenaeum]', e.message); return [type, undefined]; }
            }));
            const privateData = await getJSON('data/private.json', true).catch(() => undefined);
            const singles = await Promise.all(Object.entries(ATH.schema.singletons || {}).map(async ([name, def]) =>
                [name, await getJSON(def.file, true).catch(() => undefined)]));
            /* Hidden records never reach the pages, unless the DM preview is on:
               ?drafts=1 in the address (kept for the browser tab; ?drafts=0 ends it),
               and only where data/private.json loads, i.e. on the DM's own copy. */
            let datasets = Object.fromEntries(entries), priv = privateData, singletons = Object.fromEntries(singles);
            if (!(privateData !== undefined && draftPreview())) {
                ({ datasets, privateData: priv, singletonData: singletons } = withoutHidden(ATH.schema, datasets, privateData, singletons));
            } else if (hiddenIds(ATH.schema, datasets).size) draftBadge();
            ATH.store = createStore(ATH.schema, datasets, priv, singletons);
            return ATH.store;
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);