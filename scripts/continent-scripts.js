// =====================================================================
// CONTINENT PAGE  —  continent.html?id=<continent id>  (default: maltona)
// Map pins are the continent's countries; nations list, info cards,
// notable people and epigraph all come from data/continents.json.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const params = new URLSearchParams(window.location.search);
    let continent = store.get(params.get('id'));
    if (!continent || store.typeOf(continent) !== 'continent') continent = store.get('maltona') || store.all('continent')[0];
    const $ = id => document.getElementById(id);

    // -----------------------------------------------------------------
    // HEADER
    // -----------------------------------------------------------------
    document.title = `${continent.name} - The Athenaeum Vault`;
    $('world-link').textContent = store.world.name || 'Eraldom';
    $('world-link').href = store.url('world') || 'world.html';
    $('crumb-continent').textContent = continent.name;
    $('continent-name').textContent = continent.name;
    $('continent-tagline').textContent = [continent.subtitle, continent.era].filter(Boolean).join(' • ');

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
    // NATIONS LIST
    // -----------------------------------------------------------------
    const countries = store.children(continent, 'country');
    $('nations-title').textContent = `Nations of ${continent.name}`;
    $('nations-list').innerHTML = countries.filter(c => !c.unlisted).map(c => `
        <li class="continent-nation">
            <a href="${store.url(c)}"
                class="continent-nation__link">
                <div>
                    <p class="continent-nation__name font-noto-serif">${c.name}</p>
                    <p class="continent-nation__epithet">${c.epithet || c.subtitle || ''}</p>
                </div>
                <span class="continent-nation__arrow material-symbols-outlined">arrow_forward</span>
            </a>
        </li>`).join('') || '<li class="continent-nations__empty">No nations recorded yet.</li>';

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
                    <h4 class="notable__name font-noto-serif">${npc.name}</h4>
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
        mapElement.innerHTML = '<p class="map-empty font-newsreader">No map of this continent has reached the archive yet.</p>';
        return;
    }
    $('continent-frame').style.aspectRatio = `${img.width} / ${img.height}`;

    const map = L.map('continent-map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 1,
        zoomControl: false,
        attributionControl: false
    });
    const bounds = [[0, 0], [img.height, img.width]];
    L.imageOverlay(img.src, bounds).addTo(map);
    map.fitBounds(bounds);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Green-themed pins for the continent map
    function createFantasyIcon(iconName, isDanger = false) {
        const tone = isDanger ? 'continent-pin--danger' : '';   // red pins for dangerous places
        return L.divIcon({
            className: 'map-pin-shell',
            html: `
                <div class="continent-pin ${tone}">
                    <div class="continent-pin__glow"></div>
                    <div class="continent-pin__disc">
                        <img src="./images/atlas_icons/${iconName}.svg"
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
        const marker = L.marker(L.latLng(c.map.y, c.map.x), { icon: createFantasyIcon(c.map.icon || 'settlement', c.danger) });
        marker.bindPopup(`
            <div class='map-popup'>
                <b class='map-popup__title ${c.danger ? 'map-popup__title--danger' : ''}'>${c.shortName || c.name}</b>
                <span class='map-popup__subtitle'>${c.subtitle || ''}</span>
                <a href="${store.url(c)}" class="map-popup__button">
                    Explore Region
                </a>
            </div>`, { className: 'fantasy-popup' });
        marker.addTo(map);
    });
});
