

// scripts/bestiary-scripts.js — the codex of creatures (data/creatures.json)
// Threat level -> colour tone (see .threat--* in pages/bestiary.css)
const threatTone = (level) => {
    const t = (level || '').toLowerCase();
    if (t.includes('lethal') || t.includes('extreme')) return 'lethal';
    if (t.includes('high')) return 'high';
    if (t.includes('harmless') || t.includes('low')) return 'low';
    if (t.includes('friendly') || t.includes('ally')) return 'friendly';
    return 'moderate';
};
const THREAT_ICON = { lethal: 'skull', high: 'warning', low: 'eco', friendly: 'favorite', moderate: 'shield' };

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const bestiaryData = store.all('creature');
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
        const threats = ['All', ...new Set(bestiaryData.map(b => b.threat))].filter(Boolean).sort();

        const createPills = (arr, container, currentVal, clickHandler) => {
            // The chosen value is marked .is-active (see pages/bestiary.css)
            container.innerHTML = arr.map(val =>
                `<button class="bestiary-pill${val === currentVal ? ' is-active' : ''}" onclick="${clickHandler}('${val}')">${val}</button>`
            ).join('');
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
            grid.innerHTML = `<p class="bestiary-grid__empty">No records found within the Codex.</p>`;
            return;
        }

        grid.innerHTML = beasts.map(beast => {
            // Threat colour and icon
            const tone = threatTone(beast.threat);
            const tIcon = THREAT_ICON[tone];
            const threatClass = 'threat--' + tone;

            return `
            <div class="beast-card ${threatClass}" onclick="openBestiaryModal('${beast.id}')">
                
                <img src="${beast.image}" alt="${beast.name}" class="beast-card__img">
                
                <div class="beast-card__shade"></div>
                
                <div class="beast-card__frame">
                    <div class="beast-card__frame-inner"></div>
                </div>
                
                <div class="beast-card__top">
                    
                    <div class="beast-card__arcana-row">
                        <span class="beast-card__arcana">
                            ${beast.arcana}
                        </span>
                    </div>

                    <div class="beast-card__threat-row">
                        <div class="beast-card__threat">
                            <span class="beast-card__threat-icon material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${tIcon}</span>
                            <span class="beast-card__threat-label">${beast.threat || ''}</span>
                        </div>
                    </div>

                </div>

                <div class="beast-card__bottom">
                    <h3 class="beast-card__name">${beast.name}</h3>
                    <p class="beast-card__phylogeny">
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
            const matchSearch = b.name.toLowerCase().includes(query) || (b.location || '').toLowerCase().includes(query);
            const matchRealm = currentRealm === 'All Realms' || b.realm === currentRealm;
            const matchPhylogeny = currentPhylogeny === 'All' || b.phylogeny === currentPhylogeny;
            const matchThreat = currentThreat === 'All' || b.threat === currentThreat;

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
        document.getElementById('modal-beast-body').innerHTML = store.autolink(store.md(beast.body, { dropCap: true }), { exclude: beast.id });
        document.getElementById('modal-beast-link').href = `beast.html?id=${beast.id}`;

        // Threat colours in the modal (.threat--* on the badge)
        const badge = document.getElementById('modal-beast-threat-badge');
        badge.className = `beast-modal__threat threat--${threatTone(beast.threat)}`;
        document.getElementById('modal-beast-threat-text').textContent = `${beast.threat || ''}`;

        document.getElementById('bestiary-modal').classList.remove('hidden');
    };

    window.closeBestiaryModal = () => document.getElementById('bestiary-modal').classList.add('hidden');

    // INITIALIZE
    renderFilters();
    renderGrid(bestiaryData);
});