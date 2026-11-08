// =====================================================================
// COUNTRY PAGE  —  country.html?id=<country id>
// Without a valid id the player is sent to countries.html.
// The country map with its settlements and points of interest as pins;
// clicking a pin shows its lore in the panel. Shared helpers:
// scripts/atlas-common.js.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const country = Atlas.requireEntry(store, 'country');
    if (!country) return;   // leaving for the list page
    const $ = id => document.getElementById(id);
    const lore = rec => rec.body ? store.autolink(store.md(rec.body, { dropCap: true }), { exclude: rec.id }) : '';
    Atlas.glow();

    // -----------------------------------------------------------------
    // 1. HEADER
    // -----------------------------------------------------------------
    document.title = `${country.name} - The Athenaeum Vault`;
    Atlas.breadcrumbs(store, $('atlas-breadcrumbs'), country);
    $('dynamic-title').textContent = country.name;
    $('dynamic-description').textContent = country.summary || country.subtitle || '';
    const mapImage = country.mapImage || null;
    if (mapImage) $('dynamic-bg-blur').style.backgroundImage = `url('${mapImage.src}')`;

    // -----------------------------------------------------------------
    // 2. LORE PANEL
    // -----------------------------------------------------------------
    const panel = Atlas.lorePanel({ entry: country.codex, title: country.loreTitle || country.name, body: lore(country) });

    // -----------------------------------------------------------------
    // 3. MAP
    // -----------------------------------------------------------------
    const mapElement = $('country-map');
    if (!mapElement) return;
    if (!mapImage) {
        mapElement.innerHTML = '<p class="map-empty">No map of this land has reached the archive yet.</p>';
        return;
    }

    const map = Atlas.createMap('country-map', { minZoom: -1, maxZoom: 2 });
    Atlas.showImage(map, mapImage);
    panel.onReset = () => map.closePopup();

    // Clicking empty space on the map resets the lore to the overview.
    // The console line helps place new pins: copy the Y / X into the data.
    map.on('click', e => {
        panel.reset();
        console.log(`Region Coords: Y: ${Math.round(e.latlng.lat)}, X: ${Math.round(e.latlng.lng)}`);
    });

    // -----------------------------------------------------------------
    // 4. PINS: the settlements and POIs placed on this country's map
    // -----------------------------------------------------------------
    store.children(country).filter(c => c.map).forEach(c => {
        Atlas.pin({
            y: c.map.y, x: c.map.x, name: c.name,
            icon: Atlas.regionIcon(c.map.icon || 'settlement', !!c.danger),
            popupHtml: Atlas.popup({ title: c.name, subtitle: c.subtitle, danger: c.danger, url: store.url(c), cta: Atlas.cta(store, c) }),
            onClick: () => panel.show({ entry: c.codex, title: c.name, body: lore(c) })
        }).addTo(map);
    });
});
