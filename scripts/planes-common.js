/* =====================================================================
   PLANES — shared by the orrery (planes.html) and a plane's page (plane.html)
   ---------------------------------------------------------------------
   Athenaeum.planes:
     colourOf(p)            the plane's colour (a well-formed one), else gold
     mix(c, pct)            colour-mix of c at pct % over transparent
     iconHtml(p, px, sealed)  its icon at px: an SVG of its own filled with its
                            colour (CSS mask), another picture as it is, or the
                            Material Symbols name in `icon`; a lock when sealed.
                            Sized by `iconScale` (%), moved by `iconX` / `iconY`
                            (% of the medallion), set in the dashboard
     medalStyle(p, sealed)  the flat medallion: dark disc, colour wash, rim, glow
     medal(p, px, sealed, cls)  the medallion as HTML
     circleOf(p)            its circle (1 = nearest the centre)
     circleName(n)          "The second circle"
     whereOf(store, p)      "The second circle", "Laid over The Material Plane"…
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const GOLD = '#e9c176';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const colourOf = p => (p && p.colour && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(String(p.colour).trim()) ? String(p.colour).trim() : GOLD);
    const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
    // Paths in the data are from the site's root (images/…)
    const src = path => (!path || /^([a-z]+:|\/)/i.test(path) ? path : (ATH.base || '') + path);

    // The symbol's size and place in its medallion (dashboard: Look). `translate`
    // adds to any transform the page already gives the icon (the centre's halves).
    const num = (v, d) => (v === undefined || v === null || v === '' || !isFinite(Number(v)) ? d : Number(v));
    const scaleOf = p => Math.min(1.6, Math.max(0.4, num(p.iconScale, 100) / 100));
    function shiftOf(p, px) {
        const x = Math.min(30, Math.max(-30, num(p.iconX, 0))), y = Math.min(30, Math.max(-30, num(p.iconY, 0)));
        return x || y ? `;translate:${Math.round(px * x) / 100}px ${Math.round(px * y) / 100}px` : '';
    }
    function iconHtml(p, px, sealed) {
        if (sealed) return `<span class="material-symbols-outlined pl-ic" aria-hidden="true" style="font-size:${Math.round(px * 0.5)}px;color:#7d7a8c">lock</span>`;
        const c = colourOf(p), size = Math.round(px * 0.56 * scaleOf(p));
        const glow = (p.glow ? `;filter:drop-shadow(0 0 ${Math.max(3, Math.round(px / 12))}px ${c})` : '') + shiftOf(p, px);
        if (p.iconImage) {
            const url = esc(src(p.iconImage));
            if (/\.svg(\?|#|$)/i.test(p.iconImage)) {
                return `<span class="pl-ic pl-ic--mask" aria-hidden="true" style="width:${size}px;height:${size}px;background-color:${c};-webkit-mask-image:url('${url}');mask-image:url('${url}')${glow}"></span>`;
            }
            return `<img class="pl-ic pl-ic--img" src="${url}" alt="" style="width:${size}px;height:${size}px${shiftOf(p, px)}">`;
        }
        return `<span class="material-symbols-outlined pl-ic" aria-hidden="true" style="font-size:${size}px;color:${c}${glow}">${esc(p.icon || 'radio_button_unchecked')}</span>`;
    }
    function medalStyle(p, sealed) {
        if (sealed) return 'background:radial-gradient(circle,#15141b 0%,#08070b 100%);border:1px dashed #5d5a6b;box-shadow:0 0 0 3px #050409';
        const c = colourOf(p);
        const ring = `0 0 0 3px #050409,0 0 0 4px ${mix(c, 35)}`;
        return `background:radial-gradient(circle,${mix(c, 20)} 0%,#0a0910 72%);border:1.5px solid ${c};box-shadow:${ring}${p.glow ? `,0 0 18px ${mix(c, 60)}` : ''}`;
    }
    const medal = (p, px, sealed, cls = '') =>
        `<span class="pl-medal ${cls}" style="width:${px}px;height:${px}px;${medalStyle(p, sealed)}">${iconHtml(p, px, sealed)}</span>`;

    const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
    const circleOf = p => Math.max(1, Math.round(Number(p && p.circle) || 1));
    const circleName = n => `The ${ORDINAL[n] || n + 'th'} circle`;

    function whereOf(store, p) {
        switch ((p && p.kind) || 'circle') {
            case 'centre': {
                const other = store.all('plane').filter(x => x.kind === 'centre').slice(0, 2).find(x => x.id !== p.id);
                return other ? `At the centre, with ${other.name}` : 'At the centre';
            }
            case 'overlay': return `Laid over ${(store.get(p.over) || {}).name || 'the centre'}`;
            case 'ring': return 'Around the centre';
            case 'beneath': return 'Beneath the centre';
            case 'circle': return circleName(circleOf(p));
            case 'beyond': return p.touchesAll ? 'Beyond the circles · touches every plane' : 'Beyond the circles';
            case 'between': return 'Between the planes';
            case 'demiplane': return p.anchor ? `Demiplane · anchored to ${(store.get(p.anchor) || {}).name || p.anchor}` : 'Demiplane';
        }
        return '';
    }

    ATH.planes = { GOLD, esc, src, colourOf, mix, scaleOf, shiftOf, iconHtml, medalStyle, medal, circleOf, circleName, whereOf };
})(typeof window !== 'undefined' ? window : globalThis);
