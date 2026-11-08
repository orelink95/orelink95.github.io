// NPC roster (npc.html): list, filters and the NPC pop-up.
// Below 640px the cards are laid out as a compact list (pages/npc.css),
// below 768px the drop-downs live in a panel and the pop-up is full screen.

document.addEventListener("DOMContentLoaded", async () => {
    const grid = document.getElementById('npc-grid');

    // UI Elements
    const searchInput = document.getElementById('search-input');
    const relationTabs = document.querySelectorAll('.rel-tab');
    const settlementFilter = document.getElementById('filter-settlement');
    const affiliationFilter = document.getElementById('filter-affiliation');

    let allNPCs = [];
    let currentRelation = 'all'; // State tracker for the tabs

    // Which relation tab an NPC belongs to ('killed' only shows under "All")
    const relationGroup = relation => {
        const r = (relation || '').toLowerCase();
        if (r.includes('ally') || r.includes('friendly')) return 'ally';
        if (r.includes('hostile') || r.includes('enemy') || r.includes('threat') || r.includes('displeased')) return 'hostile';
        if (r.includes('neutral') || r.includes('unknown')) return 'neutral';
        if (r.includes('killed')) return 'killed';
        return 'unknown';
    };

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
            avatar: npc.avatar || npc.portrait || 'images/placeholder.png',
            homePinTitle: home ? home.name : (npc.whereabouts || 'Unknown Location'),
            homeUrl: home ? store.url(home) : null,
            settlement: at('settlement') || npc.whereabouts || 'Unknown',
            district: at('district') || '',
            species: npc.species || 'Unknown',
            age: npc.age || 'Unknown',
            gender: npc.gender || 'Unknown',
            affiliation: factions.length ? factions.map(f => f.name).join(', ') : 'Independent',
            relationToParty: npc.relation || 'Unknown',
            group: relationGroup(npc.relation || 'Unknown'),
            biography: npc.biography
                ? store.autolink(store.md(npc.biography), { exclude: npc.id })
                : '<p class="npc-modal__empty">No archival biography exists for this individual.</p>',
            secrets: npc.secrets ? store.md(npc.secrets) : ''
        };
    });

    // 2. POPULATE THE DROP-DOWNS AND THE TAB COUNTS
    const populate = (el, key, label) => {
        const values = [...new Set(allNPCs.map(p => p[key]))].filter(Boolean).sort();
        el.innerHTML = `<option value="all">${label}</option>` +
            values.map(v => `<option value="${v}">${v}</option>`).join('');
    };

    populate(settlementFilter, 'settlement', 'All Locations');
    populate(affiliationFilter, 'affiliation', 'All Affiliations');

    document.querySelectorAll('[data-count]').forEach(el => {
        const key = el.dataset.count;
        el.textContent = key === 'all' ? allNPCs.length : allNPCs.filter(p => p.group === key).length;
    });

    // 3. RENDER THE ROSTER
    // Each card carries both pictures: the portrait (cards) and the avatar (phone list).
    // The one CSS hides is not downloaded, thanks to loading="lazy".
    function renderGrid(npcs) {
        if (npcs.length === 0) {
            grid.innerHTML = `<p class="npc-grid__empty">No individuals match these archival parameters.</p>`;
            return;
        }

        grid.innerHTML = npcs.map(npc => {
            // Relation badge tone (see .npc-card__relation--* in pages/npc.css)
            // ("Unknown" is filed under Neutral but keeps its grey badge)
            const rel = npc.relationToParty.toLowerCase().includes('unknown') ? 'unknown' : npc.group;

            return `
            <button type="button" class="npc-card" data-id="${npc.id}">
                <img class="npc-card__img" src="${npc.image}" alt="" loading="lazy" />
                <img class="npc-card__avatar" src="${npc.avatar}" alt="" loading="lazy" />
                <div class="npc-card__shade"></div>

                <div class="npc-card__badges">
                    <div class="npc-card__place">${npc.affiliation}</div>
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
            </button>`;
        }).join('');
    }

    grid.addEventListener('click', e => {
        const card = e.target.closest('.npc-card');
        if (card) window.openNPCModal(card.dataset.id);
    });

    // 4. RELATION TABS
    relationTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            relationTabs.forEach(t => t.className = 'rel-tab relation-tab');

            // Colour the clicked tab (see .relation-tab--* in pages/npc.css)
            currentRelation = tab.getAttribute('data-rel');
            tab.className = 'rel-tab relation-tab is-active relation-tab--' + currentRelation;

            apply();
        });
    });

    // 5. COMBINED FILTERING
    const filtersCount = document.getElementById('filters-count');

    const apply = () => {
        const query = searchInput.value.toLowerCase();
        const sett = settlementFilter.value;
        const aff = affiliationFilter.value;

        const filtered = allNPCs.filter(p => {
            const matchSearch = p.name.toLowerCase().includes(query) ||
                p.role.toLowerCase().includes(query) ||
                p.affiliation.toLowerCase().includes(query);
            const matchSett = sett === 'all' || p.settlement === sett;
            const matchAff = aff === 'all' || p.affiliation === aff;
            const matchRel = currentRelation === 'all' || p.group === currentRelation;
            return matchSearch && matchSett && matchAff && matchRel;
        });

        // Badge on the phone "Filters" button: how many drop-downs are set
        const active = [sett, aff].filter(v => v !== 'all').length;
        filtersCount.textContent = active;
        filtersCount.classList.toggle('hidden', active === 0);

        renderGrid(filtered);
    };

    searchInput.addEventListener('input', apply);
    settlementFilter.addEventListener('change', apply);
    affiliationFilter.addEventListener('change', apply);

    // 6. FILTERS PANEL (phones)
    const filtersPanel = document.getElementById('roster-filters');
    const filtersBackdrop = document.getElementById('filters-backdrop');
    const filtersToggle = document.getElementById('filters-toggle');

    const setFiltersOpen = open => {
        filtersPanel.classList.toggle('is-open', open);
        filtersBackdrop.classList.toggle('is-open', open);
        filtersToggle.setAttribute('aria-expanded', String(open));
        if (open) settlementFilter.focus({ preventScroll: true });
        else filtersToggle.focus({ preventScroll: true });
    };

    filtersToggle.addEventListener('click', () => setFiltersOpen(!filtersPanel.classList.contains('is-open')));
    filtersBackdrop.addEventListener('click', () => setFiltersOpen(false));
    document.getElementById('filters-close').addEventListener('click', () => setFiltersOpen(false));
    document.getElementById('filters-done').addEventListener('click', () => setFiltersOpen(false));
    document.getElementById('filters-reset').addEventListener('click', () => {
        settlementFilter.value = 'all';
        affiliationFilter.value = 'all';
        apply();
    });

    // 7. NPC POP-UP
    const modal = document.getElementById('npc-modal');
    const modalCard = modal.querySelector('.npc-modal__card');
    const secretsBox = document.getElementById('npc-secrets');
    let pushedHistory = false; // true when opening the pop-up added a browser history entry
    let lastFocus = null;

    window.openNPCModal = (id, { push = true } = {}) => {
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

        secretsBox.classList.remove('is-revealed');
        if (npc.secrets && npc.secrets.trim() !== '') {
            document.getElementById('modal-npc-secrets').innerHTML = npc.secrets;
            secretsBox.classList.remove('hidden');
        } else {
            secretsBox.classList.add('hidden');
        }

        // The phone's back button closes the pop-up instead of leaving the page
        if (push) {
            history.pushState({ npc: id }, '', `?id=${encodeURIComponent(id)}`);
            pushedHistory = true;
        }

        lastFocus = document.activeElement;
        modal.classList.remove('hidden');
        document.documentElement.classList.add('has-modal-open');
        modalCard.scrollTop = 0;
        modal.querySelector('.npc-modal__content').scrollTop = 0;
        modal.querySelector('.npc-modal__close').focus({ preventScroll: true });
    };

    const hideModal = () => {
        modal.classList.add('hidden');
        document.documentElement.classList.remove('has-modal-open');
        if (lastFocus) lastFocus.focus({ preventScroll: true });
    };

    window.closeNPCModal = () => {
        if (modal.classList.contains('hidden')) return;
        hideModal();
        if (pushedHistory) {
            pushedHistory = false;
            history.back();
        } else if (location.search) {
            // Opened from a link (npc.html?id=…): drop the id from the address
            history.replaceState(null, '', location.pathname);
        }
    };

    window.addEventListener('popstate', () => {
        if (!modal.classList.contains('hidden')) {
            pushedHistory = false;
            hideModal();
        }
    });

    // Click outside the card (desktop) or Escape closes it
    modal.addEventListener('click', e => { if (e.target === modal) window.closeNPCModal(); });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (filtersPanel.classList.contains('is-open')) setFiltersOpen(false);
        else window.closeNPCModal();
    });

    // Secrets: hover on a computer; tap, click or Enter/Space anywhere
    const toggleSecrets = () => secretsBox.classList.toggle('is-revealed');
    secretsBox.addEventListener('click', e => { if (!e.target.closest('a')) toggleSecrets(); });
    secretsBox.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSecrets(); }
    });

    // INITIALIZE
    apply();

    const targetId = new URLSearchParams(window.location.search).get('id');
    if (targetId) window.openNPCModal(targetId, { push: false });
});
