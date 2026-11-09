/* =====================================================================
   KNUCKLEBONES  —  you against one regular (scripts/games/table.js)
   Each player has a board of 3 columns of 3 dice. On your turn you roll a
   die and put it in one of your columns. Matching dice in a column
   multiply (two 4s = 4×2 + 4×2 = 16). Putting a die in a column knocks
   out the opponent's dice of the same value in their facing column.
   When a board is full, the higher total wins.
   The bot (botColumn) weighs what a column gains it and costs you.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum;
    const SIZE = 3;
    const PAUSE = 900;

    /* ---------- scoring ---------- */
    // A die of value v that appears n times in its column scores v × n
    function columnScore(col) {
        const n = {};
        col.forEach(v => { n[v] = (n[v] || 0) + 1; });
        return col.reduce((s, v) => s + v * n[v], 0);
    }
    const boardScore = board => board.reduce((s, col) => s + columnScore(col), 0);
    const isFull = board => board.every(col => col.length >= SIZE);
    // Puts `v` in column c of `mine`, knocking matching dice out of `theirs` (copies)
    function place(mine, theirs, c, v) {
        const me = mine.map((col, i) => i === c ? [...col, v] : [...col]);
        const them = theirs.map((col, i) => i === c ? col.filter(x => x !== v) : [...col]);
        return { me, them, knocked: theirs[c].length - them[c].length };
    }
    // The bot's column: points gained + points it takes from you, a little noise for character
    function botColumn(mine, theirs, v, care = 1) {
        let best = null;
        mine.forEach((col, c) => {
            if (col.length >= SIZE) return;
            const { me, them } = place(mine, theirs, c, v);
            const gain = columnScore(me[c]) - columnScore(col);
            const taken = columnScore(theirs[c]) - columnScore(them[c]);
            // Keep a free slot where a high pair could land later; fill near-full columns with low dice
            const shape = col.length === SIZE - 1 && !col.includes(v) ? -v * 0.3 : 0;
            const score = gain + taken * 1.1 + shape + Math.random() * (3 / care);
            if (!best || score > best.score) best = { c, score };
        });
        return best ? best.c : -1;
    }

    function mount(el, ctx) {
        const { esc, dice: D, avatarHtml } = ctx;
        const bot = { ...ctx.opponents[0], care: 0.8 + Math.random() * 1.2 };
        const S = { you: [[], [], []], bot: [[], [], []], turn: 'you', die: 0, message: '', over: false, landed: null };
        let alive = true;
        const timers = [];
        const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms));

        function start() {
            S.you = [[], [], []]; S.bot = [[], [], []]; S.over = false; S.landed = null;
            S.turn = Math.random() < 0.5 ? 'you' : 'bot';
            nextTurn();
        }
        function nextTurn() {
            S.die = D.roll();
            S.message = S.turn === 'you' ? 'Your roll. Choose a column.' : `${bot.name} rolls…`;
            render({ rolling: true });
            if (S.turn === 'bot') later(() => {
                const c = botColumn(S.bot, S.you, S.die, bot.care);
                put('bot', c);
            }, PAUSE);
        }
        function put(who, c) {
            const mine = who === 'you' ? S.you : S.bot, theirs = who === 'you' ? S.bot : S.you;
            if (c < 0 || mine[c].length >= SIZE) return;
            const v = S.die;
            const { me, them, knocked } = place(mine, theirs, c, v);
            if (who === 'you') { S.you = me; S.bot = them; } else { S.bot = me; S.you = them; }
            S.landed = { who, c, row: me[c].length - 1 };
            const name = who === 'you' ? 'You' : bot.name;
            S.message = `${name} put${who === 'you' ? '' : 's'} a ${v} in column ${c + 1}${knocked ? ` and knock${who === 'you' ? '' : 's'} out ${knocked} of ${who === 'you' ? `${bot.name}’s` : 'your'} dice!` : '.'}`;
            S.die = 0;
            if (isFull(me)) return finish();
            S.turn = who === 'you' ? 'bot' : 'you';
            render();
            later(nextTurn, who === 'you' ? 500 : 700);
        }
        function finish() {
            S.over = true;
            const a = boardScore(S.you), b = boardScore(S.bot);
            const result = a > b ? 'win' : a < b ? 'loss' : 'draw';
            S.message = result === 'win' ? `You win, ${a} to ${b}!` : result === 'loss' ? `${bot.name} wins, ${b} to ${a}.` : `A draw at ${a}.`;
            ctx.onEnd(result);
            render();
        }

        /* ---------- drawing ---------- */
        function board(who) {
            const cols = S[who];
            const mine = who === 'you';
            const canPlay = mine && S.turn === 'you' && S.die && !S.over;
            return `<div class="kb-board kb-board--${who}">${cols.map((col, c) => {
                const n = {}; col.forEach(v => { n[v] = (n[v] || 0) + 1; });
                const slots = Array.from({ length: SIZE }, (_, r) => {
                    const v = col[r];
                    if (!v) return '<span class="kb-slot"></span>';
                    const landed = S.landed && S.landed.who === who && S.landed.c === c && S.landed.row === r;
                    return `<span class="kb-slot">${D.html(v, { cls: `${n[v] > 1 ? `is-x${n[v]}` : ''}${landed ? ' is-landed' : ''}` })}</span>`;
                }).join('');
                const score = `<span class="kb-colscore">${columnScore(col) || ''}</span>`;
                const full = col.length >= SIZE;
                return mine
                    ? `<button type="button" class="kb-col" data-col="${c}" ${canPlay && !full ? '' : 'disabled'} aria-label="Column ${c + 1}, ${columnScore(col)} points${full ? ', full' : ''}">${score}<span class="kb-stack">${slots}</span></button>`
                    : `<div class="kb-col" aria-label="${esc(bot.name)}’s column ${c + 1}, ${columnScore(col)} points"><span class="kb-stack">${slots}</span>${score}</div>`;
            }).join('')}</div>`;
        }
        function render({ rolling = false } = {}) {
            if (!alive) return;
            const you = { ...ctx.you };
            el.innerHTML = `<div class="kb${S.turn === 'you' && !S.over ? ' is-your-turn' : ''}">
                <div class="kb-player">${avatarHtml(bot)}<span class="kb-player__name">${esc(bot.name)}</span><span class="kb-total">${boardScore(S.bot)}</span></div>
                ${board('bot')}
                <div class="kb-mid">
                    <span class="kb-hand kb-hand--${S.turn}">${S.die ? D.html(S.die, { cls: 'kb-hand__die' }) : '<span class="die die--empty"></span>'}</span>
                    <p class="kb-message" aria-live="polite">${esc(S.message)}</p>
                </div>
                ${board('you')}
                <div class="kb-player kb-player--you">${avatarHtml(you)}<span class="kb-player__name">You</span><span class="kb-total">${boardScore(S.you)}</span></div>
                ${S.over ? '<div class="ld-controls ld-controls--end"><button type="button" class="poi-button" data-act="again">Play again</button></div>' : ''}
            </div>`;
            if (rolling && S.die) D.tumble(el.querySelector('.kb-hand__die'), S.die);
        }

        el.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.disabled || !el.contains(b)) return;
            if (b.dataset.col !== undefined && S.turn === 'you' && S.die) put('you', +b.dataset.col);
            if (b.dataset.act === 'again') start();
        });
        start();
        return { destroy() { alive = false; timers.forEach(clearTimeout); } };
    }

    ATH.games.register({
        id: 'knucklebones',
        opponents: 1,
        blurb: 'Roll, place, multiply — and knock out your rival’s dice.',
        rules: `
            <p>Each player has a board of <b>three columns</b>, three dice deep.</p>
            <p>On your turn you roll one die and place it in a column of your board that is not full. A column scores the sum of its dice, but <b>matching dice multiply</b>: a die that appears twice counts double, three times triple. Two 4s are worth 16, three 5s are worth 45.</p>
            <p>Placing a die also <b>knocks out</b> every die of the same value in your opponent’s facing column.</p>
            <p>The game ends as soon as one board is full. The higher total wins.</p>`,
        mount,
        _test: { columnScore, boardScore, place, botColumn, isFull },
    });
})(typeof window !== 'undefined' ? window : globalThis);
