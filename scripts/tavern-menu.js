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

    /* ---------- gaming stakes (scripts/games/table.js and the dashboard) ---------- */
    const DEFAULT_PURSE = 500; // cp, when settings.startingPurse is empty
    const DEFAULT_INTEREST = 10; // %, when settings.loanInterest is empty
    const FALLBACK_STAKES = [
        { id: 'low', label: 'Low stakes', blind: 5 },
        { id: 'standard', label: 'Standard stakes', blind: 10 },
        { id: 'high', label: 'High stakes', blind: 50 },
    ];

    // Exact coin text: 155 cp -> "1 gp 5 sp 5 cp". (formatPrice rounds to the nearest sp and never shows 0.)
    function formatCoin(cp) {
        cp = Math.max(0, Math.round(Number(cp) || 0));
        if (!cp) return '0 cp';
        const gp = Math.floor(cp / 100), sp = Math.floor((cp % 100) / 10), rest = cp % 10;
        return [gp && `${gp} gp`, sp && `${sp} sp`, rest && `${rest} cp`].filter(Boolean).join(' ');
    }

    // What a player starts with at the gaming tables (cp): settings.startingPurse, else 500
    function startingPurse(store) {
        const raw = store.settings && store.settings.startingPurse;
        const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : DEFAULT_PURSE;
    }

    /* The stakes a tavern offers -> [{id, label, base, blind}]
       blind (cp per seat) = the stakes' base blind (enum gameStakes) x the tavern's tier multiplier.
       tavern.minStake hides the stakes below it. */
    function stakes(store, tavern) {
        const listed = store.enumOptions('gameStakes').filter(s => s && typeof s.blind === 'number');
        const mult = (tavern && tierOf(store, tavern).mult) || 1;
        const all = (listed.length ? listed : FALLBACK_STAKES)
            .map(s => ({ id: s.id, label: s.label, base: s.blind, blind: Math.max(1, Math.round(s.blind * mult)) }));
        const min = tavern && tavern.minStake && all.find(s => s.id === tavern.minStake);
        return min ? all.filter(s => s.blind >= min.blind) : all;
    }

    /* The house rules of a gaming table -> { houseCut, highTableWins, loanInterest }
         houseCut       % of every pot the house keeps (tavern.houseCut, 0 to 50; empty = 0)
         highTableWins  staked wins in this tavern before its highest stakes open (tavern.highTableWins; empty = 0)
         loanInterest   % on the purse a broke player borrows (settings.loanInterest; empty = 10, 0 = a free fresh purse) */
    function gaming(store, tavern) {
        const num = (raw, fallback, max) => {
            const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
            return Number.isFinite(n) && n >= 0 ? Math.min(max, n) : fallback;
        };
        return {
            houseCut: num(tavern && tavern.houseCut, 0, 50),
            highTableWins: Math.round(num(tavern && tavern.highTableWins, 0, 999)),
            loanInterest: num(store.settings && store.settings.loanInterest, DEFAULT_INTEREST, 500),
        };
    }

    // hash, mulberry32 and seededPick are shared with scripts/market.js (shops, temples, rumours)
    ATH.tavern = { buildMenu, buildServices, folioLabel, formatPrice, formatCoin, startingPurse, stakes, gaming, normaliseCode, tierOf, hash, mulberry32, seededPick };
})(typeof window !== 'undefined' ? window : globalThis);
