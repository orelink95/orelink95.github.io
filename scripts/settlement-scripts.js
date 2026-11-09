// =====================================================================
// SETTLEMENT PAGE  —  settlement.html?id=<settlement id>[&district=<district id>]
// Without a valid id the player is sent to settlements.html.
//   - Lore panel: the settlement's own text, then the district on show.
//     A pin shows its own lore; "Overview" or a click on empty map comes back.
//   - Map: one map per district, chosen with the district picker.
//     The chosen district is written into the address (reload / share keep it).
//   - Residents: NPCs whose home is the settlement, the district or one of
//     the district's points of interest. A card centres its home on the map.
//   - Town board: notices pinned on the settlement (data/notices.json), for the
//     campaign of the drop-down (shared with Dramatis Personae), plus links to
//     the POIs of the settlement that have a board of their own.
// Shared helpers: scripts/atlas-common.js.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const settlement = Atlas.requireEntry(store, 'settlement');
    if (!settlement) return;   // leaving for the list page
    const $ = id => document.getElementById(id);
    const lore = (rec, dropCap) => rec.body ? store.autolink(store.md(rec.body, { dropCap }), { exclude: rec.id }) : '';
    Atlas.glow();

    // -----------------------------------------------------------------
    // 1. HEADER
    // -----------------------------------------------------------------
    document.title = `${settlement.name} - The Athenaeum Vault`;
    Atlas.breadcrumbs(store, $('atlas-breadcrumbs'), settlement);
    $('dynamic-title').textContent = settlement.name;
    $('dynamic-description').textContent = settlement.summary || '';

    // -----------------------------------------------------------------
    // 2. DATA FOR EACH DISTRICT
    // -----------------------------------------------------------------
    // NPCs living in the settlement itself, or in a POI placed directly under it
    const townPois = store.children(settlement, 'poi');
    const townFolk = [settlement, ...townPois].flatMap(p => store.backrefs(p, 'npc', 'home'));

    const districts = store.children(settlement, 'district').map(d => {
        const pois = store.children(d, 'poi');
        return {
            rec: d,
            id: d.id,
            name: d.shortName || d.name,
            image: d.mapImage && d.mapImage.src ? d.mapImage : null,
            pois: pois.filter(p => p.map),
            residents: [...townFolk, ...[d, ...pois].flatMap(p => store.backrefs(p, 'npc', 'home'))]
        };
    });

    // The overview: the settlement's text, then the district's under its name
    function overview(dist) {
        const parts = [];
        if (settlement.body) parts.push(lore(settlement, true));
        if (dist && dist.rec.body) {
            parts.push(`<h3 class="lore-panel__subhead">${dist.rec.name}</h3>`);
            parts.push(lore(dist.rec, !settlement.body));
        }
        return { entry: settlement.codex || 'Town Charter', title: settlement.name, body: parts.join('') };
    }

    // -----------------------------------------------------------------
    // 3. LORE PANEL & MAP
    // -----------------------------------------------------------------
    const panel = Atlas.lorePanel(overview(null));
    const mapElement = $('settlement-map');

    // A settlement with no district has no map: lore and residents only
    if (!districts.length) {
        mapElement.innerHTML = '<p class="map-empty">No map of this settlement has reached the archive yet.</p>';
        renderResidents(townFolk, {});
        return;
    }

    const map = Atlas.createMap('settlement-map', { minZoom: -2, maxZoom: 2 });
    panel.onReset = () => map.closePopup();
    map.on('click', () => panel.reset());     // click on empty map = back to the overview
    const markerGroup = L.layerGroup().addTo(map);
    let overlay = null;
    let current = null;

    function pinView(p) {
        return { entry: p.codex, title: p.name, body: lore(p, true) };
    }

    function loadDistrict(dist, { updateUrl = true } = {}) {
        current = dist;
        map.closePopup();

        // Background blur and map image
        const image = dist.image || { src: 'images/placeholder.png', width: 1000, height: 1000 };
        $('dynamic-bg-blur').style.backgroundImage = `url('${image.src}')`;
        overlay = Atlas.showImage(map, image, overlay);

        // Pins, kept by POI id so resident cards can find their home
        markerGroup.clearLayers();
        const markers = {};
        dist.pois.forEach(p => {
            markers[p.id] = Atlas.pin({
                y: p.map.y, x: p.map.x, name: p.name,
                icon: Atlas.regionIcon(p.map.icon || 'settlement', !!p.danger),
                popupHtml: Atlas.popup({ title: p.name, subtitle: p.subtitle, danger: p.danger, url: store.url(p), cta: Atlas.cta(store, p) }),
                onClick: () => panel.show(pinView(p))
            }).addTo(markerGroup);
        });

        renderResidents(dist.residents, markers);
        panel.setBase(overview(dist));

        // District picker: name on the button, current entry marked
        $('district-current').textContent = dist.name;
        document.querySelectorAll('.district-btn').forEach(btn => {
            const on = btn.dataset.district === dist.id;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-current', on ? 'true' : 'false');
        });

        // Address bar: settlement.html?id=...&district=... (no new history entry)
        if (updateUrl) history.replaceState(null, '', store.url(dist.rec));
    }

    // -----------------------------------------------------------------
    // 4. RESIDENTS
    // -----------------------------------------------------------------
    function renderResidents(npcs, markers) {
        const container = $('dynamic-npc-list');
        $('dynamic-npc-count').textContent = `${npcs.length} Known`;
        if (!npcs.length) {
            container.innerHTML = '<p class="residents__empty">No one of note recorded here yet.</p>';
            return;
        }
        container.innerHTML = '';

        npcs.forEach(npc => {
            const home = store.get(npc.home);
            const marker = home ? markers[home.id] : null;
            const card = document.createElement('div');
            card.className = 'resident';
            card.dataset.npcId = npc.id;
            card.innerHTML = `
                <div class="resident__row">
                    <div class="resident__portrait">
                        <img class="resident__image" src="${npc.avatar || npc.portrait || 'images/placeholder.png'}" alt="${npc.name}"/>
                    </div>
                    <div class="resident__body">
                        <div class="resident__name-row">
                            <h4 class="resident__name">${npc.name}</h4>
                            <a href="${store.url(npc)}" class="resident__profile-link material-symbols-outlined" title="View Full Profile" aria-label="View ${npc.name}'s profile">person_search</a>
                        </div>
                        <p class="resident__role">${npc.role || ''}</p>
                        <p class="resident__quote">"${npc.quote || '…'}"</p>
                        <div class="resident__place">
                            <span class="resident__place-icon material-symbols-outlined">location_on</span>
                            ${(home && home.name) || npc.whereabouts || 'Unknown Location'}
                        </div>
                    </div>
                </div>
            `;

            // Card with a home on this map: click / Enter centres it and shows its lore.
            // The profile icon still opens the NPC page.
            if (marker) {
                card.tabIndex = 0;
                card.setAttribute('role', 'button');
                card.setAttribute('aria-label', `Show ${home.name} on the map`);
                const focusHome = () => {
                    map.panTo(marker.getLatLng(), { animate: true });
                    marker.openPopup();
                    panel.show(pinView(home));
                };
                card.addEventListener('click', e => { if (!e.target.closest('a')) focusHome(); });
                card.addEventListener('keydown', e => {
                    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')) { e.preventDefault(); focusHome(); }
                });
            } else {
                card.classList.add('resident--static');
            }

            container.appendChild(card);
        });
    }

    // -----------------------------------------------------------------
    // 5. DISTRICT PICKER (only with more than one district)
    // -----------------------------------------------------------------
    const toggleBtn = $('district-toggle-btn');
    const navWrapper = $('district-nav-wrapper');
    const chevron = $('district-chevron');

    function setMenu(open) {
        navWrapper.classList.toggle('is-open', open);
        chevron.classList.toggle('is-open', open);
        toggleBtn.setAttribute('aria-expanded', open);
    }

    if (districts.length > 1) {
        toggleBtn.classList.remove('hidden');
        $('district-nav').innerHTML = districts.map(d =>
            `<button type="button" class="district-btn" data-district="${d.id}">${d.name}</button>`).join('');
        $('district-nav').querySelectorAll('.district-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loadDistrict(districts.find(d => d.id === btn.dataset.district));
                setMenu(false);
            });
        });
        toggleBtn.addEventListener('click', () => setMenu(!navWrapper.classList.contains('is-open')));
        // Close the menu with Escape or a click elsewhere
        document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
        document.addEventListener('click', e => { if (!e.target.closest('.district-picker')) setMenu(false); });
    }

    // -----------------------------------------------------------------
    // 6. FIRST DISTRICT: ?district= (id, name or number), else the first one
    // -----------------------------------------------------------------
    const wanted = new URLSearchParams(window.location.search).get('district');
    let start = districts[0];
    if (wanted) {
        const key = wanted.toLowerCase();
        start = districts.find(d => d.id.toLowerCase() === key)
            || districts.find(d => d.name.toLowerCase() === key.replace(/_/g, ' '))
            || (/^\d+$/.test(wanted) ? districts[parseInt(wanted, 10)] : null)
            || districts[0];
    }
    loadDistrict(start, { updateUrl: !!wanted });

    // -----------------------------------------------------------------
    // 7. TOWN BOARD (hidden when nothing is pinned here or in its POIs)
    // -----------------------------------------------------------------
    const M = Athenaeum.market;
    if (!M || !Athenaeum.noticeBoard) return;
    const own = M.notices(store, settlement.id, 'all');
    const under = M.boardsUnder(store, settlement.id, 'all');
    if (!own.length && !under.length) return;

    let campaign = 'all';
    const withCampaigns = M.campaignsWith(store, [...own, ...under.flatMap(b => M.notices(store, b.poi.id, 'all'))]);
    if (Athenaeum.personae && withCampaigns.campaigns.length) {
        const campaigns = store.all('campaign');
        campaign = Athenaeum.personae.choose(store, { campaigns });
        Athenaeum.personae.picker($('town-board-campaign'), {
            campaigns, value: campaign,
            onChange: value => { campaign = value; renderBoard(); },
        });
        $('town-board-campaign-wrap').hidden = $('town-board-campaign').classList.contains('hidden');
    }
    function renderBoard() {
        $('town-board').innerHTML = Athenaeum.noticeBoard.render(store, M.notices(store, settlement.id, campaign),
            { empty: 'The town board is bare for now.' });
        const elsewhere = M.boardsUnder(store, settlement.id, campaign);
        const line = $('town-board-elsewhere');
        line.hidden = !elsewhere.length;
        line.innerHTML = elsewhere.length ? `<span class="material-symbols-outlined" aria-hidden="true">push_pin</span> Also pinned at ` +
            elsewhere.map(b => `<a href="${store.url(b.poi)}#board">${b.poi.name}</a>${b.count ? ` <small>(${b.count} open)</small>` : ''}`).join(', ') : '';
    }
    renderBoard();
    $('town-board-section').hidden = false;
});
