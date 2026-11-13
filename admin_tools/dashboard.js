/* =====================================================================
   ATHENAEUM DASHBOARD
   ---------------------------------------------------------------------
   Everything on screen is generated from data/schema.js: the workspaces,
   the lists and the forms. Add a type or a field to the schema and it
   shows up here with no change to this file. Where a type sits is its
   `workspace` (Atlas, Cast, Chronicle, Codex, Tables, Site); how a field
   looks is said there too: section, width, help, showIf… (see its header).

   Layout: a rail of workspaces · the list of the workspace (a tree of
   every place for the Atlas, the pools for Tables) · the main area: the
   form of a record, the home page, or a board (the grid of a table, the
   gallery of the map icons) with the open record beside it.

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
        async remove(path) {
            try { await (await dirOf(path, false)).removeEntry(path.split('/').pop()); }
            catch (e) { if (e.name !== 'NotFoundError') throw e; }
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
        async remove(path) { this.writes[path] = null; },
        async url(path) {
            if (typeof this.writes[path] === 'string') return URL.createObjectURL(new Blob([this.writes[path]], { type: path.endsWith('.svg') ? 'image/svg+xml' : 'text/plain' }));
            return '../' + path;
        },
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

    // Comes back on the workspace, tool and record last used, unless they no longer exist.
    function rememberUI() {
        if (TEST) return;
        kv.set('ui', {
            view: S.view, sel: S.sel, page: S.page, listCollapsed: $('#app').classList.contains('list-collapsed'),
            wsLast: S.wsLast, lastSel: S.lastSel, open: [...S.open], camp: S.camp, recent: S.recent,
        });
    }
    async function restoreUI() {
        const ui = TEST ? null : await kv.get('ui');
        if (!ui) return;
        $('#app').classList.toggle('list-collapsed', !!ui.listCollapsed);
        const known = v => v && (v.kind === 'single' ? SINGLES[v.key] : TYPES[v.key]);
        S.wsLast = {};
        for (const [ws, last] of Object.entries(ui.wsLast || {})) if (known(last && last.view)) S.wsLast[ws] = last;
        S.lastSel = ui.lastSel || {};
        S.open = new Set(ui.open || []);
        if (ui.camp) S.camp = ui.camp;
        S.recent = Array.isArray(ui.recent) ? ui.recent : [];
        if (!known(ui.view)) return;
        S.view = { kind: ui.view.kind, key: ui.view.key };
        S.sel = ui.view.kind === 'type' ? (S.data[ui.view.key].some(r => r.id === ui.sel) ? ui.sel : null) : (ui.sel || null);
        S.page = ui.page === 'home' ? 'home' : null;
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
        sel: null,         // the open record (for the map icons: the open icon's id)
        page: 'home',      // 'home', or null when a tool is open
        wsLast: {},        // workspace -> {view, sel} last open there
        lastSel: {},       // "type:key" -> the record last open in that tool
        open: new Set(),   // Atlas tree: the places shown open
        camp: null,        // the campaign the lists show (null: settings.currentCampaign, 'all': every one)
        recent: [],        // [{type, id}] last opened, newest first (home page)
        gridQ: {},         // table -> the grid's filter
        gridSort: {},      // table -> {key, dir}
        assets: {},        // path -> text of a file to write on save (map icon pictures)
        removals: new Set(), // paths of files to delete on save
        scrollTo: null,    // id of a section to bring into view after the next render
        boardShown: null,  // "kind:key" of the board on screen (kept as it is when only the selection changes)
        iconQ: '',         // the map icons' filter
        loadedIcons: new Set(), // map icons whose picture is in the folder (as loaded / saved)
        search: '',
        collapsed: new Set(),
        previews: new Set(),
        icons: null,
        thumbs: new Map(),
        menuCode: null,
        sealed: new Map(), // "type:id:key" -> the {text, password} its encrypted copy was made from
        cardSide: 'front', // item, spell and deity previews: 'front', 'sheet', 'back' or 'sealed'
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
        for (const [p, t] of Object.entries(S.assets)) files[p] = t;
        return files;
    }
    // [path, text] to write, and [path, null] to delete
    const dirtyFiles = () => [
        ...Object.entries(serializeAll()).filter(([p, t]) => S.base[p] !== t),
        ...[...S.removals].filter(p => !(p in S.assets)).map(p => [p, null]),
    ];

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
            for (const [path, text] of files) {
                const icon = path.match(/^images\/atlas_icons\/(.+)\.svg$/);
                if (text === null) { await io.remove(path); S.removals.delete(path); delete S.base[path]; if (icon) S.loadedIcons.delete(icon[1]); continue; }
                await io.write(path, text); S.base[path] = text;
                if (icon) S.loadedIcons.add(icon[1]);
            }
            snapshotRecords();
            await listIcons();
            toast(`Saved ${files.map(([p, t]) => (t === null ? 'deleted ' : '') + p.split('/').pop()).join(', ')}`);
        } catch (e) {
            alertBox('Saving failed', `<p>${esc(e.message)}</p><p>Files written before the error are saved; the rest are not.</p>`);
        }
        renderNav(); renderList(); refreshChrome(); updateHeader(); if (S.page === 'home') renderHome(); else if (isBoard()) syncBoard();
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
    // lowercase, except names that start with an acronym (NPC, POI)
    const lc = s => (/^[A-Z]{2}/.test(String(s || '')) ? String(s) : String(s || '').toLowerCase());

    // Second line of a record in the list
    function subtitle(type, r) {
        const def = TYPES[type];
        const nb = n => (n === 0 ? 'Cantrip' : n != null ? `Level ${n}` : '');
        if (def.place && r.parent) return nameOf(r.parent);
        if (def.place) return r.subtitle || '';
        switch (type) {
            case 'npc': return r.role || r.whereabouts || '';
            case 'folio': return r.recipe && r.recipe.seed ? `Seed ${r.recipe.seed}` : 'No circle yet';
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
        m.setAttribute('role', 'menu');
        // an item: {action, icon, label, dir, data: {k: v}, danger, disabled, on} · {head} · {note} · null (a rule)
        m.innerHTML = items.map(i => !i ? '<hr>' : i.head ? `<div class="menu-h">${esc(i.head)}</div>` : i.note ? `<div class="menu-note">${esc(i.note)}</div>`
            : `<button role="menuitem" data-action="${i.action}" ${i.dir ? `data-dir="${i.dir}"` : ''} ${Object.entries(i.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}
                class="${i.danger ? 'danger' : ''} ${i.on ? 'on' : ''}" ${i.disabled ? 'disabled' : ''}>
            <span class="material-symbols-outlined">${i.icon}</span>${esc(i.label)}</button>`).join('');
        document.body.appendChild(m);
        const r = btn.getBoundingClientRect();
        m.style.top = `${r.bottom + 6}px`;
        m.style.left = `${Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, btn.dataset.menuLeft ? r.left : r.right - m.offsetWidth))}px`;
        const first = $('button:not(:disabled)', m); if (first) first.focus({ preventScroll: true });
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
       WORKSPACES
       ================================================================= */
    // The rail. Each type and one-object file says its workspace in the schema (`workspace`);
    // one that says none (or an unknown one) lands in Tables, under its `group`.
    const WS = [
        { id: 'home', label: 'Home', icon: 'home', color: '#e9c176' },
        { id: 'atlas', label: 'Atlas', icon: 'travel_explore', color: '#6aa9fa', blurb: 'Every place in one tree: continents, countries, settlements, districts, points of interest and the places inside them.' },
        { id: 'cast', label: 'Cast', icon: 'groups', color: '#66c488', blurb: 'NPCs, factions, heroes and the Pantheon.' },
        { id: 'chronicle', label: 'Chronicle', icon: 'history_edu', color: '#f28b82', blurb: 'Campaigns, sessions, rumours and notice boards, filtered by the campaign in the top bar.' },
        { id: 'codex', label: 'Codex', icon: 'menu_book', color: '#b79cf5', blurb: 'Glossary, tomes, handouts, bestiary, spellbook and items.' },
        { id: 'tables', label: 'Tables', icon: 'table_view', color: '#f0a35e', blurb: 'The pools the site draws from, each one a grid: markets, faith, divination, alchemy, folios.' },
        { id: 'site', label: 'Site', icon: 'settings', color: '#b4bac2', bottom: true, blurb: 'World map, settings, upcoming sessions and the map icons.' },
    ];
    const WS_BY = Object.fromEntries(WS.map(w => [w.id, w]));
    const wsOfDef = d => (d && d.workspace && WS_BY[d.workspace] && d.workspace !== 'home' ? d.workspace : 'tables');
    const curWs = () => (S.page === 'home' ? 'home' : wsOfDef(curDef()));
    const ALL_ENTRIES = [
        ...Object.entries(TYPES).map(([key, d]) => ({ kind: 'type', key, d })),
        ...Object.entries(SINGLES).map(([key, d]) => ({ kind: 'single', key, d })),
    ];
    const wsEntries = ws => ALL_ENTRIES.filter(e => wsOfDef(e.d) === ws);
    const entryDirty = e => (e.kind === 'type' ? S.data[e.key].some(r => isDirtyRec(e.key, r)) : isDirtySingle(e.key));
    const entryLabel = e => e.d.navLabel || e.d.plural || e.d.label;
    // Colour of a type: its workspace's, or its group's among the tables
    const GROUP_COLOURS = { Markets: '#f0a35e', Faith: '#f3dc9b', 'Town life': '#4fd1c5', Divination: '#c4a3f7', Alchemy: '#8fd6a8', Generators: '#d4d86a' };
    const SPARE_COLOURS = ['#4fd1c5', '#f48fb1', '#d4d86a'];
    const colourOf = d => {
        const ws = wsOfDef(d);
        if (ws !== 'tables') return WS_BY[ws].color;
        return GROUP_COLOURS[d.group] || SPARE_COLOURS[[...new Set(ALL_ENTRIES.map(e => e.d.group))].indexOf(d.group) % SPARE_COLOURS.length] || WS_BY.tables.color;
    };
    // A table (and the map icons) opens as a board: a grid / gallery, the open record beside it
    const isBoard = () => S.page !== 'home' && ((S.view.kind === 'type' && curWs() === 'tables') || (S.view.kind === 'single' && S.view.key === 'mapIcons'));
    const PLACE_TYPES = Object.keys(TYPES).filter(t => TYPES[t].place);

    /* ---------- the campaign the lists show ---------- */
    const campOf = () => (S.camp && S.camp !== 'all' && S.data.campaign.some(c => c.id === S.camp) ? S.camp : null);
    const curCampaign = () => campOf() || S.store.settings.currentCampaign || '';
    const CAMP_TYPES = new Set(['npc', 'hero', 'faction', 'session', 'handout', 'rumour', 'notice', 'prophecy']);
    function inCampaign(type, r, camp) {
        const c = S.data.campaign.find(x => x.id === camp) || {};
        switch (type) {
            case 'npc': return !(r.campaigns || []).length || r.campaigns.some(x => x && x.campaign === camp);
            case 'session': case 'handout': return !r.campaign || r.campaign === camp;
            case 'rumour': case 'notice': case 'prophecy': return !(r.campaigns || []).length || r.campaigns.includes(camp);
            case 'hero': return !S.data.campaign.some(x => (x.party || []).includes(r.id)) || (c.party || []).includes(r.id);
            case 'faction': {
                const listed = x => (x.standings || []).some(s => s && s.faction === r.id);
                return !S.data.campaign.some(listed) || listed(c);
            }
        }
        return true;
    }
    const campFilter = type => { const camp = campOf(); return camp && CAMP_TYPES.has(type) ? r => inCampaign(type, r, camp) : null; };
    function renderCampBtn() {
        const b = $('#camp-btn'), camp = campOf();
        b.className = 'camp-btn' + (camp ? '' : ' all');
        b.innerHTML = `<span class="material-symbols-outlined">auto_stories</span><span class="t">${esc(camp ? nameOf(camp) : 'All campaigns')}</span><span class="material-symbols-outlined">expand_more</span>`;
    }
    function campMenu(btn) {
        const camp = campOf() || 'all';
        openMenu(btn, [
            { head: 'Lists show' },
            ...S.data.campaign.map(c => ({ action: 'camp', data: { camp: c.id }, icon: c.id === camp ? 'radio_button_checked' : 'radio_button_unchecked', label: c.name || c.id, on: c.id === camp })),
            { action: 'camp', data: { camp: 'all' }, icon: camp === 'all' ? 'radio_button_checked' : 'radio_button_unchecked', label: 'All campaigns', on: camp === 'all' },
            { note: 'Filters NPCs, heroes, factions, sessions, handouts, rumours and notices. New sessions, rumours and notices go in this campaign. The site’s default is in Site › Settings.' },
        ]);
    }

    /* ---------- rail and breadcrumbs ---------- */
    function renderNav() {
        const ws = curWs();
        const btn = w => {
            const dirty = w.id !== 'home' && wsEntries(w.id).some(entryDirty);
            return `<button class="rb ${ws === w.id ? 'active' : ''}" style="--c:${w.color}" data-ws="${w.id}" ${ws === w.id ? 'aria-current="page"' : ''} title="${esc(w.blurb || w.label)}">
                <span class="material-symbols-outlined">${w.icon}</span>${esc(w.label)}${dirty ? '<span class="dot" title="Unsaved changes"></span>' : ''}</button>`;
        };
        $('#nav-items').innerHTML = WS.filter(w => !w.bottom).map(btn).join('');
        $('#nav-bottom').innerHTML = WS.filter(w => w.bottom).map(btn).join('');
        renderCrumbs();
    }
    function renderCrumbs() {
        const ws = curWs(), w = WS_BY[ws];
        const sep = '<span class="material-symbols-outlined sep">chevron_right</span>';
        if (ws === 'home') { $('#crumbs').innerHTML = `<span class="cur ws" style="--c:${w.color}">Home</span>`; return; }
        const parts = [`<a href="#" class="ws" style="--c:${w.color}" data-ws="${ws}">${esc(w.label)}</a>`];
        const def = curDef();
        if (ws === 'tables' && def.group) parts.push(`<span class="cur" style="font-weight:500;color:var(--ink-faint)">${esc(def.group)}</span>`);
        const rec = isSingle() ? null : curRecord();
        if (S.view.kind === 'single' && S.view.key === 'mapIcons' && S.sel) {
            const ic = iconList().find(i => i.id === S.sel);
            parts.push(`<a href="#" data-nav="single:mapIcons">${esc(def.label)}</a>`, `<span class="cur">${esc(ic ? ic.label || ic.id : S.sel)}</span>`);
        } else if (!rec) { if (ws !== 'atlas') parts.push(`<span class="cur">${esc(entryLabel({ d: def }))}</span>`); }
        else {
            if (ws !== 'atlas') parts.push(`<a href="#" data-nav="type:${S.view.key}">${esc(entryLabel({ d: def }))}</a>`);
            else {
                // the places above it: the nearest three, the rest behind “…”
                const up = S.store.ancestors(rec.id);
                if (up.length > 3) parts.push(`<span class="more" title="${esc(up.slice(0, -3).map(x => x.name).join(' › '))}">…</span>`);
                up.slice(-3).forEach(a => parts.push(`<a href="#" data-jump="${esc(a.id)}">${esc(a.name)}</a>`));
            }
            parts.push(`<span class="cur">${esc(rec.name || '(no name)')}</span>`);
        }
        $('#crumbs').innerHTML = parts.join(sep);
    }

    /* ---------- going places ---------- */
    function goWs(ws) {
        S.search = ''; $('#search').value = '';
        if (ws === 'home') { S.page = 'home'; renderAll(); rememberUI(); return; }
        const entries = wsEntries(ws);
        if (!entries.length) return;
        const last = S.wsLast[ws];
        const has = v => v && entries.some(e => e.kind === v.kind && e.key === v.key);
        if (has(last && last.view)) { select(last.view, last.sel); return; }
        const e = entries[0];
        select({ kind: e.kind, key: e.key }, S.lastSel[`${e.kind}:${e.key}`] ?? null);
    }
    // A tool of the current workspace (a sub-tab, a table): back on its last record, except the boards
    function openTool(kind, key) {
        S.search = ''; $('#search').value = '';
        const view = { kind, key };
        const board = (kind === 'type' && wsOfDef(TYPES[key]) === 'tables') || (kind === 'single' && key === 'mapIcons');
        const last = S.lastSel[`${kind}:${key}`];
        select(view, !board && kind === 'type' && last && S.data[key].some(r => r.id === last) ? last : null);
    }

    /* ---------- the list column ---------- */
    function listHead({ title, count = '', newLabel = '', newTitle = '', more = false, tabs = null, search = true, placeholder = 'Filter this list…' }) {
        $('#list-title').innerHTML = `${esc(title)} <span>${esc(count)}</span>`;
        const nb = $('#new-btn');
        $('#new-wrap').hidden = !newLabel;
        $('#new-wrap').classList.toggle('split', !!more);
        nb.textContent = newLabel; nb.title = newTitle || newLabel.replace(/^\+\s*/, 'New ');
        $('#new-more').hidden = !more;
        const st = $('#subtabs');
        st.hidden = !tabs;
        if (tabs) { st.style.setProperty('--c', WS_BY[curWs()].color); st.innerHTML = tabs; }
        $('#search-wrap').hidden = !search;
        $('#search').placeholder = placeholder;
    }
    function listFoot(html) { const f = $('#list-foot'); f.hidden = !html; f.innerHTML = html || ''; }
    function renderList() {
        const ws = curWs();
        $('#app').classList.toggle('no-list', ws === 'home');
        $('#app').classList.toggle('tables-mode', ws === 'tables');
        if (ws === 'home') return;
        listFoot('');
        if (ws === 'atlas') renderTree();
        else if (ws === 'tables' || ws === 'site') renderToolList(ws);
        else renderRecordList(ws);
    }
    // Tables and Site: the tools themselves (Tables by group)
    function renderToolList(ws) {
        const entries = wsEntries(ws);
        listHead({ title: WS_BY[ws].label, count: entries.length, search: false });
        const groups = ws === 'tables' ? [...new Set(entries.map(e => e.d.group || 'Other'))] : [''];
        const item = e => {
            const on = S.view.kind === e.kind && S.view.key === e.key;
            const n = e.kind === 'type' ? S.data[e.key].length : e.key === 'mapIcons' ? iconList().length : '';
            return `<button class="li tbl-i ${on ? 'active' : ''}" style="--c:${colourOf(e.d)}" data-nav="${e.kind}:${e.key}">
                <span class="material-symbols-outlined">${esc(e.d.icon || 'description')}</span><span class="t">${esc(entryLabel(e))}</span>
                ${entryDirty(e) ? '<span class="dot" title="Unsaved changes"></span>' : ''}<span class="n">${n}</span></button>`;
        };
        $('#list-items').innerHTML = groups.map(g => `${g ? `<div class="lg"><span>${esc(g)}</span></div>` : ''}
            ${entries.filter(e => !g || (e.d.group || 'Other') === g).map(item).join('')}`).join('');
    }
    // Cast, Chronicle, Codex: one tab per type above its records
    function renderRecordList(ws) {
        if (isSingle()) { renderToolList(ws); return; }
        const type = S.view.key, def = TYPES[type];
        const tabs = wsEntries(ws).filter(e => e.kind === 'type').map(e => {
            const f = campFilter(e.key);
            const n = f ? S.data[e.key].filter(f).length : S.data[e.key].length;
            return `<button class="st ${e.key === type ? 'on' : ''}" role="tab" aria-selected="${e.key === type}" data-tab="${e.key}">${esc(entryLabel(e))} <small>${n}</small>${entryDirty(e) ? '<span class="dot" title="Unsaved changes"></span>' : ''}</button>`;
        }).join('');
        const q = S.search.trim().toLowerCase();
        const inCamp = campFilter(type);
        const match = r => !q || [r.id, r.name, ...(r.aliases || []), subtitle(type, r)].some(v => String(v || '').toLowerCase().includes(q));
        const groups = orderedRecords(type).map(g => ({ ...g, recs: g.recs.filter(r => match(r) && (!inCamp || inCamp(r))) })).filter(g => g.recs.length);
        const total = inCamp ? S.data[type].filter(inCamp).length : S.data[type].length;
        const shown = groups.reduce((n, g) => n + g.recs.length, 0);
        listHead({ title: def.plural || def.label, count: q ? `${shown} / ${total}` : total, newLabel: '+ New', newTitle: `New ${lc(def.label)}`, tabs, placeholder: `Filter ${lc(def.plural || def.label)}…` });
        const item = r => {
            const bad = recordErrors(type, r.id).length;
            return `<button class="li ${r.id === S.sel ? 'active' : ''}" data-select="${esc(r.id)}" ${def.order ? '' : 'draggable="true" title="Drag to change the order on the site"'}>
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
        const hidden = inCamp ? S.data[type].length - total : 0;
        listFoot(hidden ? `${hidden} more in other campaigns · <button data-action="camp" data-camp="all">Show every campaign</button>` : '');
    }

    /* ---------- the Atlas: every place in one tree ---------- */
    const TREE_CHILD = { continent: 'country', country: 'settlement', settlement: 'district', district: 'poi' };
    const placeLabel = t => (t === 'poi' ? 'POI' : TYPES[t].label);
    function placeTree() {
        const ids = new Set(PLACE_TYPES.flatMap(t => S.data[t].map(r => r.id)));
        const kids = new Map(), roots = [], loose = [];
        for (const t of PLACE_TYPES) for (const r of S.data[t]) {
            if (!TYPES[t].parent.length) roots.push(r);
            else if (r.parent && ids.has(r.parent) && r.parent !== r.id) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); }
            else loose.push(r);
        }
        return { kids, roots, loose };
    }
    // The roles of a POI (its optional blocks: tavern, shop…), as icons
    const roleIcons = (type, r) => Object.entries(TYPES[type].fields)
        .filter(([k, f]) => f.kind === 'object' && f.optional && f.section !== 'Look' && r[k])
        .map(([, f]) => `<span class="material-symbols-outlined" title="${esc(f.label)}">${esc(SECTION_ICONS[f.section] || 'label')}</span>`).join('');
    // What "+ New" adds in the Atlas: a child of the open place (or a POI beside a POI)
    function atlasAdd() {
        const rec = !isSingle() && TYPES[S.view.key].place ? curRecord() : null;
        if (!rec) return { type: 'continent', parent: '', label: '+ Continent' };
        const t = S.view.key;
        if (t === 'poi') return rec.institution ? { type: 'poi', parent: rec.id, label: '+ Place inside', title: `New place inside ${rec.name}` } : { type: 'poi', parent: rec.parent || '', label: '+ POI beside', title: `New POI in ${nameOf(rec.parent)}` };
        const c = TREE_CHILD[t];
        return { type: c, parent: rec.id, label: `+ ${placeLabel(c)} here`, title: `New ${lc(TYPES[c].label)} in ${rec.name}` };
    }
    function atlasAddMenu(btn) {
        const rec = !isSingle() && TYPES[S.view.key].place ? curRecord() : null;
        const chain = rec ? [rec, ...S.store.ancestors(rec.id).reverse()] : [];
        openMenu(btn, [{ head: 'New place' }, ...PLACE_TYPES.map(t => {
            const host = chain.find(p => TYPES[t].parent.includes(typeOfId(p.id)) && (t !== 'poi' || typeOfId(p.id) !== 'poi' || p.institution));
            return { action: 'new-place', data: { type: t, parent: host ? host.id : '' }, icon: TYPES[t].icon, label: `${TYPES[t].label}${host ? ` in ${host.name}` : ''}` };
        })]);
    }
    function renderTree() {
        const { kids, roots, loose } = placeTree();
        const q = S.search.trim().toLowerCase();
        const total = PLACE_TYPES.reduce((n, t) => n + S.data[t].length, 0);
        const add = atlasAdd();
        const hit = r => !q || [r.id, r.name, ...(r.aliases || []), r.subtitle].some(v => String(v || '').toLowerCase().includes(q));
        // with a filter: the matches and the places above them, all open
        const keep = new Map();
        const scan = (r, seen) => {
            if (seen.has(r.id)) return false;
            seen.add(r.id);
            let k = hit(r);
            for (const c of kids.get(r.id) || []) if (scan(c, seen)) k = true;
            keep.set(r.id, k);
            return k;
        };
        const seen0 = new Set();
        [...roots, ...loose].forEach(r => scan(r, seen0));
        const shown = q ? [...keep.entries()].filter(([id, k]) => k && hit(S.store.get(id) || {})).length : total;
        listHead({ title: 'Atlas', count: q ? `${shown} / ${total}` : `${total} places`, newLabel: add.label, newTitle: add.title || `New ${lc(TYPES[add.type].label)}`, more: true, placeholder: 'Filter places…' });
        let html = '';
        const seen = new Set();
        const row = (r, depth) => {
            if (seen.has(r.id) || (q && !keep.get(r.id))) return;
            seen.add(r.id);
            const type = typeOfId(r.id), def = TYPES[type];
            const ch = (kids.get(r.id) || []).filter(c => !q || keep.get(c.id));
            const open = q ? true : S.open.has(r.id);
            const bad = recordErrors(type, r.id).length;
            html += `<div class="li tn ${r.id === S.sel ? 'active' : ''} ${ch.length && !open ? 'closed' : ''} ${q && hit(r) ? 'match' : ''}" style="--depth:${depth}" data-depth="${Math.min(depth, 2)}"
                    data-select="${esc(r.id)}" tabindex="0" role="treeitem" ${ch.length ? `aria-expanded="${open}"` : ''} ${q ? '' : 'draggable="true"'} title="${esc(def.label)}${r.subtitle ? ' · ' + esc(r.subtitle) : ''}">
                <button class="car ${ch.length ? '' : 'none'}" data-action="tree-toggle" data-id="${esc(r.id)}" tabindex="-1" aria-label="${open ? 'Close' : 'Open'}"><span class="material-symbols-outlined">expand_more</span></button>
                <span class="ti material-symbols-outlined" style="--tc:#6aa9fa">${esc(def.icon)}</span>
                <span class="t">${esc(r.name || '(no name)')}</span>
                ${type === 'poi' ? `<span class="roles">${roleIcons(type, r)}</span>` : ''}
                ${isDirtyRec(type, r) ? '<span class="dot" title="Unsaved changes"></span>' : ''}
                ${bad ? `<span class="bad" title="${bad} problem${bad === 1 ? '' : 's'}">${bad}</span>` : ''}
                ${ch.length && !open ? `<span class="n">${ch.length}</span>` : ''}
            </div>`;
            if (open) ch.forEach(c => row(c, depth + 1));
        };
        roots.forEach(r => row(r, 0));
        if (loose.some(r => !q || keep.get(r.id))) {
            html += `<div class="lg"><span>Not placed anywhere</span></div>`;
            loose.forEach(r => row(r, 0));
        }
        $('#list-items').innerHTML = html || `<p class="empty">${q ? 'No match.' : 'No place yet: click <b>+ Continent</b>.'}</p>`;
        $('#list-items').setAttribute('role', 'tree');
    }
    function toggleTree(id, open) {
        if (open === undefined) open = !S.open.has(id);
        if (open) S.open.add(id); else S.open.delete(id);
        renderTree(); rememberUI();
        const el = $(`#list-items [data-select="${CSS.escape(id)}"]`); if (el) el.focus();
    }

    /* ---------- chrome ---------- */
    function refreshChrome() {
        const dirty = dirtyFiles();
        const pill = $('#save-pill');
        pill.textContent = dirty.length ? `${dirty.length} file${dirty.length === 1 ? '' : 's'} unsaved` : 'All saved';
        pill.className = 'pill ' + (dirty.length ? 'dirty' : 'ok');
        pill.title = dirty.map(([p, t]) => (t === null ? 'delete ' : '') + p).join('\n');
        const n = S.issues.errors.length, w = S.issues.warnings.length;
        const ip = $('#issues-pill');
        ip.hidden = !n && !w;
        ip.className = 'pill ' + (n ? 'bad' : 'warn');
        ip.textContent = n ? `${n} problem${n === 1 ? '' : 's'}${w ? ` · ${w} warning${w === 1 ? '' : 's'}` : ''}` : `${w} warning${w === 1 ? '' : 's'}`;
        ip.title = 'Show them';
        renderCampBtn();
    }
    let refreshTimer = null;
    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { rebuild(); renderNav(); renderList(); renderSide(); refreshChrome(); updateHeader(); if (isBoard()) syncBoard(); }, 250);
    }
    // Everything, after a change of workspace or tool
    function renderAll() {
        renderNav(); renderList(); renderMain(); refreshChrome();
    }
    function renderMain() {
        const home = S.page === 'home', board = !home && isBoard();
        const app = $('#app');
        app.classList.toggle('board-mode', board);
        app.classList.toggle('no-sel', board && !S.sel);
        $('#home').hidden = !home;
        $('#board').hidden = !board;
        $('#editor').hidden = home;
        if (home) { renderHome(); rememberUI(); return; }
        if (board) renderBoard();
        renderEditor();
    }

    /* =================================================================
       FORM FIELDS
       ================================================================= */
    const SECTION_ICONS = {
        Essentials: 'badge', Details: 'tune', Lore: 'auto_stories', Map: 'map', 'On the page': 'web', Institution: 'account_balance', Tavern: 'sports_bar', Shop: 'storefront', Temple: 'brightness_7', Alchemist: 'science',
        Identity: 'person', 'Where & ties': 'pin_drop', Campaigns: 'flag', Biography: 'history_edu', 'DM only': 'lock', Dossier: 'folder_open', Relations: 'handshake',
        Intelligence: 'visibility', 'Field evidence': 'folder_supervised', Look: 'palette', Text: 'subject', 'Picture & file': 'image', Stats: 'monitoring', 'Field notes': 'edit_note',
        Card: 'style', Description: 'subject', Story: 'auto_stories', Quests: 'flag', Party: 'groups', Allegiances: 'handshake', Spellbooks: 'webhook', Overview: 'summarize',
        Transcript: 'history_edu', 'People & places': 'diversity_3', 'Loot & leads': 'explore', Backstory: 'menu_book', Statistics: 'monitoring', Secret: 'key', Artifact: 'diamond',
        Rumour: 'record_voice_over', Notice: 'push_pin', 'Homepage cards': 'event_upcoming', Settings: 'tune',
        Divination: 'visibility', Meanings: 'menu_book', Prophecy: 'auto_awesome', 'The reading': 'style',
        Circle: 'radio_button_checked', 'Left page': 'article', 'Right page': 'image', Book: 'menu_book',
        Reagent: 'science', Senses: 'air', Potion: 'science', Bottle: 'palette', Properties: 'label', Forms: 'category', Oddities: 'auto_awesome',
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
    // The picture of a map pin: a button showing it, which opens the icon picker
    function iconInput(value, p) {
        const bad = value && !iconIds().includes(value);
        return `<button type="button" class="icon-pick ${bad ? 'bad' : ''}" data-action="icon-pick" data-path="${p}" aria-label="Pin icon: ${esc(value ? iconName(value) : 'none')}. Change it">
            <span class="pinp sm ${value ? '' : 'missing'}"><img data-thumb="${value ? esc(iconSrc(value)) : ''}" alt=""></span>
            <span class="t ${value ? '' : 'none'}">${value ? esc(iconName(value)) + (bad ? ' — no such icon' : '') : 'Choose an icon…'}</span>
            <span class="material-symbols-outlined">expand_more</span></button>`;
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

    // Sections that hold one optional block (a POI's Tavern, Shop… or its Look): shown only once added
    const optionalBlock = sec => (sec.fields.length === 1 && sec.fields[0][1].kind === 'object' && sec.fields[0][1].optional ? sec.fields[0] : null);
    function renderEditor() {
        rememberUI(); // every change of tool or record ends up here
        closeMenu();
        const ed = $('#editor');
        const def = curDef();
        if (S.view.kind === 'single' && S.view.key === 'mapIcons') { renderIconDetail(); return; }
        const rec = curRecord();
        if (!rec) {
            const atlas = curWs() === 'atlas';
            ed.innerHTML = isBoard() ? '' : `<div class="empty big"><span class="material-symbols-outlined">${esc(atlas ? 'travel_explore' : def.icon || 'description')}</span>
                <p>${atlas ? 'Pick a place in the tree, or add one.' : `Pick ${esc(lc(def.label || ''))} in the list, or create one.`}</p>
                <button class="btn primary" data-action="new">${atlas ? esc(atlasAdd().label) : `+ New ${esc(lc(def.label || ''))}`}</button>
                <p class="muted small">Ctrl K: find any record · Alt ↑ ↓: previous / next</p></div>`;
            return;
        }
        const allSecs = sectionsOf(def);
        // absent optional blocks: no card, offered in the "+ Add" menu of the section index
        const secs = allSecs.filter(sec => { const o = optionalBlock(sec); return !o || rec[o[0]] != null; });
        const addable = allSecs.filter(sec => { const o = optionalBlock(sec); return o && rec[o[0]] == null; });
        const base = isSingle() ? '' : [
            fieldHtml({ kind: 'text', label: 'Name', required: true }, 'name', rec.name, ['name'], rec),
            def.place && def.parent.length ? fieldHtml({ kind: 'ref', to: def.parent, label: 'Sits in', required: true }, 'parent', rec.parent, ['parent'], rec) : '',
            fieldHtml({ kind: 'list', label: 'Other names', help: 'Aliases: they become links too.', width: 'full' }, 'aliases', rec.aliases, ['aliases'], rec),
        ].join('');
        const cards = secs.map(sec => {
            const k = `sec:${S.view.key}:${sec.title}`, collapsed = S.collapsed.has(k);
            // A card holding a single object (Tavern, Shop, Temple, Statistics): its fields straight on the card
            const only = sec.fields.length === 1 && sec.fields[0][1].kind === 'object' ? sec.fields[0] : null;
            let body, extra = '';
            if (only) {
                const [key, f] = only, v = rec[key];
                if (f.optional) extra = `<button class="btn sm danger" data-action="remove-block" data-key="${esc(key)}">Remove ${esc((f.label || key).toLowerCase())}</button>`;
                body = `${helpHtml(f)}<div class="grid">${fieldsGrid(f.fields, v || {}, [key])}</div>`;
            } else {
                const inner = (sec.first ? base : '') + fieldsGrid(Object.fromEntries(sec.fields), rec, []);
                if (!inner.trim()) return '';
                body = `<div class="grid">${inner}</div>`;
            }
            return `<section class="sec ${collapsed ? 'collapsed' : ''}" id="${secId(sec.title)}">
                <header class="sec-head" data-action="collapse" data-key="${esc(k)}">
                    <span class="material-symbols-outlined">${esc(SECTION_ICONS[sec.title] || 'segment')}</span>
                    <h3>${esc(sec.title)}</h3>${extra}<span class="material-symbols-outlined chev">expand_more</span>
                </header>
                <div class="sec-body">${body}</div>
            </section>`;
        }).filter(Boolean);
        const roles = addable.filter(s => s.title !== 'Look');
        const addBtn = addable.length ? `<button class="sec-add" data-action="sec-add" data-menu-left="1" aria-haspopup="menu" title="${esc(addable.map(s => s.title).join(', '))}">
                <span class="material-symbols-outlined">add</span>${roles.length && S.view.key === 'poi' ? 'Role' : 'Add'}</button>` : '';
        const index = secs.length > 1 || addBtn ? `<nav class="sec-index">${secs.map(s =>
            `<a href="#${secId(s.title)}" data-sec="${secId(s.title)}" class="${optionalBlock(s) ? 'role' : ''}">${esc(s.title)}</a>`).join('')}${addBtn}</nav>` : '';
        const url = !isSingle() && S.store.url(rec.id);
        const board = isBoard();
        ed.innerHTML = `
            <div class="ed-head">
                <div class="ed-top">
                    <div class="ed-title">
                        <div class="kind" style="--c:${colourOf(def)}"><span class="material-symbols-outlined">${esc(def.icon || 'description')}</span>${esc(def.label)}<span class="dot" id="ed-dirty" hidden title="Unsaved changes"></span></div>
                        <h2 id="ed-title">${esc(isSingle() ? def.label : rec.name || '(no name)')}</h2>
                        <code>${isSingle() ? esc(def.file) : `${esc(rec.id)} · ${esc(def.file)}`}</code>
                    </div>
                    <div class="ed-actions">
                        ${url ? `<a class="btn ${board ? 'icon' : ''}" href="../${esc(url)}" target="_blank" rel="noopener" title="View on site"><span class="material-symbols-outlined">open_in_new</span>${board ? '' : 'View on site'}</a>` : ''}
                        <button class="btn icon ${S.sideToggled ? 'on' : ''}" data-action="toggle-side" title="Previews and links" aria-label="Previews and links" id="side-btn"><span class="material-symbols-outlined">right_panel_open</span></button>
                        ${isSingle() ? '' : `<button class="btn icon" data-action="more" title="Rename id, move, delete…" aria-label="More actions"><span class="material-symbols-outlined">more_horiz</span></button>`}
                        ${board ? `<button class="btn icon" data-action="close-sel" title="Close (Esc)" aria-label="Close the form"><span class="material-symbols-outlined">close</span></button>` : ''}
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
        if (S.scrollTo) {
            const el = document.getElementById(S.scrollTo);
            S.scrollTo = null;
            if (el) { el.scrollIntoView({ block: 'start' }); const f = $('input, select, textarea', el); if (f) f.focus({ preventScroll: true }); }
        }
    }
    // "+ Role / + Add" of the section index: the optional blocks this record doesn't have yet
    function secAddMenu(btn) {
        const rec = curRecord(), def = curDef();
        const add = sectionsOf(def).map(optionalBlock).filter(o => o && rec[o[0]] == null);
        const roles = add.filter(([, f]) => f.section !== 'Look'), page = add.filter(([, f]) => f.section === 'Look');
        const item = ([key, f]) => ({ action: 'obj-add-block', data: { key }, icon: SECTION_ICONS[f.section] || 'add', label: f.label || key });
        openMenu(btn, [
            ...(roles.length ? [{ head: S.view.key === 'poi' ? 'What else this place is' : 'Add' }, ...roles.map(item)] : []),
            ...(page.length ? [...(roles.length ? [null] : []), { head: 'This page' }, ...page.map(item)] : []),
            ...(S.view.key === 'poi' && roles.length ? [{ note: 'A role adds its section here and its tab on the POI page.' }] : []),
        ]);
    }
    function removeBlock(key) {
        const f = curDef().fields[key], rec = curRecord();
        modal(`<h3>Remove ${esc((f.label || key).toLowerCase())}?</h3><p>Everything set in it on “${esc(rec.name || '')}” goes too. Nothing is written until you save (Reload drops the change).</p>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" id="rb-ok">Remove</button></div>`);
        $('#rb-ok').addEventListener('click', () => { delete rec[key]; closeModal(); edited(true); });
    }
    function updateHeader() {
        const t = $('#ed-title'), rec = curRecord();
        if (!t || !rec) return;
        if (S.view.kind === 'single' && S.view.key === 'mapIcons') { const ic = iconList().find(i => i.id === S.sel); if (ic) t.textContent = ic.label || ic.id; }
        else if (!isSingle()) t.textContent = rec.name || '(no name)';
        const d = $('#ed-dirty');
        if (d) d.hidden = isSingle() ? !isDirtySingle(S.view.key) : !isDirtyRec(S.view.key, rec);
    }
    // The section index follows the scroll: the last section whose top has passed under the header
    let secObserver = null;
    function watchSections() {
        if (secObserver) secObserver.disconnect();
        const ed = $('#editor');
        const links = $$('.sec-index a');
        if (!links.length) { ed.onscroll = null; return; }
        const update = () => {
            const head = $('.ed-head', ed);
            const limit = (head ? head.getBoundingClientRect().bottom : 0) + 48;
            const secs = $$('.sec', ed);
            let cur = secs[0];
            for (const sec of secs) if (sec.getBoundingClientRect().top <= limit) cur = sec;
            if (ed.scrollTop > 0 && ed.scrollTop + ed.clientHeight >= ed.scrollHeight - 4) cur = secs[secs.length - 1];
            links.forEach(a => a.classList.toggle('on', !!cur && a.dataset.sec === cur.id));
        };
        ed.onscroll = update;
        update();
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
        if (isSingle() && S.view.key === 'alchemy') parts.push(alchemyPanel());
        if (!isSingle()) {
            const crumbs = S.store.ancestors(rec.id);
            if (crumbs.length) parts.push(`<div class="box"><h4>Sits in</h4>${chips(crumbs)}</div>`);
            const kids = S.store.children(rec.id);
            if (kids.length) parts.push(`<div class="box"><h4>Contains <span>${kids.length}</span></h4>${chips(kids)}</div>`);
            const users = S.store.backrefs(rec.id);
            // (a spell's campaigns are shown in "Known by", with the hero)
            if (users.length && S.view.key !== 'spell') parts.push(`<div class="box"><h4>Used by <span>${users.length}</span></h4>${chips(users.map(r => S.store.get(r.id)).filter(Boolean))}</div>`);
            if (S.view.key === 'poi' && ATH.market) parts.push(...marketPreview(rec));
            if (S.view.key === 'settlement' && ATH.market) parts.push(...townPreview(rec));
            if (S.view.key === 'rumour' && ATH.market) parts.unshift(rumourPlaces(rec));
            if (S.view.key === 'notice' && ATH.noticeBoard) parts.unshift(noticePreview(rec));
            if (S.view.key === 'item' && ATH.lootCard) parts.unshift(cardPreview(rec), potionPanel(rec), foundIn(rec));
            if (['solvent', 'principle', 'catalyst', 'vessel'].includes(S.view.key)) parts.unshift(reagentPanel(rec, S.view.key));
            if (S.view.key === 'spell' && ATH.spellCard) parts.unshift(spellPreview(rec), knownBy(rec));
            if (S.view.key === 'deity' && ATH.deityCard) parts.unshift(deityPreview(rec), sealStatus(rec));
            if (S.view.key === 'item' && ATH.deityCard) parts.unshift(artifactOf(rec));
            if (ATH.fortuneCard && ATH.divination) parts.unshift(...divinationPreview(rec));
            if ((S.view.key === 'poi' || S.view.key === 'creature') && ATH.look && lookOf(rec).look) parts.unshift(lookPreview(rec));
            if (S.view.key === 'creature' && rec.image) parts.unshift(beastFramePreview(rec));
            if (S.view.key === 'folio' && ATH.sigil) parts.unshift(folioPreview(rec));
        }
        const html = parts.filter(Boolean).join('');
        side.innerHTML = html ? `<div class="side-head"><span>Previews & links</span><button class="btn icon" data-action="toggle-side" title="Close"><span class="material-symbols-outlined">close</span></button></div>${html}` : '';
        $('.ed-wrap').classList.toggle('no-side', !html);
        const sb = $('#side-btn'); if (sb) sb.hidden = !html;
        if (['item', 'deity', 'creature', 'fortuneCard', 'deck', 'prophecy', 'spread', 'omen'].includes(S.view.key)) loadThumbs();
        if (S.view.key === 'spell') loadSymbols();
        if (S.view.key === 'poi' || S.view.key === 'creature') applyLookPreview(rec);
        if (S.view.key === 'folio' && ATH.sigil) drawFolioPreview(rec);
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

    /* ---------- folios (Sigil Maker, DM only): the book with the DM's own words ----------
       Drawn by scripts/sigil-engine.js, the Sigil Maker's own engine: what the preview
       shows is what the PDF and PNG get. The circle is the record's `recipe` (a file
       saved with “Save recipe” in the Sigil Maker); its uploaded alphabets travel inside it. */
    const folioCache = { key: '', url: '', busy: false, again: false };
    function folioState(rec) {
        const SG = ATH.sigil;
        if (!rec.recipe || !SG.validState(rec.recipe)) return null;
        return SG.normalise(JSON.parse(JSON.stringify(rec.recipe)));
    }
    async function folioFonts(rec) {
        const fonts = rec.recipe && Array.isArray(rec.recipe.fonts) ? rec.recipe.fonts : [];
        for (const f of fonts) if (!ATH.sigil.USER_FONTS.find(x => x.id === f.id)) { try { await ATH.sigil.registerFont(f); } catch (e) { /* not a font */ } }
    }
    function folioPreview(rec) {
        const ok = !!folioState(rec);
        const btn = (what, icon, label) => `<button class="btn" data-action="folio-export" data-what="${what}"${ok ? '' : ' disabled'}><span class="material-symbols-outlined">${icon}</span>${label}</button>`;
        return `<div class="box"><div class="box-head"><h4>The folio</h4>${ok ? '<button class="btn sm" data-action="folio-big">Open large</button>' : ''}</div>
            ${ok ? `<div class="folio-prev" id="folio-prev">${folioCache.url ? `<img src="${folioCache.url}" alt="The folio">` : '<p class="muted">Drawing the book…</p>'}</div>`
                : `<p class="muted">No circle yet. Make one in the Sigil Maker (<code>sigil-maker.html</code>), click <b>Save recipe</b>, then import that file here.</p>`}
            <div class="row wrap"><button class="btn${ok ? '' : ' primary'}" data-action="folio-import"><span class="material-symbols-outlined">upload_file</span>${ok ? 'Replace the circle…' : 'Import a recipe…'}</button></div>
            <p class="hint">Text fields left empty keep the generated text; a single “-” leaves that part blank.</p></div>
            <div class="box"><h4>Export</h4>
            <div class="row wrap">${btn('pdf-spread', 'picture_as_pdf', 'PDF · A3 spread')}${btn('pdf-pages', 'picture_as_pdf', 'PDF · two A4 pages')}</div>
            <div class="row wrap">${btn('png-book', 'image', 'Book PNG')}${btn('png-plate', 'radio_button_checked', 'Circle PNG')}${btn('recipe', 'download', 'Recipe')}</div>
            <p class="hint">DM only: <code>data/folios.json</code> is git-ignored and the site never reads it. The PDF library loads from the web.</p></div>`;
    }
    async function drawFolioPreview(rec) {
        const st = folioState(rec);
        if (!st) return;
        const key = JSON.stringify(rec);
        if (key === folioCache.key && folioCache.url) return;
        if (folioCache.busy) { folioCache.again = true; return; }
        folioCache.busy = true;
        try {
            await folioFonts(rec);
            const cv = await ATH.sigil.renderBook(st, 0.42, { which: 'spread', text: rec });
            folioCache.key = key; folioCache.url = cv.toDataURL('image/jpeg', 0.85);
            const box = document.getElementById('folio-prev');
            if (box) box.innerHTML = `<img src="${folioCache.url}" alt="The folio">`;
        } catch (e) { console.error(e); }
        folioCache.busy = false;
        if (folioCache.again) { folioCache.again = false; const r = curRecord(); if (r && S.view.key === 'folio') drawFolioPreview(r); }
    }
    function folioImport(rec) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async () => {
            const file = input.files[0]; if (!file) return;
            let o;
            try { o = JSON.parse(await file.text()); } catch (e) { toast('That file is not JSON.'); return; }
            if (!ATH.sigil.validState(o)) { toast('That file is not a Sigil Maker recipe.'); return; }
            rec.recipe = o;
            const st = ATH.sigil.normalise(JSON.parse(JSON.stringify(o)));
            if (!rec.name || /^new /i.test(rec.name) || rec.name === rec.id) rec.name = ATH.sigil.buildLore(st).titleLa;
            folioCache.key = ''; edited(true); toast('Circle imported — not saved yet');
        };
        input.click();
    }
    async function folioBig(rec, which) {
        const st = folioState(rec); if (!st) return;
        const dlg = modal(`<h3>${esc(rec.name || 'Folio')}</h3>
            <div class="row wrap">${['spread', 'verso', 'recto'].map(w => `<button class="btn sm${w === which ? ' primary' : ''}" data-action="folio-big" data-which="${w}">${{ spread: 'Spread', verso: 'Left page', recto: 'Right page' }[w]}</button>`).join('')}</div>
            <div class="folio-big"><p class="muted">Drawing the book…</p></div>
            <div class="foot"><button class="btn" data-action="close-modal">Close</button></div>`, 'wide folio');
        await folioFonts(rec);
        const cv = await ATH.sigil.renderBook(st, which === 'spread' ? 0.9 : 1.2, { which, text: rec });
        const box = $('.folio-big', dlg); if (!box || !box.isConnected) return;
        box.innerHTML = `<img src="${cv.toDataURL('image/jpeg', 0.9)}" alt="">`;
    }
    function downloadBlob(name, blob) {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    async function folioExport(rec, what) {
        const SG = ATH.sigil, st = folioState(rec); if (!st) return;
        const stem = slug(rec.name || rec.id) || 'folio';
        try {
            await folioFonts(rec);
            if (what === 'recipe') { downloadBlob(`${stem}.json`, new Blob([JSON.stringify(rec.recipe, null, 1)], { type: 'application/json' })); return; }
            toast('Drawing…');
            if (what === 'pdf-spread' || what === 'pdf-pages') downloadBlob(`${stem}.pdf`, await SG.bookPDF(st, { layout: what === 'pdf-spread' ? 'spread' : 'pages', text: rec }));
            else if (what === 'png-book') downloadBlob(`${stem}-book.png`, await SG.bookPNG(st, { text: rec }));
            else if (what === 'png-plate') downloadBlob(`${stem}-circle.png`, await SG.platePNG(st, { size: 2048, bg: 'parchment' }));
        } catch (e) { console.error(e); toast(what.startsWith('pdf') ? 'The PDF could not be made: the PDF library loads from the web.' : 'The image could not be drawn.'); }
    }

    /* ---------- potions (the Apothecary's Crucible, DM side) ----------
       scripts/alchemy-engine.js brews and draws; the reagents are records like any
       others (Solvents, Active principles, Catalysts, Vessels, Reactions). Players
       never see what a potion does on the site: this
       is where the DM reads them, and turns a potion into a card of the Vault.
       (Players meet potions in shops, poi.shop.potions, and at an alchemist's Workbench,
       poi.alchemist: see scripts/market.js.)
       The card keeps only the recipe (item.potion = {seed, recipe, studio}); its
       bottle is drawn from it wherever the card is shown. */
    const ALC = window.Alchemy;
    const alcDb = () => (ALC ? ALC.dbFromStore(S.store) : null);
    const POTION_TEXT = ['name', 'type', 'rarity', 'cost', 'weight', 'summary', 'body'];
    const KIND_WORD = { boon: 'Synergy', bane: 'Adverse reaction', quirk: 'Oddity' };
    const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);

    // The potion of a card: {potion, studio}, {missing: [...]} or null (no potion)
    function potionOf(rec) {
        const r = rec && rec.potion, db = alcDb();
        if (!r || typeof r !== 'object' || !db) return null;
        const potion = ALC.brew(db, r.recipe, typeof r.seed === 'string' && r.seed ? r.seed : undefined);
        return potion ? { potion, studio: r.studio } : { missing: ALC.resolveRecipe(db, r.recipe).missing };
    }
    const potionArt = (potion, studio, uid, h) => `<span class="potion-art">${ALC.renderSVG(potion, studio, { uid, width: Math.round(h / 1.3), height: h })}</span>`;
    const reactionList = potion => potion.reactions.length
        ? potion.reactions.map(r => `<span class="rx rx--${r.kind}"><b>${esc(r.name)}</b><small>${KIND_WORD[r.kind]}</small><br>${esc(r.effect || 'No effect written yet.')}</span>`).join('')
        : `<span class="rx"><b>${potion.stabilized ? 'Stabilized' : 'Stable'}</b><br>${potion.stabilized ? 'The catalyst keeps the reagents from reacting.' : 'The reagents don’t react with one another.'}</span>`;
    const potionLine = p => `Potion, ${esc(ALC.rarityLabel(p.rarity))} · ${p.gpValue.toLocaleString('en')} gp · craft DC ${p.brewDC} (${esc(p.kit)})`;
    const recipeChips = p => chips([p.vessel, p.solvent, p.active, p.catalyst].map(x => S.store.get(x.id)).filter(Boolean));
    // Item cards whose potion uses this reagent or vessel
    const potionCardsUsing = id => S.data.item.filter(i => i.potion && i.potion.recipe && Object.values(i.potion.recipe).includes(id));

    // Side panel of an item: its potion, or the way to give it one
    function potionPanel(rec) {
        if (!ALC) return '';
        const got = potionOf(rec);
        const brewBtn = (label, primary) => `<button class="btn${primary ? ' primary' : ''}" data-action="potion-brew"><span class="material-symbols-outlined">science</span>${label}</button>`;
        const importBtn = `<button class="btn" data-action="potion-import"><span class="material-symbols-outlined">upload_file</span>Import a recipe…</button>`;
        if (!rec.potion) {
            return `<div class="box"><h4>Potion</h4>
                <p class="muted">No potion: the card shows its picture.</p>
                <div class="row wrap">${brewBtn('Brew a potion…', !rec.image && !rec.summary)}${importBtn}</div>
                <p class="hint">Brewing fills the card (name, rarity, cost, description) and draws the bottle in place of a picture. “Import” takes a file saved with <b>Save recipe</b> on the potion maker page.</p></div>`;
        }
        if (!got || got.missing) {
            return `<div class="box"><h4>Potion</h4>
                <p class="warn">${got ? `This potion can’t be drawn: ${esc(got.missing.join(', '))} no longer exist${got.missing.length > 1 ? '' : 's'}.` : 'This potion’s recipe can’t be read.'}</p>
                <div class="row wrap">${brewBtn('Brew another…', true)}<button class="btn" data-action="potion-clear">Remove the potion</button></div></div>`;
        }
        const { potion, studio } = got;
        return `<div class="box"><h4>Potion</h4>
            <div class="potion-sum">${potionArt(potion, studio, 'panel', 100)}
                <div><b>${esc(potion.title)}</b><p>${potionLine(potion)}</p></div></div>
            <div class="potion-parts">${recipeChips(potion)}</div>
            ${reactionList(potion)}
            <div class="row wrap">${brewBtn('Change…')}${importBtn}
                <button class="btn" data-action="potion-refill" title="Rewrites name, type, rarity, cost, weight and both descriptions from the potion">Rewrite the card’s text</button>
                <button class="btn" data-action="potion-clear">Remove</button></div>
            <p class="hint">The line above is for you: players read only what the card says. Seed <code>${esc(potion.seed)}</code>.</p></div>`;
    }

    // Side panel of a solvent, active principle, catalyst or vessel: a sample bottle and its cards
    function reagentPanel(rec, type) {
        const db = alcDb();
        if (!db) return '';
        const R = db.reagents, first = list => (list[0] || {}).id;
        const recipe = { vessel: first(db.vessels), solvent: first(R.solvents), active: first(R.actives), catalyst: first(R.catalysts) };
        recipe[{ vessel: 'vessel', solvent: 'solvent', principle: 'active', catalyst: 'catalyst' }[type]] = rec.id;
        const potion = ALC.brew(db, recipe);
        const cards = potionCardsUsing(rec.id);
        return `<div class="box"><h4>In a potion</h4>
            ${potion ? `<div class="potion-sum">${potionArt(potion, {}, 'sample', 100)}
                <div><b>${esc(potion.title)}</b><p>A sample with the first ${type === 'vessel' ? 'reagents' : 'vessel and reagents'} of the lists.<br>${potionLine(potion)}</p></div></div>`
                : '<p class="warn">This record can’t be brewed yet: check its required fields.</p>'}
            <div class="row wrap"><button class="btn" data-action="potion-new" data-part="${type}"><span class="material-symbols-outlined">science</span>Brew a card with it…</button></div>
            ${cards.length ? `<h4 style="margin-top:14px">On the cards <span>${cards.length}</span></h4>${chips(cards.map(c => S.store.get(c.id)).filter(Boolean))}
                <p class="hint">Deleting this record leaves these cards without a bottle.</p>` : ''}</div>`;
    }

    // Side panel of the Alchemy settings: every potion card, and a way to make one
    function alchemyPanel() {
        if (!ALC) return '';
        const cards = S.data.item.filter(i => i.potion);
        return `<div class="box"><h4>Potion cards <span>${cards.length}</span></h4>
            ${cards.length ? chips(cards.map(c => S.store.get(c.id)).filter(Boolean)) : '<p class="muted">None yet.</p>'}
            <div class="row wrap"><button class="btn primary" data-action="potion-new"><span class="material-symbols-outlined">science</span>Brew a new potion card…</button></div>
            <p class="hint">Players meet potions in shops (bottle, name, price) and at an alchemist’s Workbench (craft DC, tool, price and a brew mark). Effects show only here, on the potion maker and on the cards you make.</p></div>
            <div class="box"><h4>Potion maker</h4>
            <p class="muted">The full page: seeds, recipes, the bottle’s look, effects, values and DCs, and a shelf kept in this browser.</p>
            <div class="row wrap"><a class="btn" href="potion-maker.html" target="_blank" rel="noopener"><span class="material-symbols-outlined">open_in_new</span>Open the potion maker</a></div>
            <p class="hint">It reads the site’s files, so open it through the live server (like the other pages), not from disk. Not linked anywhere on the site.</p></div>`;
    }

    // The brewer. rec = the item to give the potion to, or null to make a new card;
    // preset = {part, id} starts from one reagent or vessel.
    function potionBrewer(rec, preset) {
        const db = alcDb();
        if (!db || !db.vessels.length || !db.reagents.solvents.length || !db.reagents.actives.length || !db.reagents.catalysts.length) {
            alertBox('Nothing to brew with', '<p>A potion needs at least one vessel, one solvent, one active principle and one catalyst (Tables › Alchemy).</p>'); return;
        }
        const R = db.reagents;
        const had = rec ? potionOf(rec) : null;
        const st = { seed: '', recipe: null, studio: ALC.normaliseStudio(had && had.potion ? had.studio : {}) };
        if (had && had.potion) { st.seed = had.potion.seed; st.recipe = ALC.recipeOf(had.potion); }
        else if (preset && preset.recipe && ALC.brew(db, preset.recipe, preset.seed || undefined)) {
            st.recipe = { ...preset.recipe }; st.seed = preset.seed || '';
        } else {
            st.seed = Math.random().toString(36).slice(2, 8).toUpperCase();
            st.recipe = ALC.recipeFromSeed(db, st.seed);
            if (preset && preset.id) { st.recipe[preset.part] = preset.id; st.seed = ''; }
        }
        const typed = seed => !!seed && seed !== ALC.recipeSeed(st.recipe);   // a seed the DM typed or rolled, not a recipe's own
        const tagName = id => (R.tags.find(t => t.id === id) || { name: id }).name;
        const opt = (list, cur, text) => list.map(x => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}>${esc(text(x))}</option>`).join('');
        const lookSel = (key, label, ids, name) => `<div class="fld"><label for="pb-${key}">${label}</label><select id="pb-${key}" data-look="${key}">
            <option value="auto">Auto (from the recipe)</option>${ids.map(id => `<option value="${id}"${st.studio[key] === id ? ' selected' : ''}>${esc(name ? name(id) : cap(id))}</option>`).join('')}</select></div>`;
        const textures = S.store.enumOptions('potionTexture');
        const willFill = !rec || !(had && had.potion);
        const dlg = modal(`<h3>${rec ? 'Brew a potion for this card' : 'Brew a new potion card'}</h3>
            <div class="pb">
                <div class="pb-left">
                    <div class="potion-art pb-stage" id="pb-stage"></div>
                    <div class="row"><input id="pb-seed" placeholder="Seed (any word)" value="${esc(typed(st.seed) ? st.seed : '')}" aria-label="Seed">
                        <button class="btn" id="pb-distill">Distill</button>
                        <button class="btn icon" id="pb-roll" title="Roll a random seed"><span class="material-symbols-outlined">casino</span></button></div>
                    <div class="row"><input id="pb-mark" placeholder="…or a brew mark from a Workbench" value="${esc(preset && preset.mark ? preset.mark : '')}" aria-label="Brew mark">
                        <button class="btn" id="pb-find">Find</button></div>
                    <p id="pb-mark-out" class="hint" style="margin:-4px 0 0" hidden></p>
                    <div class="pb-grid">
                        <div class="fld pb-wide"><label for="pb-vessel">Vessel</label><select id="pb-vessel" data-part="vessel">${opt(db.vessels, st.recipe.vessel, v => v.name)}</select></div>
                        <div class="fld pb-wide"><label for="pb-solvent">Solvent</label><select id="pb-solvent" data-part="solvent">${opt(R.solvents, st.recipe.solvent, s => `${s.name} — ${tagName(s.tag)}`)}</select></div>
                        <div class="fld pb-wide"><label for="pb-active">Active principle</label><select id="pb-active" data-part="active">${opt(R.actives, st.recipe.active, a => `${a.name} — ${ALC.rarityLabel(a.rarity)}, ${tagName(a.tag)}`)}</select></div>
                        <div class="fld pb-wide"><label for="pb-catalyst">Catalyst</label><select id="pb-catalyst" data-part="catalyst">${opt(R.catalysts, st.recipe.catalyst, c => `${c.name} — ${ALC.rarityLabel(c.rarity)}, ${tagName(c.tag)}`)}</select></div>
                    </div>
                    <details><summary>Look of the bottle</summary>
                        <div class="pb-grid">
                            ${lookSel('glass', 'Glass', Object.keys(ALC.GLASS_TINTS))}
                            ${lookSel('stopper', 'Stopper', ALC.STOPPERS)}
                            ${lookSel('wax', 'Wax', Object.keys(ALC.WAX_PALETTES), id => ALC.WAX_PALETTES[id].name)}
                            ${lookSel('stamp', 'Seal stamp', ALC.STAMPS)}
                            ${lookSel('neck', 'Neck', ALC.NECKS)}
                            ${lookSel('vellum', 'Label paper', Object.keys(ALC.VELLUM_PALETTES), id => ALC.VELLUM_PALETTES[id].name)}
                            ${lookSel('texture', 'Liquid', textures.map(o => o.id), id => (textures.find(o => o.id === id) || {}).label || id)}
                            <div class="fld"><label for="pb-fill">Fill level · <span id="pb-fill-read"></span></label><input type="range" id="pb-fill" min="${ALC.FILL_MIN}" max="${ALC.FILL_MAX}"></div>
                            <div class="fld"><label for="pb-label1">Label, line 1</label><input id="pb-label1" maxlength="14" placeholder="Auto (index code)" value="${esc(st.studio.labelText)}"></div>
                            <div class="fld"><label for="pb-label2">Label, line 2</label><input id="pb-label2" maxlength="16" placeholder="Auto (glyphs)" value="${esc(st.studio.labelSub)}"></div>
                            <div class="fld pb-wide"><div class="row wrap" style="margin:0">
                                <label class="row"><input type="checkbox" id="pb-seal"${st.studio.showSeal ? ' checked' : ''}> Wax seal</label>
                                <label class="row"><input type="checkbox" id="pb-label"${st.studio.showLabel ? ' checked' : ''}> Label</label>
                                <label class="row"><input type="checkbox" id="pb-colours"${st.studio.colorEnable ? ' checked' : ''}> Own colours</label>
                                <input type="color" id="pb-col1" value="${esc(st.studio.col1)}" aria-label="Top colour"><input type="color" id="pb-col2" value="${esc(st.studio.col2)}" aria-label="Bottom colour">
                                <button class="btn sm" id="pb-reset">Reset the look</button></div></div>
                        </div></details>
                </div>
                <div class="pb-rec" id="pb-rec"></div>
            </div>
            <div class="foot">
                <span class="pb-foot-left">
                    ${rec ? `<label title="Name, type, rarity, cost, weight and both descriptions"><input type="checkbox" id="pb-text"${willFill ? ' checked' : ''}> Write the card’s text from this potion</label>`
                        : `<label for="pb-found">Found in</label><select id="pb-found"><option value="">Nowhere yet</option>${foundOptions('', newestSessionOption())}</select>`}
                </span>
                <button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="pb-ok">${rec ? 'Use this potion' : 'Create the card'}</button>
            </div>`, 'xwide potion');

        const q = sel => $(sel, dlg);
        let potion = null;
        const draw = () => {
            potion = ALC.brew(db, st.recipe, st.seed || undefined);
            const look = ALC.resolveStudio(potion, st.studio);
            q('#pb-stage').innerHTML = ALC.renderSVG(potion, st.studio, { uid: 'brewer', width: 220, height: 286, animate: true });
            q('#pb-fill').value = st.studio.fillOverrideActive ? st.studio.fillValue : Math.round(potion.baseFill * 100);
            q('#pb-fill-read').textContent = st.studio.fillOverrideActive ? `${st.studio.fillValue}%` : 'auto';
            if (!st.studio.colorEnable) { q('#pb-col1').value = potion.active.color; q('#pb-col2').value = potion.catalyst.color; }
            const lore = x => (x.lore ? ` <span class="muted">${esc(x.lore)}</span>` : '');
            q('#pb-rec').innerHTML = `
                <h4>${esc(potion.title)}</h4>
                <p class="pb-meta"><b>${potionLine(potion)}</b> · ${esc(potion.form)} · ${potion.vessel.slots} slot${potion.vessel.slots === 1 ? '' : 's'} · mark ${esc(ALC.brewMark(st.recipe))}</p>
                <div class="pb-tags">${[...new Set(potion.tags)].map(t => `<span>${esc(tagName(t))}</span>`).join('')}</div>
                <h5>Use</h5><p>${esc(potion.use)}</p>
                <h5>Effect · ${esc(potion.active.name)}</h5><p>${esc(potion.active.effect || 'No effect written yet (Active principles → Effect).')}</p>
                <h5>Catalyst · ${esc(potion.catalyst.name)}</h5><p>${esc(potion.catalyst.modifier || 'No change written yet (Catalysts → What it changes).')}</p>
                <h5>Reactions</h5>${reactionList(potion)}
                <h5>What players see</h5>
                <p class="pb-flavour">${ALC.sensoryHTML(potion, look.texture)}</p>
                ${potion.oddity ? `<p class="pb-flavour">${esc(potion.oddity)}</p>` : ''}
                <h5>Reagents</h5>
                <p><b>${esc(potion.solvent.name)}.</b>${lore(potion.solvent)}</p>
                <p><b>${esc(potion.active.name)}</b> (${esc(potion.active.biome)}).${lore(potion.active)}</p>
                <p><b>${esc(potion.catalyst.name)}.</b>${lore(potion.catalyst)}</p>`;
        };
        const distill = seed => {
            st.seed = seed; st.recipe = ALC.recipeFromSeed(db, seed);
            for (const part of ['vessel', 'solvent', 'active', 'catalyst']) q(`#pb-${part}`).value = st.recipe[part];
            draw();
        };
        q('#pb-distill').addEventListener('click', () => { const v = q('#pb-seed').value.trim(); if (v) distill(v); else q('#pb-seed').focus(); });
        q('#pb-roll').addEventListener('click', () => { const v = Math.random().toString(36).slice(2, 8).toUpperCase(); q('#pb-seed').value = v; distill(v); });
        q('#pb-seed').addEventListener('keydown', e => { if (e.key === 'Enter' && q('#pb-seed').value.trim()) { e.preventDefault(); distill(q('#pb-seed').value.trim()); } });
        // A brew mark: the alchemists' stocks first (a mark is unique there), then the whole archive
        const useRecipe = recipe => {
            st.recipe = { ...recipe }; st.seed = ''; q('#pb-seed').value = '';
            for (const part of ['vessel', 'solvent', 'active', 'catalyst']) q(`#pb-${part}`).value = st.recipe[part];
            draw();
        };
        const findMark = () => {
            const mark = q('#pb-mark').value, out = q('#pb-mark-out');
            let found = ALC.findByMark(db, mark, ATH.market ? ATH.market.allBenches(S.store) : []);
            const where = found.length ? 'at an alchemist' : 'in the whole archive';
            if (!found.length) found = ALC.findByMark(db, mark);
            out.hidden = false;
            if (!found.length) { out.innerHTML = '<span class="warn">No mix has this mark. Six letters, like LR7-YR9.</span>'; return; }
            useRecipe(found[0]);
            out.innerHTML = found.length === 1 ? `Found ${where}.`
                : `${found.length} mixes share this mark (${where}): ${found.map((r, i) => `<a href="#" data-alt="${i}">${esc(ALC.brew(db, r).title)}</a>`).join(' · ')}`;
            $$('[data-alt]', out).forEach(a => a.addEventListener('click', e => { e.preventDefault(); useRecipe(found[Number(a.dataset.alt)]); }));
        };
        q('#pb-find').addEventListener('click', findMark);
        q('#pb-mark').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findMark(); } });
        // A hand-picked recipe is its own seed
        $$('[data-part]', dlg).forEach(sel => sel.addEventListener('change', () => { st.recipe[sel.dataset.part] = sel.value; st.seed = ''; q('#pb-seed').value = ''; draw(); }));
        $$('[data-look]', dlg).forEach(sel => sel.addEventListener('change', () => { st.studio[sel.dataset.look] = sel.value; draw(); }));
        q('#pb-fill').addEventListener('input', () => { st.studio.fillOverrideActive = true; st.studio.fillValue = Number(q('#pb-fill').value); draw(); });
        q('#pb-label1').addEventListener('input', () => { st.studio.labelText = q('#pb-label1').value.trim(); draw(); });
        q('#pb-label2').addEventListener('input', () => { st.studio.labelSub = q('#pb-label2').value.trim(); draw(); });
        q('#pb-seal').addEventListener('change', () => { st.studio.showSeal = q('#pb-seal').checked; draw(); });
        q('#pb-label').addEventListener('change', () => { st.studio.showLabel = q('#pb-label').checked; draw(); });
        q('#pb-colours').addEventListener('change', () => { st.studio.colorEnable = q('#pb-colours').checked; draw(); });
        for (const [id, key] of [['#pb-col1', 'col1'], ['#pb-col2', 'col2']]) {
            q(id).addEventListener('input', () => { st.studio[key] = q(id).value; st.studio.colorEnable = true; q('#pb-colours').checked = true; draw(); });
        }
        q('#pb-reset').addEventListener('click', () => {
            st.studio = ALC.normaliseStudio({});
            $$('[data-look]', dlg).forEach(sel => { sel.value = 'auto'; });
            q('#pb-label1').value = ''; q('#pb-label2').value = ''; q('#pb-seal').checked = true; q('#pb-label').checked = true; q('#pb-colours').checked = false;
            draw();
        });
        q('#pb-ok').addEventListener('click', () => {
            const record = ALC.potionRecord(potion, st.studio), fields = ALC.cardFields(potion, st.studio);
            if (rec) {
                rec.potion = record;
                if (q('#pb-text').checked) Object.assign(rec, fields);
                closeModal(); edited(true); toast('Potion set — not saved yet');
                return;
            }
            // A new card: id from the potion's name, numbered if that id is taken
            const ids = allIds(), base = slug(fields.name) || 'potion';
            let id = base;
            for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
            S.data.item.push({ id, ...fields, potion: record });
            const found = q('#pb-found').value;
            if (found) addFoundIn(id, found);
            closeModal(); rebuild();
            S.search = ''; $('#search').value = '';
            select({ kind: 'type', key: 'item' }, id);
            refreshChrome(); toast(`“${fields.name}” created — not saved yet`);
        });
        draw();
        if (preset && preset.mark) findMark();
    }

    // A file saved with “Save recipe” on the potion maker page (or the first potion of a shelf export)
    function potionImport(rec) {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async () => {
            const file = input.files[0]; if (!file) return;
            let o;
            try { o = JSON.parse(await file.text()); } catch (e) { toast('That file is not JSON.'); return; }
            if (o && Array.isArray(o.specimens)) o = o.specimens[0];
            const db = alcDb();
            if (!o || typeof o.recipe !== 'object' || !o.recipe) { toast('That file is not a potion recipe.'); return; }
            const potion = ALC.brew(db, o.recipe, typeof o.seed === 'string' && o.seed ? o.seed : undefined);
            if (!potion) { alertBox('That potion can’t be brewed here', `<p>Missing: ${esc(ALC.resolveRecipe(db, o.recipe).missing.join(', '))}.</p>`); return; }
            const fresh = !rec.potion && !rec.summary && !rec.body;
            rec.potion = ALC.potionRecord(potion, o.studio);
            if (fresh) {
                Object.assign(rec, ALC.cardFields(potion, o.studio));
                if (typeof o.title === 'string' && o.title.trim()) rec.name = o.title.trim().slice(0, 120);
            }
            edited(true); toast(fresh ? 'Potion imported and card written — not saved yet' : 'Potion imported (the card’s text is unchanged) — not saved yet');
        };
        input.click();
    }
    function potionRefill(rec) {
        const got = potionOf(rec);
        if (!got || !got.potion) return;
        if (POTION_TEXT.some(k => rec[k]) && !confirm('Rewrite the card’s name, type, rarity, cost, weight and descriptions from the potion?')) return;
        Object.assign(rec, ALC.cardFields(got.potion, got.studio));
        edited(true); toast('Card rewritten — not saved yet');
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
            : ATH.lootCard.front(item, { tag: 'div', picture: src => `data-thumb="${esc(src)}"`, store: S.store, uid: 'preview' });
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
        const campaign = campOf() || (cur && cur.campaign) || S.store.settings.currentCampaign || (S.store.all('campaign')[0] || {}).id;
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
        if (shop && ALC && poi.shop.potions > 0) {
            const potions = M.buildPotions(S.store, poi, code);
            out.push(`<div class="box"><h4>Brewed potions <span>${potions.length}</span></h4>
                ${potions.length ? potions.map(({ potion, priceLabel }, i) => `<div class="potion-row">
                    ${potionArt(potion, {}, `shop-${i}`, 64)}
                    <div><b>${esc(potion.title)}</b><p>${potionLine(potion).replace(/ · [\d,]+ gp/, ` · sold at ${esc(priceLabel)}`)}</p>
                        <p class="muted">${esc(potion.active.effect || 'No effect written.')}</p>
                        <button class="btn sm" data-action="potion-new" data-recipe="${esc(JSON.stringify(ALC.recipeOf(potion)))}" data-seed="${esc(potion.seed)}">Make it a card…</button></div>
                </div>`).join('') : '<p class="warn">No potion fits: check the rarity and the active principles.</p>'}
                ${hint('Players see the bottle, the name and the price (its value × the shop’s price level). Same market code = same shelf. When they buy one, “Make it a card” turns it into a Vault card.')}</div>`);
        }
        if (poi.alchemist && ALC) {
            const b = M.bench(S.store, poi);
            if (!b) out.push(`<div class="box"><h4>Workbench</h4><p class="warn">Stock at least one solvent, one active principle and one catalyst: no Workbench tab until then.</p></div>`);
            else {
                const combos = b.vessels.length * b.solvents.length * b.actives.length * b.catalysts.length;
                const quotes = [];
                for (const s of b.solvents) for (const a of b.actives) for (const c of b.catalysts) quotes.push(M.quoteBrew(S.store, poi, { vessel: b.vessels[0].id, solvent: s.id, active: a.id, catalyst: c.id }));
                const dcs = quotes.map(q => q.dc), gps = quotes.map(q => q.cp / 100);
                const range = (xs, f) => (Math.min(...xs) === Math.max(...xs) ? f(Math.min(...xs)) : `${f(Math.min(...xs))}–${f(Math.max(...xs))}`);
                out.push(`<div class="box"><h4>Workbench</h4>
                    <p>${b.vessels.length} vessel${b.vessels.length === 1 ? '' : 's'} · ${b.solvents.length} solvent${b.solvents.length === 1 ? '' : 's'} · ${b.actives.length} active principle${b.actives.length === 1 ? '' : 's'} · ${b.catalysts.length} catalyst${b.catalysts.length === 1 ? '' : 's'}: ${combos.toLocaleString('en')} mixes.</p>
                    <p class="muted">Craft DC ${range(dcs, x => x)} · brewing ${range(gps, x => `${x.toLocaleString('en')} gp`)} (${b.fee > 0 ? b.fee : 50}% of the value)</p>
                    <div class="row wrap"><input id="mark-in" placeholder="Brew mark, e.g. LR7-YR9" aria-label="Brew mark" style="flex:1;min-width:0">
                        <button class="btn" data-action="mark-find"><span class="material-symbols-outlined">search</span>Find</button></div>
                    ${hint('Players see the reagents’ names and lore, the craft DC, the tool and the price, and a brew mark to read out to you. Type it here, or in “Brew a potion”, to get the potion.')}</div>`);
            }
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
        const path = src.replace(/^\.?\//, '');
        // a picture made here and not saved yet (a new map icon)
        if (!S.thumbs.has(src) && typeof S.assets[path] === 'string') S.thumbs.set(src, Promise.resolve(URL.createObjectURL(new Blob([S.assets[path]], { type: path.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' }))));
        if (!S.thumbs.has(src)) S.thumbs.set(src, io.url(path).catch(() => ''));
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
       HOME
       ================================================================= */
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function issueHl(e, cls) {
        const m = e.match(/^\[([a-zA-Z]+)\] ([^.:\s"]+)/);
        const target = m && TYPES[m[1]] ? `data-jump="${esc(m[2])}"` : m && SINGLES[m[1]] ? `data-jump-single="${esc(m[1])}"` : 'data-action="show-issues"';
        return `<button class="hl ${cls}" ${target} title="${esc(e)}"><span class="material-symbols-outlined" style="--c:${cls === 'err' ? 'var(--red)' : 'var(--amber)'}">${cls === 'err' ? 'error' : 'warning'}</span><span class="t">${esc(e.replace(/^\[[^\]]+\] /, ''))}</span></button>`;
    }
    function renderHome() {
        const camp = campOf();
        const today = new Date().toISOString().slice(0, 10);
        // Next sessions (Site › Upcoming sessions)
        const sessions = ((S.singles.schedule || {}).sessions || []).filter(x => x && (!x.date || x.date >= today))
            .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 3);
        const TAGS = { tentative: ['Not confirmed', 'tbd'], postponed: ['Postponed', ''], cancelled: ['Cancelled', 'off'] };
        const sessHtml = sessions.map(x => {
            const tag = TAGS[x.status];
            return `<button class="sess" data-nav="single:schedule">
                <span class="date">${x.date ? `<b>${Number(x.date.slice(8, 10))}</b><span>${MONTHS[Number(x.date.slice(5, 7)) - 1] || ''}</span>` : '<b>?</b><span>TBA</span>'}</span>
                <span class="tx"><b>${esc(x.title || (x.campaign ? nameOf(x.campaign) : 'Session'))}${x.number != null ? ` · Session ${x.number}` : ''}</b>
                <span>${esc([x.time, x.where].filter(Boolean).join(' · ') || (x.date ? '' : 'Date to be announced'))}</span>
                ${tag ? `<span class="tag ${tag[1]}">${tag[0]}</span>` : ''}</span></button>`;
        }).join('') || '<p class="none">No session planned: add one in Site › Upcoming sessions.</p>';
        // Quick add
        const quick = ['session', 'npc', 'poi', 'notice', 'rumour', 'item', 'creature'].filter(t => TYPES[t]).map(t =>
            `<button class="btn" style="--c:${colourOf(TYPES[t])}" data-action="quick-new" data-type="${t}"><span class="material-symbols-outlined">${esc(TYPES[t].icon)}</span>${esc(t === 'poi' ? 'POI' : TYPES[t].label)}</button>`).join('');
        // Unsaved
        const dirty = [];
        for (const [t, d] of Object.entries(TYPES)) for (const r of S.data[t]) if (isDirtyRec(t, r)) dirty.push(`<button class="hl" style="--c:${colourOf(d)}" data-jump="${esc(r.id)}"><span class="material-symbols-outlined">${esc(d.icon)}</span><span class="t">${esc(r.name || r.id)}</span><small>${esc(d.label)}</small></button>`);
        for (const [k, d] of Object.entries(SINGLES)) if (isDirtySingle(k)) dirty.push(`<button class="hl" style="--c:${colourOf(d)}" data-nav="single:${k}"><span class="material-symbols-outlined">${esc(d.icon)}</span><span class="t">${esc(d.label)}</span><small>Site page</small></button>`);
        const files = dirtyFiles();
        const pics = files.filter(([p]) => p.startsWith(ICON_DIR + '/')).length;
        if (pics) dirty.push(`<button class="hl" data-nav="single:mapIcons"><span class="material-symbols-outlined">image</span><span class="t">Map icon pictures</span><small>${pics}</small></button>`);
        // Problems
        const { errors, warnings } = S.issues;
        const issues = [...errors.slice(0, 5).map(e => issueHl(e, 'err')), ...warnings.slice(0, Math.max(0, 5 - errors.length)).map(e => issueHl(e, 'warn'))].join('');
        const more = errors.length + warnings.length - Math.min(5, errors.length) - Math.max(0, Math.min(warnings.length, 5 - errors.length));
        // Recently opened
        const recent = S.recent.map(x => ({ x, r: TYPES[x.type] && S.data[x.type].find(r => r.id === x.id) })).filter(o => o.r).slice(0, 7)
            .map(({ x, r }) => `<button class="hl" style="--c:${colourOf(TYPES[x.type])}" data-jump="${esc(r.id)}"><span class="material-symbols-outlined">${esc(TYPES[x.type].icon)}</span><span class="t">${esc(r.name || r.id)}</span><small>${esc(TYPES[x.type].label)}</small></button>`).join('');
        // Workspaces
        const tiles = WS.filter(w => w.id !== 'home').map(w => {
            const es = wsEntries(w.id);
            const sum = w.id === 'tables' ? `${es.length} tables · ${es.reduce((n, e) => n + (e.kind === 'type' ? S.data[e.key].length : 0), 0)} rows`
                : es.map(e => { const l = /^[A-Z]{2}/.test(entryLabel(e)) ? entryLabel(e) : entryLabel(e).toLowerCase(); return e.kind === 'type' ? `${S.data[e.key].length} ${l}` : e.key === 'mapIcons' ? `${iconList().length} map icons` : l; }).join(' · ');
            return `<button class="wt" style="--c:${w.color}" data-ws="${w.id}"><b><span class="material-symbols-outlined">${w.icon}</span>${esc(w.label)}</b><span>${esc(sum)}</span><span>${esc(w.blurb || '')}</span></button>`;
        }).join('');
        $('#home').innerHTML = `
            <div class="home-head"><h1>The Athenaeum</h1>
                <p>Folder <code>${esc(io.name())}</code> · the lists show <b>${esc(camp ? nameOf(camp) : 'every campaign')}</b> (change it at the top right) · Ctrl K finds anything.</p></div>
            <div class="hgrid">
                <section class="hc s7"><h3><span class="material-symbols-outlined">event_upcoming</span>Next sessions</h3>${sessHtml}</section>
                <section class="hc s5"><h3><span class="material-symbols-outlined">add_circle</span>Add</h3><div class="qa">${quick}</div></section>
                <section class="hc"><h3><span class="material-symbols-outlined">edit_note</span>Not saved yet<small>${files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''}</small></h3>
                    ${dirty.length ? dirty.slice(0, 8).join('') + (dirty.length > 8 ? `<p class="none">and ${dirty.length - 8} more</p>` : '') + '<button class="btn primary" data-action="save" style="align-self:flex-start"><span class="material-symbols-outlined">save</span>Save all</button>' : '<p class="none">Everything is saved.</p>'}</section>
                <section class="hc"><h3><span class="material-symbols-outlined">rule</span>To check<small>${errors.length || warnings.length ? `${errors.length} problem${errors.length === 1 ? '' : 's'} · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}</small></h3>
                    ${issues || '<p class="none">No problem found in the data.</p>'}${more > 0 ? `<button class="btn sm" data-action="show-issues" style="align-self:flex-start">See all ${errors.length + warnings.length}</button>` : ''}</section>
                <section class="hc"><h3><span class="material-symbols-outlined">history</span>Opened lately</h3>${recent || '<p class="none">Nothing yet.</p>'}</section>
                <section class="hc s12"><h3><span class="material-symbols-outlined">space_dashboard</span>Workspaces</h3><div class="wst">${tiles}</div></section>
            </div>`;
    }

    /* =================================================================
       BOARDS (1): a table as a grid. Short fields are edited in their cell;
       a click on a row opens the full form beside the grid.
       ================================================================= */
    const GRID_KINDS = ['text', 'url', 'number', 'enum', 'ref', 'boolean', 'date', 'time', 'list'];
    function gridColumns(type) {
        const def = TYPES[type];
        const ok = f => f && !f.private && GRID_KINDS.includes(f.kind) && !f.long && !(f.kind === 'list' && (f.enum || f.lines));
        const keys = def.columns ? def.columns.filter(k => ok(def.fields[k])) : Object.keys(def.fields).filter(k => ok(def.fields[k]) && !def.fields[k].showIf).slice(0, 7);
        return keys.map(k => {
            const f = def.fields[k];
            return { k, f, opts: f.kind === 'enum' ? enumOpts(f) : null, cls: f.kind === 'boolean' ? 'c-chk' : f.kind === 'text' && /desc|text|effect|summary|caption/i.test(k) ? 'c-wide' : '' };
        });
    }
    // What a cell says, for sorting and filtering
    function cellText(c, v) {
        if (v === undefined || v === null || v === '') return '';
        if (c.f.kind === 'enum') return ((c.opts || []).find(o => o.id === v) || {}).label || String(v);
        if (c.f.kind === 'ref') return nameOf(v);
        if (c.f.kind === 'list') return (Array.isArray(v) ? v : []).join(', ');
        if (c.f.kind === 'boolean') return v ? 'yes' : '';
        return String(v);
    }
    function gridCell(c, r) {
        const { k, f } = c, v = r[k], p = pathAttr([k]);
        const lab = `aria-label="${esc(`${f.label || k} of ${r.name || r.id}`)}"`;
        switch (f.kind) {
            case 'boolean': return `<input type="checkbox" data-path="${p}" data-kind="boolean" ${v ? 'checked' : ''} ${lab}>`;
            case 'enum': return `<select data-path="${p}" data-kind="enum" ${lab}><option value="">—</option>${c.opts.map(o => `<option value="${esc(o.id)}" ${o.id === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}${v && !c.opts.some(o => o.id === v) ? `<option value="${esc(v)}" selected>⚠ ${esc(v)}</option>` : ''}</select>`;
            case 'ref': return refSelect(f.to, v, `data-path="${p}" data-kind="ref" ${lab}`);
            case 'number': return `<input type="number" data-path="${p}" data-kind="number" value="${v ?? ''}" ${lab}>`;
            case 'list': return `<input data-path="${p}" data-kind="csv" value="${esc((Array.isArray(v) ? v : []).join(', '))}" placeholder="a, b" ${lab}>`;
            case 'date': case 'time': return `<input type="${f.kind}" data-path="${p}" data-kind="text" value="${esc(v)}" ${lab}>`;
            default: return `<input data-path="${p}" data-kind="text" value="${esc(v)}" ${lab}>`;
        }
    }
    const flagsHtml = (type, r) => {
        const bad = recordErrors(type, r.id).length;
        return `${isDirtyRec(type, r) ? '<span class="dot" title="Unsaved changes"></span>' : ''}${bad ? ` <span class="bad" title="${bad} problem${bad === 1 ? '' : 's'}">${bad}</span>` : ''}`;
    };
    function gridRow(type, r, cols) {
        const on = r.id === S.sel;
        return `<tr class="rw ${on ? 'on' : ''}" data-rec="${esc(r.id)}">
            <td><button class="open" data-select="${esc(r.id)}" title="${on ? 'Open beside' : 'Open the full form'}" aria-label="Open ${esc(r.name || r.id)}"><span class="material-symbols-outlined">${on ? 'chevron_right' : 'open_in_full'}</span></button></td>
            <td class="c-name"><input data-path="${pathAttr(['name'])}" data-kind="text" value="${esc(r.name)}" aria-label="Name"></td>
            ${cols.map(c => `<td class="${c.cls}">${gridCell(c, r)}</td>`).join('')}
            <td class="flags">${flagsHtml(type, r)}</td></tr>`;
    }
    function gridGroups(type, cols) {
        const q = (S.gridQ[type] || '').trim().toLowerCase();
        const match = r => !q || [r.id, r.name, ...(r.aliases || []), ...cols.map(c => cellText(c, r[c.k])), ...Object.values(r).filter(v => typeof v === 'string')]
            .some(v => String(v || '').toLowerCase().includes(q));
        const sort = S.gridSort[type];
        const col = sort && (sort.key === 'name' ? { k: 'name', f: { kind: 'text' } } : cols.find(c => c.k === sort.key));
        if (col) {
            const val = r => (col.f.kind === 'number' ? (typeof r[col.k] === 'number' ? r[col.k] : Infinity * sort.dir) : cellText(col, r[col.k]).toLowerCase() || '￿');
            const recs = S.data[type].filter(match).sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
            return recs.length ? [{ label: '', recs }] : [];
        }
        return orderedRecords(type).map(g => ({ ...g, recs: g.recs.filter(match) })).filter(g => g.recs.length);
    }
    function renderGrid() {
        const type = S.view.key, def = TYPES[type], cols = gridColumns(type);
        const sort = S.gridSort[type] || {};
        const th = (k, label) => `<th scope="col" ${sort.key === k ? `aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button data-action="grid-sort" data-key="${esc(k)}" title="Sort by ${esc(label.toLowerCase())}">${esc(label)}${sort.key === k ? `<span class="material-symbols-outlined">${sort.dir > 0 ? 'arrow_upward' : 'arrow_downward'}</span>` : ''}</button></th>`;
        const focused = document.activeElement && document.activeElement.id === 'grid-q';
        $('#board').innerHTML = `
            <div class="bd-head">
                <div class="bd-title"><div class="kind" style="--c:${colourOf(def)}"><span class="material-symbols-outlined">${esc(def.icon || 'table_view')}</span>${esc(def.group || 'Table')}</div>
                    <h2>${esc(def.plural || def.label)}</h2><code>${esc(def.file)}${def.dmOnly ? ' · DM only: never on the site' : ''}</code></div>
                <div class="search"><span class="material-symbols-outlined">filter_list</span><input id="grid-q" value="${esc(S.gridQ[type] || '')}" placeholder="Filter rows…" aria-label="Filter rows" autocomplete="off"></div>
                <button class="btn primary" data-action="new" title="New ${lc(esc(def.label))}"><span class="material-symbols-outlined">add</span>Row</button>
            </div>
            <div class="bd-scroll" id="grid-scroll">
                <table class="grid-t"><thead><tr><th scope="col" aria-label="Open" style="width:1%"></th>${th('name', 'Name')}${cols.map(c => th(c.k, c.f.label || c.k)).join('')}<th scope="col" aria-label="State" style="width:1%"></th></tr></thead>
                <tbody id="grid-body"></tbody></table>
            </div>
            <div class="bd-foot" id="grid-foot"></div>`;
        renderGridBody();
        if (focused) { const i = $('#grid-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }
    function renderGridBody() {
        const type = S.view.key, cols = gridColumns(type);
        const groups = gridGroups(type, cols);
        const shown = groups.reduce((n, g) => n + g.recs.length, 0), total = S.data[type].length;
        const span = cols.length + 3;
        $('#grid-body').innerHTML = groups.map(g => `${g.label ? `<tr class="gr"><td colspan="${span}">${esc(g.label)} · ${g.recs.length}</td></tr>` : ''}${g.recs.map(r => gridRow(type, r, cols)).join('')}`).join('')
            || `<tr><td colspan="${span}" class="empty">${(S.gridQ[type] || '').trim() ? 'No match.' : 'Nothing yet: click + Row.'}</td></tr>`;
        $('#grid-foot').textContent = `${shown === total ? `${total} row${total === 1 ? '' : 's'}` : `${shown} of ${total} rows`} · edit a cell in place, or click a row to open its full form · click a column’s name to sort`;
    }
    // A board already on screen: only the open record changes (the scroll stays)
    function renderBoard(force) {
        const key = `${S.view.kind}:${S.view.key}`;
        if (!force && S.boardShown === key) { boardSelection(); return; }
        const sc = $('#board .bd-scroll'), top = S.boardShown === key && sc ? sc.scrollTop : 0;
        if (S.view.kind === 'single') renderIconBoard(); else renderGrid();
        S.boardShown = key;
        const sc2 = $('#board .bd-scroll'); if (sc2) sc2.scrollTop = top;
        boardSelection();
    }
    function boardSelection() {
        $$('#board [data-rec]').forEach(tr => {
            const on = tr.dataset.rec === S.sel;
            tr.classList.toggle('on', on);
            const ic = $('.open .material-symbols-outlined', tr); if (ic) ic.textContent = on ? 'chevron_right' : 'open_in_full';
        });
        $$('#board [data-icon]').forEach(t => { t.classList.toggle('on', t.dataset.icon === S.sel); t.setAttribute('aria-pressed', t.dataset.icon === S.sel); });
        const on = $('#board [data-rec].on, #board [data-icon].on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    // After an edit: the rows' marks, and the open record's row (edited in the form) unless typing in it
    function syncBoard() {
        if (S.view.kind === 'single') { renderIconGallery(); return; }
        const type = S.view.key, cols = gridColumns(type);
        $$('#grid-body tr.rw').forEach(tr => {
            const r = S.data[type].find(x => x.id === tr.dataset.rec);
            if (!r) return;
            if (r.id === S.sel && !tr.contains(document.activeElement)) {
                const t = document.createElement('tbody'); t.innerHTML = gridRow(type, r, cols); tr.replaceWith(t.firstElementChild);
            } else $('.flags', tr).innerHTML = flagsHtml(type, r);
        });
    }

    /* =================================================================
       BOARDS (2): the map icons (Site › Map icons). The pictures are
       images/atlas_icons/<id>.svg; data/map-icons.json lists them with a
       name and the icon of the places' cards. New pictures are kept in
       S.assets and written on save, like everything else.
       ================================================================= */
    const ICON_DIR = 'images/atlas_icons';
    const iconSrc = id => `${ICON_DIR}/${id}.svg`;
    function iconList() {
        if (!S.singles.mapIcons) S.singles.mapIcons = {};
        const m = S.singles.mapIcons;
        if (!Array.isArray(m.icons)) m.icons = [];
        return m.icons;
    }
    const iconIds = () => [...new Set([...iconList().map(i => i && i.id).filter(Boolean), ...(S.icons || [])])].sort();
    const iconName = id => { const ic = iconList().find(i => i && i.id === id); return (ic && ic.label) || id; };
    const humanize = id => String(id || '').replace(/[-_]+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
    const iconUsers = id => PLACE_TYPES.flatMap(t => S.data[t].filter(r => r.map && r.map.icon === id));
    // The pictures in the folder (null when it can't be listed: test mode)
    async function listIcons() {
        S.icons = null;
        if (!io.list) return;
        try {
            const names = await io.list(ICON_DIR);
            S.icons = names ? names.filter(n => n.endsWith('.svg')).map(n => n.slice(0, -4)) : null;
        } catch (e) { S.icons = null; }
    }
    const iconOnDisk = id => (S.icons ? S.icons.includes(id) : S.loadedIcons.has(id));

    function renderIconBoard() {
        $('#board').innerHTML = `
            <div class="bd-head">
                <div class="bd-title"><div class="kind" style="--c:${WS_BY.site.color}"><span class="material-symbols-outlined">add_location_alt</span>Site</div>
                    <h2>Map icons</h2><code>${ICON_DIR}/ · data/map-icons.json</code></div>
                <div class="search"><span class="material-symbols-outlined">filter_list</span><input id="icon-q" value="${esc(S.iconQ || '')}" placeholder="Filter icons…" aria-label="Filter icons" autocomplete="off"></div>
                <button class="btn primary" data-action="icon-new"><span class="material-symbols-outlined">add</span>New icon</button>
            </div>
            <div class="bd-scroll" id="icon-drop"><div class="icon-gal" id="icon-gal"></div></div>
            <div class="bd-foot">Drop an SVG or PNG on this page to add it · a pin picks its icon in Atlas › a place › Map · new pictures are written when you save</div>`;
        renderIconGallery();
    }
    function renderIconGallery() {
        const gal = $('#icon-gal');
        if (!gal) return;
        const q = (S.iconQ || '').trim().toLowerCase();
        const all = iconList().filter(i => i && i.id);
        const list = all.filter(i => !q || [i.id, i.label].some(v => String(v || '').toLowerCase().includes(q)));
        const listed = new Set(all.map(i => i.id));
        const stray = (S.icons || []).filter(id => !listed.has(id) && (!q || id.includes(q)));
        const tile = ic => {
            const n = iconUsers(ic.id).length;
            return `<button class="icon-tile ${ic.id === S.sel ? 'on' : ''}" data-icon="${esc(ic.id)}" aria-pressed="${ic.id === S.sel}">
                <span class="pinp"><img data-thumb="${esc(iconSrc(ic.id))}" alt=""></span><b>${esc(ic.label || ic.id)}</b><small>${esc(ic.id)}.svg</small>
                <span class="use ${n ? '' : 'zero'}">${n ? `${n} pin${n === 1 ? '' : 's'}` : 'Not used yet'}</span></button>`;
        };
        gal.innerHTML = `${q ? '' : `<button class="icon-tile new" data-action="icon-new"><span class="material-symbols-outlined">add_photo_alternate</span><b>New icon</b><small>SVG or PNG</small></button>`}
            ${list.map(tile).join('')}
            ${stray.length ? `<p class="gal-h">In the folder but not in the list</p>${stray.map(id => `<button class="icon-tile stray" data-action="icon-adopt" data-id="${esc(id)}" title="Add it to the list">
                <span class="pinp"><img data-thumb="${esc(iconSrc(id))}" alt=""></span><b>${esc(id)}</b><span class="stray-tag">+ Add to the list</span></button>`).join('')}` : ''}
            ${q && !list.length && !stray.length ? '<p class="gal-h">No match.</p>' : ''}`;
        loadThumbs();
    }
    // The open icon, beside the gallery
    function renderIconDetail() {
        const ed = $('#editor');
        const icons = iconList(), i = icons.findIndex(x => x && x.id === S.sel);
        if (i < 0) { ed.innerHTML = ''; S.sel = null; $('#app').classList.toggle('no-sel', true); return; }
        const ic = icons[i], users = iconUsers(ic.id), src = iconSrc(ic.id);
        const pending = typeof S.assets[src] === 'string' && S.base[src] !== S.assets[src];
        const pin = cls => `<span class="pinp ${cls}"><img data-thumb="${esc(src)}" alt=""></span>`;
        ed.innerHTML = `
            <div class="ed-head"><div class="ed-top">
                <div class="ed-title"><div class="kind" style="--c:${WS_BY.site.color}"><span class="material-symbols-outlined">add_location_alt</span>Map icon<span class="dot" id="ed-dirty" hidden title="Unsaved changes"></span></div>
                    <h2 id="ed-title">${esc(ic.label || ic.id)}</h2><code>${esc(src)}${pending ? ' · new picture, written on save' : ''}</code></div>
                <div class="ed-actions"><button class="btn icon" data-action="close-sel" title="Close (Esc)" aria-label="Close"><span class="material-symbols-outlined">close</span></button></div>
            </div></div>
            <div class="ed-wrap no-side"><div class="form">
                <section class="sec"><header class="sec-head"><span class="material-symbols-outlined">visibility</span><h3>As the site shows it</h3></header>
                    <div class="sec-body"><div class="pin-row">
                        ${pin('lg')}${pin('lg danger')}<span class="on-map" title="On a map">${pin('sm')}</span>
                        <span class="icon-prev material-symbols-outlined" data-card-prev title="On the back of the places’ cards">${esc(ic.cardIcon || 'location_on')}</span>
                    </div>
                    <p class="help" style="margin-top:10px">Gold pin · red for a dangerous place · on a map · the card icon.</p>
                    <div class="row wrap"><button class="btn" data-action="icon-replace"><span class="material-symbols-outlined">upload</span>Replace the picture…</button></div></div></section>
                <section class="sec"><header class="sec-head"><span class="material-symbols-outlined">badge</span><h3>Details</h3></header>
                    <div class="sec-body"><div class="grid">
                        <div class="fld w-6"><label for="ic-label">Name</label><input id="ic-label" data-path="${pathAttr(['icons', i, 'label'])}" data-kind="text" value="${esc(ic.label)}" placeholder="${esc(humanize(ic.id))}"><p class="help">How the icon picker names it.</p></div>
                        <div class="fld w-6"><label for="ic-id">File name</label><div class="row"><input id="ic-id" value="${esc(ic.id)}" readonly><button class="btn" data-action="icon-rename">Rename…</button></div><p class="help">What a pin stores. Renaming updates every pin.</p></div>
                        <div class="fld w-12"><label for="ic-card">Card icon</label>${controlHtml({ kind: 'text', icon: true }, ic.cardIcon, ['icons', i, 'cardIcon'], 'ic-card')}
                            <p class="help">A Material Symbols name (fonts.google.com/icons) for the back of the places’ cards in the Atlas list pages. Empty = location_on.</p></div>
                    </div></div></section>
                <section class="sec"><header class="sec-head"><span class="material-symbols-outlined">push_pin</span><h3>Pins using it <span class="muted" style="font:500 13px Manrope">${users.length}</span></h3></header>
                    <div class="sec-body">${users.length ? chips(users.map(r => S.store.get(r.id)).filter(Boolean)) : '<p class="help">No pin uses it yet: pick it in a place’s Map section.</p>'}
                    <div class="row wrap"><button class="btn danger" data-action="icon-delete"><span class="material-symbols-outlined">delete</span>Delete this icon</button></div></div></section>
            </div></div>`;
        loadThumbs();
        updateHeader();
    }
    // The icon of a map pin, chosen in a grid of the icons
    function iconPicker(path) {
        const rec = curRecord(), cur = getAt(rec, path);
        const dlg = modal(`<h3>Pin icon</h3>
            <div class="search"><span class="material-symbols-outlined">search</span><input id="ip-q" placeholder="Find an icon…" autocomplete="off" aria-label="Find an icon"></div>
            <div class="ip-grid" id="ip-grid"></div>
            <div class="foot"><button class="btn" data-action="go-icons" style="margin-right:auto"><span class="material-symbols-outlined">add_location_alt</span>Manage the icons</button>
                <button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="ip-new"><span class="material-symbols-outlined">add</span>New icon…</button></div>`, 'wide');
        const grid = $('#ip-grid', dlg), qIn = $('#ip-q', dlg);
        const draw = () => {
            const q = qIn.value.trim().toLowerCase();
            const ids = iconIds().filter(id => !q || id.includes(q) || iconName(id).toLowerCase().includes(q));
            grid.innerHTML = (q ? '' : `<button class="ip-i none-i ${cur ? '' : 'on'}" data-pick="">No icon</button>`)
                + ids.map(id => `<button class="ip-i ${id === cur ? 'on' : ''}" data-pick="${esc(id)}" title="${esc(id)}.svg"><span class="pinp sm"><img data-thumb="${esc(iconSrc(id))}" alt=""></span><span>${esc(iconName(id))}</span></button>`).join('')
                || '<p class="muted">No match.</p>';
            loadThumbs();
        };
        const pick = id => { setAt(rec, path, id || undefined); closeModal(); edited(true); };
        qIn.addEventListener('input', draw);
        qIn.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('[data-pick]', grid); if (b) pick(b.dataset.pick); } });
        grid.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) pick(b.dataset.pick); });
        $('#ip-new', dlg).addEventListener('click', () => { closeModal(); newIconDialog({ onDone: id => { setAt(rec, path, id); edited(true); } }); });
        draw(); qIn.focus();
    }

    /* ---------- pictures: an SVG made safe, or a PNG / WebP wrapped in an SVG ---------- */
    const SVG_NS = 'http://www.w3.org/2000/svg';
    function cleanSvg(text) {
        text = String(text || '').trim().replace(/^<\?xml[^>]*>\s*/i, '').replace(/<!DOCTYPE[^>]*>\s*/i, '');
        if (!/<svg[\s>]/i.test(text)) return { error: 'That is not SVG code: it should start with <svg and end with </svg>.' };
        if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(text)) text = text.replace(/<svg(?=[\s>])/i, `<svg xmlns="${SVG_NS}"`);
        if (/xlink:/.test(text) && !/xmlns:xlink/.test(text)) text = text.replace(/<svg(?=[\s>])/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const root = doc.documentElement;
        if (!root || doc.getElementsByTagName('parsererror').length || root.localName !== 'svg') return { error: 'That SVG could not be read (is all of it pasted?).' };
        root.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video').forEach(n => n.remove());
        for (const el of [root, ...root.querySelectorAll('*')]) {
            for (const a of [...el.attributes]) {
                const n = a.name.toLowerCase(), v = a.value.trim();
                if (n.startsWith('on')) el.removeAttribute(a.name);
                else if ((n === 'href' || n === 'xlink:href') && !v.startsWith('#') && !/^data:image\/(png|jpe?g|webp|gif);/i.test(v)) el.removeAttribute(a.name);
            }
        }
        let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
        if (vb.length !== 4 || vb.some(n => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
            const w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
            if (!(w > 0 && h > 0)) return { error: 'The SVG has no size: it needs a viewBox (or a width and a height).' };
            vb = [0, 0, w, h];
            root.setAttribute('viewBox', vb.join(' '));
        }
        root.removeAttribute('style');
        root.setAttribute('width', String(vb[2]));
        root.setAttribute('height', String(vb[3]));
        const out = new XMLSerializer().serializeToString(root);
        if (out.length > 400000) return { error: 'That SVG is very heavy (over 400 KB): simplify it, or pick another.' };
        return { svg: out, note: Math.abs(vb[2] - vb[3]) > Math.max(vb[2], vb[3]) * 0.05 ? 'It is not square: it is fitted inside the pin.' : '' };
    }
    async function rasterSvg(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be opened.')); i.src = url; });
            const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
            const px = g.getImageData(0, 0, w, h).data;
            let clear = 0; for (let i = 3; i < px.length; i += 4) if (px[i] < 250) clear++;
            const data = c.toDataURL('image/png');
            return {
                svg: `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><image width="${w}" height="${h}" href="${data}"/></svg>`,
                note: clear < (w * h) / 50 ? 'It has no transparent background, so the pin shows a filled square: an SVG or a cut-out PNG looks better.' : '',
            };
        } catch (e) { return { error: e.message }; }
        finally { URL.revokeObjectURL(url); }
    }
    // New icon (or a new picture for one: replace = its id)
    function newIconDialog({ replace = null, file = null, onDone = null } = {}) {
        const ic = replace ? iconList().find(i => i.id === replace) : null;
        const dlg = modal(`<h3>${ic ? `New picture for “${esc(ic.label || ic.id)}”` : 'New map icon'}</h3>
            <div class="ni">
                <div class="stack" style="align-items:stretch;gap:12px">
                    <div class="seg big" role="tablist"><button class="on" data-src="file" role="tab" aria-selected="true">Upload a file</button><button data-src="code" role="tab" aria-selected="false">Paste SVG code</button></div>
                    <div id="ni-file"><label class="drop" id="ni-drop" tabindex="0"><input type="file" id="ni-input" accept=".svg,image/svg+xml,.png,image/png,.webp,image/webp" hidden>
                        <span class="material-symbols-outlined">upload_file</span><span><b>Choose a picture</b> or drop it here</span>
                        <small>SVG works best: one shape on a transparent background. A PNG or WebP cut-out works too.</small></label></div>
                    <div id="ni-code" hidden><textarea id="ni-svg" class="mono" rows="6" placeholder="&lt;svg viewBox=&quot;0 0 512 512&quot;&gt;…&lt;/svg&gt;" aria-label="SVG code"></textarea></div>
                    <p class="ni-msg" id="ni-msg"></p>
                    ${ic ? '' : `<div class="grid">
                        <div class="fld w-6"><label for="ni-name">Name</label><input id="ni-name" placeholder="Watchtower" autocomplete="off"></div>
                        <div class="fld w-6"><label for="ni-id">File name</label><input id="ni-id" placeholder="watchtower" autocomplete="off"><p class="help">Lowercase letters, digits, - and _.</p></div>
                        <div class="fld w-12"><label for="ni-card">Card icon <span class="muted">(optional)</span></label><div class="row"><span class="icon-prev material-symbols-outlined" id="ni-card-prev">location_on</span><input id="ni-card" placeholder="location_on" autocomplete="off"></div>
                            <p class="help">A Material Symbols name, for the back of the places’ cards.</p></div>
                    </div>`}
                    <p class="help">Tip: game-icons.net has thousands of free icons in the style of the existing pins (CC BY 3.0: credit the author).</p>
                </div>
                <div class="ni-prev">
                    <span class="pinp lg missing" id="ni-p1"><img alt=""></span>
                    <span class="pinp danger missing" id="ni-p2"><img alt=""></span>
                    <span class="on-map"><span class="pinp sm missing" id="ni-p3"><img alt=""></span></span>
                    <p>As on the site: a gold pin, a red one for a dangerous place, and on a map.</p>
                </div>
            </div>
            <p class="err" id="ni-err"></p>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="ni-ok" disabled>${ic ? 'Use this picture' : 'Add the icon'}</button></div>`, 'wide');
        let svg = null, idTouched = false, url = '';
        const $d = s => $(s, dlg);
        const msg = (t, cls = '') => { $d('#ni-msg').textContent = t; $d('#ni-msg').className = 'ni-msg ' + cls; };
        const show = () => {
            if (url) URL.revokeObjectURL(url);
            url = svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : '';
            ['#ni-p1', '#ni-p2', '#ni-p3'].forEach(s => { const p = $d(s); p.classList.toggle('missing', !svg); $('img', p).src = url || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; });
            $d('#ni-ok').disabled = !svg;
        };
        const take = r => { if (r.error) { svg = null; msg(r.error, 'bad'); } else { svg = r.svg; msg(`Ready (${(svg.length / 1024).toFixed(1)} KB).${r.note ? ' ' + r.note : ''}`, r.note ? '' : 'ok'); } show(); };
        const nameFrom = stem => {
            if (ic) return;
            const n = $d('#ni-name');
            if (!n.value.trim()) n.value = humanize(slug(stem) || stem);
            if (!idTouched) $d('#ni-id').value = slug(stem);
        };
        const takeFile = async f => {
            if (!f) return;
            nameFrom(f.name.replace(/\.[^.]+$/, ''));
            if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') take(cleanSvg(await f.text()));
            else if (/^image\/(png|webp|jpeg|gif)$/.test(f.type)) take(await rasterSvg(f));
            else msg('Use an SVG, PNG or WebP picture.', 'bad');
        };
        $$('.seg button', dlg).forEach(b => b.addEventListener('click', () => {
            $$('.seg button', dlg).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
            $d('#ni-file').hidden = b.dataset.src !== 'file'; $d('#ni-code').hidden = b.dataset.src !== 'code';
            if (b.dataset.src === 'code') $d('#ni-svg').focus();
        }));
        $d('#ni-input').addEventListener('change', e => takeFile(e.target.files[0]));
        const drop = $d('#ni-drop');
        drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $d('#ni-input').click(); } });
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); takeFile(e.dataTransfer.files[0]); });
        let ct = null;
        $d('#ni-svg').addEventListener('input', e => { clearTimeout(ct); ct = setTimeout(() => (e.target.value.trim() ? take(cleanSvg(e.target.value)) : (svg = null, msg(''), show())), 250); });
        if (!ic) {
            $d('#ni-name').addEventListener('input', e => { if (!idTouched) $d('#ni-id').value = slug(e.target.value); });
            $d('#ni-id').addEventListener('input', () => { idTouched = true; });
            $d('#ni-card').addEventListener('input', e => { $d('#ni-card-prev').textContent = e.target.value.trim() || 'location_on'; });
        }
        $d('#ni-ok').addEventListener('click', () => {
            if (!svg) return;
            const err = t => { $d('#ni-err').textContent = t; };
            let id = replace;
            if (!ic) {
                id = $d('#ni-id').value.trim();
                if (!id) return err('Give it a file name.');
                if (!ID_RE.test(id)) return err('The file name may contain lowercase letters, digits, - and _ only.');
                if (iconIds().includes(id)) return err(`“${id}” is already an icon: choose another file name, or replace that icon’s picture.`);
            }
            const path = iconSrc(id);
            S.assets[path] = svg; S.removals.delete(path); S.thumbs.delete(path);
            if (url) URL.revokeObjectURL(url);
            closeModal();
            if (ic) { edited(true); toast('Picture replaced — not saved yet'); return; }
            const rec = { id, label: $d('#ni-name').value.trim() || humanize(id) };
            const card = $d('#ni-card').value.trim(); if (card) rec.cardIcon = card;
            iconList().push(rec);
            rebuild();
            S.boardShown = null; // the gallery gets its new tile
            if (onDone) onDone(id);
            else select({ kind: 'single', key: 'mapIcons' }, id);
            refreshChrome();
            toast(`Icon “${rec.label}” added — not saved yet`);
        });
        if (file) takeFile(file);
        else setTimeout(() => drop.focus(), 30);
    }
    function renameIcon() {
        const ic = iconList().find(i => i && i.id === S.sel);
        if (!ic) return;
        const dlg = modal(`<h3>Rename “${esc(ic.id)}.svg”</h3><p>The picture gets the new name and every pin using it follows, when you save.</p>
            <div class="fld"><label for="ri-id">New file name</label><input id="ri-id" value="${esc(ic.id)}" autocomplete="off"></div><p id="ri-err" class="err"></p>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="ri-ok">Rename</button></div>`);
        const input = $('#ri-id', dlg);
        input.select();
        const go = async () => {
            const to = input.value.trim(), from = ic.id;
            if (to === from) { closeModal(); return; }
            const err = !ID_RE.test(to) ? 'Lowercase letters, digits, - and _ only.' : iconIds().includes(to) ? `“${to}” is already an icon.` : '';
            if (err) { $('#ri-err', dlg).textContent = err; return; }
            const oldPath = iconSrc(from), newPath = iconSrc(to);
            const text = typeof S.assets[oldPath] === 'string' ? S.assets[oldPath] : await io.read(oldPath);
            if (text === null) { $('#ri-err', dlg).textContent = `${oldPath} could not be read.`; return; }
            S.assets[newPath] = text; S.removals.delete(newPath);
            delete S.assets[oldPath]; S.thumbs.delete(oldPath);
            if (iconOnDisk(from)) S.removals.add(oldPath);
            const users = iconUsers(from);
            users.forEach(r => { r.map.icon = to; });
            ic.id = to; S.sel = to;
            closeModal(); edited(true); renderCrumbs();
            toast(`Renamed; ${users.length} pin${users.length === 1 ? '' : 's'} updated — not saved yet`);
        };
        $('#ri-ok', dlg).addEventListener('click', go);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    }
    function deleteIcon() {
        const icons = iconList(), i = icons.findIndex(x => x && x.id === S.sel);
        if (i < 0) return;
        const ic = icons[i], users = iconUsers(ic.id);
        if (users.length) { alertBox(`“${ic.label || ic.id}” is still in use`, `<p>Give these pins another icon first, so none loses its picture:</p><div>${chips(users.map(r => S.store.get(r.id)).filter(Boolean))}</div>`); return; }
        modal(`<h3>Delete “${esc(ic.label || ic.id)}”?</h3><p>It leaves the list, and <code>${esc(iconSrc(ic.id))}</code> is deleted from the folder when you save.</p>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn danger" id="di-ok">Delete</button></div>`);
        $('#di-ok').addEventListener('click', () => {
            const path = iconSrc(ic.id);
            icons.splice(i, 1);
            delete S.assets[path]; S.thumbs.delete(path);
            if (iconOnDisk(ic.id)) S.removals.add(path);
            S.sel = null;
            closeModal(); edited(true);
        });
    }
    function adoptIcon(id) {
        if (iconList().some(i => i && i.id === id)) return;
        iconList().push({ id, label: humanize(id) });
        rebuild();
        S.boardShown = null;
        select({ kind: 'single', key: 'mapIcons' }, id);
        refreshChrome();
    }

    /* =================================================================
       QUICK OPEN (Ctrl K): any record, any tool
       ================================================================= */
    function quickOpen() {
        const dlg = modal(`<div class="qo"><span class="material-symbols-outlined">search</span><input id="qo-in" placeholder="Find a record or a tool…" autocomplete="off"></div>
            <div id="qo-list" class="qo-list"></div>
            <p class="hint">↑ ↓ to choose · Enter to open · Esc to close</p>`, 'top');
        const input = $('#qo-in', dlg), list = $('#qo-list', dlg);
        // Each entry wears the colour of its workspace (of its group, for the tables)
        const col = colourOf;
        const all = [
            ...WS.map(w => ({ ws: w.id, name: w.label, sub: w.blurb || 'Start page', tag: 'Workspace', icon: w.icon, c: w.color })),
            ...Object.entries(TYPES).map(([k, d]) => ({ nav: `type:${k}`, name: d.plural || d.label, sub: `${WS_BY[wsOfDef(d)].label} · ${S.data[k].length} records`, tag: d.group, icon: d.icon, c: col(d) })),
            ...Object.entries(SINGLES).map(([k, d]) => ({ nav: `single:${k}`, name: d.label, sub: `${WS_BY[wsOfDef(d)].label} · ${d.file}`, tag: d.group, icon: d.icon, c: col(d) })),
            ...Object.entries(TYPES).flatMap(([t, d]) => S.data[t].map(r => ({ id: r.id, name: r.name || r.id, sub: subtitle(t, r), tag: d.label, icon: d.icon, c: col(d), hay: [r.name, r.id, ...(r.aliases || [])].join(' ').toLowerCase() }))),
        ];
        let items = [], at = 0;
        const draw = () => {
            const q = input.value.trim().toLowerCase();
            const tool = o => !!(o.nav || o.ws);
            items = (q ? all.filter(o => (o.hay || o.name.toLowerCase()).includes(q))
                .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || (tool(a) - tool(b)) * -1) : all.filter(tool)).slice(0, 60);
            at = Math.min(at, Math.max(0, items.length - 1));
            list.innerHTML = items.map((o, i) => `<div class="qo-i ${i === at ? 'on' : ''}" data-i="${i}" style="--c:${o.c}">
                <span class="qo-ic material-symbols-outlined">${esc(o.icon || 'description')}</span>
                <span class="qo-txt"><b>${esc(o.name)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
                <span class="qo-tag">${esc(o.ws ? 'Workspace' : o.nav ? 'Go to' : o.tag)}</span></div>`).join('') || '<p class="muted qo-none">No match.</p>';
            const on = $('.qo-i.on', list); if (on) on.scrollIntoView({ block: 'nearest' });
        };
        const go = i => {
            const o = items[i]; if (!o) return;
            closeModal();
            if (o.ws) goWs(o.ws);
            else if (o.nav) { const [kind, key] = o.nav.split(':'); openTool(kind, key); }
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
    // Opens a tool (a type or a one-object file) and, in it, a record (null: none)
    function select(view, id) {
        const sameTool = S.page !== 'home' && S.view.kind === view.kind && S.view.key === view.key;
        S.page = null;
        S.view = view; S.sel = id ?? null; S.menuCode = null;
        S.lastSel[`${view.kind}:${view.key}`] = S.sel;
        S.wsLast[curWs()] = { view, sel: S.sel };
        if (view.kind === 'type' && S.sel) {
            if (TYPES[view.key].place) S.store.ancestors(S.sel).forEach(a => S.open.add(a.id));
            S.recent = [{ type: view.key, id: S.sel }, ...S.recent.filter(x => !(x.type === view.key && x.id === S.sel))].slice(0, 12);
        }
        if (!sameTool) S.boardShown = null;
        renderAll();
        $('#editor').scrollTop = 0;
        const active = $('#list-items .li.active'); if (active) active.scrollIntoView({ block: 'nearest' });
    }
    function jump(id) {
        const type = typeOfId(id);
        if (type) { S.search = ''; $('#search').value = ''; select({ kind: 'type', key: type }, id); }
        closeModal();
    }
    // Alt ↑ / ↓: the previous / next record of the list (or grid, or gallery) as shown
    function step(dir) {
        if (S.page === 'home') return;
        const ids = isBoard() ? $$('#board [data-rec], #board [data-icon]').map(b => b.dataset.rec || b.dataset.icon)
            : isSingle() ? [] : $$('#list-items [data-select]').map(b => b.dataset.select);
        if (!ids.length) return;
        const i = ids.indexOf(S.sel);
        const j = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + dir));
        if (ids[j] !== S.sel) select(S.view, ids[j]);
    }
    function edited(structural) {
        if (structural) {
            rebuild();
            if (isBoard()) { renderBoard(true); $('#app').classList.toggle('no-sel', !S.sel); }
            renderEditor(); renderNav(); renderList(); refreshChrome();
            if (S.page === 'home') renderHome();
        }
        else scheduleRefresh();
    }
    function emptyFor(f) {
        const o = {};
        for (const [k, sf] of Object.entries(f.fields || {})) if (sf.kind === 'object' && !sf.optional) o[k] = emptyFor(sf);
        return o;
    }

    // The new-record dialog of a type (by default the open one)
    function newRecord(preset = {}, type = S.view.key) {
        const def = TYPES[type];
        if (!def) return;
        const current = S.view.key === type ? curRecord() : null;
        // "+ New" beside an open record: a child of it when it can hold one, else its sibling.
        // A POI holds other POIs only when it is an institution (or when asked: preset.parent).
        const holds = current && (def.parent || []).includes(typeOfId(current.id)) && (typeOfId(current.id) !== 'poi' || !!(current.institution && current.institution.kind));
        const guessParent = preset.parent || (current && def.place ? (holds ? current.id : current.parent) : '');
        const dlg = modal(`<h3>New ${lc(esc(def.label))}</h3>
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
            const err = !name.value.trim() ? 'Give it a name.' : !ID_RE.test(id) ? 'The id may contain lowercase letters, digits, - and _ only.' : allIds().has(id) ? `"${id}" is already used by a ${lc(TYPES[typeOfId(id)].label)}.` : (def.place && def.parent.length && !parent) ? 'Choose where it sits.' : '';
            if (err) { $('#nr-err', dlg).textContent = err; return; }
            const rec = { id, name: name.value.trim(), ...emptyFor(def) };
            if (parent) rec.parent = parent;
            const whereSel = $('#nr-where', dlg);
            if (whereSel && whereSel.value) rec.where = whereSel.value;
            if (type === 'notice') { rec.kind = 'job'; rec.status = 'open'; }
            if ((type === 'rumour' || type === 'notice' || type === 'prophecy') && curCampaign()) rec.campaigns = [curCampaign()];
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
            alertBox(`“${rec.name}” is still in use`, `<p>Change or remove these first, so no link breaks:</p><div>${chips(users.map(r => S.store.get(r.id)).filter(Boolean))}</div>`);
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
        const group = TYPES[type].place ? null : orderedRecords(type).find(g => g.recs.includes(rec));
        const recs = TYPES[type].place ? list.filter(r => (r.parent || '') === (rec.parent || '')) : group ? group.recs : list;
        const j = recs.indexOf(rec) + dir;
        if (j < 0 || j >= recs.length) return;
        const a = list.indexOf(rec), b = list.indexOf(recs[j]);
        [list[a], list[b]] = [list[b], list[a]];
        edited(true);
    }
    // Drag and drop in the list: moves the record in its file, so the site shows it there.
    // Only within its group (and, for POIs, among the places that sit in the same one).
    function sameShelf(type, a, b) {
        if (TYPES[type].place) return (a.parent || '') === (b.parent || ''); // the Atlas tree: siblings
        const ga = listGroup(type, a), gb = listGroup(type, b);
        if ((ga ? ga.key : '') !== (gb ? gb.key : '')) return false;
        return type !== 'poi' || (a.parent || '') === (b.parent || '');
    }
    function dropRecord(id, targetId, after) {
        const type = typeOfId(id), list = type && S.data[type];
        if (!list || typeOfId(targetId) !== type) return;
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
        items.push(null, { action: 'delete', icon: 'delete', label: `Delete this ${lc(def.label)}…`, danger: true });
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
        if (kind === 'csv') return el.value.split(',').map(v => v.trim()).filter(Boolean);
        if (kind === 'json') {
            try { const v = JSON.parse(el.value); el.classList.remove('invalid'); return v; }
            catch (e) { el.classList.add('invalid'); return Symbol.for('invalid'); }
        }
        return el.value;
    }
    const keyOf = el => { const p = JSON.parse(el.dataset.path); return [...p].reverse().find(k => typeof k === 'string'); };
    // The record an input writes to: a row of the grid, or the record open in the form
    function holderOf(el) {
        const row = el.closest && el.closest('#board [data-rec]');
        if (row) return S.view.kind === 'type' ? S.data[S.view.key].find(r => r.id === row.dataset.rec) || null : null;
        return $('#editor').contains(el) ? curRecord() : null;
    }
    document.addEventListener('input', e => {
        const el = e.target;
        if (el.id === 'search') { S.search = el.value; renderList(); return; }
        if (el.id === 'grid-q') { S.gridQ[S.view.key] = el.value; clearTimeout(S.gq); S.gq = setTimeout(renderGridBody, 120); return; }
        if (el.id === 'icon-q') { S.iconQ = el.value; renderIconGallery(); return; }
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
        const holder = holderOf(el);
        if (!el.dataset.path || !holder) return;
        const v = readValue(el);
        if (v === Symbol.for('invalid')) return;
        const path = JSON.parse(el.dataset.path);
        setAt(holder, path, v);
        if (path[path.length - 1] === 'cardIcon') { const cp = $('[data-card-prev]'); if (cp) cp.textContent = el.value.trim() || 'location_on'; }
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
        if (!el.dataset.path || !holderOf(el)) return;
        // a cell of the grid, on the record open beside it: the form follows
        const row = el.closest('#board [data-rec]');
        if (row) { if (row.dataset.rec === S.sel) renderEditor(); if (el.tagName === 'SELECT' || el.type === 'checkbox') edited(false); return; }
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
        // menus: arrows move between the items
        if (el.closest && el.closest('#menu') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const items = $$('#menu button:not(:disabled)'), i = items.indexOf(el);
            const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]; if (n) n.focus();
            return;
        }
        // the Atlas tree: Enter opens, ← → close / open, ↑ ↓ move
        if (el.matches && el.matches('#list-items [data-select][tabindex]') && !e.altKey && !e.ctrlKey) {
            const id = el.dataset.select, rows = $$('#list-items [data-select][tabindex]'), i = rows.indexOf(el);
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select({ kind: 'type', key: typeOfId(id) }, id); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) n.focus(); return; }
            if (e.key === 'ArrowRight' && el.hasAttribute('aria-expanded')) { e.preventDefault(); if (el.getAttribute('aria-expanded') === 'false') toggleTree(id, true); else if (rows[i + 1]) rows[i + 1].focus(); return; }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (el.getAttribute('aria-expanded') === 'true') toggleTree(id, false);
                else { const p = (S.store.get(id) || {}).parent, pe = p && $(`#list-items [data-select="${CSS.escape(p)}"]`); if (pe) pe.focus(); }
                return;
            }
        }
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); return; }
        if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); quickOpen(); return; }
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); step(e.key === 'ArrowUp' ? -1 : 1); return; }
        if (e.key === 'Escape') {
            const menu = $('#menu');
            if (menu) { closeMenu(); return; }
            if (!$('#modal').hidden) { closeModal(); return; }
            // a board: Esc closes the record open beside it
            if (isBoard() && S.sel && !(el.closest && el.closest('#board'))) { e.preventDefault(); closeSel(); }
        }
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
        const type = typeOfId(recDrag), a = S.store.get(recDrag), b = S.store.get(li.dataset.select);
        if (!a || !b || !type || typeOfId(b.id) !== type || !sameShelf(type, a, b)) return null;
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
    // Map icons: a picture dropped on the gallery opens the new-icon dialog
    document.addEventListener('dragover', e => {
        if (!recDrag && !drag && e.target.closest && e.target.closest('#board') && S.view.key === 'mapIcons' && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault();
    });
    document.addEventListener('drop', e => {
        if (recDrag || drag || !e.target.closest || !e.target.closest('#board') || S.view.key !== 'mapIcons' || !e.dataTransfer.files.length) return;
        e.preventDefault();
        newIconDialog({ file: e.dataTransfer.files[0] });
    });
    function closeSel() {
        S.sel = null;
        S.lastSel[`${S.view.kind}:${S.view.key}`] = null;
        S.wsLast[curWs()] = { view: S.view, sel: null };
        renderMain(); renderCrumbs();
    }

    document.addEventListener('click', e => {
        if (!e.target.closest('#menu') && !e.target.closest('[aria-haspopup="menu"], [data-action="more"]')) closeMenu();
        const t = e.target.closest('[data-ws],[data-tab],[data-icon],[data-nav],[data-select],[data-jump],[data-jump-single],[data-action],[data-sec]');
        // a row of the grid, outside its cells' controls: open it beside
        if (!t || t.matches('tr')) {
            const tr = e.target.closest('#board tr.rw');
            if (tr && !e.target.closest('input, select, textarea, button, a')) select(S.view, tr.dataset.rec);
            if (!t) return;
        }
        if (t.dataset.ws) { e.preventDefault(); closeModal(); goWs(t.dataset.ws); return; }
        if (t.dataset.tab) { openTool('type', t.dataset.tab); return; }
        if (t.dataset.icon) { select({ kind: 'single', key: 'mapIcons' }, t.dataset.icon === S.sel ? null : t.dataset.icon); return; }
        if (t.dataset.sec) { e.preventDefault(); const s = document.getElementById(t.dataset.sec); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        if (t.dataset.nav) { e.preventDefault(); closeModal(); const [kind, key] = t.dataset.nav.split(':'); openTool(kind, key); return; }
        if (t.dataset.select) {
            if (e.target.closest('[data-action="tree-toggle"]')) return; // (handled below)
            const id = t.dataset.select;
            const view = S.view.kind === 'type' && S.data[S.view.key].some(r => r.id === id) ? S.view : typeOfId(id) ? { kind: 'type', key: typeOfId(id) } : S.view;
            if (isBoard() && id === S.sel && t.matches('.open')) { closeSel(); return; }
            select(view, id); return;
        }
        if (t.dataset.jump) { e.preventDefault(); jump(t.dataset.jump); return; }
        if (t.dataset.jumpSingle) { e.preventDefault(); closeModal(); select({ kind: 'single', key: t.dataset.jumpSingle }); return; }
        const a = t.dataset.action;
        const path = t.dataset.path ? JSON.parse(t.dataset.path) : null;
        const rec = curRecord();
        if (t.closest('#menu')) closeMenu();
        switch (a) {
            case 'close-modal': closeModal(); break;
            case 'new': if (curWs() === 'atlas') { const ad = atlasAdd(); newRecord({ parent: ad.parent }, ad.type); } else newRecord(); break;
            case 'new-place': newRecord({ parent: t.dataset.parent }, t.dataset.type); break;
            case 'quick-new': newRecord({}, t.dataset.type); break;
            case 'tree-toggle': e.stopPropagation(); toggleTree(t.dataset.id); break;
            case 'camp': S.camp = t.dataset.camp; rememberUI(); renderNav(); renderList(); refreshChrome(); if (S.page === 'home') renderHome(); break;
            case 'show-issues': showIssues(false); break;
            case 'save': save(); break;
            case 'close-sel': closeSel(); break;
            case 'grid-sort': {
                const k = t.dataset.key, cur = S.gridSort[S.view.key];
                if (!cur || cur.key !== k) S.gridSort[S.view.key] = { key: k, dir: 1 };
                else if (cur.dir > 0) cur.dir = -1;
                else delete S.gridSort[S.view.key];
                renderBoard(true); break;
            }
            case 'sec-add': secAddMenu(t); break;
            case 'obj-add-block': {
                const key = t.dataset.key, f = curDef().fields[key];
                rec[key] = emptyFor(f);
                S.scrollTo = secId(f.section);
                edited(true); break;
            }
            case 'remove-block': removeBlock(t.dataset.key); break;
            case 'icon-pick': iconPicker(path); break;
            case 'go-icons': closeModal(); openTool('single', 'mapIcons'); break;
            case 'icon-new': newIconDialog(); break;
            case 'icon-replace': newIconDialog({ replace: S.sel }); break;
            case 'icon-rename': renameIcon(); break;
            case 'icon-delete': deleteIcon(); break;
            case 'icon-adopt': adoptIcon(t.dataset.id); break;
            case 'more': moreMenu(t); break;
            case 'toggle-side': S.sideToggled = !S.sideToggled; $('.ed-wrap').classList.toggle('side-toggled', S.sideToggled); $('#side-btn').classList.toggle('on', S.sideToggled); break;
            case 'card-side': S.cardSide = t.dataset.side; renderSide(); break;
            case 'add-here': {
                // "+ Rumour / + Notice" from a POI or settlement: open the new-record dialog on that type
                // (data-field: the field it fills, e.g. a new card's deck; default where)
                newRecord(t.dataset.type === 'poi' ? { parent: t.dataset.where } : { [t.dataset.field || 'where']: t.dataset.where }, t.dataset.type);
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
            case 'potion-brew': potionBrewer(rec); break;
            case 'potion-new': potionBrewer(null,
                t.dataset.recipe ? { recipe: JSON.parse(t.dataset.recipe), seed: t.dataset.seed }
                : t.dataset.part ? { part: t.dataset.part === 'principle' ? 'active' : t.dataset.part, id: rec.id } : null); break;
            case 'mark-find': potionBrewer(null, { mark: ($('#mark-in') || {}).value || '' }); break;
            case 'potion-import': potionImport(rec); break;
            case 'potion-refill': potionRefill(rec); break;
            case 'potion-clear': delete rec.potion; edited(true); toast('Potion removed (the card’s text is unchanged) — not saved yet'); break;
            case 'folio-import': folioImport(rec); break;
            case 'folio-big': folioBig(rec, t.dataset.which || 'spread'); break;
            case 'folio-export': folioExport(rec, t.dataset.what); break;
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
    $('#new-btn').addEventListener('click', () => {
        if (curWs() === 'atlas') { const ad = atlasAdd(); newRecord({ parent: ad.parent }, ad.type); }
        else newRecord();
    });
    $('#new-more').addEventListener('click', e => atlasAddMenu(e.currentTarget));
    $('#camp-btn').addEventListener('click', e => campMenu(e.currentTarget));
    $('#save-btn').addEventListener('click', save);
    $('#qo-btn').addEventListener('click', quickOpen);
    $('#issues-pill').addEventListener('click', () => showIssues(false));
    $('#collapse-btn').addEventListener('click', () => { $('#app').classList.toggle('list-collapsed'); rememberUI(); });
    $('#reload-btn').addEventListener('click', async () => {
        if (dirtyFiles().length && !confirm('Reload from disk and lose the unsaved changes?')) return;
        S.thumbs.clear(); S.assets = {}; S.removals.clear();
        await loadAll(); await listIcons(); S.loadedIcons = new Set(iconList().map(i => i && i.id));
        if (!isSingle() && S.sel && !S.data[S.view.key].some(r => r.id === S.sel)) S.sel = null;
        S.boardShown = null;
        renderAll();
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
        await listIcons();
        S.loadedIcons = new Set(iconList().map(i => i && i.id));
        $('#gate').hidden = true;
        $('#app').hidden = false;
        $('#brand').title = `Athenaeum · ${io.name()}`;
        await restoreUI();
        if (!S.camp) S.camp = S.store.settings.currentCampaign || 'all';
        renderAll();
        const active = $('#list-items .li.active');
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