#!/usr/bin/env node
/* Checks every data file against data/schema.js.
   Usage (from the repo root):  node tools/validate.js [--quiet]
   Exit code 1 when there are errors, so it can guard a commit or CI. */
const { loadStore } = require('./lib/core');

const quiet = process.argv.includes('--quiet');
const { ATH, store, problems, hasPrivate } = loadStore();
const { errors, warnings } = store.validate();
errors.unshift(...problems);

/* Local image paths that point at no file (Node only: the browser can't list files). */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./lib/core');
function eachImage(fields, obj, where, fn) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, f] of Object.entries(fields || {})) {
        const v = obj[k];
        if (v === undefined || v === null) continue;
        if (f.kind === 'image' && typeof v === 'string') fn(v, `${where}.${k}`);
        else if (f.kind === 'mapImage' && v.src) fn(v.src, `${where}.${k}.src`);
        else if (f.kind === 'map' && v.icon) fn(`images/atlas_icons/${v.icon}.svg`, `${where}.${k}.icon`);
        else if (f.kind === 'object') eachImage(f.fields, v, `${where}.${k}`, fn);
        else if (f.kind === 'objects' && Array.isArray(v)) v.forEach((o, i) => eachImage(f.fields, o, `${where}.${k}[${i}]`, fn));
    }
}
for (const [name, def] of Object.entries(ATH.schema.singletons || {})) {
    eachImage(def.fields, store.singletons[name], `[${name}]`, (src, where) => {
        if (!fs.existsSync(path.join(ROOT, src))) warnings.push(`${where}: image "${src}" not found`);
    });
}
for (const [type, def] of Object.entries(ATH.schema.types)) {
    for (const rec of store.all(type)) {
        eachImage(def.fields, rec, `[${type}] ${rec.id}`, (src, where) => {
            if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return;
            if (!fs.existsSync(path.join(ROOT, src.replace(/^\//, '')))) warnings.push(`${where}: image "${src}" not found`);
        });
    }
}

const counts = Object.keys(ATH.schema.types)
    .map(t => `${store.all(t).length} ${t}`)
    .join(', ');
console.log(`Loaded: ${counts}${hasPrivate ? ' + private overlay' : ' (no data/private.json)'}`);

if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    errors.forEach(e => console.log('  ✗ ' + e));
}
if (warnings.length && !quiet) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach(w => console.log('  ! ' + w));
}
if (!errors.length) console.log(`\nOK${warnings.length ? ` (${warnings.length} warning(s))` : ''}`);
process.exit(errors.length ? 1 : 0);
