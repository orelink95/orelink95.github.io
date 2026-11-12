/* =====================================================================
   FORTUNE CARDS  —  Athenaeum.fortuneCard
   ---------------------------------------------------------------------
   The markup of a divination reading (styles/fortune-card.css), shared by
   poi.html (the reading dialog) and the dashboard (card and prophecy previews).

     card(card, deck, opts)   one tarot-sized card, face down or up, maybe reversed
     omen(omen, opts)         the square tile of an omen practice
     reading(view, opts)      the whole reading: spread, then the meanings of
                              the cards turned so far (view = divination.view())

   A card with no picture gets a plain face (its numeral and name), a deck
   with no back a patterned one, so a deck works before its art is drawn.
   opts.picture(src) -> attributes of the <img> (the dashboard reads images
   through the linked folder); default: src="…".
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function roman(n) {
        if (typeof n !== 'number' || n < 0) return '';
        if (n === 0) return '0';
        const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
        let out = '';
        for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
        return out;
    }
    const img = (src, opts) => `<img ${opts.picture ? opts.picture(src) : `src="${esc(src)}"`} alt="" loading="lazy" draggable="false">`;

    function back(deck, opts) {
        return `<span class="fcard__back" aria-hidden="true">${deck && deck.back
            ? img(deck.back, opts)
            : '<span class="fcard__pattern"><span class="material-symbols-outlined">auto_awesome</span></span>'}</span>`;
    }

    /* opts: {faceDown, reversed, index, tag ('button' | 'div'), picture} */
    function card(c, deck, opts = {}) {
        const tag = opts.tag || 'button';
        const down = !!opts.faceDown;
        const label = down ? 'A card, face down: turn it over' : `${c.name}${opts.reversed ? ', reversed' : ''}`;
        const face = c.image
            ? img(c.image, opts)
            : `<span class="fcard__plain">
                   <span class="fcard__num">${esc(roman(c.number))}</span>
                   <span class="fcard__glyph material-symbols-outlined">auto_awesome</span>
                   <span class="fcard__name">${esc(c.name)}</span>
               </span>`;
        return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="fcard${down ? ' is-down' : ''}${opts.reversed ? ' fcard--rev' : ''}"
                ${opts.index != null ? `data-turn="${opts.index}"` : ''} aria-label="${esc(label)}">
            <span class="fcard__inner">
                <span class="fcard__face"><span class="fcard__art">${face}</span></span>
                ${back(deck, opts)}
            </span>
        </${tag}>`;
    }

    /* opts: {faceDown, tag, picture} */
    function omen(o, opts = {}) {
        const tag = opts.tag || 'button';
        const down = !!opts.faceDown;
        return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="fcard fcard--omen${down ? ' is-down' : ''}" data-turn="0"
                aria-label="${down ? 'The sign, hidden: reveal it' : 'The sign'}">
            <span class="fcard__inner">
                <span class="fcard__face">${o.image ? img(o.image, opts) : `<span class="fcard__plain"><span class="fcard__glyph material-symbols-outlined">${esc(o.icon || 'visibility')}</span></span>`}</span>
                <span class="fcard__back" aria-hidden="true"><span class="fcard__pattern"><span class="material-symbols-outlined">${esc(o.icon || 'visibility')}</span></span></span>
            </span>
        </${tag}>`;
    }

    // Grid areas of the cross: 1 centre, 2 left, 3 right, 4 above, 5 below
    const CROSS = ['centre', 'left', 'right', 'top', 'bottom'];

    /* view: Athenaeum.divination.view(); opts: {allTurned, tag, picture} */
    function reading(v, opts = {}) {
        const isTurned = i => opts.allTurned || v.turned.has(i);
        const title = v.method === 'omen' ? v.practice.name : (v.spread ? v.spread.name : v.practice.name);
        let spread, meanings, total;
        if (v.method === 'omen') {
            total = 1;
            spread = `<div class="fread__spread fread__spread--omen">${omen(v.omen, { ...opts, faceDown: !isTurned(0) })}</div>`;
            meanings = isTurned(0) ? `
                <li class="fread__meaning">
                    <p class="fread__text">${esc(v.omen.text)}</p>
                    ${v.omen.meaning ? `<p class="fread__sub">${esc(v.omen.meaning)}</p>` : ''}
                </li>` : '';
        } else {
            total = v.slots.length;
            spread = `<div class="fread__spread fread__spread--${v.layout}" data-n="${total}">${v.slots.map((s, i) => `
                <div class="fread__slot"${v.layout === 'cross' ? ` style="grid-area:${CROSS[i]}"` : ''}>
                    <span class="fread__pos">${esc(roman(i + 1))}${s.position.name ? ` · ${esc(s.position.name)}` : ''}</span>
                    ${card(s.card, v.deck, { ...opts, faceDown: !isTurned(i), reversed: s.reversed, index: i })}
                </div>`).join('')}
            </div>`;
            meanings = v.slots.map((s, i) => isTurned(i) ? `
                <li class="fread__meaning${opts.fresh === i ? ' fread__meaning--fresh' : ''}" id="fread-meaning-${i}">
                    <p class="fread__pos">${esc(roman(i + 1))}${s.position.name ? ` · ${esc(s.position.name)}` : ''}</p>
                    <h3 class="fread__card">${esc(s.card.name)}${s.reversed ? ' <span class="fread__rev">Reversed</span>' : ''}</h3>
                    ${s.position.desc ? `<p class="fread__sub">${esc(s.position.desc)}</p>` : ''}
                    ${s.keywords.length ? `<p class="fread__keys">${s.keywords.map(esc).join(' · ')}</p>` : ''}
                    <p class="fread__text">${esc(s.reading)}</p>
                </li>` : '').join('');
        }
        const left = [...Array(total).keys()].filter(i => !isTurned(i)).length;
        return `
            <header class="fread__head">
                <p class="fread__eyebrow">${v.method === 'omen' ? 'What the seer sees' : esc(v.practice.name)}${v.prophecy ? ' · <span class="fread__fated">The threads were already drawn</span>' : ''}</p>
                <h2 class="fread__title">${esc(title)}</h2>
            </header>
            ${v.intro ? `<p class="fread__intro">${esc(v.intro)}</p>` : ''}
            ${spread}
            <p class="fread__hint" aria-live="polite">${left
                ? (v.method === 'omen' ? 'Look closer.' : `${left === total ? 'Turn the cards over, one by one.' : `${left} card${left === 1 ? '' : 's'} still face down.`}`)
                : ''}</p>
            ${meanings ? `<ol class="fread__meanings">${meanings}</ol>` : ''}
            ${!left && v.closing ? `<p class="fread__intro fread__closing">${esc(v.closing)}</p>` : ''}`;
    }

    ATH.fortuneCard = { card, omen, reading, roman };
})(typeof window !== 'undefined' ? window : globalThis);
