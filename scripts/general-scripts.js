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
            // If the component we just injected is the sidebar, run the sidebar highlight function
            else if (placeholderId === "sidebar-placeholder") {
                highlightActiveSidebarItem();
            }
            // NEW: If the library sidebar just loaded, run its highlight function!
            else if (placeholderId === "library-sidebar-placeholder") {
                highlightLibrarySidebar();
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
            // Gold, glowing, with its icon tilted (.site-header__link.is-active, .library-header__link.is-active)
            link.classList.add("is-active");
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
            item.classList.add('is-active');
        }
    });
}

// Function to handle the Mobile Sidebar toggle
function toggleMobileSidebar() {
    const sidebar = document.getElementById('atlas-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (!sidebar || !backdrop) return;

    if (!sidebar.classList.contains('is-open')) {
        // Slide it in and show the dark background
        sidebar.classList.add('is-open');
        backdrop.classList.remove('hidden');
        // Tiny delay so the fade-in starts after 'hidden' is gone
        setTimeout(() => backdrop.classList.add('is-visible'), 10);
    } else {
        // Slide it out, fade the background, then hide it completely
        sidebar.classList.remove('is-open');
        backdrop.classList.remove('is-visible');
        setTimeout(() => backdrop.classList.add('hidden'), 300);
    }
}

// Start the fetch process when the page loads
document.addEventListener("DOMContentLoaded", () => {
    // Library pages load their own header/footer variants; skip the defaults
    // there to avoid a double fetch and a flash of the wrong header.
    if (document.getElementById("library-sidebar-placeholder")) return;

    loadComponent("header-placeholder", "components/header.html");
    loadComponent("footer-placeholder", "components/footer.html");
    loadComponent("sidebar-placeholder", "components/sidebar.html");
});


// ==========================================
// --- RADIAL ORB MOBILE MENU ---
// ==========================================
function createMobileOrbMenu() {
    const orbContainer = document.createElement('div');
    orbContainer.id = 'mobile-orb-menu';
    orbContainer.className = 'orb-menu';

    const links = [
        // tone: orb-item--blue / --gold / --green in components.css
        { name: 'NPCs', url: 'npc.html', icon: 'group', tone: 'blue' },
        { name: 'Story', url: 'scriptorium.html', icon: 'book', tone: 'gold' },
        { name: 'Atlas', url: 'world.html', icon: 'public', tone: 'green' }
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
        <a href="${link.url}" class="orb-item orb-item--${link.tone}" style="transform: translate(0px, 0px) scale(0.5);" data-x="${x}" data-y="${y}">
            
            <div class="orb-item__disc">
                <span class="orb-item__icon material-symbols-outlined">${link.icon}</span>
            </div>
            
            <span class="orb-item__label"
                  style="top: -10px; left: 35px; transform-origin: bottom left; transform: rotate(-15deg);">
                ${link.name}
            </span>
            
        </a>
        `;
    }).join('');

    orbContainer.innerHTML = `
        <div id="orb-items-container" class="orb-menu__items">
            ${itemsHtml}
        </div>
        <button id="main-orb-btn" class="orb-menu__button">
            <span id="main-orb-icon" class="orb-menu__icon material-symbols-outlined">explore</span>
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
            orbBtn.classList.add('is-open');

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
            orbBtn.classList.remove('is-open');

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

// ==========================================
// Generate mystical ambient dust particles
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('dust-container');
    if (!container) return; // only the library pages have the dust layer
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'dust';

        // Randomize position, size, and animation delay
        const size = Math.random() * 4 + 1;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}vw`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particle.style.animationDuration = `${Math.random() * 10 + 15}s`;

        container.appendChild(particle);
    }
});

// ==========================================
// LIBRARY SIDEBAR LOGIC
// ==========================================

function toggleLibrarySidebar() {
    const sidebarContent = document.getElementById('library-sidebar-content');
    const icon = document.getElementById('lib-sidebar-icon');
    const btn = document.getElementById('lib-sidebar-btn');

    if (!sidebarContent || !icon || !btn) return;

    // Open/closed looks: .library-sidebar__panel.is-open etc. in components.css
    const open = !sidebarContent.classList.contains('is-open');
    [sidebarContent, btn, icon].forEach(el => el.classList.toggle('is-open', open));
    icon.textContent = open ? 'close' : 'menu_open';
}

function highlightLibrarySidebar() {
    let currentFileName = window.location.pathname.split("/").pop();
    if (currentFileName === "" || currentFileName.includes("beast.html")) {
        // If on the specific beast page, highlight the bestiary
        currentFileName = "bestiary.html";
    }

    const links = document.querySelectorAll('#lib-sidebar-nav a');

    links.forEach(link => {
        const href = link.getAttribute('href');

        if (href === currentFileName) {
            // Gold, bold label (see .library-sidebar__link.is-active)
            link.classList.add('is-active');
        }
    });
}

// --- CURSOR GLOW ENGINE ---
    document.addEventListener("DOMContentLoaded", () => {
      const glowCards = document.querySelectorAll('.cursor-glow-card');

      glowCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
          // Calculate the mouse's coordinates relative to the card's top-left corner
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          // Inject those coordinates into the CSS variables
          card.style.setProperty('--mouse-x', `${x}px`);
          card.style.setProperty('--mouse-y', `${y}px`);
        });
      });
    });