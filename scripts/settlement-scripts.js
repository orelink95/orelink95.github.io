// --- URL PARAMETER LISTENER ---
const urlParams = new URLSearchParams(window.location.search);
const targetId = urlParams.get('id');

if (targetId) {
    setTimeout(() => {
        if (typeof window.loadSettlement === 'function') {
            window.loadSettlement(targetId);
        }
    }, 150);
};

document.addEventListener("DOMContentLoaded", () => {




    // --- 1. MAGIC GLOW SPOTLIGHT ---
    const loreCards = document.querySelectorAll('.lore-card');
    loreCards.forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
            card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
        });
    });

    // --- 2. URL & REGISTRY SETUP ---
    const urlParams = new URLSearchParams(window.location.search);
    let settlementId = urlParams.get('id');

    if (!settlementId || !settlementRegistry[settlementId]) {
        settlementId = 'brightend';
    }

    const data = settlementRegistry[settlementId];
    let currentDistrictIdx = 0;

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
            card.className = "group cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-all duration-300 border border-transparent hover:border-outline-variant/10";
            card.innerHTML = `
                <div class="flex gap-4 items-start">
                    <div class="relative w-14 h-18 flex-shrink-0">
                        <img class="w-full h-full object-cover rounded shadow-md grayscale group-hover:grayscale-0 transition-all duration-500 border border-outline-variant/30" src="${npc.image}" alt="${npc.name}"/>
                    </div>
                    <div class="flex-grow">
                        <div class="flex justify-between items-start">
                            <h4 class="font-noto-serif text-sm font-bold text-secondary group-hover:text-secondary-fixed transition-colors leading-tight mb-1">${npc.name}</h4>
                            
                            <a href="npc.html?id=${npc.id}" class="material-symbols-outlined text-[14px] text-on-surface/20 hover:text-primary transition-colors" title="View Full Profile">person_search</a>
                        </div>
                        <p class="font-label text-[9px] uppercase tracking-widest text-on-surface/40 mb-2">${npc.role}</p>
                        <p class="font-newsreader text-xs text-on-surface/70 line-clamp-2 leading-tight italic mb-2">"${npc.quote}"</p>
                        <div class="flex items-center gap-1.5 text-primary/60 text-[9px] uppercase tracking-widest font-label">
                            <span class="material-symbols-outlined text-[14px]">location_on</span>
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
        const bgColor = isDanger ? 'bg-[#3b0909]' : 'bg-[#1a3020]';
        const borderColor = isDanger ? 'border-[#ff5252]' : 'border-[#f8fafc]';
        return L.divIcon({
            className: 'bg-transparent border-none cursor-pointer transition-transform duration-300 hover:-translate-y-1',
            html: `
                <div class="${bgColor} ${borderColor} border-2 shadow-[0_4px_10px_rgba(0,0,0,0.6)]" style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; box-sizing: border-box;">
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
                <div class='text-center p-1'>
                    <b class='font-headline text-lg ${pin.isDanger ? 'text-error' : 'text-secondary'} block mb-1'>${pin.title}</b>
                    <span class='font-label text-[9px] uppercase tracking-widest text-on-surface-variant/80'>${pin.subtitle}</span>
                </div>
            `, { className: 'fantasy-popup' });

            marker.on('click', () => updateLorePanel(pin.title, pin.entry, pin.body));
            marker.addTo(markerGroup);

            // Map the title to the marker object
            pinLookup[pin.title] = marker;
        });

        // REFRESH NPCS for the new district
        renderNPCs(dist.npcs || [], pinLookup);

        updateLorePanel(dist.lore.title, dist.lore.entry, dist.lore.body);

        document.querySelectorAll('.district-btn').forEach((btn, i) => {
            if (i === index) {
                btn.classList.replace('text-on-surface-variant', 'text-primary');
                btn.classList.add('bg-primary-container');
            } else {
                btn.classList.replace('text-primary', 'text-on-surface-variant');
                btn.classList.remove('bg-primary-container');
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
        toggleBtn.classList.add('flex');

        data.districts.forEach((dist, i) => {
            const btn = document.createElement('button');
            btn.className = `district-btn px-4 py-1.5 text-[10px] font-label uppercase tracking-widest rounded-sm transition-all duration-300`;
            btn.textContent = dist.name;
            btn.onclick = () => {
                loadDistrict(i);
                map.closePopup();
                closeDistrictMenu();
            };
            navContainer.appendChild(btn);
        });

        function toggleDistrictMenu() {
            if (navWrapper.classList.contains('max-h-0')) {
                navWrapper.classList.remove('max-h-0', 'opacity-0');
                navWrapper.classList.add('max-h-[200px]', 'opacity-100');
                chevron.classList.add('rotate-180');
            } else {
                closeDistrictMenu();
            }
        }

        function closeDistrictMenu() {
            navWrapper.classList.add('max-h-0', 'opacity-0');
            navWrapper.classList.remove('max-h-[200px]', 'opacity-100');
            chevron.classList.remove('rotate-180');
        }

        toggleBtn.addEventListener('click', toggleDistrictMenu);
    }

    // --- UPDATED COORDINATE FINDER POPUP ---
    map.on('click', function (e) {
        // Keep the existing lore reset logic
        const currentDist = data.districts[currentDistrictIdx];
        updateLorePanel(currentDist.lore.title, currentDist.lore.entry, currentDist.lore.body);

        // Calculate the coordinates
        const y = Math.round(e.latlng.lat);
        const x = Math.round(e.latlng.lng);

        // Display a themed popup with the coordinates
        L.popup({ className: 'fantasy-popup' })
            .setLatLng(e.latlng)
            .setContent(`
                <div class="text-center p-1">
                    <span class="font-label text-[10px] uppercase tracking-[0.2em] text-primary/60 block mb-1">Archive Coordinate</span>
                    <div class="flex gap-4 justify-center items-center">
                        <div class="text-center">
                            <span class="block font-label text-[8px] text-on-surface/40">LAT (Y)</span>
                            <span class="text-secondary font-bold text-lg">${y}</span>
                        </div>
                        <div class="w-px h-8 bg-outline-variant/20"></div>
                        <div class="text-center">
                            <span class="block font-label text-[8px] text-on-surface/40">LNG (X)</span>
                            <span class="text-secondary font-bold text-lg">${x}</span>
                        </div>
                    </div>
                </div>
            `)
            .openOn(map);

        // Keeping the console log just in case you need to copy-paste
        console.log(`Settlement Coords - Y: ${y}, X: ${x}`);
    });


    loadDistrict(0);


});