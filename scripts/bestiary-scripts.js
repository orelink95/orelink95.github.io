

// scripts/bestiary-scripts.js — the codex of creatures (data/creatures.json)
// Threat tone + icon: creatureThreatTone() / creatureThreatPill() in scripts/core/threat.js

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const bestiaryData = store.all('creature');
    liftOutOfBody(document.getElementById('bestiary-modal'));   // stays on screen when the page is scrolled
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
            return `
            <div class="beast-card" onclick="openBestiaryModal('${beast.id}')">
                
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
                        ${creatureThreatPill(beast.threat, 'beast-card__threat')}
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
    // Framing of the modal's picture: object-position + a zoom centred on the same point
    function frameOf(b) {
        const at = b.imageFocus || '50% 30%';
        const zoom = typeof b.imageZoom === 'number' && b.imageZoom > 100 ? b.imageZoom / 100 : 1;
        return { objectPosition: at, transform: zoom > 1 ? `scale(${zoom})` : '', transformOrigin: at };
    }
    window.openBestiaryModal = (id) => {
        const beast = bestiaryData.find(b => b.id === id);
        if (!beast) return;

        // The picture fills its window, framed by imageFocus / imageZoom (set in the dashboard)
        const img = document.getElementById('modal-beast-img');
        img.src = beast.image;
        Object.assign(img.style, frameOf(beast));
        document.getElementById('modal-beast-arcana').textContent = beast.arcana;
        document.getElementById('modal-beast-name').textContent = beast.name;
        document.getElementById('modal-beast-location').textContent = beast.location;

        document.getElementById('modal-beast-phylogeny').textContent = beast.phylogeny;
        const realm = document.getElementById('modal-beast-realm');
        realm.textContent = beast.realm || 'Unknown';
        realm.classList.toggle('is-unknown', !beast.realm);
        const desc = document.getElementById('modal-beast-desc');
        desc.innerHTML = beast.shortDesc ? store.autolink(store.md(beast.shortDesc), { exclude: beast.id }) : '';
        desc.hidden = !beast.shortDesc;
        document.getElementById('modal-beast-body').innerHTML = store.autolink(store.md(beast.body, { dropCap: true }), { exclude: beast.id });
        document.getElementById('modal-beast-link').href = `beast.html?id=${beast.id}`;

        // Threat pill: the tone class sits on the facts box, so the pill and
        // (on phones) the box outline both take the threat colour
        const tone = creatureThreatTone(beast.threat);
        document.getElementById('modal-beast-facts').className = `beast-modal__facts threat--${tone}`;
        document.getElementById('modal-beast-threat-icon').textContent = CREATURE_THREAT_ICONS[tone];
        document.getElementById('modal-beast-threat-text').textContent = beast.threat || '';

        document.getElementById('bestiary-modal').classList.remove('hidden');
    };

    window.closeBestiaryModal = () => document.getElementById('bestiary-modal').classList.add('hidden');

    // INITIALIZE
    renderFilters();
    renderGrid(bestiaryData);
});