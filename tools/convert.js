#!/usr/bin/env node
/* =====================================================================
   ONE-SHOT CONVERSION  —  legacy scripts/*.js  ->  data/*.json
   ---------------------------------------------------------------------
   Pass 1 scope: places (continents, countries, settlements, districts,
   POIs), NPCs, factions, and the tavern menu pool / services.
   Tomes, handouts, bestiary, heroes and campaigns follow in pass 2.

   Usage (repo root):  node tools/convert.js
   Writes data/<type>.json and data/private.json, then prints every
   reference it could not resolve. It never guesses: an unresolved
   reference is left empty and listed, to be fixed by hand once.
   The legacy files are read, never modified.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, loadCore } = require('./lib/core');
const seedTaverns = require('./seed/taverns');
const fixes = require('./seed/fixes');
const legacyPages = require('./seed/legacy-pages');

const ATH = loadCore();
const schema = ATH.schema;
const report = { resolved: [], unresolved: [], created: [], notes: [] };

/* ---------- legacy sources ---------- */
function loadLegacy() {
    const ctx = { window: {} };
    ctx.window = ctx;
    vm.createContext(ctx);
    const files = ['atlas-registry', 'continent-registry', 'country-registry', 'settlement-registry', 'almanach', 'factions-data'];
    const src = files.map(f => fs.readFileSync(path.join(ROOT, 'scripts', f + '.js'), 'utf8')).join('\n;\n') +
        '\n;Object.assign(globalThis, { allMarkersData, continentMarkersData, countryRegistry, settlementRegistry, npcAlmanach, factionsData });';
    vm.runInContext(src, ctx);
    return ctx;
}
const L = loadLegacy();

