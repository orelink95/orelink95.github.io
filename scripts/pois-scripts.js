document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.getElementById('poi-grid');
    const continentFilter = document.getElementById('filter-continent');
    const countryFilter = document.getElementById('filter-country');
    const settlementFilter = document.getElementById('filter-settlement');

    let allPOIs = [];

    // 1. BUILD THE VIEW MODEL FROM THE STORE
    const store = await Athenaeum.ready;
    allPOIs = store.all('poi').map(poi => {
        const chain = store.ancestors(poi);
        const at = type => (chain.find(p => store.typeOf(p) === type) || {});
        const district = at('district'), settlement = at('settlement'), country = at('country');
        return {
            uid: poi.id,
            url: store.url(poi),
            continent: at('continent').name,
            country: country.name,
            settlement: settlement.name || country.name || '',
            district: district.shortName || district.name || '',
            title: poi.name,
            subtitle: poi.subtitle || 'Landmark',
            isDanger: !!poi.danger,
            isFeatured: !!poi.featured,
            isSafe: !!poi.safe,
            isTavern: !!(poi.tavern && poi.tavern.tier),
            icon: (poi.map || {}).icon,
            body: poi.body ? store.autolink(store.md(poi.body, { dropCap: true }), { exclude: poi.id }) : '',
            image: poi.image || 'images/pois/placeholder.png',
            residents: store.backrefs(poi, 'npc', 'home')
        };
    });

    // 2. POPULATE DROPDOWNS
    const populate = (el, key, label) => {
        const values = [...new Set(allPOIs.map(p => p[key]))].filter(Boolean);
        el.innerHTML = `<option value="all">${label}</option>` +
            values.map(v => `<option value="${v}">${v}</option>`).join('');
    };
    populate(continentFilter, 'continent', 'All Continents');
    populate(countryFilter, 'country', 'All Regions');
    populate(settlementFilter, 'settlement', 'All Settlements');

    // 3. RENDER GRID
    function renderGrid(pois) {
        if (pois.length === 0) {
            grid.innerHTML = `<p class="poi-grid__empty">No landmarks found in these records.</p>`;
            return;
        }

        grid.innerHTML = pois.map(poi => {
            let matIcon = 'location_on';
            if (poi.icon === 'capital' || poi.icon === 'castle') matIcon = 'fort';
            if (poi.icon === 'fort') matIcon = 'local_police';
            if (poi.icon === 'danger') matIcon = 'skull';
            if (poi.icon === 'pay-money') matIcon = 'payments';
            if (poi.icon === 'beer') matIcon = 'sports_bar';
            if (poi.icon === 'bookshelf') matIcon = 'book_2';
            if (poi.icon === 'spinning-blades') matIcon = 'swords';
            if (poi.icon === 'house') matIcon = 'house';

            let pillHTML = '';
            if (poi.isDanger) {
                pillHTML = `<div class="poi-pill poi-pill--danger">
                    <span class="poi-pill__dot"></span>
                    <span class="poi-pill__label">Danger</span>
                </div>`;
            } else if (poi.isFeatured) {
                pillHTML = `<div class="poi-pill poi-pill--featured">
                    <span class="poi-pill__dot"></span>
                    <span class="poi-pill__label">Featured</span>
                </div>`;
            } else if (poi.isSafe || poi.icon === 'health_and_safety' || poi.title.toLowerCase().includes('safe')) {
                pillHTML = `<div class="poi-pill poi-pill--safe">
                    <span class="poi-pill__dot"></span>
                    <span class="poi-pill__label">Safe</span>
                </div>`;
            }

            return `
            <div class="poi-card" onclick="openPOIModal('${poi.uid}')">
                <div class="poi-card-inner">
                    <div class="poi-card-front">
                        <img class="poi-card__img" src="${poi.image}" />
                        <div class="poi-card__shade"></div>
                        <div class="poi-card__caption">
                            <h3 class="poi-card__name">${poi.title}</h3>
                            <p class="poi-card__region">${poi.settlement}</p>
                        </div>
                        ${pillHTML}
                    </div>

                    <div class="poi-card-back">
                        <span class="poi-card__icon material-symbols-outlined" style="font-variation-settings: 'FILL' 0;">${matIcon}</span>
                        <h3 class="poi-card__back-name">${poi.title}</h3>
                        <p class="poi-card__back-region">${poi.subtitle}</p>
                        <div class="poi-card__rule"></div>
                        <button class="poi-card__button">
                            Read Full Entry
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // 4. FILTER ACTIONS
    const apply = () => {
        const filtered = allPOIs.filter(p =>
            (continentFilter.value === 'all' || p.continent === continentFilter.value) &&
            (countryFilter.value === 'all' || p.country === countryFilter.value) &&
            (settlementFilter.value === 'all' || p.settlement === settlementFilter.value)
        );
        renderGrid(filtered);
    };
    [continentFilter, countryFilter, settlementFilter].forEach(f => f.addEventListener('change', apply));

    // 5. MODAL LOGIC (Updated to inject NPCs)
    window.openPOIModal = (uid) => {
        const legacy = String(uid || '').replace(/_/g, '-').replace(/^the-/, '');
        const poi = allPOIs.find(p => p.uid === uid) || allPOIs.find(p => p.uid === legacy);
        if (!poi) return;

        // Populate standard POI details
        document.getElementById('modal-img').src = poi.image;
        document.getElementById('modal-uid').textContent = `ARCHIVE ID: ${poi.uid.toUpperCase()}`;
        document.getElementById('modal-title').textContent = poi.title;
        document.getElementById('modal-body').innerHTML = poi.body || '<p class="poi-modal__empty">No deep lore recorded for this landmark yet.</p>';
        document.getElementById('modal-location').textContent = [poi.settlement, poi.district].filter(Boolean).join(', ');
        const pageLink = document.getElementById('modal-page-link');
        pageLink.href = poi.url;
        pageLink.textContent = poi.isTavern ? 'Enter the Tavern' : 'Open the Full Entry';

        const linkedNPCs = poi.residents.map(npc => ({ id: npc.id, name: npc.name, role: npc.role || '', image: npc.avatar || npc.portrait }));
        const npcSection = document.getElementById('modal-npc-section');
        const npcContainer = document.getElementById('modal-npcs');

        if (linkedNPCs.length > 0) {
            npcContainer.innerHTML = linkedNPCs.map(npc => `
                <div class="resident-row">
                    
                    <img src="${npc.image || 'images/placeholder.png'}" class="resident-row__img" alt="${npc.name}">
                    
                    <div class="resident-row__info">
                        <div class="resident-row__head">
                            <h4 class="resident-row__name">${npc.name}</h4>
                            <a href="${store.url(npc.id)}" class="resident-row__link material-symbols-outlined" title="View Profile">person_search</a>
                        </div>
                        <p class="resident-row__role">${npc.role}</p>
                    </div>
                </div>
            `).join('');
            npcSection.classList.remove('hidden');
        } else {
            npcContainer.innerHTML = '';
            npcSection.classList.add('hidden');
        }

        const modal = document.getElementById('poi-modal');
        modal.classList.remove('hidden');
    };

    window.closePOIModal = () => document.getElementById('poi-modal').classList.add('hidden');

    renderGrid(allPOIs);


    // --- URL PARAMETER LISTENER ---
    // Checks if we arrived here from a Scriptorium link
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');

    if (targetId) {
        setTimeout(() => {
            if (typeof window.openPOIModal === 'function') {
                window.openPOIModal(targetId);
            }
        }, 150); // Slight delay ensures the grid and data are fully loaded first
    }
});
