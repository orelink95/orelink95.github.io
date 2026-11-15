// The site's root, from this script's own address: the header, footer and menus
// load and link from it, so they work from a page in a sub-folder too
// (admin_tools/potion-maker.html)
const SITE_ROOT = (document.currentScript && document.currentScript.src || '')
    .replace(/scripts\/general-scripts\.js(\?.*)?$/, '');

// The footer's pop-ups (components/footer.html, library-footer.html):
// 'not-see-modal' ("Nothing to see here") and 'guild-modal' (The Scribe's
// Guild, the way to the sigil maker and the potion maker). Escape closes them.
let modalOpener = null;
function toggleModal(id = 'not-see-modal') {
    const modal = document.getElementById(id);
    if (!modal) return;
    const opening = modal.classList.contains('hidden');
    modal.classList.toggle('hidden', !opening);
    if (opening) {
        modalOpener = document.activeElement;
        const first = modal.querySelector('a, button');
        if (first) first.focus({ preventScroll: true });
    } else if (modalOpener) {
        modalOpener.focus({ preventScroll: true });
        modalOpener = null;
    }
}
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['guild-modal', 'not-see-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m && !m.classList.contains('hidden')) toggleModal(id);
    });
});


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

// The components' links are written from the site's root ("world.html"). On a
// page in a sub-folder they would point inside it: rewrite them from SITE_ROOT.
function rebaseLinks(container) {
    const pageDir = window.location.href.replace(/[^/]*([?#].*)?$/, '');
    if (!SITE_ROOT || pageDir === SITE_ROOT) return;
    container.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (/^([a-z]+:|#|\/)/i.test(href)) return;   // absolute, anchor or from the domain root
        a.setAttribute('href', SITE_ROOT + href);
    });
}

// Function to fetch and inject HTML
function loadComponent(placeholderId, componentPath) {
    const placeholder = document.getElementById(placeholderId);

    if (!placeholder) return;

    fetch(SITE_ROOT + componentPath)
        .then(response => {
            if (!response.ok) throw new Error(`Could not load ${componentPath}`);
            return response.text();
        })
        .then(htmlData => {
            // Inject the HTML
            placeholder.innerHTML = htmlData;
            rebaseLinks(placeholder);

            // If the component we just injected is the header, run the header highlight function
            if (placeholderId === "header-placeholder") {
                highlightActiveLink();
            }
            // The footer's "nothing to see here" pop-up
            else if (placeholderId === "footer-placeholder") {
                liftOutOfBody(document.getElementById('not-see-modal'));
                liftOutOfBody(document.getElementById('guild-modal'));
            }
        })
        .catch(error => console.error(error));
}



// ==========================================
// --- SITE NAVIGATION: ONE LIST FOR EVERY MENU ---
// The header highlight, the mobile orb menu, the Atlas trail's "Atlas" menu
// (scripts/atlas-common.js) and the Black Archive tab bar all read SITE_NAV.
// Add or rename a page here and every menu follows.
//   url   : the page a section or entry opens
//   alias : other pages that belong to that entry (a record page under its list)
// The two headers (components/header.html, library-header.html) keep their own
// markup for their looks, but their links must point to the sections' url.
// ==========================================
const SITE_NAV = [
    {
        id: 'atlas', name: 'Grand Atlas', url: 'world.html', icon: 'public', tone: 'green',
        sub: [
            { name: 'World Map', url: 'world.html', icon: 'public' },
            { name: 'Continents', url: 'continents.html', icon: 'map', alias: ['continent.html'] },
            { name: 'Countries', url: 'countries.html', icon: 'fort', alias: ['country.html'] },
            { name: 'Settlements', url: 'settlements.html', icon: 'home_work', alias: ['settlement.html'] },
            { name: 'Points of Interest', url: 'pois.html', icon: 'location_on', alias: ['poi.html'] }
        ]
    },
    {
        id: 'archive', name: 'Black Archive', url: 'library.html', icon: 'library_books', tone: 'violet',
        // Also the tab bar of the Archive pages (library.html has its cards instead)
        sub: [
            { name: 'Elder Tarot', url: 'bestiary.html', icon: 'temp_preferences_custom', alias: ['beast.html'] },
            { name: 'Handouts', url: 'handouts.html', icon: 'history_edu' },
            { name: 'Reference', url: 'tomes.html', icon: 'menu_book' },
            { name: 'Artifact Vault', url: 'vault.html', icon: 'diamond' },
            { name: 'Book of Shadows', url: 'spellbook.html', icon: 'auto_fix_high' },
            { name: 'The Pantheon', url: 'pantheon.html', icon: 'brightness_7', alias: ['deity.html'] }
        ]
    },
    { id: 'scriptorium', name: 'Scriptorium', url: 'scriptorium.html', icon: 'history_edu', tone: 'gold', sub: [] },
    {
        id: 'personae', name: 'Dramatis Personae', url: 'npc.html', icon: 'groups', tone: 'blue',
        // Same three entries as the tab bar of npc.html, heroes.html and factions.html
        sub: [
            { name: 'NPCs', url: 'npc.html', icon: 'group' },
            { name: 'Heroes', url: 'heroes.html', icon: 'local_fire_department' },
            { name: 'Factions', url: 'factions.html', icon: 'swords' }
        ]
    }
];

// The file name of the page being shown ('index.html' at the site root)
function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
}
// Is this page the entry itself, or one of its alias pages?
function navEntryHolds(entry, page) {
    return entry.url === page || (entry.alias || []).includes(page);
}
// The section a page belongs to (its own url, an entry or an alias), or null
function navSectionOf(page) {
    return SITE_NAV.find(s => s.url === page || s.sub.some(e => navEntryHolds(e, page))) || null;
}

// Header: the section of the page glows gold (.site-header__link.is-active,
// .library-header__link.is-active), on its sub-pages too
function highlightActiveLink() {
    const section = navSectionOf(currentPage());
    if (!section) return;
    document.querySelectorAll('#header-placeholder a.nav-item').forEach(link => {
        if (link.getAttribute('href').split('/').pop() === section.url) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'true');
        }
    });
}

