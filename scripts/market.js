/* =====================================================================
   MARKET  —  Athenaeum.market
   ---------------------------------------------------------------------
   Everything a POI page sells or tells, besides the tavern menu
   (scripts/tavern-menu.js, loaded first: this file reuses its seeded RNG).

     poi.shop      -> buildWares()        seeded goods per shelf (data/shop-goods.json)
                      buildPotions()      seeded potions (shop.potions; needs
                                          scripts/alchemy-engine.js on the page)
     poi.alchemist -> bench()             what its Workbench stocks, and what a
                      quoteBrew()         mix costs (craft DC, tool, price, brew mark)
     poi.temple    -> buildRites()        services (data/temple-services.json + custom)
                      prayer / pray()     a blessing (data/blessings.json), drawn once
                                          per market code, per browser, per temple
     poi.tavern    -> rumours()           rumours heard here (data/rumours.json): the
                                          `where` of a rumour is this POI or a place
                                          above it; drawn in a seeded order, N per code
     notices()                            posts on a settlement's or a POI's board
                                          (data/notices.json)

   Same market code (settings.tavernCode) = same wares and the same rumour
   order for everyone. A player's draws are kept in localStorage, so they
   come back on reload and start again when the code changes.
   Prices are in copper pieces (1 gp = 10 sp = 100 cp).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const T = () => ATH.tavern;

    /* ---------- shared ---------- */
    const local = {
        get(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: not kept */ } },
    };
    const RUMOURS_KEY = 'athenaeum.rumours';
    const BLESSINGS_KEY = 'athenaeum.blessings';

    // Record listed in a campaign: none listed = every campaign; 'all' = show everything
    const inCampaign = (rec, cid) => !cid || cid === 'all' || !(rec.campaigns || []).length || rec.campaigns.includes(cid);

    // The tier of a shop or temple: its own, else the tavern's, else Modest
    function tierFor(store, poi, block) {
        const tiers = store.enumOptions('tavernTier');
        const id = (block && block.tier) || (poi.tavern && poi.tavern.tier) || 'modest';
        const index = Math.max(0, tiers.findIndex(t => t.id === id));
        return { ...tiers[index], index, tiers };
    }

    /* ---------- shops ---------- */
    function shopKind(store, shop) {
        return store.enumOptions('shopKind').find(k => k.id === shop.kind) || { id: shop.kind, label: 'Shop', categories: [] };
    }
    // The shelves a shop shows, in the order of the shopCategory enum
    function shelvesOf(store, shop) {
        const wanted = (shop.categories && shop.categories.length) ? shop.categories : shopKind(store, shop).categories || [];
        return store.enumOptions('shopCategory').filter(c => wanted.includes(c.id));
    }

    /* -> [{id, label, items: [{name, desc, unit, priceLabel, signature}]}] */
    function buildWares(store, poi, code) {
        const shop = poi.shop;
        if (!shop || !shop.kind) return [];
        const kind = shopKind(store, shop);
        const tier = tierFor(store, poi, shop);
        const tierIndex = id => tier.tiers.findIndex(t => t.id === id);
        const mult = tier.mult * ((typeof shop.markup === 'number' && shop.markup > 0 ? shop.markup : 100) / 100);
        const include = shop.includeTags && shop.includeTags.length ? shop.includeTags : null;
        const exclude = [...(kind.exclude || []), ...(shop.excludeTags || [])].filter(t => !(include || []).includes(t));
        const picks = typeof shop.picks === 'number' ? shop.picks : 5;
        const signature = shop.signature || [];
        const sigNames = new Set(signature.map(s => (s.name || '').toLowerCase()));
        const pool = store.all('shopGood');
        const rng = T().mulberry32(T().hash(`${T().normaliseCode(code)}|${poi.id}|wares`));

        return shelvesOf(store, shop).map(cat => {
            const narrow = (kind.shelfTags || {})[cat.id]; // e.g. a barber's services: tagged barber
            const fixed = signature.filter(s => s.category === cat.id)
                .map(s => ({ ...s, signature: true, priceLabel: T().formatPrice(s.price) }));
            const eligible = pool.filter(g =>
                g.category === cat.id &&
                tier.index >= tierIndex(g.minTier) && tier.index <= tierIndex(g.maxTier) &&
                (!include || (g.tags || []).some(t => include.includes(t))) &&
                !(g.tags || []).some(t => exclude.includes(t)) &&
                (!narrow || (g.tags || []).some(t => narrow.includes(t))) &&
                !sigNames.has(g.name.toLowerCase())
            );
            // RNG consumed per shelf in a fixed order: stable results. Picks come back in price order.
            const picked = T().seededPick(eligible, picks, rng)
                .sort((a, b) => a.basePrice - b.basePrice)
                .map(g => ({ ...g, priceLabel: T().formatPrice(g.basePrice * mult) }));
            return { ...cat, items: [...fixed, ...picked] };
        }).filter(cat => cat.items.length);
    }
    function waresLabel(code, poiId) {
        code = T().normaliseCode(code);
        return code ? `Stock Ledger · Page ${T().hash(`ledger|${code}|${poiId}`) % 900 + 100}` : 'Stock Ledger';
    }

    /* ---------- potions (scripts/alchemy-engine.js) ----------
       A shop with `potions` shelves that many seeded potions; an alchemist's bench
       lets players mix its stock. Players see a shop potion's bottle, name and price,
       and only the craft DC, tool and price of their own mix: never what it does. */
    const alchemy = () => root.Alchemy || null;
    const potionDb = store => (alchemy() ? alchemy().dbFromStore(store) : null);

    /* -> [{potion, priceLabel, cp}] in price order; [] without the engine */
    function buildPotions(store, poi, code) {
        const A = alchemy(), shop = poi.shop, db = potionDb(store);
        if (!A || !db || !shop || !(shop.potions > 0)) return [];
        const markup = (typeof shop.markup === 'number' && shop.markup > 0 ? shop.markup : 100) / 100;
        return A.shopPotions(db, {
            code: T().normaliseCode(code), poiId: poi.id, count: shop.potions,
            maxRarity: shop.potionRarity || 'uncommon', principles: shop.potionPrinciples,
        }).map(potion => {
            const cp = Math.round(potion.gpValue * 100 * markup);
            return { potion, cp, priceLabel: T().formatPrice(cp) };
        });
    }

    /* An alchemist's stock -> {vessels, solvents, actives, catalysts} (records, in the
       archive's order) and `stock` (ids, for Alchemy.findByMark); null if it can't brew */
    function bench(store, poi) {
        const A = alchemy(), block = poi.alchemist, db = potionDb(store);
        if (!A || !db || !block) return null;
        const stock = { vessels: block.vessels || [], solvents: block.solvents || [], actives: block.principles || [], catalysts: block.catalysts || [] };
        // Only what is stocked: an empty reagent list stocks nothing (vessels: empty = all)
        const pick = (list, ids, all) => (ids.length ? list.filter(x => ids.includes(x.id)) : all ? list : []);
        const out = {
            vessels: pick(db.vessels, stock.vessels, true),
            solvents: pick(db.reagents.solvents, stock.solvents),
            actives: pick(db.reagents.actives, stock.actives),
            catalysts: pick(db.reagents.catalysts, stock.catalysts),
            stock, fee: block.fee,
        };
        return out.vessels.length && out.solvents.length && out.actives.length && out.catalysts.length ? out : null;
    }
    /* A player's mix -> {dc, kit, cp, priceLabel, mark}, or null if a part is unknown */
    function quoteBrew(store, poi, recipe) {
        const A = alchemy(), db = potionDb(store), b = bench(store, poi);
        const potion = A && db && b ? A.brew(db, recipe) : null;
        if (!potion) return null;
        const gp = A.brewCost(potion, b.fee);
        return { dc: potion.brewDC, kit: potion.kit, cp: gp * 100, priceLabel: T().formatPrice(gp * 100), mark: A.brewMark(recipe) };
    }
    // Every alchemist's stock, for the DM's mark lookup
    const allBenches = store => store.all('poi').map(p => bench(store, p)).filter(Boolean).map(b => b.stock);

    /* ---------- temples ---------- */
    /* -> [{id, label, items: [{name, desc, unit, priceLabel}]}] */
    function buildRites(store, poi) {
        const temple = poi.temple;
        if (!temple) return [];
        const mult = tierFor(store, { tavern: null }, temple).mult;
        const price = cp => (typeof cp === 'number' && cp > 0 ? T().formatPrice(cp) : 'Donation');
        const all = [
            ...(temple.services || []).map(id => store.get(id)).filter(Boolean)
                .map(s => ({ ...s, priceLabel: price(s.basePrice * mult) })),
            ...(temple.customServices || []).map(s => ({ ...s, category: s.category || 'rites', priceLabel: price(s.price) })),
        ];
        return store.enumOptions('templeCategory')
            .map(cat => ({ ...cat, items: all.filter(s => s.category === cat.id) }))
            .filter(cat => cat.items.length);
    }
    const deitiesOf = (store, poi) => ((poi.temple && poi.temple.deities) || []).map(id => store.get(id)).filter(Boolean);

    // Blessings this temple (and, if given, this deity's altar) can grant
    function blessingsFor(store, poi, deityId) {
        const here = deityId ? [deityId] : (poi.temple.deities || []);
        return store.all('blessing').filter(b => !(b.deities || []).length || b.deities.some(d => here.includes(d)));
    }
    const prayerKey = (code, poi) => `${T().normaliseCode(code)}|${poi.id}`;
    // The blessing already received here with this code: {blessing, deity} or null
    function prayer(store, poi, code) {
        const got = local.get(BLESSINGS_KEY)[prayerKey(code, poi)];
        const blessing = got && store.get(got.blessing);
        return blessing ? { blessing, deity: got.deity ? store.get(got.deity) : null } : null;
    }
    // Draws a blessing (random, per browser) and keeps it until the code changes
    function pray(store, poi, code, deityId) {
        const done = prayer(store, poi, code);
        if (done) return done;
        const list = blessingsFor(store, poi, deityId);
        if (!list.length) return null;
        const blessing = list[Math.floor(Math.random() * list.length)];
        const all = local.get(BLESSINGS_KEY);
        all[prayerKey(code, poi)] = { blessing: blessing.id, deity: deityId || null };
        local.set(BLESSINGS_KEY, all);
        return { blessing, deity: deityId ? store.get(deityId) : null };
    }

    /* ---------- rumours ---------- */
    // Rumours heard in this POI's tavern: `where` = the POI or a place above it
    function rumoursHeard(store, poi, cid) {
        const places = new Set([poi.id, ...store.ancestors(poi).map(p => p.id)]);
        return store.all('rumour')
            .filter(r => places.has(r.where) && inCampaign(r, cid))
            .sort((a, b) => a.id.localeCompare(b.id)); // file order does not change the draw
    }
    const drawLimit = poi => (poi.tavern && typeof poi.tavern.rumourDraws === 'number') ? poi.tavern.rumourDraws : 3;
    const rumourKey = (code, poi, cid) => `${T().normaliseCode(code)}|${poi.id}|${cid || 'all'}`;

    // Every rumour heard here, in the tavern's seeded order for this code. A campaign keeps
    // its own in the same order, so the dashboard preview matches what players get.
    function rumourOrder(store, poi, code) {
        const heard = rumoursHeard(store, poi, 'all');
        return T().seededPick(heard, heard.length, T().mulberry32(T().hash(`${T().normaliseCode(code)}|${poi.id}|rumours`)));
    }

    /* -> {drawn: [rumour…], left: draws left, total: rumours heard here, limit} */
    function rumours(store, poi, code, cid) {
        const order = rumourOrder(store, poi, code).filter(r => inCampaign(r, cid));
        const limit = Math.min(drawLimit(poi), order.length);
        const count = Math.min(local.get(RUMOURS_KEY)[rumourKey(code, poi, cid)] || 0, limit);
        return { drawn: order.slice(0, count), left: limit - count, total: order.length, limit };
    }
    // Buy a round: one more rumour. Returns the new state (and the new rumour in `fresh`).
    function drawRumour(store, poi, code, cid) {
        const before = rumours(store, poi, code, cid);
        if (!before.left) return { ...before, fresh: null };
        const all = local.get(RUMOURS_KEY);
        all[rumourKey(code, poi, cid)] = before.drawn.length + 1;
        local.set(RUMOURS_KEY, all);
        const after = rumours(store, poi, code, cid);
        return { ...after, fresh: after.drawn[after.drawn.length - 1] };
    }

    /* ---------- notice boards ---------- */
    const STATUS_ORDER = { open: 0, taken: 1, done: 2 };
    // Posts on the board of a settlement or a POI: open first, then taken, then done
    function notices(store, placeId, cid) {
        return store.all('notice')
            .filter(n => n.where === placeId && inCampaign(n, cid))
            .map((n, i) => ({ n, i }))
            .sort((a, b) => (STATUS_ORDER[a.n.status || 'open'] - STATUS_ORDER[b.n.status || 'open']) || a.i - b.i)
            .map(x => x.n);
    }
    // POIs under a settlement that have a board of their own (for "also pinned at")
    function boardsUnder(store, settlementId, cid) {
        return store.descendants(settlementId, 'poi')
            .map(p => ({ poi: p, count: notices(store, p.id, cid).filter(n => (n.status || 'open') === 'open').length }))
            .filter(x => notices(store, x.poi.id, cid).length);
    }

    // Campaigns that have something to show here (for the campaign drop-down)
    function campaignsWith(store, records) {
        const ids = new Set(records.flatMap(r => r.campaigns || []));
        const anyAll = records.some(r => !(r.campaigns || []).length);
        return { campaigns: store.all('campaign').filter(c => ids.has(c.id)), anyAll };
    }

    ATH.market = {
        tierFor, shopKind, shelvesOf, buildWares, waresLabel,
        buildPotions, bench, quoteBrew, allBenches,
        buildRites, deitiesOf, blessingsFor, prayer, pray,
        rumoursHeard, rumourOrder, rumours, drawRumour, drawLimit,
        notices, boardsUnder, inCampaign, campaignsWith,
    };
})(typeof window !== 'undefined' ? window : globalThis);
