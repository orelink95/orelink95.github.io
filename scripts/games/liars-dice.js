/* =====================================================================
   LIAR'S DICE  —  you against three regulars (scripts/games/table.js)
   Everyone has 5 hidden dice. In turn, raise the bid ("there are at least
   four 5s on the table") or call the last bidder a liar. Ones are wild.
   The loser of a challenge loses a die; the last with dice wins.
   The bot logic is in botMove(): it weighs the odds of a bid from its own
   dice, with a little doubt and a little bluff of its own.
   Stakes (table.js): every seat antes the blind. Once a game, on your turn,
   you can raise the stakes: each regular still in matches it or throws in
   its dice (botStays), and the pot goes to the last player with dice.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum;
    const START_DICE = 5;
    const FACES = [2, 3, 4, 5, 6];
    const WILD = 1;
    const PAUSE = 1100; // ms a bot "thinks"

    /* ---------- odds ---------- */
    const matches = (die, face) => die === face || die === WILD;
    const count = (dice, face) => dice.filter(d => matches(d, face)).length;
    function choose(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
    // P(X >= k), X ~ Binomial(n, p)
    function atLeast(k, n, p) {
        if (k <= 0) return 1;
        if (k > n) return 0;
        let s = 0;
        for (let i = k; i <= n; i++) s += choose(n, i) * p ** i * (1 - p) ** (n - i);
        return s;
    }
    const higher = (bid, cur) => !cur || bid.qty > cur.qty || (bid.qty === cur.qty && bid.face > cur.face);
    const minQty = (face, cur) => !cur ? 1 : face > cur.face ? cur.qty : cur.qty + 1;

    // A bot's move: { call: true } or { qty, face }
    function botMove(me, cur, totalDice) {
        const unknown = totalDice - me.dice.length;
        const odds = bid => atLeast(bid.qty - count(me.dice, bid.face), unknown, 1 / 3);
        const pTrue = cur ? odds(cur) : 1;
        const options = [];
        for (const face of FACES) {
            const q0 = minQty(face, cur);
            for (let qty = q0; qty <= Math.min(q0 + 2, totalDice); qty++) {
                const bid = { qty, face };
                // A bluffer sometimes likes a bid more than the odds say
                options.push({ ...bid, p: odds(bid), score: odds(bid) + Math.random() * me.bluff - (qty - q0) * 0.04 });
            }
        }
        options.sort((a, b) => b.score - a.score);
        const best = options[0];
        if (cur && (pTrue < me.doubt || !best || (best.p < 0.25 && pTrue < 0.5))) return { call: true };
        return best ? { qty: best.qty, face: best.face } : { call: true };
    }

    /* Does a regular match your raise? One that has as many dice as you always does; the further
       behind it is, the likelier it throws its dice in (and leaves its blind in the pot). */
    function botStays(botDice, yourDice, nerve = Math.random()) {
        if (botDice >= yourDice) return true;
        return nerve < 0.35 + 0.65 * botDice / Math.max(1, yourDice);
    }

    function mount(el, ctx) {
        const { esc, dice: D, avatarHtml } = ctx;
        const bank = ctx.bank || ATH.games.noBank;   // the purse and the pot (table.js)
        const temper = o => ({ ...o, doubt: 0.2 + Math.random() * 0.15, bluff: 0.08 + Math.random() * 0.25 });
        const players = [
            { ...ctx.you, isYou: true },
            ...ctx.opponents.map(temper),
        ].map((p, i) => ({ ...p, i, dice: [], said: null }));
        const S = { turn: 0, bid: null, phase: 'bidding', reveal: null, message: '', qty: 1, face: 2, over: false };
        let alive = true;
        const timers = [];
        const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms));

        const active = () => players.filter(p => p.dice.length);
        const total = () => active().reduce((n, p) => n + p.dice.length, 0);
        const you = players[0];
        const nextActive = i => { for (let k = 1; k <= players.length; k++) { const p = players[(i + k) % players.length]; if (p.dice.length) return p.i; } return i; };
        const bidText = b => `${b.qty} × ${b.face}`;
        const bidHtml = (b, small) => `<span class="ld-bid${small ? ' ld-bid--small' : ''}"><b>${b.qty}</b> × ${D.html(b.face, { cls: 'die--sm' })}</span>`;

        /* ---------- flow ---------- */
        function newRound(starter) {
            S.bid = null; S.reveal = null; S.phase = 'bidding';
            for (const p of players) { p.said = null; p.dice = p.dice.map(() => D.roll()).sort(); }
            S.turn = players[starter].dice.length ? starter : nextActive(starter);
            S.message = `${players[S.turn].isYou ? 'You open' : `${players[S.turn].name} opens`} the bidding. ${total()} dice on the table.`;
            S.qty = 1; S.face = 2;
            render({ rolling: true });
            step();
        }
        function step() {
            if (S.phase !== 'bidding') return;
            const p = players[S.turn];
            if (p.isYou) { suggest(); render(); return; }
            render();
            later(() => {
                const move = botMove(p, S.bid, total());
                if (move.call) challenge(p);
                else placeBid(p, move);
            }, PAUSE);
        }
        function placeBid(p, bid) {
            S.bid = { ...bid, by: p.i };
            p.said = bid;
            S.message = `${p.isYou ? 'You bid' : `${p.name} bids`} ${bidText(bid)}s.`;
            S.turn = nextActive(p.i);
            step();
        }
        function challenge(caller) {
            const bid = S.bid, bidder = players[bid.by];
            const n = active().reduce((s, p) => s + count(p.dice, bid.face), 0);
            const loser = n >= bid.qty ? caller : bidder;
            caller.said = { liar: true };
            S.phase = 'reveal';
            S.reveal = { bid, n, loser: loser.i };
            const who = p => p.isYou ? 'You' : p.name;
            S.message = `${who(caller)} call${caller.isYou ? '' : 's'} ${bidder.isYou ? 'you' : bidder.name} a liar! There ${n === 1 ? 'is' : 'are'} ${n} × ${bid.face} (ones count). ` +
                (loser === caller ? `${who(caller)} lose${caller.isYou ? '' : 's'} a die.` : `${who(bidder)} lose${bidder.isYou ? '' : 's'} a die.`);
            loser.dice.pop();
            const left = active();
            if (!you.dice.length || left.length === 1) {
                S.over = true;
                const won = left.length === 1 && left[0].isYou;
                S.message += won ? ' You are the last with dice: you win the table!' : !you.dice.length ? ' You are out of dice.' : '';
                endGame(won);
            }
            render();
        }
        // The pot goes to the last with dice; if you are out first, to the regular(s) holding the most
        function endGame(won) {
            S.over = true;
            const most = Math.max(...players.slice(1).map(p => p.dice.length));
            ctx.onEnd(won ? 'win' : 'loss', { winners: won ? [] : players.slice(1).filter(p => p.dice.length === most).map(p => p.i - 1) });
        }
        // Raise the stakes: one more blind from you; each regular still in matches it or throws in its dice
        function raiseStakes() {
            if (S.over || S.phase !== 'bidding' || S.turn !== 0 || !bank.canRaise()) return;
            const inPlay = players.slice(1).filter(p => p.dice.length);
            const callers = inPlay.filter(p => bank.botCan(p.i - 1) && botStays(p.dice.length, you.dice.length));
            const extra = bank.raise(callers.map(p => p.i - 1));
            if (!extra) return;
            const out = inPlay.filter(p => !callers.includes(p));
            out.forEach(p => { p.dice = []; p.said = null; });
            const names = list => ATH.games.andList(list.map(p => p.name));
            S.message = `You raise the stakes by ${ctx.coin(extra)}.` +
                (callers.length ? ` ${names(callers)} match${callers.length === 1 ? 'es' : ''} it.` : '') +
                (out.length ? ` ${names(out)} throw${out.length === 1 ? 's' : ''} in their dice.` : '');
            if (!callers.length) {
                S.message += ' The table is yours!';
                endGame(true);
                return render();
            }
            // A bid made by someone who has just left the game no longer stands
            if (S.bid && !players[S.bid.by].dice.length) { S.bid = null; S.message += ' The bidding starts over.'; }
            suggest();
            render();
        }
        // Default your bid controls to the smallest valid raise
        function suggest() {
            const best = FACES.map(f => ({ face: f, c: count(you.dice, f) })).sort((a, b) => b.c - a.c)[0].face;
            S.face = best; S.qty = minQty(best, S.bid);
        }

        /* ---------- drawing ---------- */
        function seat(p) {
            const showing = S.phase === 'reveal';
            const mine = p.isYou;
            const turn = S.phase === 'bidding' && S.turn === p.i && !S.over;
            const isLoser = showing && S.reveal.loser === p.i;
            const diceRow = p.dice.map(d => (showing || mine)
                ? D.html(d, { cls: `${mine ? '' : 'die--sm'} ${showing && matches(d, S.reveal.bid.face) ? 'is-match' : ''}` })
                : D.html(0, { cls: 'die--sm' })).join('');
            const said = p.said ? (p.said.liar ? '<span class="ld-said ld-said--liar">Liar!</span>' : `<span class="ld-said">${bidHtml(p.said, true)}</span>`) : '';
            return `<div class="ld-seat${mine ? ' ld-seat--you' : ''}${turn ? ' is-turn' : ''}${!p.dice.length ? ' is-out' : ''}${isLoser ? ' is-loser' : ''}">
                <div class="ld-seat__who">${avatarHtml(p)}<span class="ld-seat__label"><span class="ld-seat__name">${esc(p.name)}</span>${mine || !ctx.purseHtml ? '' : ctx.purseHtml(p.i - 1)}${turn && !mine ? '<span class="ld-thinking" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}${said}</span></div>
                <div class="ld-dice" data-dice="${p.i}">${p.dice.length ? diceRow : '<span class="ld-out">out</span>'}</div>
            </div>`;
        }
        function controls() {
            if (S.over) return `<div class="ld-controls ld-controls--end"><button type="button" class="poi-button" data-act="again">Play again</button></div>`;
            if (S.phase === 'reveal') return `<div class="ld-controls ld-controls--end"><button type="button" class="poi-button" data-act="next">Next round</button></div>`;
            const yours = S.turn === 0;
            const valid = higher({ qty: S.qty, face: S.face }, S.bid);
            return `<div class="ld-controls"${yours ? '' : ' aria-disabled="true"'}>
                <div class="ld-qty" role="group" aria-label="How many">
                    <button type="button" class="ld-step" data-act="less" ${!yours || S.qty <= 1 ? 'disabled' : ''} aria-label="Fewer">−</button>
                    <output class="ld-qty__n" aria-live="polite">${S.qty}</output>
                    <button type="button" class="ld-step" data-act="more" ${!yours || S.qty >= total() ? 'disabled' : ''} aria-label="More">+</button>
                </div>
                <span class="ld-times" aria-hidden="true">×</span>
                <div class="ld-faces" role="radiogroup" aria-label="Face">
                    ${FACES.map(f => `<button type="button" class="ld-face${S.face === f ? ' is-on' : ''}" role="radio" aria-checked="${S.face === f}" data-face="${f}" ${yours ? '' : 'disabled'}>${D.html(f, { cls: 'die--sm' })}</button>`).join('')}
                </div>
                <div class="ld-actions">
                    <button type="button" class="poi-button" data-act="bid" ${yours && valid ? '' : 'disabled'}>Bid</button>
                    <button type="button" class="poi-button ld-liar" data-act="liar" ${yours && S.bid ? '' : 'disabled'}>Liar!</button>
                    ${bank.enabled && bank.raises < bank.maxRaises ? `<button type="button" class="poi-button ld-raise" data-act="raise" ${yours && bank.canRaise() ? '' : 'disabled'} title="${esc(yours && !bank.canRaise() ? bank.raiseWhy() : 'Once a game: add a blind. Each regular matches it or throws in their dice.')}">Raise <small>+${esc(ctx.coin(bank.blind))}</small></button>` : ''}
                </div>
            </div>`;
        }
        function render({ rolling = false } = {}) {
            if (!alive) return;
            el.innerHTML = `<div class="ld">
                <div class="ld-table">${players.slice(1).map(seat).join('')}</div>
                <div class="ld-centre">
                    <div class="ld-current">${S.bid ? `<span class="ld-current__label">Bid on the table</span>${bidHtml(S.bid)}` : '<span class="ld-current__label">No bid yet</span>'}</div>
                    <p class="ld-message" aria-live="polite">${esc(S.message)}</p>
                </div>
                ${seat(you)}
                ${controls()}
            </div>`;
            if (rolling) el.querySelectorAll(`[data-dice="0"] .die`).forEach((d, i) => D.tumble(d, you.dice[i]));
        }

        el.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.disabled || !el.contains(b)) return;
            const act = b.dataset.act;
            if (b.dataset.face) { S.face = +b.dataset.face; if (!higher({ qty: S.qty, face: S.face }, S.bid)) S.qty = minQty(S.face, S.bid); render(); return; }
            if (act === 'less') { S.qty--; render(); }
            else if (act === 'more') { S.qty++; render(); }
            else if (act === 'bid' && S.turn === 0) placeBid(you, { qty: S.qty, face: S.face });
            else if (act === 'liar' && S.turn === 0) challenge(you);
            else if (act === 'raise') raiseStakes();
            else if (act === 'next') newRound(S.reveal.loser);
            else if (act === 'again') start();
        });

        function start() {
            // The whole table plays for one pot: every seat puts the blind in, the last with dice takes it
            if (!bank.ante()) {
                S.over = true;
                S.message = 'You can’t cover the blind. Lower the stakes, or play for fun.';
                render();
                return;
            }
            S.over = false;
            // The regulars are re-read every game: one who is cleaned out has left the table
            ctx.opponents.forEach((o, k) => { if (players[k + 1].name !== o.name) players[k + 1] = { ...temper(o), i: k + 1, dice: [], said: null }; });
            for (const p of players) p.dice = Array(START_DICE).fill(1);
            newRound(Math.floor(Math.random() * players.length));
        }
        start();
        return { destroy() { alive = false; timers.forEach(clearTimeout); } };
    }

    ATH.games.register({
        id: 'liars-dice',
        opponents: 3,
        blurb: 'Bluff, raise, and call out the liars. Ones are wild.',
        rules: `
            <p>Everyone shakes five dice under a cup and looks only at their own.</p>
            <p>In turn, each player <b>raises the bid</b>: a claim about <em>all</em> the dice on the table, such as “at least four 5s”. A raise names more dice, or the same number of a higher face. <b>Ones are wild</b>: they count as any face, so you bid on 2 to 6 only.</p>
            <p>Instead of raising, you can call the last bidder a <b>liar</b>. Everyone shows their dice. If the bid holds, the caller loses a die; if not, the bidder does. The loser opens the next round.</p>
            <p>A player with no dice left is out. The last one with dice wins.</p>
            <p>Every seat puts the blind in the pot when the game starts. The last player with dice takes the whole pot. Once a game, on your turn, you can <b>raise the stakes</b>: you add another blind, and each regular must match it or throw in their dice and leave the game.</p>`,
        bet: { raises: 1 },   // one raise per game
        mount,
        _test: { botMove, atLeast, higher, botStays },
    });
})(typeof window !== 'undefined' ? window : globalThis);
