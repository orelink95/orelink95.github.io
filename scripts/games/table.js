/* =====================================================================
   GAMING TABLE  —  Athenaeum.games, Athenaeum.dice
   ---------------------------------------------------------------------
   The Games tab of a tavern (poi.html): the games listed in
   poi.tavern.games (enum tavernGame in data/schema.js), played in the
   browser against bots. No server, nothing saved but a win tally per
   browser (localStorage).

   A game is a file in scripts/games/ that calls
       Athenaeum.games.register({
           id: 'liars-dice',            // = its id in the tavernGame enum
           kind: 'dice',                // 'dice' (default) or 'cards'
           blurb: 'One line for the picker',
           rules: '<p>…</p>',           // shown under "How to play"
           opponents: 3,                // bots it needs
           mount(el, ctx) {}            // draws the game into el; returns { destroy() }
       });
   ctx = { you, opponents: [seat…], onEnd(result, info), esc, dice, bank, coin }
   seat = { name, avatar, initial, npc }   result = 'win' | 'loss' | 'draw'
   info = { share } — on a draw, how many players (you included) split the pot.

   STAKES. Before a game starts the player names their stakes (Low / Standard /
   High) or plays for fun. The blind is the stakes' base blind (enum gameStakes)
   x the tavern's tier; every seat puts one blind in the pot per hand, and the
   winner takes the pot. The purse (settings.startingPurse) lives in the player's
   browser. A game takes part by calling, on ctx.bank:
       bank.ante()            at the start of a hand/match -> false if the purse can't cover the blind
       bank.canRaise(max)     / bank.raise()   a mid-hand raise: one more blind from the purse into
                              the pot, matched by the regulars (bank.raises = raises this hand)
       ctx.onEnd(result)      settles the pot (win = all of it, draw = a share, loss = nothing)
   A game that is no business of coin sets  bet: false  when it registers.
   With "play for fun" chosen, bank.enabled is false and every call is a harmless no-op.

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

    /* ---------- the purse and the pot ---------- */
    const PURSE_KEY = 'athenaeum.purse';
    let purseMemory = null; // keeps the purse for this visit when localStorage is blocked
    function readPurse(start) {
        let p = null;
        try { p = JSON.parse(localStorage.getItem(PURSE_KEY) || 'null'); } catch (e) { /* ignore */ }
        if (!p || typeof p !== 'object') p = purseMemory;
        // No purse yet, or the DM changed the starting purse in Settings: a fresh one for everyone
        if (!p || !Number.isFinite(p.cp) || p.start !== start) p = { cp: start, start };
        return p;
    }
    function writePurse(p) {
        purseMemory = { ...p };
        try { localStorage.setItem(PURSE_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
    }
    // What a game gets when nothing is at stake: every call does nothing, nothing is ever charged
    const NO_BANK = {
        enabled: false, live: false, blind: 0, pot: 0, balance: 0, raises: 0,
        ante: () => true, canRaise: () => false, raise: () => 0, canAfford: () => true, settle: () => 0,
    };
    // One bank per sitting. `seats` = players at the table (you + the regulars); `notify` redraws the purse bar.
    function makeBank({ store, poi, seats, notify }) {
        const T = ATH.tavern;
        const start = T.startingPurse(store);
        const options = T.stakes(store, poi.tavern);
        const cheapest = Math.min(...options.map(o => o.blind));
        let purse = readPurse(start);
        let stake = null;                        // the stakes chosen; null = playing for fun
        let pot = 0, staked = 0, raises = 0, live = false;
        let last = null;                         // how the last settled hand went for you
        const save = () => { writePurse(purse); notify(); };
        return {
            options, start, seats,
            get enabled() { return !!stake; },
            get stake() { return stake; },
            get blind() { return stake ? stake.blind : 0; },
            get balance() { return purse.cp; },
            get pot() { return pot; },
            get live() { return live; },
            get raises() { return raises; },
            get last() { return last; },
            get broke() { return purse.cp < cheapest; },
            get canRefill() { return !live && purse.cp < cheapest && start >= cheapest; },
            canAfford: cp => purse.cp >= cp,
            // 'friendly' = for fun. Stakes can only change between hands, and only to ones the purse covers.
            choose(id) {
                if (live) return false;
                const next = id === 'friendly' ? null : options.find(o => o.id === id);
                if (id !== 'friendly' && (!next || next.blind > purse.cp)) return false;
                stake = next;
                notify();
                return true;
            },
            refill() { if (live) return; purse = { cp: start, start }; last = null; save(); },
            // Every seat puts the blind in the pot. false = you can't cover it (nothing is taken).
            ante() {
                if (!stake) return true;
                if (live) return true;           // already in this hand: never charged twice
                if (purse.cp < stake.blind) return false;
                purse.cp -= stake.blind; staked = stake.blind; pot = stake.blind * seats; raises = 0; live = true;
                save();
                return true;
            },
            // A mid-hand raise: one more blind from your purse, matched by every regular. Returns the amount (0 = refused).
            canRaise: (max = 1) => !!stake && live && raises < max && purse.cp >= stake.blind,
            raise() {
                if (!stake || !live || purse.cp < stake.blind) return 0;
                purse.cp -= stake.blind; staked += stake.blind; pot += stake.blind * seats; raises++;
                save();
                return stake.blind;
            },
            // win = the whole pot, draw = your share of it, loss = nothing (your blind is already in)
            settle(result, share = 1) {
                if (!live) return 0;
                const won = result === 'win' ? pot : result === 'draw' ? Math.floor(pot / Math.max(1, share)) : 0;
                purse.cp += won;
                last = { won, net: won - staked, result };
                pot = 0; staked = 0; live = false;
                save();
                return won;
            },
        };
    }

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
    // Draws the table into `el`: a picker when the tavern has several games, then the game.
    function mountTable(el, store, poi) {
        const ids = ((poi.tavern && poi.tavern.games) || []).filter(id => GAMES.has(id));
        const labels = Object.fromEntries(store.enumOptions('tavernGame').map(o => [o.id, o.label]));
        let current = null;
        let active = null; // the sitting in progress: { bank, begin } (scripts/games/table.js: the purse and the pot)

        function picker() {
            if (current) { current.destroy && current.destroy(); current = null; }
            active = null;
            if (ids.length === 1) return play(ids[0]);
            el.innerHTML = `
                <p class="gt-lede">Pull up a stool. The regulars are always up for a game.</p>
                <div class="gt-picker">${ids.map(id => {
                const game = GAMES.get(id);
                const t = tally(id);
                const isCards = game.kind === 'cards' || game.icon === 'cards';
                const iconHtml = isCards
                    ? `<span class="gt-pick__dice gt-pick__dice--cards" aria-hidden="true">${pickCardsHtml()}</span>`
                    : `<span class="gt-pick__dice" aria-hidden="true">${dieHtml(roll(), { label: false })}${dieHtml(roll(), { label: false })}</span>`;
                return `<button type="button" class="gt-pick" data-game="${esc(id)}">
                        ${iconHtml}
                        <span class="gt-pick__name">${esc(labels[id] || id)}</span>
                        <span class="gt-pick__blurb">${esc(game.blurb)}</span>
                        ${t.win + t.loss + t.draw ? `<span class="gt-pick__tally">Your record: ${t.win} won · ${t.loss} lost${t.draw ? ` · ${t.draw} drawn` : ''}</span>` : ''}
                    </button>`;
            }).join('')}</div>`;
        }

        function play(id) {
            const game = GAMES.get(id);
            const opponents = pickOpponents(store, poi, game.opponents || 1);
            const T = ATH.tavern;
            el.innerHTML = `
                <div class="gt-head">
                    ${ids.length > 1 ? '<button type="button" class="gt-back" data-back><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Games</button>' : ''}
                    <h4 class="gt-title">${esc(labels[id] || id)}</h4>
                    <span class="gt-tally" data-tally></span>
                </div>
                <div class="gt-bank" data-bank hidden></div>
                <div class="gt-game" data-game-root></div>
                <details class="gt-rules"><summary>How to play</summary>${game.rules}</details>`;
            const showTally = () => {
                const t = tally(id);
                el.querySelector('[data-tally]').textContent = t.win + t.loss + t.draw ? `${t.win}–${t.loss}${t.draw ? `–${t.draw}` : ''}` : '';
            };
            showTally();
            const root = el.querySelector('[data-game-root]');
            const barEl = el.querySelector('[data-bank]');
            const coin = T.formatCoin;
            let seated = false;

            // The purse bar: purse, the pot while a hand is live, how the last hand went, and the stakes
            function drawBar() {
                if (!bank.options) return;
                const last = !bank.live && bank.last
                    ? (bank.last.net > 0 ? `Won ${coin(bank.last.net)}` : bank.last.net < 0 ? `Lost ${coin(-bank.last.net)}` : 'Broke even') : '';
                barEl.hidden = false;
                barEl.innerHTML = `
                    <div class="gt-bank__row">
                        <span class="gt-bank__item"><span class="material-symbols-outlined" aria-hidden="true">savings</span><span class="gt-bank__label">Purse</span><b>${esc(coin(bank.balance))}</b></span>
                        ${bank.live ? `<span class="gt-bank__item gt-bank__item--pot"><span class="gt-bank__label">Pot</span><b>${esc(coin(bank.pot))}</b></span>` : ''}
                        ${last ? `<span class="gt-bank__note gt-bank__note--${bank.last.net > 0 ? 'win' : bank.last.net < 0 ? 'loss' : 'even'}" aria-live="polite">${esc(last)}</span>` : ''}
                        ${bank.canRefill ? '<button type="button" class="gt-bank__refill" data-refill>Fresh purse</button>' : ''}
                    </div>
                    ${seated ? `<div class="gt-bank__stakes" role="group" aria-label="Stakes">
                        ${bank.options.map(o => {
                    const on = bank.enabled && bank.stake.id === o.id;
                    return `<button type="button" class="gt-stake${on ? ' is-on' : ''}" data-stake="${esc(o.id)}" aria-pressed="${on}" ${bank.live || (!on && o.blind > bank.balance) ? 'disabled' : ''} title="Blind ${esc(coin(o.blind))} per seat"><span>${esc(o.label)}</span><small>${esc(coin(o.blind))}</small></button>`;
                }).join('')}
                        <button type="button" class="gt-stake gt-stake--free${bank.enabled ? '' : ' is-on'}" data-stake="friendly" aria-pressed="${!bank.enabled}" ${bank.live ? 'disabled' : ''}><span>For fun</span><small>no coin</small></button>
                    </div>` : ''}`;
                if (!seated) drawGate();
            }
            // The stakes screen, shown in place of the game until the player sits down
            function drawGate() {
                const tier = poi.tavern && poi.tavern.tier ? T.tierOf(store, poi.tavern) : null;
                root.innerHTML = `
                    <div class="gt-gate">
                        <p class="gt-lede">Name your stakes. Every seat puts the blind in the pot each hand, and the winner takes it all.${tier && tier.mult !== 1 ? ` This is a ${esc(tier.label.toLowerCase())} house, so the blinds are ×${tier.mult}.` : ''}</p>
                        <div class="gt-picker">${bank.options.map(o => `
                            <button type="button" class="gt-pick gt-sit" data-sit="${esc(o.id)}" ${o.blind > bank.balance ? 'disabled' : ''}>
                                <span class="gt-pick__name">${esc(o.label)}</span>
                                <span class="gt-pick__blurb">Blind ${esc(coin(o.blind))}</span>
                                <span class="gt-pick__tally">${bank.seats} seats · pot ${esc(coin(o.blind * bank.seats))}</span>
                            </button>`).join('')}
                        </div>
                        ${bank.broke ? '<p class="gt-gate__note">Your purse can’t cover even the lowest blind.</p>' : ''}
                        <p class="gt-gate__free"><button type="button" class="gt-link" data-sit="friendly">Play for fun, no coin at stake</button></p>
                    </div>`;
            }
            const bank = game.bet === false ? ATH.games.noBank : makeBank({ store, poi, seats: opponents.length + 1, notify: () => drawBar() });

            function begin() {
                if (seated) return;
                seated = true;
                drawBar();
                root.innerHTML = '';
                current = game.mount(root, {
                    you: { name: 'You', initial: '★', isYou: true },
                    opponents, esc, dice: ATH.dice, avatarHtml, bank, coin,
                    onEnd(result, info) { tally(id, result); bank.settle(result, info && info.share); showTally(); },
                });
            }
            active = { bank, begin };

            // A game with nothing at stake starts at once; otherwise the player names their stakes first
            if (!bank.options) return begin();
            drawBar();
        }

        el.addEventListener('click', e => {
            const pick = e.target.closest('[data-game]');
            if (pick && el.contains(pick) && !e.target.closest('[data-game-root]')) return play(pick.dataset.game);
            if (e.target.closest('[data-back]')) {
                // Walking away from a live hand leaves your stake in the pot
                if (active && active.bank.live && !confirm('Leave the table? Your stake stays in the pot.')) return;
                return picker();
            }
            const sit = e.target.closest('[data-sit]');
            if (sit && active && el.contains(sit) && !sit.disabled) { if (active.bank.choose(sit.dataset.sit)) active.begin(); return; }
            const stake = e.target.closest('[data-stake]');
            if (stake && active && el.contains(stake) && !stake.disabled) { active.bank.choose(stake.dataset.stake); return; }
            if (e.target.closest('[data-refill]') && active) active.bank.refill();
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

    ATH.games = { ...games, mountTable, gameNames, avatarHtml, noBank: NO_BANK };
})(typeof window !== 'undefined' ? window : globalThis);