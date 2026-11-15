/* =====================================================================
   SKY — a night sky drawn on a <canvas> behind a page: drifting nebulae,
   two slowly turning galaxies, stars that drift and twinkle (three layers,
   the nearer ones faster, with a little parallax when the page scrolls),
   a shooting star now and then, and constellations that light up one at a
   time, hold, and fade.
       Athenaeum.sky(document.getElementById('sky'));
   The canvas fills the window (position: fixed, behind the page). Readers
   who ask their system for less motion get a still sky with one
   constellation. Nothing is drawn while the tab is hidden.
   Used by timeline.html.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    // Constellations: points in a 0–1 box and the lines between them
    const SHAPES = [
        { pts: [[0, .8], [.25, .5], [.5, .6], [.7, .2], [1, .35], [.6, 1]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]] },
        { pts: [[.1, .1], [.4, .3], [.3, .7], [.7, .9], [.9, .5]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]] },
        { pts: [[0, .5], [.25, .25], [.5, .4], [.7, .1], [1, .55], [.7, .85], [.5, .4]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 2]] },
        { pts: [[.5, 0], [.5, .35], [.15, .6], [.85, .6], [.5, 1]], lines: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4]] },
        { pts: [[0, .3], [.3, .1], [.55, .35], [.8, .2], [1, .6], [.4, .9]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]] },
    ];
    const GOLD = [233, 193, 118], LILAC = [183, 156, 245];

    function sky(canvas, { density = 1 } = {}) {
        if (!canvas || !canvas.getContext) return null;
        const ctx = canvas.getContext('2d');
        const still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let W = 0, H = 0, dpr = 1, stars = [], nebulae = [], galaxies = [], shooting = null, constellation = null;
        let nextShoot = 4000, nextConst = 2500, last = 0, raf = 0;
        const rnd = (a, b) => a + Math.random() * (b - a);

        // A galaxy, drawn once on its own canvas: a bright core and two spiral arms of dots
        function galaxySprite(size, tint) {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const g = c.getContext('2d'), r = size / 2;
            const core = g.createRadialGradient(r, r, 0, r, r, r * .35);
            core.addColorStop(0, 'rgba(255,246,220,.9)'); core.addColorStop(1, 'rgba(255,226,170,0)');
            g.fillStyle = core; g.fillRect(0, 0, size, size);
            for (let arm = 0; arm < 2; arm++) {
                for (let i = 0; i < 260; i++) {
                    const t = i / 260, a = arm * Math.PI + t * 4.2, d = t * r * .95;
                    const x = r + Math.cos(a) * d + rnd(-1, 1) * r * .08, y = r + Math.sin(a) * d + rnd(-1, 1) * r * .08;
                    g.fillStyle = `rgba(${tint.join(',')},${(1 - t) * .55})`;
                    g.fillRect(x, y, 1.2, 1.2);
                }
            }
            return c;
        }

        function build() {
            dpr = Math.min(root.devicePixelRatio || 1, 2);
            W = root.innerWidth; H = root.innerHeight;
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = Math.round((W * H) / 3200 * density);
            stars = Array.from({ length: n }, () => {
                const layer = Math.random() < .7 ? 0 : Math.random() < .75 ? 1 : 2;
                const tint = Math.random();
                return {
                    x: Math.random() * W, y: Math.random() * H, layer,
                    r: [rnd(.3, .8), rnd(.7, 1.3), rnd(1.2, 2)][layer],
                    a: rnd(.35, .95), tw: rnd(.4, 1.6), ph: rnd(0, 6.3),
                    c: tint < .12 ? '255,231,184' : tint < .22 ? '217,204,255' : '255,255,255',
                };
            });
            nebulae = [
                { x: .15, y: .25, r: .55, c: '88,40,150', a: .32, s: rnd(0, 6) },
                { x: .85, y: .65, r: .6, c: '30,60,140', a: .3, s: rnd(0, 6) },
                { x: .4, y: .95, r: .5, c: '120,40,110', a: .22, s: rnd(0, 6) },
                { x: .7, y: .1, r: .35, c: '233,193,118', a: .07, s: rnd(0, 6) },
            ];
            galaxies = [
                { x: .82, y: .18, size: Math.min(W, 900) * .2, tilt: .45, rot: rnd(0, 6), sp: .012, img: galaxySprite(256, LILAC) },
                { x: .08, y: .72, size: Math.min(W, 900) * .13, tilt: .4, rot: rnd(0, 6), sp: -.009, img: galaxySprite(256, [255, 200, 220]) },
            ];
        }

        function spawnConstellation() {
            const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            const w = rnd(140, 240), h = w * rnd(.55, .8);
            constellation = {
                shape, x: rnd(20, Math.max(40, W - w - 20)), y: rnd(80, Math.max(120, H - h - 40)), w, h,
                c: Math.random() < .6 ? GOLD : LILAC, t: 0, life: 9000,
            };
        }

        function draw(dt, time) {
            ctx.clearRect(0, 0, W, H);
            const scroll = root.scrollY || 0;
            // nebulae: big soft lights that breathe and drift
            for (const n of nebulae) {
                const k = time / 1000 * .03 + n.s;
                const x = (n.x + Math.sin(k) * .03) * W, y = (n.y + Math.cos(k * .8) * .03) * H, r = n.r * Math.max(W, H);
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(${n.c},${n.a})`); g.addColorStop(1, `rgba(${n.c},0)`);
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
            }
            // galaxies: tilted discs turning very slowly
            for (const g of galaxies) {
                g.rot += g.sp * dt / 1000;
                ctx.save();
                ctx.translate(g.x * W, g.y * H - scroll * .02);
                ctx.scale(1, g.tilt); ctx.rotate(g.rot);
                ctx.globalAlpha = .55;
                ctx.drawImage(g.img, -g.size / 2, -g.size / 2, g.size, g.size);
                ctx.restore();
            }
            ctx.globalAlpha = 1;
            // stars: drift up, the nearer layers faster; twinkle
            const speed = [3, 6, 11];       // px per second
            const para = [.02, .05, .1];    // parallax with the page's scroll
            for (const s of stars) {
                s.y -= speed[s.layer] * dt / 1000;
                if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
                const y = ((s.y - scroll * para[s.layer]) % (H + 8) + H + 8) % (H + 8) - 4;
                const tw = s.layer ? .55 + .45 * Math.sin(time / 1000 * s.tw + s.ph) : 1;
                ctx.fillStyle = `rgba(${s.c},${s.a * tw})`;
                ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, 6.283); ctx.fill();
                if (s.layer === 2) {
                    ctx.fillStyle = `rgba(${s.c},${.12 * tw})`;
                    ctx.beginPath(); ctx.arc(s.x, y, s.r * 3.2, 0, 6.283); ctx.fill();
                }
            }
            // a constellation: lights up, holds, fades
            if (constellation) {
                const c = constellation;
                c.t += dt;
                const fade = Math.min(1, c.t / 1800, (c.life - c.t) / 1800);
                if (fade <= 0 && c.t > 1000) constellation = null;
                else {
                    const P = c.shape.pts.map(([px, py]) => [c.x + px * c.w, c.y + py * c.h]);
                    ctx.strokeStyle = `rgba(${c.c.join(',')},${.5 * fade})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    for (const [a, b] of c.shape.lines) { ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); }
                    ctx.stroke();
                    for (const [x, y] of P) {
                        ctx.fillStyle = `rgba(255,243,214,${.9 * fade})`;
                        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.283); ctx.fill();
                        ctx.fillStyle = `rgba(${c.c.join(',')},${.25 * fade})`;
                        ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.283); ctx.fill();
                    }
                }
            }
            // a shooting star
            if (shooting) {
                const s = shooting;
                s.t += dt;
                const p = s.t / s.life;
                if (p >= 1) shooting = null;
                else {
                    const x = s.x + s.dx * p, y = s.y + s.dy * p;
                    const tail = ctx.createLinearGradient(x, y, x - s.dx * .18, y - s.dy * .18);
                    const a = Math.sin(p * Math.PI);
                    tail.addColorStop(0, `rgba(255,255,255,${a})`); tail.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.strokeStyle = tail; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s.dx * .18, y - s.dy * .18); ctx.stroke();
                }
            }
        }

        function frame(time) {
            const dt = last ? Math.min(64, time - last) : 16;
            last = time;
            nextShoot -= dt; nextConst -= dt;
            if (nextShoot <= 0 && !shooting) {
                shooting = { x: rnd(W * .3, W), y: rnd(0, H * .4), dx: -rnd(300, 520), dy: rnd(140, 260), t: 0, life: rnd(700, 1100) };
                nextShoot = rnd(7000, 16000);
            }
            if (nextConst <= 0 && !constellation) { spawnConstellation(); nextConst = rnd(9000, 15000); }
            draw(dt, time);
            raf = root.requestAnimationFrame(frame);
        }

        build();
        if (still) {
            spawnConstellation(); constellation.t = 3000;
            draw(0, 0);
        } else raf = root.requestAnimationFrame(frame);

        let rt = 0;
        root.addEventListener('resize', () => {
            clearTimeout(rt);
            rt = setTimeout(() => { build(); if (still) draw(0, 0); }, 150);
        });
        if (still) root.addEventListener('scroll', () => draw(0, 0), { passive: true });
        return { stop: () => root.cancelAnimationFrame(raf) };
    }

    ATH.sky = sky;
})(typeof window !== 'undefined' ? window : globalThis);
