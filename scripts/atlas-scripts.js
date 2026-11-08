// =====================================================================
// WORLD ATLAS  —  world.html
// The world map (data/world.json), one pin per continent
// (data/continents.json), the lore panel, the layer buttons and the
// figures under the map. Shared helpers: scripts/atlas-common.js.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const mapElement = document.getElementById('world-map');
    if (!mapElement) return;

    const store = await Athenaeum.ready;
    const world = store.world;
    Atlas.glow();
    Atlas.breadcrumbs(store, document.getElementById('atlas-breadcrumbs'));

    // -----------------------------------------------------------------
    // 1. MAP
    // -----------------------------------------------------------------
    const map = Atlas.createMap('world-map', { minZoom: -1, maxZoom: 2 });
    Atlas.showImage(map, world.mapImage);

    // Gold pins (red when dangerous): see .atlas-pin in pages/world.css
    function createFantasyIcon(iconName, isDanger = false) {
        const tone = isDanger ? 'atlas-pin--danger' : '';
        return L.divIcon({
            className: 'map-pin-shell', // no Leaflet white square behind the pin
            html: `
                <div class="atlas-pin ${tone}">
                    <div class="atlas-pin__glow"></div>
                    <div class="atlas-pin__disc">
                        <img src="./images/atlas_icons/${iconName}.svg" alt="" class="atlas-pin__icon" style="filter: brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(10deg);" />
                    </div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });
    }

    // -----------------------------------------------------------------
    // 2. LORE PANEL
    // -----------------------------------------------------------------
    const panel = Atlas.lorePanel({
        entry: world.codex || '',
        title: world.loreTitle || world.name,
        body: store.autolink(store.md(world.body, { dropCap: true }))
    });
    panel.onReset = () => map.closePopup();
    map.on('click', () => panel.reset());     // click on empty map = back to the overview

    // -----------------------------------------------------------------
    // 3. CONTINENT PINS, SORTED INTO LAYERS
    // -----------------------------------------------------------------
    // Each continent's map.layer says which layer button shows it.
    const layers = {};   // layer name -> L.layerGroup
    store.all('continent').filter(c => c.map).forEach(c => {
        const view = {
            entry: c.codex || '',
            title: c.name,
            body: store.autolink(store.md(c.body, { dropCap: true }), { exclude: c.id })
        };
        const marker = Atlas.pin({
            y: c.map.y, x: c.map.x, name: c.name,
            icon: createFantasyIcon(c.map.icon, !!c.danger),
            // Every continent has a page, with or without a map of its own
            popupHtml: Atlas.popup({ title: c.name, subtitle: c.subtitle, danger: c.danger, url: store.url(c), cta: Atlas.cta(store, c) }),
            onClick: () => panel.show(view)
        });
        const layer = c.map.layer || 'cartographic';
        (layers[layer] = layers[layer] || L.layerGroup()).addLayer(marker);
    });

    // -----------------------------------------------------------------
    // 4. LAYER BUTTONS
    // -----------------------------------------------------------------
    // One button per layer that has at least one pin. With a single layer
    // the buttons are hidden: there is nothing to switch to.
    // (Values of the mapLayer list in data/schema.js.)
    const LAYER_NAMES = {
        cartographic: 'Landmass', political: 'Political', relic: 'Relic',
        locations: 'Locations', events: 'Events', hazards: 'Hazards'
    };
    const order = Object.keys(LAYER_NAMES);
    const used = Object.keys(layers).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const first = used[0];
    if (first) layers[first].addTo(map);

    const scroller = document.getElementById('atlas-layers-scroller');
    const holder = document.getElementById('atlas-layers');
    if (used.length > 1) {
        holder.innerHTML = used.map(name => `
            <button type="button" data-layer="${name}" aria-pressed="${name === first}"
                class="atlas-layer layer-btn${name === first ? ' is-active' : ''}">
                ${LAYER_NAMES[name] || name}
            </button>`).join('');
        holder.querySelectorAll('.layer-btn').forEach(button => {
            button.addEventListener('click', () => {
                const selected = button.dataset.layer;
                used.forEach(name => map.removeLayer(layers[name]));
                map.addLayer(layers[selected]);
                map.closePopup();
                panel.reset();
                holder.querySelectorAll('.layer-btn').forEach(btn => {
                    btn.classList.toggle('is-active', btn === button);
                    btn.setAttribute('aria-pressed', btn === button);
                });
            });
        });
    } else if (scroller) {
        scroller.classList.add('hidden');
    }

    // -----------------------------------------------------------------
    // 5. FIGURES UNDER THE MAP (counted from the data)
    // -----------------------------------------------------------------
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const settlements = store.all('settlement');
    const countriesWithTowns = new Set(settlements.map(s => (store.ancestors(s).find(p => store.typeOf(p) === 'country') || {}).id).filter(Boolean));
    const pois = store.all('poi');
    const taverns = pois.filter(p => p.tavern && p.tavern.tier).length;
    const people = store.all('npc').filter(n => !n.stub);
    const factions = store.all('faction').filter(f => !f.stub);
    // Standing in the current campaign (store.standing)
    const hostile = factions.filter(f => /^hostile/i.test(store.standing(f))).length;
    const L_ = Atlas.LABELS;

    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('stat-settlements-label', `Known ${L_.settlement.many}`);
    set('stat-settlements', settlements.length);
    set('stat-settlements-note', `Across ${plural(countriesWithTowns.size, L_.country.one.toLowerCase(), L_.country.many.toLowerCase())}`);
    set('stat-pois-label', L_.poi.many);
    set('stat-pois', pois.length);
    set('stat-pois-note', taverns ? `Including ${plural(taverns, 'tavern', 'taverns')}` : 'Landmarks on record');
    set('stat-people', people.length);
    set('stat-people-note', 'Recorded in the Almanach');
    set('stat-factions', factions.length);
    set('stat-factions-note', hostile ? `${hostile} ${hostile === 1 ? 'is' : 'are'} hostile to the party` : 'None hostile to the party');
});
