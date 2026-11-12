/* =====================================================================
   ATHENAEUM DASHBOARD
   ---------------------------------------------------------------------
   Everything on screen is generated from data/schema.js: the nav, the
   lists and the forms. Add a type or a field to the schema and it shows
   up here with no change to this file. How a field looks is said in the
   schema too: section, width, help, showIf… (see its header).

   Files are read and written through the linked project folder (File
   System Access API), so the page also works opened straight from disk.
   ?test reads the served repo over HTTP and keeps writes in memory.
   ===================================================================== */
(() => {
    'use strict';
    const ATH = window.Athenaeum;
    const schema = ATH.schema;
    const TYPES = schema.types;
    const SINGLES = schema.singletons || {};
    const PRIVATE_FILE = 'data/private.json';
    const BASE_KEYS = ['id', 'name', 'aliases', 'parent'];
    const TEST = new URLSearchParams(location.search).has('test');

    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae')
        .replace(/['’]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
    const MD_HELP = 'Markdown: a blank line starts a new paragraph · **bold** · *italic* · [text](url) · > quote, with > — Name on its last line';

    /* =================================================================
       FILES
       ================================================================= */
    let rootHandle = null;
    async function dirOf(path, create) {
        let dir = rootHandle;
        for (const part of path.split('/').slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
        return dir;
    }
    const folderIO = {
        async read(path) {
            try {
                const fh = await (await dirOf(path, false)).getFileHandle(path.split('/').pop());
                return await (await fh.getFile()).text();
            } catch (e) {
                if (e.name === 'NotFoundError' || e.name === 'TypeError') return null;
                throw e;
            }
        },
        async write(path, text) {
            const fh = await (await dirOf(path, true)).getFileHandle(path.split('/').pop(), { create: true });
            const w = await fh.createWritable();
            await w.write(text);
            await w.close();
        },
        async url(path) {
            const fh = await (await dirOf(path, false)).getFileHandle(path.split('/').pop());
            return URL.createObjectURL(await fh.getFile());
        },
        async list(dirPath) {
            let dir = rootHandle;
            for (const part of dirPath.split('/')) dir = await dir.getDirectoryHandle(part);
            const names = [];
            for await (const [name, h] of dir.entries()) if (h.kind === 'file') names.push(name);
            return names.sort();
        },
        // Path of a picked file relative to the project root (null if outside).
        async pick(accept) {
            const [fh] = await window.showOpenFilePicker({ startIn: rootHandle, types: accept ? [{ description: 'Images', accept }] : undefined });
            const parts = await rootHandle.resolve(fh);
            return parts ? parts.join('/') : null;
        },
        name: () => rootHandle.name,
    };
    const testIO = {
        writes: {},
        async read(path) {
            if (path in this.writes) return this.writes[path];
            const res = await fetch('../' + path, { cache: 'no-cache' });
            return res.ok ? res.text() : null;
        },
        async write(path, text) { this.writes[path] = text; },
        async url(path) { return '../' + path; },
        async list() { return null; },
        async pick() { return null; },
        name: () => 'test mode (writes kept in memory)',
    };
    let io = TEST ? testIO : folderIO;

    // The linked folder and the layout are remembered between visits (IndexedDB).
    const kv = {
        db: null,
        async open() {
            if (this.db) return this.db;
            this.db = await new Promise((res, rej) => {
                const r = indexedDB.open('athenaeum-dashboard', 1);
                r.onupgradeneeded = () => r.result.createObjectStore('kv');
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            });
            return this.db;
        },
        async get(key) {
            try {
                const db = await this.open();
                return await new Promise(res => {
                    const q = db.transaction('kv').objectStore('kv').get(key);
                    q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
                });
            } catch (e) { return undefined; }
        },
        async set(key, value) {
            try {
                const db = await this.open();
                await new Promise(res => {
                    const t = db.transaction('kv', 'readwrite');
                    t.objectStore('kv').put(value, key);
                    t.oncomplete = res; t.onerror = res;
                });
            } catch (e) { /* not fatal: the folder is just asked for again next time */ }
        },
    };

    // Comes back on the tool and record last used, unless they no longer exist.
    function rememberUI() {
        if (!TEST) kv.set('ui', { view: S.view, sel: S.sel, listCollapsed: $('#app').classList.contains('list-collapsed'), navOpen: S.navOpen });
    }
    async function restoreUI() {
        const ui = TEST ? null : await kv.get('ui');
        if (!ui) return;
        S.navOpen = !!ui.navOpen;
        $('#app').classList.toggle('list-collapsed', !!ui.listCollapsed);
        if (!ui.view) return;
        const known = ui.view.kind === 'single' ? SINGLES[ui.view.key] : TYPES[ui.view.key];
        if (!known) return;
        S.view = { kind: ui.view.kind, key: ui.view.key };
        S.sel = ui.view.kind === 'type' && S.data[ui.view.key].some(r => r.id === ui.sel) ? ui.sel : null;
    }

    /* =================================================================
       STATE
       ================================================================= */
    const firstType = Object.keys(TYPES)[0];
    const S = {
        data: {},        // type -> working records (private fields merged in)
        singles: {},     // name -> working object
        base: {},        // file path -> serialized text as last loaded / saved
        recBase: new Map(), // "type:id" -> the record as last loaded / saved (unsaved dots)
        store: null,     // rebuilt from the working data
        issues: { errors: [], warnings: [] },
        view: { kind: 'type', key: firstType },
        sel: null,
        search: '',
        collapsed: new Set(),
        previews: new Set(),
        icons: null,
        thumbs: new Map(),
        menuCode: null,
        sealed: new Map(), // "type:id:key" -> the {text, password} its encrypted copy was made from
        cardSide: 'front', // item, spell and deity previews: 'front', 'sheet', 'back' or 'sealed'
        navOpen: false,    // nav with its labels (else an icon rail)
        sideToggled: false, // previews panel: hidden on wide screens / shown on narrow ones
        refocus: null,     // data-path of the tag / link input to focus again after a re-render
    };
    if (TEST) { window.__dash = S; window.__dashboardIO = io; } // inspected by the headless tests

    /* =================================================================
       SERIALIZATION  (key order = schema order; empty values dropped;
       keys the schema doesn't know are kept, never thrown away)
       ================================================================= */
    const isEmpty = v => v === undefined || v === null || v === '' || v === false ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

    function tidy(fields, obj, base = [], skipPrivate = false, keepEmptyText = false) {
        const out = {};
        const order = [...base, ...Object.keys(fields)];
        for (const k of order) {
            const f = fields[k];
            if (f && f.private && skipPrivate) continue;
            let v = obj[k];
            if (f && f.kind === 'object' && v && typeof v === 'object') v = tidy(f.fields, v);
            else if (f && f.kind === 'objects' && Array.isArray(v)) v = v.map(o => tidy(f.fields, o)).filter(o => !isEmpty(o));
            else if (f && f.kind === 'map' && v && typeof v === 'object') v = tidy({ x: {}, y: {}, icon: {}, layer: {}, on: {} }, v);
            else if (f && f.kind === 'mapImage' && v && typeof v === 'object') v = tidy({ src: {}, width: {}, height: {} }, v);
            else if ((k === 'aliases' || (f && (f.kind === 'list' || f.kind === 'refs'))) && Array.isArray(v)) v = v.map(s => String(s).trim()).filter(Boolean);
            else if (typeof v === 'string' && f && f.kind !== 'markdown') v = v.trim();
            if (!isEmpty(v) || (keepEmptyText && v === '' && k in obj)) out[k] = v;
        }
        for (const k of Object.keys(obj)) if (!order.includes(k) && !isEmpty(obj[k])) out[k] = obj[k];
        return out;
    }
    const publicRecords = type => S.data[type].map(r => tidy(TYPES[type].fields, r, BASE_KEYS, true));
    function privateOverlay() {
        const out = {};
        for (const [type, def] of Object.entries(TYPES)) {
            const keys = Object.entries(def.fields).filter(([, f]) => f.private).map(([k]) => k);
            if (!keys.length) continue;
            for (const r of S.data[type]) {
                const fields = {};
                for (const k of keys) if (!isEmpty(r[k])) fields[k] = r[k];
                if (Object.keys(fields).length) (out[type] = out[type] || {})[r.id] = fields;
            }
        }
        return out;
    }
    function serializeAll() {
        const files = {};
        for (const [type, def] of Object.entries(TYPES)) files[def.file] = JSON.stringify(publicRecords(type), null, 2) + '\n';
        for (const [name, def] of Object.entries(SINGLES)) files[def.file] = JSON.stringify(tidy(def.fields, S.singles[name] || {}, [], false, true), null, 2) + '\n';
        files[PRIVATE_FILE] = JSON.stringify(privateOverlay(), null, 2) + '\n';
        return files;
    }
    const dirtyFiles = () => Object.entries(serializeAll()).filter(([p, t]) => S.base[p] !== t);

    // One record as it would be saved (private fields included): spots unsaved records
    const recSnap = (type, r) => JSON.stringify(tidy(TYPES[type].fields, r, BASE_KEYS));
    const recKey = (type, r) => `${type}:${r.id}`;
    function snapshotRecords() {
        S.recBase.clear();
        for (const type of Object.keys(TYPES)) for (const r of S.data[type]) S.recBase.set(recKey(type, r), recSnap(type, r));
    }
    const isDirtyRec = (type, r) => S.recBase.get(recKey(type, r)) !== recSnap(type, r);
    const isDirtySingle = name => {
        const def = SINGLES[name];
        return S.base[def.file] !== JSON.stringify(tidy(def.fields, S.singles[name] || {}, [], false, true), null, 2) + '\n';
    };

    /* =================================================================
       LOAD / REBUILD / SAVE
       ================================================================= */
    async function readJSON(path, fallback) {
        const text = await io.read(path);
        if (text === null) return fallback;
        try { return JSON.parse(text); }
        catch (e) { throw new Error(`${path} is not valid JSON: ${e.message}`); }
    }
    async function loadAll() {
        S.data = {};
        for (const [type, def] of Object.entries(TYPES)) S.data[type] = await readJSON(def.file, []);
        for (const [name, def] of Object.entries(SINGLES)) S.singles[name] = await readJSON(def.file, {});
        const priv = await readJSON(PRIVATE_FILE, {});
        for (const [type, entries] of Object.entries(priv)) {
            for (const [id, fields] of Object.entries(entries || {})) {
                const rec = (S.data[type] || []).find(r => r.id === id);
                if (rec) Object.assign(rec, fields);
            }
        }
        S.base = serializeAll(); // normalised: an unchanged file never counts as edited
        snapshotRecords();
        await checkSealed();
        rebuild();
    }

    /* Sealed fields (hero secrets): the public file holds an encrypted copy of a
       private text, made with a private password. On load we note which copies
       still match; on save only changed ones are re-encrypted, so unchanged
       secrets never show up as edited files. */
    const sealedFields = () => Object.entries(TYPES).flatMap(([type, def]) =>
        Object.entries(def.fields).filter(([, f]) => f.kind === 'sealed').map(([key, f]) => ({ type, key, f })));
    const sealKey = (type, id, key) => `${type}:${id}:${key}`;
    async function checkSealed() {
        S.sealed.clear();
        if (!ATH.unseal) return;
        for (const { type, key, f } of sealedFields()) {
            for (const r of S.data[type]) {
                const text = r[f.from], pw = r[f.password];
                if (!r[key] || !text || !pw) continue;
                if (await ATH.unseal(r[key], pw) === text) S.sealed.set(sealKey(type, r.id, key), JSON.stringify([text, pw]));
            }
        }
    }
    async function updateSealed() {
        for (const { type, key, f } of sealedFields()) {
            for (const r of S.data[type]) {
                const text = r[f.from], pw = r[f.password], k = sealKey(type, r.id, key);
                if (!text || !pw) {
                    // No secret, or no password: nothing to publish. Keep an existing copy only
                    // while the private file is missing (another computer), never otherwise.
                    if (!text && !pw) continue;
                    delete r[key]; S.sealed.delete(k); continue;
                }
                const sig = JSON.stringify([text, pw]);
                if (r[key] && S.sealed.get(k) === sig) continue;
                r[key] = await ATH.seal(text, pw);
                S.sealed.set(k, sig);
            }
        }
    }
    function sealedStatus(f, rec, key) {
        const text = rec[f.from], pw = rec[f.password];
        if (!text) return rec[key] ? 'An encrypted copy is published; its text is not on this computer (data/private.json).' : 'No secret.';
        if (!pw) return '⚠ No password: the secret will not be published.';
        return rec[key] && S.sealed.get(sealKey(S.view.key, rec.id, key)) === JSON.stringify([text, pw])
            ? '✓ Encrypted and up to date.' : 'Will be encrypted when you save.';
    }
    function rebuild() {
        const datasets = {};
        for (const type of Object.keys(TYPES)) datasets[type] = publicRecords(type);
        const singles = {};
        for (const [name, def] of Object.entries(SINGLES)) singles[name] = tidy(def.fields, S.singles[name] || {});
        S.store = ATH.createStore(schema, datasets, privateOverlay(), singles);
        S.issues = S.store.validate();
    }
    async function save() {
        try { await updateSealed(); }
        catch (e) { alertBox('Could not encrypt the secrets', `<p>${esc(e.message)}</p>`); return; }
        rebuild();
        if (S.issues.errors.length) { showIssues(true); return; }
        const files = dirtyFiles();
        if (!files.length) { toast('Nothing to save'); return; }
        try {
            for (const [path, text] of files) { await io.write(path, text); S.base[path] = text; }
            snapshotRecords();
            toast(`Saved ${files.map(([p]) => p.split('/').pop()).join(', ')}`);
        } catch (e) {
            alertBox('Saving failed', `<p>${esc(e.message)}</p><p>Files written before the error are saved; the rest are not.</p>`);
        }
        renderNav(); renderList(); refreshChrome(); updateHeader();
    }

    /* =================================================================
       HELPERS
       ================================================================= */
    const isSingle = () => S.view.kind === 'single';
    const curDef = () => (isSingle() ? SINGLES[S.view.key] : TYPES[S.view.key]);
    const curRecord = () => (isSingle() ? S.singles[S.view.key] : (S.data[S.view.key] || []).find(r => r.id === S.sel) || null);
    const typeOfId = id => Object.keys(TYPES).find(t => S.data[t].some(r => r.id === id)) || null;
    const allIds = () => new Set(Object.values(S.data).flat().map(r => r.id));
    const ofRecord = (list, type, id) => list.filter(e => e.startsWith(`[${type}] ${id}.`) || e.startsWith(`[${type}] ${id}:`) || e.startsWith(`[private] ${id}.`) || e.startsWith(`[private] ${type} "${id}"`));
    const recordErrors = (type, id) => ofRecord(S.issues.errors, type, id);
    const recordWarnings = (type, id) => ofRecord(S.issues.warnings, type, id);
    const singleIssues = (list, name) => list.filter(e => e.startsWith(`[${name}]`));
    function getAt(obj, path) { return path.reduce((o, k) => (o == null ? undefined : o[k]), obj); }
    function setAt(obj, path, value) {
        let o = obj;
        for (let i = 0; i < path.length - 1; i++) {
            if (o[path[i]] == null || typeof o[path[i]] !== 'object') o[path[i]] = typeof path[i + 1] === 'number' ? [] : {};
            o = o[path[i]];
        }
        const last = path[path.length - 1];
        if (value === undefined) delete o[last]; else o[last] = value;
    }
    const pathAttr = path => esc(JSON.stringify(path));
    const fid = path => 'f_' + path.join('_').replace(/[^a-zA-Z0-9_]/g, '-');
    const nameOf = id => { const r = S.store && S.store.get(id); return r ? r.name : id; };
    const enumOpts = f => (f.enum ? S.store.enumOptions(f.enum) : (f.options || []).map(o => ({ id: o, label: o })));
    const enumLabel = (name, id) => (S.store.enumOptions(name).find(o => o.id === id) || {}).label || id || '';
    const typeLabel = t => (TYPES[t] ? TYPES[t].label : t);

    // Second line of a record in the list
    function subtitle(type, r) {
        const def = TYPES[type];
        const nb = n => (n === 0 ? 'Cantrip' : n != null ? `Level ${n}` : '');
        if (def.place && r.parent) return nameOf(r.parent);
        if (def.place) return r.subtitle || '';
        switch (type) {
            case 'npc': return r.role || r.whereabouts || '';
            case 'faction': return r.stub ? 'Stub' : S.store.standing(r.id);
            case 'lore': return r.kind || '';
            case 'tome': return [r.draft ? 'Draft' : '', r.kind, r.category].filter(Boolean).join(' · ');
            case 'handout': return [r.draft ? 'Draft' : '', r.category, r.campaign ? nameOf(r.campaign) : ''].filter(Boolean).join(' · ');
            case 'creature': return [r.threat, r.phylogeny || r.realm].filter(Boolean).join(' · ');
            case 'spell': return [nb(r.level), r.school].filter(Boolean).join(' · ');
            case 'item': return [r.rarity, r.type].filter(Boolean).join(' · ');
            case 'campaign': return [r.partyName, (r.party || []).length ? `${r.party.length} heroes` : ''].filter(Boolean).join(' · ');
            case 'session': return [r.number != null ? `#${r.number}` : '', r.arc || ''].filter(Boolean).join(' · ');
            case 'hero': return [r.raceClass, r.level != null ? `level ${r.level}` : ''].filter(Boolean).join(' · ');
            case 'menuItem': return `${r.basePrice ?? '?'} cp · ${enumLabel('tavernTier', r.minTier)}–${enumLabel('tavernTier', r.maxTier)}`;
            case 'service': return [`${r.basePrice ?? '?'} cp`, r.unit].filter(Boolean).join(' · ');
            case 'shopGood': return `${r.basePrice ?? '?'} cp${r.unit ? ' · ' + r.unit : ''}${r.tags && r.tags.includes('illicit') ? ' · illicit' : ''}`;
            case 'templeService': return [`${r.basePrice ?? '?'} cp`, r.unit].filter(Boolean).join(' · ');
            case 'blessing': return (r.deities || []).length ? r.deities.map(nameOf).join(', ') : 'Any temple';
            case 'deity': return r.epithet || (r.domains || []).join(', ');
            case 'rumour': return [r.truth ? enumLabel('rumourTruth', r.truth) : 'Truth not set', r.source].filter(Boolean).join(' · ');
            case 'notice': return [enumLabel('noticeKind', r.kind), enumLabel('noticeStatus', r.status || 'open').split(' (')[0]].filter(Boolean).join(' · ');
            case 'practice': return [r.method === 'omen' ? 'Omens' : r.deck ? nameOf(r.deck) : 'Cards, no deck', typeof r.basePrice === 'number' ? `${r.basePrice} cp` : 'Donation'].join(' · ');
            case 'deck': { const n = S.data.fortuneCard.filter(c => c.deck === r.id).length; return `${n} card${n === 1 ? '' : 's'}${r.noReversals ? ' · upright only' : ''}`; }
            case 'fortuneCard': return [ATH.fortuneCard ? ATH.fortuneCard.roman(r.number) : r.number, r.image ? '' : 'no picture'].filter(Boolean).join(' · ');
            case 'spread': { const n = (r.positions || []).length; return `${n} card${n === 1 ? '' : 's'}${r.layout === 'cross' ? ' · cross' : ''}`; }
            case 'omen': return r.meaning || '';
            case 'prophecy': return [(r.campaigns || []).map(nameOf).join(', ') || 'No campaign', r.practice ? nameOf(r.practice) : ''].filter(Boolean).join(' · ');
        }
        return r.subtitle || '';
    }
    // Heading a record is grouped under in the list ({key, label, rank}), or null
    function listGroup(type, r) {
        const byEnum = (name, id, none) => {
            const opts = S.store.enumOptions(name), i = opts.findIndex(o => o.id === id);
            return i < 0 ? { key: '~', label: none, rank: 999 } : { key: id, label: opts[i].label, rank: i };
        };
        const up = (t) => { const p = S.store.ancestors(r.id).find(a => S.store.typeOf(a) === t); return p ? { key: p.id, label: p.name } : null; };
        switch (type) {
            case 'country': case 'settlement': case 'district':
                return r.parent ? { key: r.parent, label: nameOf(r.parent) } : { key: '~', label: 'Nowhere', rank: 999 };
            case 'poi': return up('settlement') || up('country') || { key: '~', label: 'Elsewhere', rank: 999 };
            case 'session': return r.campaign ? { key: r.campaign, label: nameOf(r.campaign) } : { key: '~', label: 'No campaign', rank: 999 };
            case 'handout': return r.campaign ? { key: r.campaign, label: nameOf(r.campaign) } : { key: '~', label: 'No campaign', rank: 999 };
            case 'spell': return typeof r.level === 'number' ? { key: 'l' + r.level, label: r.level === 0 ? 'Cantrips' : `Level ${r.level}`, rank: r.level } : { key: '~', label: 'No level', rank: 99 };
            case 'item': return byEnum('itemRarity', r.rarity, 'No rarity');
            case 'deity': return byEnum('deityTier', r.tier, 'No tier');
            case 'menuItem': return byEnum('menuCategory', r.category, 'No category');
            case 'shopGood': return byEnum('shopCategory', r.category, 'No shelf');
            case 'templeService': return byEnum('templeCategory', r.category, 'No kind');
            case 'lore': return byEnum('loreKind', r.kind, 'No kind');
            case 'tome': return byEnum('tomeKind', r.kind, 'No kind');
            case 'rumour': case 'notice': case 'prophecy': return r.where ? { key: r.where, label: nameOf(r.where) } : { key: '~', label: 'Nowhere', rank: 999 };
            case 'fortuneCard': return r.deck ? { key: r.deck, label: nameOf(r.deck) } : { key: '~', label: 'No deck', rank: 999 };
            case 'omen': return r.practice ? { key: r.practice, label: nameOf(r.practice) } : { key: '~', label: 'No practice', rank: 999 };
        }
        return null;
    }
    // The records of the current type as the list shows them (search aside): grouped, sorted
    function orderedRecords(type) {
        const recs = [...S.data[type]];
        if (TYPES[type].order) recs.sort(ATH.comparator(TYPES[type].order));
        const groups = new Map();
        recs.forEach((r, i) => {
            const g = listGroup(type, r);
            const key = g ? g.key : '';
            if (!groups.has(key)) groups.set(key, { ...(g || { label: '' }), first: i, recs: [] });
            groups.get(key).recs.push(r);
        });
        // POIs: a place inside another POI comes right under it (and its own places under
        // it in turn), wherever it sits in the file. The list indents it (renderList).
        if (type === 'poi') groups.forEach(g => {
            const here = new Set(g.recs.map(r => r.id));
            const kids = new Map();
            g.recs.forEach(r => { if (here.has(r.parent)) kids.set(r.parent, [...(kids.get(r.parent) || []), r]); });
            const out = [], seen = new Set();
            const walk = r => { if (seen.has(r.id)) return; seen.add(r.id); out.push(r); (kids.get(r.id) || []).forEach(walk); };
            g.recs.filter(r => !here.has(r.parent)).forEach(walk);
            g.recs.forEach(walk);       // a loop of parents (flagged by the checks) still shows
            g.recs = out;
        });
        return [...groups.values()].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.first - b.first);
    }
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg; t.classList.add('show');
        clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
    }

    /* =================================================================
       MODAL, MENU, TOOLTIP
       ================================================================= */
    function modal(html, cls = '') {
        const m = $('#modal');
        m.className = cls === 'top' ? 'top' : '';
        m.innerHTML = `<div class="dlg ${cls}">${html}</div>`;
        m.hidden = false;
        return m.firstElementChild;
    }
    function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
    function alertBox(title, body) {
        modal(`<h3>${esc(title)}</h3>${body}<div class="foot"><button class="btn primary" data-action="close-modal">OK</button></div>`);
    }
    function issueLine(e) {
        const m = e.match(/^\[([a-zA-Z]+)\] ([^.:\s"]+)/);
        const target = m && TYPES[m[1]] ? `data-jump="${esc(m[2])}"` : m && SINGLES[m[1]] ? `data-jump-single="${esc(m[1])}"` : '';
        return `<li><a href="#" ${target}>${esc(e)}</a></li>`;
    }
    function showIssues(fromSave) {
        const { errors, warnings } = S.issues;
        const title = errors.length
            ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix${fromSave ? ' before saving' : ''}`
            : `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`;
        modal(`<h3>${title}</h3>
            ${fromSave ? '<p class="muted">Nothing was saved. Click a line to open the record.</p>' : '<p class="muted">Click a line to open the record.</p>'}
            ${errors.length ? `<ul class="issues">${errors.map(issueLine).join('')}</ul>` : ''}
            ${warnings.length ? `<h4 class="issues-h">Warnings <span class="muted">(saving is still allowed)</span></h4><ul class="issues issues--warn">${warnings.map(issueLine).join('')}</ul>` : ''}
            <div class="foot"><button class="btn" data-action="close-modal">Close</button></div>`, 'wide');
    }
    function openMenu(btn, items) {
        closeMenu();
        const m = document.createElement('div');
        m.className = 'menu'; m.id = 'menu';
        m.innerHTML = items.map(i => i ? `<button data-action="${i.action}" ${i.dir ? `data-dir="${i.dir}"` : ''} class="${i.danger ? 'danger' : ''}" ${i.disabled ? 'disabled' : ''}>
            <span class="material-symbols-outlined">${i.icon}</span>${esc(i.label)}</button>` : '<hr>').join('');
        document.body.appendChild(m);
        const r = btn.getBoundingClientRect();
        m.style.top = `${r.bottom + 6}px`;
        m.style.left = `${Math.max(8, r.right - m.offsetWidth)}px`;
    }
    function closeMenu() { const m = $('#menu'); if (m) m.remove(); }
    // Labels of the icon rail, and other [data-tip] elements
    function showTip(el) {
        const tip = $('#tip');
        tip.textContent = el.dataset.tip;
        tip.hidden = false;
        const r = el.getBoundingClientRect();
        tip.style.top = `${r.top + r.height / 2 - tip.offsetHeight / 2}px`;
        tip.style.left = `${r.right + 8}px`;
    }

    /* =================================================================
       NAV & LIST
       ================================================================= */
    // Menu colour of each group. A group added to the schema takes one of the spare colours.
    const GROUP_COLOURS = { Site: '#b4bac2', Places: '#6aa9fa', People: '#66c488', Library: '#b79cf5', Campaigns: '#f28b82', Markets: '#f0a35e', Faith: '#f3dc9b', 'Town life': '#4fd1c5', Divination: '#c4a3f7' };
    const SPARE_COLOURS = ['#4fd1c5', '#f48fb1', '#d4d86a'];
    function renderNav() {
        $('#app').classList.toggle('nav-open', S.navOpen);
        const entries = [
            ...Object.entries(TYPES).map(([key, d]) => ({ kind: 'type', key, d })),
            ...Object.entries(SINGLES).map(([key, d]) => ({ kind: 'single', key, d })),
        ];
        const groups = [...new Set(entries.map(e => e.d.group || 'Other'))];
        $('#nav-items').innerHTML = groups.map((g, i) => `
            <div class="nav-sec" style="--c:${GROUP_COLOURS[g] || SPARE_COLOURS[i % SPARE_COLOURS.length]}">
            <div class="nav-group"><span>${esc(g)}</span></div>
            ${entries.filter(e => (e.d.group || 'Other') === g).map(e => {
            const label = e.d.navLabel || e.d.plural || e.d.label;
            const dirty = e.kind === 'type' ? S.data[e.key].some(r => isDirtyRec(e.key, r)) : isDirtySingle(e.key);
            const count = e.kind === 'type' ? S.data[e.key].length : '';
            return `<button class="nav-btn ${S.view.kind === e.kind && S.view.key === e.key ? 'active' : ''}" data-nav="${e.kind}:${e.key}" ${S.navOpen ? '' : `data-tip="${esc(label)}"`} aria-label="${esc(label)}">
                    <span class="material-symbols-outlined">${esc(e.d.icon || 'description')}</span>
                    <span class="lbl">${esc(label)}</span>
                    <span class="cnt">${count}</span>
                    ${dirty ? '<span class="dot" title="Unsaved changes"></span>' : ''}
                </button>`;
        }).join('')}
            </div>`).join('');
        $('#nav-pin').innerHTML = `<span class="material-symbols-outlined">${S.navOpen ? 'left_panel_close' : 'left_panel_open'}</span><span class="lbl">Collapse menu</span>`;
        $('#nav-pin').dataset.tip = S.navOpen ? '' : 'Show the labels';
    }
    function renderList() {
        $('#app').classList.toggle('no-list', isSingle());
        if (isSingle()) return;
        const type = S.view.key, def = TYPES[type];
        const q = S.search.trim().toLowerCase();
        const match = r => !q || [r.id, r.name, ...(r.aliases || []), subtitle(type, r)].some(v => String(v || '').toLowerCase().includes(q));
        const groups = orderedRecords(type).map(g => ({ ...g, recs: g.recs.filter(match) })).filter(g => g.recs.length);
        const total = S.data[type].length;
        $('#list-title').innerHTML = `${esc(def.plural || def.label)} <span>${q ? `${groups.reduce((n, g) => n + g.recs.length, 0)} / ` : ''}${total}</span>`;
        $('#new-btn').title = `New ${def.label.toLowerCase()}`;
        // A place inside another POI is indented under it, one step per level (while a
        // search hides its parent it stands at the edge; its second line names the parent)
        const shownIds = new Set(groups.flatMap(g => g.recs.map(r => r.id)));
        const depthOf = r => {
            let d = 0;
            for (let p = r, hops = 0; type === 'poi' && hops < 6 && shownIds.has(p.parent) && typeOfId(p.parent) === 'poi'; hops++) { d++; p = S.store.get(p.parent); }
            return d;
        };
        const item = r => {
            const bad = recordErrors(type, r.id).length;
            const depth = depthOf(r);
            return `<button class="li ${r.id === S.sel ? 'active' : ''} ${depth ? 'nested' : ''}" ${depth ? `style="--depth:${depth}"` : ''} data-select="${esc(r.id)}" ${def.order ? '' : 'draggable="true" title="Drag to change the order on the site"'}>
                <span class="t">${esc(r.name || '(no name)')}</span>
                ${isDirtyRec(type, r) ? '<span class="dot" title="Unsaved changes"></span>' : ''}
                ${bad ? `<span class="bad" title="${bad} problem${bad === 1 ? '' : 's'}">${bad}</span>` : ''}
                <span class="s">${esc(subtitle(type, r))}</span>
            </button>`;
        };
        $('#list-items').innerHTML = groups.map(g => `
            ${g.label ? `<div class="lg"><span>${esc(g.label)}</span><small>${g.recs.length}</small></div>` : ''}
            ${g.recs.map(item).join('')}`).join('')
            || `<p class="empty">${q ? 'No match.' : 'Nothing yet: click <b>+ New</b>.'}</p>`;
    }
    function refreshChrome() {
        const dirty = dirtyFiles();
        const pill = $('#save-pill');
        pill.textContent = dirty.length ? `${dirty.length} file${dirty.length === 1 ? '' : 's'} unsaved` : 'All saved';
        pill.className = 'pill ' + (dirty.length ? 'dirty' : 'ok');
        pill.title = dirty.map(([p]) => p).join('\n');
        const n = S.issues.errors.length, w = S.issues.warnings.length;
        const ip = $('#issues-pill');
        ip.hidden = !n && !w;
        ip.className = 'pill ' + (n ? 'bad' : 'warn');
        ip.textContent = n ? `${n} problem${n === 1 ? '' : 's'}${w ? ` · ${w} warning${w === 1 ? '' : 's'}` : ''}` : `${w} warning${w === 1 ? '' : 's'}`;
        ip.title = 'Show them';
    }
    let refreshTimer = null;
    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { rebuild(); renderNav(); renderList(); renderSide(); refreshChrome(); updateHeader(); }, 250);
    }

    /* =================================================================
       FORM FIELDS
       ================================================================= */
    const SECTION_ICONS = {
        Essentials: 'badge', Details: 'tune', Lore: 'auto_stories', Map: 'map', 'On the page': 'web', Institution: 'account_balance', Tavern: 'sports_bar', Shop: 'storefront', Temple: 'brightness_7',
        Identity: 'person', 'Where & ties': 'pin_drop', Campaigns: 'flag', Biography: 'history_edu', 'DM only': 'lock', Dossier: 'folder_open', Relations: 'handshake',
        Intelligence: 'visibility', 'Field evidence': 'folder_supervised', Look: 'palette', Text: 'subject', 'Picture & file': 'image', Stats: 'monitoring', 'Field notes': 'edit_note',
        Card: 'style', Description: 'subject', Story: 'auto_stories', Quests: 'flag', Party: 'groups', Allegiances: 'handshake', Spellbooks: 'webhook', Overview: 'summarize',
        Transcript: 'history_edu', 'People & places': 'diversity_3', 'Loot & leads': 'explore', Backstory: 'menu_book', Statistics: 'monitoring', Secret: 'key', Artifact: 'diamond',
        Rumour: 'record_voice_over', Notice: 'push_pin', 'Homepage cards': 'event_upcoming', Settings: 'tune',
        Divination: 'visibility', Meanings: 'menu_book', Prophecy: 'auto_awesome', 'The reading': 'style',
    };
    // Lists of tags whose suggestions come from a pool's tags rather than from the same field
    const TAG_SOURCES = {
        'poi.tavern.includeTags': ['menuItem', 'tags'], 'poi.tavern.excludeTags': ['menuItem', 'tags'],
        'poi.shop.includeTags': ['shopGood', 'tags'], 'poi.shop.excludeTags': ['shopGood', 'tags'],
    };
    // Fields that other fields' showIf (or the map pin) depend on: changing one redraws the form
    const CONTROLLERS = new Set(['parent']);
    (function collect(fieldsList) {
        for (const fields of fieldsList) for (const f of Object.values(fields)) {
            if (f.showIf) CONTROLLERS.add(f.showIf.key);
            if (f.fields) collect([f.fields]);
        }
    })([...Object.values(TYPES), ...Object.values(SINGLES)].map(d => d.fields));

    function shown(f, holder) {
        const c = f.showIf;
        if (!c) return true;
        const v = holder ? holder[c.key] : undefined;
        if (c.is) return c.is.includes(v);
        if (c.set) return !isEmpty(v);
        if (c.empty) return isEmpty(v);
        return true;
    }
    function widthOf(f) {
        const W = { quarter: 3, third: 4, half: 6, full: 12 };
        if (f.width && W[f.width]) return W[f.width];
        switch (f.kind) {
            case 'number': return f.range ? 6 : 3;
            case 'date': case 'time': return 3;
            case 'enum': return Math.max(0, ...enumOpts(f).map(o => String(o.label).length)) > 18 ? 6 : 3;
            case 'ref': return 6;
            case 'text': return f.long ? 12 : 6;
            case 'image': return 6;
            default: return 12;
        }
    }
    // Title of a card in a list of objects: its itemLabel field (or several,
    // joined with ·); a link (ref) shows the name it points to, not the id
    // ("Nimo", not "nimo"), an enum its label, a number reads "#3", a date in full
    function cardLabel(f, item) {
        const keys = Array.isArray(f.itemLabel) ? f.itemLabel : [f.itemLabel];
        return keys.map(k => {
            const v = item && item[k];
            const lf = f.fields && f.fields[k];
            if (v === undefined || v === null || v === '' || !lf) return v;
            if (lf.kind === 'ref') return nameOf(v);
            if (lf.kind === 'enum') return (enumOpts(lf).find(o => o.id === v) || {}).label || v;
            if (lf.kind === 'number') return '#' + v;
            if (lf.kind === 'date' && ATH.upcoming) return ATH.upcoming.formatDate(v) || v;
            return v;
        }).filter(v => v !== undefined && v !== null && v !== '').join(' · ');
    }
    const labelHtml = (f, key, id) => `<label ${id ? `for="${id}"` : ''}>${esc(f.label || key)}${f.required ? '<i class="req" title="Required">*</i>' : ''}${f.private ? ' <span class="lock material-symbols-outlined" title="DM only: saved to data/private.json, never published">lock</span>' : ''}</label>`;
    const helpHtml = f => (f.help ? `<p class="help">${esc(f.help)}</p>` : '');
    const wrap = (f, inner, extra = '') => `<div class="fld w-${widthOf(f)} ${extra}">${inner}</div>`;

    // The bare control of a simple field (also used in the cells of a table)
    function controlHtml(f, value, path, id) {
        const p = pathAttr(path), idA = id ? `id="${id}"` : '';
        switch (f.kind) {
            case 'text':
            case 'url': {
                if (f.long) return `<textarea ${idA} rows="2" class="auto" data-path="${p}" data-kind="text">${esc(value)}</textarea>`;
                if (f.color) return `<div class="row"><input type="color" class="swatch" data-color-for="${id}" value="${/^#[0-9a-f]{6}$/i.test(value || '') ? esc(value) : '#000000'}" title="Pick a colour">
                    <input ${idA} data-path="${p}" data-kind="text" value="${esc(value)}" placeholder="#e9c176"></div>`;
                if (f.focus) {
                    const m = /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(value || '');
                    const [x, y] = m ? [m[1], m[2]] : [50, 30];
                    return `<div class="focus-ctl" data-focus-for="${id}">
                        <span class="mini" title="Left → right">↔</span><input type="range" min="0" max="100" data-fx value="${x}" aria-label="Horizontal">
                        <span class="mini" title="Top → bottom">↕</span><input type="range" min="0" max="100" data-fy value="${y}" aria-label="Vertical">
                        <input ${idA} class="num-m" data-path="${p}" data-kind="text" value="${esc(value)}" placeholder="50% 30%"></div>`;
                }
                if (f.icon) return `<div class="row"><span class="icon-prev material-symbols-outlined" data-icon-prev>${esc(value || 'help')}</span>
                    <input ${idA} data-path="${p}" data-kind="text" value="${esc(value)}" placeholder="icon name"></div>`;
                if (f.kind === 'url' && io === folderIO) return `<div class="row"><input ${idA} data-path="${p}" data-kind="text" value="${esc(value)}">
                    <button class="btn" data-action="pick-image" data-path="${p}">Choose…</button></div>`;
                return `<input ${idA} data-path="${p}" data-kind="text" value="${esc(value)}">`;
            }
            case 'number':
                if (f.choices) return `<select ${idA} data-path="${p}" data-kind="number-choice"><option value="">—</option>
                    ${f.choices.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
                if (f.range) return `<div class="row"><input type="range" min="${f.range[0]}" max="${f.range[1]}" data-range-for="${id}" value="${value ?? f.range[0]}">
                    <input ${idA} class="num-s" type="number" data-path="${p}" data-kind="number" value="${value ?? ''}"></div>`;
                return `<input ${idA} type="number" data-path="${p}" data-kind="number" value="${value ?? ''}">`;
            case 'date':
            case 'time':
                return `<input ${idA} type="${f.kind}" data-path="${p}" data-kind="text" value="${esc(value)}">`;
            case 'boolean':
                return `<input ${idA} type="checkbox" data-path="${p}" data-kind="boolean" ${value ? 'checked' : ''}>`;
            case 'enum':
                return `<select ${idA} data-path="${p}" data-kind="enum"><option value="">—</option>
                    ${enumOpts(f).map(o => `<option value="${esc(o.id)}" ${o.id === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                    ${value && !enumOpts(f).some(o => o.id === value) ? `<option value="${esc(value)}" selected>${esc(value)} (not in the list)</option>` : ''}
                </select>`;
            case 'ref':
                return `<div class="row">${refSelect(f.to, value, `${idA} data-path="${p}" data-kind="ref"`)}
                    ${value && allIds().has(value) ? `<button class="btn icon" data-jump="${esc(value)}" title="Open ${esc(nameOf(value))}"><span class="material-symbols-outlined">arrow_forward</span></button>` : ''}</div>`;
        }
        return '';
    }
    const TABLE_KINDS = ['text', 'number', 'enum', 'ref', 'boolean', 'date', 'time'];
    const tableable = f => {
        const subs = Object.values(f.fields || {});
        return subs.length <= 5 && subs.every(sf => TABLE_KINDS.includes(sf.kind) && !sf.long && !sf.showIf && !sf.range);
    };
    const colOf = (key, sf) => sf.kind === 'number' ? 'minmax(64px,.55fr)'
        : /^(name|title|label)$/.test(key) ? 'minmax(130px,1.4fr)'
            : sf.kind === 'boolean' ? '56px'
                : /desc|description|text/.test(key) && sf.kind === 'text' ? 'minmax(140px,2fr)'
                    : 'minmax(110px,1fr)';

    function fieldHtml(f, key, value, path, holder) {
        if (!shown(f, holder)) return '';
        const id = fid(path);
        const help = helpHtml(f);
        switch (f.kind) {
            case 'text': case 'url': case 'number': case 'date': case 'time': case 'enum': case 'ref':
                return wrap(f, `${labelHtml(f, key, id)}${controlHtml(f, value, path, id)}${help}`);
            case 'boolean':
                return `<label class="chk" for="${id}">${controlHtml(f, value, path, id)}<span><b>${esc(f.label || key)}</b>${f.help ? `<small>${esc(f.help)}</small>` : ''}</span></label>`;
            case 'markdown': {
                const ck = JSON.stringify(path), open = S.previews.has(ck);
                return wrap(f, `<div class="md-head">${labelHtml(f, key, id)}
                        <span class="md-tools"><span class="hint-i material-symbols-outlined" title="${esc(MD_HELP)}">help</span>
                        <button class="btn sm ${open ? 'on' : ''}" data-action="md-preview" data-key="${esc(ck)}"><span class="material-symbols-outlined">visibility</span>${open ? 'Hide preview' : 'Preview'}</button></span></div>
                    <div class="${open ? 'md-split' : ''}">
                        <textarea ${`id="${id}"`} class="auto md" rows="6" data-path="${pathAttr(path)}" data-kind="markdown">${esc(value)}</textarea>
                        ${open ? `<div class="md-preview" data-preview="${esc(ck)}">${renderMd(value)}</div>` : ''}
                    </div>${help}`);
            }
            case 'image':
                return wrap(f, `${labelHtml(f, key, id)}<div class="row img-row">
                    <img class="thumb" data-thumb="${esc(value)}" alt="">
                    <input id="${id}" data-path="${pathAttr(path)}" data-kind="text" value="${esc(value)}" placeholder="images/…">
                    ${io === folderIO ? `<button class="btn" data-action="pick-image" data-path="${pathAttr(path)}">Choose…</button>` : ''}
                </div>${help}`);
            case 'list': {
                const arr = Array.isArray(value) ? value : [];
                // A list with `enum` (tavern games, shop shelves): one checkbox per option
                if (f.enum) return wrap(f, `${labelHtml(f, key)}<div class="enum-set" data-set>
                    ${enumOpts(f).map(o => `<label class="enum-set__opt"><input type="checkbox" data-path="${pathAttr(path)}" data-kind="enum-set" value="${esc(o.id)}" ${arr.includes(o.id) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}
                    ${arr.filter(v => !enumOpts(f).some(o => o.id === v)).map(v => `<span class="warn">${esc(v)} (not in the list)</span>`).join('')}
                </div>${help}`);
                if (f.lines) return wrap(f, `${labelHtml(f, key, id)}<textarea id="${id}" class="auto lines" rows="3" data-path="${pathAttr(path)}" data-kind="lines" placeholder="One per line">${esc(arr.join('\n'))}</textarea>${help}`);
                return wrap(f, `${labelHtml(f, key, id)}${chipsHtml(arr, path, id, null)}${help}`);
            }
            case 'refs': {
                const arr = Array.isArray(value) ? value : [];
                return wrap(f, `${labelHtml(f, key, id)}${chipsHtml(arr, path, id, f.to)}${help}`);
            }
            case 'map': return wrap(f, mapHtml(f, key, value, path), 'fld-box');
            case 'mapImage': {
                const m = value || {};
                return wrap(f, `${labelHtml(f, key)}<div class="row img-row">
                        <img class="thumb" data-thumb="${esc(m.src)}" alt="">
                        <input data-path="${pathAttr([...path, 'src'])}" data-kind="text" value="${esc(m.src)}" placeholder="images/…" aria-label="Image">
                        ${io === folderIO ? `<button class="btn" data-action="pick-image" data-path="${pathAttr([...path, 'src'])}">Choose…</button>` : ''}
                    </div>
                    <div class="row" style="margin-top:8px">
                        <span class="mini">Width</span><input class="num-s" type="number" data-path="${pathAttr([...path, 'width'])}" data-kind="number" value="${m.width ?? ''}" aria-label="Width (px)">
                        <span class="mini">Height</span><input class="num-s" type="number" data-path="${pathAttr([...path, 'height'])}" data-kind="number" value="${m.height ?? ''}" aria-label="Height (px)">
                        <span class="mini">px</span>
                        <button class="btn" data-action="read-size" data-path="${pathAttr(path)}">Read from the image</button>
                    </div>${help}`, 'fld-box');
            }
            case 'object': {
                if (f.optional && (value === undefined || value === null)) {
                    return wrap({ width: 'full' }, `<div class="add-block"><button class="btn ghost" data-action="obj-add" data-path="${pathAttr(path)}">+ ${esc(f.label || key)}</button>${help}</div>`);
                }
                return wrap({ width: 'full' }, `<div class="sub">
                    <div class="sub-head">${labelHtml(f, key)}${f.optional ? `<button class="btn sm danger" data-action="remove" data-path="${pathAttr(path)}">Remove</button>` : ''}</div>${help}
                    <div class="grid">${fieldsGrid(f.fields, value || {}, path)}</div></div>`);
            }
            case 'objects': return wrap({ width: 'full' }, objectsHtml(f, key, value, path));
            case 'sealed': {
                const rec = curRecord();
                return wrap({ width: 'full' }, `${labelHtml(f, key)}<p class="sealed-status">${esc(rec ? sealedStatus(f, rec, key) : '')}</p>
                    <p class="help">Written on save from “${esc((curDef().fields[f.from] || {}).label || f.from)}” and “${esc((curDef().fields[f.password] || {}).label || f.password)}”. Players see the secret only after typing the password.</p>`);
            }
            case 'json':
                return wrap({ width: 'full' }, `${labelHtml(f, key, id)}<textarea id="${id}" class="mono auto" rows="8" data-path="${pathAttr(path)}" data-kind="json">${esc(JSON.stringify(value ?? [], null, 2))}</textarea>${help}`);
            default:
                return wrap({ width: 'full' }, `${labelHtml(f, key)}<em>Unknown field kind "${esc(f.kind)}"</em>`);
        }
    }
    // Fields of a record or object: checkboxes in a row of their own, the rest on the grid
    // (all the checkboxes of a card in one row, where the first one is)
    function fieldsGrid(fields, holder, path) {
        const parts = [], checks = [];
        for (const [k, f] of Object.entries(fields)) {
            const html = fieldHtml(f, k, holder[k], [...path, k], holder);
            if (!html) continue;
            if (f.kind === 'boolean') { if (!checks.length) parts.push(null); checks.push(html); continue; }
            parts.push(html);
        }
        return parts.map(p => (p === null ? `<div class="chk-row">${checks.join('')}</div>` : p)).join('');
    }
    function objectsHtml(f, key, value, path) {
        const arr = Array.isArray(value) ? value : [];
        const head = `<div class="sub-head">${labelHtml(f, key)}<span class="muted">${arr.length || ''}</span></div>${helpHtml(f)}`;
        const add = `<button class="btn ghost" data-action="list-add" data-path="${pathAttr(path)}" data-object="1">+ Add</button>`;
        const acts = (i) => `<span class="acts">
            <button class="btn icon" data-action="move" data-dir="-1" data-path="${pathAttr([...path, i])}" title="Move up" ${i === 0 ? 'disabled' : ''}><span class="material-symbols-outlined">arrow_upward</span></button>
            <button class="btn icon" data-action="move" data-dir="1" data-path="${pathAttr([...path, i])}" title="Move down" ${i === arr.length - 1 ? 'disabled' : ''}><span class="material-symbols-outlined">arrow_downward</span></button>
            <button class="btn icon" data-action="remove" data-path="${pathAttr([...path, i])}" title="Remove"><span class="material-symbols-outlined">close</span></button></span>`;
        if (tableable(f)) {
            const subs = Object.entries(f.fields);
            const cols = `grid-template-columns:${subs.map(([k, sf]) => colOf(k, sf)).join(' ')} auto`;
            return `<div class="sub">${head}
                ${arr.length ? `<div class="otable" style="${cols}">
                    ${subs.map(([k, sf]) => `<div class="oth">${esc(sf.label || k)}${sf.required ? '<i class="req">*</i>' : ''}</div>`).join('')}<div class="oth"></div>
                    ${arr.map((item, i) => subs.map(([k, sf]) => `<div class="otd">${controlHtml(sf, (item || {})[k], [...path, i, k], fid([...path, i, k]))}</div>`).join('') + `<div class="otd">${acts(i)}</div>`).join('')}
                </div>` : ''}
                ${add}</div>`;
        }
        return `<div class="sub">${head}
            ${arr.map((item, i) => {
            const ik = JSON.stringify([...path, i]), ic = S.collapsed.has(ik);
            return `<div class="card ${ic ? 'collapsed' : ''}">
                    <div class="card-head" data-action="collapse" data-key="${esc(ik)}">
                        <b><span class="material-symbols-outlined chev">expand_more</span>${esc(cardLabel(f, item) || `Entry ${i + 1}`)}</b>${acts(i)}
                    </div>
                    <div class="grid card-body">${fieldsGrid(f.fields, item || {}, [...path, i])}</div>
                </div>`;
        }).join('')}
            ${add}</div>`;
    }
    // Links (refs) and tags (list): chips, an input with suggestions, drag to reorder
    function chipsHtml(arr, path, id, to) {
        const chips = arr.map((v, i) => {
            const exists = to ? allIds().has(v) : true;
            const sub = to ? (exists ? (to.length > 1 ? typeLabel(S.store.typeOf(v)) : '') : 'missing') : '';
            return `<span class="tok ${exists ? '' : 'tok--bad'}" draggable="true" data-i="${i}">
                ${to && exists ? `<a href="#" data-jump="${esc(v)}" title="Open">${esc(nameOf(v))}</a>` : `<span>${esc(to && !exists ? '⚠ ' + v : v)}</span>`}
                ${sub ? `<small>${esc(sub)}</small>` : ''}
                <button data-action="remove" data-path="${pathAttr([...path, i])}" title="Remove" aria-label="Remove"><span class="material-symbols-outlined">close</span></button></span>`;
        }).join('');
        return `<div class="chips" data-chips data-path="${pathAttr(path)}" ${to ? `data-to="${esc(JSON.stringify(to))}"` : ''}>
            ${chips}<input id="${id}" class="chip-in" data-chip-in autocomplete="off" placeholder="${to ? (arr.length ? 'Add…' : 'Type to search…') : (arr.length ? 'Add…' : 'Type, then Enter')}">
            <div class="suggest" hidden></div></div>`;
    }
    function mapHtml(f, key, value, path) {
        const m = value || {};
        const rec = curRecord(), def = curDef();
        const hostType = def.parent && def.parent.length ? typeOfId(rec && rec.parent) : null;
        // A place inside an institution (its parent is a POI) is pinned on one of the institution's maps
        const hostMaps = hostType === 'poi' ? (((S.store.get(rec.parent) || {}).institution || {}).maps || []).filter(x => x && x.id) : null;
        const noMap = hostType && (hostMaps ? !hostMaps.length : !TYPES[hostType].fields.mapImage);
        const head = `<div class="sub-head">${labelHtml(f, key)}${value ? `<button class="btn sm" data-action="remove" data-path="${pathAttr(path)}">Remove the pin</button>` : ''}</div>`;
        if (noMap) return `${head}<p class="help">${esc(hostMaps ? 'The place it sits in has no map yet: add one in that place’s Institution card, then pin this one on it.' : (f.noPin || 'The parent has no map of its own.'))}</p>`;
        return `${head}<div class="row map-row">
            <span class="mini">X</span><input class="num-s" type="number" data-path="${pathAttr([...path, 'x'])}" data-kind="number" value="${m.x ?? ''}" aria-label="X">
            <span class="mini">Y</span><input class="num-s" type="number" data-path="${pathAttr([...path, 'y'])}" data-kind="number" value="${m.y ?? ''}" aria-label="Y">
            <span class="mini">Icon</span>${iconInput(m.icon, pathAttr([...path, 'icon']))}
            ${f.layers ? `<span class="mini">Layer</span><select data-path="${pathAttr([...path, 'layer'])}" data-kind="enum" aria-label="Layer"><option value="">—</option>
                ${S.store.enumOptions('mapLayer').map(o => `<option ${o.id === m.layer ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select>` : ''}
            ${hostMaps ? `<span class="mini">Map</span><select data-path="${pathAttr([...path, 'on'])}" data-kind="enum" aria-label="Map">
                <option value="">${esc(hostMaps[0].name || hostMaps[0].id)} (the first)</option>
                ${hostMaps.slice(1).map(x => `<option value="${esc(x.id)}" ${x.id === m.on ? 'selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}
                ${m.on && !hostMaps.some(x => x.id === m.on) ? `<option value="${esc(m.on)}" selected>⚠ ${esc(m.on)} (no such map)</option>` : ''}</select>` : ''}
            <button class="btn" data-action="place" data-path="${pathAttr(path)}"><span class="material-symbols-outlined">add_location_alt</span>Place on the map</button>
        </div>${helpHtml(f)}`;
    }
    function refSelect(to, value, attrs) {
        const groups = to.map(t => {
            const recs = S.data[t] || [];
            return `<optgroup label="${esc(TYPES[t].plural || t)}">${recs.map(r =>
                `<option value="${esc(r.id)}" ${r.id === value ? 'selected' : ''}>${esc(r.name)}${to.length > 1 || r.parent ? ` — ${esc(r.parent ? nameOf(r.parent) : TYPES[t].label)}` : ''}</option>`).join('')}</optgroup>`;
        }).join('');
        const missing = value && !allIds().has(value) ? `<option value="${esc(value)}" selected>⚠ ${esc(value)} (does not exist)</option>` : '';
        return `<select ${attrs}><option value="">— none —</option>${missing}${groups}</select>`;
    }
    function iconInput(value, p) {
        if (!S.icons) return `<input data-path="${p}" data-kind="text" value="${esc(value)}" placeholder="settlement" aria-label="Icon">`;
        const has = !value || S.icons.includes(value);
        return `<select data-path="${p}" data-kind="enum" aria-label="Icon"><option value="">—</option>
            ${S.icons.map(i => `<option ${i === value ? 'selected' : ''}>${esc(i)}</option>`).join('')}
            ${has ? '' : `<option selected value="${esc(value)}">⚠ ${esc(value)} (no such icon)</option>`}</select>`;
    }
    function renderMd(text) {
        const id = isSingle() ? null : S.sel;
        return S.store.autolink(S.store.md(text || '', { dropCap: true }), { exclude: id }) || `<em class="muted">Nothing yet.</em><p class="muted small">${esc(MD_HELP)}</p>`;
    }

    // Suggestions of a tag / link input
    function suggestions(box, q) {
        const path = JSON.parse(box.dataset.path);
        const current = getAt(curRecord(), path) || [];
        const raw = q.trim();
        q = raw.toLowerCase();
        if (box.dataset.to) {
            const to = JSON.parse(box.dataset.to);
            return to.flatMap(t => (S.data[t] || []).map(r => ({ id: r.id, label: r.name, sub: r.parent ? nameOf(r.parent) : (to.length > 1 ? TYPES[t].label : subtitle(t, r)), hay: [r.name, r.id, ...(r.aliases || [])].join(' ').toLowerCase() })))
                .filter(o => !current.includes(o.id) && (!q || o.hay.includes(q)))
                .sort((a, b) => (q ? (b.label.toLowerCase().startsWith(q) - a.label.toLowerCase().startsWith(q)) : 0))
                .slice(0, 60);
        }
        // tags: values used in the same field elsewhere (or in the pool it filters)
        const generic = path.filter(k => typeof k === 'string');
        if (generic.join('.') === 'aliases') return raw ? [{ id: raw, label: `Add “${raw}”`, sub: 'new', raw: true }] : [];
        const src = TAG_SOURCES[[S.view.key, ...generic].join('.')];
        const [type, gpath] = src ? [src[0], [src[1]]] : [S.view.key, generic];
        const seen = new Map();
        const walk = (o, ks) => {
            if (o == null) return;
            if (!ks.length) { if (Array.isArray(o)) o.forEach(v => typeof v === 'string' && v && seen.set(v, (seen.get(v) || 0) + 1)); return; }
            if (Array.isArray(o)) { o.forEach(x => walk(x, ks)); return; }
            walk(o[ks[0]], ks.slice(1));
        };
        (isSingle() ? [S.singles[S.view.key]] : S.data[type] || []).forEach(r => walk(r, gpath));
        const list = [...seen.entries()].filter(([v]) => !current.includes(v) && (!q || v.toLowerCase().includes(q))).sort((a, b) => b[1] - a[1]).slice(0, 40)
            .map(([v, n]) => ({ id: v, label: v, sub: `${n}×` }));
        if (raw && !list.some(o => o.id.toLowerCase() === q)) list.push({ id: raw, label: `Add “${raw}”`, sub: 'new', raw: true });
        return list;
    }
    function showSuggest(input) {
        const box = input.closest('[data-chips]'), sug = $('.suggest', box);
        const list = suggestions(box, input.value);
        sug._list = list; sug._i = 0;
        sug.innerHTML = list.map((o, i) => `<div class="sg ${i === 0 ? 'on' : ''}" data-i="${i}"><span>${esc(o.label)}</span><small>${esc(o.sub || '')}</small></div>`).join('')
            || '<div class="sg none">No match</div>';
        sug.hidden = false;
    }
    function moveSuggest(input, d) {
        const sug = $('.suggest', input.closest('[data-chips]'));
        if (sug.hidden || !sug._list || !sug._list.length) return;
        sug._i = (sug._i + d + sug._list.length) % sug._list.length;
        $$('.sg', sug).forEach((el, i) => el.classList.toggle('on', i === sug._i));
        const on = $('.sg.on', sug); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function addChip(input, value) {
        const box = input.closest('[data-chips]');
        const path = JSON.parse(box.dataset.path);
        if (value === undefined) {
            const sug = $('.suggest', box);
            const pick = !sug.hidden && sug._list && sug._list[sug._i];
            value = pick ? pick.id : (!box.dataset.to ? input.value.trim() : '');
        }
        if (!value) return;
        const rec = curRecord(), arr = getAt(rec, path);
        if (Array.isArray(arr)) { if (!arr.includes(value)) arr.push(value); } else setAt(rec, path, [value]);
        S.refocus = box.dataset.path;
        edited(true);
    }

    /* =================================================================
       EDITOR
       ================================================================= */
    // The record's cards: [{title, fields: [[key, f]]}] — base keys in the first
    function sectionsOf(def) {
        const names = [...(def.sections || [])];
        const fields = Object.entries(def.fields);
        for (const [, f] of fields) if (f.section && !names.includes(f.section)) names.push(f.section);
        if (!names.length) names.push(isSingle() ? 'Settings' : 'Details');
        return names.map((title, i) => ({ title, fields: fields.filter(([, f]) => (f.section || names[0]) === title), first: i === 0 }));
    }
    const secId = t => 'sec-' + slug(t);

    function renderEditor() {
        rememberUI(); // every change of tool or record ends up here
        closeMenu();
        const ed = $('#editor');
        const def = curDef();
        const rec = curRecord();
        if (!rec) {
            ed.innerHTML = `<div class="empty big"><span class="material-symbols-outlined">${esc(def.icon || 'description')}</span>
                <p>Pick ${esc((def.label || '').toLowerCase())} in the list, or create one.</p>
                <button class="btn primary" data-action="new">+ New ${esc((def.label || '').toLowerCase())}</button>
                <p class="muted small">Ctrl K: find any record · Alt ↑ ↓: previous / next</p></div>`;
            return;
        }
        const secs = sectionsOf(def);
        const base = isSingle() ? '' : [
            fieldHtml({ kind: 'text', label: 'Name', required: true }, 'name', rec.name, ['name'], rec),
            def.place && def.parent.length ? fieldHtml({ kind: 'ref', to: def.parent, label: 'Sits in', required: true }, 'parent', rec.parent, ['parent'], rec) : '',
            fieldHtml({ kind: 'list', label: 'Other names', help: 'Aliases: they become links too.', width: 'full' }, 'aliases', rec.aliases, ['aliases'], rec),
        ].join('');
        const cards = secs.map(sec => {
            const k = `sec:${S.view.key}:${sec.title}`, collapsed = S.collapsed.has(k);
            // A card holding a single object (Tavern, Shop, Temple, Statistics): its fields straight on the card
            const only = sec.fields.length === 1 && sec.fields[0][1].kind === 'object' ? sec.fields[0] : null;
            let body, extra = '', absent = false;
            if (only) {
                const [key, f] = only, v = rec[key];
                if (f.optional && (v === undefined || v === null)) {
                    absent = true;
                    body = `<div class="add-block">${helpHtml(f)}<button class="btn ghost" data-action="obj-add" data-path="${pathAttr([key])}">+ Add ${esc((f.label || key).toLowerCase())}</button></div>`;
                } else {
                    if (f.optional) extra = `<button class="btn sm danger" data-action="remove" data-path="${pathAttr([key])}">Remove ${esc((f.label || key).toLowerCase())}</button>`;
                    body = `${helpHtml(f)}<div class="grid">${fieldsGrid(f.fields, v || {}, [key])}</div>`;
                }
            } else {
                const inner = (sec.first ? base : '') + fieldsGrid(Object.fromEntries(sec.fields), rec, []);
                if (!inner.trim()) return '';
                body = `<div class="grid">${inner}</div>`;
            }
            return `<section class="sec ${collapsed ? 'collapsed' : ''} ${absent ? 'absent' : ''}" id="${secId(sec.title)}">
                <header class="sec-head" data-action="collapse" data-key="${esc(k)}">
                    <span class="material-symbols-outlined">${esc(SECTION_ICONS[sec.title] || 'segment')}</span>
                    <h3>${esc(sec.title)}</h3>${extra}<span class="material-symbols-outlined chev">expand_more</span>
                </header>
                <div class="sec-body">${body}</div>
            </section>`;
        }).filter(Boolean);
        const index = secs.length > 1 ? `<nav class="sec-index">${secs.map(s => {
            const absent = s.fields.length === 1 && s.fields[0][1].optional && rec[s.fields[0][0]] == null;
            return `<a href="#${secId(s.title)}" data-sec="${secId(s.title)}" class="${absent ? 'absent' : ''}">${esc(s.title)}</a>`;
        }).join('')}</nav>` : '';
        const url = !isSingle() && S.store.url(rec.id);
        ed.innerHTML = `
            <div class="ed-head">
                <div class="ed-top">
                    <div class="ed-title">
                        <div class="kind" style="--c:${GROUP_COLOURS[def.group] || 'var(--gold)'}"><span class="material-symbols-outlined">${esc(def.icon || 'description')}</span>${esc(def.label)}<span class="dot" id="ed-dirty" hidden title="Unsaved changes"></span></div>
                        <h2 id="ed-title">${esc(isSingle() ? def.label : rec.name || '(no name)')}</h2>
                        <code>${isSingle() ? esc(def.file) : `${esc(rec.id)} · ${esc(def.file)}`}</code>
                    </div>
                    <div class="ed-actions">
                        ${url ? `<a class="btn" href="../${esc(url)}" target="_blank" rel="noopener"><span class="material-symbols-outlined">open_in_new</span>View on site</a>` : ''}
                        <button class="btn icon ${S.sideToggled ? 'on' : ''}" data-action="toggle-side" title="Previews and links" id="side-btn"><span class="material-symbols-outlined">right_panel_open</span></button>
                        ${isSingle() ? '' : `<button class="btn icon" data-action="more" title="More"><span class="material-symbols-outlined">more_horiz</span></button>
                        <button class="btn danger" data-action="delete"><span class="material-symbols-outlined">delete</span>Delete</button>`}
                    </div>
                </div>
                ${index}
            </div>
            <div class="ed-wrap ${S.sideToggled ? 'side-toggled' : ''}">
                <div class="form">${cards.join('')}</div>
                <aside class="side" id="side"></aside>
            </div>`;
        ed.style.setProperty('--head-h', `${$('.ed-head', ed).offsetHeight}px`);
        renderSide();
        loadThumbs();
        autosizeAll();
        updateHeader();
        watchSections();
        if (S.refocus) {
            const box = $(`[data-chips][data-path="${CSS.escape(S.refocus)}"]`);
            S.refocus = null;
            if (box) { const i = $('.chip-in', box); i.focus(); showSuggest(i); }
        }
    }
    function updateHeader() {
        const t = $('#ed-title'), rec = curRecord();
        if (!t || !rec) return;
        if (!isSingle()) t.textContent = rec.name || '(no name)';
        const d = $('#ed-dirty');
        if (d) d.hidden = isSingle() ? !isDirtySingle(S.view.key) : !isDirtyRec(S.view.key, rec);
    }
    // The section index follows the scroll
    let secObserver = null;
    function watchSections() {
        if (secObserver) secObserver.disconnect();
        const links = $$('.sec-index a');
        if (!links.length) return;
        const ed = $('#editor');
        const visible = new Map();
        secObserver = new IntersectionObserver(entries => {
            entries.forEach(e => visible.set(e.target.id, e.isIntersecting));
            const first = $$('.sec', ed).find(s => visible.get(s.id));
            links.forEach(a => a.classList.toggle('on', !!first && a.dataset.sec === first.id));
        }, { root: ed, rootMargin: `-${$('.ed-head').offsetHeight + 10}px 0px -55% 0px` });
        $$('.sec', ed).forEach(s => secObserver.observe(s));
    }
    function autosize(el) {
        if (!el.classList.contains('auto')) return;
        const max = el.classList.contains('md') ? window.innerHeight * 0.7 : window.innerHeight * 0.4;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
    }
    const autosizeAll = () => $$('#editor textarea.auto').forEach(autosize);

    function chips(list) {
        return list.map(r => `<span class="chip" data-jump="${esc(r.id)}">${esc(r.name)} <small>${esc(TYPES[S.store.typeOf(r)].label)}</small></span>`).join('');
    }
    function renderSide() {
        const side = $('#side');
        if (!side) return;
        const rec = curRecord();
        if (!rec) { side.innerHTML = ''; return; }
        const parts = [];
        const errs = isSingle() ? singleIssues(S.issues.errors, S.view.key) : recordErrors(S.view.key, rec.id);
        const warns = isSingle() ? singleIssues(S.issues.warnings, S.view.key) : recordWarnings(S.view.key, rec.id);
        const clean = e => esc(e.replace(/^\[[^\]]+\] /, ''));
        if (errs.length || warns.length) parts.push(`<div class="box box--issues"><h4>To fix</h4><ul class="issues">${errs.map(e => `<li>${clean(e)}</li>`).join('')}${warns.map(e => `<li class="w">${clean(e)}</li>`).join('')}</ul></div>`);
        if (isSingle() && S.view.key === 'schedule' && ATH.upcoming) parts.push(schedulePreview(rec));
        if (!isSingle()) {
            const crumbs = S.store.ancestors(rec.id);
            if (crumbs.length) parts.push(`<div class="box"><h4>Sits in</h4>${chips(crumbs)}</div>`);
            const kids = S.store.children(rec.id);
            if (kids.length) parts.push(`<div class="box"><h4>Contains <span>${kids.length}</span></h4>${chips(kids)}</div>`);
            const users = S.store.backrefs(rec.id);
            // (a spell's campaigns are shown in "Known by", with the hero)
            if (users.length && S.view.key !== 'spell') parts.push(`<div class="box"><h4>Used by <span>${users.length}</span></h4>${chips(users)}</div>`);
            if (S.view.key === 'poi' && ATH.market) parts.push(...marketPreview(rec));
            if (S.view.key === 'settlement' && ATH.market) parts.push(...townPreview(rec));
            if (S.view.key === 'rumour' && ATH.market) parts.unshift(rumourPlaces(rec));
            if (S.view.key === 'notice' && ATH.noticeBoard) parts.unshift(noticePreview(rec));
            if (S.view.key === 'item' && ATH.lootCard) parts.unshift(cardPreview(rec), foundIn(rec));
            if (S.view.key === 'spell' && ATH.spellCard) parts.unshift(spellPreview(rec), knownBy(rec));
            if (S.view.key === 'deity' && ATH.deityCard) parts.unshift(deityPreview(rec), sealStatus(rec));
            if (S.view.key === 'item' && ATH.deityCard) parts.unshift(artifactOf(rec));
            if (ATH.fortuneCard && ATH.divination) parts.unshift(...divinationPreview(rec));
            if ((S.view.key === 'poi' || S.view.key === 'creature') && ATH.look && lookOf(rec).look) parts.unshift(lookPreview(rec));
            if (S.view.key === 'creature' && rec.image) parts.unshift(beastFramePreview(rec));
        }
        const html = parts.filter(Boolean).join('');
        side.innerHTML = html ? `<div class="side-head"><span>Previews & links</span><button class="btn icon" data-action="toggle-side" title="Close"><span class="material-symbols-outlined">close</span></button></div>${html}` : '';
        $('.ed-wrap').classList.toggle('no-side', !html);
        const sb = $('#side-btn'); if (sb) sb.hidden = !html;
        if (['item', 'deity', 'creature', 'fortuneCard', 'deck', 'prophecy', 'spread', 'omen'].includes(S.view.key)) loadThumbs();
        if (S.view.key === 'spell') loadSymbols();
        if (S.view.key === 'poi' || S.view.key === 'creature') applyLookPreview(rec);
    }

    /* ---------- page look (POIs, creatures): a small mock of the page ---------- */
    // Drawn with the site's styles/looks.css and scripts/core/look.js, so what it shows
    // is what the page gets. Redrawn after each change, like the other previews.
    // A creature's picture as the bestiary's window shows it (same rule as bestiary-scripts.js)
    function beastFramePreview(rec) {
        const at = rec.imageFocus || '50% 30%';
        const zoom = typeof rec.imageZoom === 'number' && rec.imageZoom > 100 ? rec.imageZoom / 100 : 1;
        return `<div class="box"><div class="box-head"><h4>Bestiary window</h4></div>
            <div class="frame-prev"><img data-thumb="${esc(rec.image)}" alt="" style="object-position:${esc(at)};transform-origin:${esc(at)};${zoom > 1 ? `transform:scale(${zoom})` : ''}"></div>
            <p class="hint">The left half of the bestiary’s pop-up, on a computer. On a phone it is a wide band, cut from the same point.</p></div>`;
    }
    // The record's own look (as edited), else the one a place above it passes down
    function lookOf(rec) {
        if (!ATH.look.isEmpty(rec.look)) return { look: rec.look, from: null };
        const r = ATH.look.resolve(S.store, S.store.get(rec.id) || rec);
        return r.from && r.from.id !== rec.id ? r : { look: null, from: null };
    }
    function lookPreview(rec) {
        const type = S.view.key;
        const plain = s => String(s || '').replace(/[#*_>\[\]()`]/g, '').replace(/\s+/g, ' ').trim();
        const lore = plain(rec.body || rec.shortDesc || rec.summary) || 'The lore of the place reads like this, with a keyword now and then.';
        const words = lore.split(' ');
        const text = esc(words.slice(0, 26).join(' ')) + (words.length > 26 ? '…' : '');
        const eyebrow = type === 'poi'
            ? [rec.institution && 'Institution', rec.tavern && 'Tavern & Lodging', rec.shop && 'Shop', rec.temple && 'Temple'].filter(Boolean).join(' · ') || String(rec.typeLabel || '').trim() || (rec.danger ? 'Danger Zone' : rec.featured ? 'Featured Landmark' : '')
            : (rec.arcana || 'Specimen');
        const extra = type === 'poi'
            ? `<div class="look-prev__box look-prev__box--card"><p class="look-prev__eyebrow">Today at the Bar</p><h5 class="look-prev__heading">Bill of Fare</h5>
                <div class="look-prev__rule"></div><div class="look-prev__item"><span>Spiced ale</span><i></i><b>4 cp</b></div></div>`
            : `<div class="look-prev__box"><p class="look-prev__eyebrow">Threat Assessment</p>
                ${(rec.stats && rec.stats.length ? rec.stats.slice(0, 2) : [{ label: 'Strength', value: 70 }, { label: 'Cunning', value: 45 }])
                .map(st => `<div class="look-prev__stat"><span>${esc(st.label)}</span><span>${esc(st.value ?? 0)}</span></div><div class="look-prev__bar"><span style="width:${Math.max(0, Math.min(100, +st.value || 0))}%"></span></div>`).join('')}</div>`;
        return `<div class="box"><div class="box-head"><h4>Look preview</h4></div>
            <div class="look-prev" data-type="${type}" id="look-prev">
                <p class="look-prev__crumbs">${esc(rec.name || 'Name')}</p>
                <div class="look-prev__box"><p class="look-prev__eyebrow">${esc(eyebrow)}</p><h3 class="look-prev__title">${esc(rec.name || 'Name')}</h3>${rec.subtitle ? `<p class="look-prev__sub">${esc(rec.subtitle)}</p>` : ''}
                    ${type === 'creature' ? `<div class="look-prev__tags">${(rec.tags && rec.tags.length ? rec.tags.slice(0, 3) : ['Tag', 'Tag']).map(t => `<span class="look-prev__tag">${esc(t)}</span>`).join('')}</div>` : ''}</div>
                <div class="look-prev__box"><p class="look-prev__label">${type === 'poi' ? 'Archive Entry' : esc(rec.loreTitle || 'Archival Record')}</p><p class="look-prev__text">${text} <b>keyword</b></p></div>
                ${extra}
            </div>
            ${lookOf(rec).from ? `<p class="hint">Taken from <span class="chip" data-jump="${esc(lookOf(rec).from.id)}">${esc(lookOf(rec).from.name)}</span> (“Also for the places inside”). Give this place a look of its own to replace it.</p>`
                : rec.look && rec.look.inherit ? `<p class="hint">Also used by the places inside this one that have no look of their own.</p>` : ''}
            <p class="hint">A sketch of the page: on the site, every box of the page follows the same look.</p></div>`;
    }
    async function applyLookPreview(rec) {
        const el = document.getElementById('look-prev');
        if (!el || !ATH.look) return;
        const look = lookOf(rec).look || {};
        // images come from the linked folder: load them before drawing
        const paths = [look.banner, look.texture === 'image' && look.textureImage].filter(Boolean);
        const urls = new Map(await Promise.all(paths.map(async p => [p, await thumbUrl(p)])));
        if (!el.isConnected) return;
        ATH.look.apply(el, look, S.view.key, { url: p => urls.get(p) || '' });
    }

    /* ---------- upcoming sessions (homepage): preview and tools ---------- */
    const STATUS_COLOURS = { next: 'var(--gold)', scheduled: '#4ade80', tbd: '#c084fc', postponed: '#fbbf24', cancelled: '#f87171' };
    function schedulePreview(rec) {
        const list = ATH.upcoming.resolve(rec.sessions || [], { campaigns: S.data.campaign });
        const past = list.filter(s => s.past).length;
        const rows = list.map(s => `
            <li class="${s.past ? 'past' : ''}">
                <span class="up-label" style="color:${s.past ? 'var(--ink-faint)' : STATUS_COLOURS[s.variant]}">${s.past ? 'Hidden: date passed' : esc(s.label)}${s.countdown ? ` · ${esc(s.countdown)}` : ''}</span>
                <b>${esc(s.title)}</b>${s.number !== null ? ` · Session ${s.number}` : ''}<br>
                <span class="muted">${esc(s.dateText)}${s.timeText ? ` · ${esc(s.timeText)}` : ''}${s.where ? ` · ${esc(s.where)}` : ''}</span>
                ${s.notice ? `<br><i class="muted">${esc(s.notice)}</i>` : ''}
            </li>`).join('');
        return `<div class="box"><h4>On the homepage</h4>
            ${list.length ? `<ol class="up-list">${rows}</ol>` : '<p class="muted">No session planned: the homepage says the calendar is empty.</p>'}
            <div class="row wrap">
                <button class="btn" data-action="schedule-add">+ Add a session</button>
                ${list.length > 1 ? '<button class="btn" data-action="schedule-sort">Sort by date</button>' : ''}
                ${past ? `<button class="btn" data-action="schedule-prune">Remove past (${past})</button>` : ''}
            </div>
            <p class="hint">The first confirmed card still to come is “Up Next”, with a countdown; a session not confirmed, or with no date, is “TBD”. Confirmed sessions get an “Add to calendar” button.</p></div>`;
    }
    function scheduleAdd() {
        const rec = S.singles.schedule = S.singles.schedule || {};
        const entries = rec.sessions = Array.isArray(rec.sessions) ? rec.sessions : [];
        const lastCampaign = (entries[entries.length - 1] || {}).campaign || S.store.settings.currentCampaign || '';
        const dlg = modal(`<h3>Add an upcoming session</h3>
            <div class="grid">
                <div class="fld w-12"><label for="up-campaign">Campaign</label>${refSelect(['campaign'], lastCampaign, 'id="up-campaign"')}</div>
                <div class="fld w-4"><label for="up-number">Session number</label><input type="number" id="up-number"></div>
                <div class="fld w-4"><label for="up-date">Date</label><input type="date" id="up-date"></div>
                <div class="fld w-4"><label for="up-time">Time</label><input type="time" id="up-time"></div>
                <div class="chk-row"><label class="chk" for="up-tbd"><input type="checkbox" id="up-tbd"><span><b>Not confirmed yet (TBD)</b></span></label></div>
                <p class="help w-12">Prefilled from the campaign's latest session and its last planned dates. Edit anything afterwards.</p>
            </div>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="up-ok">Add</button></div>`);
        const fill = () => {
            const g = ATH.upcoming.suggest(entries, $('#up-campaign', dlg).value, S.data.session);
            $('#up-number', dlg).value = g.number ?? '';
            $('#up-date', dlg).value = g.date || '';
            $('#up-time', dlg).value = g.time || '';
        };
        $('#up-campaign', dlg).addEventListener('change', fill);
        fill();
        $('#up-ok', dlg).addEventListener('click', () => {
            const num = $('#up-number', dlg).value;
            const entry = {
                campaign: $('#up-campaign', dlg).value || undefined,
                number: num === '' ? undefined : Number(num),
                date: $('#up-date', dlg).value || undefined,
                time: $('#up-time', dlg).value || undefined,
                status: $('#up-tbd', dlg).checked ? 'tentative' : undefined,
            };
            Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);
            entries.push(entry);
            closeModal();
            edited(true);
            toast('Added — not saved yet');
        });
    }
    function scheduleSort() {
        const arr = (S.singles.schedule || {}).sessions || [];
        // Dated sessions first, by date then time; undated ones keep their order at the end
        const key = e => (ATH.upcoming.parseDate(e.date) ? `0${e.date}T${e.time || '99:99'}` : '1');
        const sorted = arr.map((e, i) => [e, i]).sort((a, b) => key(a[0]).localeCompare(key(b[0])) || a[1] - b[1]).map(([e]) => e);
        if (sorted.every((e, i) => e === arr[i])) { toast('Already in date order'); return; }
        arr.splice(0, arr.length, ...sorted);
        edited(true);
    }
    function schedulePrune() {
        const rec = S.singles.schedule || {};
        const list = ATH.upcoming.resolve(rec.sessions || [], { campaigns: S.data.campaign });
        const n = list.filter(s => s.past).length;
        rec.sessions = (rec.sessions || []).filter((e, i) => !list[i].past);
        S.collapsed.clear();
        edited(true);
        toast(`Removed ${n} past session${n === 1 ? '' : 's'} — not saved yet`);
    }

    /* ---------- item cards: preview and where the party found them ---------- */
    function cardPreview(rec) {
        const item = S.store.get(rec.id) || rec;
        const sheet = S.cardSide === 'sheet';
        const card = sheet
            ? ATH.lootCard.sheet(item, S.store, { autolink: false })
            : ATH.lootCard.front(item, { tag: 'div', picture: src => `data-thumb="${esc(src)}"` });
        return `<div class="box card-prev">
            <div class="box-head"><h4>Card preview</h4>
                <span class="seg"><button data-action="card-side" data-side="front" class="${sheet ? '' : 'on'}">Front</button><button data-action="card-side" data-side="sheet" class="${sheet ? 'on' : ''}">Opened</button></span></div>
            <div class="card-prev__stage">${card}</div></div>`;
    }

    /* ---------- deity cards: preview, seal, artifact ---------- */
    // The god's card as the Pantheon shows it (an Elder god also as its sealed slot)
    function deityPreview(rec) {
        const d = S.store.get(rec.id) || rec;
        const elder = ATH.deityCard.tierOf(d) === 'elder';
        const sealedSide = elder && S.cardSide === 'sealed';
        const card = sealedSide
            ? ATH.deityCard.sealed()
            : ATH.deityCard.card(d, { tag: 'div', picture: src => `data-thumb="${esc(src)}"` });
        const btn = (key, label) => `<button data-action="card-side" data-side="${key}" class="${(key === 'sealed') === sealedSide ? 'on' : ''}">${label}</button>`;
        const tier = (S.store.enumOptions('deityTier').find(t => t.id === ATH.deityCard.tierOf(d)) || {}).label || '';
        return `<div class="box card-prev">
            <div class="box-head"><h4>Card preview</h4>
                ${elder ? `<span class="seg">${btn('front', 'Revealed')}${btn('sealed', 'Sealed')}</span>` : ''}</div>
            <div class="card-prev__stage card-prev__stage--deity">${card}</div>
            <p class="deity-prev__tier">${esc(tier)}${d.tier ? '' : ' (no tier set)'}</p></div>`;
    }
    // Elder gods: where the party knows of it (revealedIn), campaign by campaign
    function sealStatus(rec) {
        const d = S.store.get(rec.id) || rec;
        if (ATH.deityCard.tierOf(d) !== 'elder') return '';
        const camps = S.store.all('campaign');
        if (!camps.length) return '';
        const lines = camps.map(c => {
            const open = S.store.revealed(d, c.id);
            return `<li class="${open ? 'is-open' : ''}"><span>${open ? '✓ Revealed' : 'Sealed'}</span> ${esc(c.name)}</li>`;
        }).join('');
        return `<div class="box seal-status"><h4>Seal</h4><ul>${lines}</ul>
            <p class="hint">Sealed: a nameless slot in the Pantheon, no page, no keyword link, hidden from its temples. Add the campaigns to “Revealed in” to reveal it.</p></div>`;
    }
    // An item that is a god's artifact: a legend on the god's page until a party finds it
    function artifactOf(rec) {
        const gods = S.store.backrefs(rec.id, 'deity', 'artifact');
        if (!gods.length) return '';
        const found = S.store.backrefs(rec.id).some(r => S.store.typeOf(r) !== 'deity');
        return `<div class="box"><h4>Legendary artifact</h4>${chips(gods)}
            <p class="hint">${found
                ? 'Found by a party: its card is in the Vault (and the god’s page still tells the legend).'
                : 'Not found yet: only the god’s page shows it, as a legend. Add it to a session’s loot when the party finds it.'}</p></div>`;
    }

    /* ---------- spell cards: preview and who knows them ---------- */
    function spellPreview(rec) {
        const spell = S.store.get(rec.id) || rec;
        const side = S.cardSide;   // 'front' (the card), 'sheet' (opened) or 'back'
        const open = side === 'sheet';
        // Images (symbols, the back's art): data-symbol, turned into a --symbol
        // style by loadSymbols() (read through the linked folder, like thumbnails)
        const card = ATH.spellCard.card(spell, S.store, {
            open, faceDown: side === 'back', autolink: false,
            symbol: path => `data-symbol="${esc(path)}"`,
        });
        const btn = (key, label) => `<button data-action="card-side" data-side="${key}" class="${side === key || (key === 'front' && !['back', 'sheet'].includes(side)) ? 'on' : ''}">${label}</button>`;
        return `<div class="box card-prev">
            <div class="box-head"><h4>Card preview</h4>
                <span class="seg">${btn('front', 'Card')}${btn('back', 'Back')}${btn('sheet', 'Opened')}</span></div>
            <div class="card-prev__stage">${card}</div></div>`;
    }
    function loadSymbols() {
        document.querySelectorAll('[data-symbol]').forEach(async el => {
            const url = await thumbUrl(el.dataset.symbol);
            if (url) el.style.setProperty('--symbol', `url("${url}")`);
        });
    }
    // Who knows a spell: one line per hero and campaign (campaign.spellbooks)
    function knownBy(rec) {
        const lines = S.store.all('campaign').flatMap(c => (c.spellbooks || [])
            .filter(b => b.hero && (b.spells || []).includes(rec.id))
            .map(b => `<div><span class="chip" data-jump="${esc(b.hero)}">${esc(nameOf(b.hero))}</span> <small class="muted">in</small> <span class="chip" data-jump="${esc(c.id)}">${esc(c.name)}</span></div>`));
        return `<div class="box"><h4>Known by</h4>
            ${lines.length ? `<div class="stack">${lines.join('')}</div>` : '<p class="warn">No hero knows it yet: no player sees this card.</p>'}
            <p class="hint">Add it to a hero in a campaign's Spellbooks.</p></div>`;
    }

    // Where an item can be found: a session's loot, or a party's own inventory
    function foundOptions(itemId, selected) {
        const has = (list) => (list || []).includes(itemId);
        return S.store.all('campaign').map(c => {
            const sessions = S.store.all('session').filter(s => s.campaign === c.id && !has(s.loot));
            const opts = sessions.map(s => `<option value="session:${esc(s.id)}" ${selected === 'session:' + s.id ? 'selected' : ''}>${esc(s.name)}</option>`);
            if (!has(c.inventory)) opts.push(`<option value="inventory:${esc(c.id)}" ${selected === 'inventory:' + c.id ? 'selected' : ''}>The party's own inventory</option>`);
            return opts.length ? `<optgroup label="${esc(c.name)}">${opts.join('')}</optgroup>` : '';
        }).join('');
    }
    function addFoundIn(itemId, where) {
        const [kind, id] = where.split(':');
        const rec = (S.data[kind === 'session' ? 'session' : 'campaign'] || []).find(r => r.id === id);
        if (!rec) return false;
        const key = kind === 'session' ? 'loot' : 'inventory';
        rec[key] = [...new Set([...(rec[key] || []), itemId])];
        return true;
    }
    // A new session: same campaign as the session on screen (else the current
    // campaign), numbered after that campaign's latest session
    function nextSession() {
        const cur = S.view.key === 'session' ? curRecord() : null;
        const campaign = (cur && cur.campaign) || S.store.settings.currentCampaign || (S.store.all('campaign')[0] || {}).id;
        if (!campaign) return {};
        const nums = S.data.session.filter(s => s.campaign === campaign && typeof s.number === 'number').map(s => s.number);
        return { campaign, number: nums.length ? Math.max(...nums) + 1 : 1 };
    }
    function newestSessionOption() {
        const camp = S.store.settings.currentCampaign || (S.store.all('campaign')[0] || {}).id;
        const s = S.store.all('session').find(x => x.campaign === camp);
        return s ? 'session:' + s.id : '';
    }
    function foundIn(rec) {
        const holders = [
            ...S.store.all('session').filter(s => (s.loot || []).includes(rec.id)),
            ...S.store.all('campaign').filter(c => (c.inventory || []).includes(rec.id)),
        ];
        const opts = foundOptions(rec.id);
        return `<div class="box"><h4>Found in</h4>
            ${holders.length ? chips(holders) : '<p class="warn">Not found anywhere yet: no player sees this card.</p>'}
            ${opts ? `<div class="row found-add"><select id="found-add" aria-label="Where it was found"><option value="">Add where it was found…</option>${opts}</select>
                <button class="btn" data-action="found-add">Add</button></div>` : ''}
            <p class="hint">Items from a campaign's newest session lie face down in the Vault until a player turns them over.</p></div>`;
    }
    /* ---------- taverns, shops, temples, rumours, boards (scripts/market.js) ---------- */
    const marketCode = () => S.menuCode ?? (S.store.settings.tavernCode || '');
    const codeInput = () => `<input id="menu-code" placeholder="Try another code (not saved)" value="${esc(S.menuCode ?? '')}" aria-label="Try another market code">`;
    const hint = text => `<p class="hint">${text}</p>`;
    const priceRows = cats => cats.map(c => `<h5>${esc(c.label)}</h5>${c.items.map(i => `<div><span>${i.signature ? '✦ ' : ''}${esc(i.name)}</span><span>${esc(i.priceLabel)}</span></div>`).join('')}`).join('');
    const truthLabel = r => r.truth ? `<span class="truth truth--${esc(r.truth)}">${esc((S.store.enumOptions('rumourTruth').find(o => o.id === r.truth) || {}).label)}</span>` : '<span class="truth">truth not set</span>';
    const addHere = (type, where, label) => `<button class="btn add-here" data-action="add-here" data-type="${type}" data-where="${esc(where)}">+ ${label}</button>`;

    // Rumours in the order this tavern hands them out with the code. ✓ = heard by a player
    // of the current campaign (Settings), who gets the first ones that belong to it.
    function rumourList(poi, code) {
        const list = ATH.market.rumourOrder(S.store, poi, code);
        const limit = ATH.market.drawLimit(poi);
        const cid = S.store.settings.currentCampaign;
        if (!list.length) return '<p class="muted">No rumour is heard here yet.</p>';
        let n = 0;
        return `<ol class="mkt-list">${list.map(r => {
            const heard = ATH.market.inCampaign(r, cid) && n++ < limit;
            return `<li class="${heard ? 'in' : 'out'}" data-jump="${esc(r.id)}" title="${esc(r.text)}">
            <span>${heard ? '✓' : '·'} ${esc(r.name)}</span>${truthLabel(r)}
            <small>${esc(nameOf(r.where))}${(r.campaigns || []).length ? ' · ' + esc(r.campaigns.map(nameOf).join(', ')) : ''}</small></li>`;
        }).join('')}</ol>
            ${hint(`In the order this tavern tells them. A player hears the first ${limit} that belong to their campaign (✓ = ${cid ? esc(nameOf(cid)) : 'any campaign'}).`)}`;
    }
    function noticeList(placeId) {
        const list = ATH.market.notices(S.store, placeId, 'all');
        if (!list.length) return '<p class="muted">Nothing pinned here.</p>';
        return `<ul class="mkt-list">${list.map(n => `<li class="${(n.status || 'open') === 'open' ? 'in' : 'out'}" data-jump="${esc(n.id)}">
            <span>${esc(n.name)}</span><span class="truth">${esc(n.status || 'open')}</span>
            <small>${esc(enumLabel('noticeKind', n.kind))}${(n.campaigns || []).length ? ' · ' + esc(n.campaigns.map(nameOf).join(', ')) : ''}</small></li>`).join('')}</ul>`;
    }

    // POI: one box per role (tavern, shop, temple) and its board
    function marketPreview(rec) {
        const poi = S.store.get(rec.id);
        if (!poi) return [];
        const code = marketCode(), M = ATH.market, out = [];
        const tavern = poi.tavern && poi.tavern.tier, shop = poi.shop && poi.shop.kind, temple = poi.temple;
        // Institution (or any POI that others sit in): its places and where each is pinned
        const I = ATH.institution, inside = S.store.children(poi, 'poi');
        if (I && (I.block(poi) || inside.length)) {
            const maps = I.maps(poi), folk = I.people(S.store, poi);
            const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
            out.push(`<div class="box mkt-prev"><h4>${I.block(poi) ? esc(I.kind(S.store, poi).label) : 'Places inside'} <span>${inside.length}</span></h4>
                ${inside.length ? `<ul class="mkt-list">${inside.map(p => {
                const on = I.mapOf(poi, p);
                return `<li class="${on ? 'in' : 'out'}" data-jump="${esc(p.id)}"><span>${esc(p.name)}</span><span class="truth">${on ? esc(on.name || on.id) : 'no pin'}</span></li>`;
            }).join('')}</ul>` : '<p class="muted">No place inside it yet.</p>'}
                ${I.block(poi) ? hint(`${plural(maps.length, 'map')} with an image · ${plural(folk.groups.length, 'group')} · ${plural(folk.groups.reduce((n, g) => n + g.members.length, 0) + folk.others.length, 'person').replace('persons', 'people')}. Its places are the POIs whose “Sits in” is this one.`) : ''}
                ${I.block(poi) && !maps.length ? '<p class="warn">No map with an image, width and height: no Map tab.</p>' : ''}
                ${addHere('poi', rec.id, 'Place inside this one')}</div>`);
        }
        if (tavern || shop) out.push(`<div class="box menu-prev"><h4>Market code</h4>${codeInput()}${hint(`Menus, wares and the rumour order below use this code. The live code (${esc(S.store.settings.tavernCode || 'none')}) is in Settings.`)}</div>`);
        if (tavern) {
            out.push(`<div class="box menu-prev"><h4>Menu preview</h4>
                <p class="hint" style="margin:0 0 4px">${esc(ATH.tavern.folioLabel(code, rec.id))}</p>
                ${priceRows(ATH.tavern.buildMenu(S.store, poi, code))}</div>`);
            // The gaming table: what each stake costs per seat in this tavern, and what players start with
            if ((poi.tavern.games || []).length) {
                const T = ATH.tavern, tier = T.tierOf(S.store, poi.tavern);
                out.push(`<div class="box menu-prev"><h4>Gaming stakes · ${esc(tier.label)}</h4>
                    ${priceRows([{ label: 'Blind per seat', items: T.stakes(S.store, poi.tavern).map(s => ({ name: s.label, priceLabel: T.formatCoin(s.blind) })) }])}
                    ${hint(`Base blind × the tier (×${tier.mult}). Every seat puts one in the pot each hand; a raise adds one more. Players start with ${esc(T.formatCoin(T.startingPurse(S.store)))} (Settings → Gaming purse).`)}
                    ${(house => hint(`House cut: ${house.houseCut ? `${house.houseCut}% of every pot` : 'none'}. Highest stakes: ${house.highTableWins ? `open after ${house.highTableWins} staked win${house.highTableWins === 1 ? '' : 's'} here` : 'open to all'}. A broke player ${house.loanInterest ? `borrows a purse at ${house.loanInterest}% (Settings → House loan interest)` : 'gets a free fresh purse'}.`))(T.gaming(S.store, poi.tavern))}</div>`);
            }
            out.push(`<div class="box mkt-prev"><h4>Rumours heard here</h4>${rumourList(poi, code)}<div class="stack">${addHere('rumour', rec.id, 'Rumour for this tavern only')}
                ${poi.parent ? addHere('rumour', (S.store.ancestors(poi).find(p => S.store.typeOf(p) === 'settlement') || {}).id || poi.parent, 'Rumour for the whole settlement') : ''}</div></div>`);
        }
        if (shop) {
            const wares = M.buildWares(S.store, poi, code);
            out.push(`<div class="box menu-prev"><h4>Wares · ${esc(M.shopKind(S.store, poi.shop).label)} · ${esc(M.tierFor(S.store, poi, poi.shop).label)}</h4>
                ${wares.length ? priceRows(wares) : '<p class="warn">No goods match: check the shelves, tier and tags.</p>'}
                ${hint('Shelves: ' + esc(M.shelvesOf(S.store, poi.shop).map(c => c.label).join(', ')))}</div>`);
        }
        if (temple) {
            const rites = M.buildRites(S.store, poi);
            const blessings = M.blessingsFor(S.store, poi);
            out.push(`<div class="box menu-prev"><h4>Shrine preview</h4>
                ${rites.length ? priceRows(rites) : '<p class="muted">No services listed.</p>'}
                ${temple.noPrayer ? hint('No prayer button.') : blessings.length ? hint(`“Pray” draws one of ${blessings.length} blessing${blessings.length === 1 ? '' : 's'} (once per code, per player).`) : '<p class="warn">No blessing fits these deities: no prayer button.</p>'}</div>`);
        }
        if (poi.divination && ATH.divination) out.push(seerPreview(poi));
        out.push(`<div class="box mkt-prev"><h4>Notice board</h4>${noticeList(rec.id)}${addHere('notice', rec.id, 'Notice on this board')}</div>`);
        return out;
    }
    // Settlement: its town board, and the rumours heard in all its taverns
    function townPreview(rec) {
        const own = S.store.all('rumour').filter(r => r.where === rec.id);
        const taverns = S.store.descendants(rec.id, 'poi').filter(p => p.tavern && p.tavern.tier);
        return [
            `<div class="box mkt-prev"><h4>Town board</h4>${noticeList(rec.id)}${addHere('notice', rec.id, 'Notice on the town board')}</div>`,
            `<div class="box mkt-prev"><h4>Rumours of the whole settlement <span>${own.length}</span></h4>
                ${own.length ? `<ul class="mkt-list">${own.map(r => `<li class="in" data-jump="${esc(r.id)}" title="${esc(r.text)}"><span>${esc(r.name)}</span>${truthLabel(r)}</li>`).join('')}</ul>` : ''}
                ${taverns.length ? hint('Heard in: ' + taverns.map(t => esc(t.name)).join(', ')) : '<p class="warn">No tavern in this settlement: no one hears them.</p>'}
                ${addHere('rumour', rec.id, 'Rumour for the whole settlement')}</div>`,
        ];
    }
    // Rumour: the taverns where it is heard, and whether a player gets it with the code
    function rumourPlaces(rec) {
        const r = S.store.get(rec.id), w = r && S.store.get(r.where);
        if (!w) return '<div class="box"><h4>Heard in</h4><p class="warn">Choose where it is heard.</p></div>';
        const code = marketCode();
        const taverns = (S.store.typeOf(w) === 'poi' ? [w] : S.store.descendants(w, 'poi')).filter(p => p.tavern && p.tavern.tier);
        const rows = taverns.map(t => {
            const cid = S.store.settings.currentCampaign;
            const mine = ATH.market.rumourOrder(S.store, t, code).filter(x => ATH.market.inCampaign(x, cid) || x.id === r.id);
            const i = mine.findIndex(x => x.id === r.id), limit = ATH.market.drawLimit(t);
            return `<li class="${i >= 0 && i < limit ? 'in' : 'out'}" data-jump="${esc(t.id)}"><span>${esc(t.name)}</span>
                <span class="truth">${i < 0 ? '—' : i < limit ? `drawn #${i + 1}` : `#${i + 1}, not drawn`}</span></li>`;
        }).join('');
        return `<div class="box mkt-prev"><h4>Heard in (with this code)</h4>${codeInput()}
            ${taverns.length ? `<ul class="mkt-list">${rows}</ul>` : '<p class="warn">No tavern there: no one hears it.</p>'}
            ${hint(`Each tavern tells rumours in its own seeded order; a player of ${esc(nameOf(S.store.settings.currentCampaign) || 'the campaign')} hears the first few (the tavern’s “Rumours per player”).`)}</div>`;
    }
    function noticePreview(rec) {
        const n = S.store.get(rec.id);
        if (!n) return '';
        return `<div class="box notice-prev"><h4>Preview</h4><div class="notice-board" style="padding:14px 10px">${ATH.noticeBoard.render(S.store, [n])}</div></div>`;
    }
    /* ---------- divination (scripts/divination.js, scripts/fortune-card.js) ---------- */
    const thumb = src => `data-thumb="${esc(src)}"`;
    // A seer (POI): its price list, and the prophecies waiting there, campaign by campaign
    function seerPreview(poi) {
        const D = ATH.divination, M = ATH.market;
        const prices = D.priceList(S.store, poi);
        const list = D.prophecies(S.store, poi.id);
        const dead = D.practices(S.store, poi).filter(p => !D.ready(S.store, p));
        return `<div class="box menu-prev"><h4>Readings · ${esc(M.tierFor(S.store, poi, poi.divination).label)}</h4>
            ${prices.length ? priceRows(prices) : '<p class="warn">No practice offered: no Readings tab.</p>'}
            ${dead.map(p => `<p class="warn">${esc(p.name)} gives no reading yet (no cards, spread or omen fits).</p>`).join('')}
            ${hint('One reading per player, per day. A prophecy below takes the place of the next one, in its campaign.')}</div>
            <div class="box mkt-prev"><h4>Prophecies here <span>${list.length}</span></h4>
            ${list.length ? `<ol class="mkt-list">${list.map(p => `<li data-jump="${esc(p.id)}"><span>${esc(p.name)}</span><span class="truth">${esc(p.practice ? nameOf(p.practice) : '')}</span>
                <small>${esc((p.campaigns || []).map(nameOf).join(', ') || 'No campaign')}</small></li>`).join('')}</ol>
                ${hint('In this order: a player gets the first they have not had yet.')}` : '<p class="muted">None yet: every reading here is drawn at random.</p>'}
            ${addHere('prophecy', poi.id, 'Prophecy read here')}</div>`;
    }
    function divinationPreview(rec) {
        const F = ATH.fortuneCard, D = ATH.divination, type = S.view.key;
        const r = S.store.get(rec.id) || rec;
        if (type === 'fortuneCard') {
            const deck = S.store.get(r.deck) || null;
            const side = ['reversed', 'back'].includes(S.cardSide) ? S.cardSide : 'front';
            const btn = (key, label) => `<button data-action="card-side" data-side="${key}" class="${side === key ? 'on' : ''}">${label}</button>`;
            return [`<div class="box card-prev"><div class="box-head"><h4>Card preview</h4>
                <span class="seg">${btn('front', 'Upright')}${btn('reversed', 'Reversed')}${btn('back', 'Back')}</span></div>
                <div class="card-prev__stage">${F.card(r, deck, { tag: 'div', faceDown: side === 'back', reversed: side === 'reversed', picture: thumb })}</div></div>`];
        }
        if (type === 'deck') {
            const cards = S.store.all('fortuneCard').filter(c => c.deck === r.id);
            const used = S.store.all('practice').filter(p => p.deck === r.id);
            return [`<div class="box card-prev"><h4>Back</h4><div class="card-prev__stage">${F.card({ name: '' }, r, { tag: 'div', faceDown: true, picture: thumb })}</div></div>`,
                `<div class="box"><h4>Cards <span>${cards.length}</span></h4>
                ${cards.length ? `<div class="fan-prev">${cards.map(c => `<span data-jump="${esc(c.id)}" title="${esc(c.name)}">${F.card(c, r, { tag: 'div', picture: thumb })}</span>`).join('')}</div>` : '<p class="muted">No card yet.</p>'}
                ${used.length ? '' : '<p class="warn">No practice draws from this deck yet.</p>'}
                <button class="btn add-here" data-action="add-here" data-type="fortuneCard" data-field="deck" data-where="${esc(r.id)}">+ Card in this deck</button></div>`];
        }
        if (type === 'spread') {
            const positions = r.positions || [];
            if (!positions.length) return [];
            const view = {
                practice: { name: 'Spread' }, method: 'cards', spread: r, deck: null, prophecy: false, intro: '', closing: '',
                layout: r.layout === 'cross' && positions.length === 5 ? 'cross' : 'row',
                slots: positions.map((pos, i) => ({ position: pos, card: { name: pos.name, number: i + 1 }, reversed: false, keywords: [], reading: '' })),
                turned: new Set(),
            };
            return [`<div class="box fortune-prev"><h4>As it is laid</h4><div class="fread">${F.reading(view, { tag: 'div' })}</div></div>`];
        }
        if (type === 'prophecy') {
            const view = D.view(S.store, D.fromProphecy(S.store, r));
            return [`<div class="box fortune-prev"><h4>The reading, every card turned</h4>
                ${view ? `<div class="fread">${F.reading(view, { tag: 'div', allTurned: true, picture: thumb })}</div>` : '<p class="muted">Choose a practice and its cards (or write the omen) to see it.</p>'}
                ${hint('A player of these campaigns gets it at their next reading here, whatever they asked for. Then readings go back to random.')}</div>`];
        }
        return [];
    }
    async function thumbUrl(src) {
        if (!src) return '';
        if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
        if (!S.thumbs.has(src)) S.thumbs.set(src, io.url(src.replace(/^\.?\//, '')).catch(() => ''));
        return S.thumbs.get(src);
    }
    function loadThumbs() {
        document.querySelectorAll('img[data-thumb]').forEach(async img => {
            const url = await thumbUrl(img.dataset.thumb);
            img.src = url || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
            img.classList.toggle('none', !url);
        });
    }

    /* =================================================================
       QUICK OPEN (Ctrl K): any record, any tool
       ================================================================= */
    function quickOpen() {
        const dlg = modal(`<div class="qo"><span class="material-symbols-outlined">search</span><input id="qo-in" placeholder="Find a record or a tool…" autocomplete="off"></div>
            <div id="qo-list" class="qo-list"></div>
            <p class="hint">↑ ↓ to choose · Enter to open · Esc to close</p>`, 'top');
        const input = $('#qo-in', dlg), list = $('#qo-list', dlg);
        // Each entry wears the colour of its group in the menu
        const col = d => GROUP_COLOURS[d.group] || SPARE_COLOURS[0];
        const all = [
            ...Object.entries(TYPES).map(([k, d]) => ({ nav: `type:${k}`, name: d.plural || d.label, sub: `${S.data[k].length} records`, tag: d.group, icon: d.icon, c: col(d) })),
            ...Object.entries(SINGLES).map(([k, d]) => ({ nav: `single:${k}`, name: d.label, sub: d.file, tag: d.group, icon: d.icon, c: col(d) })),
            ...Object.entries(TYPES).flatMap(([t, d]) => S.data[t].map(r => ({ id: r.id, name: r.name || r.id, sub: subtitle(t, r), tag: d.label, icon: d.icon, c: col(d), hay: [r.name, r.id, ...(r.aliases || [])].join(' ').toLowerCase() }))),
        ];
        let items = [], at = 0;
        const draw = () => {
            const q = input.value.trim().toLowerCase();
            items = (q ? all.filter(o => (o.hay || o.name.toLowerCase()).includes(q))
                .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || (!!a.nav - !!b.nav) * -1) : all.filter(o => o.nav)).slice(0, 50);
            at = Math.min(at, Math.max(0, items.length - 1));
            list.innerHTML = items.map((o, i) => `<div class="qo-i ${i === at ? 'on' : ''}" data-i="${i}" style="--c:${o.c}">
                <span class="qo-ic material-symbols-outlined">${esc(o.icon || 'description')}</span>
                <span class="qo-txt"><b>${esc(o.name)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
                <span class="qo-tag">${esc(o.nav ? 'Go to' : o.tag)}</span></div>`).join('') || '<p class="muted qo-none">No match.</p>';
            const on = $('.qo-i.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
        };
        const go = i => {
            const o = items[i]; if (!o) return;
            closeModal();
            if (o.nav) { const [kind, key] = o.nav.split(':'); S.search = ''; $('#search').value = ''; select({ kind, key }, null); }
            else jump(o.id);
        };
        input.addEventListener('input', () => { at = 0; draw(); });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(items.length - 1, at + 1); draw(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); draw(); }
            if (e.key === 'Enter') { e.preventDefault(); go(at); }
        });
        list.addEventListener('click', e => { const el = e.target.closest('.qo-i'); if (el) go(Number(el.dataset.i)); });
        draw(); input.focus();
    }

    /* =================================================================
       ACTIONS
       ================================================================= */
    function select(view, id) {
        S.view = view; S.sel = id ?? null; S.menuCode = null;
        renderNav(); renderList(); renderEditor();
        $('#editor').scrollTop = 0;
        const active = $('.li.active'); if (active) active.scrollIntoView({ block: 'nearest' });
    }
    function jump(id) {
        const type = typeOfId(id);
        if (type) { S.search = ''; $('#search').value = ''; select({ kind: 'type', key: type }, id); }
        closeModal();
    }
    // Alt ↑ / ↓: the previous / next record of the list as shown
    function step(dir) {
        if (isSingle()) return;
        const ids = $$('#list-items .li').map(b => b.dataset.select);
        if (!ids.length) return;
        const i = ids.indexOf(S.sel);
        const j = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + dir));
        if (ids[j] !== S.sel) select(S.view, ids[j]);
    }
    function edited(structural) {
        if (structural) { rebuild(); renderEditor(); renderNav(); renderList(); refreshChrome(); }
        else scheduleRefresh();
    }
    function emptyFor(f) {
        const o = {};
        for (const [k, sf] of Object.entries(f.fields || {})) if (sf.kind === 'object' && !sf.optional) o[k] = emptyFor(sf);
        return o;
    }

    function newRecord(preset = {}) {
        const type = S.view.key, def = TYPES[type];
        const current = curRecord();
        // "+ New" beside an open record: a child of it when it can hold one, else its sibling.
        // A POI holds other POIs only when it is an institution (or when asked: preset.parent).
        const holds = current && (def.parent || []).includes(typeOfId(current.id)) && (typeOfId(current.id) !== 'poi' || !!(current.institution && current.institution.kind));
        const guessParent = preset.parent || (current && def.place ? (holds ? current.id : current.parent) : '');
        const dlg = modal(`<h3>New ${esc(def.label.toLowerCase())}</h3>
            <div class="grid">
                <div class="fld w-12"><label for="nr-name">Name</label><input id="nr-name" autofocus></div>
                <div class="fld w-12"><label for="nr-id">Id</label><input id="nr-id"><p class="help">Used in links and addresses. Lowercase letters, digits, - and _; it can be changed later with Rename id.</p></div>
                ${def.place && def.parent.length ? `<div class="fld w-12"><label for="nr-parent">Sits in</label>${refSelect(def.parent, guessParent, 'id="nr-parent"')}</div>` : ''}
                ${def.fields.where ? `<div class="fld w-12"><label for="nr-where">${esc(def.fields.where.label)}</label>${refSelect(def.fields.where.to, preset.where || '', 'id="nr-where"')}</div>` : ''}
                ${type === 'item' ? `<div class="fld w-12"><label for="nr-found">Found in</label><select id="nr-found"><option value="">Nowhere yet</option>${foundOptions('', newestSessionOption())}</select><p class="help">Who can see the card in the Vault.</p></div>` : ''}
                <p id="nr-err" class="err w-12"></p>
            </div>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="nr-ok">Create</button></div>`);
        const name = $('#nr-name', dlg), idIn = $('#nr-id', dlg);
        let touched = false;
        name.addEventListener('input', () => { if (!touched) idIn.value = slug(name.value); });
        idIn.addEventListener('input', () => { touched = true; });
        name.focus();
        const create = () => {
            const id = idIn.value.trim(), parent = $('#nr-parent', dlg) ? $('#nr-parent', dlg).value : undefined;
            const err = !name.value.trim() ? 'Give it a name.' : !ID_RE.test(id) ? 'The id may contain lowercase letters, digits, - and _ only.' : allIds().has(id) ? `"${id}" is already used by a ${TYPES[typeOfId(id)].label.toLowerCase()}.` : (def.place && def.parent.length && !parent) ? 'Choose where it sits.' : '';
            if (err) { $('#nr-err', dlg).textContent = err; return; }
            const rec = { id, name: name.value.trim(), ...emptyFor(def) };
            if (parent) rec.parent = parent;
            const whereSel = $('#nr-where', dlg);
            if (whereSel && whereSel.value) rec.where = whereSel.value;
            if (type === 'notice') { rec.kind = 'job'; rec.status = 'open'; }
            if ((type === 'rumour' || type === 'notice' || type === 'prophecy') && S.store.settings.currentCampaign) rec.campaigns = [S.store.settings.currentCampaign];
            if (type === 'fortuneCard' && preset.deck) {
                rec.deck = preset.deck;
                const nums = S.data.fortuneCard.filter(c => c.deck === preset.deck && typeof c.number === 'number').map(c => c.number);
                rec.number = nums.length ? Math.max(...nums) + 1 : 0;
            }
            if (type === 'prophecy' && rec.where) {
                const seer = S.store.get(rec.where);
                const first = seer && ((seer.divination || {}).practices || [])[0];
                if (first) rec.practice = first;
            }
            if (type === 'session') Object.assign(rec, nextSession());
            S.data[type].push(rec);
            const found = $('#nr-found', dlg);
            if (found && found.value) addFoundIn(id, found.value);
            closeModal();
            rebuild();
            select({ kind: 'type', key: type }, id);
            refreshChrome();
        };
        $('#nr-ok', dlg).addEventListener('click', create);
        dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') create(); });
    }

    function deleteRecord() {
        const rec = curRecord(), type = S.view.key;
        const users = [...S.store.children(rec.id), ...S.store.backrefs(rec.id)];
        if (users.length) {
            alertBox(`“${rec.name}” is still in use`, `<p>Change or remove these first, so no link breaks:</p><div>${chips(users)}</div>`);
            return;
        }
        modal(`<h3>Delete “${esc(rec.name)}”?</h3><p>It disappears from <code>${esc(TYPES[type].file)}</code> when you save. Nothing else points to it.</p>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" id="del-ok">Delete</button></div>`);
        $('#del-ok').addEventListener('click', () => {
            S.data[type] = S.data[type].filter(r => r !== rec);
            S.sel = null;
            closeModal(); edited(true);
        });
    }

    // Changes an id and every reference to it, in every file.
    function renameRecord() {
        const rec = curRecord();
        const dlg = modal(`<h3>Rename id “${esc(rec.id)}”</h3>
            <p>Every link to it in the data files is updated when you save. Bookmarks and links typed by hand elsewhere keep the old id.</p>
            <div class="fld"><label for="rn-id">New id</label><input id="rn-id" value="${esc(rec.id)}"></div>
            <p id="rn-err" class="err"></p>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="rn-ok">Rename</button></div>`);
        $('#rn-ok', dlg).addEventListener('click', () => {
            const to = $('#rn-id', dlg).value.trim(), from = rec.id;
            if (to === from) { closeModal(); return; }
            const err = !ID_RE.test(to) ? 'Lowercase letters, digits, - and _ only.' : allIds().has(to) ? `"${to}" is already used.` : '';
            if (err) { $('#rn-err', dlg).textContent = err; return; }
            let count = 0;
            const walk = (fields, obj) => {
                if (!obj || typeof obj !== 'object') return;
                for (const [k, f] of Object.entries(fields)) {
                    const v = obj[k];
                    if (f.kind === 'ref' && v === from) { obj[k] = to; count++; }
                    else if (f.kind === 'refs' && Array.isArray(v)) obj[k] = v.map(x => (x === from ? (count++, to) : x));
                    else if (f.kind === 'object') walk(f.fields, v);
                    else if (f.kind === 'objects' && Array.isArray(v)) v.forEach(o => walk(f.fields, o));
                }
            };
            for (const [type, def] of Object.entries(TYPES)) {
                for (const r of S.data[type]) {
                    if (r.parent === from) { r.parent = to; count++; }
                    walk(def.fields, r);
                }
            }
            for (const [name, def] of Object.entries(SINGLES)) walk(def.fields, S.singles[name]);
            rec.id = to; S.sel = to;
            closeModal(); edited(true);
            toast(`Renamed; ${count} link${count === 1 ? '' : 's'} updated — not saved yet`);
        });
    }

    // Swaps the record with its neighbour in the list as shown (same group), i.e. in the file
    function moveRecord(dir) {
        const type = S.view.key, list = S.data[type], rec = curRecord();
        const group = orderedRecords(type).find(g => g.recs.includes(rec));
        const recs = group ? group.recs : list;
        const j = recs.indexOf(rec) + dir;
        if (j < 0 || j >= recs.length) return;
        const a = list.indexOf(rec), b = list.indexOf(recs[j]);
        [list[a], list[b]] = [list[b], list[a]];
        edited(true);
    }
    // Drag and drop in the list: moves the record in its file, so the site shows it there.
    // Only within its group (and, for POIs, among the places that sit in the same one).
    function sameShelf(type, a, b) {
        const ga = listGroup(type, a), gb = listGroup(type, b);
        if ((ga ? ga.key : '') !== (gb ? gb.key : '')) return false;
        return type !== 'poi' || (a.parent || '') === (b.parent || '');
    }
    function dropRecord(id, targetId, after) {
        const type = S.view.key, list = S.data[type];
        const rec = list.find(r => r.id === id), target = list.find(r => r.id === targetId);
        if (!rec || !target || rec === target || !sameShelf(type, rec, target)) return;
        list.splice(list.indexOf(rec), 1);
        list.splice(list.indexOf(target) + (after ? 1 : 0), 0, rec);
        edited(true);
    }
    function moreMenu(btn) {
        const def = TYPES[S.view.key];
        const items = [{ action: 'rename', icon: 'edit', label: 'Rename id…' }];
        if (!def.order) {
            items.push(null,
                { action: 'move-record', dir: -1, icon: 'arrow_upward', label: 'Move up (order on the site)' },
                { action: 'move-record', dir: 1, icon: 'arrow_downward', label: 'Move down (order on the site)' });
        }
        openMenu(btn, items);
    }

    async function pickImage(path) {
        try {
            const rel = await io.pick({ 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'] });
            if (rel === null) { toast('Pick a file inside the project folder'); return; }
            setAt(curRecord(), path, rel);
            edited(true);
        } catch (e) { if (e.name !== 'AbortError') toast(e.message); }
    }
    async function readSize(path) {
        const v = getAt(curRecord(), path) || {};
        if (!v.src) { toast('Set the image first'); return; }
        const img = new Image();
        img.onload = () => { setAt(curRecord(), [...path, 'width'], img.naturalWidth); setAt(curRecord(), [...path, 'height'], img.naturalHeight); edited(true); };
        img.onerror = () => toast('Could not open that image');
        img.src = await thumbUrl(v.src);
    }

    // Click-to-place on the parent's map (the world map for continents).
    async function placeOnMap(path) {
        const rec = curRecord(), def = curDef();
        if (typeof L === 'undefined') { alertBox('Map unavailable', '<p>Leaflet could not be loaded (offline?). Type X and Y instead.</p>'); return; }
        const host = def.parent && def.parent.length ? S.store.get(rec.parent) : S.store.world;
        const cur = getAt(rec, path) || {};
        let img = host && host.mapImage;
        // Inside an institution: the map chosen in “Map” (else its first one)
        const inInstitution = host && typeOfId(host.id) === 'poi';
        let onMap = null;
        if (inInstitution) {
            const maps = ((host.institution || {}).maps || []).filter(x => x && x.id);
            onMap = cur.on ? maps.find(x => x.id === cur.on) : maps[0];
            img = onMap && onMap.image;
        }
        if (!img || !img.src || !img.width || !img.height) {
            alertBox('No map to place on', `<p>${host ? `“${esc(onMap ? `${host.name} · ${onMap.name || onMap.id}` : host.name)}”` : 'The parent'} has no map image with a width and height yet.</p>`);
            return;
        }
        let pos = cur.x != null && cur.y != null ? [cur.y, cur.x] : [img.height / 2, img.width / 2];
        const dlg = modal(`<h3>Place “${esc(rec.name)}” on ${esc(onMap ? `${host.name} · ${onMap.name || onMap.id}` : (host.name || 'the map'))}</h3>
            <p class="muted" style="margin-top:-6px">Click the map or drag the gold pin. Other pins on this map are shown in white.</p>
            <div id="placer"></div>
            <div class="foot"><span id="placer-pos" class="muted" style="margin-right:auto"></span>
                <button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="placer-ok">Use this position</button></div>`, 'xwide');
        const map = L.map($('#placer', dlg), { crs: L.CRS.Simple, minZoom: -3, maxZoom: 2, attributionControl: false });
        const bounds = [[0, 0], [img.height, img.width]];
        L.imageOverlay(await thumbUrl(img.src), bounds).addTo(map);
        map.fitBounds(bounds);
        const sibs = def.parent && def.parent.length
            ? Object.keys(TYPES).flatMap(t => TYPES[t].place ? S.data[t].filter(r => r.parent === rec.parent) : [])
            : S.data[S.view.key];
        const firstMapId = inInstitution ? (((host.institution || {}).maps || []).find(x => x && x.id) || {}).id : null;
        sibs.filter(r => r !== rec && r.map && r.map.x != null && (!inInstitution || (r.map.on || firstMapId) === onMap.id)).forEach(r =>
            L.marker([r.map.y, r.map.x], { icon: L.divIcon({ className: '', html: '<div class="pin-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) })
                .bindTooltip(r.name).addTo(map));
        const me = L.marker(pos, { draggable: true, icon: L.divIcon({ className: '', html: '<div class="pin-dot me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map);
        const show = () => { $('#placer-pos', dlg).textContent = `X ${Math.round(pos[1])} · Y ${Math.round(pos[0])}`; };
        show();
        map.on('click', e => { pos = [e.latlng.lat, e.latlng.lng]; me.setLatLng(e.latlng); show(); });
        me.on('drag', e => { const ll = e.target.getLatLng(); pos = [ll.lat, ll.lng]; show(); });
        setTimeout(() => map.invalidateSize(), 50);
        $('#placer-ok', dlg).addEventListener('click', () => {
            setAt(rec, [...path, 'x'], Math.round(pos[1]));
            setAt(rec, [...path, 'y'], Math.round(pos[0]));
            closeModal(); edited(true);
        });
    }

    /* =================================================================
       EVENTS
       ================================================================= */
    function readValue(el) {
        const kind = el.dataset.kind;
        if (kind === 'boolean') return el.checked;
        if (kind === 'number') return el.value === '' ? undefined : Number(el.value);
        if (kind === 'number-choice') return el.value === '' ? undefined : Number(el.value);
        if (kind === 'enum' || kind === 'ref') return el.value || undefined;
        if (kind === 'enum-set') return [...el.closest('[data-set]').querySelectorAll('input:checked')].map(i => i.value);
        if (kind === 'lines') return el.value.split('\n');
        if (kind === 'json') {
            try { const v = JSON.parse(el.value); el.classList.remove('invalid'); return v; }
            catch (e) { el.classList.add('invalid'); return Symbol.for('invalid'); }
        }
        return el.value;
    }
    const keyOf = el => { const p = JSON.parse(el.dataset.path); return [...p].reverse().find(k => typeof k === 'string'); };
    document.addEventListener('input', e => {
        const el = e.target;
        if (el.id === 'search') { S.search = el.value; renderList(); return; }
        if (el.id === 'menu-code') { S.menuCode = el.value; clearTimeout(S.mt); S.mt = setTimeout(() => { renderSide(); const i = $('#menu-code'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); return; }
        if (el.matches('[data-chip-in]')) { showSuggest(el); return; }
        if (el.dataset.colorFor) { const t = document.getElementById(el.dataset.colorFor); t.value = el.value; t.dispatchEvent(new Event('input', { bubbles: true })); return; }
        if ('fx' in el.dataset || 'fy' in el.dataset) {
            const box = el.closest('[data-focus-for]'), t = document.getElementById(box.dataset.focusFor);
            t.value = `${$('[data-fx]', box).value}% ${$('[data-fy]', box).value}%`;
            t.dispatchEvent(new Event('input', { bubbles: true })); return;
        }
        if (el.dataset.rangeFor) { const t = document.getElementById(el.dataset.rangeFor); t.value = el.value; t.dispatchEvent(new Event('input', { bubbles: true })); return; }
        if (el.tagName === 'TEXTAREA') autosize(el);
        if (!el.dataset.path || !$('#editor').contains(el)) return;
        const v = readValue(el);
        if (v === Symbol.for('invalid')) return;
        const path = JSON.parse(el.dataset.path);
        setAt(curRecord(), path, v);
        if (el.dataset.kind === 'markdown') {
            const prev = document.querySelector(`[data-preview="${CSS.escape(JSON.stringify(path))}"]`);
            if (prev) { clearTimeout(S.pt); S.pt = setTimeout(() => { prev.innerHTML = renderMd(el.value); }, 200); }
        }
        const row = el.closest('.row');
        if (row) {
            const img = $('img[data-thumb]', row);
            if (img && el.dataset.kind === 'text') { img.dataset.thumb = el.value; clearTimeout(S.tt); S.tt = setTimeout(loadThumbs, 400); }
            const ip = $('[data-icon-prev]', row); if (ip) ip.textContent = el.value || 'help';
            const sw = $('input[type=color]', row); if (sw && /^#[0-9a-f]{6}$/i.test(el.value)) sw.value = el.value;
            const rg = $('input[type=range]', row); if (rg && rg !== el) rg.value = el.value;
        }
        const fb = el.closest('[data-focus-for]');
        if (fb && !('fx' in el.dataset) && !('fy' in el.dataset)) {
            const m = /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(el.value);
            if (m) { $('[data-fx]', fb).value = m[1]; $('[data-fy]', fb).value = m[2]; }
        }
        edited(false);
    });
    document.addEventListener('change', e => {
        const el = e.target;
        if (!el.dataset.path || !$('#editor').contains(el)) return;
        // a field other fields depend on (showIf, the map pin): redraw the form
        if (CONTROLLERS.has(keyOf(el))) { edited(true); return; }
        if (el.tagName === 'SELECT' || el.type === 'checkbox') edited(false);
    });
    document.addEventListener('keydown', e => {
        const el = e.target;
        if (el.matches && el.matches('[data-chip-in]')) {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(el, 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(el, -1); }
            else if (e.key === 'Enter' || (e.key === ',' && !el.closest('[data-chips]').dataset.to)) { e.preventDefault(); addChip(el); }
            else if (e.key === 'Escape') { $('.suggest', el.closest('[data-chips]')).hidden = true; e.stopPropagation(); }
            else if (e.key === 'Backspace' && !el.value) {
                const box = el.closest('[data-chips]'), arr = getAt(curRecord(), JSON.parse(box.dataset.path));
                if (Array.isArray(arr) && arr.length) { arr.pop(); S.refocus = box.dataset.path; edited(true); }
            }
            return;
        }
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); quickOpen(); return; }
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(e.key === 'ArrowUp' ? -1 : 1); return; }
        if (e.key === 'Escape') { closeMenu(); if (!$('#modal').hidden) closeModal(); }
    });
    document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('[data-chip-in]')) showSuggest(e.target); });
    document.addEventListener('focusout', e => {
        if (!e.target.matches || !e.target.matches('[data-chip-in]')) return;
        const sug = $('.suggest', e.target.closest('[data-chips]'));
        setTimeout(() => { if (sug && document.activeElement !== e.target) sug.hidden = true; }, 120);
    });
    document.addEventListener('mousedown', e => {
        const sg = e.target.closest('.sg[data-i]');
        if (sg) {
            e.preventDefault();
            const box = sg.closest('[data-chips]'), sug = $('.suggest', box);
            addChip($('.chip-in', box), sug._list[Number(sg.dataset.i)].id);
        }
    });
    // Chips: drag to reorder
    let drag = null;
    document.addEventListener('dragstart', e => {
        const tok = e.target.closest && e.target.closest('.tok');
        if (!tok) return;
        drag = { box: tok.closest('[data-chips]'), i: Number(tok.dataset.i) };
        tok.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragover', e => {
        const tok = e.target.closest && e.target.closest('.tok');
        if (drag && tok && tok.closest('[data-chips]') === drag.box) e.preventDefault();
    });
    document.addEventListener('drop', e => {
        const tok = e.target.closest && e.target.closest('.tok');
        if (!drag || !tok || tok.closest('[data-chips]') !== drag.box) return;
        e.preventDefault();
        const arr = getAt(curRecord(), JSON.parse(drag.box.dataset.path)), j = Number(tok.dataset.i);
        const [v] = arr.splice(drag.i, 1); arr.splice(j, 0, v);
        drag = null; edited(true);
    });
    document.addEventListener('dragend', () => { drag = null; $$('.tok.dragging').forEach(t => t.classList.remove('dragging')); });
    // Records in the list: drag to reorder (dropRecord)
    let recDrag = null;
    const clearDrop = () => $$('#list-items .drop-before, #list-items .drop-after').forEach(li => li.classList.remove('drop-before', 'drop-after'));
    const dropSpot = e => {
        const li = e.target.closest && e.target.closest('#list-items .li[data-select]');
        if (!recDrag || !li || li.dataset.select === recDrag) return null;
        const type = S.view.key, a = S.store.get(recDrag), b = S.store.get(li.dataset.select);
        if (!a || !b || !sameShelf(type, a, b)) return null;
        const r = li.getBoundingClientRect();
        return { li, after: e.clientY > r.top + r.height / 2 };
    };
    document.addEventListener('dragstart', e => {
        const li = e.target.closest && e.target.closest('#list-items .li[draggable="true"]');
        if (!li) return;
        recDrag = li.dataset.select;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', recDrag);
    });
    document.addEventListener('dragover', e => {
        if (!recDrag) return;
        const spot = dropSpot(e);
        clearDrop();
        if (!spot) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        spot.li.classList.add(spot.after ? 'drop-after' : 'drop-before');
    });
    document.addEventListener('drop', e => {
        if (!recDrag) return;
        const spot = dropSpot(e), id = recDrag;
        recDrag = null; clearDrop();
        if (!spot) return;
        e.preventDefault();
        dropRecord(id, spot.li.dataset.select, spot.after);
    });
    document.addEventListener('dragend', () => {
        recDrag = null; clearDrop();
        $$('#list-items .li.dragging').forEach(li => li.classList.remove('dragging'));
    });
    // Tooltips of the icon rail
    document.addEventListener('mouseover', e => { const t = e.target.closest('#nav [data-tip]'); if (t && t.dataset.tip) showTip(t); else $('#tip').hidden = true; });
    document.addEventListener('scroll', () => { $('#tip').hidden = true; }, true);

    document.addEventListener('click', e => {
        if (!e.target.closest('#menu') && !e.target.closest('[data-action="more"]')) closeMenu();
        const t = e.target.closest('[data-nav],[data-select],[data-jump],[data-jump-single],[data-action],[data-sec]');
        if (!t) return;
        if (t.dataset.sec) { e.preventDefault(); const s = document.getElementById(t.dataset.sec); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        if (t.dataset.nav) { const [kind, key] = t.dataset.nav.split(':'); S.search = ''; $('#search').value = ''; select({ kind, key }, null); return; }
        if (t.dataset.select) { select(S.view, t.dataset.select); return; }
        if (t.dataset.jump) { e.preventDefault(); jump(t.dataset.jump); return; }
        if (t.dataset.jumpSingle) { e.preventDefault(); closeModal(); select({ kind: 'single', key: t.dataset.jumpSingle }); return; }
        const a = t.dataset.action;
        const path = t.dataset.path ? JSON.parse(t.dataset.path) : null;
        const rec = curRecord();
        if (t.closest('#menu')) closeMenu();
        switch (a) {
            case 'close-modal': closeModal(); break;
            case 'new': newRecord(); break;
            case 'more': moreMenu(t); break;
            case 'toggle-side': S.sideToggled = !S.sideToggled; $('.ed-wrap').classList.toggle('side-toggled', S.sideToggled); $('#side-btn').classList.toggle('on', S.sideToggled); break;
            case 'card-side': S.cardSide = t.dataset.side; renderSide(); break;
            case 'add-here': {
                // "+ Rumour / + Notice" from a POI or settlement: open the new-record dialog on that type
                // (data-field: the field it fills, e.g. a new card's deck; default where)
                S.search = ''; $('#search').value = '';
                select({ kind: 'type', key: t.dataset.type }, null);
                newRecord(t.dataset.type === 'poi' ? { parent: t.dataset.where } : { [t.dataset.field || 'where']: t.dataset.where });
                break;
            }
            case 'found-add': {
                const where = $('#found-add') && $('#found-add').value;
                if (where && addFoundIn(rec.id, where)) { edited(true); renderSide(); toast('Added — not saved yet'); }
                break;
            }
            case 'collapse': {
                if (e.target.closest('button')) return;
                const k = t.dataset.key;
                S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k);
                const box = t.closest('.sec, .card');
                if (box) box.classList.toggle('collapsed', S.collapsed.has(k)); else renderEditor();
                if (box) autosizeAll();
                break;
            }
            case 'md-preview': S.previews.has(t.dataset.key) ? S.previews.delete(t.dataset.key) : S.previews.add(t.dataset.key); renderEditor(); break;
            case 'list-add': {
                if (isSingle() && S.view.key === 'schedule' && path.join('.') === 'sessions' && ATH.upcoming) { scheduleAdd(); break; }
                const arr = getAt(rec, path);
                const item = t.dataset.object ? {} : '';
                if (Array.isArray(arr)) arr.push(item); else setAt(rec, path, [item]);
                edited(true); break;
            }
            case 'remove': {
                const parentPath = path.slice(0, -1), last = path[path.length - 1];
                const holder = parentPath.length ? getAt(rec, parentPath) : rec;
                if (Array.isArray(holder)) holder.splice(last, 1); else delete holder[last];
                if (t.closest('[data-chips]')) S.refocus = t.closest('[data-chips]').dataset.path;
                edited(true); break;
            }
            case 'move': {
                const arr = getAt(rec, path.slice(0, -1)), i = path[path.length - 1], j = i + Number(t.dataset.dir);
                if (j >= 0 && j < arr.length) { [arr[i], arr[j]] = [arr[j], arr[i]]; edited(true); }
                break;
            }
            case 'obj-add': {
                let fields = curDef().fields, f = null;
                for (const k of path) if (typeof k === 'string') { f = fields[k]; fields = f.fields || {}; }
                setAt(rec, path, emptyFor(f));
                edited(true); break;
            }
            case 'place': placeOnMap(path); break;
            case 'pick-image': pickImage(path); break;
            case 'read-size': readSize(path); break;
            case 'move-record': moveRecord(Number(t.dataset.dir)); break;
            case 'schedule-add': scheduleAdd(); break;
            case 'schedule-sort': scheduleSort(); break;
            case 'schedule-prune': schedulePrune(); break;
            case 'rename': renameRecord(); break;
            case 'delete': deleteRecord(); break;
        }
    });
    // A click on a chips box (outside a chip) focuses its input
    document.addEventListener('click', e => {
        const box = e.target.closest('[data-chips]');
        if (box && !e.target.closest('.tok, .suggest, input')) $('.chip-in', box).focus();
    });
    $('#new-btn').addEventListener('click', () => newRecord());
    $('#save-btn').addEventListener('click', save);
    $('#qo-btn').addEventListener('click', quickOpen);
    $('#issues-pill').addEventListener('click', () => showIssues(false));
    $('#collapse-btn').addEventListener('click', () => { $('#app').classList.toggle('list-collapsed'); rememberUI(); });
    $('#nav-pin').addEventListener('click', () => { S.navOpen = !S.navOpen; $('#tip').hidden = true; renderNav(); rememberUI(); });
    $('#reload-btn').addEventListener('click', async () => {
        if (dirtyFiles().length && !confirm('Reload from disk and lose the unsaved changes?')) return;
        S.thumbs.clear();
        await loadAll(); renderNav(); renderList(); renderEditor(); refreshChrome();
        toast('Reloaded from disk');
    });
    window.addEventListener('resize', () => { const ed = $('#editor'), h = $('.ed-head'); if (h) ed.style.setProperty('--head-h', `${h.offsetHeight}px`); });
    window.addEventListener('beforeunload', e => { if (rootHandle || TEST) { if (dirtyFiles().length) { e.preventDefault(); e.returnValue = ''; } } });

    /* =================================================================
       START
       ================================================================= */
    async function start() {
        try {
            await loadAll();
        } catch (e) {
            gateError(e.message);
            return;
        }
        if (io.list) { try { S.icons = (await io.list('images/atlas_icons') || []).filter(n => n.endsWith('.svg')).map(n => n.slice(0, -4)); } catch (e) { S.icons = null; } }
        if (S.icons && !S.icons.length) S.icons = null;
        $('#gate').hidden = true;
        $('#app').hidden = false;
        $('#folder-name').textContent = io.name();
        await restoreUI();
        renderNav(); renderList(); renderEditor(); refreshChrome();
        const active = $('.li.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }
    function gateError(msg) {
        const el = $('#gate-error');
        el.textContent = msg; el.hidden = false;
    }
    async function useFolder(handle) {
        $('#gate-error').hidden = true;
        rootHandle = handle;
        if (await folderIO.read('data/schema.js') === null) {
            rootHandle = null;
            gateError('That folder has no data/schema.js. Pick the website\'s root folder (the one with index.html).');
            return;
        }
        await kv.set('root', handle);
        start();
    }
    async function boot() {
        if (TEST) { start(); return; }
        if (!window.showDirectoryPicker) {
            gateError('This browser cannot open local folders. Use Chrome, Edge or Brave.');
            $('#link-btn').disabled = true;
            return;
        }
        $('#link-btn').addEventListener('click', async () => {
            try { await useFolder(await window.showDirectoryPicker({ mode: 'readwrite' })); }
            catch (e) { if (e.name !== 'AbortError') gateError(e.message); }
        });
        const saved = await kv.get('root');
        if (saved) {
            const btn = $('#reopen-btn');
            btn.textContent = `Reopen “${saved.name}”`;
            btn.hidden = false;
            btn.addEventListener('click', async () => {
                try {
                    const perm = await saved.requestPermission({ mode: 'readwrite' });
                    if (perm === 'granted') useFolder(saved); else gateError('Permission was not granted.');
                } catch (e) { gateError(e.message); }
            });
            // Permission still held (same browser session, or "Allow on every visit"): no click
            // needed. Otherwise the browser insists on one, on the Reopen button above.
            const perm = await saved.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
            if (perm === 'granted') await useFolder(saved);
        }
    }
    // The gate stays invisible until we know it is needed, so that it doesn't flash on reopening.
    boot().finally(() => { $('#gate').style.visibility = ''; const b = $('#reopen-btn'); if (!b.hidden) b.focus(); });
})();