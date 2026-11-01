/* =====================================================================
   TAVERN MENU  —  Athenaeum.tavern
   ---------------------------------------------------------------------
   Builds a tavern's bill of fare from the data:
     poi.tavern           tier, picks, includeTags / excludeTags,
                          signature items, services, customServices
     menuItem records     the shared pool (data/menu-items.json)
     service records      the catalogue (data/services.json)
     settings.tavernCode  the bill of fare code (data/settings.json)

   MENU = signature items (always, price as written)
        + per category, N seeded picks from the pool items this tier may
          serve and the tags allow (price = basePrice x tier multiplier).
   Same code + same tavern = same menu for everyone. Change the code in
   data/settings.json to change every menu at once.
   Prices are in copper pieces (1 gp = 10 sp = 100 cp).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    // cyrb53-style string hash -> 32-bit seed; mulberry32 PRNG.
    function hash(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h1 ^ h2) >>> 0;
    }
    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function seededPick(list, n, rng) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a.slice(0, Math.max(0, n));
    }

    const normaliseCode = code => String(code || '').trim().toUpperCase();

    function formatPrice(cp) {
        cp = Math.max(1, Math.round(cp));
        if (cp >= 100) {
            let gp = Math.floor(cp / 100);
            let sp = Math.round((cp % 100) / 10);
            if (sp === 10) { gp += 1; sp = 0; }
            return sp ? `${gp} gp ${sp} sp` : `${gp} gp`;
        }
        if (cp >= 10) {
            const sp = Math.floor(cp / 10), rest = cp % 10;
            return rest ? `${sp} sp ${rest} cp` : `${sp} sp`;
        }
        return `${cp} cp`;
    }

    function tierOf(store, tavern) {
        const tiers = store.enumOptions('tavernTier');
        const index = Math.max(0, tiers.findIndex(t => t.id === tavern.tier));
        return { ...tiers[index], index, tiers };
    }

    /* -> [{id, label, items: [{name, desc, priceLabel, signature}]}] */
    function buildMenu(store, poi, code) {
        const tavern = poi.tavern;
        const tier = tierOf(store, tavern);
        const tierIndex = id => tier.tiers.findIndex(t => t.id === id);
        const rng = mulberry32(hash(`${normaliseCode(code)}|${poi.id}`));
        const include = tavern.includeTags && tavern.includeTags.length ? tavern.includeTags : null;
        const exclude = tavern.excludeTags || [];
        const signature = tavern.signature || [];
        const sigNames = new Set(signature.map(s => (s.name || '').toLowerCase()));
        const pool = store.all('menuItem');

        return store.enumOptions('menuCategory').map(cat => {
            const fixed = signature
                .filter(s => s.category === cat.id)
                .map(s => ({ ...s, signature: true, priceLabel: formatPrice(s.price) }));
            const eligible = pool.filter(item =>
                item.category === cat.id &&
                tier.index >= tierIndex(item.minTier) && tier.index <= tierIndex(item.maxTier) &&
                (!include || (item.tags || []).some(tag => include.includes(tag))) &&
                !(item.tags || []).some(tag => exclude.includes(tag)) &&
                !sigNames.has(item.name.toLowerCase())
            );
            // RNG is consumed per category in a fixed order, so results are stable.
            const picked = seededPick(eligible, (tavern.picks || {})[cat.id] || 0, rng)
                .map(item => ({ ...item, priceLabel: formatPrice(item.basePrice * tier.mult) }));
            return { ...cat, items: [...fixed, ...picked] };
        }).filter(cat => cat.items.length);
    }

    function buildServices(store, poi) {
        const tavern = poi.tavern;
        const mult = tierOf(store, tavern).mult;
        const fromCatalogue = (tavern.services || []).map(id => store.get(id)).filter(Boolean)
            .map(s => ({ ...s, priceLabel: formatPrice(s.basePrice * mult) }));
        const custom = (tavern.customServices || []).map(s => ({ ...s, priceLabel: formatPrice(s.price) }));
        return [...fromCatalogue, ...custom];
    }

    // Short code-derived label, so the table can check everyone sees the same menu.
    function folioLabel(code, poiId) {
        code = normaliseCode(code);
        if (!code) return 'House Bill of Fare';
        return `Bill of Fare · Folio ${hash(`folio|${code}|${poiId}`) % 900 + 100}`;
    }

    ATH.tavern = { buildMenu, buildServices, folioLabel, formatPrice, normaliseCode, tierOf };
})(typeof window !== 'undefined' ? window : globalThis);
