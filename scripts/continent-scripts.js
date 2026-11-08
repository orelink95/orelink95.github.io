// =====================================================================
// CONTINENT PAGE  —  continent.html?id=<continent id>
// Without a valid id the player is sent to continents.html.
// Map pins are the continent's countries; clicking one shows its lore
// in the panel under the map. Nations list, info cards, notable people
// and epigraph all come from data/continents.json.
// Shared helpers: scripts/atlas-common.js.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const continent = Atlas.requireEntry(store, 'continent');
    if (!continent) return;   // leaving for the list page
    const $ = id => document.getElementById(id);
    const lore = rec => rec.body ? store.autolink(store.md(rec.body, { dropCap: true }), { exclude: rec.id }) : '';
    Atlas.glow();

    // -----------------------------------------------------------------
    // HEADER
    // -----------------------------------------------------------------
    document.title = `${continent.name} - The Athenaeum Vault`;
    Atlas.breadcrumbs(store, $('atlas-breadcrumbs'), continent);
    $('continent-name').textContent = continent.name;
    $('continent-tagline').textContent = [continent.subtitle, continent.era].filter(Boolean).join(' • ');

    // -----------------------------------------------------------------
    // LORE PANEL
    // -----------------------------------------------------------------
    const panel = Atlas.lorePanel({ entry: continent.codex, title: continent.name, body: lore(continent) });

    // -----------------------------------------------------------------
    // INFO CARDS
    // -----------------------------------------------------------------
    const tones = ['continent-fact--green', 'continent-fact--gold'];   // alternate cards
    $('continent-facts').innerHTML = (continent.facts || []).map((f, i) => `
        <div class="continent-fact ${tones[i % 2]}">
            <h3 class="continent-fact__title">${f.title || ''}</h3>
            <p class="continent-fact__text">${store.autolink(f.text || '')}</p>
        </div>`).join('');

    // -----------------------------------------------------------------
    // NATIONS LIST  (countries marked "unlisted" stay off the list)
    // -----------------------------------------------------------------
    const countries = store.children(continent, 'country');
    $('nations-title').textContent = `${Atlas.LABELS.country.many} of ${continent.name}`;
    $('nations-list').innerHTML = countries.filter(c => !c.unlisted).map(c => `
        <li class="continent-nation">
            <a href="${store.url(c)}"
                class="continent-nation__link">
                <div>
                    <p class="continent-nation__name">${c.name}</p>
                    <p class="continent-nation__epithet">${c.epithet || c.subtitle || ''}</p>
                </div>
                <span class="continent-nation__arrow material-symbols-outlined">arrow_forward</span>
            </a>
        </li>`).join('') || `<li class="continent-nations__empty">No ${Atlas.LABELS.country.many.toLowerCase()} recorded yet.</li>`;

    // -----------------------------------------------------------------
    // VERY IMPORTANT PEOPLE
    // -----------------------------------------------------------------
    const notables = (continent.notables || []).map(id => store.get(id)).filter(Boolean);
    if (notables.length) {
        $('notables-list').innerHTML = notables.map(npc => `
            <a href="${store.url(npc)}" class="notable">
                <div class="notable__portrait">
                    <img class="notable__image"
                        alt="${npc.name}" src="${npc.portrait || 'images/placeholder.png'}" />
                </div>
                <div class="notable__body">
                    <h4 class="notable__name">${npc.name}</h4>
                    <p class="notable__role">${npc.role || ''}</p>
                    <div class="notable__tags">
                        ${npc.species ? `<span class="notable__tag">${npc.species}</span>` : ''}
                    </div>
                </div>
            </a>`).join('');
        $('notables-section').classList.remove('hidden');
    }

    // -----------------------------------------------------------------
    // EPIGRAPH
    // -----------------------------------------------------------------
    if (continent.epigraph) {
        $('epigraph-text').textContent = `"${continent.epigraph}"`;
        $('epigraph-source').textContent = continent.epigraphSource ? `— ${continent.epigraphSource}` : '';
        $('epigraph').classList.remove('hidden');
    }

    // -----------------------------------------------------------------
    // MAP
    // -----------------------------------------------------------------
    const mapElement = $('continent-map');
    const img = continent.mapImage;
    if (!mapElement) return;
    if (!img) {
        mapElement.innerHTML = '<p class="map-empty">No map of this continent has reached the archive yet.</p>';
        return;
    }
    $('continent-frame').style.aspectRatio = `${img.width} / ${img.height}`;

    const map = Atlas.createMap('continent-map', { minZoom: -2, maxZoom: 1 });
    Atlas.showImage(map, img);
    panel.onReset = () => map.closePopup();
    map.on('click', () => panel.reset());     // click on empty map = back to the continent

    // Green-themed pins for the continent map
    function createFantasyIcon(iconName, isDanger = false) {
        const tone = isDanger ? 'continent-pin--danger' : '';   // red pins for dangerous places
        return L.divIcon({
            className: 'map-pin-shell',
            html: `
                <div class="continent-pin ${tone}">
                    <div class="continent-pin__glow"></div>
                    <div class="continent-pin__disc">
                        <img src="./images/atlas_icons/${iconName}.svg" alt=""
                             class="continent-pin__icon"
                             style="filter: ${isDanger ? 'brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(-50deg)' : 'brightness(0) invert(1) sepia(1) saturate(3) hue-rotate(100deg)'};" />
                    </div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });
    }

    countries.filter(c => c.map).forEach(c => {
        const name = c.shortName || c.name;
        Atlas.pin({
            y: c.map.y, x: c.map.x, name,
            icon: createFantasyIcon(c.map.icon || 'settlement', c.danger),
            popupHtml: Atlas.popup({ title: name, subtitle: c.subtitle, danger: c.danger, url: store.url(c), cta: Atlas.cta(store, c) }),
            onClick: () => panel.show({ entry: c.codex, title: c.loreTitle || c.name, body: lore(c) })
        }).addTo(map);
    });
});
