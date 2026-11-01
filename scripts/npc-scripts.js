document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.getElementById('npc-grid');

    // UI Elements
    const searchInput = document.getElementById('search-input');
    const relationTabs = document.querySelectorAll('.rel-tab');
    const settlementFilter = document.getElementById('filter-settlement');
    const affiliationFilter = document.getElementById('filter-affiliation');

    let allNPCs = [];
    let currentRelation = 'all'; // State tracker for the tabs

    // 1. BUILD THE VIEW MODEL FROM THE STORE
    const store = await Athenaeum.ready;
    allNPCs = store.all('npc').map(npc => {
        const home = store.get(npc.home);
        const chain = home ? [...store.ancestors(home), home] : [];
        const at = type => (chain.find(p => store.typeOf(p) === type) || {}).name;
        const factions = (npc.factions || []).map(id => store.get(id)).filter(Boolean);
        return {
            id: npc.id,
            name: npc.name || 'Unknown',
            role: npc.role || 'Unknown',
            quote: npc.quote || 'No recorded dialogue.',
            image: npc.portrait || 'images/placeholder.png',
            homePinTitle: home ? home.name : (npc.whereabouts || 'Unknown Location'),
            homeUrl: home ? store.url(home) : null,
            settlement: at('settlement') || npc.whereabouts || 'Unknown',
            district: at('district') || '',
            species: npc.species || 'Unknown',
            age: npc.age || 'Unknown',
            gender: npc.gender || 'Unknown',
            affiliation: factions.length ? factions.map(f => f.name).join(', ') : 'Independent',
            relationToParty: npc.relation || 'Unknown',
            biography: npc.biography
                ? store.autolink(store.md(npc.biography), { exclude: npc.id })
                : '<p class="npc-modal__empty">No archival biography exists for this individual.</p>',
            secrets: npc.secrets ? store.md(npc.secrets) : ''
        };
    });

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
            grid.innerHTML = `<p class="npc-grid__empty">No individuals match these archival parameters.</p>`;
            return;
        }

        grid.innerHTML = npcs.map(npc => {
            // Relation badge tone (see .npc-card__relation--* in pages/npc.css)
            let rel = 'unknown';
            const relLower = npc.relationToParty.toLowerCase();

            if (relLower.includes('ally') || relLower.includes('friendly')) rel = 'ally';
            else if (relLower.includes('hostile') || relLower.includes('enemy') || relLower.includes('threat') || relLower.includes('displeased')) rel = 'hostile';
            else if (relLower.includes('neutral')) rel = 'neutral';
            else if (relLower.includes('killed')) rel = 'killed';

            return `
            <div class="npc-card" onclick="openNPCModal('${npc.id}')">
                <img class="npc-card__img" src="${npc.image}" alt="${npc.name}" />
                <div class="npc-card__shade"></div>
                
                <div class="npc-card__badges">
                    <div class="npc-card__place">
                        ${npc.affiliation}
                    </div>
                    <div class="npc-card__relation npc-card__relation--${rel}">
                        <span class="npc-card__dot"></span>
                        <span class="npc-card__relation-label">${npc.relationToParty}</span>
                    </div>
                </div>

                <div class="npc-card__caption">
                    <p class="npc-card__role">${npc.role}</p>
                    <h3 class="npc-card__name">${npc.name}</h3>
                    
                    <div class="npc-card__location">
                        <span class="npc-card__location-icon material-symbols-outlined">location_on</span>
                        <span class="npc-card__location-text">${npc.settlement}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    // 4. NEW LOGIC: INTERACTIVE TAB CLICK HANDLER
    relationTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Reset all tabs to default state
            relationTabs.forEach(t => t.className = 'rel-tab relation-tab');

            // Colour the clicked tab (see .relation-tab--* in pages/npc.css)
            currentRelation = e.target.getAttribute('data-rel');
            e.target.className = 'rel-tab relation-tab is-active relation-tab--' + currentRelation;

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
                if (currentRelation === 'hostile' && !relLower.includes('hostile') && !relLower.includes('enemy') && !relLower.includes('threat') && !relLower.includes('displeased')) matchRel = false;
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
        const place = [npc.homePinTitle, npc.district, npc.settlement].filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
        const locEl = document.getElementById('modal-npc-location');
        locEl.innerHTML = npc.homeUrl ? `<a href="${npc.homeUrl}" class="kw-place">${place}</a>` : place;
        document.getElementById('modal-npc-body').innerHTML = npc.biography;

        const secretsContainer = document.getElementById('modal-npc-secrets').parentElement;
        if (npc.secrets && npc.secrets.trim() !== '') {
            document.getElementById('modal-npc-secrets').innerHTML = npc.secrets;
            secretsContainer.classList.remove('hidden');
        } else {
            secretsContainer.classList.add('hidden');
        }

        const modal = document.getElementById('npc-modal');
        modal.classList.remove('hidden');
    };

    window.closeNPCModal = () => document.getElementById('npc-modal').classList.add('hidden');

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
