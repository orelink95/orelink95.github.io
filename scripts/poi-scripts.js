/* =====================================================================
   POINT OF INTEREST PAGE  —  poi.html?id=<poi id>[#map|#places|#people|#fare|#wares|#shrine|#rumours|#games|#board]
   Any POI: image, location, lore, the NPCs whose home it is.
   A POI can be several things at once; each adds a tab to the ledger card:
     institution   -> Map (its own maps, one per floor or wing, with the places
                      inside it pinned on them), Locations and People (its people
                      by function). scripts/institution.js. The card is then wider.
                      poi.html?id=…&map=<map id> opens a map, &spot=<poi id> a pin.
     POIs inside   -> Locations (any POI that other POIs sit in)
     tavern block  -> Fare (bill of fare), a Services panel beside it, Rumours, and
                      Games when tavern.games lists some (scripts/games/)
     shop block    -> Wares          (scripts/market.js)
     temple block  -> Shrine         (services, offerings, a prayer)
     notices here  -> Board          (scripts/notice-board.js)
   Menus, wares and the rumour order come from the market code
   (settings.tavernCode); the DM can preview another with ?code=XYZ (not saved).
   Rumours and notices follow the campaign picked in the drop-down (shared
   with Dramatis Personae, scripts/personae.js).
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const poi = store.get(id);
    const root = document.getElementById('poi-root');
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (!poi || store.typeOf(poi) !== 'poi') {
        root.innerHTML = `
            <div class="poi-empty">
                <p class="poi-eyebrow">Ledger Missing</p>
                <h2>No landmark by that name</h2>
                <p>${id ? `“${esc(id)}” is not in the archive.` : 'No landmark id was given.'}</p>
                <a href="pois.html" class="poi-link">Back to the Points of Interest</a>
            </div>`;
        return;
    }

    // The page's own look (styles/looks.css, scripts/core/look.js): the POI's own,
    // else the one a place above it passes down ("Also for the places inside")
    if (Athenaeum.look) Athenaeum.look.apply(document.body, Athenaeum.look.resolve(store, poi).look, 'poi');

    const T = Athenaeum.tavern, M = Athenaeum.market;
    const tavern = poi.tavern && poi.tavern.tier ? poi.tavern : null;
    const shop = poi.shop && poi.shop.kind ? poi.shop : null;
    const temple = poi.temple || null;
    // Institution: maps, the POIs that sit in it, its people by function
    const I = Athenaeum.institution;
    const inst = I.block(poi);
    const instKind = I.kind(store, poi);
    const instMaps = typeof L !== 'undefined' ? I.maps(poi) : [];   // no Leaflet (offline) = no Map tab
    const places = I.locations(store, poi);
    const roster = inst ? I.people(store, poi) : { groups: [], others: [] };
    // People tab: an institution with anyone in it (in groups, or living there)
    const hasRoster = !!inst && (roster.groups.length > 0 || roster.others.length > 0);
    const host = store.parent(poi);                                   // the institution this place is part of
    const code = params.has('code') ? params.get('code') : (store.settings.tavernCode || '');
    const $ = sel => document.getElementById(sel);

    document.title = `${poi.name} - The Athenaeum Vault`;
    root.classList.toggle('is-danger', !!poi.danger);

    /* ---------- Hero ---------- */
    const roles = [inst && instKind.label, tavern && 'Tavern & Lodging', shop && M.shopKind(store, shop).label, temple && 'Temple'].filter(Boolean);
    $('poi-image').src = poi.image || 'images/pois/placeholder.png';
    $('poi-image').alt = poi.name;
    $('poi-eyebrow').textContent = roles.length ? roles.join(' · ') : poi.danger ? 'Danger Zone' : poi.featured ? 'Featured Landmark' : 'Landmark';
    $('poi-title').textContent = poi.name;
    $('poi-subtitle').textContent = poi.subtitle || '';
    // Where it is: Eraldom › continent › country › settlement › this POI
    Atlas.breadcrumbs(store, $('atlas-breadcrumbs'), poi);

    const fact = (key, html) => { $(`poi-${key}`).innerHTML = html; $(`poi-${key}-fact`).hidden = false; };
    // A place inside another POI: link to it, straight to this pin when it has one
    if (host && store.typeOf(host) === 'poi') {
        const on = I.mapOf(host, poi);
        const href = on ? `${store.url(host)}&spot=${encodeURIComponent(poi.id)}#map` : `${store.url(host)}#places`;
        fact('within', `<a class="poi-link" href="${href}">${esc(host.name)}</a>${on && I.maps(host).length > 1 ? ` <span class="poi-within-map">${esc(on.name || '')}</span>` : ''}`);
    }
    if (tavern || shop) fact('tier', esc(M.tierFor(store, poi, shop).label));
    // Hours of each role. A shop with none keeps the tavern's; when the roles differ, one line each.
    const hoursOf = [
        ['Open', inst && inst.hours],
        ['Bar', tavern && tavern.hours],
        ['Shop', shop && (shop.hours || (tavern && tavern.hours))],
        ['Worship', temple && temple.hours],
    ].filter(([, h]) => h);
    const distinct = [...new Set(hoursOf.map(([, h]) => h))];
    if (distinct.length === 1) fact('hours', esc(distinct[0]));
    else if (distinct.length > 1) fact('hours', hoursOf
        .filter(([, h], i) => hoursOf.findIndex(([, x]) => x === h) === i)
        .map(([role, h]) => `<span class="poi-hours-line"><b>${role}</b> ${esc(h)}</span>`).join(''));
    // Sealed Elder gods (not revealed in the reader's campaign) are not named here
    const deities = temple ? M.deitiesOf(store, poi).filter(d => store.revealed(d)) : [];
    if (deities.length) fact('deities', deities.map(d => `<a class="poi-link" href="${store.url(d)}">${esc(d.name)}</a>`).join(', '));

    /* ---------- Lore & people ---------- */
    $('poi-body-title').textContent = inst ? `The ${instKind.label}` : tavern ? 'The Establishment' : temple ? 'The Sanctuary' : shop ? 'The Shop' : 'Archive Entry';
    $('poi-body').innerHTML = poi.body
        ? store.autolink(store.md(poi.body, { dropCap: true }), { exclude: poi.id })
        : '<p class="poi-muted">No lore recorded for this landmark yet.</p>';

    // An institution lists its people on its People tab instead
    const people = inst ? [] : store.backrefs(poi, 'npc', 'home');
    if (people.length) {
        // Everyone whose home is here, whatever their role: who runs the bar, the shop or the
        // altar is said on the tab itself (tavern/shop/temple.keepers), so no role in this title.
        $('poi-people-title').textContent = 'Found Here';
        $('poi-people').innerHTML = people.map(npc => `
            <a href="${store.url(npc)}" class="poi-npc">
                <img src="${npc.avatar || npc.portrait || 'images/placeholder.png'}" alt="${esc(npc.name)}">
                <span>
                    <span class="poi-npc-name">${esc(npc.name)}</span>
                    <span class="poi-npc-role">${esc(npc.role || '')}</span>
                </span>
            </a>`).join('');
        $('poi-people-section').hidden = false;
    }

    /* ---------- Price lists (menu, wares, rites share one look) ---------- */
    const priceItem = item => `
        <li class="poi-item${item.signature ? ' poi-item--signature' : ''}">
            <div class="poi-item-line">
                <span class="poi-item-name">${item.signature ? '<span class="poi-star" title="House speciality">✦</span>' : ''}${esc(item.name)}</span>
                <span class="poi-leader" aria-hidden="true"></span>
                <span class="poi-item-price">${esc(item.priceLabel)}${item.unit ? ` <span class="poi-unit">${esc(item.unit)}</span>` : ''}</span>
            </div>
            ${item.desc ? `<p class="poi-item-desc">${esc(item.desc)}</p>` : ''}
            ${item.link ? `<p class="poi-item-desc"><a class="poi-item-link" href="${esc(item.link.href)}">${esc(item.link.label)}</a></p>` : ''}
        </li>`;
    const priceList = cats => cats.map(cat => `
        <section class="poi-menu-cat">
            <h3 class="poi-menu-cat-title">${esc(cat.label)}</h3>
            <ul>${cat.items.map(priceItem).join('')}</ul>
        </section>`).join('');

    /* ---------- Campaign (rumours and notices) ---------- */
    const heardAll = tavern ? M.rumoursHeard(store, poi, 'all') : [];
    const postedAll = M.notices(store, poi.id, 'all');
    let campaign = 'all';
    const withCampaigns = M.campaignsWith(store, [...heardAll, ...postedAll]);
    if (Athenaeum.personae && withCampaigns.campaigns.length) {
        const campaigns = store.all('campaign');
        campaign = Athenaeum.personae.choose(store, { campaigns });
        Athenaeum.personae.picker($('poi-campaign'), {
            campaigns, value: campaign,
            onChange: value => { campaign = value; renderRumours(); renderBoard(); },
        });
        $('poi-campaign-fact').hidden = $('poi-campaign').classList.contains('hidden');
    }

    /* ---------- Tabs ---------- */
    const tabs = [];
    if (instMaps.length) tabs.push({ id: 'map', label: 'Map', icon: 'map' });
    if (places.length) tabs.push({ id: 'places', label: 'Locations', icon: 'meeting_room' });
    if (hasRoster) tabs.push({ id: 'people', label: 'People', icon: 'groups' });
    if (tavern) tabs.push({ id: 'fare', label: 'Fare', icon: 'restaurant' });
    if (shop) tabs.push({ id: 'wares', label: 'Wares', icon: 'storefront' });
    if (temple) tabs.push({ id: 'shrine', label: 'Shrine', icon: 'brightness_7' });
    if (tavern && M.drawLimit(poi) > 0 && heardAll.length) tabs.push({ id: 'rumours', label: 'Rumours', icon: 'record_voice_over' });
    const games = tavern && Athenaeum.games ? Athenaeum.games.gameNames(store, poi) : [];
    if (games.length) tabs.push({ id: 'games', label: 'Games', icon: 'casino' });
    if (postedAll.length) tabs.push({ id: 'board', label: 'Board', icon: 'push_pin' });

    if (!tabs.length) {
        $('poi-grid').classList.add('poi-grid--single');
        return;
    }

    // Who runs each role: block.keepers (any NPCs; the POI's residents stay in the people list)
    function showKeepers(elId, block, label) {
        const keepers = ((block && block.keepers) || []).map(k => store.get(k)).filter(Boolean);
        if (!keepers.length) return;
        $(elId).innerHTML = `
            <span class="poi-keepers__label">${label}</span>
            <span class="poi-keepers__list">${keepers.map(npc => `
                <a href="${store.url(npc)}" class="poi-keeper">
                    <img src="${npc.avatar || npc.portrait || 'images/placeholder.png'}" alt="">
                    <span>${esc(npc.name)}</span>
                </a>`).join('')}</span>`;
        $(elId).hidden = false;
    }

    /* Fare */
    if (tavern) {
        showKeepers('poi-tavern-keepers', tavern, 'Behind the bar');
        $('poi-menu').innerHTML = priceList(T.buildMenu(store, poi, code));
        $('poi-folio').textContent = T.folioLabel(code, poi.id);
        let services = T.buildServices(store, poi);
        // The gaming table is a (paid) service of the house; with games ticked, its line links to the Games tab.
        // A tavern with games but without the catalogue service gets the line anyway.
        if (games.length) {
            const link = { href: '#games', label: `Play ${games.join(', ')} with the regulars →` };
            const own = services.find(s => s.id === 'gaming-table');
            if (own) own.link = link;
            else {
                const base = store.get('gaming-table');
                if (base) services.push({ ...base, priceLabel: T.formatPrice(base.basePrice * T.tierOf(store, poi.tavern).mult), link });
            }
        }
        if (services.length) {
            $('poi-services').innerHTML = services.map(priceItem).join('');
            $('poi-services-section').hidden = false;
        }
    }

    /* Wares */
    if (shop) {
        const wares = M.buildWares(store, poi, code);
        $('poi-shop-kind').textContent = `${M.shopKind(store, shop).label} · On the Shelves Today`;
        $('poi-ledger-label').textContent = M.waresLabel(code, poi.id);
        showKeepers('poi-shop-keepers', shop, 'Behind the counter');
        $('poi-wares').innerHTML = wares.length ? priceList(wares) : '<p class="poi-muted poi-center">The shelves are bare today.</p>';
    }

    /* Shrine: the prayer, then the price list */
    function renderPrayer(fresh) {
        const box = $('poi-prayer');
        if (temple.noPrayer || !M.blessingsFor(store, poi).length) { box.hidden = true; return; }
        const got = M.prayer(store, poi, code);
        if (got) {
            const b = got.blessing;
            box.innerHTML = `
                <div class="poi-blessing${fresh ? ' poi-refresh' : ''}">
                    <span class="poi-blessing__icon material-symbols-outlined" aria-hidden="true">brightness_7</span>
                    <p class="poi-blessing__eyebrow">${got.deity ? `${esc(got.deity.name)} answers` : 'Your prayer is answered'}</p>
                    <p class="poi-blessing__text">${esc(b.text)}</p>
                    ${b.effect ? `<p class="poi-blessing__effect">${esc(b.effect)}</p>` : ''}
                    <p class="poi-blessing__note">The candle you lit still burns. Come back another day.</p>
                </div>`;
            return;
        }
        const choice = deities.length > 1
            ? `<label class="poi-prayer__label" for="poi-altar">Kneel before</label>
               <select id="poi-altar" class="poi-select">${deities.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>`
            : '';
        box.innerHTML = `
            <div class="poi-prayer__ask">
                <p class="poi-prayer__lede">Light a candle, kneel, and see whether anyone is listening.</p>
                ${choice}
                <button type="button" id="poi-pray" class="poi-button">
                    <span class="material-symbols-outlined" aria-hidden="true">local_fire_department</span> Pray
                </button>
            </div>`;
        $('poi-pray').addEventListener('click', () => {
            const altar = $('poi-altar');
            M.pray(store, poi, code, altar ? altar.value : (deities[0] && deities[0].id));
            renderPrayer(true);
        });
    }
    if (temple) {
        showKeepers('poi-temple-keepers', temple, 'Tending the altar');
        if (deities.length === 1) $('poi-shrine-heading').textContent = `Altar of ${deities[0].name}`;
        renderPrayer(false);
        const rites = M.buildRites(store, poi);
        $('poi-rites').innerHTML = rites.length ? priceList(rites) : '';
    }

    /* Rumours: buy a round, hear one more */
    const rumourHtml = (r, fresh) => `
        <blockquote class="poi-rumour${fresh ? ' poi-refresh' : ''}">
            <p>${store.autolink(esc(r.text), { exclude: poi.id })}</p>
            ${r.source ? `<footer>— ${esc(r.source)}</footer>` : ''}
        </blockquote>`;
    function renderRumours(freshId) {
        if (!tabs.some(t => t.id === 'rumours')) return;
        const state = M.rumours(store, poi, code, campaign);
        const left = state.left;
        const button = left
            ? `<button type="button" id="poi-round" class="poi-button">
                   <span class="material-symbols-outlined" aria-hidden="true">sports_bar</span> Buy the room a round
               </button>
               <p class="poi-rumours__left">${left} more round${left === 1 ? '' : 's'} worth buying tonight</p>`
            : `<p class="poi-rumours__left">${state.total ? 'The room has told you all it will tonight. Come back another night.' : 'Nothing worth repeating tonight.'}</p>`;
        $('poi-rumours').innerHTML = `
            ${state.drawn.length ? '' : '<p class="poi-muted poi-center">Tongues loosen with drink.</p>'}
            <div class="poi-rumours__list">${state.drawn.map(r => rumourHtml(r, r.id === freshId)).join('')}</div>
            <div class="poi-rumours__action">${button}</div>`;
        const btn = $('poi-round');
        if (btn) btn.addEventListener('click', () => {
            const next = M.drawRumour(store, poi, code, campaign);
            renderRumours(next.fresh && next.fresh.id);
        });
    }

    /* Board */
    function renderBoard() {
        if (!tabs.some(t => t.id === 'board')) return;
        $('poi-board').innerHTML = Athenaeum.noticeBoard.render(store, M.notices(store, poi.id, campaign),
            { empty: 'Nothing pinned here for this campaign.' });
    }
    /* ---------- Institution: Map · Locations · People ---------- */
    const npcCard = ({ npc, title, at }) => `
        <a href="${store.url(npc)}" class="poi-npc">
            <img src="${npc.avatar || npc.portrait || 'images/placeholder.png'}" alt="${esc(npc.name)}">
            <span>
                <span class="poi-npc-name">${esc(npc.name)}</span>
                <span class="poi-npc-role">${esc(title || '')}</span>
                ${at ? `<span class="poi-npc-at"><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${esc(at.name)}</span>` : ''}
            </span>
        </a>`;
    const roleTags = p => [
        I.block(p) && I.kind(store, p).label,
        p.tavern && p.tavern.tier && 'Tavern',
        p.shop && p.shop.kind && M.shopKind(store, p.shop).label,
        p.temple && 'Temple',
        p.danger && 'Danger',
    ].filter(Boolean);
    const pinIcon = p => `images/atlas_icons/${(p.map && p.map.icon) || 'house'}.svg`;
    const placed = places.map(p => ({ p, on: I.mapOf(poi, p) })).filter(x => x.on && instMaps.includes(x.on));
    const mapOfPlace = p => (placed.find(x => x.p === p) || {}).on || null;

    /* Map: one image per floor / wing, a pin per place; the panel under it tells the chosen place */
    let atlas = null;      // built the first time the Map tab is shown (Leaflet needs a visible box)
    function mountMap() {
        // zoomSnap 0: the map opens filling its frame exactly (Leaflet otherwise rounds the
        // zoom down to a whole level, which can leave the image at half the size of the frame)
        const map = Atlas.createMap('poi-map', { minZoom: -6, maxZoom: 2, zoomSnap: 0, zoomDelta: 0.5, maxBoundsViscosity: 0.8 });
        const frame = $('poi-map').parentElement;
        // The whole image in view = as far out as the map zooms
        function fit() {
            const bounds = L.latLngBounds([[0, 0], [current.image.height, current.image.width]]);
            map.setMinZoom(-6);
            map.setMaxBounds(null);
            map.fitBounds(bounds, { animate: false });
            map.setMinZoom(map.getZoom());
            map.setMaxBounds(bounds.pad(0.1));
        }
        const pins = L.layerGroup().addTo(map);
        let overlay = null, current = null, markers = {};

        function spot(p) {
            const box = $('poi-spot');
            if (!p) {
                const here = placed.filter(x => x.on === current).map(x => x.p);
                box.innerHTML = here.length
                    ? `<p class="poi-spot__hint">Marked on this map</p>
                       <div class="poi-chips">${here.map(q => `
                            <button type="button" class="poi-chip${q.danger ? ' is-danger' : ''}" data-spot="${esc(q.id)}">
                                <img src="${pinIcon(q)}" alt="">${esc(q.name)}
                            </button>`).join('')}</div>`
                    : '<p class="poi-muted poi-center">Nothing is marked on this map yet.</p>';
                return;
            }
            const folk = [...roster.groups.flatMap(g => g.members), ...roster.others].filter(m => m.at === p);
            const names = [...new Map(folk.map(m => [m.npc.id, m.npc])).values()];
            box.innerHTML = `
                <article class="poi-spot__card poi-refresh${p.danger ? ' is-danger' : ''}">
                    <p class="poi-eyebrow">${esc(p.codex || current.name || '')}</p>
                    <h4 class="poi-spot__title">${esc(p.name)}</h4>
                    ${p.subtitle ? `<p class="poi-spot__sub">${esc(p.subtitle)}</p>` : ''}
                    ${p.body ? `<div class="poi-prose lore">${store.autolink(store.md(p.body), { exclude: [p.id, poi.id] })}</div>` : ''}
                    ${names.length ? `<div class="poi-keepers poi-spot__folk"><span class="poi-keepers__label">Found here</span>
                        <span class="poi-keepers__list">${names.map(npc => `
                            <a href="${store.url(npc)}" class="poi-keeper"><img src="${npc.avatar || npc.portrait || 'images/placeholder.png'}" alt=""><span>${esc(npc.name)}</span></a>`).join('')}</span></div>` : ''}
                    <div class="poi-spot__actions">
                        <a class="poi-button" href="${store.url(p)}">${esc(Atlas.cta(store, p))}</a>
                        <button type="button" class="poi-textbtn" data-spot="">All of this map</button>
                    </div>
                </article>`;
        }

        function load(m) {
            current = m;
            map.closePopup();
            // The frame takes the shape of the image (styles/poi-style.css), then the image fills it
            frame.style.setProperty('--map-ratio', (m.image.width / m.image.height).toFixed(4));
            map.invalidateSize({ animate: false });
            map.setMinZoom(-6);
            map.setMaxBounds(null);
            overlay = Atlas.showImage(map, m.image, overlay);
            fit();
            pins.clearLayers();
            markers = {};
            placed.filter(x => x.on === m).forEach(({ p }) => {
                markers[p.id] = Atlas.pin({
                    y: p.map.y, x: p.map.x, name: p.name,
                    icon: Atlas.regionIcon((p.map && p.map.icon) || 'house', !!p.danger),
                    popupHtml: Atlas.popup({ title: esc(p.name), subtitle: esc(p.subtitle || ''), danger: p.danger, url: store.url(p), cta: Atlas.cta(store, p), hasLore: false }),
                    onClick: () => spot(p),
                }).addTo(pins);
            });
            $('poi-map-picker').querySelectorAll('[data-map]').forEach(btn => {
                const on = btn.dataset.map === m.id;
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-pressed', on);
                if (on && btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'center' });
            });
            $('poi-map-note').textContent = m.note || '';
            $('poi-map-note').hidden = !m.note;
            spot(null);
        }
        function focus(p) {
            const on = mapOfPlace(p);
            if (!on) return;
            if (on !== current) load(on);
            map.panTo(markers[p.id].getLatLng(), { animate: true });
            markers[p.id].openPopup();
            spot(p);
        }
        map.on('click', () => spot(null));     // click on empty map = back to the list of this map
        // Window resized or phone turned: fit again, unless the reader has zoomed in
        map.on('resize', () => { if (map.getZoom() <= map.getMinZoom() + 0.01) setTimeout(fit, 0); });

        // Map picker (hidden with a single map)
        const picker = $('poi-map-picker');
        picker.innerHTML = instMaps.map(m => `<button type="button" class="poi-mapbtn" data-map="${esc(m.id)}" aria-pressed="false">${esc(m.name || m.id)}</button>`).join('');
        picker.hidden = instMaps.length < 2;
        picker.addEventListener('click', e => {
            const btn = e.target.closest('[data-map]');
            if (btn) load(instMaps.find(m => m.id === btn.dataset.map));
        });
        // Chips and "All of this map" under the map
        $('poi-spot').addEventListener('click', e => {
            const btn = e.target.closest('[data-spot]');
            if (!btn) return;
            const p = places.find(q => q.id === btn.dataset.spot);
            if (p) focus(p); else { map.closePopup(); spot(null); }
        });

        // First view: ?spot=<poi id> (its map and pin), else ?map=<map id>, else the first map
        const wantSpot = places.find(q => q.id === params.get('spot') && mapOfPlace(q));
        load((wantSpot && mapOfPlace(wantSpot)) || instMaps.find(m => m.id === params.get('map')) || instMaps[0]);
        if (wantSpot) focus(wantSpot);

        return { focus, refit() { map.invalidateSize({ animate: false }); } };
    }
    // Not a bill of fare: the card takes the look of its kind (styles/poi-style.css,
    // .poi-ledger--inst-<kind>; a kind with no look of its own keeps the generic one)
    if (inst) $('poi-ledger').classList.add('poi-ledger--inst', `poi-ledger--inst-${inst.kind}`);
    if (instMaps.length) {
        $('poi-map-heading').textContent = instKind.map;
        $('poi-grid').classList.add('poi-grid--wide');
    }

    /* Locations: every POI that sits here, under the map it is pinned on */
    if (places.length) {
        if (inst) $('poi-places-heading').textContent = instKind.places;
        const placeCard = p => {
            const tags = roleTags(p);
            const count = [p, ...store.descendants(p, 'poi')].flatMap(q => store.backrefs(q, 'npc', 'home')).length;
            // First paragraph of the lore (the summary when there is one); the page has the rest
            const text = p.summary ? `<p>${esc(p.summary)}</p>` : p.body ? store.md(p.body.trim().split(/\n\s*\n/)[0]) : '';
            return `
                <article class="poi-place${p.danger ? ' is-danger' : ''}">
                    <a class="poi-place__thumb${p.image ? '' : ' poi-place__thumb--icon'}" href="${store.url(p)}" tabindex="-1" aria-hidden="true">
                        <img src="${p.image || pinIcon(p)}" alt="">
                    </a>
                    <div class="poi-place__body">
                        <h4 class="poi-place__name"><a href="${store.url(p)}">${esc(p.name)}</a></h4>
                        ${p.subtitle ? `<p class="poi-place__sub">${esc(p.subtitle)}</p>` : ''}
                        ${tags.length || count ? `<p class="poi-place__tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}${count ? `<span class="poi-place__count"><span class="material-symbols-outlined" aria-hidden="true">group</span>${count}</span>` : ''}</p>` : ''}
                        ${text ? `<div class="poi-place__text">${store.autolink(text, { exclude: [p.id, poi.id] })}</div>` : ''}
                        <div class="poi-place__actions">
                            ${mapOfPlace(p) ? `<button type="button" class="poi-textbtn" data-show-spot="${esc(p.id)}"><span class="material-symbols-outlined" aria-hidden="true">location_on</span>Show on the map</button>` : ''}
                            <a class="poi-textbtn" href="${store.url(p)}">${esc(Atlas.cta(store, p))}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>
                        </div>
                    </div>
                </article>`;
        };
        const sections = instMaps.map(m => ({ title: m.name || m.id, list: places.filter(p => mapOfPlace(p) === m) }));
        const loose = places.filter(p => !mapOfPlace(p));
        if (loose.length) sections.push({ title: sections.some(s => s.list.length) ? 'Elsewhere' : '', list: loose });
        const shown = sections.filter(s => s.list.length);
        $('poi-places').innerHTML = shown.map(s => `
            <section class="poi-places__group">
                ${s.title && (shown.length > 1 || instMaps.length > 1) ? `<h3 class="poi-menu-cat-title">${esc(s.title)}</h3>` : ''}
                <div class="poi-places__list">${s.list.map(placeCard).join('')}</div>
            </section>`).join('');
        $('poi-places').addEventListener('click', e => {
            const btn = e.target.closest('[data-show-spot]');
            if (!btn) return;
            show('map');
            atlas.focus(places.find(p => p.id === btn.dataset.showSpot));
            $('poi-ledger').scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
    }

    /* People: the groups of the institution, then whoever else lives here.
       No groups yet: everyone, by the location they live in (the institution itself first) */
    if (hasRoster) {
        $('poi-roster-heading').textContent = instKind.people;
        let groups;
        if (roster.groups.length) {
            groups = roster.others.length ? [...roster.groups, { name: 'Also Found Here', desc: '', members: roster.others }] : roster.groups;
        } else {
            const byPlace = new Map();
            roster.others.forEach(m => {
                const key = m.at ? m.at.id : '';
                if (!byPlace.has(key)) byPlace.set(key, []);
                byPlace.get(key).push({ ...m, at: null });     // the heading already says where
            });
            const order = ['', ...store.descendants(poi, 'poi').map(p => p.id)];
            groups = order.filter(id => byPlace.has(id)).map(id => ({
                name: id ? store.get(id).name : `Throughout the ${instKind.label}`,
                desc: '',
                members: byPlace.get(id),
            }));
        }
        $('poi-roster').innerHTML = groups.map(g => `
            <section class="poi-roster__group">
                <h3 class="poi-menu-cat-title">${esc(g.name)}</h3>
                ${g.desc ? `<p class="poi-roster__desc">${store.autolink(esc(g.desc), { exclude: poi.id })}</p>` : ''}
                <div class="poi-roster__list">${g.members.map(npcCard).join('')}</div>
            </section>`).join('');
    }

    renderRumours();
    renderBoard();
    if (games.length) Athenaeum.games.mountTable($('poi-games'), store, poi);

    /* Tab strip (hidden when there is a single tab) */
    const strip = $('poi-tabs');
    strip.innerHTML = tabs.map(t => `
        <button type="button" role="tab" id="tabbtn-${t.id}" class="poi-tab" data-tab="${t.id}" aria-controls="tab-${t.id}" aria-selected="false" tabindex="-1">
            <span class="poi-tab__icon material-symbols-outlined" aria-hidden="true">${t.icon}</span>
            <span class="poi-tab__label">${t.label}</span>
        </button>`).join('');
    strip.hidden = tabs.length < 2;
    $('poi-ledger').classList.toggle('poi-ledger--tabbed', tabs.length > 1);

    function show(tabId, { focus = false, updateHash = true } = {}) {
        if (!tabs.some(t => t.id === tabId)) tabId = tabs[0].id;
        for (const t of tabs) {
            const on = t.id === tabId;
            const btn = $(`tabbtn-${t.id}`);
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on);
            btn.tabIndex = on ? 0 : -1;
            $(`tab-${t.id}`).hidden = !on;
            if (on && focus) btn.focus();
        }
        // The map is built once its tab is visible, and measured again each time it comes back
        if (tabId === 'map') { if (atlas) atlas.refit(); else atlas = mountMap(); }
        if (updateHash && tabs.length > 1) history.replaceState(history.state, '', `${location.pathname.split('/').pop()}${location.search}#${tabId}`);
    }
    strip.addEventListener('click', e => {
        const btn = e.target.closest('[data-tab]');
        if (!btn) return;
        show(btn.dataset.tab);
        // On a phone, bring the top of the card back under the sticky tabs
        const card = $('poi-ledger');
        if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    strip.addEventListener('keydown', e => {
        const i = tabs.findIndex(t => $(`tabbtn-${t.id}`) === document.activeElement);
        if (i < 0) return;
        const step = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        show(tabs[(i + step + tabs.length) % tabs.length].id, { focus: true });
    });
    $('poi-ledger').hidden = false;        // before show(): the map needs a visible box
    // A link to another tab of this page (…#people) only changes the hash
    window.addEventListener('hashchange', () => show(location.hash.slice(1), { updateHash: false }));
    show(location.hash.slice(1) || (params.get('spot') && instMaps.length ? 'map' : ''), { updateHash: false });
});