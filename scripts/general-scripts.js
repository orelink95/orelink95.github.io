function toggleModal() {
    const modal = document.getElementById('not-see-modal');
    modal.classList.toggle('hidden');
}


// Function to fetch and inject HTML
function loadComponent(placeholderId, componentPath) {
    const placeholder = document.getElementById(placeholderId);

    if (!placeholder) return;

    fetch(componentPath)
        .then(response => {
            if (!response.ok) throw new Error(`Could not load ${componentPath}`);
            return response.text();
        })
        .then(htmlData => {
            // Inject the HTML
            placeholder.innerHTML = htmlData;

            // If the component we just injected is the header, run the header highlight function
            if (placeholderId === "header-placeholder") {
                highlightActiveLink();
            }
            // NEW: If the component we just injected is the sidebar, run the sidebar highlight function
            else if (placeholderId === "sidebar-placeholder") {
                highlightActiveSidebarItem();
            }
        })
        .catch(error => console.error(error));
}



// Function to find and highlight the active page in the header nav
function highlightActiveLink() {
    // 1. Get the current file name (e.g., 'world.html' or 'index.html')
    let currentFileName = window.location.pathname.split("/").pop();

    // If the URL ends in a slash (like on a live server root), default to index.html
    if (currentFileName === "") currentFileName = "index.html";

    // 2. Find all the navigation links inside the header
    const navLinks = document.querySelectorAll("#header-placeholder a.nav-item");

    // 3. Loop through them and check if they match the current page
    navLinks.forEach(link => {
        const linkHref = link.getAttribute("href");

        if (linkHref === currentFileName) {
            // Remove the default dull text color
            link.classList.remove("text-[#e2e3df]");

            // Add the glowing gold active colors
            link.classList.add("text-[#e9c176]", "drop-shadow-[0_0_8px_rgba(233,193,118,0.4)]");

            // Optional: Find the icon inside this link and make it permanently tilted and gold
            const icon = link.querySelector(".material-symbols-outlined");
            if (icon) {
                icon.classList.add("rotate-12", "text-[#e9c176]");
            }
        }
    });
}

//Function to find and highlight the active page in the sidebar nav
function highlightActiveSidebarItem() {
    let currentPath = window.location.pathname.split("/").pop();
    if (currentPath === "") currentPath = "index.html";

    const navItems = document.querySelectorAll('#atlas-sidebar .nav-item');

    navItems.forEach(item => {
        const itemHref = item.getAttribute('href');

        if (itemHref === currentPath) {
            // Remove the inactive classes
            item.classList.remove('text-on-surface', 'hover:text-secondary', 'hover:bg-surface-container-high');

            // Add the golden active classes
            item.classList.add('text-secondary', 'bg-surface-container-highest', 'shadow-inner', 'hover:bg-surface-bright', 'relative');
        }
    });
}

