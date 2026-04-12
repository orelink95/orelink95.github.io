

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('bestiary-grid');
    const searchInput = document.getElementById('bestiary-search');
    const realmFilter = document.getElementById('filter-realm');
    const phylogenyFilter = document.getElementById('filter-phylogeny');
    const threatFilter = document.getElementById('filter-threat'); // NEW

    let currentRealm = 'All Realms';
    let currentPhylogeny = 'All';
    let currentThreat = 'All'; // NEW

    // --- 1. RENDER PILL FILTERS ---
    function renderFilters() {
        const realms = ['All Realms', ...new Set(bestiaryData.map(b => b.realm))].filter(Boolean).sort();
        const phylogenies = ['All', ...new Set(bestiaryData.map(b => b.phylogeny))].filter(Boolean).sort();

        // NEW: Extract unique threat levels
        const threats = ['All', ...new Set(bestiaryData.map(b => b.threatLevel))].filter(Boolean).sort();

        const createPills = (arr, container, currentVal, clickHandler) => {
            container.innerHTML = arr.map(val => {
                const isActive = val === currentVal;
                const baseClass = "px-4 py-1.5 rounded-full text-[10px] font-label uppercase tracking-widest transition-all duration-300 border cursor-pointer";
                const activeClass = isActive ? "bg-[#e9c176]/20 text-[#e9c176] border-[#e9c176]/50 shadow-[0_0_10px_rgba(233,193,118,0.2)]" : "bg-black/40 text-white/50 border-white/10 hover:text-white hover:border-white/30";
                return `<button class="${baseClass} ${activeClass}" onclick="${clickHandler}('${val}')">${val}</button>`;
            }).join('');
        };

        window.setRealm = (val) => { currentRealm = val; applyFilters(); renderFilters(); };
        window.setPhylogeny = (val) => { currentPhylogeny = val; applyFilters(); renderFilters(); };
        window.setThreat = (val) => { currentThreat = val; applyFilters(); renderFilters(); }; // NEW

        createPills(realms, realmFilter, currentRealm, 'setRealm');
        createPills(phylogenies, phylogenyFilter, currentPhylogeny, 'setPhylogeny');
        createPills(threats, threatFilter, currentThreat, 'setThreat'); // NEW
    }


    // --- 2. RENDER THE TAROT GRID ---
    function renderGrid(beasts) {
        if (beasts.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-white/40 py-20 italic font-newsreader text-xl">No records found within the Codex.</p>`;
            return;
        }

        grid.innerHTML = beasts.map(beast => {
            // Determine Threat Colors, Icons, and Glows
            let tColor = 'text-blue-400';
            let tBorder = 'border-blue-400/30';
            let tIcon = 'shield';
            let tGlow = 'drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]';

            const tLevel = beast.threatLevel.toLowerCase();
            if (tLevel.includes('lethal') || tLevel.includes('extreme')) {
                tColor = 'text-error'; tBorder = 'border-error/30';
                tIcon = 'skull'; tGlow = 'drop-shadow-[0_0_8px_rgba(255,82,82,0.8)]';
            } else if (tLevel.includes('high')) {
                tColor = 'text-orange-400'; tBorder = 'border-orange-400/30';
                tIcon = 'warning'; tGlow = 'drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]';
            } else if (tLevel.includes('harmless') || tLevel.includes('low')) {
                tColor = 'text-teal-400'; tBorder = 'border-teal-400/30';
                tIcon = 'eco'; tGlow = 'drop-shadow-[0_0_8px_rgba(45,212,191,0.8)]';
            } else if (tLevel.includes('friendly') || tLevel.includes('ally')) {
                tColor = 'text-green-400'; tBorder = 'border-green-400/30';
                tIcon = 'favorite'; tGlow = 'drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]';
            }

            return `
            <div class="group relative w-full aspect-[2/3.2] bg-[#050505] rounded-sm cursor-pointer shadow-2xl transition-all duration-700 hover:-translate-y-3 hover:shadow-[0_30px_60px_rgba(233,193,118,0.15)] overflow-hidden" onclick="openBestiaryModal('${beast.id}')">
                
                <img src="${beast.image}" alt="${beast.name}" class="absolute inset-0 w-full h-full object-cover grayscale-[40%] opacity-80 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-1000 ease-out z-0">
                
                <div class="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 z-10 opacity-80 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>
                
                <div class="absolute inset-2 border border-secondary/30 rounded-sm pointer-events-none z-20 group-hover:border-secondary/60 transition-colors duration-700">
                    <div class="absolute inset-1 border border-secondary/10 rounded-sm group-hover:border-secondary/30 transition-colors duration-700"></div>
                </div>
                
                <div class="absolute top-0 left-0 right-0 p-6 flex flex-col z-30 transform transition-transform duration-700 group-hover:translate-y-1">
                    
                    <div class="w-full text-center mb-3">
                        <span class="font-headline font-bold text-sm md:text-base uppercase tracking-[0.2em] text-secondary/80 group-hover:text-secondary transition-colors drop-shadow-md">
                            ${beast.arcana}
                        </span>
                    </div>

                    <div class="w-full flex justify-end">
                        <div class="flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-sm border ${tBorder} rounded-full shadow-lg group-hover:border-opacity-100 transition-colors">
                            <span class="material-symbols-outlined text-[14px] ${tColor} ${tGlow} animate-pulse" style="font-variation-settings: 'FILL' 1;">${tIcon}</span>
                            <span class="text-[8px] font-bold uppercase tracking-widest ${tColor}">${beast.threatLevel}</span>
                        </div>
                    </div>

                </div>

                <div class="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center text-center z-30 transform transition-transform duration-700 group-hover:-translate-y-2">
                    <h3 class="font-headline text-3xl font-bold text-white mb-2 drop-shadow-lg group-hover:text-secondary transition-colors">${beast.name}</h3>
                    <p class="font-label text-[9px] uppercase tracking-[0.3em] text-secondary/50 group-hover:text-secondary/90 transition-colors">
                        ${beast.phylogeny}
                    </p>
                </div>

            </div>`;
        }).join('');
    }

    // --- 3. FILTER & SEARCH LOGIC ---
    function applyFilters() {
        const query = searchInput.value.toLowerCase();

        const filtered = bestiaryData.filter(b => {
            const matchSearch = b.name.toLowerCase().includes(query) || b.location.toLowerCase().includes(query);
            const matchRealm = currentRealm === 'All Realms' || b.realm === currentRealm;
            const matchPhylogeny = currentPhylogeny === 'All' || b.phylogeny === currentPhylogeny;
            const matchThreat = currentThreat === 'All' || b.threatLevel === currentThreat;

            return matchSearch && matchRealm && matchPhylogeny && matchThreat;
        });

        renderGrid(filtered);
    }

    searchInput.addEventListener('input', applyFilters);

    // --- 4. MODAL LOGIC ---
    window.openBestiaryModal = (id) => {
        const beast = bestiaryData.find(b => b.id === id);
        if (!beast) return;

        document.getElementById('modal-beast-img').src = beast.image;
        document.getElementById('modal-beast-arcana').textContent = beast.arcana;
        document.getElementById('modal-beast-name').textContent = beast.name;
        document.getElementById('modal-beast-location').textContent = beast.location;

        document.getElementById('modal-beast-phylogeny').textContent = beast.phylogeny;
        document.getElementById('modal-beast-realm').textContent = beast.realm;
        document.getElementById('modal-beast-body').innerHTML = beast.body;
        document.getElementById('modal-beast-link').href = `beast.html?id=${beast.id}`;

        // Apply Threat Colors to Modal
        const tLevel = beast.threatLevel.toLowerCase();
        let tColor = 'text-blue-400'; let tBorder = 'border-blue-400/30'; let tBg = 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.8)]';

        if (tLevel.includes('lethal') || tLevel.includes('extreme')) {
            tColor = 'text-error'; tBorder = 'border-error/30'; tBg = 'bg-error shadow-[0_0_5px_rgba(255,82,82,0.8)]';
        } else if (tLevel.includes('high')) {
            tColor = 'text-orange-400'; tBorder = 'border-orange-400/30'; tBg = 'bg-orange-400 shadow-[0_0_5px_rgba(251,146,60,0.8)]';
        } else if (tLevel.includes('harmless') || tLevel.includes('low')) {
            tColor = 'text-teal-400'; tBorder = 'border-teal-400/30'; tBg = 'bg-teal-400 shadow-[0_0_5px_rgba(45,212,191,0.8)]';
        } else if (tLevel.includes('friendly') || tLevel.includes('ally')) {
            tColor = 'text-green-400'; tBorder = 'border-green-400/30'; tBg = 'bg-green-400 shadow-[0_0_5px_rgba(244,114,182,0.8)]';
        }
        const badge = document.getElementById('modal-beast-threat-badge');
        badge.className = `flex items-center gap-2 border px-3 py-1.5 rounded-full bg-black/50 shadow-lg ${tBorder}`;

        const dot = document.getElementById('modal-beast-threat-dot');
        dot.className = `w-2 h-2 rounded-full animate-pulse ${tBg}`;

        const text = document.getElementById('modal-beast-threat-text');
        text.className = `text-[9px] uppercase tracking-widest font-bold ${tColor}`;
        text.textContent = `${beast.threatLevel}`;

        document.getElementById('bestiary-modal').classList.replace('hidden', 'flex');
    };

    window.closeBestiaryModal = () => document.getElementById('bestiary-modal').classList.replace('flex', 'hidden');

    // INITIALIZE
    renderFilters();
    renderGrid(bestiaryData);
});