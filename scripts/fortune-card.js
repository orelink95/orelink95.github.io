/* =====================================================================
   FORTUNE CARDS  —  Athenaeum.fortuneCard
   ---------------------------------------------------------------------
   The markup of a divination reading (styles/fortune-card.css), shared by
   poi.html (the reading dialog) and the dashboard (card and prophecy previews).

     card(card, deck, opts)   one tarot-sized card, face down or up, maybe reversed
     omen(omen, opts)         the square tile of an omen practice
     reading(view, opts)      the whole reading: spread, then the meanings of
                              the cards turned so far (view = divination.view()),
                              and once all are turned, the seer's interpretation
     interpretation(i, opts)  that interpretation alone (view.interpretation)
     piece(p, set, opts)      one piece of a cast (a rune stone, a bone…)
     cloth(view, opts)        a cast: the round cloth, its rings and where the pieces fell

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

    /* ---------- casts ---------- */
    const LOOKS = {
        stones: { piece: '#5d5a6b', glyph: '#e9c176', glow: true },
        bones: { piece: '#dccfb2', glyph: '#4a3524', glow: false },
    };
    const lookOf = set => {
        const base = LOOKS[(set && set.look) || 'stones'] || LOOKS.stones;
        return {
            name: (set && set.look) || 'stones',
            piece: (set && set.pieceColour) || base.piece,
            glyph: (set && set.glyphColour) || base.glyph,
            glow: set && set.glyphGlow != null ? !!set.glyphGlow : base.glow,
        };
    };
    // The glyph of a piece: its picture (tinted, through a mask), else its drawn path
    function glyph(p, opts) {
        if (p.image) return `<span class="fpiece__mask" aria-hidden="true" ${opts.mask ? opts.mask(p.image)
            : `style="-webkit-mask-image:url('${esc(p.image)}');mask-image:url('${esc(p.image)}')"`}></span>`;
        if (p.glyph) return `<svg class="fpiece__glyph" viewBox="-1 -1 12 18" aria-hidden="true"><path d="${esc(p.glyph)}"/></svg>`;
        return `<span class="fpiece__initial" aria-hidden="true">${esc((p.name || '?').replace(/^the /i, '').charAt(0))}</span>`;
    }
    /* opts: {faceDown, reversed, tag, index, shape, picture, mask, cls, style, label} */
    function piece(p, set, opts = {}) {
        const look = lookOf(set);
        const tag = opts.tag || 'div';
        return `<${tag} ${tag === 'button' ? 'type="button"' : ''} class="fpiece fpiece--${esc(look.name)}${opts.faceDown ? ' is-down' : ''}${opts.reversed ? ' fpiece--rev' : ''}${look.glow ? ' fpiece--glow' : ''}${opts.cls ? ` ${opts.cls}` : ''}"
                ${opts.index != null ? `data-turn="${opts.index}"` : ''} ${opts.label ? `aria-label="${esc(opts.label)}"` : 'aria-hidden="true"'}
                style="--piece:${esc(look.piece)};--glyph:${esc(look.glyph)};${opts.style || ''}">
            <span class="fpiece__body fpiece__body--s${(opts.shape || 0) % 4}">${opts.faceDown ? '' : `<span class="fpiece__face">${glyph(p, opts)}</span>`}</span>
        </${tag}>`;
    }

    // Where a piece lies on the table (in % of it): the cloth's radius is R% of the table
    const R = 43, PW = 9, PH = PW * 1.18;
    /* v = a cast view; opts: {allTurned, throwing, picture, mask} */
    function cloth(v, opts = {}) {
        const look = lookOf(v.set);
        const practice = v.practice;
        const n = v.rings.length;
        const thrown = opts.allTurned || v.thrown;
        const isTurned = i => opts.allTurned || v.turned.has(i);
        // the rings: circles at k/n of the radius; each ring's name at the top of its band
        const circles = v.rings.slice(0, -1).map((r, k) => {
            const d = ((k + 1) / n) * 100;
            return `<span class="fcast__ring${k === 0 ? ' fcast__ring--heart' : ''}" style="width:${d}%;height:${d}%"></span>`;
        }).join('');
        const labels = v.rings.map((r, k) => `<span class="fcast__label" style="top:${(50 - ((k + 1) / n) * 50 + 1.6).toFixed(2)}%">${esc(r.name)}</span>`).join('');
        const pieces = thrown ? v.slots.map((s, i) => {
            const cx = 50 + s.x * R, cy = 50 + s.y * R;
            const readable = s.up && s.ring >= 0;
            const ready = readable && !isTurned(i);
            const label = !s.up ? 'A piece, face down: silent' : s.ring < 0 ? `${s.piece.name}, off the cloth: not read`
                : `${s.piece.name}${s.reversed ? ', merkstave' : ''}, ${s.position.name}${ready ? ': read it' : ''}`;
            const dx = ((50 - cx) / PW) * 100, dy = ((108 - cy) / PH) * 100;
            return piece(s.piece, v.set, {
                ...opts, tag: readable && !opts.allTurned ? 'button' : 'div', index: readable ? i : null, label,
                faceDown: !s.up, reversed: s.reversed, shape: s.shape,
                cls: `fcast__piece${ready ? ' is-ready' : ''}${s.ring < 0 ? ' is-off' : ''}${opts.throwing ? ' is-flying' : ''}${opts.chosen === i ? ' is-chosen' : ''}`,
                style: `left:${(cx - PW / 2).toFixed(2)}%;top:${(cy - PH / 2).toFixed(2)}%;--rot:${s.rot}deg;--dx:${dx.toFixed(0)}%;--dy:${dy.toFixed(0)}%;--delay:${i * 70}ms`,
            });
        }).join('') : '';
        const pouch = thrown ? '' : `
            <div class="fcast__pouch">
                <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><path d="M22 18c-6 8-12 18-12 28 0 9 9 13 22 13s22-4 22-13c0-10-6-20-12-28" fill="#3a2a22" stroke="#e9c176" stroke-width="1.5"/><path d="M20 18c4-3 20-3 24 0l-3 5c-6-2-12-2-18 0z" fill="#2a1e18" stroke="#e9c176" stroke-width="1.5"/><path d="M24 16c-2-5 2-9 8-9s10 4 8 9" fill="none" stroke="#b89cf0" stroke-width="1.5"/></svg>
                <button type="button" class="fcast__throw" data-throw>${look.name === 'bones' ? 'Cast the bones' : 'Cast the stones'}</button>
            </div>`;
        const c = v.cloth || { colour: practice.clothColour, image: practice.clothImage, ring: practice.ringColour };
        return `<div class="fcast fcast--${esc(look.name)}${thrown ? '' : ' is-waiting'}" style="${c.colour ? `--cloth:${esc(c.colour)};` : ''}${c.ring ? `--ring:${esc(c.ring)};` : ''}">
            <div class="fcast__cloth" aria-hidden="true">
                ${c.image ? `<span class="fcast__texture">${img(c.image, opts)}</span>` : ''}
                ${circles}${labels}
            </div>
            ${pieces}${pouch}
        </div>`;
    }

    /* The seer speaks: i = divination.interpret(); opts: {fresh} (animate it in) */
    function interpretation(i, opts = {}) {
        if (!i) return '';
        const p = (cls, t) => (t ? `<p class="fread__say${cls ? ` fread__say--${cls}` : ''}">${esc(t)}</p>` : '');
        return `<section class="fread__interp fread__interp--${esc(i.tone || 'mixed')}${opts.fresh ? ' fread__meaning--fresh' : ''}" aria-label="The seer’s reading">
            <p class="fread__eyebrow fread__interp-head"><span class="material-symbols-outlined" aria-hidden="true">visibility</span> The seer speaks</p>
            ${p('opening', i.opening)}
            ${p('', i.cards.join(' '))}
            ${p('', i.patterns.join(' '))}
            ${p('counsel', i.counsel)}
            ${p('closing', i.closing)}
        </section>`;
    }

    /* A free spread: each position at its column and row (cells one card wide, one card
       high), in % of the box, so it shrinks as one on phones -> {style, slot(i)} */
    function freeBox(slots) {
        const ps = slots.map(s => s.position || {});
        const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const cols = Math.max(...xs) - x0 + 1, rows = Math.max(...ys) - y0 + 1;
        const ratio = cols / (rows * ROW_H);
        const pct = n => +n.toFixed(3);
        return {
            style: `--cols:${pct(cols)};--ratio:${pct(ratio)};aspect-ratio:${pct(ratio)}`,
            slot: i => {
                const p = ps[i];
                return `left:${pct(((p.x - x0) / cols) * 100)}%;top:${pct(((p.y - y0) / rows) * 100)}%;width:${pct(100 / cols)}%;`
                    + `${p.tilt ? `--tilt:${Math.max(-30, Math.min(30, p.tilt))}deg;` : ''}${p.colour ? `--pos:${esc(p.colour)};` : ''}`;
            },
        };
    }
    const ROW_H = 2.1; // a row's height, in cell widths: the card (1.71) and its label

    // Grid areas of the cross: 1 centre, 2 left, 3 right, 4 above, 5 below
    const CROSS = ['centre', 'left', 'right', 'top', 'bottom'];

    /* view: Athenaeum.divination.view(); opts: {allTurned, tag, picture} */
    function reading(v, opts = {}) {
        const isTurned = i => opts.allTurned || v.turned.has(i);
        const title = v.method === 'omen' ? v.practice.name : (v.spread ? v.spread.name : v.practice.name);
        let spread, meanings, total;
        if (v.method === 'cast') return castReading(v, opts);
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
            const free = v.layout === 'free' ? freeBox(v.slots) : null;
            spread = `<div class="fread__spread fread__spread--${v.layout}" data-n="${total}"${free ? ` style="${free.style}"` : ''}>${v.slots.map((s, i) => `
                <div class="fread__slot${s.position.colour ? ' fread__slot--tinted' : ''}"${v.layout === 'cross' ? ` style="grid-area:${CROSS[i]}"` : free ? ` style="${free.slot(i)}"` : s.position.colour ? ` style="--pos:${esc(s.position.colour)}"` : ''}>
                    <span class="fread__pos"><span>${esc(roman(i + 1))}${s.position.name ? `<span class="fread__pos-name"> · ${esc(s.position.name)}</span>` : ''}</span></span>
                    ${card(s.card, v.deck, { ...opts, faceDown: !isTurned(i), reversed: s.reversed, index: i })}
                </div>`).join('')}
            </div>`;
            meanings = v.slots.map((s, i) => isTurned(i) ? `
                <li class="fread__meaning${opts.fresh === i ? ' fread__meaning--fresh' : ''}" id="fread-meaning-${i}">
                    <p class="fread__pos"${s.position.colour ? ` style="color:${esc(s.position.colour)}"` : ''}>${esc(roman(i + 1))}${s.position.name ? ` · ${esc(s.position.name)}` : ''}</p>
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
            ${!left && v.interpretation ? interpretation(v.interpretation, { fresh: opts.fresh != null }) : ''}
            ${!left && v.closing ? `<p class="fread__intro fread__closing">${esc(v.closing)}</p>` : ''}`;
    }

    /* A cast: the cloth, then what the pieces read so far say (ring by ring), then the seer */
    function castReading(v, opts) {
        const thrown = opts.allTurned || v.thrown;
        const isTurned = i => opts.allTurned || v.turned.has(i);
        const readable = v.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.up && s.ring >= 0);
        const left = thrown ? readable.filter(({ i }) => !isTurned(i)).length : 0;
        const read = readable.filter(({ i }) => isTurned(i)).sort((a, b) => a.s.ring - b.s.ring || a.s.r - b.s.r);
        const look = lookOf(v.set);
        const meanings = read.map(({ s, i }) => `
            <li class="fread__meaning${opts.fresh === i ? ' fread__meaning--fresh' : ''}" id="fread-meaning-${i}">
                <p class="fread__pos">${esc(s.position.name)}${s.position.desc ? ` · ${esc(s.position.desc)}` : ''}</p>
                <h3 class="fread__card fread__card--piece">${piece(s.piece, v.set, { ...opts, reversed: s.reversed, cls: 'fpiece--mini' })}<span>${esc(s.piece.name)}</span>${s.reversed ? ' <span class="fread__rev">Merkstave</span>' : ''}</h3>
                ${s.keywords.length ? `<p class="fread__keys">${s.keywords.map(esc).join(' · ')}</p>` : ''}
                <p class="fread__text">${esc(s.reading)}</p>
            </li>`).join('');
        const hint = !thrown ? 'One cast a day, at each seer.'
            : !readable.length ? 'Not one face shows.'
                : left ? `${left} face${left === 1 ? '' : 's'} still to read. Touch a piece that shows its face.` : '';
        return `
            <header class="fread__head">
                <p class="fread__eyebrow">${esc(v.practice.name)}</p>
                <h2 class="fread__title">${look.name === 'bones' ? 'The Casting of the Bones' : 'The Cast of Stones'}</h2>
            </header>
            ${v.practice.desc ? `<p class="fread__intro">${esc(v.practice.desc)}</p>` : ''}
            ${cloth(v, opts)}
            <p class="fread__hint" aria-live="polite">${hint}</p>
            ${thrown && readable.length && !read.length ? '<p class="fread__sub fread__castnote">Faces down are silent, and pieces off the cloth are not read. Where a piece lies says what it speaks of.</p>' : ''}
            ${meanings ? `<ol class="fread__meanings">${meanings}</ol>` : ''}
            ${thrown && !left && v.interpretation ? interpretation(v.interpretation, { fresh: opts.fresh != null || opts.throwing }) : ''}`;
    }

    ATH.fortuneCard = { card, omen, piece, cloth, reading, interpretation, roman };
})(typeof window !== 'undefined' ? window : globalThis);
