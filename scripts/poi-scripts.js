/* =====================================================================
   POINT OF INTEREST PAGE  —  poi.html?id=<poi id>
   Any POI: image, location, lore, the NPCs whose home it is.
   A POI with a `tavern` block also gets tier, hours, services and the
   bill of fare (scripts/tavern-menu.js, code from data/settings.json).
   The DM can preview another code with ?code=XYZ; it is not saved.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const poi = store.get(id);
    const root = document.getElementById('poi-root');

    if (!poi || store.typeOf(poi) !== 'poi') {
        root.innerHTML = `
            <div class="poi-empty">
                <p class="poi-eyebrow">Ledger Missing</p>
                <h2>No landmark by that name</h2>
                <p>${id ? `“${id}” is not in the archive.` : 'No landmark id was given.'}</p>
                <a href="pois.html" class="poi-link">Back to the landmarks</a>
            </div>`;
        return;
    }

    const tavern = poi.tavern && poi.tavern.tier ? poi.tavern : null;
    const $ = sel => document.getElementById(sel);

    document.title = `${poi.name} - The Athenaeum Vault`;
    root.classList.toggle('is-danger', !!poi.danger);

    // Hero
    $('poi-image').src = poi.image || 'images/pois/placeholder.png';
    $('poi-image').alt = poi.name;
    $('poi-eyebrow').textContent = tavern ? 'Tavern & Lodging' : poi.danger ? 'Danger Zone' : poi.featured ? 'Featured Landmark' : 'Landmark';
    $('poi-title').textContent = poi.name;
    $('poi-subtitle').textContent = poi.subtitle || '';
    const crumbs = store.ancestors(poi).filter(p => store.typeOf(p) !== 'continent').reverse();
    $('poi-location').innerHTML = crumbs.length
        ? crumbs.map(p => `<a class="poi-link" href="${store.url(p)}">${p.shortName || p.name}</a>`).join('')
        : 'Unknown';

    // Lore
    $('poi-body-title').textContent = tavern ? 'The Establishment' : 'Archive Entry';
    $('poi-body').innerHTML = poi.body
        ? store.autolink(store.md(poi.body, { dropCap: true }), { exclude: poi.id })
        : '<p class="poi-muted">No lore recorded for this landmark yet.</p>';

    // People whose home is this POI
    const people = store.backrefs(poi, 'npc', 'home');
    if (people.length) {
        $('poi-people-title').textContent = tavern ? 'Behind the Bar' : 'Found Here';
        $('poi-people').innerHTML = people.map(npc => `
            <a href="${store.url(npc)}" class="poi-npc">
                <img src="${npc.avatar || npc.portrait || 'images/placeholder.png'}" alt="${npc.name}">
                <span>
                    <span class="poi-npc-name">${npc.name}</span>
                    <span class="poi-npc-role">${npc.role || ''}</span>
                </span>
            </a>`).join('');
        $('poi-people-section').hidden = false;
    }

    if (!tavern) {
        $('poi-grid').classList.add('poi-grid--single');
        return;
    }

    // Tavern
    const T = Athenaeum.tavern;
    $('poi-tier').textContent = T.tierOf(store, tavern).label;
    $('poi-tier-fact').hidden = false;
    if (tavern.hours) {
        $('poi-hours').textContent = tavern.hours;
        $('poi-hours-fact').hidden = false;
    }

    const services = T.buildServices(store, poi);
    if (services.length) {
        $('poi-services').innerHTML = services.map(s => `
            <li class="poi-item">
                <div class="poi-item-line">
                    <span class="poi-item-name">${s.name}</span>
                    <span class="poi-leader" aria-hidden="true"></span>
                    <span class="poi-item-price">${s.priceLabel}${s.unit ? ` <span class="poi-unit">${s.unit}</span>` : ''}</span>
                </div>
                ${s.desc ? `<p class="poi-item-desc">${s.desc}</p>` : ''}
            </li>`).join('');
        $('poi-services-section').hidden = false;
    }

    const code = params.has('code') ? params.get('code') : (store.settings.tavernCode || '');
    $('poi-menu').innerHTML = T.buildMenu(store, poi, code).map(cat => `
        <section class="poi-menu-cat">
            <h3 class="poi-menu-cat-title">${cat.label}</h3>
            <ul>
                ${cat.items.map(item => `
                    <li class="poi-item${item.signature ? ' poi-item--signature' : ''}">
                        <div class="poi-item-line">
                            <span class="poi-item-name">${item.signature ? '<span class="poi-star" title="House speciality">✦</span>' : ''}${item.name}</span>
                            <span class="poi-leader" aria-hidden="true"></span>
                            <span class="poi-item-price">${item.priceLabel}</span>
                        </div>
                        ${item.desc ? `<p class="poi-item-desc">${item.desc}</p>` : ''}
                    </li>`).join('')}
            </ul>
        </section>`).join('');
    $('poi-folio').textContent = T.folioLabel(code, poi.id);
    $('poi-menu-card').hidden = false;
});
