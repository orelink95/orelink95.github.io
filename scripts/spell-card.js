/* =====================================================================
   SPELL CARD  —  the markup of a spell card (styles: styles/spell-card.css)
   and the pop-ups that show them. Used by the Spellbook (spellbook.html)
   and the heroes' cards (heroes.html).

   Athenaeum.spellCard.known(store, campaign, hero)
        -> the spells a hero knows in a campaign (records, by level then name)
           campaign and hero: a record or an id. Read from campaign.spellbooks.
   Athenaeum.spellCard.card(spell, store, options) -> the card's HTML
        options.open      true = the opened card: only the name and the full
                          description, in a large box (not clickable)
        options.autolink  false = no links in the description (default: true)
        options.faceDown  true/false = show the back / the front. Default: face
                          down until this browser has turned the card over once.
        options.symbol    path => attributes of an image <span> (the school
                          symbols, the back's art). Default: its --symbol style.
                          The dashboard uses it, as it reads images through the
                          linked folder, not the page's URL.
   Athenaeum.spellCard.levels(spells, store) -> the cards grouped by level
   Athenaeum.spellCard.levelName(level)     -> 'Cantrips', '1st level'…
   Athenaeum.spellCard.openSpell(id, store)  -> opens a card in a pop-up
   Athenaeum.spellCard.openBook(store, campaign, hero, options)
        -> opens a hero's spellbook in a pop-up (heroes.html)
           options.link  URL of a "see it in the Spellbook" link

   Any element with data-spell="<id>" inside a grid made here opens that
   spell when clicked, or turns it over first if it is face down (one
   listener on the document, see the bottom).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const schoolKey = school => String(school || 'transmutation').toLowerCase();

    /* Schools with no symbol images yet get a Material Symbols icon.
       When you add images/spells/<school>-left.png and -right.png,
       delete the school's line here. */
    const PLACEHOLDER = {
        blood: 'water_drop',
        chaos: 'cyclone',
        void: 'blur_circular',
    };

    // The path of a symbol image, from the site's root
    const symbolPath = (school, side) => `images/spells/${schoolKey(school)}-${side}.png`;
    // Full URL: a url() inside a CSS variable is read relative to the stylesheet, not the page
    const symbolStyle = path => `style="--symbol: url('${esc(new URL(path, document.baseURI).href)}')"`;

    function symbol(school, side, attrs = symbolStyle) {
        const key = schoolKey(school);
        if (PLACEHOLDER[key]) return `<span class="spell-card__symbol spell-card__symbol--icon material-symbols-outlined">${PLACEHOLDER[key]}</span>`;
        return `<span class="spell-card__symbol" ${attrs(symbolPath(key, side))}></span>`;
    }

    // The back's line art (from the printed card back), coloured by the school
    const BACK_ART = 'images/spells/card-back.png';

    /* ---------- Cards this browser has turned over ----------
       A spell a player has never seen lies face down, like a new find in
       the Vault. Remembered per browser (localStorage), not per hero. */
    const SEEN_KEY = 'athenaeum.spells.revealed';
    const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } })();
    const isSeen = id => seen.has(id);
    function markSeen(id) {
        if (seen.has(id)) return;
        seen.add(id);
        try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch (e) { /* private window */ }
    }

    const levelMark = level => (level === 0 ? 'C' : String(level ?? '?'));
    function levelName(level) {
        if (level === 0) return 'Cantrips';
        const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[level] || 'th';
        return `${level}${suffix} level`;
    }

    /* ---------- What a hero knows ---------- */
    function known(store, campaign, hero) {
        const c = typeof campaign === 'string' ? store.get(campaign) : campaign;
        const heroId = typeof hero === 'string' ? hero : hero && hero.id;
        const book = ((c && c.spellbooks) || []).find(b => b.hero === heroId);
        return ((book && book.spells) || [])
            .map(id => store.get(id))
            .filter(s => s && store.typeOf(s) === 'spell')
            .sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name));
    }

    /* ---------- The card ---------- */
    function card(spell, store, options = {}) {
        const open = !!options.open;
        const school = schoolKey(spell.school);
        const dot = on => `<span class="spell-card__dot${on ? ' is-on' : ''}"></span>`;

        // The M: a tooltip with the components, if they are written
        const note = spell.material && spell.materials;
        const m = note
            ? `<span class="spell-card__m has-note" tabindex="0" aria-label="Material components: ${esc(note)}">M<span class="spell-card__note" role="tooltip">${esc(note)}</span></span>`
            : `<span class="spell-card__m">M</span>`;

        const text = store.md(spell.body || spell.summary || '');
        const details = open
            ? (options.autolink === false ? text : store.autolink(text, { exclude: spell.id }))
            : esc(spell.summary || '');

        // The opened card is never face down; a grid card is until turned over once
        const faceDown = !open && (options.faceDown ?? !isSeen(spell.id));

        // The grid card is a button-like <article>; the opened one is a dialog's content
        const attrs = open
            ? `role="document"`
            : `data-spell="${esc(spell.id)}" tabindex="0" role="button" aria-label="${faceDown ? `New spell card: turn it over` : esc(spell.name)}"`;

        // Symbol, level, symbol: on both the card and the opened card
        const banners = `
            <span class="spell-card__banner spell-card__banner--left">${symbol(school, 'left', options.symbol)}</span>
            <span class="spell-card__banner spell-card__banner--level" title="${esc(levelName(spell.level))}">${levelMark(spell.level)}</span>
            <span class="spell-card__banner spell-card__banner--right">${symbol(school, 'right', options.symbol)}</span>`;

        // The opened card: the name and the full description, nothing else
        if (open) return `
        <article class="spell-card spell-card--open school--${school}" ${attrs}>
          <div class="spell-card__inner">
          <div class="spell-card__face">${banners}
            <h2 class="spell-card__title">${esc(spell.name)}</h2>
            <div class="spell-card__box spell-card__details">${details}</div>
          </div>
          </div>
        </article>`;

        return `
        <article class="spell-card school--${school}${faceDown ? ' is-face-down' : ''}" ${attrs}>
          <div class="spell-card__inner">
          <div class="spell-card__face">${banners}

            <div class="spell-card__head">
                <div class="spell-card__name${(spell.name || '').length > 22 ? ' spell-card__name--long' : ''}">${esc(spell.name)}</div>
                <div class="spell-card__components">
                    <span class="spell-card__comp" title="Verbal">V ${dot(spell.verbal)}</span>
                    <span class="spell-card__comp" title="Somatic">S ${dot(spell.somatic)}</span>
                    <span class="spell-card__comp">${m} ${dot(spell.material)}</span>
                    <span class="spell-card__comp spell-card__comp--apart" title="Concentration">Conc. ${dot(spell.concentration)}</span>
                    <span class="spell-card__comp" title="Can be cast as a ritual">Rit. ${dot(spell.ritual)}</span>
                </div>
            </div>

            <div class="spell-card__pair">
                <span class="spell-card__label">Time</span>
                <span class="spell-card__label spell-card__label--end">Duration</span>
                <span class="spell-card__box">${esc(spell.castingTime)}</span>
                <span class="spell-card__box">${esc(spell.duration)}</span>
            </div>

            <div class="spell-card__pair">
                <span class="spell-card__label">Range</span>
                <span class="spell-card__label spell-card__label--end">School</span>
                <span class="spell-card__box">${esc(spell.range)}</span>
                <span class="spell-card__box">${esc(spell.school)}</span>
            </div>

            <span class="spell-card__label spell-card__label--big spell-card__details-title">Details</span>
            <div class="spell-card__box spell-card__details">${details}</div>
          </div>
          <div class="spell-card__back" aria-hidden="true">
              <span class="spell-card__back-art" ${(options.symbol || symbolStyle)(BACK_ART)}></span>
          </div>
          </div>
        </article>`;
    }

    /* ---------- Cards grouped by level ---------- */
    function levels(spells, store) {
        const groups = new Map();
        for (const s of spells) {
            if (!groups.has(s.level)) groups.set(s.level, []);
            groups.get(s.level).push(s);
        }
        return `<div class="spell-levels">${[...groups].map(([level, list]) => `
            <section class="spell-level">
                <h3 class="spell-level__title">${levelName(level)}</h3>
                <div class="spell-grid">${list.map(s => card(s, store)).join('')}</div>
            </section>`).join('')}</div>`;
    }

    /* ---------- Pop-ups ---------- */
    // Made once, on first use, then reused.
    function makeModal(extraClass, label) {
        const el = document.createElement('div');
        el.className = `spell-modal ${extraClass} hidden`;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', label);
        el.innerHTML = `
            <div class="spell-modal__veil" data-close></div>
            <div class="spell-modal__body"></div>
            <button class="spell-modal__close" data-close aria-label="Close">
                <span class="material-symbols-outlined">close</span>
            </button>`;
        document.body.appendChild(el);
        // On the library pages <body> has a filter: move the pop-up out of it
        if (typeof liftOutOfBody === 'function') liftOutOfBody(el);
        el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(el); });
        return el;
    }

    const opened = [];   // the open pop-ups, the last one on top
    function show(el) {
        el.classList.remove('hidden');
        if (!opened.includes(el)) opened.push(el);
        document.documentElement.style.overflow = 'hidden';
    }
    function close(el) {
        el.classList.add('hidden');
        opened.splice(opened.indexOf(el), 1);
        if (!opened.length) document.documentElement.style.overflow = '';
        el.dispatchEvent(new CustomEvent('spell-modal-close'));
    }

    let cardModal = null;
    function openSpell(id, store) {
        const spell = store.get(id);
        if (!spell || store.typeOf(spell) !== 'spell') return null;
        cardModal = cardModal || makeModal('spell-modal--card', 'Spell card');
        cardModal.querySelector('.spell-modal__body').innerHTML = card(spell, store, { open: true });
        markSeen(spell.id);   // opened from a link: it counts as turned over
        show(cardModal);
        return cardModal;
    }

    let bookModal = null;
    function openBook(store, campaign, hero, options = {}) {
        const c = typeof campaign === 'string' ? store.get(campaign) : campaign;
        const h = typeof hero === 'string' ? store.get(hero) : hero;
        if (!c || !h) return null;
        const spells = known(store, c, h);
        bookModal = bookModal || makeModal('spell-modal--book', 'Spellbook');
        bookModal.querySelector('.spell-modal__body').innerHTML = `
            <div class="spell-book">
                <header class="spell-book__head">
                    <p class="spell-book__eyebrow">${esc(c.name)}</p>
                    <h2 class="spell-book__title">${esc(h.name)}’s Spellbook</h2>
                    ${options.link ? `<a class="spell-book__link" href="${esc(options.link)}">Open in the Spellbook <span class="material-symbols-outlined">arrow_forward</span></a>` : ''}
                </header>
                ${levels(spells, store)}
            </div>`;
        show(bookModal);
        return bookModal;
    }

    /* ---------- Clicks and keys, for every page ---------- */
    function storeReady() { return ATH.store; }

    // A face-down card turns over (and stays turned); a face-up one opens
    function activate(cardEl) {
        if (cardEl.classList.contains('is-face-down')) {
            cardEl.classList.remove('is-face-down');
            markSeen(cardEl.dataset.spell);
            const name = cardEl.querySelector('.spell-card__name');
            if (name) cardEl.setAttribute('aria-label', name.textContent);
            return;
        }
        if (storeReady()) openSpell(cardEl.dataset.spell, ATH.store);
    }

    document.addEventListener('click', e => {
        const cardEl = e.target.closest('[data-spell]');
        // Face down: whatever was clicked (even the hidden M), the card turns over
        if (cardEl && cardEl.classList.contains('is-face-down')) { activate(cardEl); return; }
        // The M with materials: on a phone, a tap shows the components
        const m = e.target.closest('.spell-card__m.has-note');
        if (m) {
            e.stopPropagation();
            document.querySelectorAll('.spell-card__m.is-showing').forEach(x => { if (x !== m) x.classList.remove('is-showing'); });
            m.classList.toggle('is-showing');
            return;
        }
        document.querySelectorAll('.spell-card__m.is-showing').forEach(x => x.classList.remove('is-showing'));
        if (cardEl) activate(cardEl);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && opened.length) { close(opened[opened.length - 1]); return; }
        // Enter or Space on a focused card opens it, like a button
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-spell]')) {
            e.preventDefault();
            activate(e.target);
        }
    });

    ATH.spellCard = { known, card, levels, levelName, openSpell, openBook, close, symbolPath };
})(typeof window !== 'undefined' ? window : globalThis);