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
     reading rules  data/reading-rules.json how the seer reads a spread as a whole
     piece sets     data/piece-sets.json,   a cast practice throws pieces of its set
     pieces         data/cast-pieces.json   on a round cloth: where each falls (its
                                            ring), face up or down, maybe merkstave

   A cast is thrown once, at the draw (where every piece fell is kept); the
   player then throws it on screen (`thrown`) and reads the faces one by one.
   Only face-up pieces on the cloth are read; the nearest the centre gives
   the counsel; the rings take the place of a spread's positions.

   The interpretation (once every card is turned; never for a prophecy):
     1. one of the spread's `openings`
     2. each card in its position: one of the position's `frames`, with the
        card's `essence` (or `reversedEssence`) and name slotted in
     3. at most two pattern rules: card / together rules first, then
        reversals and rising / falling numbers (file order within each)
     4. the `counsel` of the card in the spread's `keyPosition` (else the last)
     5. one closing, by the reading's tone (bright / mixed / dark)
   Choices among variants are seeded by the reading, so a reload says the same.

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
    const piecesOf = (store, setId) => store.all('castPiece').filter(p => p.pieceSet === setId);
    // A cast practice's rings, centre outwards
    const DEFAULT_RINGS = [{ name: 'The heart', desc: 'what is' }, { name: 'Near', desc: 'what draws close' }, { name: 'Far', desc: 'what lies ahead' }];
    const ringsOf = practice => ((practice.rings || []).filter(r => r && r.name).length ? practice.rings.filter(r => r && r.name) : DEFAULT_RINGS);

    // Can this practice give a reading at all?
    function ready(store, practice) {
        if (!practice) return false;
        if (practice.method === 'omen') return omensOf(store, practice.id).length > 0;
        if (practice.method === 'cast') return piecesOf(store, practice.pieceSet).length > 0;
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
        // (a cast is never fixed by a prophecy: where the pieces fall is the point)
        const offered = new Set(practices(store, poi).filter(p => p.method !== 'cast').map(p => p.id));
        return prophecies(store, poi.id).filter(p => (p.campaigns || []).includes(cid) && !seen.includes(p.id) && offered.has(p.practice));
    }
    const prophecies = (store, poiId) => store.all('prophecy').filter(p => p.where === poiId);

    /* ---------- the interpretation of a spread ---------- */
    // A small seeded random (mulberry32), so a reading always says the same words
    function seeded(text) {
        let h = 1779033703 ^ text.length;
        for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
        let a = h >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const lines = list => (list || []).map(x => String(x || '').trim()).filter(Boolean);
    const pick = (list, rnd) => (list.length ? list[Math.floor(rnd() * list.length)] : '');
    const upFirst = t => t.charAt(0).toUpperCase() + t.slice(1);
    const lowFirst = t => t.charAt(0).toLowerCase() + t.slice(1);
    const sentence = t => { t = upFirst(t.trim()); return /[.!?…]$/.test(t) ? t : `${t}.`; };
    // "a, b and c"
    const listed = words => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

    const essenceOf = s => String((s.reversed ? s.card.reversedEssence : s.card.essence)
        || listed(s.reversed ? s.card.reversedKeywords || s.card.keywords || [] : s.card.keywords || [])
        || lowFirst(s.reading.replace(/\.$/, ''))).trim().replace(/\.$/, '');
    const DARKER = { bright: 'neutral', neutral: 'dark', dark: 'dark' };
    const toneOf = s => (s.reversed ? s.card.reversedTone || DARKER[s.card.tone || 'neutral'] : s.card.tone || 'neutral');
    const SCORE = { bright: 1, neutral: 0, dark: -1 };

    // A frame with its card: {card} mid-sentence reads "the Tower", not "The Tower"
    function fill(frame, s) {
        const name = s.card.name || '';
        return sentence(frame
            .replace(/(^|[.!?…]\s*)\{card\}/g, (m, lead) => `${lead}${name}`)
            .replace(/\{card\}/g, name.replace(/^The /, 'the '))
            .replace(/\{essence\}/g, essenceOf(s)));
    }

    /* Does this rule speak for this reading? -> the card (or piece) it found, or null.
       slots = the cards, or the pieces read (face up, on the cloth) */
    const CARD_ONLY = ['allReversed', 'mostReversed', 'allUpright', 'rising', 'falling'];
    const CAST_ONLY = ['heartEmpty', 'mostDown', 'twoReversed', 'offCloth', 'allDown'];
    function matches(rule, v, slots) {
        const cast = v.method === 'cast';
        const n = slots.length;
        const none = { card: { name: '' }, reversed: false, reading: '' };
        if ((rule.spreads || []).length && (cast || !rule.spreads.includes(v.spread ? v.spread.id : ''))) return null;
        if ((cast && CARD_ONLY.includes(rule.when)) || (!cast && CAST_ONLY.includes(rule.when))) return null;
        const inDeck = !rule.deck || (v.deck && rule.deck === v.deck.id);
        const nums = slots.map(s => s.card.number);
        const numbered = n >= 3 && nums.every(x => typeof x === 'number');
        const rev = slots.filter(s => s.reversed).length;
        switch (rule.when) {
            case 'card': {
                const ids = new Set(rule.cards || []);
                const at = typeof rule.position === 'number' ? rule.position - 1 : -1;
                const slot = slots.find((s, i) => ids.has(s.card.id) && (at < 0 || (cast ? s.ring : i) === at)
                    && (!rule.orientation || (rule.orientation === 'reversed') === s.reversed));
                return slot || null;
            }
            case 'together': {
                const ids = rule.cards || [];
                return ids.length > 1 && ids.every(id => slots.some(s => s.card.id === id)) ? slots.find(s => s.card.id === ids[0]) : null;
            }
            case 'allReversed': return inDeck && n >= 2 && rev === n ? slots[0] : null;
            case 'mostReversed': return inDeck && n >= 3 && rev < n && rev > n / 2 ? slots[0] : null;
            case 'allUpright': return inDeck && n >= 3 && rev === 0 ? slots[0] : null;
            case 'rising': return inDeck && numbered && nums.every((x, i) => !i || x > nums[i - 1]) ? slots[0] : null;
            case 'falling': return inDeck && numbered && nums.every((x, i) => !i || x < nums[i - 1]) ? slots[0] : null;
            case 'heartEmpty': return inDeck && n && !slots.some(s => s.ring === 0) ? none : null;
            case 'mostDown': { const down = v.slots.filter(s => !s.up && s.ring >= 0).length; return inDeck && n && down > n ? none : null; }
            case 'twoReversed': return inDeck && slots.filter(s => s.reversed).length >= 2 ? none : null;
            case 'offCloth': { const off = v.slots.filter(s => s.ring < 0).length; return inDeck && off ? { ...none, off } : null; }
            case 'allDown': return inDeck && !n ? none : null;
            default: return null;
        }
    }
    const CLOSINGS = ['bright', 'mixed', 'dark'];

    // The pieces of a cast that are read: face up, on the cloth, nearest the centre first
    const readOf = v => v.slots.filter(s => s.up && s.ring >= 0).sort((a, b) => a.r - b.r);

    /* v = a view (below) -> {opening, cards: [sentence], patterns: [sentence], counsel, closing, tone},
       or null (an omen, a prophecy, or no card) */
    function interpret(store, v, seed) {
        if (!v || v.prophecy || !['cards', 'cast'].includes(v.method)) return null;
        const cast = v.method === 'cast';
        const slots = cast ? readOf(v) : v.slots;
        if (!cast && !slots.length) return null;
        const rnd = seeded(seed || String(Math.random()));
        const spread = v.spread || {};
        const positions = spread.positions || [];
        const opening = pick(lines(cast ? v.practice.openings : spread.openings), rnd);
        const used = new Set();
        const cards = slots.map((s, i) => {
            const pos = (cast ? v.rings[s.ring] : positions[i] || s.position) || {};
            const all = lines(pos.frames), fresh = all.filter(f => !used.has(f));
            const frame = pick(fresh.length ? fresh : all, rnd);
            used.add(frame);
            return fill(frame || (cast ? `${pos.name}: {essence}` : pos.name ? `For ${lowFirst(pos.name)}, I see {essence}` : 'I see {essence}'), s);
        });
        const rules = store.all('readingRule');
        const said = [];
        const byCard = r => r.when === 'card' || r.when === 'together';
        for (const r of [...rules.filter(byCard), ...rules.filter(r => !byCard(r) && !CLOSINGS.includes(r.when))]) {
            if (said.length >= 2) break;
            const slot = matches(r, v, slots);
            const text = slot && pick(lines(r.texts), rnd);
            if (text) said.push(fill(text.replace(/\{n\}/g, String(slot.off || '')), slot));
        }
        const keyAt = cast ? 0 : typeof spread.keyPosition === 'number' && spread.keyPosition >= 1 && spread.keyPosition <= slots.length
            ? spread.keyPosition - 1 : slots.length - 1;
        const key = slots[keyAt];
        const counsel = key ? String((key.reversed ? key.card.reversedCounsel : key.card.counsel) || '').trim() : '';
        const score = slots.length ? slots.reduce((t, s) => t + SCORE[toneOf(s)], 0) / slots.length : 0;
        const tone = score >= 0.34 ? 'bright' : score <= -0.34 ? 'dark' : 'mixed';
        const closing = pick(lines(rules.filter(r => r.when === tone && (!r.deck || (v.deck && r.deck === v.deck.id))
            && (!r.method || r.method === v.method)
            && (cast ? !(r.spreads || []).length : !(r.spreads || []).length || r.spreads.includes(spread.id))).flatMap(r => r.texts || [])), rnd);
        return { opening: opening && sentence(opening), cards, patterns: said, counsel: counsel && sentence(counsel), closing: closing && sentence(closing), tone };
    }

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
        if (practice.method === 'cast') {
            const set = store.get(practice.pieceSet) || {};
            const rings = ringsOf(practice);
            // The cloth: the seer's own (its POI's divination block), else the practice's
            const own = ((saved.where && store.get(saved.where)) || {}).divination || {};
            const cloth = {
                colour: own.clothColour || practice.clothColour || '',
                image: own.clothImage || practice.clothImage || '',
                ring: own.ringColour || practice.ringColour || '',
            };
            Object.assign(out, { set, deck: set, rings, cloth, thrown: !!saved.thrown, layout: 'cloth' });
            out.slots = (saved.cast || []).map(([id, x, y, up, merk, rot, shape]) => {
                const piece = store.get(id);
                if (!piece) return null;
                const r = Math.hypot(x, y);
                const ring = r <= 1 ? Math.min(rings.length - 1, Math.floor(r * rings.length)) : -1;
                const reversed = !!merk && !set.noReversals && !piece.symmetric;
                return {
                    card: piece, piece, x, y, r, ring, up: !!up, reversed, rot: rot || 0, shape: shape || 0,
                    position: rings[ring] || { name: 'Off the cloth' },
                    keywords: (reversed ? piece.reversedKeywords || piece.keywords : piece.keywords) || [],
                    reading: (reversed ? piece.reversed || piece.meaning : piece.meaning) || '',
                };
            }).filter(Boolean);
            if (!out.slots.length) return null;
            out.interpretation = interpret(store, out, JSON.stringify([saved.date || '', saved.cast || []]));
            return out;
        }
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
        if (!out.slots.length) return null;
        out.interpretation = interpret(store, out, JSON.stringify([saved.date || '', saved.spread || '', saved.cards || []]));
        return out;
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
            } else if (practice.method === 'cast') {
                saved.cast = throwPieces(store, practice, Math.random);
                saved.where = poi.id;
                saved.thrown = false;
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

    /* Where the pieces of a cast fall -> [[pieceId, x, y, up, merkstave, rotation, shape]]
       x, y: from the centre of the cloth, in its radius (beyond 1 = off the cloth) */
    function throwPieces(store, practice, rnd) {
        const set = store.get(practice.pieceSet) || {};
        const pool = shuffleWith(piecesOf(store, practice.pieceSet), rnd);
        const n = typeof practice.castCount === 'number' && practice.castCount > 0 ? Math.min(practice.castCount, pool.length) : pool.length;
        const placed = [];
        return pool.slice(0, n).map(p => {
            let x, y, tries = 0;
            do {
                const a = rnd() * Math.PI * 2;
                const r = Math.min(1.14, Math.pow(rnd(), 0.75) * 1.12);
                x = Math.cos(a) * r; y = Math.sin(a) * r;
            } while (++tries < 40 && placed.some(q => Math.hypot(q[0] - x, q[1] - y) < 0.2));
            placed.push([x, y]);
            const up = rnd() > 0.34;
            const merk = up && !set.noReversals && !p.symmetric && rnd() < 0.35;
            return [p.id, +x.toFixed(3), +y.toFixed(3), up ? 1 : 0, merk ? 1 : 0, Math.round((rnd() - 0.5) * 60), Math.floor(rnd() * 4)];
        });
    }
    function shuffleWith(list, rnd) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }
    // A cast thrown on screen by the player (kept: it is not thrown twice)
    function throwCast(poi, cid) {
        const all = local.get(READINGS_KEY);
        const saved = all[readingKey(poi, cid)];
        if (!saved || saved.date !== today()) return;
        saved.thrown = true;
        local.set(READINGS_KEY, all);
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
        block, practices, spreadsFor, cardsOf, omensOf, piecesOf, ringsOf, readOf, ready, priceList, interpret,
        throwPieces, throwCast, seeded,
        prophecies, pendingProphecies, fromProphecy, view, current, draw, turn, today,
    };
})(typeof window !== 'undefined' ? window : globalThis);
