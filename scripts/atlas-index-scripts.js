// =====================================================================
// ATLAS LIST PAGES  —  continents.html, countries.html, settlements.html, pois.html
// <body data-atlas-index="settlement"> says which type the page lists.
//   - One card per record (a link to its page), in the card style of the
//     old Points of Interest page.
//   - A name search, plus one menu per place above the type
//     (settlements: continent and country; POIs: continent, country, settlement).
//     The menus narrow each other: pick a continent, the country menu only
//     offers its countries.
// Countries marked "unlisted" stay off the Countries list, as on the continent page.
// POIs inside another POI (the halls of a university…) stay off the POI list too:
// the card of the place that holds them says how many it has, and its page lists
// them. A name search still finds them.
// Names come from Atlas.LABELS (scripts/atlas-common.js).
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const type = document.body.dataset.atlasIndex;
    const store = await Athenaeum.ready;
    const $ = id => document.getElementById(id);
    const LABELS = Atlas.LABELS;

    // Old links (scriptorium, bookmarks) to pois.html?id=... now open the POI page
    if (type === 'poi') {
        const oldId = new URLSearchParams(window.location.search).get('id');
        if (oldId) {
            const legacy = oldId.replace(/_/g, '-').replace(/^the-/, '');
            const poi = store.get(oldId) || store.get(legacy);
            if (poi) { window.location.replace(store.url(poi)); return; }
        }
    }

    // -----------------------------------------------------------------
    // 1. HEADER
    // -----------------------------------------------------------------
    const label = LABELS[type];
    document.title = `${label.many} - The Athenaeum Vault`;
    $('index-title').textContent = label.many;
    Atlas.breadcrumbs(store, $('atlas-breadcrumbs'), null, label.many);

    // -----------------------------------------------------------------
    // 2. ONE VIEW MODEL PER RECORD
    // -----------------------------------------------------------------
    const LEVELS = ['continent', 'country', 'settlement'];
    const filterTypes = LEVELS.slice(0, type === 'poi' ? 3 : LEVELS.indexOf(type));

    // POI card icons (back of the card), from the pin icon names: data/map-icons.json
    // (set in the dashboard, Site › Map icons), else these defaults
    const POI_ICONS = {
        capital: 'fort', castle: 'fort', fort: 'local_police', danger: 'skull', 'pay-money': 'payments',
        beer: 'sports_bar', bookshelf: 'book_2', 'spinning-blades': 'swords', house: 'house'
    };
    for (const ic of ((store.singletons || {}).mapIcons || {}).icons || []) if (ic && ic.id && ic.cardIcon) POI_ICONS[ic.id] = ic.cardIcon;

    const records = store.all(type).filter(r => !(type === 'country' && r.unlisted));
    const items = records.map(rec => {
        const chain = store.ancestors(rec);
        const at = t => chain.find(p => store.typeOf(p) === t) || null;
        const district = at('district');
        const firstDistrictMap = type === 'settlement'
            ? (store.children(rec, 'district').find(d => d.mapImage && d.mapImage.src) || {}).mapImage
            : null;
        const image = rec.image
            || (rec.mapImage && rec.mapImage.src)
            || (firstDistrictMap && firstDistrictMap.src)
            || 'images/pois/placeholder.png';

        // Line under the name on the front: where the place is
        let where = '';
        if (type === 'continent') where = rec.subtitle || '';
        else if (type === 'country') where = (at('continent') || {}).name || '';
        else if (type === 'settlement') where = (at('country') || {}).name || '';
        // Settlements without real districts have one wrapper district with the
        // settlement's own name: drop duplicates so it reads "Deercrest", not "Deercrest, Deercrest"
        // A place inside an institution names it first: "Caeraotrom Athenæum, Lemerolai"
        else where = [(at('poi') || {}).name, district && (district.shortName || district.name), (at('settlement') || at('country') || {}).name]
            .filter((v, i, a) => v && a.indexOf(v) === i).join(', ');

        // Status pill
        let pill = null;
        if (rec.danger) pill = ['danger', 'Danger'];
        else if (rec.featured) pill = ['featured', 'Featured'];
        else if (rec.safe || (type === 'poi' && ((rec.map || {}).icon === 'health_and_safety' || rec.name.toLowerCase().includes('safe')))) pill = ['safe', 'Safe'];

        return {
            rec,
            url: store.url(rec),
            name: rec.name,
            search: [rec.name, ...(rec.aliases || [])].join(' ').toLowerCase(),
            where,
            subtitle: rec.subtitle || rec.epithet || '',
            image,
            pill,
            icon: type === 'poi' ? (POI_ICONS[(rec.map || {}).icon] || 'location_on') : label.icon,
            cta: type === 'poi' ? Atlas.cta(store, rec) : 'Open the entry',
            // A place inside another POI: found by search only. `inside` = how many this one holds
            nested: type === 'poi' && !!at('poi'),
            inside: type === 'poi' ? store.descendants(rec, 'poi').length : 0,
            // ids of the places above, for the menus
            above: Object.fromEntries(filterTypes.map(t => [t, (at(t) || {}).id || '']))
        };
    });

    // -----------------------------------------------------------------
    // 3. MENUS (built only when they would offer a real choice)
    // -----------------------------------------------------------------
    const filtersBox = $('index-filters');
    const search = $('index-search');
    const menus = filterTypes.map(t => {
        const select = document.createElement('select');
        select.className = 'landmark-filter';
        select.dataset.level = t;
        select.setAttribute('aria-label', `Filter by ${LABELS[t].one.toLowerCase()}`);
        filtersBox.appendChild(select);
        return { type: t, select };
    });

    // Options of menu i: the places found among the cards that pass menus 0..i-1
    function refreshMenus() {
        menus.forEach((menu, i) => {
            const pool = items.filter(it => menus.slice(0, i).every(m => m.select.value === 'all' || it.above[m.type] === m.select.value));
            const ids = [...new Set(pool.map(it => it.above[menu.type]).filter(Boolean))];
            const places = ids.map(id => store.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
            const keep = places.some(p => p.id === menu.select.value) ? menu.select.value : 'all';
            menu.select.innerHTML = `<option value="all">All ${LABELS[menu.type].many}</option>` +
                places.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            menu.select.value = keep;
            // A menu with a single place to pick is no choice at all
            menu.select.classList.toggle('hidden', places.length < 2 && keep === 'all');
        });
    }

    // -----------------------------------------------------------------
    // 4. CARDS
    // -----------------------------------------------------------------
    function card(it) {
        const pill = it.pill ? `
            <div class="poi-pill poi-pill--${it.pill[0]}">
                <span class="poi-pill__dot"></span>
                <span class="poi-pill__label">${it.pill[1]}</span>
            </div>` : '';
        return `
        <a class="poi-card" href="${it.url}">
            <div class="poi-card-inner">
                <div class="poi-card-front">
                    <img class="poi-card__img" src="${it.image}" alt="" loading="lazy" />
                    <div class="poi-card__shade"></div>
                    <div class="poi-card__caption">
                        <h2 class="poi-card__name">${it.name}</h2>
                        ${it.where ? `<p class="poi-card__region">${it.where}</p>` : ''}
                        ${it.inside ? `<p class="poi-card__inside"><span class="material-symbols-outlined" aria-hidden="true">meeting_room</span>${it.inside} ${it.inside === 1 ? 'place' : 'places'} within</p>` : ''}
                        ${it.subtitle ? `<p class="poi-card__hint">${it.subtitle}</p>` : ''}
                    </div>
                    ${pill}
                </div>

                <div class="poi-card-back" aria-hidden="true">
                    <span class="poi-card__icon material-symbols-outlined" style="font-variation-settings: 'FILL' 0;">${it.icon}</span>
                    <h3 class="poi-card__back-name">${it.name}</h3>
                    <p class="poi-card__back-region">${it.subtitle || label.one}</p>
                    <div class="poi-card__rule"></div>
                    <span class="poi-card__button">${it.cta}</span>
                </div>
            </div>
        </a>`;
    }

    function render() {
        refreshMenus();
        const q = search.value.trim().toLowerCase();
        const listed = items.filter(it => !it.nested);
        const shown = items.filter(it =>
            (q ? it.search.includes(q) : !it.nested) &&
            menus.every(m => m.select.value === 'all' || it.above[m.type] === m.select.value));

        $('index-grid').innerHTML = shown.length
            ? shown.map(card).join('')
            : `<p class="poi-grid__empty">No ${label.many.toLowerCase()} found in these records.</p>`;
        const within = items.length - listed.length;
        $('index-count').textContent = shown.length === listed.length && !q
            ? `${listed.length} ${listed.length === 1 ? label.one : label.many} on record${within ? `, and ${within} more within them` : ''}`
            : `Showing ${shown.length} of ${items.length}`;
    }

    menus.forEach(m => m.select.addEventListener('change', render));
    search.addEventListener('input', render);
    render();
});