/* ---------- helpers ---------- */
const cleanPath = p => (typeof p === 'string' ? p.trim().replace(/^\.\//, '') : p);
/* Local image that does not exist -> dropped (the page shows its default instead). */
function image(p, where) {
    const src = cleanPath(p);
    if (!src || /^(https?:)?\/\//.test(src)) return src || undefined;
    if (fs.existsSync(path.join(ROOT, src))) return src;
    report.notes.push(`${where}: image "${src}" does not exist; left empty`);
    return undefined;
}
const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
const slug = s => String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/æ/g, 'ae')
    .replace(/['’]/g, '').replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isPlaceholder = s => !s || /^\s*\?+\s*$/.test(s);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => s.replace(/&(#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCharCode(+e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? m));

/* HTML (as found in the legacy bodies) -> Markdown. */
const seenTags = new Set();
function htmlToMd(html, where) {
    if (!html || !String(html).trim()) return undefined;
    let s = String(html).replace(/\r\n?/g, '\n');
    // "<p>Cute lil town</p>." -> keep the stray punctuation inside the paragraph
    s = s.replace(/<\/p>\s*([.,;:!?]+)/gi, '$1</p>');

    // Pull-quote block: <div …><span>format_quote</span><p>"…"</p><span>— Name</span></div>
    s = s.replace(/<div[^>]*>\s*<span[^>]*>\s*format_quote\s*<\/span>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi,
        (_, q, who) => `\n\n> ${q.trim().replace(/\s+/g, ' ')}\n> ${who.trim().replace(/\s+/g, ' ')}\n\n`);
    // Drop caps: <span class="float-left …">X</span> -> X (and glue "T he" back to "The")
    s = s.replace(/<span[^>]*float-left[^>]*>\s*([^<]*?)\s*<\/span>\s*(?=[a-zà-ÿ])/g, '$1');
    s = s.replace(/<span[^>]*float-left[^>]*>\s*([^<]*?)\s*<\/span>/g, '$1');
    // Keyword spans: the store's autolink does this now.
    s = s.replace(/<span[^>]*class="kw-[^"]*"[^>]*>([\s\S]*?)<\/span>/g, '$1');
    s = s.replace(/<span[^>]*font-(?:semibold|bold)[^>]*>([\s\S]*?)<\/span>/g, '**$1**');
    s = s.replace(/<br\s*\/?>\s*/gi, '  \n');
    s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
    s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
    s = s.replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => `[${t.trim()}](${href === 'continent.html' ? 'continent.html?id=maltona' : href})`);
    s = s.replace(/<\/?p[^>]*>/gi, '\n\n');
    s = s.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, tag) => { seenTags.add(`${tag} (${where})`); return ''; });
    s = decode(s)
        .split('\n').map(l => l.replace(/\s+$/, m => (m.length >= 2 && m.startsWith('  ') && !/^\s*$/.test(l) ? '  ' : '')).replace(/^\s+/, '')).join('\n')
        .replace(/\n{3,}/g, '\n\n').trim();
    return s || undefined;
}

/* Key order: base keys, then schema order. Empty values are dropped. */
function tidy(type, rec) {
    const fields = schema.types[type].fields;
    const order = ['id', 'name', 'aliases', 'parent', ...Object.keys(fields)];
    const out = {};
    const empty = v => v === undefined || v === null || v === '' || v === false ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
    for (const k of order) if (!empty(rec[k])) out[k] = rec[k];
    for (const k of Object.keys(rec)) if (!(k in out) && !empty(rec[k]) && !order.includes(k)) report.notes.push(`${type} ${rec.id}: dropped unknown key "${k}"`);
    return out;
}
const iconExists = name => fs.existsSync(path.join(ROOT, 'images/atlas_icons', name + '.svg'));
const mapPin = (m, layer) => {
    const pin = { x: m.x, y: m.y };
    if (m.icon) {
        pin.icon = (fixes.pinIcons || {})[m.title] || m.icon;
        if (pin.icon !== m.icon) report.resolved.push(`pin "${m.title}": icon "${m.icon}" -> "${pin.icon}" (decided 1 Nov)`);
        m = { ...m, icon: pin.icon };
        // GitHub Pages is case-sensitive: "Verdena" does not find verdena.svg there.
        if (!iconExists(m.icon) && iconExists(m.icon.toLowerCase())) {
            pin.icon = m.icon.toLowerCase();
            report.notes.push(`pin "${m.title}": icon "${m.icon}" -> "${pin.icon}" (file name case; broken on GitHub Pages)`);
        } else if (!iconExists(m.icon)) {
            report.unresolved.push(`pin "${m.title}": icon "${m.icon}" has no images/atlas_icons/${m.icon}.svg`);
        }
    }
    if (layer || m.layer) pin.layer = layer || m.layer;
    return pin;
};

/* ---------- output buckets ---------- */
const out = Object.fromEntries(Object.keys(schema.types).map(t => [t, []]));
const ids = new Map(); // id -> type, for global uniqueness
function add(type, rec) {
    let id = rec.id;
    if (ids.has(id)) {
        const base = id;
        id = `${base}-${type}`;
        report.notes.push(`${type} "${base}": id already used by a ${ids.get(base)}, renamed to "${id}"`);
        rec.id = id;
    }
    ids.set(id, type);
    out[type].push(rec);
    return rec;
}
const findByName = (types, name) => {
    const n = norm(name);
    for (const t of types) {
        const hit = out[t].find(r => norm(r.name) === n || (r.aliases || []).some(a => norm(a) === n));
        if (hit) return hit;
    }
    return null;
};

/* ---------- world (lore + map that were hard-coded in atlas-scripts.js) ---------- */
function legacyWorld() {
    const w = legacyPages.world;
    return { name: 'Eraldom', codex: w.entry, loreTitle: w.title, body: htmlToMd(w.body, 'world'), mapImage: w.map };
}
const world = legacyWorld();

/* ---------- continents (world map markers) ---------- */
for (const m of L.allMarkersData) {
    add('continent', {
        id: m.id, name: m.title, subtitle: m.subtitle, codex: m.entry,
        body: htmlToMd(m.body, `continent ${m.id}`),
        map: mapPin(m, m.layer), danger: !!m.isDanger,
        mapImage: legacyPages.continentMaps[m.id],
        ...(fixes.continentPages[m.id] || {}),
    });
    if (fixes.continentPages[m.id]) report.notes.push(`continent ${m.id}: era, info cards, notables and epigraph taken from continent.html`);
}
report.notes.push('continent maltona: map image as hard-coded in the old continent-scripts.js');

/* ---------- countries (continent markers + country registry) ---------- */
const continentOf = name => {
    const c = findByName(['continent'], name);
    if (!c) report.unresolved.push(`country: continent "${name}" not found`);
    return c ? c.id : undefined;
};
const countryIds = new Set([...L.continentMarkersData.map(m => m.id), ...Object.keys(L.countryRegistry)]);
for (const id of countryIds) {
    const marker = L.continentMarkersData.find(m => m.id === id);
    const reg = L.countryRegistry[id];
    const aliases = new Set(reg ? reg.aliases || [] : []);
    if (marker && reg && marker.title !== reg.regionName) aliases.add(marker.title);
    add('country', {
        id,
        name: reg ? reg.regionName : marker.title,
        aliases: [...aliases],
        parent: reg ? continentOf(reg.continentName) : 'maltona',
        shortName: marker && reg && marker.title !== reg.regionName ? marker.title : undefined,
        subtitle: marker ? marker.subtitle : undefined,
        summary: reg ? (reg.description || '').trim() : undefined,
        codex: reg && reg.defaultLore ? reg.defaultLore.entry : undefined,
        loreTitle: reg && reg.defaultLore ? reg.defaultLore.title : undefined,
        body: reg && reg.defaultLore ? htmlToMd(reg.defaultLore.body, `country ${id}`) : undefined,
        epithet: fixes.countryEpithets[id],
        unlisted: fixes.unlistedCountries.includes(id),
        danger: marker ? !!marker.isDanger : false,
        map: marker ? mapPin(marker, marker.layer) : undefined,
        mapImage: reg && reg.mapImage ? { src: cleanPath(reg.mapImage), width: reg.mapWidth, height: reg.mapHeight } : undefined,
    });
    if (!reg) report.notes.push(`country ${id}: on the continent map only (no country page data yet)`);
}

for (const c of fixes.extraCountries) {
    add('country', { ...c });
    report.created.push(`country ${c.id}: listed in continent.html's nations list, absent from the data`);
}

/* ---------- settlements (settlement registry + their country pins) ---------- */
const countryPins = [];
for (const [cid, c] of Object.entries(L.countryRegistry)) for (const p of c.pins || []) countryPins.push({ ...p, country: cid });

for (const [id, s] of Object.entries(L.settlementRegistry)) {
    const countryId = (String(s.countryId || '').match(/id=([^&]+)/) || [])[1];
    const parent = countryId && out.country.find(c => c.id === countryId) ? countryId : (findByName(['country'], s.countryName) || {}).id;
    if (!parent) report.unresolved.push(`settlement ${id}: country "${s.countryName}" not found`);
    const pin = countryPins.find(p => p.linkId === id);
    if (pin) pin.used = true;
    else report.notes.push(`settlement ${id}: no pin on its country map`);
    add('settlement', {
        id, name: s.settlementName, aliases: s.aliases, parent,
        subtitle: pin ? pin.subtitle : undefined,
        codex: pin ? pin.entry : undefined,
        summary: (s.descriptor || '').trim(),
        body: pin ? htmlToMd(pin.body, `settlement ${id}`) : undefined,
        danger: pin ? !!pin.isDanger : false,
        map: pin ? mapPin(pin) : undefined,
    });
}

/* Country pins that point at no settlement become POIs of the country. */
for (const pin of countryPins.filter(p => !p.used)) {
    if (pin.linkId && !fixes.pinAsPoi.includes(pin.linkId)) report.unresolved.push(`country pin "${pin.title}": linkId "${pin.linkId}" matches no settlement`);
    const rec = add('poi', {
        id: slug(pin.title), name: pin.title, aliases: pin.aliases, parent: pin.country,
        subtitle: pin.subtitle, codex: pin.entry, body: htmlToMd(pin.body, `pin ${pin.title}`),
        danger: !!pin.isDanger, featured: !!pin.isFeatured, safe: !!pin.isSafe,
        image: cleanPath(pin.image), map: mapPin(pin),
    });
    report.created.push(`poi ${rec.id}: from the ${pin.country} country-map pin "${pin.title}"${pin.linkId ? ` (broken linkId "${pin.linkId}", audit fix #4)` : ''}`);
}

/* ---------- districts and their POIs ---------- */
const districtNpcs = new Map(); // npc id -> district id that lists them
for (const [sid, s] of Object.entries(L.settlementRegistry)) {
    for (const d of s.districts || []) {
        const lore = d.lore || {};
        const name = (lore.title || d.name || '').trim();
        const dist = add('district', {
            id: d.id, name, aliases: d.aliases, parent: sid,
            shortName: d.name && d.name !== name && d.name !== 'main' ? d.name : undefined,
            codex: lore.entry, body: htmlToMd(lore.body, `district ${d.id}`),
            mapImage: d.mapImage ? { src: cleanPath(d.mapImage), width: d.mapWidth, height: d.mapHeight } : undefined,
        });
        if (/placeholder/.test(d.mapImage || '')) report.notes.push(`district ${dist.id}: map image is a placeholder (${cleanPath(d.mapImage)})`);
        for (const npcId of d.npcs || []) districtNpcs.set(npcId, dist.id);
        for (const p of d.pins || []) {
            const seed = seedTaverns.taverns[p.title];
            add('poi', {
                id: slug(p.title), name: p.title, aliases: p.aliases, parent: dist.id,
                subtitle: p.subtitle, codex: p.entry, body: htmlToMd(p.body, `poi ${p.title}`),
                image: cleanPath(p.image || p.images) || (seed && seed.image) || undefined,
                danger: !!p.isDanger, featured: !!p.isFeatured, safe: !!p.isSafe,
                map: mapPin(p),
                tavern: seed ? { ...seed.tavern } : undefined,
            });
            if (seed && seed.image && !p.image) report.notes.push(`poi ${slug(p.title)}: image set to ${seed.image} (was empty on the pin)`);
        }
    }
}

/* ---------- factions (+ stubs for names used but never written up) ---------- */
function factionRef(name, where) {
    if (isPlaceholder(name) || /^independent$/i.test(name)) return undefined;
    let f = findByName(['faction'], name);
    if (!f) {
        f = add('faction', { id: slug(name), name: name.trim(), stub: true });
        report.created.push(`faction ${f.id}: stub for "${name}" (named by ${where})`);
    } else if (norm(f.name) !== norm(name) || f.name !== name.trim()) {
        if (!(f.aliases || []).includes(name.trim()) && f.name !== name.trim()) report.resolved.push(`${where}: "${name}" -> faction ${f.id}`);
    }
    return f.id;
}
for (const f of L.factionsData) {
    const qf = f.quickFacts || {};
    add('faction', {
        id: f.id, name: f.name, crest: cleanPath(f.crest), status: f.status, quote: f.quote,
        reputation: f.reputation, reputationText: f.reputationText,
        base: qf.base, scale: qf.scale, mo: qf.mo, threatLevel: qf.threatLevel,
        assets: f.assets, directives: f.directives, rumors: f.rumors, intel: f.intel,
        _allies: (f.relationships || {}).allies || [], _rivals: (f.relationships || {}).rivals || [],
    });
}
for (const f of out.faction.filter(x => !x.stub)) {
    f.allies = f._allies.map(n => factionRef(n, `faction ${f.id} allies`)).filter(Boolean);
    f.rivals = f._rivals.map(n => factionRef(n, `faction ${f.id} rivals`)).filter(Boolean);
    delete f._allies; delete f._rivals;
}

/* ---------- NPCs ---------- */
const privateOut = { npc: {} };
const relations = ATH.createStore(schema, {}, {}).enumValues('relation');
const almanach = { ...L.npcAlmanach };
for (const [id, npc] of Object.entries(fixes.extraNpcs)) {
    if (!almanach[id]) { almanach[id] = npc; report.created.push(`npc ${id}: restored from the deleted almanach2.js (audit fix #5)`); }
}
for (const [id, n] of Object.entries(almanach)) {
    let home;
    if (!isPlaceholder(n.homePinTitle) && n.homePinTitle) {
        const hit = findByName(['poi', 'district', 'settlement', 'country'], n.homePinTitle);
        if (hit) {
            home = hit.id;
            if (hit.name !== n.homePinTitle) report.resolved.push(`npc ${id}: home "${n.homePinTitle}" -> ${hit.id} ("${hit.name}")`);
        } else if (fixes.npcWhereabouts[n.homePinTitle]) {
            report.resolved.push(`npc ${id}: "${n.homePinTitle}" is not a place on the site; kept as whereabouts`);
        } else {
            report.unresolved.push(`npc ${id}: home "${n.homePinTitle}" matches no place`);
        }
    }
    const listedIn = districtNpcs.get(id);
    if (!home && listedIn) {
        home = listedIn;
        report.resolved.push(`npc ${id}: no usable home pin; home set to district ${listedIn}, which lists them`);
    } else if (home && listedIn) {
        const homeRec = out.poi.find(p => p.id === home) || out.district.find(d => d.id === home);
        const homeDistrict = homeRec && (homeRec.id === listedIn || homeRec.parent === listedIn);
        if (!homeDistrict) report.unresolved.push(`npc ${id}: home ${home} is not in district ${listedIn}, which lists them`);
    }
    districtNpcs.delete(id);

    let relation = n.relationToParty;
    if (relation && !relations.includes(relation)) {
        report.unresolved.push(`npc ${id}: relation "${relation}" not in the list; left empty`);
        relation = undefined;
    }
    add('npc', {
        id, name: n.name, role: isPlaceholder(n.role) ? undefined : n.role,
        quote: isPlaceholder(n.quote) ? undefined : n.quote,
        portrait: image(n.image, `npc ${id} portrait`), avatar: image(n.avatar, `npc ${id} avatar`),
        home, whereabouts: fixes.npcWhereabouts[n.homePinTitle], species: n.species, age: isPlaceholder(n.age) ? undefined : n.age, gender: n.gender,
        factions: fixes.npcFactions[id] || [factionRef(n.affiliation || '', `npc ${id}`)].filter(Boolean),
        relation, biography: htmlToMd(n.biography, `npc ${id}`),
    });
    if (n.secrets && n.secrets.trim()) privateOut.npc[id] = { secrets: htmlToMd(n.secrets, `npc ${id} secrets`) };
    if (fixes.npcFactions[id]) report.resolved.push(`npc ${id}: factions set to ${fixes.npcFactions[id].join(', ')} (decided 1 Nov)`);
    else if (isPlaceholder(n.affiliation) && n.affiliation) report.notes.push(`npc ${id}: affiliation "${n.affiliation}" left unknown`);
}
for (const [npcId, distId] of districtNpcs) report.unresolved.push(`district ${distId}: lists npc "${npcId}", who does not exist`);

/* ---------- tavern pool and services ---------- */
for (const item of seedTaverns.pool) add('menuItem', { ...item });
for (const s of seedTaverns.services) add('service', { ...s });
for (const name of Object.keys(seedTaverns.taverns)) {
    if (!out.poi.find(p => p.name === name)) report.unresolved.push(`tavern "${name}": no POI with that name`);
}

/* ---------- write ---------- */
for (const [type, list] of Object.entries(out)) {
    const file = path.join(ROOT, schema.types[type].file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(list.map(r => tidy(type, r)), null, 2) + '\n');
}
const writeSingleton = (name, obj) => {
    const fields = schema.singletons[name].fields;
    const out = {};
    for (const k of Object.keys(fields)) if (obj[k] !== undefined && obj[k] !== '') out[k] = obj[k];
    fs.writeFileSync(path.join(ROOT, schema.singletons[name].file), JSON.stringify(out, null, 2) + '\n');
};
writeSingleton('world', world);
fs.writeFileSync(path.join(ROOT, schema.singletons.settings.file), JSON.stringify(fixes.settings, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'data/private.json'), JSON.stringify(privateOut, null, 2) + '\n');

/* ---------- report ---------- */
const section = (title, items) => items.length && console.log(`\n${title} (${items.length})\n` + items.map(i => '  - ' + i).join('\n'));
console.log('Wrote: ' + Object.entries(out).map(([t, l]) => `${l.length} ${t}`).join(', ') +
    `, private overlay for ${Object.keys(privateOut.npc).length} npc(s)`);
section('Unresolved — fix by hand', report.unresolved);
section('Created', report.created);
section('Resolved by name', report.resolved);
section('Notes', [...report.notes, ...[...seenTags].map(t => `HTML tag stripped: ${t}`)]);
