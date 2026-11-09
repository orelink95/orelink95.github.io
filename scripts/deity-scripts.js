/* =====================================================================
   A GOD'S PAGE  —  deity.html?id=<deity id>
   The god's card (scripts/deity-card.js) beside its entry: tier, domains,
   lore, its artifact as the stories tell it (deity.artifact + artifactLegend;
   the item's own card is in the Vault, once a party finds it), and its
   temples (POIs whose temple block lists it). Previous / next within the tier.
   An Elder god not revealed in the reader's campaign (store.viewCampaign)
   shows only a sealed card. Styles: styles/pages/deity.css.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const Card = Athenaeum.deityCard;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const layout = $('deity-layout');
    const campaign = store.viewCampaign();

    const id = new URLSearchParams(location.search).get('id');
    const d = id && store.typeOf(id) === 'deity' ? store.get(id) : null;
    const back = '<a class="deity-back" href="pantheon.html"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>Back to the Pantheon</a>';

    if (!d) {
        $('deity-crumb').textContent = 'Not found';
        layout.innerHTML = `<div class="deity-missing"><h1 class="deity-entry__name">Record Not Found</h1>
            <p>No god of that name is kept in the archive.</p>${back}</div>`;
        return;
    }

    const tier = Card.tierOf(d);
    const tierLabel = (store.enumOptions('deityTier').find(t => t.id === tier) || {}).label || '';
    document.getElementById('deity-main').classList.add(`deity-main--${tier}`);

    // Sealed: nothing about it but the seal
    if (!store.revealed(d, campaign)) {
        $('deity-crumb').textContent = 'A sealed name';
        layout.innerHTML = `
            <div class="deity-layout__card">${Card.sealed()}</div>
            <div class="deity-entry">
                <p class="deity-entry__tier">${esc(tierLabel)}</p>
                <h1 class="deity-entry__name">A Sealed Name</h1>
                <p class="deity-entry__epithet">This god has not been revealed to your party.</p>
                ${back}
            </div>`;
        return;
    }

    document.title = `${d.name} — The Pantheon — The Athenaeum Vault`;
    $('deity-crumb').textContent = d.name;
    if (d.colour && CSS.supports('color', d.colour)) layout.style.setProperty('--deity', d.colour);

    const md = (text, opts) => store.autolink(store.md(text, opts), { exclude: d.id, campaign });
    const fact = (label, value) => value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '';

    // The artifact, as a legend
    const item = d.artifact ? store.get(d.artifact) : null;
    const legend = item ? `
        <section class="deity-section deity-legend" aria-labelledby="deity-legend-name">
            <h2 class="deity-section__label">Legendary artifact</h2>
            <div class="deity-legend__scroll">
                ${item.image ? `<img class="deity-legend__img" src="${esc(item.image)}" alt="" loading="lazy">` : ''}
                <h3 id="deity-legend-name" class="deity-legend__name">${esc(item.name)}</h3>
                <div class="deity-legend__text lore">${d.artifactLegend ? md(d.artifactLegend) : '<p><em>Known only from stories.</em></p>'}</div>
            </div>
        </section>` : '';

    // Temples
    const temples = store.backrefs(d, 'poi', 'temple.deities');
    const templeList = temples.length ? `
        <section class="deity-section deity-temples">
            <h2 class="deity-section__label">Temples &amp; shrines</h2>
            <ul>${temples.map(p => `<li><a href="${store.url(p)}#shrine">${esc(p.name)}</a>${store.parent(p) ? ` <small>${esc(store.parent(p).name)}</small>` : ''}</li>`).join('')}</ul>
        </section>` : '';

    // Previous / next god of the same tier (sealed ones skipped)
    const sameTier = store.all('deity').filter(x => Card.tierOf(x) === tier && store.revealed(x, campaign));
    const at = sameTier.findIndex(x => x.id === d.id);
    const step = (x, dir) => x
        ? `<a class="deity-step deity-step--${dir}" href="${store.url(x)}" rel="${dir}">
               ${dir === 'prev' ? '<span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>' : ''}
               <span><small>${dir === 'prev' ? 'Previous' : 'Next'}</small>${esc(x.name)}</span>
               ${dir === 'next' ? '<span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>' : ''}</a>`
        : '<span></span>';
    const steps = sameTier.length > 1
        ? `<nav class="deity-steps" aria-label="${esc(tierLabel)}">${step(sameTier[at - 1], 'prev')}${step(sameTier[at + 1], 'next')}</nav>` : '';

    layout.innerHTML = `
        <div class="deity-layout__card">
            ${Card.card(d, { tag: 'div' })}
            ${steps}
        </div>
        <article class="deity-entry">
            <p class="deity-entry__tier">${esc(tierLabel)}</p>
            <h1 class="deity-entry__name">${esc(d.name)}</h1>
            ${d.epithet ? `<p class="deity-entry__epithet">${esc(d.epithet)}</p>` : ''}
            <dl class="deity-entry__facts">
                ${fact('Domains', esc((d.domains || []).join(', ')))}
                ${fact('Alignment', esc(d.alignment))}
                ${fact('Holy symbol', esc(d.symbolText))}
                ${fact('Worshippers', esc(d.worshippers))}
            </dl>
            ${d.body ? `<div class="deity-entry__body lore">${md(d.body, { dropCap: true })}</div>` : ''}
            ${legend}
            ${templeList}
        </article>`;
});
