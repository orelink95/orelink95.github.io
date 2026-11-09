/* =====================================================================
   THE PANTHEON  —  pantheon.html[?id=<deity id>]
   Every deity of data/deities.json as a card; a card (or ?id=) opens the
   deity: domains, symbol, lore, and the temples (POIs whose temple block
   lists it). Styles: styles/pages/pantheon.css.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const deities = store.all('deity');
    const grid = $('pantheon-grid');
    const dialog = $('deity-dialog');

    const colourOf = d => (d.colour && CSS.supports('color', d.colour) ? d.colour : '#e9c176');
    const sigil = d => d.symbol
        ? `<img src="${esc(d.symbol)}" alt="">`
        : `<span class="material-symbols-outlined" aria-hidden="true">${esc(d.icon || 'brightness_7')}</span>`;
    const temples = d => store.backrefs(d, 'poi', 'temple.deities');

    if (!deities.length) {
        grid.innerHTML = '<p class="pantheon-empty">The archive has not yet recorded any god by name.</p>';
        return;
    }

    grid.innerHTML = deities.map(d => `
        <button type="button" class="deity-card" data-deity="${esc(d.id)}" style="--deity:${colourOf(d)}">
            <span class="deity-card__sigil">${sigil(d)}</span>
            <span class="deity-card__name">${esc(d.name)}</span>
            ${d.epithet ? `<span class="deity-card__epithet">${esc(d.epithet)}</span>` : ''}
            ${(d.domains || []).length ? `<span class="deity-card__domains">${d.domains.map(x => `<span>${esc(x)}</span>`).join('')}</span>` : ''}
            ${d.summary ? `<span class="deity-card__summary">${esc(d.summary)}</span>` : ''}
        </button>`).join('');

    function open(d, { updateUrl = true } = {}) {
        const fact = (label, value) => value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '';
        const places = temples(d);
        $('deity-content').style.setProperty('--deity', colourOf(d));
        $('deity-content').innerHTML = `
            <header class="deity-dialog__head">
                <span class="deity-card__sigil deity-dialog__sigil">${sigil(d)}</span>
                <div>
                    <h2 id="deity-name" class="deity-dialog__name">${esc(d.name)}</h2>
                    ${d.epithet ? `<p class="deity-dialog__epithet">${esc(d.epithet)}</p>` : ''}
                </div>
            </header>
            <dl class="deity-dialog__facts">
                ${fact('Domains', esc((d.domains || []).join(', ')))}
                ${fact('Alignment', esc(d.alignment))}
                ${fact('Holy symbol', esc(d.symbolText))}
                ${fact('Worshippers', esc(d.worshippers))}
            </dl>
            ${d.body ? `<div class="deity-dialog__body lore">${store.autolink(store.md(d.body, { dropCap: true }), { exclude: d.id })}</div>` : ''}
            ${places.length ? `<section class="deity-dialog__temples">
                <h3>Temples &amp; shrines</h3>
                <ul>${places.map(p => `<li><a href="${store.url(p)}#shrine">${esc(p.name)}</a>${store.parent(p) ? ` <small>${esc(store.parent(p).name)}</small>` : ''}</li>`).join('')}</ul>
            </section>` : ''}`;
        if (!dialog.open) dialog.showModal();
        if (updateUrl) history.replaceState(null, '', `pantheon.html?id=${encodeURIComponent(d.id)}`);
    }
    function close() {
        if (dialog.open) dialog.close();
    }
    dialog.addEventListener('close', () => history.replaceState(null, '', 'pantheon.html'));
    $('deity-close').addEventListener('click', close);
    // A click on the backdrop closes it
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

    grid.addEventListener('click', e => {
        const card = e.target.closest('[data-deity]');
        if (card) open(store.get(card.dataset.deity));
    });

    const asked = store.get(new URLSearchParams(location.search).get('id'));
    if (asked && store.typeOf(asked) === 'deity') open(asked, { updateUrl: false });
});
