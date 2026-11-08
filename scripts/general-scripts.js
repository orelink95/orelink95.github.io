function toggleModal() {
    const modal = document.getElementById('not-see-modal');
    modal.classList.toggle('hidden');
}


// The library pages brighten everything with a filter on <body> (.mystical-bg).
// A filter pins position:fixed descendants to the page instead of the screen, so a
// pop-up opened further down the page would appear off screen. liftOutOfBody()
// moves a pop-up just outside <body>; .is-lifted (components.css) gives it back the
// page's font and brightening. Does nothing on pages without that filter.
function liftOutOfBody(el) {
    if (!el || el.parentElement === document.documentElement) return;
    if (getComputedStyle(document.body).filter === 'none') return;
    el.classList.add('is-lifted');
    document.documentElement.appendChild(el);
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
            // The footer's "nothing to see here" pop-up
            else if (placeholderId === "footer-placeholder") {
                liftOutOfBody(document.getElementById('not-see-modal'));
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

    // Pages that live under another page's header entry
    const SECTION_OF = { 'heroes.html': 'npc.html', 'factions.html': 'npc.html' };
    currentFileName = SECTION_OF[currentFileName] || currentFileName;

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
// --- MOBILE ORB MENU ---
// One button (bottom-left) opening a vertical panel. It replaces, below 768px,
// the atlas sidebar and the library "wings" sidebar: the section you are in
// unfolds its own pages under its entry. Styles: components.css.
// NB: the sub-links repeat those of components/sidebar.html and
// components/library-sidebar.html (desktop). Keep the three in step.
// ==========================================
const MOBILE_NAV = [
    {
        name: 'Atlas', url: 'world.html', icon: 'public', tone: 'green',
        pages: ['world.html', 'continent.html', 'country.html', 'settlement.html', 'pois.html', 'poi.html'],
        sub: [
            { name: 'Continents', url: 'continent.html', icon: 'map' },
            { name: 'Countries', url: 'country.html', icon: 'fort' },
            { name: 'Settlements', url: 'settlement.html', icon: 'home_work' },
            { name: 'Points of Interest', url: 'pois.html', icon: 'location_on', alias: ['poi.html'] }
        ]
    },
    {
        name: 'Archive', url: 'library.html', icon: 'account_balance', tone: 'violet',
        pages: ['library.html', 'bestiary.html', 'beast.html', 'handouts.html', 'tomes.html', 'vault.html'],
        sub: [
            { name: 'Elder Tarot', url: 'bestiary.html', icon: 'temp_preferences_custom', alias: ['beast.html'] },
            { name: 'Handouts', url: 'handouts.html', icon: 'history_edu' },
            { name: 'Reference', url: 'tomes.html', icon: 'menu_book' },
            { name: 'Artifact Vault', url: 'vault.html', icon: 'diamond' },
            { name: 'Exit Archive', url: 'index.html', icon: 'door_front', exit: true }
        ]
    },
    { name: 'Story', url: 'scriptorium.html', icon: 'book', tone: 'gold', pages: ['scriptorium.html'], sub: [] },
    {
        name: 'Dramatis Personae', url: 'npc.html', icon: 'groups', tone: 'blue',
        pages: ['npc.html', 'heroes.html', 'factions.html'],
        // Same three entries as the tab bar of npc.html, heroes.html and factions.html
        sub: [
            { name: 'NPCs', url: 'npc.html', icon: 'group' },
            { name: 'Heroes', url: 'heroes.html', icon: 'local_fire_department' },
            { name: 'Factions', url: 'factions.html', icon: 'swords' }
        ]
    }
];

function createMobileOrbMenu() {
    if (document.getElementById('mobile-orb-menu')) return;

    let page = window.location.pathname.split('/').pop();
    if (page === '') page = 'index.html';

    const isHere = item => item.url === page || (item.alias || []).includes(page);
    let step = 0; // index used to stagger the entries when the panel opens

    const groupsHtml = MOBILE_NAV.map(section => {
        const inSection = section.pages.includes(page);
        const exact = section.url === page;
        const parentStep = ++step;
        const sub = inSection && section.sub.length
            ? `<div class="orb-sub">${section.sub.map(s => `
                <a href="${s.url}" class="orb-sublink${isHere(s) ? ' is-active' : ''}${s.exit ? ' orb-sublink--exit' : ''}"
                   style="--i:${++step}"${isHere(s) ? ' aria-current="page"' : ''}>
                    <span class="orb-sublink__icon material-symbols-outlined">${s.icon}</span>
                    <span class="orb-sublink__label">${s.name}</span>
                </a>`).join('')}</div>`
            : '';
        const html = `
            <div class="orb-group orb-tone--${section.tone}${inSection ? ' is-current' : ''}">
                <a href="${section.url}" class="orb-link${exact ? ' is-active' : ''}"
                   style="--i:${parentStep}"${exact ? ' aria-current="page"' : ''}>
                    <span class="orb-link__disc"><span class="orb-link__icon material-symbols-outlined">${section.icon}</span></span>
                    <span class="orb-link__label">${section.name}</span>
                </a>
                ${sub}
            </div>`;
        return html;
    }).join('');

    const menu = document.createElement('div');
    menu.id = 'mobile-orb-menu';
    menu.className = 'orb-menu';
    menu.innerHTML = `
        <div class="orb-menu__backdrop"></div>
        <nav id="orb-panel" class="orb-panel" aria-label="Site navigation" inert>
            ${groupsHtml}
        </nav>
        <button id="main-orb-btn" class="orb-menu__button" type="button"
                aria-label="Open navigation menu" aria-expanded="false" aria-controls="orb-panel">
            <span id="main-orb-icon" class="orb-menu__icon material-symbols-outlined">explore</span>
        </button>
    `;
    document.body.appendChild(menu);
    // The library pages filter <body>, which would pin this to the page, not the screen
    liftOutOfBody(menu);

    const btn = menu.querySelector('#main-orb-btn');
    const icon = menu.querySelector('#main-orb-icon');
    const panel = menu.querySelector('#orb-panel');

    function setOpen(open) {
        menu.classList.toggle('is-open', open);
        btn.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        icon.textContent = open ? 'close' : 'explore';
        panel.toggleAttribute('inert', !open);
    }

    btn.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
    menu.querySelector('.orb-menu__backdrop').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) {
            setOpen(false);
            btn.focus();
        }
    });
    // Coming back with the browser's back button must not show the panel open
    window.addEventListener('pageshow', () => setOpen(false));
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