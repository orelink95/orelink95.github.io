/* =====================================================================
   THE SCRIPTORIUM — THE JOURNEY (the "Journey" tab of scriptorium.html)
   The places a campaign's sessions visited, on the maps of the world.

   - A stop is a place listed in a session (session.places). A place is drawn
     where it, or the nearest place above it, is pinned on a map (`map` on
     its parent's mapImage); an area listed with places inside it in the same
     session (a district with its shops) is not a stop of its own.
   - Stops are numbered in the order the party first reached them, and the
     dotted line joins them in that order (a session's own order when one
     session is followed).
   - The map shown first is the smallest one that holds every stop. On a
     wider map, the stops inside a smaller place gather on its pin; a click
     zooms into it. The trail above the map goes back up.
   - Pins count y from the bottom of the picture, as the atlas does
     (Leaflet's flat maps: scripts/atlas-common.js).
   - Places with no pin anywhere (session.otherPlaces, places off every map)
     are listed under "Off the map".
   Used by scripts/scriptorium-scripts.js: Athenaeum.journey(…).
   Styles: styles/pages/scriptorium.css (.jr-…)
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    /* el: the tab's <section>; roman: number -> "IV";
       esc: HTML escaping; recLink: a link with its preview card */
    ATH.journey = function ({ store, el, roman, esc, recLink }) {
        const WORLD = Object.assign({ id: 'world', name: 'Eraldom' }, store.world || {});
        const types = (store.schema && store.schema.types) || {};

        /* ---------- the maps ---------- */
        const hasMap = r => !!(r && r.mapImage && r.mapImage.src && r.mapImage.width && r.mapImage.height);
        function parentOf(r) {
            if (!r || r === WORLD) return null;
            if (r.parent) return store.get(r.parent) || null;
            const def = types[store.typeOf(r)];
            return def && def.place && def.parent && def.parent.length === 0 ? WORLD : null;
        }
        // The record itself, then every place above it, up to the world
        function chainOf(r) {
            const out = [], seen = new Set();
            for (let x = r; x && !seen.has(x.id); x = parentOf(x)) { seen.add(x.id); out.push(x); }
            return out;
        }
        // Where a place is drawn: it, or the first place above it, pinned on its parent's map
        function anchorOf(rec) {
            for (let r = rec; r; r = parentOf(r)) {
                const host = parentOf(r);
                if (r.map && r.map.x != null && r.map.y != null && hasMap(host)) return { pin: r, host };
            }
            return null;
        }
        // The smallest map that holds all these stops
        function commonMap(stops) {
            if (!stops.length) return null;
            const chains = stops.map(s => chainOf(s.host));
            const shared = chains[0].find(r => chains.every(c => c.includes(r)));
            for (let r = shared; r; r = parentOf(r)) if (hasMap(r)) return r;
            return null;
        }

        /* ---------- state ---------- */
        let sessions = [];          // oldest first
        let stops = [];             // { n, rec, pin, host, sessions: [s] }
        let routes = new Map();     // session id -> its stops, in order
        let offMap = [];            // { name, rec, sessions }
        let current = null;         // the map shown
        let follow = null;          // the session followed, or null
        let selected = null;        // a marker key
        let chooser = null;         // { name, maps: [record] } when a place holds several maps

        function load(campaignSessions) {
            sessions = [...campaignSessions].reverse();
            const byId = new Map(), off = new Map();
            routes = new Map();
            for (const s of sessions) {
                const places = (s.places || []).map(id => store.get(id)).filter(Boolean);
                // An area listed with places inside it is not a stop of its own
                const inner = places.filter(p => !places.some(q => q !== p && chainOf(q).slice(1).includes(p)));
                const route = [];
                for (const p of inner) {
                    const a = anchorOf(p);
                    if (!a) {
                        const o = off.get(p.id) || off.set(p.id, { name: p.name, rec: p, sessions: [] }).get(p.id);
                        if (!o.sessions.includes(s)) o.sessions.push(s);
                        continue;
                    }
                    let stop = byId.get(p.id);
                    if (!stop) { stop = { n: byId.size + 1, rec: p, pin: a.pin, host: a.host, sessions: [] }; byId.set(p.id, stop); }
                    if (!stop.sessions.includes(s)) stop.sessions.push(s);
                    if (!route.includes(stop)) route.push(stop);
                }
                for (const name of s.otherPlaces || []) {
                    const key = 'name:' + name.toLowerCase();
                    const o = off.get(key) || off.set(key, { name, rec: null, sessions: [] }).get(key);
                    if (!o.sessions.includes(s)) o.sessions.push(s);
                }
                routes.set(s.id, route);
            }
            stops = [...byId.values()];
            offMap = [...off.values()];
            follow = null; selected = null; chooser = null;
            current = commonMap(stops);
            render();
        }

        const shownStops = () => (follow ? routes.get(follow.id) || [] : stops);

        /* The markers of a map: a stop pinned on it, or the place on it that
           holds stops further down (key: the id of the record pinned on it) */
        function markersOf(map, list) {
            const markers = new Map();
            for (const stop of list) {
                const holder = chainOf(stop.pin).find(r => parentOf(r) === map);
                if (!holder || !holder.map || holder.map.x == null) continue;
                const m = markers.get(holder.id) || markers.set(holder.id, { key: holder.id, rec: holder, stops: [], map: holder.map }).get(holder.id);
                if (!m.stops.includes(stop)) m.stops.push(stop);
            }
            for (const m of markers.values()) m.single = m.stops.length === 1 && m.stops[0].pin === m.rec;
            return markers;
        }

        /* ---------- rendering ---------- */
        const chips = list => list.map(s => `<button type="button" class="jr-chip" data-open="${esc(s.id)}" title="${esc(s.name)}">${esc(roman(s.number) || '?')}</button>`).join('');
        const nameOf = r => (r === WORLD ? WORLD.name : r.name);

        function trailHtml() {
            if (!current) return '';
            const chain = chainOf(current).reverse();
            return `<nav class="jr-trail" aria-label="Maps"><span class="material-symbols-outlined" aria-hidden="true">travel_explore</span>
                ${chain.map((r, i) => {
                    const here = r === current;
                    const sep = i ? '<span class="jr-trail__sep" aria-hidden="true">›</span>' : '';
                    if (here) return `${sep}<span class="jr-trail__here" aria-current="location">${esc(nameOf(r))}</span>`;
                    return hasMap(r) ? `${sep}<button type="button" class="jr-trail__up" data-map="${esc(r.id)}">${esc(nameOf(r))}</button>`
                                     : `${sep}<span class="jr-trail__plain">${esc(nameOf(r))}</span>`;
                }).join('')}</nav>`;
        }

        function mapHtml() {
            if (!current) return '';
            const { src, width: W, height: H } = current.mapImage;
            const list = shownStops();
            const markers = markersOf(current, list);
            // The line: the markers in visit order, without repeats in a row
            const path = [];
            for (const stop of list) {
                const m = [...markers.values()].find(x => x.stops.includes(stop));
                if (m && path[path.length - 1] !== m) path.push(m);
            }
            // Pins count y from the bottom of the picture (Leaflet's flat maps: scripts/atlas-common.js)
            const points = path.map(m => `${m.map.x},${H - m.map.y}`).join(' ');
            const pins = [...markers.values()].map(m => {
                const sel = selected === m.key;
                const label = m.single ? m.stops[0].rec.name : `${m.rec.name}: ${m.stops.length} ${m.stops.length === 1 ? 'stop' : 'stops'}`;
                const style = `left:${(m.map.x / W) * 100}%;top:${((H - m.map.y) / H) * 100}%`;
                return m.single
                    ? `<button type="button" class="jr-pin${sel ? ' is-selected' : ''}" style="${style}" data-marker="${esc(m.key)}" aria-label="${esc(label)}" aria-pressed="${sel}">${m.stops[0].n}</button>`
                    : `<button type="button" class="jr-pin jr-pin--group${sel ? ' is-selected' : ''}" style="${style}" data-marker="${esc(m.key)}" aria-label="${esc(label)}" aria-pressed="${sel}"><span class="jr-pin__count">${m.stops.length}</span><span class="jr-pin__name">${esc(m.rec.name)}</span></button>`;
            }).join('');
            const elsewhere = list.length - [...markers.values()].reduce((n, m) => n + m.stops.length, 0);
            return `<div class="jr-map" style="--w:${W};--h:${H}">
                    <img class="jr-map__img" src="${esc(src)}" alt="Map of ${esc(nameOf(current))}" width="${W}" height="${H}">
                    ${path.length > 1 ? `<svg class="jr-map__path" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
                        <polyline class="jr-map__shadow" points="${points}" vector-effect="non-scaling-stroke"></polyline>
                        <polyline class="jr-map__line" points="${points}" vector-effect="non-scaling-stroke"></polyline></svg>` : ''}
                    ${pins}
                    <span class="jr-map__label">${esc(nameOf(current))}</span>
                </div>
                ${elsewhere > 0 ? `<p class="jr-note">${elsewhere} ${elsewhere === 1 ? 'stop is' : 'stops are'} on another map: go up the trail above.</p>` : ''}`;
        }

        function selectedHtml() {
            if (chooser) {
                return `<section class="jr-panel jr-panel--selected"><h3 class="jr-panel__title">${esc(chooser.name)}</h3>
                    <p class="jr-panel__help">Its stops are on several maps:</p>
                    <div class="jr-choices">${chooser.maps.map(r => `<button type="button" class="jr-choice" data-map="${esc(r.id)}">${esc(r.name)}<span class="material-symbols-outlined" aria-hidden="true">zoom_in</span></button>`).join('')}</div></section>`;
            }
            if (!selected || !current) return '';
            const m = markersOf(current, shownStops()).get(selected);
            if (!m) return '';
            if (m.single) {
                const stop = m.stops[0];
                return `<section class="jr-panel jr-panel--selected"><p class="jr-panel__eyebrow">Stop ${stop.n}</p>
                    <h3 class="jr-panel__name">${recLink(stop.rec, 'kw-place')}</h3>
                    <p class="jr-panel__help">Visited in ${chips(stop.sessions)}</p></section>`;
            }
            return `<section class="jr-panel jr-panel--selected"><p class="jr-panel__eyebrow">${m.stops.length} ${m.stops.length === 1 ? 'stop' : 'stops'} inside</p>
                <h3 class="jr-panel__name">${recLink(m.rec, 'kw-place')}</h3>
                <ul class="jr-inside">${m.stops.map(s => `<li><span class="jr-num">${s.n}</span>${esc(s.rec.name)}</li>`).join('')}</ul>
                <button type="button" class="jr-zoom" data-zoom="${esc(m.key)}"><span class="material-symbols-outlined" aria-hidden="true">zoom_in</span>Zoom in</button></section>`;
        }

        function render() {
            if (!sessions.length) { el.innerHTML = `<div class="scr-empty"><p class="scr-empty__title">No session has been recorded yet.</p></div>`; return; }
            if (!stops.length && !offMap.length) {
                el.innerHTML = `<div class="scr-empty"><span class="material-symbols-outlined" aria-hidden="true">map</span>
                    <p class="scr-empty__title">No place has been recorded for these sessions yet.</p></div>`;
                return;
            }
            const list = shownStops();
            const followable = sessions.filter(s => (routes.get(s.id) || []).length);
            const note = follow
                ? `Session ${roman(follow.number)} · ${esc(follow.name)}${list.length ? '' : ' — its places are off the map'}`
                : 'The line joins the stops in the order the party first reached them.';
            const pills = [`<button type="button" class="scr-pill" data-follow="" aria-pressed="${!follow}">All</button>`]
                .concat(sessions.map(s => `<button type="button" class="scr-pill jr-pill${followable.includes(s) ? '' : ' is-off'}" data-follow="${esc(s.id)}" aria-pressed="${follow === s}" title="${esc(s.name)}">${esc(roman(s.number) || '?')}</button>`)).join('');
            const offList = follow ? offMap.filter(o => o.sessions.includes(follow)) : offMap;

            el.innerHTML = `
                <div class="jr-main">${trailHtml()}${current ? mapHtml() : '<p class="jr-note">None of these places is pinned on a map yet.</p>'}</div>
                <aside class="jr-side">
                    <section class="jr-panel"><h3 class="jr-panel__title">Follow a session</h3>
                        <div class="jr-pills">${pills}</div><p class="jr-panel__help">${note}</p></section>
                    ${selectedHtml()}
                    ${list.length ? `<section class="jr-panel jr-panel--stops"><h3 class="jr-panel__title jr-panel__title--place">Stops, in order</h3>
                        <ol class="jr-stops">${list.map(stop => `<li><button type="button" class="jr-stop${selectedStop() === stop ? ' is-selected' : ''}" data-stop="${stop.n}">
                            <span class="jr-num">${stop.n}</span><span class="jr-stop__name">${esc(stop.rec.name)}</span></button>
                            <span class="jr-stop__sessions">${chips(stop.sessions)}</span></li>`).join('')}</ol></section>` : ''}
                    ${offList.length ? `<section class="jr-panel jr-panel--off"><h3 class="jr-panel__title jr-panel__title--muted">Off the map</h3>
                        <ul class="jr-off">${offList.map(o => `<li><span>${o.rec ? recLink(o.rec, 'kw-place') : esc(o.name)}</span>
                            <span class="jr-stop__sessions">${chips(follow ? [follow] : o.sessions)}</span></li>`).join('')}</ul></section>` : ''}
                </aside>`;
        }
        // The stop of the selected marker, when the marker is a single stop
        function selectedStop() {
            if (!selected || !current) return null;
            const m = markersOf(current, shownStops()).get(selected);
            return m && m.single ? m.stops[0] : null;
        }

        function setMap(r) { current = r; selected = null; chooser = null; render(); }
        function zoomInto(key) {
            const m = markersOf(current, shownStops()).get(key);
            if (!m) return;
            if (hasMap(m.rec)) return setMap(m.rec);
            const target = commonMap(m.stops);
            if (target && chainOf(target).includes(m.rec)) return setMap(target);
            // Several maps under it: the reader picks one,
            // the topmost map under it on each stop's way
            const maps = [...new Set(m.stops.map(s => chainOf(s.host).filter(r => hasMap(r) && r !== m.rec && chainOf(r).includes(m.rec)).pop()))].filter(Boolean);
            chooser = { name: m.rec.name, maps };
            selected = null;
            render();
        }

        /* ---------- clicks ---------- */
        el.addEventListener('click', e => {
            const t = e.target;
            const marker = t.closest('[data-marker]');
            if (marker) {
                const key = marker.dataset.marker;
                const m = markersOf(current, shownStops()).get(key);
                chooser = null;
                if (m && !m.single && selected === key) return zoomInto(key);   // a second click zooms in
                selected = selected === key ? null : key;
                return render();
            }
            const zoom = t.closest('[data-zoom]');
            if (zoom) return zoomInto(zoom.dataset.zoom);
            const map = t.closest('[data-map]');
            if (map) return setMap(map.dataset.map === 'world' ? WORLD : store.get(map.dataset.map));
            const f = t.closest('[data-follow]');
            if (f) return followSession(f.dataset.follow || null);
            const st = t.closest('[data-stop]');
            if (st) {
                const stop = stops.find(s => s.n === Number(st.dataset.stop));
                if (!stop) return;
                // On the map shown when it is there, else on its own map
                const here = current && markersOf(current, [stop]).size;
                if (!here) current = stop.host;
                const m = [...markersOf(current, [stop]).values()][0];
                selected = m ? m.key : null;
                chooser = null;
                render();
                const mapEl = el.querySelector('.jr-map');
                if (mapEl && mapEl.getBoundingClientRect().top < 0) mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        function followSession(id) {
            follow = id ? sessions.find(s => s.id === id) || null : null;
            selected = null; chooser = null;
            const list = shownStops();
            const fit = commonMap(list.length ? list : stops);
            if (fit) current = fit;
            render();
        }

        return { load, followSession };
    };
})(typeof window !== 'undefined' ? window : globalThis);
