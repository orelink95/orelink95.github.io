/* =====================================================================
   PLANE THEMES — the decoration of a plane's page (plane.html)
   ---------------------------------------------------------------------
   A plane's page takes the theme of its look (record.look.theme, the
   planeTheme enum of data/schema.js). Two halves:
     - colours, fonts and the look of the boxes: .look--plane-<id> in
       styles/looks.css (set by scripts/core/look.js like any page look)
     - what is drawn around the page: Athenaeum.planeThemes[<id>] here
   A theme here is { decorate(ctx) }, called each time the page is drawn
   (and again when its width changes). ctx:
     back, front   two layers over the whole page (behind / over the text);
                   the theme fills them with HTML
     sigil         the box around the plane's medallion (things orbit it)
     width, height the size of the page, in px
     phone         true under 768px
     still         true when the reader asks for less motion
   Everything is drawn from a seed, so it looks the same at each visit.
   To add a theme: its entry in planeTheme (schema), its .look--plane-<id>
   rule (looks.css), and, if it draws anything, an entry here.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    /* ---------- drawing helpers (SVG strings) ---------- */
    const n1 = v => Math.round(v * 10) / 10;
    function rng(seed) {
        let x = seed >>> 0 || 1;
        const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
        return { u: (a, b) => a + (b - a) * r(), c: list => list[Math.floor(r() * list.length) % list.length] };
    }
    const leafPath = (L, W) => `M0 0 C${n1(L * 0.25)} ${n1(-W)} ${n1(L * 0.7)} ${n1(-W * 0.9)} ${n1(L)} 0 C${n1(L * 0.7)} ${n1(W * 0.9)} ${n1(L * 0.25)} ${n1(W)} 0 0Z`;
    const leaf = (x, y, ang, L, W, fill, vein) =>
        `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(ang)})"><path d="${leafPath(L, W)}" fill="${fill}"/>${vein ? `<path d="M0 0 L${n1(L * 0.92)} 0" stroke="${vein}" stroke-width="${n1(Math.max(0.6, W * 0.08))}" fill="none"/>` : ''}</g>`;
    function curve(p0, p1, p2, n) {
        const pts = [];
        for (let k = 0; k <= n; k++) {
            const t = k / n;
            const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
            const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
            const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
            const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
            pts.push([x, y, Math.atan2(dy, dx) * 180 / Math.PI, t]);
        }
        return pts;
    }
    // A fern frond along a curve, its leaflets shrinking to the tip
    function fern(p0, p1, p2, size, fill, vein, R, stem, cls) {
        const out = [`<path d="M${n1(p0[0])} ${n1(p0[1])} Q${n1(p1[0])} ${n1(p1[1])} ${n1(p2[0])} ${n1(p2[1])}" stroke="${stem || fill}" stroke-width="${n1(size * 0.12)}" fill="none" stroke-linecap="round"/>`];
        curve(p0, p1, p2, 22).slice(1, -1).forEach(([x, y, a, t]) => {
            const L = size * (1 - t * 0.85) * R.u(0.85, 1.1), W = L * 0.22;
            out.push(leaf(x, y, a - 62, L, W, fill, vein), leaf(x, y, a + 62, L, W, fill, vein));
        });
        return cls ? `<g class="${cls}">${out.join('')}</g>` : out.join('');
    }
    // A band of foliage: overlapping leaf clusters hanging from the top
    function canopy(y0, width, depth, col, R, n, rmin, rmax) {
        let s = '';
        for (let k = 0; k < n; k++) {
            const x = R.u(-40, width + 40), r = R.u(rmin, rmax);
            const y = y0 + R.u(-depth * 0.2, depth) * (1 - Math.abs(x - width / 2) / width * 0.4);
            s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}"/>`;
        }
        return `<g fill="${col}">${s}</g>`;
    }
    // Vines and glowing pods hanging from the top edge
    function hanging(width, R, greens, pods, n, ymax) {
        let s = '';
        for (let k = 0; k < n; k++) {
            const x = R.u(-20, width + 20), L = R.u(60, ymax);
            s += `<path d="M${n1(x)} -5 q${n1(R.u(-30, 30))} ${n1(L * 0.5)} ${n1(R.u(-20, 20))} ${n1(L)}" stroke="#2b3a24" stroke-width="${n1(R.u(1.2, 2.4))}" fill="none"/>`;
            for (let j = 0; j < Math.floor(L / 26); j++) {
                s += leaf(x + R.u(-6, 6), 10 + j * 26 + R.u(-6, 6), 90 + (R.u(0, 1) < 0.5 ? -1 : 1) * R.u(30, 70), R.u(18, 32), R.u(6, 10), R.c(greens), 'rgba(0,0,0,.3)');
            }
            if (R.u(0, 1) < 0.4) {
                const c = R.c(pods);
                s += `<ellipse cx="${n1(x)}" cy="${n1(L + 10)}" rx="${n1(R.u(5, 8))}" ry="${n1(R.u(9, 13))}" fill="${c}" class="pt-glow" style="--c:${c};animation-delay:${n1(-R.u(0, 5))}s"/>`;
            }
        }
        for (let k = 0; k < width / 18; k++) s += leaf(R.u(-30, width + 30), R.u(-10, 30), 90 + R.u(-70, 70), R.u(30, 60), R.u(10, 18), R.c(greens), 'rgba(0,0,0,.3)');
        return s;
    }
    // Specks of light drifting up
    function motes(n, w, h, cols, R, rmin = 0.8, rmax = 2.2) {
        let s = '';
        for (let k = 0; k < n; k++) {
            const c = R.c(cols), d = n1(R.u(rmin, rmax) * 2);
            s += `<span class="pt-mote" style="left:${n1(R.u(0, w))}px;top:${n1(R.u(0, h))}px;width:${d}px;height:${d}px;--c:${c};animation-delay:${n1(-R.u(0, 14))}s;animation-duration:${n1(R.u(9, 18))}s"></span>`;
        }
        return s;
    }
    // Shards of colour orbiting the medallion
    function shards(n, r0, r1, cols, R, size) {
        let s = '';
        for (let k = 0; k < n; k++) {
            const c = cols[k % cols.length], r = R.u(r0, r1), a = R.u(0, 360), dur = R.u(26, 60), dir = R.u(0, 1) < 0.5 ? 'reverse' : 'normal', z = R.u(size[0], size[1]);
            s += `<span class="pt-orbit" style="--r:${n1(r)}px;--a:${n1(a)}deg;animation-duration:${n1(dur)}s;animation-direction:${dir}">
                <span class="pt-shard" style="--c:${c};width:${n1(z)}px;height:${n1(z * 1.35)}px;animation-delay:${n1(-R.u(0, 8))}s"></span></span>`;
        }
        return s;
    }

    const themes = ATH.planeThemes = ATH.planeThemes || {};

    /* ---------- Verdant Wilds (Ydalheim): under the canopy ----------
       Foliage and glowing pods hang over the top of the page, shafts of light
       come through, specks drift; the page ends on a forest floor of ferns
       and luminous mushrooms; shards of wild colour orbit the medallion. */
    themes.ydalheim = {
        decorate({ back, front, sigil, width: W, height: H, phone }) {
            const R = rng(37);
            const greens = ['#2d6b3f', '#3a8450', '#24573a', '#4f9a5c', '#1d4a2f'];
            // The canopy is drawn 1280 wide and cropped to the page (a phone sees its middle)
            const CW = 1280, CH = 360;
            let can = '';
            [['#0b2014', 190, 34, 70], ['#123221', 150, 28, 56], ['#1a4a2c', 110, 22, 44], ['#246039', 70, 16, 34]]
                .forEach(([col, d, rmin, rmax], i) => { can += canopy(-40 + i * 10, CW, d, col, R, Math.floor(CW / (rmin * 0.55)), rmin, rmax); });
            for (let k = 0; k < 260; k++) can += leaf(R.u(-20, CW + 20), R.u(0, 170) * (1 - 0.3 * R.u(0, 1)), R.u(0, 360), R.u(22, 40), R.u(7, 12), R.c(greens), 'rgba(0,0,0,.3)');
            can += hanging(CW, R, greens.slice(0, 4), ['#c8ff8a', '#7ff5d1', '#ffcf6b'], 22, 300);
            const canH = phone ? 230 : CH;
            const crop = phone ? `${(CW - CW * (W / (canH * CW / CH))) / 2} 0 ${CW * (W / (canH * CW / CH))} ${CH}` : `0 0 ${CW} ${CH}`;
            const rays = [[180, 120], [420, 70], [620, 160], [900, 90], [1060, 130]]
                .map(([x, w]) => `<span class="pt-ray" style="left:${n1(x / CW * 100)}%;width:${n1(w * W / CW)}px;animation-delay:${n1(-R.u(0, 10))}s"></span>`).join('');
            // The forest floor
            let floor = '';
            const ferns = phone ? 8 : 16, k = W / 1280;
            for (let i = 0; i < ferns; i++) {
                const x = R.u(-40, W + 40), s = R.u(24, 40) * (phone ? 0.8 : 1);
                floor += fern([x, H + 10], [x + R.u(-90, 90) * k, H - R.u(140, 220)], [x + R.u(-160, 160) * k, H - R.u(220, 360)], s, R.c(['#1f5a37', '#2a7046', '#357f52']), 'rgba(0,0,0,.25)', R, '#1d3f28', 'pt-sway');
            }
            for (let i = 0; i < (phone ? 5 : 9); i++) {
                const x = R.u(30, W - 30), y = H - R.u(10, 60), r = R.u(8, 16), c = R.c(['#ffcf6b', '#7ff5d1', '#ff8ad8']);
                floor += `<rect x="${n1(x - 2)}" y="${n1(y)}" width="4" height="${n1(r * 1.6)}" fill="#cbbf9a"/><path d="M${n1(x - r)} ${n1(y)} Q${n1(x)} ${n1(y - r * 1.3)} ${n1(x + r)} ${n1(y)}Z" fill="${c}" class="pt-glow" style="--c:${c};animation-delay:${n1(-R.u(0, 5))}s"/>`;
            }
            back.innerHTML = `<div class="pt-rays" style="height:${phone ? 700 : 900}px">${rays}</div>
                <svg class="pt-floor" viewBox="0 ${H - 420} ${W} 420" style="height:420px" aria-hidden="true">${floor}</svg>`;
            front.innerHTML = `<svg class="pt-canopy" viewBox="${crop}" preserveAspectRatio="xMidYMin slice" style="height:${canH}px" aria-hidden="true">${can}</svg>
                <div class="pt-motes">${motes(phone ? 18 : 40, W, H, ['#ffe7a8', '#ffe7a8', '#fff6d8', '#c8ff8a', '#ff8ad8'], R)}</div>`;
            const box = sigil.getBoundingClientRect().width || (phone ? 250 : 330);
            const medal = phone ? 150 : 200;
            sigil.insertAdjacentHTML('afterbegin', `<span class="pt-shards" aria-hidden="true">${shards(7, medal / 2 + 22, box / 2 - 6, ['#c8ff5a', '#3ff0c8', '#ff5fb8', '#9b7bff', '#ffd36b', '#7fd0a2', '#5fd0ff'], rng(4), phone ? [10, 16] : [12, 22])}</span>`);
            return { topSpace: canH - (phone ? 70 : 170) };
        },
    };

    /* ---------- The Abyss (the Void): everything falls into the medallion ----------
       Near-black. Rings close in on the medallion and vanish into it, streaks of
       light are pulled towards it, a colossal broken spire hangs upside down far
       off, a few shards of rock drift. The medallion itself is the hole. Rings
       and streaks are plain HTML elements (their movement does not depend on how
       a browser centres SVG transforms). */
    // A shard of rock torn off: a thin top and a jagged mass tapering to a point
    function rock(w, R, top, side, edge) {
        const h = w * R.u(0.05, 0.09), n = Math.max(8, Math.round(w / 14)), depth = w * R.u(0.45, 0.8);
        const tip = R.u(0.3, 0.7), H = h + depth + 4, y0 = 2;
        const tops = []; for (let k = 0; k <= n; k++) tops.push([w * k / n, y0 + R.u(-h * 0.22, h * 0.22)]);
        const under = [];
        for (let k = n * 2; k >= 0; k--) {
            const t = k / (n * 2), d = Math.max(0, 1 - Math.abs(t - tip) * 2.2) ** 1.6;
            under.push([w * t + R.u(-w * 0.012, w * 0.012), y0 + h + w * 0.04 * R.u(0, 1) + d * depth * R.u(0.8, 1.05)]);
        }
        const pts = a => a.map(([x, y]) => `${n1(x)} ${n1(y)}`).join(' L');
        const body = `M${pts(tops)} L${pts(under)}Z`;
        const face = `M${pts(tops)} L${pts(tops.slice().reverse().map(([x, y]) => [x, y + h * 0.9]))}Z`;
        return { svg: `<svg viewBox="0 0 ${n1(w)} ${n1(H)}" width="${n1(w)}" height="${n1(H)}" aria-hidden="true"><path d="${body}" fill="${side}"/><path d="${face}" fill="${top}"/><path d="M${pts(tops)}" fill="none" stroke="${edge}" stroke-opacity=".55" stroke-width="1.2"/></svg>`, h: H };
    }

    themes.void = {
        decorate({ back, sigil, width: W, height: H, phone }) {
            const R = rng(9);
            const box = back.getBoundingClientRect(), sb = sigil.getBoundingClientRect();
            const cx = sb.left - box.left + sb.width / 2, cy = sb.top - box.top + sb.height / 2;
            const [rx, ry, reach] = phone ? [560, 520, 560] : [1100, 760, 1100];
            let html = `<div class="pt-abyss" style="left:${n1(cx)}px;top:${n1(cy)}px;width:${phone ? 840 : 1400}px;height:${phone ? 720 : 1000}px"></div>`;
            // The colossal spire, far off at the right, hanging upside down
            const sx = phone ? W - 90 : W * 0.75, k = phone ? 0.5 : 1;
            const sp = [[0, -40], [200, -40], [160, 260], [130, 240], [108, 520], [80, 470], [50, 780], [36, 520], [18, 560], [6, 300], [-20, 330]];
            html += `<svg class="pt-spire" viewBox="0 0 ${n1(W)} ${n1(Math.min(H, 900))}" style="height:${n1(Math.min(H, 900))}px" aria-hidden="true"><path d="M${sp.map(([x, y]) => `${n1(sx + x * k)} ${n1(y > 0 ? y * k : y)}`).join(' L')}Z" fill="#0e1119"/></svg>`;
            // Rings closing in on the medallion
            for (let i = 0; i < 8; i++) html += `<span class="pt-ring" style="left:${n1(cx - rx)}px;top:${n1(cy - ry)}px;width:${2 * rx}px;height:${2 * ry}px;animation-delay:${-i * 2.5}s"></span>`;
            // Streaks pulled towards it
            for (let i = 0; i < (phone ? 40 : 70); i++) {
                const a = R.u(0, 360), r0 = R.u(110, reach), L = R.u(14, 70);
                html += `<span class="pt-streak" style="left:${n1(cx)}px;top:${n1(cy)}px;transform:rotate(${n1(a)}deg) scaleY(.75)"><i style="--r:${n1(r0)}px;width:${n1(L)}px;opacity:${n1(R.u(0.08, 0.3))};height:${n1(R.u(0.5, 1.4))}px;animation-delay:${n1(-R.u(0, 9))}s"></i></span>`;
            }
            // A few shards of rock adrift
            const shards = phone ? [[0.03, 0.55, 70], [0.78, 0.4, 60], [0.1, 0.85, 50]] : [[0.06, 0.62, 120], [0.84, 0.5, 90], [0.16, 0.34, 50], [0.73, 0.88, 70]];
            shards.forEach(([fx, fy, w], i) => {
                const r = rock(w, R, '#1b2028', '#090b0f', '#6c7a8e');
                html += `<div class="pt-drift" style="left:${n1(fx * W)}px;top:${n1(fy * H)}px;opacity:${i > 1 ? 0.5 : 0.7};${w < 60 ? 'filter:blur(1.2px);' : ''}animation-delay:${n1(-R.u(0, 20))}s;animation-duration:${n1(R.u(16, 28))}s">${r.svg}</div>`;
            });
            back.innerHTML = html;
            // A thin ring turning around the hole
            sigil.insertAdjacentHTML('afterbegin', '<span class="pt-sigil pt-hole" aria-hidden="true"></span>');
            return {};
        },
    };
})(typeof window !== 'undefined' ? window : globalThis);
