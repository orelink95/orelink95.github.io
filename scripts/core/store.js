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
                                                 with {terms: true})
       store.find('The Gilded Goldfinch')     -> record by name or alias
       store.validate()                       -> {errors, warnings}
       store.world / store.settings           -> data/world.json, data/settings.json
   Node tools build a store from files with Athenaeum.createStore().
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
    const BASE_KEYS = ['id', 'name', 'aliases', 'parent'];
    const LINK_CLASS = { npc: 'kw-person', faction: 'kw-faction', creature: 'kw-monster', item: 'kw-object', spell: 'kw-spell' };

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

        const resolve = x => (typeof x === 'string' ? byId.get(x) : x) || null;
        const typeOf = x => { const r = resolve(x); return r ? typeOfRec.get(r) : null; };

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
                    // An item nobody has found has no card to show yet
                    if (type === 'item' && !(backIndex.get(rec.id) || []).length) continue;
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
            const sorted = [...terms.keys()].sort((a, b) => b.length - a.length);
            const re = sorted.length
                ? new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map(looseRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
                : null;
            return { terms, re };
        }
        // Only touches text outside tags, and never inside an existing <a>.
        // options: exclude (ids), className (added to each link), attrs (string,
        // or function(record) -> string), terms (also wrap glossary terms, which
        // have no page, in a <span>).
        function autolink(html, options = {}) {
            if (!html) return '';
            linkIndex = linkIndex || buildLinkIndex();
            if (!linkIndex.re) return html;
            const exclude = new Set([].concat(options.exclude || []));
            let inAnchor = 0;
            return html.split(/(<[^>]+>)/g).map(part => {
                if (part.startsWith('<')) {
                    if (/^<a[\s>]/i.test(part)) inAnchor++;
                    else if (/^<\/a>/i.test(part)) inAnchor = Math.max(0, inAnchor - 1);
                    return part;
                }
                if (inAnchor || !part) return part;
                return part.replace(linkIndex.re, match => {
                    const t = linkIndex.terms.get(termKey(match));
                    if (!t || exclude.has(t.id)) return match;
                    if (!t.href && !options.terms) return match;
                    const cls = options.className ? `${t.cls} ${options.className}` : t.cls;
                    const attrs = typeof options.attrs === 'function' ? options.attrs(t.rec, match) : options.attrs;
                    const extra = attrs ? ' ' + attrs : '';
                    return t.href
                        ? `<a href="${t.href}" class="${cls}"${extra}>${match}</a>`
                        : `<span class="${cls}"${extra}>${match}</span>`;
                });
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
                case 'number':
                    if (typeof v !== 'number' || Number.isNaN(v)) error(`${where}: expected a number`);
                    break;
                case 'boolean':
                    if (typeof v !== 'boolean') error(`${where}: expected true/false`);
                    break;
                case 'list':
                    if (!Array.isArray(v) || v.some(s => typeof s !== 'string')) error(`${where}: expected a list of text`);
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
                    if (v.layer && !enumValues('mapLayer').includes(v.layer)) error(`${where}.layer: unknown layer "${v.layer}"`);
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
                            if (host && !host.mapImage) warnings.push(`${where}.map: pinned on ${host.id || 'the world'}, which has no map image`);
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
            const tiers = enumValues('tavernTier');
            for (const item of byType.menuItem || []) {
                if (tiers.indexOf(item.minTier) > tiers.indexOf(item.maxTier)) errors.push(`[menuItem] ${item.id}: minTier is above maxTier`);
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
            autolink, validate,
        };
    }

    ATH.createStore = createStore;

    /* ---------- browser loader ---------- */
    // Pages load over HTTP automatically. The dashboard sets Athenaeum.manualLoad
    // and reads the files through the linked folder instead.
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
                try { return [type, await getJSON(def.file)]; }
                catch (e) { console.error('[Athenaeum]', e.message); return [type, undefined]; }
            }));
            const privateData = await getJSON('data/private.json', true).catch(() => undefined);
            const singles = await Promise.all(Object.entries(ATH.schema.singletons || {}).map(async ([name, def]) =>
                [name, await getJSON(def.file, true).catch(() => undefined)]));
            ATH.store = createStore(ATH.schema, Object.fromEntries(entries), privateData, Object.fromEntries(singles));
            return ATH.store;
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);