// ==========================================
// --- BLACK ARCHIVE TAB BAR ---
// <nav id="archive-tabs" class="archive-tabs"> right under the header of each
// Archive page (not library.html, whose cards already lead everywhere).
// Filled from SITE_NAV; styles: components.css (.archive-tabs).
// ==========================================
function renderArchiveTabs() {
    const bar = document.getElementById('archive-tabs');
    if (!bar || bar.children.length) return;
    const page = currentPage();
    const archive = SITE_NAV.find(s => s.id === 'archive');
    bar.setAttribute('aria-label', archive.name);
    bar.innerHTML = `<div class="archive-tabs__track">${archive.sub.map(e => {
        const here = navEntryHolds(e, page);
        return `<a href="${e.url}" class="archive-tab${here ? ' is-active' : ''}"${here ? ' aria-current="page"' : ''}>
                <span class="archive-tab__icon material-symbols-outlined" aria-hidden="true">${e.icon}</span>${e.name}</a>`;
    }).join('')}</div>`;
    // On a phone the row scrolls sideways: bring the current tab into view
    const active = bar.querySelector('.archive-tab.is-active');
    if (active) {
        const track = bar.firstElementChild;
        track.scrollLeft = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
    }
}

// Start the fetch process when the page loads
document.addEventListener("DOMContentLoaded", () => {
    renderArchiveTabs();

    // Archive pages (<body data-section="archive">) load their own header and
    // footer variants; skip the defaults there to avoid a double fetch and a
    // flash of the wrong header.
    if (document.body.dataset.section === 'archive') {
        loadComponent("header-placeholder", "components/library-header.html");
        loadComponent("footer-placeholder", "components/library-footer.html");
        return;
    }
    loadComponent("header-placeholder", "components/header.html");
    loadComponent("footer-placeholder", "components/footer.html");
});


// ==========================================
// --- MOBILE ORB MENU ---
// One button (bottom-left) opening a vertical panel, below 768px. The section
// you are in unfolds its own pages under its entry. Entries: SITE_NAV above.
// Styles: components.css.
// ==========================================
function createMobileOrbMenu() {
    if (document.getElementById('mobile-orb-menu')) return;

    const page = currentPage();
    const here = navSectionOf(page);
    const isHere = item => navEntryHolds(item, page);
    let step = 0; // index used to stagger the entries when the panel opens

    const groupsHtml = SITE_NAV.map(section => {
        const inSection = section === here;
        const exact = section.url === page;
        const parentStep = ++step;
        const sub = inSection && section.sub.length
            ? `<div class="orb-sub">${section.sub.map(s => `
                <a href="${SITE_ROOT}${s.url}" class="orb-sublink${isHere(s) ? ' is-active' : ''}"
                   style="--i:${++step}"${isHere(s) ? ' aria-current="page"' : ''}>
                    <span class="orb-sublink__icon material-symbols-outlined">${s.icon}</span>
                    <span class="orb-sublink__label">${s.name}</span>
                </a>`).join('')}</div>`
            : '';
        const html = `
            <div class="orb-group orb-tone--${section.tone}${inSection ? ' is-current' : ''}">
                <a href="${SITE_ROOT}${section.url}" class="orb-link${exact ? ' is-active' : ''}"
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