/* =====================================================================
   DIVINATION  —  Athenaeum.divination
   ---------------------------------------------------------------------
   The readings of a seer: a POI with a `divination` block
   (scripts/fortune-card.js draws them, styles/fortune-card.css).

     practices      data/practices.json     what the seer offers (method: cards | omen)
     decks, cards   data/decks.json,        a card practice draws from its deck,
                    data/fortune-cards.json into a spread (data/spreads.json) the
                                            player picks; a card may come reversed
     omens          data/omens.json         an omen practice draws one of its own
     prophecies     data/prophecies.json    readings fixed by the DM, per campaign

   One reading per player, per seer, per campaign, per day (the browser's
   calendar day). It is kept in localStorage with the cards already turned,
   so it comes back on reload; the next day the seer reads again.
   A prophecy for this seer and this campaign takes the place of the next
   reading (first in file order first); each player gets it once.
   Loaded after scripts/tavern-menu.js and scripts/market.js (prices).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const local = {
        get(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } },
        set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: not kept */ } },
    };
    const READINGS_KEY = 'athenaeum.readings';
    const PROPHECIES_KEY = 'athenaeum.prophecies';

    // The block, when it offers at least one practice
    const block = poi => (poi && poi.divination && (poi.divination.practices || []).length ? poi.divination : null);
    const practices = (store, poi) => ((block(poi) || {}).practices || [])
        .map(id => store.get(id)).filter(p => p && store.typeOf(p) === 'practice');

    // The spreads a card practice offers: its own list, else every spread
    function spreadsFor(store, practice) {
        if (!practice || practice.method !== 'cards') return [];
        const own = (practice.spreads || []).map(id => store.get(id)).filter(Boolean);
        return (own.length ? own : store.all('spread')).filter(s => (s.positions || []).length);
    }
    const cardsOf = (store, deckId) => store.all('fortuneCard').filter(c => c.deck === deckId);
    const omensOf = (store, practiceId) => store.all('omen').filter(o => o.practice === practiceId);

    // Can this practice give a reading at all?
    function ready(store, practice) {
        if (!practice) return false;
        if (practice.method === 'omen') return omensOf(store, practice.id).length > 0;
        const spreads = spreadsFor(store, practice);
        const deck = cardsOf(store, practice.deck);
        return spreads.some(s => s.positions.length <= deck.length);
    }

    /* Price list of the Readings tab -> [{id, label, items: [{name, desc, unit, priceLabel}]}] */
    function priceList(store, poi) {
        const T = ATH.tavern, M = ATH.market;
        const mult = M.tierFor(store, poi, block(poi)).mult;
        const items = practices(store, poi).map(p => ({
            ...p,
            priceLabel: typeof p.basePrice === 'number' && p.basePrice > 0 ? T.formatPrice(p.basePrice * mult) : 'Donation',
        }));
        return items.length ? [{ id: 'readings', label: 'Readings', items }] : [];
    }

    /* ---------- the day, and what is kept ---------- */
    function today(date = new Date()) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
    const realCampaign = cid => (cid && cid !== 'all' ? cid : '');
    const readingKey = (poi, cid) => `${poi.id}|${realCampaign(cid) || 'all'}`;

    // The prophecies of this seer for this campaign that this player has not had yet
    function pendingProphecies(store, poi, cid) {
        cid = realCampaign(cid);
        if (!cid) return [];
        const seen = local.get(PROPHECIES_KEY)[cid] || [];
        const offered = new Set(practices(store, poi).map(p => p.id));
        return prophecies(store, poi.id).filter(p => (p.campaigns || []).includes(cid) && !seen.includes(p.id) && offered.has(p.practice));
    }
    const prophecies = (store, poiId) => store.all('prophecy').filter(p => p.where === poiId);

    /* ---------- a reading, as the page shows it ---------- */
    /* saved: {practice, spread, cards: [[cardId, reversed]], omen, prophecy, turned: [index]}
       -> {practice, method, spread, layout, deck, prophecy, intro, closing,
           slots: [{position, card, reversed, keywords, reading}], omen, turned: Set} */
    function view(store, saved) {
        const practice = store.get(saved.practice);
        if (!practice) return null;
        const prophecy = saved.prophecy ? store.get(saved.prophecy) : null;
        const spread = saved.spread ? store.get(saved.spread) : null;
        const deck = store.get(practice.deck) || null;
        const out = {
            practice, method: practice.method, spread, deck,
            layout: spread && spread.layout === 'cross' && (saved.cards || []).length === 5 ? 'cross' : 'row',
            prophecy: !!prophecy,
            intro: (prophecy && prophecy.intro) || '',
            closing: (prophecy && prophecy.closing) || '',
            slots: [], omen: null,
            turned: new Set(saved.turned || []),
        };
        if (practice.method === 'omen') {
            const own = !prophecy && saved.omen ? store.get(saved.omen) : null;
            const text = prophecy ? prophecy.omen : own && own.text;
            if (!text) return null;
            out.omen = {
                text,
                meaning: prophecy ? prophecy.omenMeaning || '' : own.meaning || '',
                image: own ? own.image || '' : '',
                icon: practice.icon || 'visibility',
            };
            return out;
        }
        const fixed = prophecy ? prophecy.cards || [] : [];
        out.slots = (saved.cards || []).map(([id, reversed], i) => {
            const card = store.get(id);
            if (!card) return null;
            const positions = (spread && spread.positions) || [];
            const own = fixed[i] && fixed[i].reading;
            return {
                position: positions[i] || { name: '' },
                card, reversed: !!reversed,
                keywords: (reversed ? card.reversedKeywords : card.keywords) || [],
                reading: own || (reversed ? card.reversed || card.upright : card.upright) || '',
            };
        }).filter(Boolean);
        return out.slots.length ? out : null;
    }

    // Today's reading of this player at this seer, or null
    function current(store, poi, cid) {
        const saved = local.get(READINGS_KEY)[readingKey(poi, cid)];
        if (!saved || saved.date !== today()) return null;
        return view(store, saved);
    }

    function shuffle(list) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // A prophecy, as it would be saved (also used by the dashboard's preview)
    function fromProphecy(store, p) {
        const practice = store.get(p.practice);
        const saved = { practice: p.practice, prophecy: p.id, turned: [] };
        if (practice && practice.method === 'cards') {
            saved.spread = p.spread || '';
            saved.cards = (p.cards || []).filter(c => c && c.card).map(c => [c.card, !!c.reversed]);
        }
        return saved;
    }

    /* Today's reading: drawn now (or the prophecy waiting here), kept until tomorrow.
       Returns the view, or null when this practice cannot give one. */
    function draw(store, poi, cid, practiceId, spreadId) {
        const done = current(store, poi, cid);
        if (done) return done;
        let saved;
        const prophecy = pendingProphecies(store, poi, cid)[0];
        if (prophecy) {
            saved = fromProphecy(store, prophecy);
            const seen = local.get(PROPHECIES_KEY);
            const cidKey = realCampaign(cid);
            seen[cidKey] = [...(seen[cidKey] || []), prophecy.id];
            local.set(PROPHECIES_KEY, seen);
        } else {
            const practice = practices(store, poi).find(p => p.id === practiceId);
            if (!practice || !ready(store, practice)) return null;
            saved = { practice: practice.id, turned: [] };
            if (practice.method === 'omen') {
                const pool = omensOf(store, practice.id);
                saved.omen = pool[Math.floor(Math.random() * pool.length)].id;
            } else {
                const deck = store.get(practice.deck) || {};
                const cards = cardsOf(store, practice.deck);
                const spreads = spreadsFor(store, practice).filter(s => s.positions.length <= cards.length);
                const spread = spreads.find(s => s.id === spreadId) || spreads[0];
                saved.spread = spread.id;
                saved.cards = shuffle(cards).slice(0, spread.positions.length)
                    .map(c => [c.id, !deck.noReversals && Math.random() < 0.5]);
            }
        }
        saved.date = today();
        const all = local.get(READINGS_KEY);
        // Only today's readings are worth keeping
        for (const k of Object.keys(all)) if (all[k].date !== saved.date) delete all[k];
        all[readingKey(poi, cid)] = saved;
        local.set(READINGS_KEY, all);
        return view(store, saved);
    }

    // A card of today's reading turned face up (kept, so it stays turned)
    function turn(poi, cid, index) {
        const all = local.get(READINGS_KEY);
        const saved = all[readingKey(poi, cid)];
        if (!saved || saved.date !== today()) return;
        saved.turned = [...new Set([...(saved.turned || []), index])];
        local.set(READINGS_KEY, all);
    }

    ATH.divination = {
        block, practices, spreadsFor, cardsOf, omensOf, ready, priceList,
        prophecies, pendingProphecies, fromProphecy, view, current, draw, turn, today,
    };
})(typeof window !== 'undefined' ? window : globalThis);
