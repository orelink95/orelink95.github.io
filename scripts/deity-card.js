/* =====================================================================
   DEITY CARD  —  the markup of a god's card (styles: styles/deity-card.css)
   Used by the Pantheon (pantheon.html), a god's page (deity.html) and the
   dashboard's preview.

   Athenaeum.deityCard.card(deity, options)  -> the card
       options.tag      'a' (default, needs options.href) or 'div'
       options.href     where the card leads
       options.picture  src => attributes of the <img>s (default: src="…")
   Athenaeum.deityCard.sealed(options)       -> a sealed slot (an Elder god
                                                 not revealed yet): no name
   Athenaeum.deityCard.tierOf(deity)         -> 'creator' | 'great' | 'minor' |
                                                 'primordial' | 'elder'

   One frame per tier, drawn in SVG on a 280 × 540 grid that scales with the
   card (the card is as wide as its box; text sizes follow in cqw):
       portrait window  x 34–246, y 78–396 (2:3, arched top)
       name plaque      x 34–246, y 410–492
       medallion        centred on (140, 64), the top of the arch
   The god's `colour` (CSS --deity) lights the gems and the glow; the frames
   themselves are built once per tier and cached. Gradients and patterns live
   in one hidden <svg> added to the page on first use (ensureDefs).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const srcAttr = src => `src="${esc(src)}"`;

    const TIERS = ['creator', 'great', 'minor', 'primordial', 'elder'];
    const tierOf = d => (d && TIERS.includes(d.tier) ? d.tier : 'great');

    /* ------------------------------------------------------------ geometry */
    const CX = 140, CY = 144;      // centre of the arch ellipses
    const MX = 140, MY = 64;       // medallion centre
    const n1 = v => String(Math.round(v * 10) / 10);
    const ACCENT = 'style="fill: var(--deity)"';

    // The card's outline, d units inside
    function outer(d) {
        const rx = 120 - d, ry = 80 - d, xl = 20 + d, xr = 260 - d, yb = 506 - d, r = Math.max(12 - d, 1.5);
        return `M${n1(xl)} ${CY} A${n1(rx)} ${n1(ry)} 0 0 1 ${n1(xr)} ${CY} L${n1(xr)} ${n1(yb - r)} ` +
            `Q${n1(xr)} ${n1(yb)} ${n1(xr - r)} ${n1(yb)} L${n1(xl + r)} ${n1(yb)} Q${n1(xl)} ${n1(yb)} ${n1(xl)} ${n1(yb - r)} Z`;
    }
    // The portrait window, d units outside
    function windowShape(d) {
        const rx = 106 + d, ry = 66 + d, xl = 34 - d, xr = 246 + d, yb = 396 + d;
        return `M${n1(xl)} ${CY} A${n1(rx)} ${n1(ry)} 0 0 1 ${n1(xr)} ${CY} L${n1(xr)} ${n1(yb)} L${n1(xl)} ${n1(yb)} Z`;
    }
    // The name plaque, d units outside
    function plaque(d) {
        const xl = 34 - d, xr = 246 + d, yt = 410 - d, yb = 492 + d, r = Math.max(3 + d, 1);
        return `M${n1(xl + r)} ${n1(yt)} L${n1(xr - r)} ${n1(yt)} Q${n1(xr)} ${n1(yt)} ${n1(xr)} ${n1(yt + r)} L${n1(xr)} ${n1(yb - r)} ` +
            `Q${n1(xr)} ${n1(yb)} ${n1(xr - r)} ${n1(yb)} L${n1(xl + r)} ${n1(yb)} Q${n1(xl)} ${n1(yb)} ${n1(xl)} ${n1(yb - r)} ` +
            `L${n1(xl)} ${n1(yt + r)} Q${n1(xl)} ${n1(yt)} ${n1(xl + r)} ${n1(yt)} Z`;
    }
    const FRAME = `${outer(0)} ${windowShape(0)} ${plaque(0)}`;
    const BAR = 'M27 403 L253 403';     // the band between portrait and plaque
    const JOINTS = [[27, 144], [253, 144], [27, 403], [253, 403], [27, 499], [253, 499]];

    // Evenly spaced points along the middle of the band (outer(d)):
    // arch left to right, right side down, bottom, left side up. [x, y, tx, ty, s]
    function loopPoints(d, step) {
        const rx = 120 - d, ry = 80 - d, xl = 20 + d, xr = 260 - d, yb = 506 - d;
        const pts = [];
        for (let i = 0; i <= 400; i++) {
            const t = Math.PI - Math.PI * i / 400;
            pts.push([CX + rx * Math.cos(t), CY - ry * Math.sin(t)]);
        }
        for (let y = CY + 1; y <= yb; y++) pts.push([xr, y]);
        for (let x = Math.floor(xr) - 1; x >= Math.floor(xl); x--) pts.push([x, yb]);
        for (let y = Math.floor(yb) - 1; y >= CY; y--) pts.push([xl, y]);
        const out = [];
        let acc = 0, target = 0;
        for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            const seg = Math.hypot(x1 - x0, y1 - y0);
            if (!seg) continue;
            while (target <= acc + seg) {
                const k = (target - acc) / seg;
                out.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, (x1 - x0) / seg, (y1 - y0) / seg, target]);
                target += step;
            }
            acc += seg;
        }
        return out;
    }
    const nearMedallion = (x, y, rad) => Math.hypot(x - MX, y - MY) < rad;
    // Small seeded random numbers, so a frame is the same on every load
    function seeded(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ------------------------------------------------------------ small pieces */
    function star(cx, cy, r, inner, n = 4, rot = 0) {
        const pts = [];
        for (let i = 0; i < 2 * n; i++) {
            const a = (rot + 180 * i / n - 90) * Math.PI / 180;
            const rr = i % 2 === 0 ? r : inner;
            pts.push(`${n1(cx + rr * Math.cos(a))},${n1(cy + rr * Math.sin(a))}`);
        }
        return 'M' + pts.join(' L') + ' Z';
    }
    // A ring of pointed rays around the medallion
    function rayRing(n, r0, rLong, rShort, halfDeg, fill, stroke, sw = 0.8) {
        let s = '';
        for (let i = 0; i < n; i++) {
            const a = 360 * i / n;
            const rt = i % 2 === 0 ? rLong : rShort;
            const rad = deg => (deg - 90) * Math.PI / 180;
            const a0 = rad(a - halfDeg), a1 = rad(a + halfDeg), am = rad(a);
            s += `<path d="M${n1(MX + r0 * Math.cos(a0))} ${n1(MY + r0 * Math.sin(a0))} L${n1(MX + rt * Math.cos(am))} ${n1(MY + rt * Math.sin(am))} ` +
                `L${n1(MX + r0 * Math.cos(a1))} ${n1(MY + r0 * Math.sin(a1))} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
        }
        return s;
    }
    function rosette(cx, cy, r, petal, edge) {
        let s = `<circle cx="${cx}" cy="${cy}" r="${n1(r + 0.8)}" fill="${edge}"/>`;
        for (let i = 0; i < 8; i++) {
            const a = 45 * i;
            const px = cx + r * 0.55 * Math.cos(a * Math.PI / 180), py = cy + r * 0.55 * Math.sin(a * Math.PI / 180);
            s += `<ellipse cx="${n1(px)}" cy="${n1(py)}" rx="${n1(r * 0.5)}" ry="${n1(r * 0.26)}" fill="${petal}" stroke="${edge}" stroke-width="0.5" transform="rotate(${a} ${n1(px)} ${n1(py)})"/>`;
        }
        s += `<circle cx="${cx}" cy="${cy}" r="${n1(r * 0.38)}" ${ACCENT} stroke="${edge}" stroke-width="0.6"/>`;
        s += `<circle cx="${n1(cx - r * 0.12)}" cy="${n1(cy - r * 0.14)}" r="${n1(r * 0.12)}" fill="#ffffff" opacity="0.7"/>`;
        return s;
    }
    function lozenge(cx, cy, w, h, fill, edge) {
        return `<path d="M${cx} ${cy - h} L${cx + w} ${cy} L${cx} ${cy + h} L${cx - w} ${cy} Z" fill="${fill}" stroke="${edge}" stroke-width="0.8"/>` +
            `<path d="M${cx} ${n1(cy - h * 0.55)} L${n1(cx + w * 0.5)} ${cy} L${cx} ${n1(cy + h * 0.55)} L${n1(cx - w * 0.5)} ${cy} Z" ${ACCENT} stroke="${edge}" stroke-width="0.6"/>`;
    }
    // Acanthus scroll (gold tier), placed with a transform
    const SCROLL_STEMS = ['M0 0 C8 -18 26 -26 40 -20 C52 -14 50 2 38 4 C30 5 27 -4 33 -8 C37 -10 41 -6 38 -3',
        'M6 -8 C2 -24 -6 -34 -18 -36 C-28 -37 -32 -26 -24 -22 C-19 -20 -16 -25 -19 -28'];
    const SCROLL_LEAVES = ['M14 -14 C18 -26 30 -30 36 -32 C30 -24 24 -16 14 -14 Z',
        'M4 -6 C-2 -16 -2 -24 2 -32 C6 -24 8 -14 4 -6 Z',
        'M20 -2 C28 -2 34 4 36 10 C30 8 24 6 20 -2 Z'];
    function scroll(transform, dark, light, leaf) {
        return `<g transform="${transform}" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
            SCROLL_STEMS.map(p => `<path d="${p}" stroke="${dark}" stroke-width="4.6"/>`).join('') +
            SCROLL_LEAVES.map(p => `<path d="${p}" fill="${leaf}" stroke="${dark}" stroke-width="1.2"/>`).join('') +
            SCROLL_STEMS.map(p => `<path d="${p}" stroke="${light}" stroke-width="2"/>`).join('') +
            `<path d="M14 -14 C20 -20 28 -26 34 -30" stroke="${light}" stroke-width="0.6"/></g>`;
    }
    // Fan of leaves hanging under the card
    function palmette(cx, cy, dark, leaf, light) {
        let s = '';
        for (const a of [-56, -28, 0, 28, 56]) {
            const L = a === 0 ? 22 : Math.abs(a) === 28 ? 18 : 13;
            const tr = `translate(${cx} ${cy}) rotate(${-a})`;
            s += `<path d="M0 0 C-4 ${n1(L * 0.4)} -3 ${n1(L * 0.8)} 0 ${L} C3 ${n1(L * 0.8)} 4 ${n1(L * 0.4)} 0 0 Z" fill="${leaf}" stroke="${dark}" stroke-width="1" transform="${tr}"/>`;
            s += `<path d="M0 2 L0 ${L - 3}" stroke="${light}" stroke-width="0.6" transform="${tr}"/>`;
        }
        return s + `<circle cx="${cx}" cy="${cy}" r="4" fill="${leaf}" stroke="${dark}" stroke-width="1"/>`;
    }
    const LEAF = 'M0 0 C2 -3 6 -4 9 -2 C6 0 3 1 0 0 Z';
    const BIG_LEAF = 'M0 0 C3 -4 9 -5 13 -2 C9 1 4 2 0 0 Z';
    const RUNES = ['M0 -5 L0 5 M0 -1.5 L3.5 -5', 'M-2.5 -5 L0 5 L2.5 -5', 'M0 -5 L0 5 M-3.5 -1 L3.5 -1',
        'M-2.5 -5 L2.5 5 M2.5 -5 L-2.5 5', 'M0 -5 L0 5 M0 -5 L3.5 -1.5 L0 2', 'M-3.5 5 L0 -5 L3.5 5 M-1.8 1 L1.8 1',
        'M-2.5 -5 L-2.5 5 M-2.5 0 L2.5 -5 M-2.5 0 L2.5 5', 'M0 -5 L0 5 M-3 -3 L3 3'];
    const mirror = inner => `<g transform="translate(280 0) scale(-1 1)">${inner}</g>`;

    /* ------------------------------------------------------------ the tiers */
    // edge: dark outline · light: highlight · fillet: thin line round the portrait
    const STYLE = {
        creator: { edge: '#8f7d57', light: '#ffffff', fillet: '#fff6e0', disc: 30,
            stops: [[0, '#fffdf6'], [0.18, '#e9dcba'], [0.34, '#f8eeff'], [0.48, '#fff8e6'], [0.6, '#e2f4f5'], [0.76, '#f0e3c2'], [1, '#c2ae82']] },
        great: { edge: '#3d2a05', light: '#fff1c9', fillet: '#f3d58f', disc: 30,
            stops: [[0, '#6e4c14'], [0.16, '#f3d58f'], [0.3, '#b8892f'], [0.48, '#fbe9b4'], [0.64, '#a77b2c'], [0.82, '#f0cf86'], [1, '#7a561a']] },
        minor: { edge: '#3f2614', light: '#f0c89c', fillet: '#d9a676', disc: 23,
            stops: [[0, '#5e3b1f'], [0.25, '#c8915c'], [0.5, '#8c5a33'], [0.7, '#d9a676'], [1, '#6e4526']] },
        primordial: { edge: '#1b120a', light: '#a37a4a', fillet: '#8a6238', disc: 26,
            stops: [[0, '#2c1e12'], [0.28, '#6b4a2b'], [0.52, '#3a2716'], [0.78, '#7a5532'], [1, '#2a1c10']] },
        elder: { edge: '#000000', light: '#5a2a6e', fillet: '#8e2a5e', disc: 27,
            stops: [[0, '#09070c'], [0.22, '#2a1b33'], [0.45, '#0d0a12'], [0.68, '#241629'], [1, '#07050a']] },
        sealed: { edge: '#000000', light: '#3d2450', fillet: '#4a2a5a', disc: 27,
            stops: [[0, '#070509'], [0.22, '#1c1222'], [0.45, '#0a080d'], [0.68, '#18101c'], [1, '#050307']] },
    };

    // Shared gradients and patterns (ids prefixed dc-)
    function defs() {
        let d = '';
        for (const [key, t] of Object.entries(STYLE)) {
            const stops = t.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
            d += `<linearGradient id="dc-${key}-mat" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
            d += `<radialGradient id="dc-${key}-ring" cx="0.35" cy="0.3" r="0.8">${stops}</radialGradient>`;
        }
        d += `<clipPath id="dc-frame-clip"><path d="${FRAME}" clip-rule="evenodd"/></clipPath>`;
        d += '<pattern id="dc-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="#5d4201" stroke-width="0.6" opacity="0.35"/></pattern>';
        d += '<pattern id="dc-facets" width="14" height="12" patternUnits="userSpaceOnUse"><path d="M0 0 L14 0 L7 12 Z" fill="#ffffff" fill-opacity="0.035" stroke="#7a3c9a" stroke-opacity="0.22" stroke-width="0.5"/><path d="M7 12 L14 0 L14 12 Z" fill="#000000" fill-opacity="0.25"/></pattern>';
        d += '<linearGradient id="dc-sheen" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#ffc8e6" stop-opacity="0.5"/><stop offset="0.35" stop-color="#c8f0ff" stop-opacity="0"/><stop offset="0.6" stop-color="#d8ffe8" stop-opacity="0.45"/><stop offset="1" stop-color="#e8d0ff" stop-opacity="0.4"/></linearGradient>';
        return `<svg class="deity-card-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>${d}</defs></svg>`;
    }
    function ensureDefs() {
        if (typeof document === 'undefined' || !document.body || document.querySelector('.deity-card-defs')) return;
        document.body.insertAdjacentHTML('afterbegin', defs());
    }

    // Material, edges and fillets: drawn over the portrait
    function frameBody(key) {
        const t = STYLE[key], e = t.edge, l = t.light;
        let s = `<path d="${FRAME}" fill="url(#dc-${key}-mat)" fill-rule="evenodd"/>`;
        if (key === 'great') s += `<path d="${FRAME}" fill="url(#dc-hatch)" fill-rule="evenodd"/>`;
        if (key === 'creator') s += `<path d="${FRAME}" fill="url(#dc-sheen)" fill-rule="evenodd"/>`;
        if (key === 'elder' || key === 'sealed') s += `<path d="${FRAME}" fill="url(#dc-facets)" fill-rule="evenodd"/>`;
        if (key === 'minor') {
            // verdigris
            s += '<g clip-path="url(#dc-frame-clip)" fill="#5f8c7a">' +
                '<ellipse cx="34" cy="470" rx="34" ry="60" opacity="0.5"/><ellipse cx="250" cy="200" rx="26" ry="50" opacity="0.4"/>' +
                '<ellipse cx="190" cy="502" rx="40" ry="10" opacity="0.35"/><ellipse cx="60" cy="96" rx="30" ry="16" opacity="0.3"/></g>';
        }
        if (key === 'primordial') {
            // wood grain
            for (const [dd, da] of [[2, '30 4 12 3'], [4.5, '18 5 40 3'], [7, '50 3 9 4'], [9.5, '22 6 30 2'], [12, '40 3 15 5']]) {
                s += `<path d="${outer(dd)}" fill="none" stroke="#1b120a" stroke-width="0.7" stroke-dasharray="${da}" opacity="0.6"/>`;
            }
            s += `<path d="${BAR}" fill="none" stroke="#1b120a" stroke-width="0.7" stroke-dasharray="26 4 10 3" opacity="0.6"/>`;
        }
        s += `<path d="${outer(0)}" fill="none" stroke="${e}" stroke-width="1.8"/>`;
        s += `<path d="${outer(1.6)}" fill="none" stroke="${l}" stroke-width="0.8" opacity="0.85"/>`;
        if (key === 'creator' || key === 'great' || key === 'elder') {
            for (const p of [outer(3.6), windowShape(3.6), plaque(3.6)]) s += `<path d="${p}" fill="none" stroke="${e}" stroke-width="0.7" opacity="0.7"/>`;
        }
        for (const shape of [windowShape, plaque]) {
            s += `<path d="${shape(0)}" fill="none" stroke="${e}" stroke-width="1.8"/>`;
            s += `<path d="${shape(1.6)}" fill="none" stroke="${l}" stroke-width="0.8" opacity="0.85"/>`;
            s += `<path d="${shape(-1.4)}" fill="none" stroke="${t.fillet}" stroke-width="1.6" opacity="0.9"/>`;
        }
        return s;
    }

    // What runs along the middle of the band
    function bandDetail(key) {
        const t = STYLE[key], e = t.edge, l = t.light;
        let s = '';
        if (key === 'great') {
            for (const p of [outer(7), BAR]) {
                s += `<path d="${p}" fill="none" stroke="${e}" stroke-width="4.6" stroke-dasharray="0 7.2" stroke-linecap="round"/>`;
                s += `<path d="${p}" fill="none" stroke="#f7e2a6" stroke-width="3.2" stroke-dasharray="0 7.2" stroke-linecap="round"/>`;
                s += `<path d="${p}" fill="none" stroke="#fffaf0" stroke-width="1.1" stroke-dasharray="0 7.2" stroke-linecap="round" opacity="0.75"/>`;
            }
        } else if (key === 'creator') {
            for (const p of [outer(2.6), windowShape(2.6)]) s += `<path d="${p}" fill="none" stroke="#b9a57a" stroke-width="2.4" stroke-dasharray="0.7 2.6" opacity="0.7"/>`;
            for (const p of [outer(7.4), BAR]) {
                s += `<path d="${p}" fill="none" stroke="#9c8f73" stroke-width="5.4" stroke-dasharray="0 8.4" stroke-linecap="round"/>`;
                s += `<path d="${p}" fill="none" stroke="#fffdf8" stroke-width="4.2" stroke-dasharray="0 8.4" stroke-linecap="round"/>`;
                s += `<path d="${p}" fill="none" stroke="#ffd6ec" stroke-width="1.6" stroke-dasharray="0 8.4" stroke-linecap="round" opacity="0.55"/>`;
            }
        } else if (key === 'minor') {
            for (const p of [outer(7), BAR]) s += `<path d="${p}" fill="none" stroke="#4a2d17" stroke-width="5" stroke-dasharray="2 2.8" opacity="0.55"/>`;
            for (const p of [outer(4), windowShape(4)]) s += `<path d="${p}" fill="none" stroke="${l}" stroke-width="0.6" opacity="0.6"/>`;
        } else if (key === 'primordial') {
            // A vine winding round the frame, a leaf at every bend
            const pts = loopPoints(7, 2), A = 3.2, P = 26;
            const vine = pts.map(([x, y, tx, ty, sv], i) => {
                const o = A * Math.sin(2 * Math.PI * sv / P);
                return `${i ? 'L' : 'M'}${n1(x - ty * o)} ${n1(y + tx * o)}`;
            }).join(' ');
            s += `<path d="${vine}" fill="none" stroke="#24331a" stroke-width="2.8"/><path d="${vine}" fill="none" stroke="#5f7d3a" stroke-width="1.5"/>`;
            const L = pts[pts.length - 1][4];
            for (let sv = P / 4, k = 0; sv < L; sv += P / 2, k++) {
                const [x, y, tx, ty] = pts[Math.min(Math.floor(sv / 2), pts.length - 1)];
                const sign = k % 2 === 0 ? 1 : -1;
                const px = x - ty * sign * A, py = y + tx * sign * A;
                const ang = Math.atan2(ty, tx) * 180 / Math.PI + (sign > 0 ? -50 : 230);
                if (nearMedallion(px, py, 46)) continue;
                s += `<path d="${LEAF}" fill="${k % 3 ? '#6f8f3e' : '#94b35a'}" stroke="#1f2a12" stroke-width="0.5" transform="translate(${n1(px)} ${n1(py)}) rotate(${n1(ang)}) scale(1.05)"/>`;
            }
        } else if (key === 'elder' || key === 'sealed') {
            // Runes carved round the frame
            const pts = loopPoints(7, 1);
            const L = pts[pts.length - 1][4];
            let glyphs = '';
            for (let sv = 6, k = 0; sv < L; sv += 16) {
                const [x, y, tx, ty] = pts[Math.floor(sv)];
                if (nearMedallion(x, y, 52) || Math.abs(y - 403) <= 6) continue;
                glyphs += `<path d="${RUNES[k++ % RUNES.length]}" transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(Math.atan2(ty, tx) * 180 / Math.PI)}) scale(0.8)"/>`;
            }
            const [col, glow, dur, vals] = key === 'elder'
                ? ['#ff6fa8', '#c2185b', '3.6s', '0.4;1;0.4'] : ['#7a4a92', '#4a2a5a', '7s', '0.2;0.5;0.2'];
            s += `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="${vals}" dur="${dur}" repeatCount="indefinite"/>` +
                `<g stroke="${glow}" stroke-width="3" opacity="0.35">${glyphs}</g><g stroke="${col}" stroke-width="1.1">${glyphs}</g></g>`;
            if (key === 'elder') {
                // Cracks glowing in the obsidian
                const rnd = seeded(7);
                const cracks = [[260, 9], [700, 8], [1050, 10], [1350, 7], [140, 6]].map(([start, n]) => {
                    let seg = '';
                    for (let j = 0; j < n; j++) {
                        const [x, y, tx, ty] = pts[Math.min(start + j * 9, pts.length - 1)];
                        const o = rnd() * 9 - 4.5;
                        seg += `${j ? 'L' : 'M'}${n1(x - ty * o)} ${n1(y + tx * o)} `;
                    }
                    return seg;
                }).join('');
                s += '<g fill="none" stroke-linecap="round" stroke-linejoin="round"><animate attributeName="opacity" values="1;0.3;1" dur="3.6s" repeatCount="indefinite"/>' +
                    `<path d="${cracks}" stroke="#8e3cc9" stroke-width="3" opacity="0.35"/><path d="${cracks}" stroke="#c98aff" stroke-width="0.9"/></g>`;
            }
        }
        return s;
    }

    // The joints of the band: rosettes, stars, rivets, amber, studs
    function joints(key) {
        const t = STYLE[key], e = t.edge;
        let s = '';
        const sides = [[27, 274], [253, 274]];
        if (key === 'great') {
            for (const [x, y] of JOINTS) s += rosette(x, y, 6.2, '#f3d58f', e);
            for (const [x, y] of sides) s += lozenge(x, y, 5.5, 13, '#f7e2a6', e);
        } else if (key === 'creator') {
            for (const [x, y] of JOINTS) {
                s += `<path d="${star(x, y, 9, 2.4)}" fill="#ffffff" stroke="#9c8f73" stroke-width="0.6"/>`;
                s += `<path d="${star(x, y, 5.5, 1.6, 4, 45)}" fill="#fff6e0" stroke="#9c8f73" stroke-width="0.5"/>`;
                s += `<circle cx="${x}" cy="${y}" r="2.2" ${ACCENT} stroke="#9c8f73" stroke-width="0.5"/>`;
            }
        } else if (key === 'minor') {
            for (const [x, y] of JOINTS.concat(sides)) {
                s += `<circle cx="${x}" cy="${y}" r="3.6" fill="#e8bd8f" stroke="${e}" stroke-width="1"/><circle cx="${x - 1}" cy="${y - 1}" r="1.2" fill="#fff0dc" opacity="0.8"/>`;
            }
        } else if (key === 'primordial') {
            for (const [x, y] of JOINTS.concat(sides)) {
                s += `<circle cx="${x}" cy="${y}" r="6.4" fill="#2a1c10"/><circle cx="${x}" cy="${y}" r="5" fill="#e0a03a" stroke="#7a4a12" stroke-width="0.8"/>` +
                    `<circle cx="${x}" cy="${y}" r="2.6" fill="#ffc85a" opacity="0.6"/><circle cx="${x - 1.6}" cy="${y - 1.8}" r="1.3" fill="#fff3d6" opacity="0.85"/>`;
            }
        } else {
            const gem = key === 'elder' ? ACCENT : 'fill="#3a1430"';
            for (const [x, y] of JOINTS) {
                s += `<path d="M${x} ${y - 8} L${x + 4} ${y} L${x} ${y + 8} L${x - 4} ${y} Z" fill="#0d0a12" stroke="${t.light}" stroke-width="0.8"/><circle cx="${x}" cy="${y}" r="2" ${gem}/>`;
            }
        }
        return s;
    }

    // Under everything: rays of light, branches, thorns
    function behind(key) {
        const t = STYLE[key];
        let s = '';
        if (key === 'creator') {
            for (let i = 0; i < 36; i++) {
                const a = 10 * i;
                if (a > 100 && a < 260) continue;   // none pointing down into the card
                const long = i % 2 === 0, rt = long ? 118 : 84, hw = long ? 1.8 : 1.1, r0 = 44;
                const rad = deg => (deg - 90) * Math.PI / 180;
                s += `<path d="M${n1(MX + r0 * Math.cos(rad(a - hw)))} ${n1(MY + r0 * Math.sin(rad(a - hw)))} L${n1(MX + rt * Math.cos(rad(a)))} ${n1(MY + rt * Math.sin(rad(a)))} ` +
                    `L${n1(MX + r0 * Math.cos(rad(a + hw)))} ${n1(MY + r0 * Math.sin(rad(a + hw)))} Z" fill="#fff6e0" opacity="${long ? 0.5 : 0.32}"/>`;
            }
            s += `<circle cx="${MX}" cy="${MY}" r="60" fill="none" stroke="#fff6e0" stroke-width="0.8" opacity="0.4"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="66" fill="none" stroke="#dcf1f2" stroke-width="0.5" opacity="0.3" stroke-dasharray="1 3"/>`;
        }
        if (key === 'primordial') {
            const branch = (d, w1, w2) => `<path d="${d}" stroke="#1b120a" stroke-width="${w1}"/><path d="${d}" stroke="#6b4a2b" stroke-width="${w2}"/>`;
            const half = '<g fill="none" stroke-linecap="round">' +
                branch('M108 58 C92 58 74 70 59 86 C46 100 36 112 30 124 C24 136 20 150 18 166', 7, 4.2) +
                '<path d="M108 57 C92 57 74 69 59 85 C46 99 36 111 30 123" stroke="#a37a4a" stroke-width="1"/>' +
                branch('M80 70 C74 58 64 52 52 52', 4, 2.2) + branch('M44 106 C34 98 24 98 14 104', 3.6, 2) +
                branch('M62 82 C60 70 54 64 46 62', 2.6, 1.3) + '</g>';
            s += half + mirror(half);
        }
        if (key === 'elder' || key === 'sealed') {
            const th = [];
            for (let i = 1; i < 16; i++) {
                const tt = Math.PI * i / 16;
                const x = CX + 120 * Math.cos(tt), y = CY - 80 * Math.sin(tt);
                if (nearMedallion(x, y, 50)) continue;
                let nx = (x - CX) / 14400, ny = (y - CY) / 6400;
                const n = Math.hypot(nx, ny); nx /= n; ny /= n;
                const L = i % 2 ? 9 : 6, tx = -ny, ty = nx;
                th.push(`M${n1(x + tx * 3.2)} ${n1(y + ty * 3.2)} L${n1(x + nx * L)} ${n1(y + ny * L)} L${n1(x - tx * 3.2)} ${n1(y - ty * 3.2)} Z`);
            }
            for (let y = 186; y < 500; y += 34) {
                const L = Math.floor(y / 34) % 2 ? 8 : 5;
                th.push(`M20 ${y - 3} L${20 - L} ${y} L20 ${y + 3} Z`, `M260 ${y - 3} L${260 + L} ${y} L260 ${y + 3} Z`);
            }
            s += `<path d="${th.join(' ')}" fill="#0d0a12" stroke="${t.light}" stroke-width="0.8"/>`;
        }
        return s;
    }

    // Over everything: flourishes and the medallion's bezel
    function front(key) {
        const t = STYLE[key], e = t.edge, l = t.light;
        let s = '';
        if (key === 'great') {
            s += scroll('translate(104 74) scale(-0.62 0.62) rotate(-18)', e, l, '#e9c176');
            s += scroll('translate(176 74) scale(0.62 0.62) rotate(-18)', e, l, '#e9c176');
            s += scroll('translate(30 492) scale(0.52 0.52) rotate(-110)', e, l, '#e9c176');
            s += scroll('translate(250 492) scale(-0.52 0.52) rotate(-110)', e, l, '#e9c176');
            s += palmette(140, 506, e, '#e9c176', l);
        }
        if (key === 'creator') {
            for (const [x, y, r] of [[40, 120, 5], [240, 120, 5], [18, 330, 3.5], [262, 300, 3.5], [140, 520, 5], [60, 520, 3], [220, 520, 3]]) {
                s += `<path d="${star(x, y, r, r * 0.28)}" fill="#ffffff" opacity="0.9"/>`;
            }
            s += palmette(140, 506, '#9c8f73', '#fffdf6', '#c8f0ff');
        }
        if (key === 'primordial') {
            const root2 = (d, w1, w2) => `<path d="${d}" stroke="#1b120a" stroke-width="${w1}"/><path d="${d}" stroke="#5a3d24" stroke-width="${w2}"/>`;
            const half = '<g fill="none" stroke-linecap="round">' +
                root2('M30 508 C18 520 24 528 14 536', 6, 3.6) + root2('M50 508 C48 520 40 524 36 536', 4.4, 2.4) +
                root2('M22 470 C12 480 14 496 8 506', 4, 2.2) +
                '<path d="M14 506 C14 498 22 494 28 498 C34 492 44 496 46 502 C52 500 58 504 56 510 L14 510 Z" fill="#4f6b34" stroke="none"/>' +
                '<path d="M18 500 L17 494 M24 497 L25 490 M34 495 L33 489 M42 498 L44 492" stroke="#7a9a48" stroke-width="0.8"/></g>';
            s += half + mirror(half);
            for (const [x, y, a] of [[48, 50, -20], [56, 44, -55], [12, 104, 25], [18, 94, -30], [94, 52, -10], [40, 62, -40], [26, 130, -70]]) {
                const col = (x + y) % 2 ? '#6f8f3e' : '#94b35a';
                s += `<path d="${BIG_LEAF}" fill="${col}" stroke="#1f2a12" stroke-width="0.6" transform="translate(${x} ${y}) rotate(${a})"/>`;
                s += `<path d="${BIG_LEAF}" fill="${col}" stroke="#1f2a12" stroke-width="0.6" transform="translate(${280 - x} ${y}) rotate(${180 - a})"/>`;
            }
        }
        if (key === 'elder') {
            s += `<g fill="none"><animate attributeName="opacity" values="0.3;0.9;0.3" dur="5s" repeatCount="indefinite"/><circle cx="${MX}" cy="${MY}" r="62" stroke="#8e3cc9" stroke-width="0.6" stroke-dasharray="2 5"/></g>`;
        }
        // The medallion's bezel
        if (key === 'creator') {
            s += rayRing(32, 39, 52, 46, 4.2, '#fffdf6', '#9c8f73', 0.6);
            s += `<circle cx="${MX}" cy="${MY}" r="40" fill="url(#dc-creator-ring)" stroke="#8f7d57" stroke-width="1.4"/><circle cx="${MX}" cy="${MY}" r="40" fill="url(#dc-sheen)"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="35.5" fill="none" stroke="#9c8f73" stroke-width="4.4" stroke-dasharray="0 6.9" stroke-linecap="round"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="35.5" fill="none" stroke="#ffffff" stroke-width="3.3" stroke-dasharray="0 6.9" stroke-linecap="round"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="31" fill="none" stroke="#8f7d57" stroke-width="1.2"/>`;
        } else if (key === 'great') {
            s += rayRing(24, 38, 51, 45, 5.5, '#e9c176', e, 0.8);
            s += `<circle cx="${MX}" cy="${MY}" r="39.5" fill="url(#dc-great-ring)" stroke="${e}" stroke-width="1.6"/><circle cx="${MX}" cy="${MY}" r="39.5" fill="url(#dc-hatch)"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="37.6" fill="none" stroke="${l}" stroke-width="0.7"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="34.8" fill="none" stroke="${e}" stroke-width="4.4" stroke-dasharray="0 6.83" stroke-linecap="round"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="34.8" fill="none" stroke="#f7e2a6" stroke-width="3" stroke-dasharray="0 6.83" stroke-linecap="round"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="31" fill="none" stroke="${e}" stroke-width="1.4"/>`;
        } else if (key === 'minor') {
            s += `<circle cx="${MX}" cy="${MY}" r="31" fill="url(#dc-minor-ring)" stroke="${e}" stroke-width="1.6"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="28.6" fill="none" stroke="#4a2d17" stroke-width="3.4" stroke-dasharray="1.6 2.2" opacity="0.55"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="24.6" fill="none" stroke="${e}" stroke-width="1.2"/>`;
        } else if (key === 'primordial') {
            for (let i = 0; i < 14; i++) {
                const a = 360 * i / 14, rad = (a - 90) * Math.PI / 180;
                s += `<path d="${BIG_LEAF}" fill="${i % 2 ? '#6f8f3e' : '#94b35a'}" stroke="#1f2a12" stroke-width="0.6" transform="translate(${n1(MX + 44 * Math.cos(rad))} ${n1(MY + 44 * Math.sin(rad))}) rotate(${n1(a - 60)})"/>`;
            }
            s += `<circle cx="${MX}" cy="${MY}" r="39" fill="#3a2716" stroke="#1b120a" stroke-width="2.4" stroke-dasharray="6 1.5 3 1"/>`;
            for (const [r, c] of [[36, '#6b4a2b'], [33.5, '#4a3320'], [31, '#7a5532'], [28.8, '#4a3320']]) s += `<circle cx="${MX}" cy="${MY}" r="${r}" fill="none" stroke="${c}" stroke-width="2.4"/>`;
        } else {
            s += rayRing(12, 34, 58, 47, 6.5, '#0d0a12', l, 0.8);
            s += `<circle cx="${MX}" cy="${MY}" r="36.5" fill="url(#dc-${key}-ring)" stroke="${l}" stroke-width="1.2"/><circle cx="${MX}" cy="${MY}" r="36.5" fill="url(#dc-facets)"/>`;
            s += `<circle cx="${MX}" cy="${MY}" r="31.5" fill="none" stroke="${t.fillet}" stroke-width="1.4"/>`;
        }
        return s;
    }

    // A sealed slot: chains across the window and an unbroken wax seal
    function chainsAndSeal() {
        const sx = 140, sy = 250;
        let s = '';
        for (const ang of [40, 140]) {
            const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
            let links = '';
            for (let step = -12; step <= 12; step++) {
                const dist = step * 13;
                if (Math.abs(dist) < 30) continue;
                const x = sx + dx * dist, y = sy + dy * dist;
                if (!(x > 6 && x < 274 && y > 70 && y < 470)) continue;
                const [rx, ry] = step % 2 === 0 ? [10, 4.6] : [10, 1.6];
                links += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${rx}" ry="${ry}" transform="rotate(${ang} ${n1(x)} ${n1(y)})"/>`;
            }
            s += `<g fill="none" stroke="#120d16" stroke-width="5">${links}</g><g fill="none" stroke="#6d5a73" stroke-width="2.2">${links}</g>` +
                `<g fill="none" stroke="#b9a6c0" stroke-width="0.6" opacity="0.6">${links}</g>`;
        }
        const pts = [];
        for (let k = 0; k < 48; k++) {
            const tt = 2 * Math.PI * k / 48, r = k % 2 === 0 ? 38 : 34.5;
            pts.push(`${n1(sx + r * Math.cos(tt))},${n1(sy + r * Math.sin(tt))}`);
        }
        s += `<polygon points="${pts.join(' ')}" fill="#7a1840" stroke="#3a0a20" stroke-width="1.5"/>`;
        s += `<circle cx="${sx}" cy="${sy}" r="27" fill="#8e1f4c" stroke="#5a0f2e" stroke-width="2"/>`;
        s += `<circle cx="${sx}" cy="${sy}" r="21.5" fill="none" stroke="#c0457a" stroke-width="1" opacity="0.7"/>`;
        s += `<circle cx="${sx}" cy="${sy}" r="19.5" fill="none" stroke="#c0457a" stroke-width="2.4" stroke-dasharray="0.8 2.4" opacity="0.6"/>`;
        s += `<path d="M${sx} ${sy - 13} L${sx} ${sy + 13} M${sx - 8} ${sy - 6} L${sx} ${sy - 13} L${sx + 8} ${sy - 6} M${sx - 7} ${sy + 7} L${sx + 7} ${sy + 7}" fill="none" stroke="#f0b0cf" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
        s += `<ellipse cx="${sx - 10}" cy="${sy - 12}" rx="8" ry="3" fill="#ffffff" opacity="0.18" transform="rotate(-30 ${sx - 10} ${sy - 12})"/>`;
        return s;
    }

    // Built once per tier
    const cache = {};
    function frames(key) {
        if (!cache[key]) {
            cache[key] = {
                behind: behind(key),
                frame: frameBody(key) + bandDetail(key) + joints(key),
                front: front(key),
                extra: key === 'sealed' ? chainsAndSeal() : '',
            };
        }
        return cache[key];
    }
    const layer = (inner, cls = '') => inner
        ? `<svg class="deity-card__layer${cls}" viewBox="0 0 280 540" aria-hidden="true" focusable="false">${inner}</svg>` : '';

    // A figure standing in for a missing portrait
    const SILHOUETTE = '<svg class="deity-card__silhouette" viewBox="0 0 100 230" preserveAspectRatio="xMidYMax meet" aria-hidden="true">' +
        '<circle cx="50" cy="30" r="12"/><path d="M50 44 C42 44 36 48 33 56 L26 96 C24 104 27 108 31 104 L36 78 L30 222 L70 222 L64 78 L69 104 C73 108 76 104 74 96 L67 56 C64 48 58 44 50 44 Z"/></svg>';

    function shell(key, d, options, parts) {
        ensureDefs();
        const f = frames(key);
        const tag = options.tag || (options.href ? 'a' : 'div');
        const attrs = [
            `class="deity-card deity-card--${key}${options.className ? ' ' + options.className : ''}"`,
            tag === 'a' && options.href ? `href="${esc(options.href)}"` : '',
            parts.style ? `style="${parts.style}"` : '',
            parts.label ? `aria-label="${esc(parts.label)}"` : '',
            d && d.id ? `data-deity="${esc(d.id)}"` : '',
        ].filter(Boolean).join(' ');
        return `<${tag} ${attrs}>` +
            layer(f.behind) +
            `<span class="deity-card__window">${parts.window}</span>` +
            '<span class="deity-card__plaque-ground"></span>' +
            layer(f.frame, ' deity-card__frame') +
            layer(f.extra) +
            `<span class="deity-card__plaque">${parts.plaque}</span>` +
            layer(f.front) +
            `<span class="deity-card__medallion">${parts.medallion}</span>` +
            `</${tag}>`;
    }

    function card(d, options = {}) {
        const key = tierOf(d);
        const pic = options.picture || srcAttr;
        const colour = d.colour && (typeof CSS === 'undefined' || CSS.supports('color', d.colour)) ? d.colour : '';
        const focus = d.portraitFocus ? `object-position: ${esc(d.portraitFocus)}` : '';
        const domains = (d.domains || []).slice(0, 3);
        return shell(key, d, options, {
            style: colour ? `--deity: ${esc(colour)}` : '',
            label: [d.name, d.epithet].filter(Boolean).join(', '),
            window: d.portrait
                ? `<img class="deity-card__portrait" ${pic(d.portrait)} alt="" loading="lazy"${focus ? ` style="${focus}"` : ''}>`
                : SILHOUETTE,
            plaque: `<span class="deity-card__name">${esc(d.name)}</span>` +
                (d.epithet ? `<span class="deity-card__epithet">${esc(d.epithet)}</span>` : '') +
                (domains.length ? `<span class="deity-card__domains">${domains.map(esc).join(' · ')}</span>` : ''),
            medallion: d.symbol
                ? `<img class="deity-card__symbol" ${pic(d.symbol)} alt="" loading="lazy">`
                : `<span class="deity-card__icon material-symbols-outlined" aria-hidden="true">${esc(d.icon || 'brightness_7')}</span>`,
        });
    }

    const SEAL_RUNES = '<svg class="deity-card__runes" viewBox="0 0 110 18" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3 L12 15 M12 7 L16 3"/><path d="M31 3 L34 15 L37 3"/><path d="M52 3 L52 15 M48 8 L56 8"/><path d="M71 3 L77 15 M77 3 L71 15"/><path d="M94 3 L94 15 M94 3 L98 7 L94 11"/></g></svg>';
    const CRACKED = '<svg class="deity-card__cracked" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="11" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
        '<path d="M15 5 L13 12 L17 16 L14 25 M17 16 L22 18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

    function sealed(options = {}) {
        return shell('sealed', null, { tag: 'div', ...options }, {
            label: 'A sealed god, not yet revealed',
            window: '<span class="deity-card__mist"></span>',
            plaque: `${SEAL_RUNES}<span class="deity-card__sealed-label">Sealed</span>`,
            medallion: CRACKED,
        });
    }

    ATH.deityCard = { card, sealed, tierOf, TIERS, defs, ensureDefs };
})(typeof window !== 'undefined' ? window : globalThis);
