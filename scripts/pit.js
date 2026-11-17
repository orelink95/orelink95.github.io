/* =====================================================================
   FIGHTING PIT  —  Athenaeum.pit  (the Pit tab of poi.html, the dashboard)
   ---------------------------------------------------------------------
   poi.pit         keepers, nights (weekday names), bouts, houseCut, maxWager,
                   fighters [{ npc | creature | name, image, tag, strength, wins, losses }]
   poi.pitFixes    DM only (data/private.json): [{ date, winner }]

   TONIGHT = the date of the world (calendar.now, else the latest session).
   A fight night is one of pit.nights (empty = every night). On a fight night
   the card is drawn from the fighters with the market code + the POI + the
   date: same code, same night = the same bouts, the same blows, the same
   winner for everyone. A fixed fight makes its fighter win (the odds don't
   change). With no date in the world at all, the card follows the code alone.

   ODDS come from the two strengths (1 to 10; a creature's threat when empty):
   "2 to 1" = a winning bet of 1 gp brings back 1 + 2 gp, less the house's cut
   (houseCut %, default 10) of the 2 gp earned.

   BETS are paid from the gaming purse (scripts/games/table.js, this browser).
   The result is known when the bet is placed, so the purse is settled at
   once; the bout is then shown blow by blow. A bout bet on or watched is
   settled for the night (localStorage 'athenaeum.pit'): no second bet.

       Athenaeum.pit.fighters(store, poi)          -> [fighter]
       Athenaeum.pit.night(store, poi, date?)      -> { date, open, next, label }
       Athenaeum.pit.card(store, poi, code, date?) -> { night, bouts: [bout] }
       Athenaeum.pit.mount(el, store, poi, code)   draws the Pit tab
   Styles: styles/pit.css.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const THREAT_STRENGTH = { Lethal: 10, High: 8, Moderate: 6, Low: 4, Harmless: 2, Friendly: 2 };
    const DEFAULT_BOUTS = 3, DEFAULT_CUT = 10, MAX_ROUNDS = 12, HP = 32;
    const CHIPS = [10, 50, 100, 500, 1000, 5000];       // wagers offered, in cp
    const BETS_KEY = 'athenaeum.pit', BETS_KEEP = 300;
    const NICE_ODDS = [[1, 4], [1, 3], [1, 2], [2, 3], [4, 5], [1, 1], [6, 5], [3, 2], [2, 1], [5, 2], [3, 1], [4, 1], [5, 1]];

    const num = (raw, fallback, min, max) => {
        const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
        return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    /* ---------- fighters ---------- */
    function fighters(store, poi) {
        const pit = (poi && poi.pit) || {};
        const out = [], seen = new Set();
        (pit.fighters || []).forEach(f => {
            if (!f) return;
            const npc = f.npc && store.get(f.npc), creature = !npc && f.creature && store.get(f.creature);
            const rec = npc || creature || null;
            const name = String(f.name || '').trim() || (rec && rec.name) || '';
            if (!name) return;
            let key = slug(name) || 'fighter';
            while (seen.has(key)) key += '-2';
            seen.add(key);
            const strength = Math.round(num(f.strength, creature ? (THREAT_STRENGTH[creature.threat] || 5) : 5, 1, 10));
            const wins = Math.round(num(f.wins, 0, 0, 9999)), losses = Math.round(num(f.losses, 0, 0, 9999));
            out.push({
                key, name, strength, wins, losses,
                kind: npc ? 'npc' : creature ? 'creature' : 'house',
                kindLabel: String(f.tag || '').trim() || (npc ? 'NPC' : creature ? 'Bestiary' : 'House fighter'),
                rec, url: rec ? store.url(rec) : '',
                avatar: String(f.image || '').trim() || (npc ? (npc.avatar || npc.portrait || '') : creature ? (creature.image || '') : ''),
                record: `${wins} – ${losses}`,
                hp: HP,
            });
        });
        return out;
    }

    /* ---------- the night ---------- */
    const calOf = store => store.calendar || (ATH.makeCalendar && store.singletons ? ATH.makeCalendar(store.singletons.calendar) : null);
    const fullDate = (cal, d) => cal && d && cal.isDate(d) && d.month && d.day && !cal.check(d) ? { year: Number(d.year), month: d.month, day: Number(d.day) } : null;
    function nextDay(cal, d) {
        const mi = cal.months.findIndex(m => m.name === d.month);
        if (d.day < cal.daysIn(d.year, mi)) return { ...d, day: d.day + 1 };
        if (mi < cal.months.length - 1) return { ...d, month: cal.months[mi + 1].name, day: 1 };
        return { year: d.year + 1, month: cal.months[0].name, day: 1 };
    }
    // The weekday names this pit fights on (only those the calendar knows)
    function nightsOf(store, poi) {
        const cal = calOf(store), list = ((poi.pit && poi.pit.nights) || []).map(s => String(s).trim()).filter(Boolean);
        if (!cal || !cal.weekdays.length) return [];
        return cal.weekdays.filter(w => list.some(n => n.toLowerCase() === w.toLowerCase()));
    }
    /* -> { date (or null), open, next (the next fight night after an off night, or null), label } */
    function night(store, poi, date) {
        const cal = calOf(store);
        const d = fullDate(cal, date || (cal && cal.now(store)));
        if (!d) return { date: null, open: true, next: null, label: '', dayNumber: 0 };
        const nights = nightsOf(store, poi);
        const isOn = x => !nights.length || nights.includes(cal.weekday(x));
        const label = cal.format(d, { era: false, year: false });
        let next = null;
        if (!isOn(d)) {
            let x = d;
            for (let i = 0; i < 2 * Math.max(1, cal.weekdays.length) && !next; i++) { x = nextDay(cal, x); if (isOn(x)) next = x; }
        }
        return { date: d, open: isOn(d), next, nextLabel: next ? cal.format(next, { era: false, year: false }) : '', label, dayNumber: cal.dayNumber(d) };
    }

    /* ---------- the card ---------- */
    function oddsFor(p) {
        const r = (1 - p) / p;
        let best = NICE_ODDS[0];
        for (const n of NICE_ODDS) if (Math.abs(Math.log(n[0] / n[1]) - Math.log(r)) < Math.abs(Math.log(best[0] / best[1]) - Math.log(r))) best = n;
        return { label: `${best[0]} to ${best[1]}`, pay: best[0] / best[1] };
    }

    const HITS = ['lands a heavy blow on {B}', 'drives a shoulder into {B}', 'catches {B} with a brutal swing', 'rakes {B} across the ribs', 'slams a knee into {B}', 'staggers {B} with a crushing strike'];
    const MISSES = ['lunges at {B} and finds only sand', 'swings wide; {B} slips away', 'feints, but {B} does not bite', 'is driven back by {B}'];
    const FINISH = ['{L} goes down and stays down.', '{L} hits the sand. The crowd roars.', 'The pitmaster calls it: {L} cannot go on.'];

    function fight(a, b, rng) {
        let ha = a.hp, hb = b.hp;
        const rounds = [];
        for (let r = 1; r <= MAX_ROUNDS && ha > 0 && hb > 0; r++) {
            // Tuned so the stronger fighter wins about as often as the odds say (a little more: the house's edge)
            const aAttacks = rng() < 0.5 + (a.strength / (a.strength + b.strength) - 0.5) * 0.35;
            const atk = aAttacks ? a : b, def = aAttacks ? b : a;
            const lands = rng() < 0.6 + (atk.strength - def.strength) * 0.01;
            let text;
            if (lands) {
                const dmg = 4 + Math.floor(rng() * 6) + Math.floor(atk.strength / 4);
                if (aAttacks) hb = Math.max(0, hb - dmg); else ha = Math.max(0, ha - dmg);
                text = `${atk.name} ${HITS[Math.floor(rng() * HITS.length)].replace('{B}', def.name)}.`;
            } else {
                text = `${atk.name} ${MISSES[Math.floor(rng() * MISSES.length)].replace('{B}', def.name)}.`;
            }
            rounds.push({ n: r, text, ha, hb });
        }
        let winner;
        if (ha > 0 && hb > 0) {                   // still standing at the last round: the crowd decides
            winner = ha / a.hp >= hb / b.hp ? 'a' : 'b';
            rounds.push({ n: 0, text: 'The bell. The pitmaster raises a hand to the crowd’s roar.', ha: winner === 'a' ? ha : 0, hb: winner === 'b' ? hb : 0 });
        } else winner = hb === 0 ? 'a' : 'b';
        const loser = winner === 'a' ? b : a;
        rounds[rounds.length - 1].text += ' ' + FINISH[Math.floor(rng() * FINISH.length)].replace('{L}', loser.name);
        return { rounds, winner };
    }

    function card(store, poi, code, date) {
        const T = ATH.tavern;
        const pit = (poi && poi.pit) || {};
        const n = night(store, poi, date);
        const all = fighters(store, poi);
        if (!n.open || all.length < 2) return { night: n, bouts: [], fighters: all };
        const base = `pit|${T.normaliseCode(code || '')}|${poi.id}|${n.dayNumber}`;
        const rng = T.mulberry32(T.hash(base));
        const count = Math.min(Math.round(num(pit.bouts, DEFAULT_BOUTS, 1, 6)), Math.floor(all.length / 2));
        const drawn = T.seededPick(all, count * 2, rng);
        const pairs = [];
        for (let i = 0; i < count; i++) pairs.push([drawn[2 * i], drawn[2 * i + 1]]);
        pairs.sort((x, y) => (x[0].strength + x[1].strength) - (y[0].strength + y[1].strength));   // the main event last
        // Fixed fights of tonight (DM only): fighter key -> true
        const cal = calOf(store);
        const fixed = new Set((poi.pitFixes || []).filter(f => {
            const d = f && fullDate(cal, f.date);
            return d && n.date && cal.dayNumber(d) === n.dayNumber;
        }).map(f => slug(f.winner)));
        const bouts = pairs.map(([a, b], i) => {
            const p = a.strength / (a.strength + b.strength);
            const oa = oddsFor(p), ob = oddsFor(1 - p);
            const want = fixed.has(a.key) && !fixed.has(b.key) ? 'a' : fixed.has(b.key) && !fixed.has(a.key) ? 'b' : null;
            let result = null;
            for (let k = 0; k < 60; k++) {
                result = fight(a, b, T.mulberry32(T.hash(`${base}|${i}|${k}`)));
                if (!want || result.winner === want) break;
            }
            if (want && result.winner !== want) {      // a fix the dice would not give: the last blow decides
                const last = result.rounds[result.rounds.length - 1], w = want === 'a' ? a : b, l = want === 'a' ? b : a;
                last.ha = want === 'a' ? Math.max(1, last.ha) : 0; last.hb = want === 'b' ? Math.max(1, last.hb) : 0;
                last.text = `${w.name} finds an opening no one saw. ${l.name} goes down and stays down.`;
                result.winner = want;
            }
            return {
                index: i, id: `${poi.id}|${n.dayNumber}|${T.normaliseCode(code || '')}|${i}`,
                label: count === 1 || i === count - 1 ? 'Main event' : i === 0 ? 'Opening bout' : `Bout ${i + 1}`,
                a: { ...a, odds: oa.label, pay: oa.pay }, b: { ...b, odds: ob.label, pay: ob.pay },
                rounds: result.rounds, winner: result.winner, fixed: !!want,
            };
        });
        return { night: n, bouts, fighters: all };
    }

    // What a winning bet brings back (stake included), after the house's cut of the gain
    const cutOf = poi => num(poi.pit && poi.pit.houseCut, DEFAULT_CUT, 0, 50);
    const payout = (poi, stake, pay) => stake + Math.floor(stake * pay * (1 - cutOf(poi) / 100));

    /* ---------- bets (this browser) ---------- */
    let betsMemory = {};
    function readBets() {
        try { return JSON.parse(localStorage.getItem(BETS_KEY) || 'null') || betsMemory; } catch (e) { return betsMemory; }
    }
    function writeBets(all) {
        const keys = Object.keys(all);
        if (keys.length > BETS_KEEP) keys.slice(0, keys.length - BETS_KEEP).forEach(k => delete all[k]);
        betsMemory = all;
        try { localStorage.setItem(BETS_KEY, JSON.stringify(all)); } catch (e) { /* private mode */ }
    }

    /* ---------- the Pit tab ---------- */
    function mount(el, store, poi, code) {
        const T = ATH.tavern, coin = T.formatCoin;
        const G = ATH.games && ATH.games.purse ? ATH.games.purse : null;   // no gaming table code = watch only
        const start = T.startingPurse(store);
        const pit = poi.pit || {};
        const tonight = card(store, poi, code);
        const maxWager = num(pit.maxWager, 0, 0, 1e6) * 100;
        let view = null;        // the bout open, or null = the card
        let pick = null, stake = 0, timer = null;

        const purseCp = () => (G ? G.read(start).cp : 0);
        const avatar = f => f.avatar
            ? `<img class="pit-avatar" src="${esc(f.avatar)}" alt="">`
            : `<span class="pit-avatar pit-avatar--letter" aria-hidden="true">${esc(f.name.replace(/^the\s+/i, '').charAt(0).toUpperCase())}</span>`;
        const kind = f => `<span class="pit-kind pit-kind--${f.kind}">${esc(f.kindLabel)}</span>`;
        const nameOf = (b, side) => b[side].name;

        function purseLine() {
            return G ? `<p class="pit-purse"><span class="material-symbols-outlined" aria-hidden="true">savings</span> Your purse: <b>${esc(coin(purseCp()))}</b></p>` : '';
        }
        function roster(list) {
            if (!list.length) return '';
            return `<details class="pit-roster"><summary>The fighters <span>${list.length}</span></summary><ul>${list.map(f => `
                <li class="pit-roster__row">${avatar(f)}
                    <span class="pit-roster__name">${f.url ? `<a href="${esc(f.url)}" data-kw="${esc(f.rec.id)}">${esc(f.name)}</a>` : esc(f.name)}</span>
                    ${kind(f)}<span class="pit-roster__record">${esc(f.record)}</span></li>`).join('')}</ul></details>`;
        }

        function drawCard() {
            clearInterval(timer); view = null;
            const n = tonight.night, bets = readBets();
            let body;
            if (!n.open) {
                body = `<div class="pit-closed"><p class="pit-closed__head">No fights tonight</p>
                    <p>${esc(n.label)}. ${n.next ? `The next fight night is <b>${esc(n.nextLabel)}</b>.` : ''}</p></div>`;
            } else if (!tonight.bouts.length) {
                body = '<p class="pit-muted">The pit is empty tonight: not enough fighters.</p>';
            } else {
                body = `<ul class="pit-card">${tonight.bouts.map(b => {
                    const bet = bets[b.id];
                    const won = bet && (b.winner === 'a' ? b.a : b.b).name;
                    return `<li><button type="button" class="pit-bout${bet ? ' is-settled' : ''}" data-bout="${b.index}">
                        <span class="pit-bout__side">
                            <span class="pit-bout__name">${esc(b.a.name)}</span>
                            <span class="pit-bout__meta">${kind(b.a)}<span>${esc(b.a.record)}</span></span>
                        </span>
                        <span class="pit-bout__mid">
                            <span class="pit-bout__label">${esc(b.label)}</span>
                            <span class="pit-bout__vs">vs</span>
                            <span class="pit-bout__status">${bet ? `${esc(won)} won${bet.pick ? (bet.net > 0 ? ` · +${esc(coin(bet.net))}` : ` · −${esc(coin(bet.stake))}`) : ''}` : `${esc(b.a.odds)} · ${esc(b.b.odds)}`}</span>
                        </span>
                        <span class="pit-bout__side pit-bout__side--b">
                            <span class="pit-bout__name">${esc(b.b.name)}</span>
                            <span class="pit-bout__meta"><span>${esc(b.b.record)}</span>${kind(b.b)}</span>
                        </span>
                    </button></li>`;
                }).join('')}</ul>
                <p class="pit-note">Pick a bout and back a fighter. The odds are the pitmaster’s; the house takes ${cutOf(poi)}% of what a winning bet earns. A bout’s result is fixed for the night.</p>`;
            }
            el.innerHTML = `
                ${purseLine()}
                <p class="poi-eyebrow poi-center">${n.label ? (n.open ? 'Tonight’s card' : 'Tonight') : 'The card'}</p>
                ${n.label && n.open ? `<p class="pit-date">${esc(n.label)}</p>` : ''}
                ${body}
                ${roster(tonight.fighters)}`;
        }

        function drawBout(i, { animate = false } = {}) {
            const b = tonight.bouts[i];
            if (!b) return drawCard();
            view = i;
            const bet = readBets()[b.id];
            const settled = !!bet;
            const purse = purseCp();
            const chips = CHIPS.filter(v => !maxWager || v <= maxWager);
            const corner = side => {
                const f = b[side];
                return `<button type="button" class="pit-corner${pick === side ? ' is-picked' : ''}" data-pick="${side}" ${settled || !G ? 'disabled' : ''} aria-pressed="${pick === side}">
                    ${avatar(f)}
                    <span class="pit-corner__name">${esc(f.name)}</span>
                    <span class="pit-corner__meta">${kind(f)}<span>${esc(f.record)}</span></span>
                    <span class="pit-corner__odds">pays ${esc(f.odds)}</span>
                    <span class="pit-hp" aria-hidden="true"><span class="pit-hp__fill" data-hp="${side}"></span></span>
                </button>`;
            };
            el.innerHTML = `
                ${purseLine()}
                <div class="pit-head">
                    <button type="button" class="gt-back" data-back><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Tonight’s card</button>
                    <span class="pit-bout__label">${esc(b.label)}</span>
                </div>
                <div class="pit-corners">${corner('a')}<span class="pit-corners__vs" aria-hidden="true">vs</span>${corner('b')}</div>
                ${settled ? '' : `
                <div class="pit-wager">
                    ${G ? `<p class="pit-wager__label" id="pit-wager-label">Your wager</p>
                    <div class="pit-chips" role="group" aria-labelledby="pit-wager-label">${chips.map(v => `<button type="button" class="pit-chip${stake === v ? ' is-on' : ''}" data-stake="${v}" ${v > purse ? 'disabled' : ''} aria-pressed="${stake === v}">${esc(coin(v))}</button>`).join('')}</div>
                    ${purse < chips[0] ? '<p class="pit-muted">Your purse is empty. You can still watch.</p>' : ''}
                    <button type="button" class="poi-button pit-place" data-place ${pick && stake && stake <= purse ? '' : 'disabled'}>${pick && stake ? `Wager ${esc(coin(stake))} on ${esc(nameOf(b, pick))}` : 'Pick a fighter and a wager'}</button>` : ''}
                    <button type="button" class="gt-link pit-watch" data-watch>Watch without betting</button>
                </div>`}
                <ol class="pit-log" data-log aria-live="polite" ${settled ? '' : 'hidden'}></ol>
                <div class="pit-result" data-result hidden></div>
                <button type="button" class="gt-link pit-skip" data-skip hidden>Skip to the end</button>`;
            if (settled) play(b, bet, animate);
            else setHp(b, b.a.hp, b.b.hp);
        }

        function setHp(b, ha, hb) {
            const fa = el.querySelector('[data-hp="a"]'), fb = el.querySelector('[data-hp="b"]');
            if (fa) fa.style.width = `${Math.round(100 * ha / b.a.hp)}%`;
            if (fb) fb.style.width = `${Math.round(100 * hb / b.b.hp)}%`;
        }

        function play(b, bet, animate) {
            const log = el.querySelector('[data-log]'), skip = el.querySelector('[data-skip]');
            log.hidden = false;
            let step = animate ? 0 : b.rounds.length;
            const draw = () => {
                const shown = b.rounds.slice(0, step);
                log.innerHTML = shown.slice().reverse().map((r, k) => `<li class="${k === 0 ? 'is-new' : ''}"><span class="pit-log__round">${r.n ? `Round ${r.n}` : 'Bell'}</span>${esc(r.text)}</li>`).join('');
                const last = shown[shown.length - 1];
                setHp(b, last ? last.ha : b.a.hp, last ? last.hb : b.b.hp);
                if (step >= b.rounds.length) {
                    clearInterval(timer); skip.hidden = true;
                    const w = b[b.winner];
                    const line = !bet.pick ? 'You watched from the rail.'
                        : bet.net > 0 ? `You collect ${coin(bet.stake + bet.net)} (+${coin(bet.net)}).`
                            : `You lose your ${coin(bet.stake)}.`;
                    const res = el.querySelector('[data-result]');
                    res.innerHTML = `<p class="poi-eyebrow">The crowd roars</p><p class="pit-result__head">${esc(w.name)} wins</p><p class="pit-result__line">${esc(line)}</p>`;
                    res.className = `pit-result${bet.pick ? (bet.net > 0 ? ' is-win' : ' is-loss') : ''}`;
                    res.hidden = false;
                    el.querySelectorAll(`[data-pick="${b.winner}"]`).forEach(c => c.classList.add('is-winner'));
                    const pf = el.querySelector('.pit-purse b');
                    if (pf) pf.textContent = coin(purseCp());
                }
            };
            clearInterval(timer);
            if (animate) {
                skip.hidden = false;
                timer = setInterval(() => { step++; draw(); }, 900);
            }
            draw();
            skip.onclick = () => { step = b.rounds.length; draw(); };
        }

        // Bet (or watch): settled at once, then shown blow by blow
        function settle(watching) {
            const b = tonight.bouts[view];
            if (!b || readBets()[b.id]) return;
            let bet = { pick: null, stake: 0, net: 0 };
            if (!watching && G && pick && stake) {
                const p = G.read(start);
                if (p.cp < stake) return;
                const gross = pick === b.winner ? payout(poi, stake, b[pick].pay) : 0;
                p.cp += gross - stake;
                G.write(p);
                bet = { pick, stake, net: gross - stake };
            }
            const all = readBets(); all[b.id] = bet; writeBets(all);
            drawBout(view, { animate: true });
        }

        el.addEventListener('click', e => {
            const t = e.target;
            const bout = t.closest('[data-bout]');
            if (bout) { pick = null; stake = 0; drawBout(Number(bout.dataset.bout)); return; }
            if (t.closest('[data-back]')) { drawCard(); return; }
            const side = t.closest('[data-pick]');
            if (side && !side.disabled) { pick = side.dataset.pick; drawBout(view); return; }
            const chip = t.closest('[data-stake]');
            if (chip && !chip.disabled) { stake = Number(chip.dataset.stake); drawBout(view); return; }
            if (t.closest('[data-place]')) { settle(false); return; }
            if (t.closest('[data-watch]')) { settle(true); return; }
        });
        drawCard();
    }

    ATH.pit = { fighters, night, nightsOf, card, payout, mount, _test: { fight, oddsFor, nextDay } };
})(typeof window !== 'undefined' ? window : globalThis);
