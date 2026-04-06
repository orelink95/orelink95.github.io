// Magic Glow Spotlight Effect for Lore Cards
document.addEventListener("DOMContentLoaded", () => {
    const loreCards = document.querySelectorAll('.lore-card');

    loreCards.forEach(card => {
        card.addEventListener('mousemove', e => {
            // Get the size and position of the card
            const rect = card.getBoundingClientRect();
            // Calculate mouse position relative to the card
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Send these coordinates to CSS as custom variables
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
});

// =====================================================================
// ATLAS INTERACTIVITY SCRIPT
// This file controls the Leaflet map, custom markers, and layer toggles.
// =====================================================================

document.addEventListener("DOMContentLoaded", () => {
    // -----------------------------------------------------------------
    // 1. MAP INITIALIZATION & SETUP
    // -----------------------------------------------------------------

    // Grab the HTML container for the map. If it doesn't exist on this page, stop running.
    const mapElement = document.getElementById('world-map');
    if (!mapElement) return;

    // Create the Leaflet map instance. 
    // L.CRS.Simple tells Leaflet this is a flat image, not a real globe with GPS coordinates.
    const map = L.map('world-map', {
        crs: L.CRS.Simple,
        minZoom: -1,         // How far out the user can zoom
        maxZoom: 2,          // How far in the user can zoom
        zoomControl: false,  // We disable the default top-left zoom buttons to move them later
        attributionControl: false // Removes the "Leaflet" watermark at the bottom right
    });

    // Map Image Dimensions: MUST exactly match the pixel resolution of your uploaded map images!
    const imgWidth = 1920;
    const imgHeight = 1078;

    // Define the corners of the map [Bottom-Left [Y, X], Top-Right [Y, X]]
    const bounds = [[0, 0], [imgHeight, imgWidth]];

    // Load the initial background image (Cartographic layer by default)
    // We save this into a variable ('mapOverlay') so we can swap the URL later when buttons are clicked!
    const mapOverlay = L.imageOverlay('./images/eraldom_world_map.png', bounds).addTo(map);

    // Force the map to center itself perfectly within the bounds we just set
    map.fitBounds(bounds);

    // Add the zoom in/out buttons back to the map, but push them to the bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);


    // -----------------------------------------------------------------
    // 2. CUSTOM FANTASY ICONS
    // -----------------------------------------------------------------
    // Parameter:
    // - isDanger: A true/false flag. If true, the pin turns red. If false (default), it stays gold.
    function createFantasyIcon(iconName, isDanger = false) {

        // Ternary operators (? :) check if isDanger is true. If true, use red 'error' colors. Otherwise, use gold 'secondary' colors.
        const glowColor = isDanger ? 'bg-error/30' : 'bg-secondary/30';
        const borderColor = isDanger ? 'border-error' : 'border-secondary';

        // Hover states specific to the group
        const hoverBg = isDanger ? 'group-hover/pin:bg-error' : 'group-hover/pin:bg-secondary';

        return L.divIcon({
            className: 'bg-transparent border-none', // Removes default Leaflet white square styling
            html: `
                <div class="relative group/pin flex items-center justify-center w-10 h-10 cursor-pointer">
                    <div class="absolute inset-0 ${glowColor} rounded-full blur-md group-hover/pin:blur-lg group-hover/pin:scale-125 transition-all duration-300"></div>
                    
                    <div class="relative z-10 w-10 h-10 bg-surface-container-high border-2 ${borderColor} rounded-full flex items-center justify-center shadow-xl group-hover/pin:scale-110 transition-all duration-300">
                        <img src="./images/atlas_icons/${iconName}.svg" class="w-6 h-6 transition-transform duration-300 group-hover/pin:scale-110 pointer-events-none" style="filter: brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(10deg);" />
                    </div>
                </div>
            `,
            iconSize: [40, 40],       // The physical width/height of the HTML block
            iconAnchor: [20, 20],     // The exact pixel that points to the coordinate 
            popupAnchor: [0, -20]     // Where the popup bubble should spawn relative to the anchor (0px left, 16px up)
        });
    }

    // Custom CSS class applied to the popups --> atlas-style.css
    const popupOptions = { className: 'fantasy-popup' };


    // -----------------------------------------------------------------
    // 3. CREATE LAYER GROUPS 
    // -----------------------------------------------------------------

    const cartographicLayer = L.layerGroup().addTo(map); // Added to map immediately on load
    const politicalLayer = L.layerGroup();               // Hidden by default
    const relicLayer = L.layerGroup();                   // Hidden by default


    // -----------------------------------------------------------------
    // 4. THE MASTER REGISTRY & LORE PANEL FUNC 
    // -----------------------------------------------------------------

    // Master registry moved to standalone file (atlas-registry) for clarity

    // Keep the default lore here for the overview/reset
    const defaultLore = {
        entry: 'Codex Entry: 04.A',
        title: 'The Known Realms',
        body: `<p>
                            <span
                                class="float-left text-6xl font-headline text-secondary leading-none pr-3 pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]">B</span>
                            eyond the jagged peaks of the Iron Span lies a world scarred by ancient magic and forgotten
                            dynasties. The Athenaeum records these lands not as they are, but as they survive.
                        </p>
                        <p>
                            To the east, the <span class="text-e2e3df font-semibold">Sunken Isles</span> still radiate
                            with the chaotic energy of the First Sundering. Travelers speak of waters that glow like
                            liquid starlight, though few return to verify such claims.
                        </p>

                        <div class="relative my-8 pl-6 border-l-2 border-primary/30">
                            <span
                                class="material-symbols-outlined absolute -left-3 -top-3 text-primary/20 text-4xl bg-surface-container-low"
                                style="font-variation-settings: 'FILL' 1;">format_quote</span>
                            <p class="italic text-on-surface/80 relative z-10">
                                "Do not trust the maps drawn before the War. The land remembers the trauma, it has been disfigured."
                            </p>
                            <span class="block text-[10px] font-label uppercase tracking-widest text-primary mt-3">—
                                Master Sage Elara</span>
                        </div>`
    };

    // Updated Lore Panel Function
    function updateLorePanel(data) {
        document.getElementById('lore-entry-id').textContent = data.entry;
        document.getElementById('lore-title').textContent = data.title;
        document.getElementById('lore-body').innerHTML = data.body;

        const resetBtn = document.getElementById('reset-lore-btn');
        if (resetBtn) {
            // Hide reset button if we are looking at the default view
            if (data.title === defaultLore.title) resetBtn.classList.add('hidden');
            else resetBtn.classList.remove('hidden');
        }
    }

    // -----------------------------------------------------------------
    // 5. AUTOMATED MARKER GENERATION
    // -----------------------------------------------------------------
    allMarkersData.forEach(data => {
        const marker = L.marker(L.latLng(data.y, data.x), {
            icon: createFantasyIcon(data.icon, data.isDanger)
        });

        // Set popup style based on danger
        const colorClass = data.isDanger ? 'text-error' : 'text-secondary';
        marker.bindPopup(`
            <div class='text-center'>
                <b class='font-headline text-xl ${colorClass} block mb-1'>${data.title}</b>
                <span class='font-label text-[10px] uppercase tracking-widest text-on-surface-variant/80'>${data.subtitle}</span>
            </div>
        `, popupOptions);

        // Click event to update lore panel using the data directly from the registry
        marker.on('click', () => updateLorePanel(data));

        // Add to correct layer
        if (data.layer === 'cartographic') marker.addTo(cartographicLayer);
        else if (data.layer === 'political') marker.addTo(politicalLayer);
        else if (data.layer === 'relic') marker.addTo(relicLayer);
    });

    // Reset logic for clicking empty map
    map.on('click', () => updateLorePanel(defaultLore));

    // Reset logic for the Undo button
    const resetLoreBtn = document.getElementById('reset-lore-btn');
    if (resetLoreBtn) {
        resetLoreBtn.addEventListener('click', () => {
            updateLorePanel(defaultLore);
            map.closePopup();
        });
    }





    // -----------------------------------------------------------------
    // 6. LAYER TOGGLE BUTTON LOGIC
    // -----------------------------------------------------------------

    // This object acts as a dictionary. It links the button's data-layer attribute 
    // to its corresponding marker folder and map background image.
    const mapData = {
        cartographic: {
            markers: cartographicLayer,
            image: './images/eraldom_world_map.png'
        },
        political: {
            markers: politicalLayer,
            image: './images/placeholder_text.png'
        },
        relic: {
            markers: relicLayer,
            image: './images/eraldom_world_map.png'
        }
    };

    // Find all the buttons with the 'layer-btn' class
    const layerButtons = document.querySelectorAll('.layer-btn');

    // Loop through each button and give it a click listener
    layerButtons.forEach(button => {
        button.addEventListener('click', () => {

            // Get the name of the layer from the button the user just clicked (e.g., 'political')
            const selectedLayer = button.getAttribute('data-layer');

            // A. Swap the background map image to match the selected layer
            mapOverlay.setUrl(mapData[selectedLayer].image);

            // B. Hide ALL marker layers to give us a blank slate
            // Object.values(mapData) loops through cartographic, political, and relic data
            Object.values(mapData).forEach(data => map.removeLayer(data.markers));

            // C. Add ONLY the markers for the button that was clicked
            map.addLayer(mapData[selectedLayer].markers);

            // D. Update the visual styling of the HTML buttons
            layerButtons.forEach(btn => {
                // Remove active colors from all buttons
                btn.classList.remove('bg-primary-container', 'text-primary');
                // Add inactive colors to all buttons
                btn.classList.add('text-on-surface-variant', 'hover:text-secondary');
            });

            // Finally, add the active colors to the specific button the user clicked
            button.classList.remove('text-on-surface-variant', 'hover:text-secondary');
            button.classList.add('bg-primary-container', 'text-primary');
        });
    });
});


