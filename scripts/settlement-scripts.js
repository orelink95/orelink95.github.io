document.addEventListener("DOMContentLoaded", async () => {




    // --- 1. MAGIC GLOW SPOTLIGHT ---
    const loreCards = document.querySelectorAll('.lore-card');
    loreCards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
            card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
        });
    });

    // --- 2. URL & DATA SETUP ---
    const store = await Athenaeum.ready;
    const urlParams = new URLSearchParams(window.location.search);
    let targetDistrict = urlParams.get('district');
    let settlement = store.get(urlParams.get('id'));
    if (!settlement || store.typeOf(settlement) !== 'settlement') settlement = store.get('brightend') || store.all('settlement')[0];

    const lore = (rec, dropCap) => rec.body ? store.autolink(store.md(rec.body, { dropCap }), { exclude: rec.id }) : '';
    const npcView = npc => ({
        id: npc.id, name: npc.name, role: npc.role || '', quote: npc.quote || '…',
        image: npc.avatar || npc.portrait || 'images/placeholder.png',
        homePinTitle: (store.get(npc.home) || {}).name || npc.whereabouts || ''
    });
    const country = store.ancestors(settlement).find(p => store.typeOf(p) === 'country') || {};
    const continent = store.ancestors(settlement).find(p => store.typeOf(p) === 'continent') || {};

    // Same shape the page always rendered; built from the store.
    const data = {
        continentName: continent.name, continentId: continent.id ? store.url(continent) : '#',
        countryName: country.name, countryId: country.id ? store.url(country) : '#',
        settlementName: settlement.name,
        descriptor: settlement.summary || '',
        districts: store.children(settlement, 'district').map(d => {
            const pois = store.children(d, 'poi');
            const residents = [...store.backrefs(d, 'npc', 'home'), ...pois.flatMap(p => store.backrefs(p, 'npc', 'home'))];
            return {
                id: d.id,
                name: d.shortName || d.name,
                mapImage: (d.mapImage || {}).src || 'images/placeholder.png',
                mapWidth: (d.mapImage || {}).width || 1000,
                mapHeight: (d.mapImage || {}).height || 1000,
                lore: { title: d.name, entry: d.codex, body: lore(d, true) },
                npcs: residents.map(npcView),
                pins: pois.filter(p => p.map).map(p => ({
                    id: p.id, title: p.name, subtitle: p.subtitle || '', entry: p.codex,
                    body: lore(p, true), icon: p.map.icon || 'settlement', isDanger: !!p.danger,
                    y: p.map.y, x: p.map.x, url: store.url(p), isTavern: !!(p.tavern && p.tavern.tier)
                }))
            };
        })
    };

    // --- 3. INJECT BREADCRUMBS & HEADERS ---
    document.getElementById('dynamic-continent-link').textContent = data.continentName;
    document.getElementById('dynamic-continent-link').href = data.continentId || '#';
    document.getElementById('dynamic-country-link').textContent = data.countryName;
    document.getElementById('dynamic-country-link').href = data.countryId || '#';
    document.getElementById('dynamic-settlement-name').textContent = data.settlementName;
    document.getElementById('dynamic-title').textContent = data.settlementName;
    document.getElementById('dynamic-description').textContent = data.descriptor;

    // --- 4. LORE PANEL LOGIC ---
    function updateLorePanel(title, entry, body) {
        document.getElementById('lore-entry-id').textContent = entry || 'Location Codex';
        document.getElementById('lore-title').textContent = title || 'Unknown Location';
        document.getElementById('lore-body').innerHTML = body || '<p>No archival records found.</p>';
    }

    // --- 5. NPC SIDEBAR RENDERER (Updated for IDs) ---
    function renderNPCs(npcArray, pinLookup) {
        const container = document.getElementById('dynamic-npc-list');
        container.innerHTML = '';
        document.getElementById('dynamic-npc-count').textContent = `${npcArray.length} Known`;

        npcArray.forEach(npc => {
            const card = document.createElement('div');
            // We add the ID as a data-attribute for future-proofing
            card.setAttribute('data-npc-id', npc.id);
            card.className = "resident";
            card.innerHTML = `
                <div class="resident__row">
                    <div class="resident__portrait h-18">
                        <img class="resident__image" src="${npc.image}" alt="${npc.name}"/>
                    </div>
                    <div class="resident__body">
                        <div class="resident__name-row">
                            <h4 class="resident__name font-noto-serif">${npc.name}</h4>
                            
                            <a href="${store.url(npc.id)}" class="resident__profile-link material-symbols-outlined" title="View Full Profile">person_search</a>
                        </div>
                        <p class="resident__role">${npc.role}</p>
                        <p class="resident__quote font-newsreader">"${npc.quote}"</p>
                        <div class="resident__place">
                            <span class="resident__place-icon material-symbols-outlined">location_on</span>
                            ${npc.homePinTitle || 'Unknown Location'}
                        </div>
                    </div>
                </div>
            `;

            // Click the card body to center the map, but don't trigger if the search icon is clicked
            card.onclick = (e) => {
                if (e.target.closest('a')) return;
                const marker = pinLookup[npc.homePinTitle];
                if (marker) {
                    map.panTo(marker.getLatLng(), { animate: true });
                    marker.openPopup();
                }
            };

            container.appendChild(card);
        });
    }

    // --- 6. LEAFLET MAP & DISTRICT ENGINE ---
    const mapElement = document.getElementById('settlement-map');
    if (!mapElement) return;

    const map = L.map('settlement-map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 2, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: 'topright' }).addTo(map);

    let currentOverlay = null;
    let markerGroup = L.layerGroup().addTo(map);

    function createFantasyIcon(iconName, isDanger = false) {
        const tone = isDanger ? 'region-pin--danger' : '';   // red pins for dangerous places
        return L.divIcon({
            className: 'map-pin-shell',
            html: `
                <div class="region-pin ${tone}" style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; box-sizing: border-box;">
                    <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%); pointer-events: none;"></div>
                    <img src="./images/atlas_icons/${iconName}.svg" style="width: 16px; height: 16px; min-width: 16px; object-fit: contain; display: block; filter: brightness(0) invert(1) sepia(1) saturate(${isDanger ? '4' : '0'}) hue-rotate(${isDanger ? '-50deg' : '0deg'});" />
                </div>
            `,
            iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16]
        });
    }

    function loadDistrict(index) {
        currentDistrictIdx = index;
        const dist = data.districts[index];

        document.getElementById('dynamic-bg-blur').style.backgroundImage = `url('${dist.mapImage}')`;

        if (currentOverlay) map.removeLayer(currentOverlay);
        const bounds = [[0, 0], [dist.mapHeight, dist.mapWidth]];
        currentOverlay = L.imageOverlay(dist.mapImage, bounds).addTo(map);
        map.fitBounds(bounds);

        // Clear pins and build a lookup dictionary for the NPC sidebar
        markerGroup.clearLayers();
        const pinLookup = {};

        dist.pins.forEach(pin => {
            const marker = L.marker(L.latLng(pin.y, pin.x), { icon: createFantasyIcon(pin.icon, pin.isDanger) });
            marker.bindPopup(`
                <div class='map-popup'>
                    <b class='map-popup__title ${pin.isDanger ? 'map-popup__title--danger' : ''}'>${pin.title}</b>
                    <span class='map-popup__subtitle'>${pin.subtitle}</span>
                    <a href='${pin.url}' class='map-popup__link'>${pin.isTavern ? 'Enter the tavern' : 'Open the entry'}</a>
                </div>
            `, { className: 'fantasy-popup' });

            marker.on('click', () => updateLorePanel(pin.title, pin.entry, pin.body));
            marker.addTo(markerGroup);

            // Map the title to the marker object
            pinLookup[pin.title] = marker;
        });

        const npcObjects = dist.npcs;
        renderNPCs(npcObjects, pinLookup);
        updateLorePanel(dist.lore.title, dist.lore.entry, dist.lore.body);

        document.querySelectorAll('.district-btn').forEach((btn, i) => {
            if (i === index) {
                btn.classList.add('is-active');
            } else {
                btn.classList.remove('is-active');
            }
        });
    }

    // --- 7. BUILD DISTRICT NAVIGATION & ANIMATION ---
    const navContainer = document.getElementById('district-nav');
    const toggleBtn = document.getElementById('district-toggle-btn');
    const navWrapper = document.getElementById('district-nav-wrapper');
    const chevron = document.getElementById('district-chevron');

    if (data.districts.length > 1) {
        toggleBtn.classList.remove('hidden');

        data.districts.forEach((dist, i) => {
            const btn = document.createElement('button');
            btn.className = 'district-btn';
            btn.textContent = dist.name;
            btn.onclick = () => {
                loadDistrict(i);
                map.closePopup();
                closeDistrictMenu();
            };
            navContainer.appendChild(btn);
        });

        function toggleDistrictMenu() {
            if (!navWrapper.classList.contains('is-open')) {
                navWrapper.classList.add('is-open');
                chevron.classList.add('is-open');
            } else {
                closeDistrictMenu();
            }
        }

        function closeDistrictMenu() {
            navWrapper.classList.remove('is-open');
            chevron.classList.remove('is-open');
        }

        toggleBtn.addEventListener('click', toggleDistrictMenu);
    }


    // --- 8. SMART DISTRICT LOADER ---
    let initialDistrictIdx = 0; // Default to the first district

    if (targetDistrict) {
        // If the URL passes a direct number 
        if (!isNaN(targetDistrict) && targetDistrict >= 0 && targetDistrict < data.districts.length) {
            initialDistrictIdx = parseInt(targetDistrict);
        } else {
            // If the URL passes a name format the string to handle underscores and capitalization gracefully
            const searchStr = targetDistrict.toLowerCase().replace(/_/g, ' ');
            const foundIdx = data.districts.findIndex(d =>
                d.name.toLowerCase() === searchStr ||
                (d.id && d.id.toLowerCase() === targetDistrict.toLowerCase())
            );

            if (foundIdx !== -1) {
                initialDistrictIdx = foundIdx;
            }
        }
    }

    // Load the correct one!
    loadDistrict(initialDistrictIdx);


});