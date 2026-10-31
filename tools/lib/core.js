/* Loads the site's own schema, Markdown renderer and store into Node,
   so the tools run exactly the code the pages run. No dependencies. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

function loadCore() {
    const ctx = vm.createContext({ console });
    for (const file of ['data/schema.js', 'scripts/core/markdown.js', 'scripts/core/store.js']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    }
    return ctx.Athenaeum;
}

function readJSON(rel, optional) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) {
        if (optional) return undefined;
        throw new Error(`${rel} not found`);
    }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { throw new Error(`${rel}: invalid JSON (${e.message})`); }
}

function loadStore() {
    const ATH = loadCore();
    const datasets = {};
    const problems = [];
    for (const [type, def] of Object.entries(ATH.schema.types)) {
        try { datasets[type] = readJSON(def.file); }
        catch (e) { problems.push(e.message); }
    }
    let privateData;
    try { privateData = readJSON('data/private.json', true); }
    catch (e) { problems.push(e.message); }
    let settings;
    try { settings = ATH.schema.settings ? readJSON(ATH.schema.settings.file, true) : undefined; }
    catch (e) { problems.push(e.message); }
    return { ATH, store: ATH.createStore(ATH.schema, datasets, privateData, settings), problems, hasPrivate: privateData !== undefined };
}

module.exports = { ROOT, loadCore, loadStore, readJSON };
