document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('poi-grid');
    const continentFilter = document.getElementById('filter-continent');
    const countryFilter = document.getElementById('filter-country');
    const settlementFilter = document.getElementById('filter-settlement');

    let allPOIs = [];
    let allNPCs = []; // NEW: Array to hold all registry NPCs

    // 1. EXTRACT DATA FROM REGISTRY
    for (const [settId, settlement] of Object.entries(settlementRegistry)) {
        if (!settlement.districts) continue;

        settlement.districts.forEach(district => {
            // Extract Pins
            if (district.pins) {
                district.pins.forEach(pin => {
                    const defaultImage = 'images/pois/placeholder.png';
                    const uid = pin.title.toLowerCase().replace(/[^a-z0-9]/g, '_');

                    allPOIs.push({
                        uid: uid,
                        continent: settlement.continentName,
                        country: settlement.countryName,
                        settlement: settlement.settlementName,
                        district: district.name,
                        title: pin.title,
                        subtitle: pin.subtitle || 'Landmark',
                        isDanger: pin.isDanger,
                        isFeatured: pin.isFeatured || false,
                        isSafe: pin.isSafe || false,
                        icon: pin.icon,
                        body: pin.body,
                        image: pin.image || pin.images || defaultImage
                    });
                });
            }

            // NEW: Extract NPCs
            if (district.npcs) {
                district.npcs.forEach(npc => {
                    allNPCs.push({
                        id: npc.id,
                        name: npc.name,
                        role: npc.role,
                        quote: npc.quote,
                        image: npc.image,
                        homePinTitle: npc.homePinTitle,
                        settlement: settlement.settlementName
                    });
                });
            }
        });
    }

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
            grid.innerHTML = `<p class="col-span-full text-center text-on-surface/40 py-20 italic font-newsreader text-xl">No landmarks found in these records.</p>`;
            return;
        }

        grid.innerHTML = pois.map(poi => {
            let matIcon = 'location_on';
            if (poi.icon === 'capital' || poi.icon === 'castle') matIcon = 'fort';
            if (poi.icon === 'skull') matIcon = 'skull';
            if (poi.icon === 'pay-money') matIcon = 'payments';

            let pillHTML = '';
            if (poi.isDanger) {
                pillHTML = `<div class="absolute top-4 right-4 flex items-center gap-2 bg-surface-dim/80 backdrop-blur-sm border border-error/30 px-3 py-1.5 rounded-full z-10 shadow-lg">
                    <span class="w-2 h-2 rounded-full bg-error animate-pulse shadow-[0_0_5px_rgba(255,82,82,0.8)]"></span>
                    <span class="text-[9px] font-label uppercase text-error tracking-widest">Danger</span>
                </div>`;
            } else if (poi.isFeatured) {
                pillHTML = `<div class="absolute top-4 right-4 flex items-center gap-2 bg-surface-dim/80 backdrop-blur-sm border border-primary/30 px-3 py-1.5 rounded-full z-10 shadow-lg">
                    <span class="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_5px_rgba(179,205,182,0.8)]"></span>
                    <span class="text-[9px] font-label uppercase text-primary tracking-widest">Featured</span>
                </div>`;
            } else if (poi.isSafe || poi.icon === 'health_and_safety' || poi.title.toLowerCase().includes('safe')) {
                pillHTML = `<div class="absolute top-4 right-4 flex items-center gap-2 bg-surface-dim/80 backdrop-blur-sm border border-secondary/30 px-3 py-1.5 rounded-full z-10 shadow-lg">
                    <span class="w-2 h-2 rounded-full bg-secondary animate-pulse shadow-[0_0_5px_rgba(233,193,118,0.8)]"></span>
                    <span class="text-[9px] font-label uppercase text-secondary tracking-widest">Safe</span>
                </div>`;
            }

            return `
            <div class="poi-card group w-full aspect-square perspective-1000 cursor-pointer" onclick="openPOIModal('${poi.uid}')">
                <div class="poi-card-inner relative w-full h-full">
                    <div class="poi-card-front absolute inset-0 rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container shadow-2xl">
                        <img class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" src="${poi.image}" />
                        <div class="absolute inset-0 bg-gradient-to-t from-surface-dim via-transparent to-transparent"></div>
                        <div class="absolute bottom-0 p-6 text-left">
                            <h3 class="text-xl font-headline font-bold text-on-surface leading-tight">${poi.title}</h3>
                            <p class="text-[10px] font-label text-secondary tracking-widest uppercase mt-2">${poi.settlement}</p>
                        </div>
                        ${pillHTML}
                    </div>

                    <div class="poi-card-back absolute inset-0 bg-surface-container-high rounded-lg p-8 border border-secondary/20 flex flex-col justify-center items-center text-center shadow-2xl">
                        <span class="material-symbols-outlined text-4xl text-secondary/40 mb-4" style="font-variation-settings: 'FILL' 0;">${matIcon}</span>
                        <h3 class="text-lg font-headline font-bold text-secondary mb-1">${poi.title}</h3>
                        <p class="text-[10px] font-label text-on-surface-variant uppercase tracking-[0.2em] mb-6">${poi.subtitle}</p>
                        <div class="w-12 h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent mb-8"></div>
                        <button class="px-6 py-2 border border-secondary/50 text-secondary text-[10px] font-label uppercase tracking-widest hover:bg-secondary hover:text-black transition-all duration-300 rounded-sm shadow-lg">
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
        const poi = allPOIs.find(p => p.uid === uid);
        if (!poi) return;

        // Populate standard POI details
        document.getElementById('modal-img').src = poi.image;
        document.getElementById('modal-uid').textContent = `ARCHIVE ID: ${poi.uid.toUpperCase()}`;
        document.getElementById('modal-title').textContent = poi.title;
        document.getElementById('modal-body').innerHTML = poi.body || '<p class="italic text-on-surface/40">No deep lore recorded for this landmark yet.</p>';
        document.getElementById('modal-location').textContent = `${poi.settlement}, ${poi.district}`;

        // Cross-reference and inject associated NPCs
        const linkedNPCs = allNPCs.filter(npc => npc.homePinTitle === poi.title && npc.settlement === poi.settlement);
        const npcSection = document.getElementById('modal-npc-section');
        const npcContainer = document.getElementById('modal-npcs');

        if (linkedNPCs.length > 0) {
            npcContainer.innerHTML = linkedNPCs.map(npc => `
                <div class="group flex items-center gap-4 p-3 rounded bg-black/20 border border-white/5 hover:border-secondary/30 transition-colors">
                    
                    <img src="${npc.image || 'images/placeholder_profile.png'}" class="w-12 h-12 rounded object-cover grayscale opacity-80 transition-all duration-500 group-hover:grayscale-0 group-hover:opacity-100" alt="${npc.name}">
                    
                    <div class="flex-grow">
                        <div class="flex justify-between items-start">
                            <h4 class="font-headline text-secondary text-sm font-bold">${npc.name}</h4>
                            <a href="npc.html?id=${npc.id}" class="text-on-surface-variant hover:text-primary material-symbols-outlined text-sm" title="View Profile">person_search</a>
                        </div>
                        <p class="font-label text-[9px] uppercase tracking-widest text-on-surface/40">${npc.role}</p>
                    </div>
                </div>
            `).join('');
            npcSection.classList.remove('hidden');
        } else {
            npcContainer.innerHTML = '';
            npcSection.classList.add('hidden');
        }

        const modal = document.getElementById('poi-modal');
        modal.classList.replace('hidden', 'flex');
    };

    window.closePOIModal = () => document.getElementById('poi-modal').classList.replace('flex', 'hidden');

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