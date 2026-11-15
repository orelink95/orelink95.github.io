/* =====================================================================
   ATLAS COMMON  —  shared by every Atlas page:
   world.html, continent.html, country.html, settlement.html (map pages)
   continents.html, countries.html, settlements.html, pois.html (lists)
   ---------------------------------------------------------------------
   Load it after scripts/core/store.js. It gives the pages one way to:
     - name each kind of place (LABELS: rename here, the whole Atlas follows)
     - find the list page of a type (INDEX)
     - send an entry page opened without a valid ?id= to its list page
     - draw the Atlas trail, set up a map, place a labelled pin, build a popup
     - drive the lore panel (Overview button, reset on an empty-map click)
   Pages still choose their own pin look (gold world, green continent...).
   ===================================================================== */
(function (root) {

    // -----------------------------------------------------------------
    // 1. NAMES SHOWN TO PLAYERS
    // -----------------------------------------------------------------
    // one / many: titles and filters. cta: the button in a map popup.
    // icon: Material Symbol used in the trail's menus and on the list cards.
    const LABELS = {
        continent:  { one: 'Continent',         many: 'Continents',        cta: 'Explore the continent',  icon: 'map' },
        country:    { one: 'Country',           many: 'Countries',         cta: 'Explore the country',    icon: 'fort' },
        settlement: { one: 'Settlement',        many: 'Settlements',       cta: 'Explore the settlement', icon: 'home_work' },
        district:   { one: 'District',          many: 'Districts',         cta: 'Explore the district',   icon: 'holiday_village' },
        poi:        { one: 'Point of Interest', many: 'Points of Interest', cta: 'Open the entry',        icon: 'location_on' },
    };

    // The list page of each type. Entry pages opened without ?id= land here.
    const INDEX = {
        continent: 'continents.html',
        country: 'countries.html',
        settlement: 'settlements.html',
        poi: 'pois.html',
    };

    // Button label for a record: institutions, taverns, shops and temples get their own.
    function cta(store, rec) {
        const type = store.typeOf(rec);
        if (type === 'poi' && rec.institution && rec.institution.kind) {
            const kind = store.enumOptions('institutionKind').find(k => k.id === rec.institution.kind);
            return (kind && kind.cta) || 'Visit the place';
        }
        if (type === 'poi' && rec.tavern && rec.tavern.tier) return 'Enter the tavern';
        if (type === 'poi' && rec.shop && rec.shop.kind) return 'Enter the shop';
        if (type === 'poi' && rec.alchemist) return 'Enter the laboratory';
        if (type === 'poi' && rec.temple) return 'Enter the temple';
        if (type === 'poi' && rec.divination && (rec.divination.practices || []).length) return 'Consult the seer';
        return (LABELS[type] || LABELS.poi).cta;
    }

    // -----------------------------------------------------------------
    // 2. ENTRY PAGES WITHOUT A VALID ?id=
    // -----------------------------------------------------------------
    // continent.html, country.html and settlement.html need an id. Without one
    // (or with an id of another type) the player is sent to the list page.
    // Returns the record, or null while the browser is leaving the page.
    function requireEntry(store, type) {
        const id = new URLSearchParams(window.location.search).get('id');
        const rec = id ? store.get(id) : null;
        if (rec && store.typeOf(rec) === type) return rec;
        window.location.replace(INDEX[type]);
        return null;
    }

    // -----------------------------------------------------------------
    // 3. THE TRAIL  (replaces the old sidebar and breadcrumbs)
    // -----------------------------------------------------------------
    //   Atlas ▾ › <continent> ▾ › <country> ▾ › <settlement> ▾ › <place> ▾
    //   trail(store, el)                    -> world page:  Atlas ▾ › <world name>
    //   trail(store, el, rec)               -> Atlas ▾, the places above rec, then rec
    //   trail(store, el, null, 'Countries') -> a list page: Atlas ▾ › Countries
    // "Atlas ▾" lists the Atlas pages (SITE_NAV in scripts/general-scripts.js).
    // A place's ▾ lists the places of the same type under the same parent.
    // Districts have no page and are skipped: the POIs of a settlement are
    // siblings whatever their district. Unlisted countries stay out of the
    // menus, as on the Countries page. Long lists (over 12) get a filter box.
    // Styles: .trail in styles/components.css.
    const esc = v => String(v == null ? '' : v)
        .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const FILTER_FROM = 13;
    // Alphabetical, "The Alabaster Palace" under A
    const sortKey = r => String(r.name || '').replace(/^the\s+/i, '');
    let trailCount = 0;

    function trail(store, el, rec, currentLabel) {
        if (!el) return;
        const page = window.location.pathname.split('/').pop() || 'index.html';
        const uid = `atlas-trail-${++trailCount}`;
        const caretIcon = '<span class="trail__caret-icon material-symbols-outlined" aria-hidden="true">expand_more</span>';
        const icon = name => `<span class="trail__item-icon material-symbols-outlined" aria-hidden="true">${name}</span>`;

        // The place a record hangs under in the trail: its nearest ancestor that is not a district
        const trailParent = r => {
            const up = store.ancestors(r).filter(p => store.typeOf(p) !== 'district');
            return up.length ? up[up.length - 1].id : null;
        };

        const menu = (id, head, items) => {
            const filter = items.length >= FILTER_FROM;
            return `
            <div class="trail__menu" id="${id}" hidden>
                <div class="trail__menu-head">${esc(head)}</div>
                ${filter ? `<input class="trail__filter" type="search" placeholder="Filter by name" aria-label="Filter: ${esc(head)}" autocomplete="off">` : ''}
                <ul class="trail__items">${items.map(it => `
                    <li><a class="trail__item${it.current ? ' is-current' : ''}" href="${esc(it.href)}"${it.current ? ' aria-current="page"' : ''} data-name="${esc(String(it.label).toLowerCase())}">
                        ${icon(it.icon)}<span class="trail__item-label">${esc(it.label)}</span>${it.current ? '<span class="trail__item-check material-symbols-outlined" aria-hidden="true">check</span>' : ''}
                    </a></li>`).join('')}
                </ul>
                ${filter ? '<p class="trail__none" hidden>No place by that name.</p>' : ''}
            </div>`;
        };

        // 1. "Atlas ▾": the Atlas pages
        const atlasNav = typeof SITE_NAV !== 'undefined' ? SITE_NAV.find(s => s.id === 'atlas') : null;
        const atlasPages = atlasNav ? atlasNav.sub
            : [{ name: 'World Map', url: 'world.html', icon: 'public' }]
                .concat(Object.keys(INDEX).map(t => ({ name: LABELS[t].many, url: INDEX[t], icon: LABELS[t].icon })));
        const steps = [`
            <li class="trail__step trail__step--atlas">
                <button type="button" class="trail__atlas" aria-expanded="false" aria-controls="${uid}-atlas" aria-label="Atlas pages">
                    <span class="trail__atlas-icon material-symbols-outlined" aria-hidden="true">public</span><span class="trail__atlas-label">Atlas</span>${caretIcon}
                </button>
                ${menu(`${uid}-atlas`, 'The Atlas', atlasPages.map(e => ({ href: e.url, label: e.name, icon: e.icon, current: e.url === page })))}
            </li>`];

        // 2. The world page and the list pages: one step
        if (!rec) {
            const worldName = (store.world && store.world.name) || 'Eraldom';
            steps.push(`<li class="trail__step"><span class="trail__current" aria-current="page">${esc(currentLabel || worldName)}</span></li>`);
        }

        // 3. A place: the places above it, then itself, each with its siblings
        const places = rec
            ? store.ancestors(rec).filter(p => store.typeOf(p) !== 'district').concat([rec])
            : [];
        places.forEach((p, i) => {
            const fromEnd = places.length - 1 - i;            // 0 = this page, 1 = its parent
            const where = fromEnd === 0 ? '' : fromEnd === 1 ? ' trail__step--parent' : ' trail__step--far';
            const type = store.typeOf(p);
            const label = LABELS[type] || LABELS.poi;
            const parentId = trailParent(p);
            const siblings = store.all(type)
                .filter(r => r === p || (trailParent(r) === parentId && store.url(r) && !(type === 'country' && r.unlisted)))
                .sort((x, y) => sortKey(x).localeCompare(sortKey(y)));

            const text = p === rec
                ? `<span class="trail__current" aria-current="page">${esc(p.name)}</span>`
                : `<a class="trail__link" href="${esc(store.url(p))}">${esc(p.shortName || p.name)}</a>`;
            let caret = '';
            if (siblings.length > 1) {
                const up = parentId ? store.get(parentId) : null;
                const head = up ? `${label.many} in ${up.shortName || up.name}` : label.many;
                const id = `${uid}-${i}`;
                caret = `<button type="button" class="trail__caret" aria-expanded="false" aria-controls="${id}" aria-label="${esc(head)}" title="${esc(head)}">${caretIcon}</button>`
                    + menu(id, head, siblings.map(sb => ({ href: store.url(sb), label: sb.name, icon: label.icon, current: sb === p })));
            }
            steps.push(`<li class="trail__step${where}">${text}${caret}</li>`);
        });

        el.classList.add('trail');
        el.setAttribute('aria-label', 'Atlas trail');
        el.innerHTML = `<ol class="trail__list">${steps.join('')}</ol>`;
        wireTrail(el);
    }

    // Opening, closing and the keyboard for the trail's drop-downs.
    // The menus are moved to the end of <body> and placed under their button
    // (position: fixed), so no part of the page (a map, the district picker…)
    // can cover them.
    function wireTrail(el) {
        const buttons = [...el.querySelectorAll('.trail__atlas, .trail__caret')];
        const menus = [...el.querySelectorAll('.trail__menu')];
        menus.forEach(m => document.body.appendChild(m));
        const menuOf = b => document.getElementById(b.getAttribute('aria-controls'));
        const inside = node => !!node && (el.contains(node) || menus.some(m => m.contains(node)));
        const openButton = () => buttons.find(b => b.getAttribute('aria-expanded') === 'true');
        const visibleItems = m => [...m.querySelectorAll('.trail__item')].filter(a => !a.parentElement.hidden);
        const HEADER = 64;   // the fixed site header

        // Under its step (the place's name and its ▾), kept inside the screen
        function place(b, m) {
            const r = b.getBoundingClientRect();
            const left = b.closest('.trail__step').getBoundingClientRect().left;
            const viewport = document.documentElement.clientWidth;
            m.style.top = `${r.bottom + 6}px`;
            m.style.left = `${Math.max(8, Math.min(left, viewport - m.offsetWidth - 8))}px`;
        }

        function close(focusBack) {
            const b = openButton();
            if (!b) return;
            b.setAttribute('aria-expanded', 'false');
            menuOf(b).hidden = true;
            if (focusBack) b.focus({ preventScroll: true });
        }

        function open(b, focusInside) {
            close(false);
            const m = menuOf(b);
            // The page's accent (a POI's look) follows the menu out of the trail
            m.style.setProperty('--trail-accent', getComputedStyle(el).getPropertyValue('--trail-accent'));
            b.setAttribute('aria-expanded', 'true');
            m.hidden = false;
            place(b, m);
            // Scroll the list to the current place
            const list = m.querySelector('.trail__items');
            const current = m.querySelector('.trail__item.is-current');
            if (current) list.scrollTop = current.parentElement.offsetTop - list.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2;
            if (focusInside) {
                const target = m.querySelector('.trail__filter') || current || visibleItems(m)[0];
                if (target) target.focus({ preventScroll: true });
            }
        }

        buttons.forEach(b => {
            // e.detail is 0 for a click made with Enter or Space: then move the focus in
            b.addEventListener('click', e => (b.getAttribute('aria-expanded') === 'true' ? close(false) : open(b, e.detail === 0)));
            b.addEventListener('keydown', e => {
                if (e.key === 'ArrowDown') { e.preventDefault(); open(b, true); }
            });
        });

        menus.forEach(m => {
            const filter = m.querySelector('.trail__filter');
            if (filter) {
                filter.addEventListener('input', () => {
                    const q = filter.value.trim().toLowerCase();
                    let shown = 0;
                    m.querySelectorAll('.trail__item').forEach(a => {
                        const hit = !q || a.dataset.name.includes(q);
                        a.parentElement.hidden = !hit;
                        if (hit) shown++;
                    });
                    m.querySelector('.trail__none').hidden = shown > 0;
                });
                // Enter in the filter box opens the first place left
                filter.addEventListener('keydown', e => {
                    if (e.key !== 'Enter') return;
                    const first = visibleItems(m)[0];
                    if (first) { e.preventDefault(); first.click(); }
                });
            }
            // Up / Down move through the filter box and the places
            m.addEventListener('keydown', e => {
                if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
                e.preventDefault();
                const stops = (filter ? [filter] : []).concat(visibleItems(m));
                const at = stops.indexOf(document.activeElement);
                const next = stops[(at + (e.key === 'ArrowDown' ? 1 : -1) + stops.length) % stops.length];
                if (next) next.focus();
            });
            m.addEventListener('focusout', e => { if (e.relatedTarget && !inside(e.relatedTarget)) close(false); });
        });

        // Escape, a click elsewhere, the focus leaving the trail
        el.addEventListener('keydown', e => {
            if (e.key === 'Escape' && openButton()) { e.stopPropagation(); close(true); }
        });
        el.addEventListener('focusout', e => { if (e.relatedTarget && !inside(e.relatedTarget)) close(false); });
        document.addEventListener('click', e => { if (!inside(e.target)) close(false); });
        // The menu follows its button; once the button slides under the header, it closes
        const follow = () => {
            const b = openButton();
            if (!b) return;
            if (b.getBoundingClientRect().top < HEADER) close(false);
            else place(b, menuOf(b));
        };
        window.addEventListener('scroll', follow, { passive: true });
        window.addEventListener('resize', follow);
        // Back to this page with the browser's back button: nothing open
        window.addEventListener('pageshow', () => close(false));
    }

    // -----------------------------------------------------------------
    // 4. MAPS
    // -----------------------------------------------------------------
    // A flat image map (L.CRS.Simple), zoom buttons bottom-right on every page.
    // Any other Leaflet option can be passed too (zoomSnap…).
    function createMap(elementId, { minZoom = -1, maxZoom = 2, ...more } = {}) {
        const map = L.map(elementId, {
            ...more,
            crs: L.CRS.Simple,
            minZoom, maxZoom,
            zoomControl: false,       // added back below, always in the same corner
            attributionControl: false
        });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        return map;
    }

    // Puts a map image on the map (replacing `previous` if given) and fits it.
    // image = { src, width, height } as in the data files. Returns the overlay.
    function showImage(map, image, previous) {
        if (previous) map.removeLayer(previous);
        const bounds = [[0, 0], [image.height, image.width]];
        const overlay = L.imageOverlay(image.src, bounds).addTo(map);
        map.fitBounds(bounds);
        return overlay;
    }

    // A pin with a name: shown as a tooltip on hover, read by screen readers,
    // reachable with Tab and opened with Enter (Leaflet's keyboard support).
    function pin({ y, x, icon, name, popupHtml, onClick }) {
        const marker = L.marker(L.latLng(y, x), { icon, title: name, keyboard: true, riseOnHover: true });
        if (popupHtml) marker.bindPopup(popupHtml, { className: 'fantasy-popup' });
        marker.on('add', () => {
            const el = marker.getElement();
            if (!el) return;
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', name);
        });
        if (onClick) {
            marker.on('click', onClick);
            // Leaflet's Enter only opens the popup: run onClick too (lore panel)
            marker.on('keypress', e => { if (e.originalEvent.key === 'Enter') onClick(e); });
        }
        return marker;
    }

    // Popup content. `hasLore` adds a "Read the lore" button, shown only on
    // narrow screens where the lore panel sits under the map (see atlas-style.css).
    function popup({ title, subtitle, danger, url, cta, hasLore = true }) {
        return `
            <div class="map-popup">
                <b class="map-popup__title${danger ? ' map-popup__title--danger' : ''}">${title}</b>
                ${subtitle ? `<span class="map-popup__subtitle">${subtitle}</span>` : ''}
                ${url ? `<a href="${url}" class="map-popup__button">${cta}</a>` : ''}
                ${hasLore ? '<button type="button" class="map-popup__lore" data-atlas-lore>Read the lore</button>' : ''}
            </div>`;
    }

    // "Read the lore" (popup, narrow screens): scroll down to the lore panel.
    document.addEventListener('click', e => {
        if (!e.target.closest('[data-atlas-lore]')) return;
        const panel = document.querySelector('.lore-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Small pin icon used on the country and settlement maps (white disc, red if dangerous).
    // The world and continent pages keep their own larger gold / green pins.
    function regionIcon(iconName, isDanger = false) {
        const tone = isDanger ? 'region-pin--danger' : '';
        return L.divIcon({
            className: 'map-pin-shell',   // no Leaflet white square behind the pin
            html: `
                <div class="region-pin ${tone}">
                    <div class="region-pin__shine"></div>
                    <img src="./images/atlas_icons/${iconName}.svg" alt=""
                         class="region-pin__icon${isDanger ? ' region-pin__icon--danger' : ''}" />
                </div>`,
            iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16]
        });
    }

    // -----------------------------------------------------------------
    // 5. LORE PANEL
    // -----------------------------------------------------------------
    // Expects #lore-entry-id, #lore-title, #lore-body and (optional) #reset-lore-btn.
    // A "view" is { entry, title, body }. The base view is the page's overview:
    // the Overview button is hidden while it is shown, and brings it back.
    //   const panel = Atlas.lorePanel(base);
    //   panel.show(view)      panel.reset()      panel.setBase(view)
    //   panel.onReset = fn    (called when the Overview button is pressed)
    function lorePanel(base) {
        const $ = id => document.getElementById(id);
        const resetBtn = $('reset-lore-btn');
        const scroller = document.querySelector('.lore-panel__scroll');

        const panel = {
            onReset: null,
            show(view) {
                $('lore-entry-id').textContent = view.entry || 'Codex Entry';
                $('lore-title').textContent = view.title || '';
                $('lore-body').innerHTML = view.body || '<p class="lore-panel__empty">No archival records found.</p>';
                if (scroller) scroller.scrollTop = 0;
                if (resetBtn) resetBtn.classList.toggle('hidden', view === base);
            },
            reset() { panel.show(base); },
            setBase(view) { base = view; panel.show(view); },
        };

        if (resetBtn) resetBtn.addEventListener('click', () => {
            panel.reset();
            if (panel.onReset) panel.onReset();
        });

        panel.show(base);
        return panel;
    }

    // Spotlight that follows the mouse on .lore-card panels.
    function glow() {
        document.querySelectorAll('.lore-card').forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
                card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
            });
        });
    }

    root.Atlas = { LABELS, INDEX, cta, requireEntry, trail, createMap, showImage, pin, popup, regionIcon, lorePanel, glow };

})(typeof window !== 'undefined' ? window : globalThis);
