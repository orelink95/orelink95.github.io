document.addEventListener("DOMContentLoaded", async () => {

    // --- 1. MAGIC GLOW SPOTLIGHT FOR LORE CARD ---
    const loreCards = document.querySelectorAll('.lore-card');
    loreCards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // --- 2. URL & DATA SETUP ---
    const store = await Athenaeum.ready;
    const urlParams = new URLSearchParams(window.location.search);
    let country = store.get(urlParams.get('id'));
    if (!country || store.typeOf(country) !== 'country') country = store.get('eperina') || store.all('country')[0];

    const lore = rec => rec.body ? store.autolink(store.md(rec.body, { dropCap: true }), { exclude: rec.id }) : '';
    const continent = store.parent(country) || {};
    const mapImage = country.mapImage || null;

    // Same shape the page always rendered; built from the store.
    const data = {
        continentName: continent.name || '',
        continentId: continent.id ? store.url(continent) : '#',
        regionName: country.name,
        description: country.summary || country.subtitle || '',
        mapImage: mapImage ? mapImage.src : '',
        mapWidth: mapImage ? mapImage.width : 0,
        mapHeight: mapImage ? mapImage.height : 0,
        defaultLore: { entry: country.codex, title: country.loreTitle || country.name, body: lore(country) },
        // Pins: the settlements and POIs placed on this country's map.
        pins: store.children(country).filter(c => c.map).map(c => ({
            id: c.id, title: c.name, subtitle: c.subtitle || '', entry: c.codex, body: lore(c),
            icon: c.map.icon || 'settlement', isDanger: !!c.danger, y: c.map.y, x: c.map.x,
            url: store.url(c), kind: store.typeOf(c)
        }))
    };

    // Basic Page Info Injection
    const continentLink = document.getElementById('dynamic-continent-name');
    continentLink.textContent = data.continentName;
    continentLink.href = data.continentId || '#';
    document.getElementById('dynamic-region-name').textContent = data.regionName;
    document.getElementById('dynamic-title').textContent = data.regionName;
    document.getElementById('dynamic-description').textContent = data.description;
    if (data.mapImage) document.getElementById('dynamic-bg-blur').style.backgroundImage = `url('${data.mapImage}')`;
    document.title = `${data.regionName} - The Athenaeum Vault`;


    // --- 3. LORE PANEL LOGIC ---
    function updateLorePanel(loreData) {
        document.getElementById('lore-entry-id').textContent = loreData.entry || 'Codex Entry';
        document.getElementById('lore-title').textContent = loreData.title || data.regionName;
        document.getElementById('lore-body').innerHTML = loreData.body || '<p>No archival records found.</p>';

        const resetBtn = document.getElementById('reset-lore-btn');
        if (resetBtn) {
            // Hide the 'Undo' button if we are looking at the default overview
            if (loreData.title === data.defaultLore.title) resetBtn.classList.add('hidden');
            else resetBtn.classList.remove('hidden');
        }
    }

    // Initialize the lore panel with the country's default overview
    updateLorePanel(data.defaultLore);

    // Reset button logic
    const resetLoreBtn = document.getElementById('reset-lore-btn');
    if (resetLoreBtn) {
        resetLoreBtn.addEventListener('click', () => {
            updateLorePanel(data.defaultLore);
            if (map) map.closePopup();
        });
    }

    // --- 4. MAP INITIALIZATION ---
    const mapElement = document.getElementById('country-map');
    if (!mapElement) return;
    if (!data.mapImage) {
        mapElement.innerHTML = '<p class="map-empty font-newsreader">No map of this land has reached the archive yet.</p>';
        return;
    }

    const map = L.map('country-map', {
        crs: L.CRS.Simple,
        minZoom: -1,
        maxZoom: 2,
        zoomControl: false,
        attributionControl: false
    });

    const bounds = [[0, 0], [data.mapHeight, data.mapWidth]];
    L.imageOverlay(data.mapImage, bounds).addTo(map);
    map.fitBounds(bounds);
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Clicking empty space on the map resets the lore to default
    map.on('click', function (e) {
        updateLorePanel(data.defaultLore);
        console.log(`Region Coords: Y: ${Math.round(e.latlng.lat)}, X: ${Math.round(e.latlng.lng)}`);
    });

    // --- 5. RENDER PINS ---
    function createFantasyIcon(iconName, isDanger = false) {
        const tone = isDanger ? 'region-pin--danger' : '';   // red pins for dangerous places

        return L.divIcon({
            className: 'map-pin-shell',
            html: `
                <div class="region-pin ${tone}"
                     style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; box-sizing: border-box;">
                    <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%); pointer-events: none;"></div>
                    <img src="./images/atlas_icons/${iconName}.svg" 
                         style="width: 16px; height: 16px; min-width: 16px; object-fit: contain; display: block; filter: brightness(0) invert(1) sepia(1) saturate(${isDanger ? '4' : '0'}) hue-rotate(${isDanger ? '-50deg' : '0deg'});" />
                </div>
            `,
            iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16]
        });
    }

    data.pins.forEach(pin => {
        const marker = L.marker(L.latLng(pin.y, pin.x), { icon: createFantasyIcon(pin.icon, pin.isDanger) });
        const colorClass = pin.isDanger ? 'map-popup__title--danger' : '';

        const exploreButton = `<a href="${pin.url}" class="map-popup__button">${pin.kind === 'settlement' ? 'Explore Settlement' : 'Open the Entry'}</a>`;

        marker.bindPopup(`
            <div class='map-popup'>
                <b class='map-popup__title ${colorClass}'>${pin.title}</b>
                <span class='map-popup__subtitle'>${pin.subtitle}</span>
                ${exploreButton}
            </div>
        `, { className: 'fantasy-popup' });

        // Update lore panel when a specific pin is clicked
        marker.on('click', () => {
            updateLorePanel({
                title: pin.title,
                entry: pin.entry,
                body: pin.body
            });
        });

        marker.addTo(map);
    });



});
