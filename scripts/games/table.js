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
           blurb: 'One line for the picker',
           rules: '<p>…</p>',           // shown under "How to play"
           opponents: 3,                // bots it needs
           mount(el, ctx) {}            // draws the game into el; returns { destroy() }
       });
   ctx = { you, opponents: [seat…], onEnd(result), esc, dice }
   seat = { name, avatar, initial, npc }   result = 'win' | 'loss' | 'draw'

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

    /* ---------- registry ---------- */
    const games = {
        register(game) { GAMES.set(game.id, game); },
        get: id => GAMES.get(id),
    };

    /* ---------- opponents ---------- */
    const REGULARS = ['Old Brannoc', 'Mags the Fishwife', 'Tobin Quickfingers', 'Sister Ilse', 'Gerrit One-Ear', 'Wenna', 'Corporal Dask', 'Pell the Tinker', 'Yorra Saltbeard', 'Fenwick'];
    function shuffle(list) {
        const a = [...list];
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
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

        function picker() {
            if (current) { current.destroy && current.destroy(); current = null; }
            if (ids.length === 1) return play(ids[0]);
            el.innerHTML = `
                <p class="gt-lede">Pull up a stool. The regulars are always up for a game.</p>
                <div class="gt-picker">${ids.map(id => {
                    const t = tally(id);
                    return `<button type="button" class="gt-pick" data-game="${esc(id)}">
                        <span class="gt-pick__dice" aria-hidden="true">${dieHtml(roll(), { label: false })}${dieHtml(roll(), { label: false })}</span>
                        <span class="gt-pick__name">${esc(labels[id] || id)}</span>
                        <span class="gt-pick__blurb">${esc(GAMES.get(id).blurb)}</span>
                        ${t.win + t.loss + t.draw ? `<span class="gt-pick__tally">Your record: ${t.win} won · ${t.loss} lost${t.draw ? ` · ${t.draw} drawn` : ''}</span>` : ''}
                    </button>`;
                }).join('')}</div>`;
        }

        function play(id) {
            const game = GAMES.get(id);
            const opponents = pickOpponents(store, poi, game.opponents || 1);
            el.innerHTML = `
                <div class="gt-head">
                    ${ids.length > 1 ? '<button type="button" class="gt-back" data-back><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Games</button>' : ''}
                    <h4 class="gt-title">${esc(labels[id] || id)}</h4>
                    <span class="gt-tally" data-tally></span>
                </div>
                <div class="gt-game" data-game-root></div>
                <details class="gt-rules"><summary>How to play</summary>${game.rules}</details>`;
            const showTally = () => {
                const t = tally(id);
                el.querySelector('[data-tally]').textContent = t.win + t.loss + t.draw ? `${t.win}–${t.loss}${t.draw ? `–${t.draw}` : ''}` : '';
            };
            showTally();
            current = game.mount(el.querySelector('[data-game-root]'), {
                you: { name: 'You', initial: '★', isYou: true },
                opponents, esc, dice: ATH.dice, avatarHtml,
                onEnd(result) { tally(id, result); showTally(); },
            });
        }

        el.addEventListener('click', e => {
            const pick = e.target.closest('[data-game]');
            if (pick && el.contains(pick) && !e.target.closest('[data-game-root]')) return play(pick.dataset.game);
            if (e.target.closest('[data-back]')) picker();
        });
        if (ids.length) picker();
        else el.innerHTML = '<p class="gt-lede">The gaming table is empty tonight.</p>';
    }

    // Names of the games of a tavern, for its "Gaming table" service line
    const gameNames = (store, poi) => {
        const labels = Object.fromEntries(store.enumOptions('tavernGame').map(o => [o.id, o.label]));
        return ((poi.tavern && poi.tavern.games) || []).filter(id => GAMES.has(id)).map(id => labels[id] || id);
    };

    ATH.games = { ...games, mountTable, gameNames, avatarHtml };
})(typeof window !== 'undefined' ? window : globalThis);
