/* =====================================================================
   A PLANE'S PAGE (plane.html?id=<plane>)
   ---------------------------------------------------------------------
   From data/planes.json: the medallion, name, epithet and summary, the
   traits, the lore and the ways in, the maps with the plane's own places
   pinned on them, who dwells there (the plane's own people and powers,
   and gods of the Pantheon, in their groups), the creatures of the bestiary whose realm is the
   plane, and the planes next to it on the orrery.
   - Its look: record.look (theme + tweaks, scripts/core/look.js and
     styles/looks.css); its theme may also decorate the page
     (scripts/plane-themes.js). No theme: the starry sky of the orrery.
   - Sealed (store.revealed): only "a sealed plane" and its neighbours.
     A sealed place is not pinned; a sealed resident is "Not yet met".
     Both follow the campaign drop-down (shared with Dramatis Personae).
   - #place-<key> opens the map of that place with its card;
     #who-<key> scrolls to that resident (links of store.planePart; a god
     of the Pantheon: #who-<its id>, from its own page).
   Styles: styles/pages/plane.css. Helpers: scripts/planes-common.js.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const $ = id => document.getElementById(id);
    const K = Athenaeum.planes;
    const { esc } = K;

    const id = new URLSearchParams(location.search).get('id');
    const plane = id ? store.get(id) : null;
    if (!plane || store.typeOf(plane) !== 'plane') { location.replace('planes.html'); return; }

    const campaigns = store.all('campaign');
    let campaign = campaigns.length ? Athenaeum.personae.choose(store, { campaigns, allowAll: true }) : 'all';
    const md = t => store.autolink(store.md(t || '', { dropCap: true }), { exclude: plane.id, campaign });
    const link = t => store.autolink(esc(t || ''), { exclude: plane.id, campaign });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.title = `${plane.name} — The Athenaeum Vault`;

    /* ---------- the look ---------- */
    const look = plane.look || null;
    if (Athenaeum.look) Athenaeum.look.apply(document.body, look, 'plane');
    const theme = look && look.theme && Athenaeum.planeThemes ? Athenaeum.planeThemes[look.theme] : null;
    document.body.classList.toggle('pp-themed', !!theme);
    if (!theme && Athenaeum.sky) Athenaeum.sky($('sky'));

    /* ---------- pieces ---------- */
    const section = (title, inner, cls = '') => `<section class="pp-section ${cls}"><h2 class="pp-h2">${esc(title)}</h2>${inner}</section>`;
    function linkName(x) {
        const rec = store.get(x);
        if (!rec) return '';
        const name = esc(rec.name);
        const linked = store.autolink(name, { terms: true, campaign });
        if (/^<(a|span)\b[^>]*>[^<]*<\/(a|span)>$/.test(linked)) return linked;
        const url = store.url(rec);
        return url ? `<a href="${url}" data-kw="${esc(rec.id)}">${name}</a>` : `<span>${name}</span>`;
    }
    const nearby = p => (store.revealed(p, campaign)
        ? `<a class="pp-panel pp-near" href="${esc(store.url(p))}" data-kw="${esc(p.id)}">${K.medal(p, 34, false)}<span class="pp-near__t"><span class="pp-near__n">${esc(p.name)}</span><span class="pp-label pp-label--muted">${esc(K.whereOf(store, p))}</span></span></a>`
        : `<div class="pp-panel pp-near is-sealed">${K.medal(p, 34, true)}<span class="pp-near__t"><span class="pp-near__n">An unknown plane</span><span class="pp-label pp-label--muted">${esc(K.whereOf(store, { ...p, touchesAll: false }))}</span></span></div>`);

    /* The planes next to this one on the orrery: [[heading, planes]…] */
    function neighbours() {
        const all = store.all('plane').filter(p => p.id !== plane.id);
        const kindOf = p => p.kind || 'circle';
        const centres = all.filter(p => kindOf(p) === 'centre');
        const satsOf = p => all.filter(q => kindOf(q) === 'satellite' && q.orbits === p.id);
        const circle = n => all.filter(p => kindOf(p) === 'circle' && K.circleOf(p) === n);
        const circles = [...new Set(all.filter(p => kindOf(p) === 'circle').map(K.circleOf))].sort((a, b) => a - b);
        const rest = all.filter(p => kindOf(p) !== 'demiplane' && kindOf(p) !== 'beyond' && kindOf(p) !== 'between');
        switch (kindOf(plane)) {
            case 'circle': {
                const c = K.circleOf(plane);
                const inner = circles.filter(n => n < c).pop(), outer = circles.find(n => n > c);
                return [
                    ['Its satellites', satsOf(plane)],
                    [`${K.circleName(c)}, with it`, circle(c)],
                    inner ? [`Inward · ${K.circleName(inner).toLowerCase()}`, circle(inner)] : ['Inward · the centre', [...centres, ...all.filter(p => kindOf(p) === 'overlay' || kindOf(p) === 'ring')]],
                    outer ? [`Outward · ${K.circleName(outer).toLowerCase()}`, circle(outer)] : ['Outward · beyond the circles', all.filter(p => kindOf(p) === 'beyond')],
                    ['Roads lead here from', all.filter(p => (p.roads || []).some(rd => rd && rd.to === plane.id))],
                ];
            }
            case 'beneath':
                return [
                    ['Its roads lead to', (plane.roads || []).map(rd => rd && store.get(rd.to)).filter(Boolean)],
                    ['At the centre', all.filter(p => ['centre', 'overlay', 'ring'].includes(kindOf(p)))],
                ];
            case 'centre': case 'overlay': case 'ring':
                return [
                    ['At the centre', all.filter(p => ['centre', 'overlay', 'ring', 'beneath'].includes(kindOf(p)))],
                    circles.length ? [`Outward · ${K.circleName(circles[0]).toLowerCase()}`, circle(circles[0])] : null,
                ];
            case 'beyond':
                return plane.touchesAll ? [['The planes it touches', rest]] : [['Beyond the circles, with it', all.filter(p => kindOf(p) === 'beyond')]];
            case 'between':
                return [['The planes it lies between', rest]];
            case 'satellite': {
                const host = plane.orbits && store.get(plane.orbits);
                return [
                    ['It turns around', host ? [host] : []],
                    host ? ['With it around ' + host.name.replace(/^The /, 'the '), satsOf(host)] : null,
                ];
            }
            case 'demiplane':
                return [['Anchored to', plane.anchor && store.get(plane.anchor) ? [store.get(plane.anchor)] : []]];
        }
        return [];
    }

    /* ---------- the page ---------- */
    const sealed = !store.revealed(plane, campaign);
    function render() {
        const where = K.whereOf(store, sealed ? { ...plane, touchesAll: false } : plane);
        $('pp-crumb').innerHTML = `<a href="planes.html?plane=${encodeURIComponent(plane.id)}">The Planes of Existence</a><span aria-hidden="true">›</span>${esc(where)}`;
        $('pp-sigil').style.setProperty('--pp-glow', sealed ? '#5d5a6b' : K.colourOf(plane));
        $('pp-sigil').innerHTML = `<span class="pp-medal" tabindex="0" role="img" aria-label="${esc(sealed ? 'A sealed plane' : plane.name)}">${K.medal(plane, phone() ? 150 : 200, sealed)}</span>`;
        $('pp-hero-text').innerHTML = sealed
            ? `<p class="pp-label">${esc(where)}</p><h1 class="pp-title is-sealed">A sealed plane</h1>
               <p class="pp-sum pp-sum--sealed">Its place is charted, but nothing of it has been learned yet${campaign && campaign !== 'all' ? ` in ${esc((store.get(campaign) || {}).name || '')}` : ''}.</p>`
            : `<p class="pp-label">${esc(plane.kind === 'demiplane' ? 'Demiplane' : 'Plane of existence')} · ${esc(where.replace(/^The /, 'the '))}</p>
               <h1 class="pp-title">${esc(plane.name)}</h1>
               ${plane.epithet ? `<p class="pp-epithet">${esc(plane.epithet)}</p>` : ''}
               ${plane.summary ? `<p class="pp-sum">${link(plane.summary)}</p>` : ''}
               ${plane.sealed ? `<span class="pp-chip">Learned in ${esc((plane.revealedIn || []).map(c => (store.get(c) || {}).name || c).join(', '))}</span>` : '<span class="pp-chip">Known in every campaign</span>'}`;

        let html = '';
        if (!sealed) {
            const traits = (plane.traits || []).filter(t => t && t.label);
            if (traits.length) html += `<section class="pp-traits" aria-label="Traits">${traits.map(t => `<div class="pp-panel pp-trait"><span class="pp-label">${esc(t.label)}</span><span class="pp-trait__v">${link(t.value || '')}</span></div>`).join('')}</section>`;

            // Lore, ways in, where it is spoken of
            const ways = (plane.ways || []).filter(w => w && w.text);
            const spoken = [...new Set([...(plane.links || []), ...store.backrefs(plane).filter(r => store.typeOf(r) !== 'plane').map(r => r.id)])].map(linkName).filter(Boolean);
            const side = [
                ways.length ? `<div class="pp-panel pp-box"><p class="pp-label">Ways in</p>${ways.map(w => `<p class="pp-row"><span class="material-symbols-outlined" aria-hidden="true">${esc(w.icon || 'door_open')}</span><span>${link(w.text)}</span></p>`).join('')}</div>` : '',
                spoken.length ? `<div class="pp-panel pp-box"><p class="pp-label">Spoken of in</p><ul class="pp-links">${spoken.map(s => `<li>${s}</li>`).join('')}</ul></div>` : '',
            ].join('');
            const lore = plane.body ? section(plane.kind === 'demiplane' ? 'The demiplane' : 'The plane', `<div class="pp-panel pp-lore">${md(plane.body)}</div>`) : '';
            if (lore || side) html += `<div class="pp-cols${lore ? '' : ' pp-cols--side-only'}">${lore ? `<div class="pp-col">${lore}</div>` : ''}${side ? `<aside class="pp-side">${side}</aside>` : ''}</div>`;

            // The Grand Atlas: the world on this plane (the Material Plane)
            if (plane.atlas) html += atlasSection();

            // Maps (drawn below by drawMaps)
            if (mapsOf().length) {
                html += section(`Maps of ${plane.name.replace(/^The /, 'the ')}`, `<div class="pp-panel pp-mapbox">
                    ${mapsOf().length > 1 ? `<div class="pp-maptabs" role="tablist" aria-label="Maps">${mapsOf().map((m, i) => `<button type="button" role="tab" class="pp-maptab" data-map="${i}" aria-selected="false">${esc(m.name || m.id)}</button>`).join('')}</div>` : ''}
                    <div id="pp-map" class="pp-map" role="region" aria-label="Map"></div>
                    <div id="pp-place" class="pp-place" aria-live="polite"></div></div>`, 'pp-maps');
            }

            // Who dwells there
            const listed = m => m && (m.name || (m.deity && store.get(m.deity)));
            const groups = (plane.groups || []).filter(g => g && (g.members || []).some(listed));
            if (groups.length) {
                html += section('Who dwells there', groups.map(g => `<div class="pp-group">
                    <p class="pp-label">${esc(g.name)}</p>${g.desc ? `<p class="pp-group__desc">${link(g.desc)}</p>` : ''}
                    <div class="pp-who">${(g.members || []).filter(listed).map(resident).join('')}</div></div>`).join(''), 'pp-residents')
                    .replace('<section ', '<section id="residents" ');
            }

            // Denizens: the creatures of the bestiary whose realm is this plane
            const names = [plane.name, ...(plane.aliases || [])].map(n => String(n).toLowerCase().replace(/^the\s+/, '').trim());
            const denizens = store.all('creature').filter(c => c.realm && names.includes(String(c.realm).toLowerCase().replace(/^the\s+/, '').trim()));
            if (denizens.length) {
                html += section('Denizens', `<div class="pp-denizens">${denizens.map(c => `<a class="pp-panel pp-den" href="${esc(store.url(c) || '#')}" data-kw="${esc(c.id)}">
                    ${c.image ? `<img class="pp-den__img" src="${esc(K.src(c.image))}" alt="" loading="lazy" style="${c.imageFocus ? `object-position:${esc(c.imageFocus)}` : ''}">` : '<span class="pp-den__img pp-den__img--none"><span class="material-symbols-outlined" aria-hidden="true">pets</span></span>'}
                    <span class="pp-den__t"><span class="pp-den__n">${esc(c.name)}</span>
                    <span class="pp-den__chips">${[c.threat, c.phylogeny].filter(v => v && /\p{L}/u.test(v)).map(v => `<span class="pp-chip pp-chip--sm">${esc(v)}</span>`).join('')}</span></span></a>`).join('')}</div>`);
            }
        }
        const nb = neighbours().filter(n => n && n[1] && n[1].length);
        if (nb.length) {
            html += section(plane.kind === 'circle' || !plane.kind ? 'Neighbouring circles' : 'On the orrery', nb.map(([h, list]) =>
                `<p class="pp-label pp-label--muted pp-near__h">${esc(h)}</p><div class="pp-nears">${list.map(nearby).join('')}</div>`).join(''), 'pp-neigh');
        }
        html += `<div class="pp-back"><a href="planes.html?plane=${encodeURIComponent(plane.id)}" class="pp-backlink"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>Back to the orrery</a></div>`;
        $('pp-content').innerHTML = html;
        drawMaps();
        decorate();
    }

    function atlasSection() {
        const world = store.world || {};
        const map = world.mapImage && world.mapImage.src ? world.mapImage : null;
        const conts = store.all('continent');
        const thumb = c => (c.mapImage && c.mapImage.src ? `<img class="pp-cont__img" src="${esc(K.src(c.mapImage.src))}" alt="" loading="lazy">`
            : '<span class="pp-cont__img pp-cont__img--none"><span class="material-symbols-outlined" aria-hidden="true">map</span></span>');
        return section(world.name || 'The world', `
            <a class="pp-panel pp-world" href="${esc(store.url('world') || 'world.html')}">
                ${map ? `<img class="pp-world__map" src="${esc(K.src(map.src))}" alt="The map of ${esc(world.name || 'the world')}" loading="lazy">` : ''}
                <span class="pp-world__t"><span class="pp-label">The Grand Atlas</span>
                    <span class="pp-world__n">${esc(world.loreTitle || world.name || 'The world')}</span>
                    <span class="pp-world__go">Open the world map<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span></span>
            </a>
            ${conts.length ? `<p class="pp-label pp-label--muted pp-near__h" style="margin-top:22px">Its continents</p>
            <div class="pp-conts">${conts.map(c => `<a class="pp-panel pp-cont" href="${esc(store.url(c) || '#')}" data-kw="${esc(c.id)}">${thumb(c)}<span class="pp-cont__n">${esc(c.name)}</span></a>`).join('')}</div>` : ''}`, 'pp-atlas');
    }

    function resident(item) {
        // A god of the Pantheon: its name, epithet, portrait and text from its page
        const m = K.memberView(store, item);
        const key = m.god ? m.god.id : (store.planeParts(plane, 'resident').find(v => v.item === item) || {}).key || '';
        if (!K.memberRevealed(store, plane, item, campaign)) {
            const camp = campaign && campaign !== 'all' ? ` in ${esc((store.get(campaign) || {}).name || '')}` : '';
            return `<div class="pp-panel pp-res is-sealed" id="who-${esc(key)}"><span class="pp-res__pic"><span class="material-symbols-outlined" aria-hidden="true">lock</span></span>
                <span class="pp-res__body"><span class="pp-res__name">Not yet met</span><span class="pp-res__text">Not yet met${camp}.</span></span></div>`;
        }
        return `<article class="pp-panel pp-res${m.divine ? ' is-divine' : ''}" id="who-${esc(key)}">
            ${m.portrait ? `<img class="pp-res__pic" src="${esc(K.src(m.portrait))}" alt="" loading="lazy">` : `<span class="pp-res__pic"><span class="material-symbols-outlined" aria-hidden="true">${m.divine ? 'brightness_7' : 'person'}</span></span>`}
            <span class="pp-res__body"><span class="pp-res__name">${m.god ? godName(m) : esc(m.name)}</span>
                ${m.title ? `<span class="pp-res__title">${esc(m.title)}</span>` : ''}
                ${m.summary ? `<span class="pp-res__text">${m.god ? store.autolink(esc(m.summary), { exclude: [plane.id, m.god.id], campaign }) : link(m.summary)}</span>` : ''}</span></article>`;
    }

    // A god's name links to its page in the Pantheon (with its preview card)
    function godName(m) {
        const url = store.url(m.god);
        return url ? `<a class="kw-deity" href="${esc(url)}" data-kw="${esc(m.god.id)}">${esc(m.name)}</a>` : esc(m.name);
    }

    /* ---------- maps: the plane's own places, pinned ---------- */
    const mapsOf = () => (plane.maps || []).filter(m => m && m.id && m.image && m.image.src && m.image.width && m.image.height);
    const placesOn = m => store.planeParts(plane, 'place').filter(v => v.item.pin && v.item.pin.x != null && v.item.pin.y != null
        && (v.item.pin.on || mapsOf()[0].id) === m.id && store.partRevealed(v, campaign));
    let lmap = null, overlay = null, markers = {}, shown = -1;
    function drawMaps() {
        const box = $('pp-map');
        if (!box || typeof L === 'undefined' || !window.Atlas) return;
        lmap = Atlas.createMap('pp-map', { minZoom: -6, maxZoom: 2, zoomSnap: 0, zoomDelta: 0.5, maxBoundsViscosity: 0.8 });
        shown = -1;
        document.querySelectorAll('.pp-maptab').forEach(t => t.addEventListener('click', () => showMap(Number(t.dataset.map))));
        showMap(0);
    }
    function showMap(i, pickKey) {
        const m = mapsOf()[i];
        if (!m || !lmap) return;
        document.querySelectorAll('.pp-maptab').forEach(t => {
            const on = Number(t.dataset.map) === i;
            t.classList.toggle('is-on', on);
            t.setAttribute('aria-selected', String(on));
        });
        if (shown !== i) {
            Object.values(markers).forEach(mk => lmap.removeLayer(mk));
            markers = {};
            overlay = Atlas.showImage(lmap, { ...m.image, src: K.src(m.image.src) }, overlay);
            lmap.setMaxBounds([[-m.image.height * 0.25, -m.image.width * 0.25], [m.image.height * 1.25, m.image.width * 1.25]]);
            placesOn(m).forEach(v => {
                markers[v.key] = Atlas.pin({
                    y: v.item.pin.y, x: v.item.pin.x,
                    icon: Atlas.regionIcon(v.item.pin.icon || 'house'), name: v.name,
                    onClick: () => pick(v.key),
                }).addTo(lmap);
            });
            shown = i;
        }
        pick(pickKey || null);
    }
    function pick(key) {
        const card = $('pp-place');
        Object.entries(markers).forEach(([k, mk]) => { const el = mk.getElement(); if (el) el.classList.toggle('is-picked', k === key); });
        const v = key ? store.planeParts(plane, 'place').find(x => x.key === key) : null;
        const m = mapsOf()[shown];
        if (!v) {
            card.innerHTML = m && m.note ? `<p class="pp-caption">${link(m.note)}</p>` : (Object.keys(markers).length ? '<p class="pp-caption">Choose a pin.</p>' : '');
            return;
        }
        card.innerHTML = `<div class="pp-placecard" id="place-${esc(v.key)}">
            ${v.item.image ? `<img class="pp-placecard__img" src="${esc(K.src(v.item.image))}" alt="" loading="lazy">` : ''}
            <div><h3 class="pp-placecard__name">${esc(v.name)}</h3>${v.item.summary ? `<p class="pp-placecard__text">${link(v.item.summary)}</p>` : ''}</div></div>`;
    }

    /* ---------- the theme's decoration ---------- */
    const stage = $('pp-stage'), back = $('pp-back'), front = $('pp-front');
    const phone = () => window.innerWidth < 768;
    function decorate() {
        back.innerHTML = ''; front.innerHTML = '';
        document.querySelectorAll('#pp-sigil .pt-shards, #pp-sigil .pt-sigil').forEach(n => n.remove());
        stage.style.removeProperty('--pp-top');
        if (!theme) return;
        const r = theme.decorate({ back, front, sigil: $('pp-sigil'), width: stage.clientWidth, height: stage.scrollHeight, phone: phone(), still: reduced }) || {};
        if (r.topSpace) stage.style.setProperty('--pp-top', `${r.topSpace}px`);
    }

    /* ---------- links to a place or a resident (#place-…, #who-…) ---------- */
    function follow() {
        const h = decodeURIComponent(location.hash.slice(1));
        if (h.startsWith('place-')) {
            const key = h.slice(6);
            const v = store.planeParts(plane, 'place').find(x => x.key === key);
            if (!v || !store.partRevealed(v, campaign)) return;
            const i = mapsOf().findIndex(m => m.id === (v.item.pin && v.item.pin.on || (mapsOf()[0] || {}).id));
            if (i >= 0) showMap(i, key);
            const box = document.querySelector('.pp-maps');
            if (box) box.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        } else if (h.startsWith('who-')) {
            const el = document.getElementById(h);
            if (!el) return;
            el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
            el.classList.remove('is-target'); void el.offsetWidth; el.classList.add('is-target');
        }
    }
    window.addEventListener('hashchange', follow);

    /* ---------- the campaign drop-down ---------- */
    const picker = $('pp-campaign');
    if (picker && campaigns.length) {
        Athenaeum.personae.picker(picker, { campaigns, value: campaign, allowAll: true, onChange: v => { campaign = v; location.reload(); } });
    }

    render();
    // Drawn again when the width changes (a phone turned): sizes and decoration follow
    let lastW = window.innerWidth, timer = null;
    window.addEventListener('resize', () => {
        if (Math.abs(window.innerWidth - lastW) < 2) return;
        lastW = window.innerWidth;
        clearTimeout(timer);
        timer = setTimeout(() => { render(); }, 150);
    });
    // Late pictures change the height: the floor follows
    window.addEventListener('load', decorate);
    if (location.hash) setTimeout(follow, 300);
});
