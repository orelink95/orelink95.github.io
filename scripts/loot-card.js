/* =====================================================================
   LOOT CARD  —  the markup of an item card (styles: styles/loot-card.css)
   Used by the Artifact Vault (vault.html) and the dashboard's preview.

   Athenaeum.lootCard.front(item, options)  -> the card as seen in the vault
       options.tag       'button' (default) or 'div'
       options.faceDown  show the back (a new find)
       options.picture   src => attributes of the <img> (default: src="…")
   Athenaeum.lootCard.sheet(item, store, options) -> the printed card, filled in
   Athenaeum.lootCard.rarityClass(rarity)   -> 'rarity--very-rare' etc.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const rarityClass = r => 'rarity--' + String(r || 'none').toLowerCase().replace(/\s+/g, '-');
    const srcAttr = src => `src="${esc(src)}"`;

    function front(item, options = {}) {
        const tag = options.tag || 'button';
        const picAttr = options.picture || srcAttr;
        const faceDown = !!options.faceDown;
        const picture = item.image
            ? `<img ${picAttr(item.image)} alt="" class="loot-card__img" loading="lazy">`
            : `<span class="loot-card__placeholder material-symbols-outlined">diamond</span>`;
        const meta = item.type || item.rarity
            ? `<span class="loot-card__meta">${item.type ? `<span>${esc(item.type)}</span>` : ''}${item.type && item.rarity ? ' · ' : ''}${item.rarity ? `<span class="loot-card__rarity">${esc(item.rarity)}</span>` : ''}</span>`
            : '';
        const label = faceDown ? 'A new find, face down: turn it over' : item.name;
        return `
        <${tag}${tag === 'button' ? ' type="button"' : ''} class="loot-card ${rarityClass(item.rarity)}${faceDown ? ' is-face-down' : ''}" data-id="${esc(item.id)}" aria-label="${esc(label)}">
            <span class="loot-card__inner">
                <span class="loot-card__face loot-card__front">
                    <span class="loot-card__picture">${picture}</span>
                    <span class="loot-card__name">${esc(item.name)}</span>
                    ${meta}
                    ${item.summary ? `<span class="loot-card__summary">${esc(item.summary)}</span>` : ''}
                </span>
                <span class="loot-card__face loot-card__back">
                    <span class="loot-card__new">New find</span>
                </span>
            </span>
        </${tag}>`;
    }

    function sheet(item, store, options = {}) {
        const hero = item.attunedBy && store.get(item.attunedBy);
        const text = item.body ? store.md(item.body)
            : item.summary ? `<p>${esc(item.summary)}</p>`
            : '<p class="item-sheet__empty">No further notes in the archive.</p>';
        const linked = options.autolink === false ? text : store.autolink(text, { exclude: item.id });
        return `
        <article class="item-sheet ${rarityClass(item.rarity)}">
            <h2 class="item-sheet__value item-sheet__name">${esc(item.name)}</h2>
            <p class="item-sheet__value item-sheet__type">${esc(item.type)}</p>
            <p class="item-sheet__value item-sheet__rarity">${esc(item.rarity)}</p>
            <p class="item-sheet__value item-sheet__cost">${esc(item.cost)}</p>
            <p class="item-sheet__value item-sheet__weight">${esc(item.weight)}</p>
            <span class="item-sheet__dot item-sheet__dot--required${item.attunement ? ' is-on' : ''}" title="${item.attunement ? 'Requires attunement' : 'No attunement needed'}"></span>
            <span class="item-sheet__dot item-sheet__dot--attuned${hero ? ' is-on' : ''}" title="${hero ? `Attuned to ${esc(hero.name)}` : 'Not attuned'}"></span>
            <div class="item-sheet__text custom-scrollbar">${linked}</div>
        </article>`;
    }

    ATH.lootCard = { front, sheet, rarityClass };
})(typeof window !== 'undefined' ? window : globalThis);
