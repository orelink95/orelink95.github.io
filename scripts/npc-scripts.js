document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('npc-grid');

    // NEW: UI Elements
    const searchInput = document.getElementById('search-input');
    const relationTabs = document.querySelectorAll('.rel-tab');
    const settlementFilter = document.getElementById('filter-settlement');
    const affiliationFilter = document.getElementById('filter-affiliation');

    let allNPCs = [];
    let currentRelation = 'all'; // State tracker for the tabs

    // 1. CONJURE & MERGE DATA
    for (const [settId, settlement] of Object.entries(settlementRegistry)) {
        if (!settlement.districts) continue;

        settlement.districts.forEach(district => {
            if (!district.npcs) return;

            district.npcs.forEach(npc => {
                const lore = typeof npcAlmanach !== 'undefined' && npcAlmanach[npc.id] ? npcAlmanach[npc.id] : {};

                allNPCs.push({
                    id: npc.id,
                    name: npc.name,
                    role: npc.role,
                    quote: npc.quote || 'No recorded dialogue.',
                    image: npc.image || 'images/placeholder_profile.png',
                    homePinTitle: npc.homePinTitle,
                    settlement: settlement.settlementName,
                    district: district.name,

                    species: lore.species || 'Unknown',
                    age: lore.age || 'Unknown',
                    gender: lore.gender || 'Unknown',
                    affiliation: lore.affiliation || 'Independent',
                    relationToParty: lore.relationToParty || 'Unknown',
                    biography: lore.biography || '<p class="italic text-on-surface/40">No archival biography exists for this individual.</p>',
                    secrets: lore.secrets || ''
                });
            });
        });
    }

    // 2. POPULATE PILL DROPDOWNS
    const populate = (el, key, label) => {
        const values = [...new Set(allNPCs.map(p => p[key]))].filter(Boolean).sort();
        el.innerHTML = `<option value="all">${label}</option>` +
            values.map(v => `<option value="${v}">${v}</option>`).join('');
    };

    populate(settlementFilter, 'settlement', 'All Locations');
    populate(affiliationFilter, 'affiliation', 'All Affiliations');

    // 3. RENDER PORTRAIT GRID (Same visual code as before)
    function renderGrid(npcs) {
        if (npcs.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-on-surface/40 py-20 italic font-newsreader text-xl">No individuals match these archival parameters.</p>`;
            return;
        }

        grid.innerHTML = npcs.map(npc => {
            let relColor = 'bg-surface-variant text-on-surface';
            let dotColor = 'bg-gray-400';
            const relLower = npc.relationToParty.toLowerCase();

            if (relLower.includes('ally') || relLower.includes('friendly')) {
                relColor = 'border-primary/30 text-primary';
                dotColor = 'bg-primary shadow-[0_0_5px_rgba(179,205,182,0.8)]';
            } else if (relLower.includes('hostile') || relLower.includes('enemy') || relLower.includes('threat')) {
                relColor = 'border-error/30 text-error';
                dotColor = 'bg-error shadow-[0_0_5px_rgba(255,82,82,0.8)]';
            } else if (relLower.includes('neutral')) {
                relColor = 'border-blue-400/30 text-blue-400';
                dotColor = 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.8)]';
            }

            return `
            <div class="group relative w-full aspect-[3/4] rounded-lg overflow-hidden cursor-pointer border border-outline-variant/30 hover:border-secondary/50 transition-all duration-500 shadow-lg hover:shadow-[0_0_30px_rgba(233,193,118,0.15)]" onclick="openNPCModal('${npc.id}')">
                <img class="absolute inset-0 w-full h-full object-cover grayscale opacity-80 transition-all duration-700 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105" src="${npc.image}" alt="${npc.name}" />
                <div class="absolute inset-0 bg-gradient-to-t from-[#0a0b0a] via-[#0a0b0a]/40 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100"></div>
                
                <div class="absolute top-3 left-3 right-3 flex justify-between items-start">
                    <div class="bg-black/60 backdrop-blur-sm border border-white/10 px-2 py-1 rounded text-[8px] uppercase tracking-widest text-on-surface-variant max-w-[50%] truncate">
                        ${npc.affiliation}
                    </div>
                    <div class="bg-black/80 backdrop-blur-sm border ${relColor} px-2 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                        <span class="w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse"></span>
                        <span class="text-[8px] uppercase tracking-widest font-bold">${npc.relationToParty}</span>
                    </div>
                </div>

                <div class="absolute bottom-0 left-0 right-0 p-4 transition-transform duration-500 transform translate-y-2 group-hover:translate-y-0">
                    <p class="font-label text-secondary text-[9px] uppercase tracking-[0.2em] mb-1 drop-shadow-md">${npc.role}</p>
                    <h3 class="text-xl font-headline font-bold text-on-surface leading-tight drop-shadow-lg">${npc.name}</h3>
                    
                    <div class="flex items-center gap-1 mt-2 text-on-surface-variant/0 group-hover:text-on-surface-variant transition-colors duration-500">
                        <span class="material-symbols-outlined text-[12px]">location_on</span>
                        <span class="text-[9px] uppercase tracking-widest truncate">${npc.settlement}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // 4. NEW LOGIC: INTERACTIVE TAB CLICK HANDLER
    relationTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Reset all tabs to default state
            relationTabs.forEach(t => t.className = "rel-tab flex-shrink-0 px-5 py-2 rounded-md text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-white transition-all border border-transparent");

            // Apply correct color to clicked tab
            currentRelation = e.target.getAttribute('data-rel');
            if (currentRelation === 'all') e.target.className = "rel-tab flex-shrink-0 px-5 py-2 rounded-md text-[10px] font-label uppercase tracking-widest transition-all bg-secondary/20 text-secondary border border-secondary/30 shadow-sm";
            else if (currentRelation === 'ally') e.target.className = "rel-tab flex-shrink-0 px-5 py-2 rounded-md text-[10px] font-label uppercase tracking-widest transition-all bg-primary/20 text-primary border border-primary/30 shadow-sm";
            else if (currentRelation === 'neutral') e.target.className = "rel-tab flex-shrink-0 px-5 py-2 rounded-md text-[10px] font-label uppercase tracking-widest transition-all bg-blue-400/20 text-blue-400 border border-blue-400/30 shadow-sm";
            else if (currentRelation === 'hostile') e.target.className = "rel-tab flex-shrink-0 px-5 py-2 rounded-md text-[10px] font-label uppercase tracking-widest transition-all bg-error/20 text-error border border-error/30 shadow-sm";

            apply(); // Trigger the combined filter
        });
    });

    // 5. NEW LOGIC: COMBINED FILTERING SYSTEM
    const apply = () => {
        const query = searchInput.value.toLowerCase();
        const sett = settlementFilter.value;
        const aff = affiliationFilter.value;

        const filtered = allNPCs.filter(p => {
            // Text Match
            const matchSearch = p.name.toLowerCase().includes(query) ||
                p.role.toLowerCase().includes(query) ||
                p.affiliation.toLowerCase().includes(query);

            // Pill Match
            const matchSett = sett === 'all' || p.settlement === sett;
            const matchAff = aff === 'all' || p.affiliation === aff;

            // Tab Match
            let matchRel = true;
            if (currentRelation !== 'all') {
                const relLower = p.relationToParty.toLowerCase();
                if (currentRelation === 'ally' && !relLower.includes('ally') && !relLower.includes('friendly')) matchRel = false;
                if (currentRelation === 'hostile' && !relLower.includes('hostile') && !relLower.includes('enemy') && !relLower.includes('threat')) matchRel = false;
                if (currentRelation === 'neutral' && !relLower.includes('neutral') && !relLower.includes('unknown')) matchRel = false;
            }

            return matchSearch && matchSett && matchAff && matchRel;
        });

        renderGrid(filtered);
    };

    // Attach listeners
    searchInput.addEventListener('input', apply);
    settlementFilter.addEventListener('change', apply);
    affiliationFilter.addEventListener('change', apply);

    // 6. MODAL LOGIC (Unchanged)
    window.openNPCModal = (id) => {
        const npc = allNPCs.find(p => p.id === id);
        if (!npc) return;

        document.getElementById('modal-npc-img').src = npc.image;
        document.getElementById('modal-npc-role').textContent = npc.role;
        document.getElementById('modal-npc-name').textContent = npc.name;

        const quoteEl = document.getElementById('modal-npc-quote');
        if (npc.quote && npc.quote !== 'No recorded dialogue.') {
            quoteEl.textContent = `"${npc.quote}"`;
            quoteEl.classList.remove('hidden');
        } else {
            quoteEl.classList.add('hidden');
        }

        document.getElementById('modal-npc-species').textContent = npc.species;
        document.getElementById('modal-npc-demographics').textContent = `${npc.age} / ${npc.gender}`;
        document.getElementById('modal-npc-affiliation').textContent = npc.affiliation;
        document.getElementById('modal-npc-location').textContent = `${npc.district}, ${npc.settlement}`;
        document.getElementById('modal-npc-body').innerHTML = npc.biography;

        const secretsContainer = document.getElementById('modal-npc-secrets').parentElement;
        if (npc.secrets && npc.secrets.trim() !== '') {
            document.getElementById('modal-npc-secrets').textContent = npc.secrets;
            secretsContainer.classList.remove('hidden');
        } else {
            secretsContainer.classList.add('hidden');
        }

        const modal = document.getElementById('npc-modal');
        modal.classList.replace('hidden', 'flex');
    };

    window.closeNPCModal = () => document.getElementById('npc-modal').classList.replace('flex', 'hidden');

    // INITIALIZE
    renderGrid(allNPCs);

    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    if (targetId) {
        setTimeout(() => {
            if (typeof window.openNPCModal === 'function') {
                window.openNPCModal(targetId);
            }
        }, 100);
    }
});