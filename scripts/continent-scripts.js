// =====================================================================
// CONTINENT MAP ENGINE
// Controls the Aethelgard Leaflet map and its specific markers
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Grab the continent map container
    const mapElement = document.getElementById('continent-map');
    if (!mapElement) return;

    // 2. Initialize Map
    const map = L.map('continent-map', {
        crs: L.CRS.Simple,
        minZoom: -2,
        maxZoom: 1,
        zoomControl: false,
        attributionControl: false
    });

    // 3. Set Dimensions 
    const imgWidth = 2930;
    const imgHeight = 1760;
    const bounds = [[0, 0], [imgHeight, imgWidth]];

    // 4. Load the Continent Image
    const mapOverlay = L.imageOverlay('./images/maltona_map.png', bounds).addTo(map);
    map.fitBounds(bounds);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // -----------------------------------------------------------------
    // CONTINENT-SPECIFIC ICON GENERATOR (GREEN THEME)
    // -----------------------------------------------------------------
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

    const popupOptions = { className: 'fantasy-popup' };

    // -----------------------------------------------------------------
    // POPULATE MARKERS FROM REGISTRY
    // -----------------------------------------------------------------

    // We check if continentMarkersData exists to prevent errors
    if (typeof continentMarkersData !== 'undefined') {
        continentMarkersData.forEach(data => {
            const marker = L.marker(L.latLng(data.y, data.x), {
                icon: createFantasyIcon(data.icon, data.isDanger)
            });

            // Set popup style based on danger flag
            const colorClass = data.isDanger ? 'text-error' : 'text-secondary';

            marker.bindPopup(`
                <div class='text-center p-1'>
                    <b class='font-headline text-xl ${colorClass} block mb-1'>${data.title}</b>
                    <span class='font-label text-[10px] uppercase tracking-widest text-on-surface-variant/80 block mb-3'>${data.subtitle}</span>
                    
                    <a href="country.html?id=${data.id}" class="inline-block px-4 py-1.5 border border-secondary/40 text-secondary font-label text-[10px] uppercase tracking-widest rounded hover:bg-secondary/10 hover:border-secondary transition-all">
                        Explore Region
                    </a>
                </div>`, popupOptions);

            // Add marker directly to the map
            marker.addTo(map);
        });
    }


    // -----------------------------------------------------------------
    // UTILITY: COORDINATE FINDER
    // -----------------------------------------------------------------
    // Click anywhere on the continent map to get the X/Y for thr Admin Tool
    //map.on('click', function (e) {
    //    console.log(`Continent Coords: Y: ${Math.round(e.latlng.lat)}, X: ${Math.round(e.latlng.lng)}`);
    //    alert(`Y: ${Math.round(e.latlng.lat)}, X: ${Math.round(e.latlng.lng)}`);
    //});
});