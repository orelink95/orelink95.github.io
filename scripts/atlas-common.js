/* =====================================================================
   ATLAS COMMON  —  shared by every Atlas page:
   world.html, continent.html, country.html, settlement.html (map pages)
   continents.html, countries.html, settlements.html, pois.html (lists)
   ---------------------------------------------------------------------
   Load it after scripts/core/store.js. It gives the pages one way to:
     - name each kind of place (LABELS: rename here, the whole Atlas follows)
     - find the list page of a type (INDEX)
     - send an entry page opened without a valid ?id= to its list page
     - show where a place is and its neighbours, set up a map, place a
       labelled pin, build a popup
     - drive the lore panel (Overview button, reset on an empty-map click)
   Pages still choose their own pin look (gold world, green continent...).
   ===================================================================== */
(function (root) {

    // -----------------------------------------------------------------
    // 1. NAMES SHOWN TO PLAYERS
    // -----------------------------------------------------------------
    // one / many: titles and filters. cta: the button in a map popup.
    // icon: Material Symbol used in the tab bar and on the list cards.
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
    // 3. WHERE A PLACE IS, AND WHAT IS NEXT TO IT
    // -----------------------------------------------------------------
    // The Atlas pages themselves are one click away in the tab bar under the
    // header (SITE_NAV in scripts/general-scripts.js). A place's page adds:
    //   placeLine(store, el, rec) -> the line above its heading:
    //       "Settlement · Eperina, Maltona" (nearest place first, as links;
    //       a POI's district has no page and shows as plain text)
    //   elsewhere(store, el, rec) -> at the end of the page, the places of the
    //       same type under the same parent, as cards: "Elsewhere in Brightend"
    //       ("Other continents" at the top). Districts don't count as parents:
    //       the POIs of a settlement are neighbours whatever their district.
    //       Unlisted countries stay out, as on the Countries page.
    // Styles: .place-line and .elsewhere in styles/components.css.
    const esc = v => String(v == null ? '' : v)
        .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Alphabetical, "The Alabaster Palace" under A
    const sortKey = r => String(r.name || '').replace(/^the\s+/i, '');

    // The place a record belongs to: its nearest ancestor that is not a district
    function placeParent(store, rec) {
        const up = store.ancestors(rec).filter(p => store.typeOf(p) !== 'district');
        return up.length ? up[up.length - 1] : null;
    }

    function placeLine(store, el, rec) {
        if (!el || !rec) return;
        const type = store.typeOf(rec);
        const label = (LABELS[type] || LABELS.poi).one;
        const parts = store.ancestors(rec).slice().reverse().map(p => {
            const url = store.typeOf(p) === 'district' ? null : store.url(p);
            const name = esc(p.shortName || p.name);
            return url ? `<a class="place-line__link" href="${esc(url)}">${name}</a>` : `<span>${name}</span>`;
        });
        // A continent sits in nothing: no line
        if (!parts.length) { el.hidden = true; return; }
        el.classList.add('place-line');
        el.innerHTML = `<span class="place-line__type">${esc(label)}</span>`
            + `<span class="place-line__sep" aria-hidden="true">·</span><span class="place-line__where">${parts.join(', ')}</span>`;
        el.hidden = false;
    }

    function elsewhere(store, el, rec) {
        if (!el || !rec) return;
        const type = store.typeOf(rec);
        const label = LABELS[type] || LABELS.poi;
        const parent = placeParent(store, rec);
        const pid = parent ? parent.id : null;
        const sameParent = r => { const p = placeParent(store, r); return (p ? p.id : null) === pid; };
        const others = store.all(type)
            .filter(r => r !== rec && store.url(r) && !(type === 'country' && r.unlisted) && sameParent(r))
            .sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
        if (!others.length) { el.hidden = true; return; }

        const picture = r => {
            const districtMap = type === 'settlement'
                ? (store.children(r, 'district').find(d => d.mapImage && d.mapImage.src) || {}).mapImage
                : null;
            return r.image || (r.mapImage && r.mapImage.src) || (districtMap && districtMap.src) || 'images/pois/placeholder.png';
        };
        const title = parent ? `Elsewhere in ${parent.shortName || parent.name}` : `Other ${label.many.toLowerCase()}`;
        el.classList.add('elsewhere');
        el.setAttribute('aria-label', title);
        el.innerHTML = `
            <header class="elsewhere__head">
                <h2 class="elsewhere__title">${esc(title)}</h2>
                ${INDEX[type] ? `<a class="elsewhere__all" href="${INDEX[type]}">All ${esc(label.many.toLowerCase())}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>` : ''}
            </header>
            <ul class="elsewhere__grid">${others.map(r => `
                <li><a class="elsewhere-card${r.danger ? ' is-danger' : ''}" href="${esc(store.url(r))}">
                    <span class="elsewhere-card__img"><img src="${esc(picture(r))}" alt="" loading="lazy"></span>
                    <span class="elsewhere-card__text">
                        <span class="elsewhere-card__name">${esc(r.name)}</span>
                        <span class="elsewhere-card__line">${esc(String(r.subtitle || r.typeLabel || label.one).trim())}</span>
                    </span>
                </a></li>`).join('')}
            </ul>`;
        el.hidden = false;
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

    root.Atlas = { LABELS, INDEX, cta, requireEntry, placeLine, elsewhere, createMap, showImage, pin, popup, regionIcon, lorePanel, glow };

})(typeof window !== 'undefined' ? window : globalThis);
