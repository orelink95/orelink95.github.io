/* =====================================================================
   POINT OF INTEREST PAGE  —  poi.html?id=<poi id>[#fare|#wares|#shrine|#rumours|#games|#board]
   Any POI: image, location, lore, the NPCs whose home it is.
   A POI can be several things at once; each adds a tab to the ledger card:
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

    const T = Athenaeum.tavern, M = Athenaeum.market;
    const tavern = poi.tavern && poi.tavern.tier ? poi.tavern : null;
    const shop = poi.shop && poi.shop.kind ? poi.shop : null;
    const temple = poi.temple || null;
    const code = params.has('code') ? params.get('code') : (store.settings.tavernCode || '');
    const $ = sel => document.getElementById(sel);

    document.title = `${poi.name} - The Athenaeum Vault`;
    root.classList.toggle('is-danger', !!poi.danger);

    /* ---------- Hero ---------- */
    const roles = [tavern && 'Tavern & Lodging', shop && M.shopKind(store, shop).label, temple && 'Temple'].filter(Boolean);
    $('poi-image').src = poi.image || 'images/pois/placeholder.png';
    $('poi-image').alt = poi.name;
    $('poi-eyebrow').textContent = roles.length ? roles.join(' · ') : poi.danger ? 'Danger Zone' : poi.featured ? 'Featured Landmark' : 'Landmark';
    $('poi-title').textContent = poi.name;
    $('poi-subtitle').textContent = poi.subtitle || '';
    // Where it is: Eraldom › continent › country › settlement › this POI
    Atlas.breadcrumbs(store, $('atlas-breadcrumbs'), poi);

    const fact = (key, html) => { $(`poi-${key}`).innerHTML = html; $(`poi-${key}-fact`).hidden = false; };
    if (tavern || shop) fact('tier', esc(M.tierFor(store, poi, shop).label));
    // Hours of each role. A shop with none keeps the tavern's; when the roles differ, one line each.
    const hoursOf = [
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
    $('poi-body-title').textContent = tavern ? 'The Establishment' : temple ? 'The Sanctuary' : shop ? 'The Shop' : 'Archive Entry';
    $('poi-body').innerHTML = poi.body
        ? store.autolink(store.md(poi.body, { dropCap: true }), { exclude: poi.id })
        : '<p class="poi-muted">No lore recorded for this landmark yet.</p>';

    const people = store.backrefs(poi, 'npc', 'home');
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
        const services = T.buildServices(store, poi);
        // The gaming table is a service of the house: free, links to the Games tab
        if (games.length) services.push({ name: 'Gaming table', desc: `${games.join(', ')} with the regulars. See the Games tab.`, priceLabel: 'Free' });
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
    show(location.hash.slice(1), { updateHash: false });
    $('poi-ledger').hidden = false;
});
