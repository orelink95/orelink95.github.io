/* =====================================================================
   ATHENAEUM DASHBOARD
   ---------------------------------------------------------------------
   Everything on screen is generated from data/schema.js: the nav, the
   lists and the forms. Add a type or a field to the schema and it shows
   up here with no change to this file.

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
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae')
        .replace(/['’]/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

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

    // The linked folder is remembered between visits (IndexedDB).
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
        if (!TEST) kv.set('ui', { view: S.view, sel: S.sel, listCollapsed: $('#app').classList.contains('list-collapsed') });
    }
    async function restoreUI() {
        const ui = TEST ? null : await kv.get('ui');
        if (!ui || !ui.view) return;
        const known = ui.view.kind === 'single' ? SINGLES[ui.view.key] : TYPES[ui.view.key];
        if (!known) return;
        S.view = { kind: ui.view.kind, key: ui.view.key };
        S.sel = ui.view.kind === 'type' && S.data[ui.view.key].some(r => r.id === ui.sel) ? ui.sel : null;
        $('#app').classList.toggle('list-collapsed', !!ui.listCollapsed);
    }

    /* =================================================================
       STATE
       ================================================================= */
    const firstType = Object.keys(TYPES)[0];
    const S = {
        data: {},        // type -> working records (private fields merged in)
        singles: {},     // name -> working object
        base: {},        // file path -> serialized text as last loaded / saved
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
        sealed: new Map(),
        cardSide: 'front',   // item preview: 'front' or 'sheet'   // "type:id:key" -> the {text, password} its encrypted copy was made from
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
            else if (f && f.kind === 'map' && v && typeof v === 'object') v = tidy({ x: {}, y: {}, icon: {}, layer: {} }, v);
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
        if (!text) return rec[key] ? 'Encrypted copy present; its text is not on this computer (data/private.json).' : 'No secret.';
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
            toast(`Saved ${files.map(([p]) => p.split('/').pop()).join(', ')}`);
        } catch (e) {
            alertBox('Saving failed', `<p>${esc(e.message)}</p><p>Files written before the error are saved; the rest are not.</p>`);
        }
        refreshChrome();
    }

    /* =================================================================
       HELPERS
       ================================================================= */
    const isSingle = () => S.view.kind === 'single';
    const curDef = () => (isSingle() ? SINGLES[S.view.key] : TYPES[S.view.key]);
    const curRecord = () => (isSingle() ? S.singles[S.view.key] : (S.data[S.view.key] || []).find(r => r.id === S.sel) || null);
    const typeOfId = id => Object.keys(TYPES).find(t => S.data[t].some(r => r.id === id)) || null;
    const allIds = () => new Set(Object.values(S.data).flat().map(r => r.id));
    const recordErrors = (type, id) => S.issues.errors.filter(e => e.startsWith(`[${type}] ${id}.`) || e.startsWith(`[${type}] ${id}:`) || e.startsWith(`[private] ${id}.`) || e.startsWith(`[private] ${type} "${id}"`));
    const singleErrors = name => S.issues.errors.filter(e => e.startsWith(`[${name}]`));
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
    const nameOf = id => { const r = S.store && S.store.get(id); return r ? r.name : id; };
    const enumOpts = f => (f.enum ? S.store.enumOptions(f.enum) : (f.options || []).map(o => ({ id: o, label: o })));
    function subtitle(type, r) {
        const def = TYPES[type];
        if (def.place && r.parent) return nameOf(r.parent);
        if (type === 'npc') return r.role || '';
        if (type === 'faction') return r.stub ? 'stub' : (r.status || '');
        if (type === 'menuItem') return `${r.category || ''} · ${r.basePrice ?? '?'} cp`;
        if (type === 'service') return r.unit || '';
        return r.subtitle || '';
    }
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg; t.classList.add('show');
        clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
    }

    /* =================================================================
       MODAL
       ================================================================= */
    function modal(html, wide) {
        const m = $('#modal');
        m.innerHTML = `<div class="dlg${wide ? ' wide' : ''}">${html}</div>`;
        m.hidden = false;
        return m.firstElementChild;
    }
    function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
    function alertBox(title, body) {
        modal(`<h3>${esc(title)}</h3>${body}<div class="foot"><button class="btn primary" data-action="close-modal">OK</button></div>`);
    }
    function showIssues(fromSave) {
        const { errors } = S.issues;
        const items = errors.map(e => {
            const m = e.match(/^\[([a-zA-Z]+)\] ([^.:\s"]+)/);
            const target = m && TYPES[m[1]] ? `data-jump="${esc(m[2])}"` : m && SINGLES[m[1]] ? `data-jump-single="${esc(m[1])}"` : '';
            return `<li><a href="#" ${target}>${esc(e)}</a></li>`;
        }).join('');
        modal(`<h3>${errors.length} problem${errors.length === 1 ? '' : 's'} to fix${fromSave ? ' before saving' : ''}</h3>
            <p style="color:var(--ink-dim)">Nothing was saved. Click a line to open the record.</p>
            <ul class="issues">${items}</ul>
            <div class="foot"><button class="btn" data-action="close-modal">Close</button></div>`);
    }

    /* =================================================================
       NAV & LIST
       ================================================================= */
    // Menu colour of each group. A group added to the schema takes one of the spare colours.
    const GROUP_COLOURS = { Site: '#b4bac2', Places: '#6aa9fa', People: '#66c488', Library: '#b79cf5', Campaigns: '#f28b82', Taverns: '#f0a35e' };
    const SPARE_COLOURS = ['#4fd1c5', '#f48fb1', '#d4d86a'];
    function renderNav() {
        const entries = [
            ...Object.entries(TYPES).map(([key, d]) => ({ kind: 'type', key, d })),
            ...Object.entries(SINGLES).map(([key, d]) => ({ kind: 'single', key, d })),
        ];
        const groups = [...new Set(entries.map(e => e.d.group || 'Other'))];
        $('#nav').innerHTML = groups.map((g, i) => `
            <div class="nav-sec" style="--c:${GROUP_COLOURS[g] || SPARE_COLOURS[i % SPARE_COLOURS.length]}">
            <div class="nav-group">${esc(g)}</div>
            ${entries.filter(e => (e.d.group || 'Other') === g).map(e => `
                <button class="nav-btn ${S.view.kind === e.kind && S.view.key === e.key ? 'active' : ''}" data-nav="${e.kind}:${e.key}">
                    <span class="material-symbols-outlined">${esc(e.d.icon || 'description')}</span>
                    <span class="lbl">${esc(e.d.navLabel || e.d.plural || e.d.label)}</span>
                </button>`).join('')}
            </div>`).join('');
    }
    function renderList() {
        $('#new-btn').hidden = isSingle();
        $('#search').hidden = isSingle();
        if (isSingle()) {
            $('#list-items').innerHTML = `<p class="empty" style="padding:30px 12px">${esc(curDef().label)} is a single page of settings: edit it on the right.</p>`;
            return;
        }
        const type = S.view.key;
        const q = S.search.trim().toLowerCase();
        const recs = S.data[type].filter(r => !q || [r.id, r.name, ...(r.aliases || []), subtitle(type, r)].some(v => String(v || '').toLowerCase().includes(q)));
        $('#list-items').innerHTML = recs.map(r => {
            const bad = recordErrors(type, r.id).length;
            return `<button class="li ${r.id === S.sel ? 'active' : ''}" data-select="${esc(r.id)}">
                <span class="t">${esc(r.name || '(no name)')}</span>${bad ? `<span class="bad">● ${bad}</span>` : ''}
                <span class="s" style="display:block">${esc(subtitle(type, r))}</span>
            </button>`;
        }).join('') || `<p class="empty" style="padding:30px 12px">${q ? 'No match.' : 'Nothing yet: click + New.'}</p>`;
    }
    function refreshChrome() {
        const dirty = dirtyFiles();
        const pill = $('#save-pill');
        pill.textContent = dirty.length ? `${dirty.length} file${dirty.length === 1 ? '' : 's'} unsaved` : 'Saved';
        pill.className = 'pill ' + (dirty.length ? 'dirty' : 'ok');
        pill.title = dirty.map(([p]) => p).join('\n');
        const n = S.issues.errors.length;
        const ip = $('#issues-pill');
        ip.hidden = !n;
        ip.textContent = `${n} problem${n === 1 ? '' : 's'}`;
        ip.className = 'pill bad';
    }
    let refreshTimer = null;
    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { rebuild(); renderList(); renderSide(); refreshChrome(); updateHeader(); }, 250);
    }

    /* =================================================================
       FORM FIELDS
       ================================================================= */
    function fieldHtml(f, key, value, path) {
        const p = pathAttr(path);
        const label = esc(f.label || key) + (f.required ? ' *' : '') + (f.private ? ' <span title="Saved to data/private.json, never published">🔒</span>' : '');
        const help = f.help ? `<span class="help">${esc(f.help)}</span>` : '';
        const ck = JSON.stringify(path); // state key; esc() it inside attributes
        switch (f.kind) {
            case 'text':
            case 'url':
                return f.long
                    ? `<div class="fld wide"><label>${label}</label><textarea rows="3" data-path="${p}" data-kind="text">${esc(value)}</textarea>${help}</div>`
                    : `<div class="fld"><label>${label}</label><input data-path="${p}" data-kind="text" value="${esc(value)}">${help}</div>`;
            case 'number':
                return `<div class="fld"><label>${label}</label><input type="number" data-path="${p}" data-kind="number" value="${value ?? ''}">${help}</div>`;
            case 'boolean':
                return `<div class="fld chk"><input type="checkbox" id="cb-${esc(ck)}" data-path="${p}" data-kind="boolean" ${value ? 'checked' : ''}><label for="cb-${esc(ck)}">${label}</label></div>`;
            case 'enum':
                return `<div class="fld"><label>${label}</label><select data-path="${p}" data-kind="enum">
                    <option value="">—</option>
                    ${enumOpts(f).map(o => `<option value="${esc(o.id)}" ${o.id === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
                    ${value && !enumOpts(f).some(o => o.id === value) ? `<option value="${esc(value)}" selected>${esc(value)} (not in the list)</option>` : ''}
                </select>${help}</div>`;
            case 'markdown': {
                const open = S.previews.has(ck);
                return `<div class="fld wide"><div class="row" style="justify-content:space-between"><label>${label}</label>
                    <button class="btn icon" data-action="md-preview" data-key="${esc(ck)}" title="Preview">${open ? 'Hide preview' : 'Preview'}</button></div>
                    <div class="${open ? 'md-split' : ''}">
                        <textarea rows="${Math.min(18, Math.max(5, String(value || '').split('\n').length + 2))}" data-path="${p}" data-kind="markdown">${esc(value)}</textarea>
                        ${open ? `<div class="md-preview" data-preview="${esc(ck)}">${renderMd(value)}</div>` : ''}
                    </div>
                    <span class="help">Blank line = new paragraph · **bold** · *italic* · [text](url) · &gt; quote, with &gt; — Name on its last line</span>${help}</div>`;
            }
            case 'image':
                return `<div class="fld wide"><label>${label}</label><div class="row">
                    <img class="thumb" data-thumb="${esc(value)}" alt="">
                    <input data-path="${p}" data-kind="text" value="${esc(value)}" placeholder="images/…">
                    ${io === folderIO ? `<button class="btn" data-action="pick-image" data-path="${p}">Choose…</button>` : ''}
                </div>${help}</div>`;
            case 'list': {
                const arr = Array.isArray(value) ? value : [];
                return `<div class="fld wide"><label>${label}</label><div class="rows">
                    ${arr.map((v, i) => `<div class="row"><input data-path="${pathAttr([...path, i])}" data-kind="text" value="${esc(v)}">
                        <button class="btn icon" data-action="remove" data-path="${pathAttr([...path, i])}" title="Remove">✕</button></div>`).join('')}
                    <div><button class="btn ghost" data-action="list-add" data-path="${p}">+ Add</button></div>
                </div>${help}</div>`;
            }
            case 'ref':
                return `<div class="fld"><label>${label}</label>${refSelect(f.to, value, `data-path="${p}" data-kind="ref"`)}${help}</div>`;
            case 'refs': {
                const arr = Array.isArray(value) ? value : [];
                return `<div class="fld wide"><label>${label}</label><div class="rows">
                    ${arr.map((v, i) => `<div class="row">${refSelect(f.to, v, `data-path="${pathAttr([...path, i])}" data-kind="ref"`)}
                        <button class="btn icon" data-action="remove" data-path="${pathAttr([...path, i])}" title="Remove">✕</button></div>`).join('')}
                    <div><button class="btn ghost" data-action="list-add" data-path="${p}">+ Add</button></div>
                </div>${help}</div>`;
            }
            case 'map': {
                const m = value || {};
                return `<fieldset><legend class="fs-legend">${label}</legend><div class="fs-body">
                    <div class="fld" style="width:110px;min-width:0"><label>X</label><input type="number" data-path="${pathAttr([...path, 'x'])}" data-kind="number" value="${m.x ?? ''}"></div>
                    <div class="fld" style="width:110px;min-width:0"><label>Y</label><input type="number" data-path="${pathAttr([...path, 'y'])}" data-kind="number" value="${m.y ?? ''}"></div>
                    <div class="fld" style="width:200px;min-width:0"><label>Icon</label>${iconInput(m.icon, pathAttr([...path, 'icon']))}</div>
                    <div class="fld" style="width:160px;min-width:0"><label>Layer</label><select data-path="${pathAttr([...path, 'layer'])}" data-kind="enum"><option value="">—</option>
                        ${S.store.enumOptions('mapLayer').map(o => `<option ${o.id === m.layer ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select></div>
                    <div class="row" style="align-self:flex-end;gap:6px">
                        <button class="btn" data-action="place" data-path="${p}"><span class="material-symbols-outlined">add_location_alt</span> Place on the map</button>
                        ${value ? `<button class="btn icon" data-action="remove" data-path="${p}" title="Remove the pin">✕</button>` : ''}
                    </div>
                </div></fieldset>`;
            }
            case 'mapImage': {
                const m = value || {};
                return `<fieldset><legend class="fs-legend">${label}</legend><div class="fs-body">
                    <div class="fld wide"><label>Image</label><div class="row">
                        <img class="thumb" data-thumb="${esc(m.src)}" alt="">
                        <input data-path="${pathAttr([...path, 'src'])}" data-kind="text" value="${esc(m.src)}" placeholder="images/…">
                        ${io === folderIO ? `<button class="btn" data-action="pick-image" data-path="${pathAttr([...path, 'src'])}">Choose…</button>` : ''}
                    </div></div>
                    <div class="fld" style="width:130px;min-width:0"><label>Width (px)</label><input type="number" data-path="${pathAttr([...path, 'width'])}" data-kind="number" value="${m.width ?? ''}"></div>
                    <div class="fld" style="width:130px;min-width:0"><label>Height (px)</label><input type="number" data-path="${pathAttr([...path, 'height'])}" data-kind="number" value="${m.height ?? ''}"></div>
                    <div style="align-self:flex-end"><button class="btn" data-action="read-size" data-path="${p}">Read size from the image</button></div>
                </div></fieldset>`;
            }
            case 'object': {
                if (f.optional && (value === undefined || value === null)) {
                    return `<div class="fld wide"><button class="btn ghost" data-action="obj-add" data-path="${p}">+ ${esc(f.label || key)}</button>${help}</div>`;
                }
                const collapsed = S.collapsed.has(ck);
                return `<fieldset class="${collapsed ? 'collapsed' : ''}">
                    <legend class="fs-legend" data-action="collapse" data-key="${esc(ck)}">${collapsed ? '▸' : '▾'} ${label}</legend>
                    ${f.optional ? `<div style="text-align:right;margin-top:-8px"><button class="btn icon danger" data-action="remove" data-path="${p}">Remove ${esc((f.label || key).toLowerCase())}</button></div>` : ''}
                    <div class="fs-body">${help ? `<div class="fld wide">${help}</div>` : ''}
                        ${Object.entries(f.fields).map(([k, sf]) => fieldHtml(sf, k, (value || {})[k], [...path, k])).join('')}</div>
                </fieldset>`;
            }
            case 'objects': {
                const arr = Array.isArray(value) ? value : [];
                const collapsed = S.collapsed.has(ck);
                return `<fieldset class="${collapsed ? 'collapsed' : ''}">
                    <legend class="fs-legend" data-action="collapse" data-key="${esc(ck)}">${collapsed ? '▸' : '▾'} ${label} <span style="color:var(--ink-faint)">(${arr.length})</span></legend>
                    <div class="fs-body">
                        ${arr.map((item, i) => {
                    const ik = JSON.stringify([...path, i]);
                    const ic = S.collapsed.has(ik);
                    return `<div class="card ${ic ? 'collapsed' : ''}">
                                <div class="card-head" data-action="collapse" data-key="${esc(ik)}">
                                    <b>${ic ? '▸' : '▾'} ${esc((item && item[f.itemLabel]) || `Entry ${i + 1}`)}</b>
                                    <span class="row">
                                        <button class="btn icon" data-action="move" data-dir="-1" data-path="${pathAttr([...path, i])}" title="Up">↑</button>
                                        <button class="btn icon" data-action="move" data-dir="1" data-path="${pathAttr([...path, i])}" title="Down">↓</button>
                                        <button class="btn icon" data-action="remove" data-path="${pathAttr([...path, i])}" title="Remove">✕</button>
                                    </span>
                                </div>
                                <div class="fs-body">${Object.entries(f.fields).map(([k, sf]) => fieldHtml(sf, k, (item || {})[k], [...path, i, k])).join('')}</div>
                            </div>`;
                }).join('')}
                        <div><button class="btn ghost" data-action="list-add" data-path="${p}" data-object="1">+ Add</button></div>
                    </div>
                </fieldset>`;
            }
            case 'sealed': {
                const rec = curRecord();
                return `<div class="fld wide"><label>${label}</label><em>${esc(rec ? sealedStatus(f, rec, key) : '')}</em>
                    <span class="help">Written on save from “${esc((curDef().fields[f.from] || {}).label || f.from)}” and “${esc((curDef().fields[f.password] || {}).label || f.password)}”. Players see the secret only after typing the password (capitals don't matter).</span></div>`;
            }
            case 'json':
                return `<div class="fld wide"><label>${label} <span style="text-transform:none;letter-spacing:0">(JSON)</span></label>
                    <textarea class="mono" rows="10" data-path="${p}" data-kind="json">${esc(JSON.stringify(value ?? [], null, 2))}</textarea>${help}</div>`;
            default:
                return `<div class="fld wide"><label>${label}</label><em>Unknown field kind "${esc(f.kind)}"</em></div>`;
        }
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
        if (!S.icons) return `<input data-path="${p}" data-kind="text" value="${esc(value)}" placeholder="settlement">`;
        const has = !value || S.icons.includes(value);
        return `<select data-path="${p}" data-kind="enum"><option value="">—</option>
            ${S.icons.map(i => `<option ${i === value ? 'selected' : ''}>${esc(i)}</option>`).join('')}
            ${has ? '' : `<option selected value="${esc(value)}">⚠ ${esc(value)} (no such icon)</option>`}</select>`;
    }
    function renderMd(text) {
        const id = isSingle() ? null : S.sel;
        return S.store.autolink(S.store.md(text || '', { dropCap: true }), { exclude: id }) || '<em style="color:var(--ink-faint)">Nothing yet.</em>';
    }

    /* =================================================================
       EDITOR
       ================================================================= */
    function renderEditor() {
        rememberUI(); // every change of tool or record ends up here
        const ed = $('#editor');
        const def = curDef();
        const rec = curRecord();
        if (!rec) {
            ed.innerHTML = `<div class="empty">Select a record on the left, or click + New.</div>`;
            return;
        }
        let fieldsHtml = '';
        if (!isSingle()) {
            fieldsHtml += fieldHtml({ kind: 'text', label: 'Name', required: true }, 'name', rec.name, ['name']);
            fieldsHtml += fieldHtml({ kind: 'list', label: 'Other names (aliases; also turned into links)' }, 'aliases', rec.aliases, ['aliases']);
            if (def.place && def.parent.length) fieldsHtml += fieldHtml({ kind: 'ref', to: def.parent, label: 'Sits in', required: true }, 'parent', rec.parent, ['parent']);
        }
        fieldsHtml += Object.entries(def.fields).map(([k, f]) => fieldHtml(f, k, rec[k], [k])).join('');
        ed.innerHTML = `
            <div class="ed-head">
                <div class="grow">
                    <div class="kind">${esc(def.label)}</div>
                    <h2 id="ed-title">${esc(isSingle() ? def.label : rec.name || '(no name)')}</h2>
                    ${isSingle() ? `<code>${esc(def.file)}</code>` : `<code>id: ${esc(rec.id)} · ${esc(def.file)}</code>`}
                </div>
                <div class="ed-actions">${isSingle() ? '' : `
                    ${S.store.url(rec.id) ? `<a class="btn" href="../${esc(S.store.url(rec.id))}" target="_blank" rel="noopener">View on site</a>` : ''}
                    <button class="btn icon" data-action="move-record" data-dir="-1" title="Move up in the list">↑</button>
                    <button class="btn icon" data-action="move-record" data-dir="1" title="Move down in the list">↓</button>
                    <button class="btn" data-action="rename">Rename id</button>
                    <button class="btn danger" data-action="delete">Delete</button>`}
                </div>
            </div>
            <div class="ed-wrap">
                <div class="form">${fieldsHtml}</div>
                <aside class="side" id="side"></aside>
            </div>`;
        renderSide();
        loadThumbs();
    }
    function updateHeader() {
        const t = $('#ed-title');
        const rec = curRecord();
        if (t && rec && !isSingle()) t.textContent = rec.name || '(no name)';
    }
    function chips(list) {
        return list.map(r => `<span class="chip" data-jump="${esc(r.id)}">${esc(r.name)} <small>${esc(TYPES[S.store.typeOf(r)].label)}</small></span>`).join('');
    }
    function renderSide() {
        const side = $('#side');
        if (!side) return;
        const rec = curRecord();
        if (!rec) { side.innerHTML = ''; return; }
        const parts = [];
        const errs = isSingle() ? singleErrors(S.view.key) : recordErrors(S.view.key, rec.id);
        if (errs.length) parts.push(`<div class="box"><h4>To fix</h4><ul class="issues" style="margin:0;padding-left:16px">${errs.map(e => `<li>${esc(e.replace(/^\[[^\]]+\] /, ''))}</li>`).join('')}</ul></div>`);
        if (!isSingle()) {
            const crumbs = S.store.ancestors(rec.id);
            if (crumbs.length) parts.push(`<div class="box"><h4>Sits in</h4>${chips(crumbs)}</div>`);
            const kids = S.store.children(rec.id);
            if (kids.length) parts.push(`<div class="box"><h4>Contains (${kids.length})</h4>${chips(kids)}</div>`);
            const users = S.store.backrefs(rec.id);
            if (users.length) parts.push(`<div class="box"><h4>Used by (${users.length})</h4>${chips(users)}</div>`);
            if (S.view.key === 'poi' && rec.tavern && rec.tavern.tier && ATH.tavern) parts.push(menuPreview(rec));
            if (S.view.key === 'item' && ATH.lootCard) parts.unshift(cardPreview(rec), foundIn(rec));
        }
        side.innerHTML = parts.join('') || `<div class="box"><h4>Links</h4><span style="color:var(--ink-faint)">Nothing points here yet.</span></div>`;
        if (S.view.key === 'item') loadThumbs();
    }

    /* ---------- item cards: preview and where the party found them ---------- */
    function cardPreview(rec) {
        const item = S.store.get(rec.id) || rec;
        const sheet = S.cardSide === 'sheet';
        const card = sheet
            ? ATH.lootCard.sheet(item, S.store, { autolink: false })
            : ATH.lootCard.front(item, { tag: 'div', picture: src => `data-thumb="${esc(src)}"` });
        return `<div class="box card-prev">
            <div class="row" style="justify-content:space-between;align-items:center"><h4 style="margin:0">Card preview</h4>
                <span class="seg"><button data-action="card-side" data-side="front" class="${sheet ? '' : 'on'}">Front</button><button data-action="card-side" data-side="sheet" class="${sheet ? 'on' : ''}">Opened</button></span></div>
            <div class="card-prev__stage">${card}</div></div>`;
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
            ${opts ? `<div class="found-add"><select id="found-add"><option value="">Add to a session's loot…</option>${opts}</select>
                <button class="btn" data-action="found-add">Add</button></div>` : ''}
            <p style="color:var(--ink-faint);font-size:10.5px;margin:8px 0 0">Items from a campaign's newest session lie face down in the Vault until a player turns them over.</p></div>`;
    }
    function menuPreview(rec) {
        const poi = S.store.get(rec.id);
        if (!poi || !poi.tavern) return '';
        const code = S.menuCode ?? (S.store.settings.tavernCode || '');
        const menu = ATH.tavern.buildMenu(S.store, poi, code);
        return `<div class="box menu-prev"><h4>Menu preview</h4>
            <input id="menu-code" placeholder="Try a code (not saved)" value="${esc(S.menuCode ?? '')}" style="margin-bottom:6px">
            <div style="color:var(--ink-faint);font-size:10.5px;display:block">${esc(ATH.tavern.folioLabel(code, rec.id))}</div>
            ${menu.map(c => `<h5>${esc(c.label)}</h5>${c.items.map(i => `<div><span>${i.signature ? '✦ ' : ''}${esc(i.name)}</span><span>${esc(i.priceLabel)}</span></div>`).join('')}`).join('')}
            <p style="color:var(--ink-faint);font-size:10.5px;margin:8px 0 0">The live code is in Settings.</p></div>`;
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
            img.style.opacity = url ? 1 : 0.2;
        });
    }

    /* =================================================================
       ACTIONS
       ================================================================= */
    function select(view, id) {
        S.view = view; S.sel = id ?? null; S.menuCode = null;
        renderNav(); renderList(); renderEditor();
    }
    function jump(id) {
        const type = typeOfId(id);
        if (type) { S.search = ''; $('#search').value = ''; select({ kind: 'type', key: type }, id); }
        closeModal();
    }
    function edited(structural) {
        if (structural) { rebuild(); renderEditor(); renderList(); refreshChrome(); }
        else scheduleRefresh();
    }
    function emptyFor(f) {
        const o = {};
        for (const [k, sf] of Object.entries(f.fields || {})) if (sf.kind === 'object' && !sf.optional) o[k] = emptyFor(sf);
        return o;
    }

    function newRecord() {
        const type = S.view.key, def = TYPES[type];
        const current = curRecord();
        const guessParent = current && def.place ? ((def.parent || []).includes(typeOfId(current.id)) ? current.id : current.parent) : '';
        const dlg = modal(`<h3>New ${esc(def.label.toLowerCase())}</h3>
            <div class="form">
                <div class="fld wide"><label>Name</label><input id="nr-name" autofocus></div>
                <div class="fld wide"><label>Id (used in links; can be changed later with Rename id)</label><input id="nr-id"></div>
                ${def.place && def.parent.length ? `<div class="fld wide"><label>Sits in</label>${refSelect(def.parent, guessParent, 'id="nr-parent"')}</div>` : ''}
                ${type === 'item' ? `<div class="fld wide"><label>Found in (who can see the card)</label><select id="nr-found"><option value="">Nowhere yet</option>${foundOptions('', newestSessionOption())}</select></div>` : ''}
                <p id="nr-err" class="issues" style="color:var(--red)"></p>
            </div>
            <div class="foot"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="nr-ok">Create</button></div>`);
        const name = $('#nr-name', dlg), idIn = $('#nr-id', dlg);
        let touched = false;
        name.addEventListener('input', () => { if (!touched) idIn.value = slug(name.value); });
        idIn.addEventListener('input', () => { touched = true; });
        name.focus();
        $('#nr-ok', dlg).addEventListener('click', () => {
            const id = idIn.value.trim(), parent = $('#nr-parent', dlg) ? $('#nr-parent', dlg).value : undefined;
            const err = !name.value.trim() ? 'Give it a name.' : !ID_RE.test(id) ? 'The id may contain lowercase letters, digits, - and _ only.' : allIds().has(id) ? `"${id}" is already used by a ${TYPES[typeOfId(id)].label.toLowerCase()}.` : (def.place && def.parent.length && !parent) ? 'Choose where it sits.' : '';
            if (err) { $('#nr-err', dlg).textContent = err; return; }
            const rec = { id, name: name.value.trim(), ...emptyFor(def) };
            if (parent) rec.parent = parent;
            S.data[type].push(rec);
            const found = $('#nr-found', dlg);
            if (found && found.value) addFoundIn(id, found.value);
            closeModal();
            rebuild();
            select({ kind: 'type', key: type }, id);
            refreshChrome();
        });
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
            <p>Every link to it in the data files is updated. Bookmarks, and the campaign files that are not converted yet, keep the old id.</p>
            <div class="fld wide"><label>New id</label><input id="rn-id" value="${esc(rec.id)}"></div>
            <p id="rn-err" style="color:var(--red)"></p>
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
            rec.id = to; S.sel = to;
            closeModal(); edited(true);
            toast(`Renamed; ${count} link${count === 1 ? '' : 's'} updated`);
        });
    }

    function moveRecord(dir) {
        const list = S.data[S.view.key];
        const i = list.indexOf(curRecord()), j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        edited(true);
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
        const img = host && host.mapImage;
        if (!img || !img.src || !img.width || !img.height) {
            alertBox('No map to place on', `<p>${host ? `“${esc(host.name)}”` : 'The parent'} has no map image with a width and height yet.</p>`);
            return;
        }
        const cur = getAt(rec, path) || {};
        let pos = cur.x != null && cur.y != null ? [cur.y, cur.x] : [img.height / 2, img.width / 2];
        const dlg = modal(`<h3>Place “${esc(rec.name)}” on ${esc(host.name || 'the map')}</h3>
            <p style="color:var(--ink-dim);margin-top:-6px">Click the map or drag the gold pin. Other pins on this map are shown in white.</p>
            <div id="placer"></div>
            <div class="foot"><span id="placer-pos" style="margin-right:auto;color:var(--ink-dim)"></span>
                <button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" id="placer-ok">Use this position</button></div>`, true);
        const map = L.map($('#placer', dlg), { crs: L.CRS.Simple, minZoom: -3, maxZoom: 2, attributionControl: false });
        const bounds = [[0, 0], [img.height, img.width]];
        L.imageOverlay(await thumbUrl(img.src), bounds).addTo(map);
        map.fitBounds(bounds);
        const sibs = def.parent && def.parent.length
            ? Object.keys(TYPES).flatMap(t => TYPES[t].place ? S.data[t].filter(r => r.parent === rec.parent) : [])
            : S.data[S.view.key];
        sibs.filter(r => r !== rec && r.map && r.map.x != null).forEach(r =>
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
        if (kind === 'enum' || kind === 'ref') return el.value || undefined;
        if (kind === 'json') {
            try { const v = JSON.parse(el.value); el.classList.remove('invalid'); return v; }
            catch (e) { el.classList.add('invalid'); return Symbol.for('invalid'); }
        }
        return el.value;
    }
    document.addEventListener('input', e => {
        const el = e.target;
        if (el.id === 'search') { S.search = el.value; renderList(); return; }
        if (el.id === 'menu-code') { S.menuCode = el.value; clearTimeout(S.mt); S.mt = setTimeout(() => { renderSide(); const i = $('#menu-code'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); return; }
        if (!el.dataset.path || !$('#editor').contains(el)) return;
        const v = readValue(el);
        if (v === Symbol.for('invalid')) return;
        const path = JSON.parse(el.dataset.path);
        setAt(curRecord(), path, v);
        if (el.dataset.kind === 'markdown') {
            const prev = document.querySelector(`[data-preview="${CSS.escape(JSON.stringify(path))}"]`);
            if (prev) { clearTimeout(S.pt); S.pt = setTimeout(() => { prev.innerHTML = renderMd(el.value); }, 200); }
        }
        if (el.closest('.row') && el.closest('.row').querySelector('img[data-thumb]') && el.dataset.kind === 'text') {
            const img = el.closest('.row').querySelector('img[data-thumb]');
            img.dataset.thumb = el.value; clearTimeout(S.tt); S.tt = setTimeout(loadThumbs, 400);
        }
        edited(false);
    });
    document.addEventListener('change', e => {
        const el = e.target;
        if (el.dataset.path && $('#editor').contains(el) && (el.tagName === 'SELECT' || el.type === 'checkbox')) edited(false);
    });
    document.addEventListener('click', e => {
        const t = e.target.closest('[data-nav],[data-select],[data-jump],[data-jump-single],[data-action]');
        if (!t) return;
        if (t.dataset.nav) { const [kind, key] = t.dataset.nav.split(':'); S.search = ''; $('#search').value = ''; select({ kind, key }, null); return; }
        if (t.dataset.select) { select(S.view, t.dataset.select); return; }
        if (t.dataset.jump) { e.preventDefault(); jump(t.dataset.jump); return; }
        if (t.dataset.jumpSingle) { e.preventDefault(); closeModal(); select({ kind: 'single', key: t.dataset.jumpSingle }); return; }
        const a = t.dataset.action;
        const path = t.dataset.path ? JSON.parse(t.dataset.path) : null;
        const rec = curRecord();
        switch (a) {
            case 'close-modal': closeModal(); break;
            case 'card-side': S.cardSide = t.dataset.side; renderSide(); break;
            case 'found-add': {
                const where = $('#found-add') && $('#found-add').value;
                if (where && addFoundIn(rec.id, where)) { edited(true); renderSide(); toast('Added: save to publish'); }
                break;
            }
            case 'collapse': {
                if (e.target.closest('button')) return;
                const k = t.dataset.key;
                S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k);
                renderEditor(); break;
            }
            case 'md-preview': S.previews.has(t.dataset.key) ? S.previews.delete(t.dataset.key) : S.previews.add(t.dataset.key); renderEditor(); break;
            case 'list-add': {
                const arr = getAt(rec, path);
                const item = t.dataset.object ? {} : '';
                if (Array.isArray(arr)) arr.push(item); else setAt(rec, path, [item]);
                edited(true); break;
            }
            case 'remove': {
                const parentPath = path.slice(0, -1), last = path[path.length - 1];
                const holder = parentPath.length ? getAt(rec, parentPath) : rec;
                if (Array.isArray(holder)) holder.splice(last, 1); else delete holder[last];
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
            case 'rename': renameRecord(); break;
            case 'delete': deleteRecord(); break;
        }
    });
    $('#new-btn').addEventListener('click', newRecord);
    $('#save-btn').addEventListener('click', save);
    $('#issues-pill').addEventListener('click', () => showIssues(false));
    $('#collapse-btn').addEventListener('click', () => { $('#app').classList.toggle('list-collapsed'); rememberUI(); });
    $('#reload-btn').addEventListener('click', async () => {
        if (dirtyFiles().length && !confirm('Reload from disk and lose the unsaved changes?')) return;
        S.thumbs.clear();
        await loadAll(); renderList(); renderEditor(); refreshChrome();
        toast('Reloaded from disk');
    });
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
        if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
    });
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
    boot().finally(() => { $('#gate').style.visibility = ''; $('#reopen-btn').focus(); });
})();