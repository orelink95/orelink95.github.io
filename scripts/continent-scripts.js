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
    const borders = ['border-primary-container', 'border-secondary/40'];
    $('continent-facts').innerHTML = (continent.facts || []).map((f, i) => `
        <div class="bg-surface-container border-l-2 ${borders[i % 2]} p-6 hover:bg-surface-container-high transition-colors rounded-r-lg">
            <h3 class="font-headline text-lg text-secondary mb-2">${f.title || ''}</h3>
            <p class="text-on-surface-variant leading-relaxed italic text-sm">${store.autolink(f.text || '')}</p>
        </div>`).join('');

    // -----------------------------------------------------------------
    // NATIONS LIST
    // -----------------------------------------------------------------
    const countries = store.children(continent, 'country');
    $('nations-title').textContent = `Nations of ${continent.name}`;
    $('nations-list').innerHTML = countries.filter(c => !c.unlisted).map(c => `
        <li class="group cursor-pointer">
            <a href="${store.url(c)}"
                class="flex items-center justify-between p-3 bg-surface-container-low hover:bg-surface-container transition-all border-l-2 border-transparent hover:border-secondary rounded-r">
                <div>
                    <p class="font-noto-serif text-secondary group-hover:text-secondary-fixed transition-colors">${c.name}</p>
                    <p class="font-label text-[10px] text-on-surface-variant/60 uppercase">${c.epithet || c.subtitle || ''}</p>
                </div>
                <span class="material-symbols-outlined text-secondary/30 group-hover:text-secondary group-hover:translate-x-1 transition-all">arrow_forward</span>
            </a>
        </li>`).join('') || '<li class="italic text-on-surface/40 text-sm">No nations recorded yet.</li>';

    // -----------------------------------------------------------------
    // VERY IMPORTANT PEOPLE
    // -----------------------------------------------------------------
    const notables = (continent.notables || []).map(id => store.get(id)).filter(Boolean);
    if (notables.length) {
        $('notables-list').innerHTML = notables.map(npc => `
            <a href="${store.url(npc)}" class="flex space-x-4 group cursor-pointer">
                <div class="w-16 h-20 bg-surface-container-highest flex-shrink-0 border border-secondary/10 overflow-hidden rounded shadow-lg group-hover:border-secondary/40 transition-all">
                    <img class="w-full h-full object-cover grayscale brightness-75 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-700"
                        alt="${npc.name}" src="${npc.portrait || 'images/placeholder.png'}" />
                </div>
                <div class="flex-1">
                    <h4 class="font-noto-serif text-secondary text-sm group-hover:text-secondary-fixed">${npc.name}</h4>
                    <p class="text-xs text-on-surface-variant italic leading-tight mb-2">${npc.role || ''}</p>
                    <div class="flex gap-2">
                        ${npc.species ? `<span class="px-2 py-0.5 bg-primary-container/40 text-on-primary-container text-[8px] font-label uppercase rounded">${npc.species}</span>` : ''}
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
        mapElement.innerHTML = '<p class="h-full flex items-center justify-center italic text-on-surface/40 font-newsreader text-lg">No map of this continent has reached the archive yet.</p>';
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
        const glowColor = isDanger ? 'bg-error/30' : 'bg-emerald-500/30';
        const borderColor = isDanger ? 'border-error' : 'border-emerald-500/60';
        return L.divIcon({
            className: 'bg-transparent border-none',
            html: `
                <div class="relative group/pin flex items-center justify-center w-10 h-10 cursor-pointer">
                    <div class="absolute inset-0 ${glowColor} rounded-full blur-md group-hover/pin:blur-lg group-hover/pin:scale-125 transition-all duration-300"></div>
                    <div class="relative z-10 w-10 h-10 bg-surface-container-high border-2 ${borderColor} rounded-full flex items-center justify-center shadow-xl group-hover/pin:scale-110 transition-all duration-300">
                        <img src="./images/atlas_icons/${iconName}.svg"
                             class="w-6 h-6 transition-transform duration-300 group-hover/pin:scale-110 pointer-events-none"
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
            <div class='text-center p-1'>
                <b class='font-headline text-xl ${c.danger ? 'text-error' : 'text-secondary'} block mb-1'>${c.shortName || c.name}</b>
                <span class='font-label text-[10px] uppercase tracking-widest text-on-surface-variant/80 block mb-3'>${c.subtitle || ''}</span>
                <a href="${store.url(c)}" class="inline-block px-4 py-1.5 border border-secondary/40 text-secondary font-label text-[10px] uppercase tracking-widest rounded hover:bg-secondary/10 hover:border-secondary transition-all">
                    Explore Region
                </a>
            </div>`, { className: 'fantasy-popup' });
        marker.addTo(map);
    });
});
