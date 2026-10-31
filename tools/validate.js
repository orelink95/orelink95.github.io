#!/usr/bin/env node
/* Checks every data file against data/schema.js.
   Usage (from the repo root):  node tools/validate.js [--quiet]
   Exit code 1 when there are errors, so it can guard a commit or CI. */
const { loadStore } = require('./lib/core');

const quiet = process.argv.includes('--quiet');
const { ATH, store, problems, hasPrivate } = loadStore();
const { errors, warnings } = store.validate();
errors.unshift(...problems);

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