// Function to handle the Mobile Sidebar toggle
function toggleMobileSidebar() {
    const sidebar = document.getElementById('atlas-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (!sidebar || !backdrop) return;

    // Check if it's currently hidden off-screen
    if (sidebar.classList.contains('-translate-x-full')) {
        // Slide it in
        sidebar.classList.remove('-translate-x-full');
        // Show the dark background
        backdrop.classList.remove('hidden');
        // Tiny delay to allow the 'hidden' class removal to register before fading in
        setTimeout(() => backdrop.classList.remove('opacity-0'), 10);
    } else {
        // Slide it out
        sidebar.classList.add('-translate-x-full');
        // Fade out the dark background
        backdrop.classList.add('opacity-0');
        // Wait for the fade animation to finish before hiding completely
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }
}

// Start the fetch process when the page loads
document.addEventListener("DOMContentLoaded", () => {
    loadComponent("header-placeholder", "components/header.html");
    loadComponent("footer-placeholder", "components/footer.html");
    loadComponent("sidebar-placeholder", "components/sidebar.html");
});



// --- RADIAL ORB MOBILE MENU ---
function createMobileOrbMenu() {
    const orbContainer = document.createElement('div');
    orbContainer.id = 'mobile-orb-menu';
    orbContainer.className = 'fixed bottom-6 left-6 z-20 md:hidden font-body';

    const links = [
        { name: 'NPCs', url: 'npc.html', icon: 'group', color: 'text-blue-400', border: 'border-blue-400/50', shadow: 'shadow-[0_0_15px_rgba(96,165,250,0.4)]' },
        { name: 'Story', url: 'scriptorium.html', icon: 'book', color: 'text-secondary', border: 'border-secondary/50', shadow: 'shadow-[0_0_15px_rgba(233,193,118,0.4)]' },
        { name: 'Atlas', url: 'world.html', icon: 'public', color: 'text-primary', border: 'border-primary/50', shadow: 'shadow-[0_0_15px_rgba(179,205,182,0.4)]' }
    ];

    // --- MATH: CIRCLE PERIMETER CALCULATION ---
    const radius = 110; // Distance of the circle's perimeter from the center
    const startAngle = 90; // 90 degrees is straight up
    const endAngle = 0; // 0 degrees is straight right

    // The main button is 56px (w-14) and mini-orbs are 40px (w-10).
    // To center their origins perfectly on each other, we offset by half their difference (8px).
    const centerOffset = 8;

    let itemsHtml = links.map((link, idx) => {
        // Calcul de l'espacement
        const angle = links.length > 1
            ? startAngle - (idx * ((startAngle - endAngle) / (links.length - 1)))
            : 45;

        const rad = angle * (Math.PI / 180);

        // Coordonnées X et Y
        const x = Math.round(Math.cos(rad) * radius) + centerOffset;
        const y = Math.round(-Math.sin(rad) * radius) - centerOffset;

        return `
        <a href="${link.url}" class="orb-item absolute bottom-0 left-0 transition-all duration-500 opacity-0 pointer-events-none w-10 h-10" style="transform: translate(0px, 0px) scale(0.5);" data-x="${x}" data-y="${y}">
            
            <div class="w-full h-full rounded-full bg-[#121412] border ${link.border} flex items-center justify-center ${link.shadow}">
                <span class="material-symbols-outlined ${link.color} text-[18px]">${link.icon}</span>
            </div>
            
            <span class="absolute text-[11px] font-label uppercase tracking-widest ${link.color} drop-shadow-md whitespace-nowrap bg-black/80 border border-white/10 px-3 py-1 rounded-full shadow-lg backdrop-blur-sm transition-transform"
                  style="top: -10px; left: 35px; transform-origin: bottom left; transform: rotate(-15deg);">
                ${link.name}
            </span>
            
        </a>
        `;
    }).join('');

    orbContainer.innerHTML = `
        <div id="orb-items-container" class="absolute bottom-0 left-0 w-0 h-0">
            ${itemsHtml}
        </div>
        <button id="main-orb-btn" class="relative w-14 h-14 rounded-full bg-[#0a0b0a] border border-secondary shadow-[0_0_20px_rgba(233,193,118,0.3)] flex items-center justify-center z-10 transition-transform duration-300 hover:scale-105 active:scale-95">
            <span id="main-orb-icon" class="material-symbols-outlined text-secondary text-3xl transition-transform duration-500">explore</span>
        </button>
    `;

    document.body.appendChild(orbContainer);

    // Interaction Logic
    const orbBtn = document.getElementById('main-orb-btn');
    const orbIcon = document.getElementById('main-orb-icon');
    const orbItems = document.querySelectorAll('.orb-item');
    let isOrbOpen = false;

    orbBtn.addEventListener('click', () => {
        isOrbOpen = !isOrbOpen;

        if (isOrbOpen) {
            orbIcon.style.transform = 'rotate(135deg)';
            orbBtn.classList.add('shadow-[0_0_30px_rgba(233,193,118,0.6)]');

            orbItems.forEach((item, index) => {
                item.style.pointerEvents = 'auto';
                item.style.opacity = '1';

                const targetX = item.getAttribute('data-x');
                const targetY = item.getAttribute('data-y');

                setTimeout(() => {
                    item.style.transform = `translate(${targetX}px, ${targetY}px) scale(1)`;
                }, index * 50);
            });
        } else {
            orbIcon.style.transform = 'rotate(0deg)';
            orbBtn.classList.remove('shadow-[0_0_30px_rgba(233,193,118,0.6)]');

            orbItems.forEach(item => {
                item.style.pointerEvents = 'none';
                item.style.opacity = '0';
                item.style.transform = 'translate(0px, 0px) scale(0.5)';
            });
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createMobileOrbMenu);
} else {
    createMobileOrbMenu();
}