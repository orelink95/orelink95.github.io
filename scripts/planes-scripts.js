/* =====================================================================
   THE PLANES OF EXISTENCE (planes.html) — the orrery.
   ---------------------------------------------------------------------
   Every plane of data/planes.json, drawn by its `kind`:
   - centre    the disc at the heart: the first two share it, cut in two
               along the diagonal (the first upper right, the second lower left)
   - overlay   a moon resting on the rim of the half of the disc it lies
               over (`over`); several on one half spread along its rim
   - ring      a band around the centre with its name written along it
   - beneath   a dark ring with embers between the veil and the rings (the
               Underworld). Any plane may have `roads` to planes on the
               circles: hovered or chosen, they light up, souls flowing out.
   - circle    a medallion orbiting on circle `circle` (1 = nearest), starting
               at `angle` (0 = top, clockwise). A circle turns as one; the
               farther, the slower.
   - satellite a small moon turning around a plane on a circle (`orbits`),
               on a path of its own, from `angle`. Not drawn while that plane
               is sealed; the outer circle comes in to leave its moons room.
   - beyond    a band around the whole orrery, its medallion at `angle` on it.
               `touchesAll`: hovered or chosen, threads of its colour run to
               every plane.
   - between   the dark field between the circles (one only)
   - demiplane a card under the orrery (`anchor`, `way`)
   Hovering a medallion holds the orrery still; “Hold still” stops it for good
   (and a reader who asks for less motion never sees it turn).
   Choosing a plane opens it in the panel (?plane=<id> too), with who dwells
   there (its residents, gods of the Pantheon among them). A sealed plane
   (`sealed`, learned in `revealedIn`, store.revealed) is a locked nameless
   medallion on a circle or beyond them, a sealed card among the demiplanes,
   and is not drawn at all elsewhere.
   Icons: `iconImage` (an SVG is filled with the plane's colour by a CSS mask,
   another picture is shown as it is), else `icon` (Material Symbols).
   `glow`: a halo of its colour. Sizes are worked out from the width of the
   orrery, so it is drawn again when that changes (a phone turned, a window
   resized). Sky: scripts/core/sky.js. Styles: styles/pages/planes.css.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const $ = id => document.getElementById(id);
    const plate = $('orrery'), panel = $('pl-panel');
    if (!plate || !panel) return;

    Athenaeum.sky($('sky'));

    // Shared with a plane's page: scripts/planes-common.js
    const { esc, GOLD, colourOf, mix, iconHtml, medal, circleName, memberRevealed, memberView } = Athenaeum.planes;

    const campaigns = store.all('campaign');
    let campaign = campaigns.length ? Athenaeum.personae.choose(store, { campaigns, allowAll: true }) : 'all';
    const params = new URLSearchParams(location.search);
    const state = { sel: params.get('plane'), still: false };

    const all = store.all('plane');
    const of = kind => all.filter(p => (p.kind || 'circle') === kind);
    const open = p => store.revealed(p, campaign);

    /* ---------- the layout: what sits where (fractions of the orrery's width) ---------- */
    // A satellite turns around a plane on a circle; none while that plane is sealed
    const satsOf = p => (open(p) ? of('satellite').filter(m => m.orbits === p.id) : []);
    // The size of a medallion on circle number ci (0 = nearest), its satellites' path and size
    const orbSize = (P, ci) => Math.max(28, Math.min(60, Math.round(P * (ci === 0 ? 0.055 : 0.064))));
    const satGeom = z => ({ o: z / 2 + Math.max(7, Math.round(z * 0.19)), q: Math.max(14, Math.round(z * 0.34)) });

    function layout(P) {
        const centres = of('centre').filter(open).slice(0, 2);
        const overlays = of('overlay').filter(open);
        const rings = of('ring').filter(open);
        const beneath = of('beneath').filter(open)[0] || null;
        const beyond = of('beyond').slice(0, 3);          // sealed ones stay, locked
        const between = of('between').filter(open)[0] || null;
        const circling = of('circle');
        const circles = [...new Set(circling.map(p => Math.max(1, Math.round(Number(p.circle) || 1))))].sort((a, b) => a - b);

        const L = { centres, overlays, rings, beneath, beyond, between, circling, circles };
        L.core = 0.074;                                   // radius of the disc
        L.veil = overlays.length ? 0.114 : 0.09;
        // rings, outward from the veil
        let r = L.veil + 0.048;
        // beneath the centre: just outside the veil, the rings move out
        if (beneath) { L.beneathBand = { inner: L.veil + 0.008, outer: L.veil + 0.038 }; r = L.beneathBand.outer + 0.012; }
        L.ringBands = rings.map(p => { const band = { p, inner: r, outer: r + 0.031 }; r += 0.037; return band; });
        // circles, evenly between the last ring and the ticks
        let to = 0.381;
        // The outer circle comes in when its planes have satellites, to keep them off the rim
        const last = circles[circles.length - 1];
        if (P && circling.some(p => Math.max(1, Math.round(Number(p.circle) || 1)) === last && satsOf(p).length)) {
            const { o, q } = satGeom(orbSize(P, circles.length - 1));
            to = Math.min(to, 0.417 - (o + q / 2 + 4) / P);
        }
        const from = Math.max(rings.length ? r + 0.075 : 0.22, 0.2);
        L.circleR = {};
        circles.forEach((c, i) => { L.circleR[c] = circles.length === 1 ? (from + to) / 2 : from + (to - from) * (i / (circles.length - 1)); });
        // beyond the ticks: one band each
        const bStart = 0.448, bEnd = 0.5, n = Math.max(1, beyond.length), w = (bEnd - bStart) / n;
        L.beyondBands = beyond.map((p, i) => ({ p, inner: bStart + i * w + 0.002, outer: bStart + (i + 1) * w - 0.003, mid: bStart + (i + 0.5) * w }));
        return L;
    }

    /* ---------- pieces ---------- */
    const nameOf = p => (open(p) ? p.name : 'An unknown plane');

    function linkName(id) {
        const rec = store.get(id);
        if (!rec) return '';
        const name = esc(rec.name);
        // The whole name as one keyword link (its colour, its preview card)…
        const linked = store.autolink(name, { terms: true });
        if (/^<(a|span)\b[^>]*>[^<]*<\/(a|span)>$/.test(linked)) return linked;
        // …else a plain link to its page (a session whose title holds a place name)
        const url = store.url(rec);
        return url ? `<a href="${url}" data-kw="${esc(rec.id)}">${name}</a>` : `<span>${name}</span>`;
    }

    /* ---------- the orrery ---------- */
    let L = null;
    function draw() {
        const P = Math.round(plate.clientWidth);
        if (!P) return;
        L = layout(P);
        const C = P / 2, px = f => Math.round(f * P);
        const out = [];
        const small = P < 520;
        plate.classList.toggle('is-small', small);

        // The field between the planes, under everything
        if (L.between) {
            const b = L.between, R = px(0.412);
            out.push(`<button type="button" class="pl-void${state.sel === b.id ? ' is-sel' : ''}" data-plane="${esc(b.id)}" aria-pressed="${state.sel === b.id}"
                aria-label="${esc(b.name)}, between the planes" style="left:${C - R}px;top:${C - R}px;width:${2 * R}px;height:${2 * R}px;--c:${colourOf(b)}"></button>
                <span class="pl-tag pl-tag--void" aria-hidden="true" style="top:${C + px(((L.circleR[L.circles[L.circles.length - 1]] || 0.381) + 0.417) / 2)}px">${esc(b.name)} · between the planes</span>`);
        }
        // The graduated rim
        out.push(`<span class="pl-ticks" aria-hidden="true" style="--in:${px(0.417)}px;--out:${px(0.431)}px"></span>
            <span class="pl-ticks pl-ticks--fine" aria-hidden="true" style="--in:${px(0.425)}px;--out:${px(0.431)}px"></span>`);
        // Beyond the circles: bands, and their medallions
        L.beyondBands.forEach(({ p, inner, outer }, i) => {
            const sealed = !open(p);
            out.push(`<span class="pl-band${state.sel === p.id ? ' is-lit' : ''}" data-band="${esc(p.id)}" aria-hidden="true"
                style="--in:${px(inner)}px;--out:${px(outer)}px;--c:${sealed ? '#5d5a6b' : colourOf(p)}${i % 2 ? ';animation-direction:reverse;animation-duration:320s' : ''}"></span>`);
        });
        // The circles' paths
        L.circles.forEach((c, i) => {
            const R = px(L.circleR[c]);
            const lit = state.sel && (L.circling.find(p => p.id === state.sel) || {}).circle == c;
            out.push(`<span class="pl-path${i === L.circles.length - 1 && L.circles.length > 1 ? ' pl-path--outer' : ''}${lit ? ' is-lit' : ''}" aria-hidden="true"
                style="left:${C - R}px;top:${C - R}px;width:${2 * R}px;height:${2 * R}px"></span>`);
        });
        // Rings around the centre: a band, clickable, its name along it
        L.ringBands.forEach(({ p, inner, outer }, i) => {
            const ri = px(inner), ro = px(outer), rm = (ri + ro) / 2, c = colourOf(p);
            const path = `M ${C} ${C - ro} A ${ro} ${ro} 0 1 0 ${C} ${C + ro} A ${ro} ${ro} 0 1 0 ${C} ${C - ro} Z M ${C} ${C - ri} A ${ri} ${ri} 0 1 0 ${C} ${C + ri} A ${ri} ${ri} 0 1 0 ${C} ${C - ri} Z`;
            const id = `pl-ring-${i}`;
            const fs = Math.max(8, Math.round(P / 76));
            out.push(`<div class="pl-ringset"><button type="button" class="pl-ring${state.sel === p.id ? ' is-sel' : ''}" data-plane="${esc(p.id)}" aria-pressed="${state.sel === p.id}" aria-label="${esc(p.name)}"
                    style="--c:${c};--in:${ri}px;--out:${ro}px;clip-path:path(evenodd,'${path}')"></button>
                <span class="pl-ring__edge" aria-hidden="true" style="left:${C - ro}px;top:${C - ro}px;width:${2 * ro}px;height:${2 * ro}px;--c:${c}"></span>
                <span class="pl-ring__edge" aria-hidden="true" style="left:${C - ri}px;top:${C - ri}px;width:${2 * ri}px;height:${2 * ri}px;--c:${c}"></span>
                ${small ? '' : `<svg class="pl-ring__text" aria-hidden="true" viewBox="0 0 ${P} ${P}"><defs>
                    <path id="${id}-t" d="M ${C - rm} ${C} A ${rm} ${rm} 0 0 1 ${C + rm} ${C}"></path>
                    <path id="${id}-b" d="M ${C - rm} ${C} A ${rm} ${rm} 0 0 0 ${C + rm} ${C}"></path></defs>
                    <text font-size="${fs}" dy="${Math.round(fs / 3)}" fill="${c}"><textPath href="#${id}-t" startOffset="50%" text-anchor="middle">${esc(p.name.replace(/^the\s+/i, '').toUpperCase())}</textPath></text>
                    <text font-size="${fs}" dy="${Math.round(fs / 3)}" fill="${c}"><textPath href="#${id}-b" startOffset="50%" text-anchor="middle">${esc(p.name.replace(/^the\s+/i, '').toUpperCase())}</textPath></text></svg>`}
                <span class="pl-tag pl-tag--ring" aria-hidden="true" style="top:${C - rm}px">${esc(p.name)}</span></div>`);
        });
        // Beneath the centre: a dark ring with embers, clickable
        if (L.beneath) {
            const p = L.beneath, ri = px(L.beneathBand.inner), ro = px(L.beneathBand.outer), c = colourOf(p);
            const path = `M ${C} ${C - ro} A ${ro} ${ro} 0 1 0 ${C} ${C + ro} A ${ro} ${ro} 0 1 0 ${C} ${C - ro} Z M ${C} ${C - ri} A ${ri} ${ri} 0 1 0 ${C} ${C + ri} A ${ri} ${ri} 0 1 0 ${C} ${C - ri} Z`;
            out.push(`<div class="pl-ringset pl-underset"><button type="button" class="pl-under${state.sel === p.id ? ' is-sel' : ''}" data-plane="${esc(p.id)}" aria-pressed="${state.sel === p.id}" aria-label="${esc(p.name)}, beneath the centre"
                    style="--c:${c};--in:${ri}px;--out:${ro}px;clip-path:path(evenodd,'${path}')"></button>
                <span class="pl-under__embers" aria-hidden="true" style="left:${C - ro}px;top:${C - ro}px;width:${2 * ro}px;height:${2 * ro}px;--in:${ri + 3}px;--out:${ro - 3}px;--c:${c}"></span>
                <span class="pl-ring__edge" aria-hidden="true" style="left:${C - ro}px;top:${C - ro}px;width:${2 * ro}px;height:${2 * ro}px;--c:${c}"></span>
                <span class="pl-ring__edge" aria-hidden="true" style="left:${C - ri}px;top:${C - ri}px;width:${2 * ri}px;height:${2 * ri}px;--c:${c}"></span>
                <span class="pl-tag pl-tag--ring" aria-hidden="true" style="top:${C - ro - 12}px">${esc(p.name)}</span></div>`);
        }
        // Threads: from every plane out to the bands that touch them all (hidden until wanted)
        const touching = L.beyondBands.filter(b => b.p.touchesAll && open(b.p));
        // Roads that lead to a plane: from planes with `roads` (and the radius they start from)
        const startOf = q => (L.beneath && q === L.beneath ? L.beneathBand.outer
            : L.ringBands.some(b => b.p === q) ? L.ringBands.find(b => b.p === q).outer
                : (q.kind === 'overlay' ? L.veil : L.core + 0.01));
        const roadsTo = target => all.filter(q => open(q) && (q.kind || 'circle') !== 'circle' && (q.roads || []).some(rd => rd && rd.to === target.id))
            .map(q => ({ from: q, r: startOf(q), colour: (q.roads.find(rd => rd.to === target.id).colour && /^#[0-9a-f]{3,8}$/i.test(q.roads.find(rd => rd.to === target.id).colour)) ? q.roads.find(rd => rd.to === target.id).colour : colourOf(target) }));
        const threadTo = (b, from) => `--c:${colourOf(b.p)};top:${-px(b.mid)}px;height:${px(b.mid) - from}px`;
        touching.forEach((b, k) => {
            const veil = px(L.veil);
            [45, 135, 225, 315].forEach(a => out.push(`<span class="pl-arm" aria-hidden="true" style="left:${C}px;top:${C}px;transform:rotate(${a + k * 9}deg)">
                <span class="pl-thread" data-of="${esc(b.p.id)}" style="${threadTo(b, veil)}"></span></span>`));
        });
        // The centre: one disc, or two halves along the diagonal
        if (L.centres.length) {
            const D = Math.max(54, px(L.core * 2)), two = L.centres.length === 2;
            const halves = L.centres.map((p, i) => {
                const c = colourOf(p);
                const cls = two ? (i === 0 ? 'pl-half--a' : 'pl-half--b') : 'pl-half--a pl-half--whole';
                return `<button type="button" class="pl-half ${cls}${state.sel === p.id ? ' is-sel' : ''}" data-plane="${esc(p.id)}" aria-pressed="${state.sel === p.id}" aria-label="${esc(p.name)}"
                    style="--c:${c};--wash:${mix(c, p.glow ? 32 : 22)}">${iconHtml(p, Math.round(D * (two ? 0.62 : 0.8)), false)}</button>`;
            }).join('');
            const glow = L.centres[0].glow ? `,0 0 40px ${mix(colourOf(L.centres[0]), 45)}` : '';
            out.push(`<div class="pl-core" style="left:${C - D / 2}px;top:${C - D / 2}px;width:${D}px;height:${D}px;box-shadow:0 0 0 4px #050409,0 0 0 5px ${mix(GOLD, 45)}${glow}">
                ${halves}${two ? '<span class="pl-core__seam" aria-hidden="true"></span>' : ''}</div>`);
            const veilR = px(L.veil);
            L.centres.forEach((p, i) => out.push(`<span class="pl-tag pl-tag--core pl-tag--${i === 0 ? 'a' : 'b'}" aria-hidden="true"
                style="top:${i === 0 ? C - veilR - 14 : C + veilR + 14}px">${esc(p.name)}</span>`));
            // Laid over the centre: a moon resting on the rim of the half it lies over
            // (the first half faces upper right, the second lower left); several spread along it
            const rim = D / 2 + 4, M = Math.max(20, Math.round(D * 0.34));
            L.overlays.forEach(p => {
                const overIdx = Math.max(0, L.centres.findIndex(c => c.id === p.over));
                const same = L.overlays.filter(q => Math.max(0, L.centres.findIndex(c => c.id === q.over)) === overIdx);
                const k = same.indexOf(p);
                const a = (overIdx === 1 ? 225 : 45) + (k - (same.length - 1) / 2) * 46;
                const sx = Math.sin(a * Math.PI / 180), sy = -Math.cos(a * Math.PI / 180);
                const x = C + rim * sx, y = C + rim * sy;
                out.push(`<button type="button" class="pl-orb pl-orb--moon${sy < -0.3 ? ' is-up' : ''}${state.sel === p.id ? ' is-sel' : ''}" data-plane="${esc(p.id)}" aria-pressed="${state.sel === p.id}" aria-label="${esc(p.name)}, laid over ${esc((store.get(p.over) || {}).name || 'the centre')}"
                    style="left:${Math.round(x - M / 2)}px;top:${Math.round(y - M / 2)}px;width:${M}px;height:${M}px;--sx:${Math.round(-9 * sx)}px;--sy:${Math.round(-9 * sy)}px">${medal(p, M, false)}<span class="pl-name">${esc(p.name)}</span></button>`);
            });
        }
        // The circles: each turns as one
        const orbitsOf = c => L.circling.filter(p => Math.max(1, Math.round(Number(p.circle) || 1)) === c);
        L.circles.forEach((c, ci) => {
            const R = px(L.circleR[c]);
            const list = orbitsOf(c);
            const period = 150 + ci * 80;
            const z = orbSize(P, ci);
            const { o, q } = satGeom(z);
            list.forEach((p, i) => {
                const sealed = !open(p);
                const a = p.angle !== undefined && p.angle !== '' && p.angle !== null ? Number(p.angle) : (360 / list.length) * i;
                const roads = sealed ? '' : roadsTo(p).map(rd => `<span class="pl-road" data-of="${esc(rd.from.id)}" style="--c:${rd.colour};top:${z / 2}px;height:${Math.max(0, R - px(rd.r) - z / 2)}px"></span>`).join('');
                const threads = roads + (sealed ? '' : touching.map(b => `<span class="pl-thread" data-of="${esc(b.p.id)}" style="--c:${colourOf(b.p)};top:${-(px(b.mid) - R)}px;height:${Math.max(0, px(b.mid) - R - z / 2)}px"></span>`).join(''));
                out.push(`<div class="pl-arm" style="left:${C}px;top:${C}px;transform:rotate(${a}deg)">
                    <div class="pl-spin" style="animation-duration:${period}s">
                        <div class="pl-arm" style="transform:translateY(${-R}px)">${threads}
                            <div class="pl-spin pl-spin--back" style="animation-duration:${period}s">
                                <div class="pl-arm" style="transform:rotate(${-a}deg)">
                                    <button type="button" class="pl-orb${state.sel === p.id ? ' is-sel' : ''}" data-plane="${esc(p.id)}" aria-pressed="${state.sel === p.id}" aria-label="${esc(nameOf(p))}"
                                        style="left:${-z / 2}px;top:${-z / 2}px;width:${z}px;height:${z}px">${medal(p, z, sealed)}<span class="pl-name">${esc(nameOf(p))}</span></button>
                                    ${satellites(p, o, q)}
                                </div></div></div></div></div>`);
            });
        });
        // Satellites: small moons turning around their plane, on a path of their own
        function satellites(p, o, q) {
            const list = satsOf(p);
            if (!list.length) return '';
            return `<span class="pl-satpath" aria-hidden="true" style="left:${-o}px;top:${-o}px;width:${2 * o}px;height:${2 * o}px;--c:${colourOf(p)}"></span>`
                + list.map((m, i) => {
                    const sealed = !open(m);
                    const a = m.angle !== undefined && m.angle !== '' && m.angle !== null ? Number(m.angle) : (360 / list.length) * i;
                    return `<div class="pl-arm" style="transform:rotate(${a}deg)"><div class="pl-spin pl-spin--sat">
                        <div class="pl-arm" style="transform:translateY(${-o}px)"><div class="pl-spin pl-spin--sat pl-spin--back">
                            <div class="pl-arm" style="transform:rotate(${-a}deg)">
                                <button type="button" class="pl-orb pl-orb--sat${state.sel === m.id ? ' is-sel' : ''}" data-plane="${esc(m.id)}" aria-pressed="${state.sel === m.id}" aria-label="${esc(nameOf(m))}, a satellite of ${esc(p.name)}"
                                    style="left:${-q / 2}px;top:${-q / 2}px;width:${q}px;height:${q}px">${medal(m, q, sealed)}<span class="pl-name">${esc(nameOf(m))}</span></button>
                            </div></div></div></div></div>`;
                }).join('');
        }
        // Beyond the circles: the medallions on their bands
        L.beyondBands.forEach(({ p, mid }, i) => {
            const sealed = !open(p);
            const z = Math.max(30, Math.min(56, px(0.064)));
            const a = p.angle !== undefined && p.angle !== '' && p.angle !== null ? Number(p.angle) : (i * 180);
            const x = C + px(mid) * Math.sin(a * Math.PI / 180), y = C - px(mid) * Math.cos(a * Math.PI / 180);
            const below = Math.cos(a * Math.PI / 180) < -0.3;
            out.push(`<button type="button" class="pl-orb pl-orb--beyond${below ? ' is-below' : ''}${state.sel === p.id ? ' is-sel' : ''}" data-plane="${esc(p.id)}" data-beyond="${esc(p.id)}" aria-pressed="${state.sel === p.id}" aria-label="${esc(nameOf(p))}"
                style="left:${Math.round(x - z / 2)}px;top:${Math.round(y - z / 2)}px;width:${z}px;height:${z}px">${medal(p, z, sealed)}<span class="pl-name">${esc(nameOf(p))}</span></button>`);
        });
        plate.innerHTML = out.join('');
        plate.classList.toggle('is-still', state.still);
        lightThreads();
    }

    /* ---------- threads and bands: lit by the plane beyond chosen or hovered ---------- */
    let hovered = null;
    function lightThreads() {
        const on = new Set([hovered, state.sel].filter(Boolean));
        plate.querySelectorAll('.pl-thread, .pl-road').forEach(t => t.classList.toggle('is-on', on.has(t.dataset.of)));
        plate.querySelectorAll('.pl-band').forEach(b => b.classList.toggle('is-lit', on.has(b.dataset.band)));
    }
    // Hovering any plane lights what is its own: the threads of a plane beyond, the roads of the Underworld
    const beyondOf = e => { const b = e.target.closest && e.target.closest('[data-plane]'); return b ? b.dataset.plane : null; };
    plate.addEventListener('pointerover', e => { const id = beyondOf(e); if (id !== hovered) { hovered = id; lightThreads(); } });
    plate.addEventListener('pointerleave', () => { hovered = null; lightThreads(); });
    plate.addEventListener('focusin', e => { hovered = beyondOf(e); lightThreads(); });
    plate.addEventListener('focusout', () => { hovered = null; lightThreads(); });

    /* ---------- the panel ---------- */
    function whereOf(p) {
        switch (p.kind || 'circle') {
            case 'centre': {
                const other = L.centres.find(c => c.id !== p.id);
                return other ? `At the centre, with ${other.name}` : 'At the centre';
            }
            case 'overlay': return `Laid over ${(store.get(p.over) || {}).name || 'the centre'}`;
            case 'ring': return 'Around the centre';
            case 'beneath': return 'Beneath the centre';
            case 'circle': return circleName(Math.max(1, Math.round(Number(p.circle) || 1)));
            case 'satellite': return `A satellite of ${(store.get(p.orbits) || {}).name || 'a plane'}`;
            case 'beyond': return p.touchesAll ? 'Beyond the circles · touches every plane' : 'Beyond the circles';
            case 'between': return 'Between the planes';
            case 'demiplane': return p.anchor ? `Anchored to ${(store.get(p.anchor) || {}).name || p.anchor}` : 'A demiplane';
        }
        return '';
    }
    function legendRows() {
        const row = (p, sub) => {
            const sealed = !open(p);
            return `<button type="button" class="pl-leg${sub ? ' pl-leg--sub' : ''}" data-plane="${esc(p.id)}">${medal(p, sub ? 22 : 28, sealed, 'pl-medal--mini')}
                <span class="pl-leg__name${sealed ? ' is-sealed' : ''}">${esc(nameOf(p))}</span></button>`;
        };
        // A plane, then what lies over it or turns around it, set in under it
        const withSubs = (p, subs) => row(p) + subs.map(m => row(m, true)).join('');
        const group = (title, html) => (html ? `<p class="pl-label pl-label--muted pl-leg__head">${esc(title)}</p>${html}` : '');
        const overIdx = q => Math.max(0, L.centres.findIndex(c => c.id === q.over));
        const atCentre = L.centres.map((c, i) => withSubs(c, L.overlays.filter(q => overIdx(q) === i))).join('')
            + (L.centres.length ? '' : L.overlays.map(q => row(q)).join(''))
            + [...(L.beneath ? [L.beneath] : []), ...L.ringBands.map(b => b.p)].map(q => row(q)).join('');
        return [
            group('At the centre', atCentre),
            ...L.circles.map(c => group(circleName(c), L.circling.filter(p => Math.max(1, Math.round(Number(p.circle) || 1)) === c).map(p => withSubs(p, satsOf(p))).join(''))),
            group('Beyond the circles', L.beyondBands.map(b => row(b.p)).join('')),
            group('Between the planes', L.between ? row(L.between) : ''),
        ].join('');
    }
    function renderPanel() {
        const p = state.sel && all.find(x => x.id === state.sel);
        if (!p || p.kind === 'demiplane') {
            panel.innerHTML = `<p class="pl-label">The cosmos</p><div class="pl-legend">${legendRows()}</div>`;
            return;
        }
        const sealed = !open(p);
        const links = sealed ? [] : (p.links || []).map(linkName).filter(Boolean);
        // Who dwells there: its residents known in this campaign, gods of the Pantheon among them
        const dwellers = sealed ? [] : (p.groups || []).flatMap(g => (g && g.members) || [])
            .filter(m => m && (m.name || m.deity) && memberRevealed(store, p, m, campaign))
            .map(m => {
                const v = memberView(store, m);
                const name = v.god ? linkName(v.god.id)
                    : store.autolink(esc(v.name), { campaign }) || esc(v.name);
                return `<li>${name}${v.title ? ` <span class="pl-detail__who">${esc(v.title)}</span>` : ''}</li>`;
            });
        const sum = sealed ? `Its place is charted, but nothing of it has been learned yet${campaign && campaign !== 'all' ? ` in ${esc((store.get(campaign) || {}).name || '')}` : ''}.`
            : p.summary ? store.autolink(esc(p.summary), { exclude: p.id }) : '';
        panel.innerHTML = `<button type="button" class="pl-back" data-action="clear"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>All planes</button>
            <div class="pl-detail">
                ${medal(p, 86, sealed, 'pl-medal--big')}
                <p class="pl-label">${esc(sealed ? whereOf({ ...p, touchesAll: false }) : whereOf(p))}</p>
                <h2 class="pl-detail__name${sealed ? ' is-sealed' : ''}">${esc(sealed ? 'A sealed plane' : p.name)}</h2>
                ${!sealed && p.epithet ? `<p class="pl-detail__epithet">${esc(p.epithet)}</p>` : ''}
                ${sum ? `<p class="pl-detail__sum">${sum}</p>` : ''}
                ${dwellers.length ? `<p class="pl-label pl-label--muted pl-detail__h">Who dwells there</p><ul class="pl-detail__links">${dwellers.slice(0, 6).join('')}${dwellers.length > 6 ? `<li><a href="${esc(store.url(p) || '#')}#residents">and ${dwellers.length - 6} more</a></li>` : ''}</ul>` : ''}
                ${links.length ? `<p class="pl-label pl-label--muted pl-detail__h">Spoken of in</p><ul class="pl-detail__links">${links.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
                ${!sealed && store.url(p) ? `<a class="pl-cta" href="${esc(store.url(p))}">Enter the plane<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a>` : ''}
            </div>`;
    }

    /* ---------- demiplanes ---------- */
    function renderDemis() {
        const list = of('demiplane');
        $('pl-demis').hidden = !list.length;
        $('pl-demis-list').innerHTML = list.map(p => {
            if (!open(p)) return `<div class="pl-glass pl-demi is-sealed"><span class="pl-demi__icon"><span class="material-symbols-outlined" aria-hidden="true">lock</span></span>
                <div><h3 class="pl-demi__name">A demiplane not yet found</h3></div></div>`;
            const links = (p.links || []).map(linkName).filter(Boolean);
            return `<article class="pl-glass pl-demi" id="demi-${esc(p.id)}" style="--c:${colourOf(p)}">
                <div class="pl-demi__top"><span class="pl-demi__icon">${iconHtml(p, 44, false)}</span>
                    <div><h3 class="pl-demi__name"><a href="${esc(store.url(p) || '#')}">${esc(p.name)}</a></h3>${p.anchor ? `<p class="pl-label pl-label--muted">Anchored to · ${esc((store.get(p.anchor) || {}).name || p.anchor)}</p>` : ''}</div></div>
                ${p.summary ? `<p class="pl-demi__sum">${store.autolink(esc(p.summary), { exclude: p.id })}</p>` : ''}
                ${p.way ? `<p class="pl-demi__way"><span class="pl-label">Way in · </span>${store.autolink(esc(p.way), { exclude: p.id })}</p>` : ''}
                ${links.length ? `<p class="pl-demi__links">${links.join('<span aria-hidden="true"> · </span>')}</p>` : ''}
            </article>`;
        }).join('');
    }

    /* ---------- choosing ---------- */
    function choose(id) {
        state.sel = id && state.sel !== id ? id : null;
        const url = new URL(location.href);
        if (state.sel) url.searchParams.set('plane', state.sel); else url.searchParams.delete('plane');
        history.replaceState(null, '', url);
        draw();
        renderPanel();
        // keep the keyboard where it was
        if (state.sel) {
            const again = plate.querySelector(`[data-plane="${CSS.escape(state.sel)}"]`);
            if (again && document.activeElement && document.activeElement.closest && document.activeElement.closest('#orrery')) again.focus({ preventScroll: true });
        }
    }
    plate.addEventListener('click', e => {
        const b = e.target.closest('[data-plane]');
        if (b) choose(b.dataset.plane);
    });
    panel.addEventListener('click', e => {
        const b = e.target.closest('[data-plane], [data-action="clear"]');
        if (!b) return;
        if (b.dataset.action === 'clear') { choose(null); panel.querySelector('.pl-leg') && panel.querySelector('.pl-leg').focus(); return; }
        choose(b.dataset.plane);
        if (window.matchMedia('(max-width: 1099.98px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.sel) choose(null); });

    /* ---------- controls ---------- */
    const picker = $('pl-campaign');
    if (picker && campaigns.length) {
        Athenaeum.personae.picker(picker, { campaigns, value: campaign, allowAll: true, onChange: v => { campaign = v; draw(); renderPanel(); renderDemis(); } });
    }
    const still = $('pl-still');
    still.addEventListener('click', () => {
        state.still = !state.still;
        still.setAttribute('aria-pressed', String(state.still));
        still.classList.toggle('is-on', state.still);
        still.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${state.still ? 'play_arrow' : 'pause'}</span><span>${state.still ? 'Set in motion' : 'Hold still'}</span>`;
        plate.classList.toggle('is-still', state.still);
    });

    // Drawn again when the orrery changes width (not on every pixel)
    let lastW = 0, timer = null;
    new ResizeObserver(() => {
        const w = Math.round(plate.clientWidth);
        if (w === lastW) return;
        lastW = w;
        clearTimeout(timer);
        timer = setTimeout(draw, 80);
    }).observe(plate);

    if (state.sel && !all.some(p => p.id === state.sel)) state.sel = null;
    draw();
    renderPanel();
    renderDemis();
    if (state.sel && (all.find(p => p.id === state.sel) || {}).kind === 'demiplane') {
        const card = $('demi-' + state.sel);
        if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
});
