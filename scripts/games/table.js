/* =====================================================================
   GAMING TABLE  —  Athenaeum.games, Athenaeum.dice
   ---------------------------------------------------------------------
   The Games tab of a tavern (poi.html): the games listed in
   poi.tavern.games (enum tavernGame in data/schema.js), played in the
   browser against bots. No server: the win tally, the purse and the ledger
   are kept per browser (localStorage).

   A game is a file in scripts/games/ that calls
       Athenaeum.games.register({
           id: 'liars-dice',            // = its id in the tavernGame enum
           kind: 'dice',                // 'dice' (default) or 'cards'
           blurb: 'One line for the picker',
           rules: '<p>…</p>',           // shown under "How to play"
           opponents: 3,                // bots it needs
           mount(el, ctx) {}            // draws the game into el; returns { destroy() }
       });
   ctx = { you, opponents: [seat…], onEnd(result, info), esc, dice, bank, coin, purseHtml(i) }
   (purseHtml(i) = regular i's purse, to show next to their name; '' when nothing is at stake)
   seat = { name, avatar, initial, npc, purse }   result = 'win' | 'loss' | 'draw'
   info = { share, winners }
       share    on a draw, how many players (you included) split the pot
       winners  indexes (in ctx.opponents) of the regulars who take or share the pot;
                [] on a loss = nobody takes it, and it stays on the table for the next hand
   ctx.opponents is live: a regular who is cleaned out leaves between hands and someone
   else takes the stool, so a game re-reads it at the start of every hand.

   STAKES. Before a game starts the player names their stakes (enum gameStakes) or
   plays for fun. The blind is the stakes' base blind x the tavern's tier; every seat
   puts one blind in the pot per hand. The purse (settings.startingPurse) lives in the
   player's browser, the regulars get a purse of their own for the sitting.
   How a game bets is declared when it registers:
       bet: false              no coin at this game
       bet: { raises: 1 }      how many times a hand the player may raise (default 0)
   and it takes part by calling, on ctx.bank (the same interface whether coin is at
   stake or not: with nothing at stake every call is a harmless no-op):
       bank.ante()             at the start of EVERY hand -> false if the purse can't cover the blind
       bank.canRaise()         / bank.raiseWhy()  may the player raise now, and if not, why
       bank.botCan(i)          can regular i afford to match a raise
       bank.raise([i…])        one more blind from the player, matched by the regulars listed
                               (the game decides who calls and who folds); returns the blind paid, 0 = refused
       ctx.onEnd(result, info) settles the pot, once per hand (a second call is ignored)
   The tavern can keep a cut of every pot (tavern.houseCut), hide the lowest stakes
   (tavern.minStake) and lock its highest table behind wins (tavern.highTableWins).
   A broke player borrows from the house (settings.loanInterest); half of every win
   repays the loan. Odd coins of a split pot stay on the table for the next hand.

   Opponents are the NPCs whose home is the tavern, then generic regulars.
   Styles: styles/games.css.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const GAMES = new Map();
    const TALLY_KEY = 'athenaeum.games';

    /* ---------- dice ---------- */
    const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
    const roll = () => 1 + Math.floor(Math.random() * 6);
    // One die: a 3 x 3 grid of pips. value 0 = hidden (cup side).
    function dieHtml(value, { cls = '', label = true } = {}) {
        if (!value) return `<span class="die die--hidden ${cls}" aria-label="hidden die"></span>`;
        const on = PIPS[value];
        return `<span class="die die--${value} ${cls}" ${label ? `role="img" aria-label="${WORDS[value]}"` : 'aria-hidden="true"'}>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<i${on.includes(i) ? ' class="on"' : ''}></i>`).join('')}</span>`;
    }
    // Tumbles a die element through random faces, then lands on `value`
    function tumble(el, value, ms = 450) {
        return new Promise(resolve => {
            if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { if (el) el.outerHTML = dieHtml(value); resolve(); return; }
            el.classList.add('is-rolling');
            const t = setInterval(() => {
                const face = roll();
                el.className = `die die--${face} is-rolling`;
                el.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<i${PIPS[face].includes(i) ? ' class="on"' : ''}></i>`).join('');
            }, 70);
            setTimeout(() => { clearInterval(t); el.outerHTML = dieHtml(value, { cls: 'is-landed' }); resolve(); }, ms);
        });
    }
    ATH.dice = { roll, html: dieHtml, tumble, WORDS };

    /* ---------- mini-cards for the game picker ---------- */
    const PICK_SUITS = [
        { sym: '♠', cls: 'ink' },
        { sym: '♥', cls: 'crimson' },
        { sym: '♦', cls: 'crimson' },
        { sym: '♣', cls: 'ink' },
    ];
    const PICK_RANKS = ['A', 'K', 'Q', 'J', '10'];
    function pickCardsHtml() {
        const s1 = PICK_SUITS[Math.floor(Math.random() * PICK_SUITS.length)];
        const s2 = PICK_SUITS[(PICK_SUITS.indexOf(s1) + 1 + Math.floor(Math.random() * 3)) % PICK_SUITS.length];
        const r1 = PICK_RANKS[Math.floor(Math.random() * PICK_RANKS.length)];
        const r2 = PICK_RANKS[Math.floor(Math.random() * PICK_RANKS.length)];
        return `<span class="gt-pick__card gt-pick__card--${s1.cls}"><b>${r1}</b><i>${s1.sym}</i></span>` +
            `<span class="gt-pick__card gt-pick__card--${s2.cls}"><b>${r2}</b><i>${s2.sym}</i></span>`;
    }

    /* ---------- registry ---------- */
    const games = {
        register(game) { GAMES.set(game.id, game); },
        get: id => GAMES.get(id),
    };

    /* ---------- opponents ---------- */
    const REGULARS = ['Old Brannoc', 'Mags the Fishwife', 'Tobin Quickfingers', 'Sister Ilse', 'Gerrit One-Ear', 'Wenna', 'Corporal Dask', 'Pell the Tinker', 'Yorra Saltbeard', 'Fenwick'];
    function shuffle(list) {
        const a = [...list];
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }
    function pickOpponents(store, poi, n) {
        const npcs = shuffle(store.backrefs(poi, 'npc', 'home')).map(npc => ({
            name: npc.name, avatar: npc.avatar || npc.portrait || '', npc,
        }));
        const others = shuffle(REGULARS).map(name => ({ name, avatar: '' }));
        return [...npcs, ...others].slice(0, n).map(s => ({ ...s, initial: s.name.replace(/^(the|old|sister|corporal)\s+/i, '').charAt(0).toUpperCase() }));
    }
    // A seat's portrait: the NPC's picture or a lettered token
    const avatarHtml = seat => seat.avatar
        ? `<img class="gt-avatar" src="${esc(seat.avatar)}" alt="">`
        : `<span class="gt-avatar gt-avatar--letter" aria-hidden="true">${esc(seat.initial || '?')}</span>`;

    /* ---------- the purse and the ledger (this browser) ---------- */
    const PURSE_KEY = 'athenaeum.purse', LEDGER_KEY = 'athenaeum.ledger';
    let purseMemory = null, ledgerMemory = null; // kept for this visit when localStorage is blocked
    function readPurse(start) {
        let p = null;
        try { p = JSON.parse(localStorage.getItem(PURSE_KEY) || 'null'); } catch (e) { /* ignore */ }
        if (!p || typeof p !== 'object') p = purseMemory;
        // No purse yet, or the DM changed the starting purse in Settings: a fresh one for everyone
        if (!p || !Number.isFinite(p.cp) || p.start !== start) p = { cp: start, start };
        return {
            cp: p.cp, start,
            debt: Number.isFinite(p.debt) && p.debt > 0 ? p.debt : 0,     // owed to the house (loan)
            hand: p.hand && Number.isFinite(p.hand.staked) ? p.hand : null, // a hand in progress: what you have in the pot
        };
    }
    function writePurse(p) {
        purseMemory = { ...p };
        try { localStorage.setItem(PURSE_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
    }
    // The ledger: staked hands only. { games: {id: row}, taverns: {id: row}, peak }  row = { hands, wins, net, best }
    function readLedger() {
        let l = null;
        try { l = JSON.parse(localStorage.getItem(LEDGER_KEY) || 'null'); } catch (e) { /* ignore */ }
        if (!l || typeof l !== 'object') l = ledgerMemory;
        l = l && typeof l === 'object' ? l : {};
        return { games: l.games || {}, taverns: l.taverns || {}, peak: Number.isFinite(l.peak) ? l.peak : 0 };
    }
    function writeLedger(l) {
        ledgerMemory = l;
        try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch (e) { /* private mode */ }
    }
    const ledgerRow = row => ({ hands: 0, wins: 0, net: 0, best: 0, ...(row || {}) });
    function logHand({ game, tavern, result, net, pot, purse }) {
        const l = readLedger();
        for (const [bucket, id] of [['games', game], ['taverns', tavern]]) {
            if (!id) continue;
            const row = ledgerRow(l[bucket][id]);
            row.hands++; row.net += net;
            if (result === 'win') { row.wins++; row.best = Math.max(row.best, pot || 0); }
            l[bucket][id] = row;
        }
        if (Number.isFinite(purse)) l.peak = Math.max(l.peak, purse);
        writeLedger(l);
    }

    /* ---------- the bank: purse, pot, stakes ---------- */
    /* One bank per sitting. Everything it needs is passed in, so it can be tested on its own:
         betting     false = a table where no coin changes hands (every call is a no-op)
         start       the starting purse (cp)          options   [{ id, label, blind }]
         opponents   the regulars' seats (live array)  replace   i -> a new seat for stool i
         cut         % of every pot the house keeps    interest  % on a house loan (0 = a free fresh purse)
         maxRaises   raises the player may make a hand highWins  wins in this house to unlock its highest stakes
         tavern, game, gameName  for the ledger       coin      cp -> text
         notify(kind)  redraws the purse bar: 'ante' | 'raise' | 'settle' | 'stakes' | 'purse' */
    function makeBank(cfg = {}) {
        const {
            betting = true, start = 0, opponents = [], replace = null, cut = 0, interest = 0, maxRaises = 0,
            highWins = 0, tavern = '', game = '', gameName = '', coin = n => `${n} cp`, notify = () => { },
        } = cfg;
        const options = betting ? (cfg.options || []) : null;
        let purse = betting ? readPurse(start) : { cp: 0, start: 0, debt: 0, hand: null };
        let stake = null;                        // the stakes chosen; null = playing for fun
        let pot = 0, staked = 0, raises = 0, live = false, anted = false;
        let carry = 0;                           // coin left on the table by the last hand
        let last = null;                         // how the last settled hand went for you
        let events = [];                         // news for the purse bar (a regular leaves, a hand was abandoned…)
        const save = kind => { if (betting) writePurse(purse); notify(kind); };
        const top = () => options.reduce((a, o) => (o.blind > a.blind ? o : a), options[0]);
        const winsHere = () => ledgerRow(readLedger().taverns[tavern]).wins;
        const lockedFor = o => (highWins > 0 && options.length > 1 && o === top()) ? Math.max(0, highWins - winsHere()) : 0;
        const cheapest = () => Math.min(...options.filter(o => !lockedFor(o)).map(o => o.blind));
        const botPurse = () => stake.blind * (8 + Math.floor(Math.random() * 13));

        // A hand left in the pot by a reload or a closed tab: the stake is gone, and we say so
        if (betting && purse.hand) {
            const h = purse.hand;
            logHand({ game: h.game, tavern: h.tavern, result: 'loss', net: -h.staked, pot: 0 });
            events.push(`You walked away from a hand${h.gameName ? ` of ${h.gameName}` : ''}: your ${coin(h.staked)} stayed in the pot.`);
            purse.hand = null;
            writePurse(purse);
        }

        return {
            options, start, interest, cut, maxRaises,
            get seats() { return opponents.length + 1; },
            get enabled() { return !!stake; },
            get stake() { return stake; },
            get blind() { return stake ? stake.blind : 0; },
            get balance() { return purse.cp; },
            get debt() { return purse.debt; },
            get pot() { return pot; },
            get carry() { return carry; },
            get staked() { return staked; },
            get live() { return live; },
            get anted() { return anted; },
            get raises() { return raises; },
            get last() { return last; },
            get broke() { return betting && purse.cp < cheapest(); },
            get canRefill() { return betting && !live && purse.cp < cheapest() && start >= cheapest(); },
            get owed() { return Math.ceil(start * (100 + interest) / 100); },   // what a loan costs
            canAfford: cp => !betting || purse.cp >= cp,
            takeEvents() { const e = events; events = []; return e; },
            // Why these stakes can't be picked right now ('' = they can)
            whyNot(o) {
                if (!betting || !o) return '';
                if (live) return 'Stakes are fixed until this hand is settled.';
                const need = lockedFor(o);
                if (need) return `Win ${need} more staked hand${need === 1 ? '' : 's'} in this house to sit at the ${o.label.toLowerCase()} table.`;
                if (o.blind > purse.cp) return `Your purse can’t cover the ${coin(o.blind)} blind.`;
                return '';
            },
            // 'friendly' = for fun. Stakes can only change between hands, and only to ones the purse covers.
            choose(id) {
                if (!betting || live) return false;
                const next = id === 'friendly' ? null : options.find(o => o.id === id);
                if (id !== 'friendly' && (!next || this.whyNot(next))) return false;
                if (next === stake) return true;
                stake = next;
                // The regulars bring a purse that suits the stakes
                opponents.forEach(s => { s.purse = stake ? botPurse() : null; });
                notify('stakes');
                return true;
            },
            // Broke: borrow a starting purse from the house (repaid with interest out of your wins), or a free one
            refill() {
                if (!this.canRefill) return false;
                if (interest > 0) { purse.cp += start; purse.debt += this.owed; }
                else purse = { cp: start, start, debt: 0, hand: null };
                last = null;
                save('purse');
                return true;
            },
            // Every seat puts the blind in the pot. false = you can't cover it (nothing is taken).
            ante() {
                if (live) return true;           // already in this hand: never charged twice
                if (stake && purse.cp < stake.blind) return false;
                anted = true; live = true; raises = 0; last = null;
                if (!stake) { pot = 0; staked = 0; notify('ante'); return true; }
                // A regular who can't cover the blind leaves; someone else takes the stool
                opponents.forEach((s, i) => {
                    if (s.purse >= stake.blind) return;
                    const next = replace ? replace(i) : null;
                    if (next) {
                        events.push(`${s.name} is cleaned out and leaves the table. ${next.name} pulls up a stool.`);
                        opponents[i] = next;
                    }
                    opponents[i].purse = botPurse();
                });
                purse.cp -= stake.blind;
                opponents.forEach(s => { s.purse -= stake.blind; });
                staked = stake.blind;
                pot = stake.blind * this.seats + carry;
                carry = 0;
                purse.hand = { staked, tavern, game, gameName };
                save('ante');
                return true;
            },
            // A mid-hand raise: one more blind from your purse, matched by the regulars who call
            canRaise() { return !!stake && live && raises < maxRaises && purse.cp >= stake.blind; },
            raiseWhy() {
                if (!stake || !live) return '';
                if (raises >= maxRaises) return maxRaises ? 'You have already raised this hand.' : '';
                return purse.cp < stake.blind ? 'Not enough coin in your purse.' : '';
            },
            botCan: i => !!stake && !!opponents[i] && opponents[i].purse >= stake.blind,
            // `callers` = indexes of the regulars who match it (default: all who can). Returns the blind paid, 0 = refused.
            raise(callers) {
                if (!this.canRaise()) return 0;
                const who = (callers || opponents.map((_, i) => i)).filter(i => this.botCan(i));
                purse.cp -= stake.blind; staked += stake.blind;
                who.forEach(i => { opponents[i].purse -= stake.blind; });
                pot += stake.blind * (1 + who.length);
                raises++;
                purse.hand = { staked, tavern, game, gameName };
                save('raise');
                return stake.blind;
            },
            /* Settles the hand, once. win = the pot, draw = your share, loss = nothing.
               info.winners = the regulars who take or share it ([] on a loss: nobody does, it stays on the table).
               The house takes its cut of any pot that is paid out; odd coins stay on the table. */
            settle(result, info = {}) {
                if (!live) return 0;
                live = false;
                if (!stake) { pot = 0; staked = 0; notify('settle'); return 0; }
                const winners = Array.isArray(info.winners) ? info.winners.filter(i => opponents[i]) : null;
                let won = 0, taken = 0, left = 0;
                if (result === 'loss' && winners && !winners.length) left = pot;
                else {
                    taken = Math.floor(pot * cut / 100);
                    const net = pot - taken;
                    const heads = result === 'win' ? 1 : result === 'draw' ? Math.max(1, info.share || (winners ? winners.length + 1 : 1)) : (winners ? winners.length : 1);
                    const part = Math.floor(net / heads);
                    left = net - part * heads;
                    if (result !== 'loss') won = part;
                    if (result !== 'win' && winners) winners.forEach(i => { opponents[i].purse += part; });
                }
                // Half of what you made on the hand goes to the house while you owe it
                const gain = won - staked;
                const repaid = gain > 0 && purse.debt > 0 ? Math.min(purse.debt, Math.ceil(gain / 2)) : 0;
                purse.cp += won - repaid;
                purse.debt -= repaid;
                purse.hand = null;
                last = { result, staked, pot, cut: taken, won, repaid, left, net: gain, unclaimed: left === pot && pot > 0 };
                logHand({ game, tavern, result, net: gain, pot, purse: purse.cp });
                carry = left; pot = 0; staked = 0;
                save('settle');
                return won;
            },
            // Leaving the table mid-hand: what you put in stays in the pot
            abandon() {
                if (!live) return;
                live = false;
                if (stake) {
                    logHand({ game, tavern, result: 'loss', net: -staked, pot: 0 });
                    purse.hand = null;
                }
                pot = 0; staked = 0;
                save('settle');
            },
        };
    }
    // A table where no coin changes hands: the same interface, nothing is ever charged
    const NO_BANK = makeBank({ betting: false });

    /* ---------- win tally (this browser) ---------- */
    function tally(gameId, result) {
        let all = {};
        try { all = JSON.parse(localStorage.getItem(TALLY_KEY) || '{}'); } catch (e) { /* ignore */ }
        const t = all[gameId] || { win: 0, loss: 0, draw: 0 };
        if (result) {
            t[result] = (t[result] || 0) + 1;
            all[gameId] = t;
            try { localStorage.setItem(TALLY_KEY, JSON.stringify(all)); } catch (e) { /* private mode */ }
        }
        return t;
    }

    /* ---------- the Games tab ---------- */
    // "A", "A and B", "A, B and C"
    const andList = list => list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
    const signed = (cp, coin) => `${cp > 0 ? '+' : cp < 0 ? '−' : ''}${coin(Math.abs(cp))}`;
    const COINS_MAX = 14; // coins drawn in the pot, one per blind

    // Draws the table into `el`: a picker when the tavern has several games, then the game.
    function mountTable(el, store, poi) {
        const T = ATH.tavern;
        const coin = T.formatCoin;
        const ids = ((poi.tavern && poi.tavern.games) || []).filter(id => GAMES.has(id));
        const labels = Object.fromEntries(store.enumOptions('tavernGame').map(o => [o.id, o.label]));
        const rules = T.gaming(store, poi.tavern);   // { houseCut, highTableWins, loanInterest }
        let current = null;
        let active = null; // the sitting in progress: { bank, begin, leave }

        function picker() {
            if (current) { current.destroy && current.destroy(); current = null; }
            active = null;
            if (ids.length === 1) return play(ids[0]);
            const ledger = readLedger();
            const betting = ids.some(id => GAMES.get(id).bet !== false);
            el.innerHTML = `
                <p class="gt-lede">Pull up a stool. The regulars are always up for a game.</p>
                ${betting ? `<p class="gt-purseline"><span class="material-symbols-outlined" aria-hidden="true">savings</span> Your purse: <b>${esc(coin(readPurse(T.startingPurse(store)).cp))}</b></p>` : ''}
                <div class="gt-picker">${ids.map(id => {
                const game = GAMES.get(id);
                const t = tally(id);
                const row = ledgerRow(ledger.games[id]);
                const isCards = game.kind === 'cards' || game.icon === 'cards';
                const iconHtml = isCards
                    ? `<span class="gt-pick__dice gt-pick__dice--cards" aria-hidden="true">${pickCardsHtml()}</span>`
                    : `<span class="gt-pick__dice" aria-hidden="true">${dieHtml(roll(), { label: false })}${dieHtml(roll(), { label: false })}</span>`;
                return `<button type="button" class="gt-pick" data-game="${esc(id)}">
                        ${iconHtml}
                        <span class="gt-pick__name">${esc(labels[id] || id)}</span>
                        <span class="gt-pick__blurb">${esc(game.blurb)}</span>
                        ${t.win + t.loss + t.draw ? `<span class="gt-pick__tally">Your record: ${t.win} won · ${t.loss} lost${t.draw ? ` · ${t.draw} drawn` : ''}${row.hands ? ` · ${esc(signed(row.net, coin))}` : ''}</span>` : ''}
                    </button>`;
            }).join('')}</div>`;
        }

        function play(id) {
            const game = GAMES.get(id);
            const name = labels[id] || id;
            const opponents = pickOpponents(store, poi, game.opponents || 1);
            // Someone to take the stool of a regular who is cleaned out
            const replace = () => {
                const seated = new Set(opponents.map(o => o.name));
                return pickOpponents(store, poi, 99).find(s => !seated.has(s.name)) || null;
            };
            el.innerHTML = `
                <div class="gt-head">
                    ${ids.length > 1 ? '<button type="button" class="gt-back" data-back><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Games</button>' : ''}
                    <h4 class="gt-title">${esc(name)}</h4>
                    <span class="gt-tally" data-tally></span>
                </div>
                <div class="gt-leave" data-leave role="alertdialog" aria-labelledby="gt-leave-text" hidden>
                    <p id="gt-leave-text" data-leave-text></p>
                    <button type="button" class="gt-link" data-leave-no>Keep playing</button>
                    <button type="button" class="gt-link gt-link--danger" data-leave-yes>Leave the table</button>
                </div>
                <div class="gt-bank" data-bank hidden>
                    <div class="gt-bank__row">
                        <span class="gt-bank__item"><span class="material-symbols-outlined" aria-hidden="true">savings</span><span class="gt-bank__label">Purse</span><b data-purse></b></span>
                        <span class="gt-bank__item gt-bank__item--debt" data-debt-wrap hidden><span class="gt-bank__label">Owed to the house</span><b data-debt></b></span>
                        <button type="button" class="gt-bank__refill" data-refill hidden></button>
                    </div>
                    <p class="gt-bank__news" data-news role="status"></p>
                    <div class="gt-bank__stakes" data-stakes role="group" aria-label="Stakes" hidden></div>
                    <p class="gt-bank__hint" data-hint role="status"></p>
                </div>
                <div class="gt-pot" data-pot hidden>
                    <div class="gt-pot__plate">
                        <div class="gt-pot__pile" data-pile aria-hidden="true"></div>
                        <div class="gt-pot__amount"><span class="gt-bank__label" data-pot-label>Pot</span><b data-pot-amount></b></div>
                    </div>
                    <div class="gt-sum" data-sum role="status"></div>
                </div>
                <div class="gt-game" data-game-root></div>
                <details class="gt-rules"><summary>How to play</summary>${game.rules}</details>
                <details class="gt-rules gt-ledger" data-ledger hidden><summary>Your ledger</summary><div data-ledger-body></div></details>`;
            const $ = sel => el.querySelector(sel);
            const showTally = () => {
                const t = tally(id);
                $('[data-tally]').textContent = t.win + t.loss + t.draw ? `${t.win}–${t.loss}${t.draw ? `–${t.draw}` : ''}` : '';
            };
            showTally();
            const root = $('[data-game-root]');
            const bet = game.bet === false ? null : { raises: 0, ...(game.bet || {}) };
            let seated = false;
            let hint = '';      // why the stakes last tapped can't be picked

            const bank = makeBank(bet ? {
                start: T.startingPurse(store), options: T.stakes(store, poi.tavern), opponents, replace,
                cut: rules.houseCut, interest: rules.loanInterest, highWins: rules.highTableWins, maxRaises: bet.raises,
                tavern: poi.id, game: id, gameName: name, coin, notify: kind => drawBar(kind),
            } : { betting: false });

            /* The purse bar is built once and then only updated, so focus and the live regions survive */
            if (bank.options) {
                $('[data-stakes]').innerHTML = bank.options.map(o =>
                    `<button type="button" class="gt-stake" data-stake="${esc(o.id)}"><span>${esc(o.label)}</span><small>${esc(coin(o.blind))}</small></button>`).join('') +
                    '<button type="button" class="gt-stake gt-stake--free" data-stake="friendly"><span>For fun</span><small>no coin</small></button>';
            }
            function drawBar(kind) {
                if (!bank.options) return;
                $('[data-bank]').hidden = false;
                $('[data-purse]').textContent = coin(bank.balance);
                $('[data-debt-wrap]').hidden = !bank.debt;
                $('[data-debt]').textContent = coin(bank.debt);
                const refill = $('[data-refill]');
                refill.hidden = !bank.canRefill;
                refill.textContent = bank.interest > 0 ? `Borrow ${coin(bank.start)} from the house` : 'Fresh purse';
                refill.title = bank.interest > 0 ? `You will owe ${coin(bank.owed)}. Half of every win goes to the house until it is repaid.` : '';
                const news = bank.takeEvents();
                if (news.length) $('[data-news]').textContent = news.join(' ');
                else if (kind === 'ante' || kind === 'stakes') $('[data-news]').textContent = '';

                // Stakes: the one in play, and why the others can't be picked
                $('[data-stakes]').hidden = !seated;
                if (kind !== 'why') hint = '';
                el.querySelectorAll('[data-stake]').forEach(b => {
                    const o = bank.options.find(x => x.id === b.dataset.stake);
                    const on = o ? bank.enabled && bank.stake.id === o.id : !bank.enabled;
                    const why = on ? '' : o ? bank.whyNot(o) : bank.live ? 'Stakes are fixed until this hand is settled.' : '';
                    b.classList.toggle('is-on', on);
                    b.classList.toggle('is-off', !!why);
                    b.setAttribute('aria-pressed', on);
                    b.setAttribute('aria-disabled', !!why);
                    b.dataset.why = why;
                    b.title = why || (o ? `Blind ${coin(o.blind)} per seat` : 'Nothing at stake');
                });
                $('[data-hint]').textContent = seated ? hint || (bank.live && bank.enabled ? 'Stakes are fixed until this hand is settled.' : '') : '';

                if (!seated) drawGate();
                else drawPot(kind);
            }

            /* The pot on the table: a pile of coins (one per blind), the amount, and how the last hand went */
            const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
            let potTimer = 0;
            function pile(n, { from = 'top' } = {}) {
                const box = $('[data-pile]');
                n = Math.min(COINS_MAX, Math.max(0, n));
                while (box.children.length > n) box.lastChild.remove();
                for (let i = box.children.length; i < n; i++) {
                    const c = document.createElement('i');
                    // Your coin comes up from your side of the table, the regulars' from theirs
                    c.className = `gt-coin gt-coin--in-${from === 'mixed' ? (i === 0 ? 'bottom' : 'top') : from}`;
                    c.style.setProperty('--i', i);
                    box.appendChild(c);
                }
            }
            function drawPot(kind) {
                const pot = $('[data-pot]');
                pot.hidden = !bank.enabled;
                if (!bank.enabled) return;
                if (kind === 'ante' || kind === 'stakes') $('[data-sum]').innerHTML = '';
                clearTimeout(potTimer);
                const box = $('[data-pile]');
                box.className = 'gt-pot__pile';
                const amount = bank.live ? bank.pot : bank.carry;
                const coins = Math.ceil(amount / bank.blind);
                // Between hands the plate only shows when coin was left on the table; the summary stays
                el.querySelector('.gt-pot__plate').hidden = !amount && kind !== 'settle';
                pot.hidden = !amount && !$('[data-sum]').innerHTML.trim() && kind !== 'settle';
                $('[data-pot-label]').textContent = bank.live ? 'Pot' : bank.carry ? 'Left on the table' : 'Pot';
                $('[data-pot-amount]').textContent = coin(amount);
                if (kind === 'settle' && bank.last && !bank.last.unclaimed && !still() && box.children.length) {
                    // The pot slides to whoever took it, then what is left on the table (if anything) is drawn
                    const l = bank.last;
                    box.classList.add(l.result === 'win' ? 'is-won' : l.result === 'draw' ? 'is-split' : 'is-lost');
                    potTimer = setTimeout(() => {
                        box.className = 'gt-pot__pile'; box.innerHTML = ''; pile(coins, { from: 'none' });
                        el.querySelector('.gt-pot__plate').hidden = !amount;
                    }, 520);
                } else pile(coins, { from: still() ? 'none' : kind === 'ante' ? 'mixed' : kind === 'raise' ? 'mixed' : 'none' });
                if (kind === 'raise' && !still()) { // the first new coin of a raise is yours
                    const fresh = box.querySelectorAll('.gt-coin--in-top, .gt-coin--in-bottom');
                    if (fresh.length) fresh[0].className = 'gt-coin gt-coin--in-bottom';
                }
                if (kind === 'settle' && bank.last) drawSummary(bank.last);
            }
            function drawSummary(l) {
                const head = l.unclaimed ? 'Nobody takes the pot' : l.result === 'win' ? 'You take the pot' : l.result === 'draw' ? 'The pot is split' : 'You lose your stake';
                const tone = l.net > 0 ? 'win' : l.net < 0 ? 'loss' : 'even';
                const rows = [
                    ['Your stake', coin(l.staked)],
                    ['Pot', coin(l.pot)],
                    l.cut ? ['House cut', coin(l.cut)] : null,
                    l.result !== 'loss' ? ['Your take', coin(l.won)] : null,
                    l.repaid ? ['To the house loan', coin(l.repaid)] : null,
                    l.left ? ['Left on the table', coin(l.left)] : null,
                ].filter(Boolean);
                $('[data-sum]').innerHTML = `
                    <strong class="gt-sum__head gt-sum__head--${tone}">${esc(head)}</strong>
                    <dl class="gt-sum__rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
                        <div class="gt-sum__net gt-sum__net--${tone}"><dt>Net</dt><dd>${esc(l.net ? signed(l.net, coin) : 'even')}</dd></div></dl>`;
            }

            // The stakes screen, shown in place of the game until the player sits down
            function drawGate() {
                const tier = poi.tavern && poi.tavern.tier ? T.tierOf(store, poi.tavern) : null;
                const house = [
                    tier && tier.mult !== 1 ? `This is a ${esc(tier.label.toLowerCase())} house, so the blinds are ×${tier.mult}.` : '',
                    bank.cut ? `The house keeps ${bank.cut}% of every pot.` : '',
                ].filter(Boolean).join(' ');
                root.innerHTML = `
                    <div class="gt-gate">
                        <p class="gt-lede">Name your stakes. Every seat puts the blind in the pot each hand, and the winner takes it. ${house}</p>
                        <div class="gt-picker">${bank.options.map(o => {
                    const why = bank.whyNot(o);
                    const risk = bank.maxRaises ? `${coin(o.blind)} a hand, up to ${coin(o.blind * (1 + bank.maxRaises))} if you raise` : `${coin(o.blind)} a hand`;
                    return `
                            <button type="button" class="gt-pick gt-sit" data-sit="${esc(o.id)}" ${why ? 'disabled' : ''}>
                                <span class="gt-pick__name">${esc(o.label)}</span>
                                <span class="gt-pick__blurb">Blind ${esc(coin(o.blind))}</span>
                                <span class="gt-pick__tally">You risk ${esc(risk)}</span>
                                <span class="gt-pick__tally">${bank.seats} seats · opening pot ${esc(coin(o.blind * bank.seats))}</span>
                                ${why ? `<span class="gt-pick__why">${esc(why)}</span>` : `<span class="gt-pick__tally">Your purse covers ${Math.floor(bank.balance / o.blind)} hand${Math.floor(bank.balance / o.blind) === 1 ? '' : 's'}</span>`}
                            </button>`;
                }).join('')}
                        </div>
                        ${bank.broke ? `<p class="gt-gate__note">Your purse can’t cover the lowest blind.${bank.canRefill && bank.interest > 0 ? ` The house will lend you ${esc(coin(bank.start))}, to be repaid ${esc(coin(bank.owed))} out of your wins.` : ''}</p>` : ''}
                        <p class="gt-gate__free"><button type="button" class="gt-link" data-sit="friendly">Play for fun, no coin at stake</button></p>
                    </div>`;
            }

            // The ledger: how the staked hands went, in this house and everywhere
            function drawLedger() {
                if (!bank.options) return;
                const l = readLedger(), here = ledgerRow(l.taverns[poi.id]);
                const all = Object.values(l.taverns).map(ledgerRow).reduce((a, r) => ({ hands: a.hands + r.hands, wins: a.wins + r.wins, net: a.net + r.net, best: Math.max(a.best, r.best) }), ledgerRow());
                $('[data-ledger]').hidden = !all.hands;
                const line = (label, r) => `<tr><th scope="row">${esc(label)}</th><td>${r.hands}</td><td>${r.wins}</td><td>${esc(r.best ? coin(r.best) : '–')}</td><td class="gt-ledger__net--${r.net > 0 ? 'win' : r.net < 0 ? 'loss' : 'even'}">${esc(r.net ? signed(r.net, coin) : 'even')}</td></tr>`;
                $('[data-ledger-body]').innerHTML = `
                    <table class="gt-ledger__table">
                        <thead><tr><th scope="col">Staked hands</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Best pot</th><th scope="col">Net</th></tr></thead>
                        <tbody>
                            ${line('In this house', here)}
                            ${Object.entries(l.games).filter(([g]) => labels[g]).map(([g, r]) => line(labels[g], ledgerRow(r))).join('')}
                            ${line('At every table', all)}
                        </tbody>
                    </table>
                    ${l.peak ? `<p class="gt-ledger__peak">Fattest your purse has been: <b>${esc(coin(l.peak))}</b></p>` : ''}`;
            }

            function begin() {
                if (seated) return;
                seated = true;
                drawBar('stakes');
                root.innerHTML = '';
                current = game.mount(root, {
                    you: { name: 'You', initial: '★', isYou: true },
                    opponents, esc, dice: ATH.dice, avatarHtml, bank, coin,
                    // A regular's purse, for the game to show next to their name ('' when nothing is at stake)
                    purseHtml: i => bank.enabled && opponents[i] && Number.isFinite(opponents[i].purse)
                        ? `<span class="gt-purse" title="${esc(opponents[i].name)}’s purse"><i class="gt-coin gt-coin--tiny" aria-hidden="true"></i>${esc(coin(opponents[i].purse))}</span>` : '',
                    // Once per hand: a second call for the same hand is ignored
                    onEnd(result, info) {
                        if (bank.anted && !bank.live) return;
                        tally(id, result);
                        bank.settle(result, info || {});
                        showTally();
                        drawLedger();
                    },
                });
            }
            // Walking away from a live hand leaves your stake in the pot: asked in the page, not in a browser dialog
            function leave(sure) {
                const box = $('[data-leave]');
                if (bank.live && bank.enabled && !sure) {
                    $('[data-leave-text]').textContent = `Leave the table? Your ${coin(bank.staked)} stays in the pot.`;
                    box.hidden = false;
                    $('[data-leave-no]').focus();
                    return;
                }
                bank.abandon();
                picker();
            }
            active = { bank, begin, leave, why(text) { hint = text; drawBar('why'); } };

            drawLedger();
            // A game with nothing at stake starts at once; otherwise the player names their stakes first
            if (!bank.options) return begin();
            drawBar();
        }

        el.addEventListener('click', e => {
            const pick = e.target.closest('[data-game]');
            if (pick && el.contains(pick) && !e.target.closest('[data-game-root]')) return play(pick.dataset.game);
            if (!active) return;
            if (e.target.closest('[data-back]')) return active.leave(false);
            if (e.target.closest('[data-leave-yes]')) return active.leave(true);
            if (e.target.closest('[data-leave-no]')) {
                el.querySelector('[data-leave]').hidden = true;
                const back = el.querySelector('[data-back]');
                if (back) back.focus();
                return;
            }
            const sit = e.target.closest('[data-sit]');
            if (sit && el.contains(sit) && !sit.disabled) { if (active.bank.choose(sit.dataset.sit)) active.begin(); return; }
            const stake = e.target.closest('[data-stake]');
            if (stake && el.contains(stake)) {
                // Stakes that can't be picked stay focusable, and say why when tapped
                if (stake.getAttribute('aria-disabled') === 'true') active.why(stake.dataset.why);
                else active.bank.choose(stake.dataset.stake);
                return;
            }
            if (e.target.closest('[data-refill]')) active.bank.refill();
        });
        // Closing or reloading the page mid-hand forfeits the stake: the browser asks first
        root.addEventListener('beforeunload', e => {
            if (active && active.bank.live && active.bank.enabled) { e.preventDefault(); e.returnValue = ''; }
        });
        if (ids.length) picker();
        else el.innerHTML = '<p class="gt-lede">The gaming table is empty tonight.</p>';
    }

    // Names of the games of a tavern, for its "Gaming table" service line.
    // Formats `.join()` as "X or Y" or "X, Y or Z".
    const gameNames = (store, poi) => {
        const labels = Object.fromEntries(store.enumOptions('tavernGame').map(o => [o.id, o.label]));
        const list = ((poi.tavern && poi.tavern.games) || []).filter(id => GAMES.has(id)).map(id => labels[id] || id);
        list.join = () => list.length <= 1
            ? (list[0] || '')
            : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
        return list;
    };

    ATH.games = { ...games, mountTable, gameNames, avatarHtml, noBank: NO_BANK, andList, _test: { makeBank, readLedger } };
})(typeof window !== 'undefined' ? window : globalThis);