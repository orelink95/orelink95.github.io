/* =====================================================================
   PAGE LOOK  —  Athenaeum.look
   ---------------------------------------------------------------------
   Gives ONE page the look stored on its record (record.look, card "Look"
   of a POI or a creature in the dashboard). The styles are in
   styles/looks.css, which explains the classes and variables.

     Athenaeum.look.apply(el, look, type, opts)
        el     where the look goes: document.body on the site,
               the preview box in the dashboard
        look   record.look: { theme, accent, ink, panel, card, page,
               texture, textureImage, textureStrength, titleFont, bodyFont,
               frame, banner, bannerFocus, bannerStrength, inherit }
     Athenaeum.look.resolve(store, rec) -> { look, from }
        the record's own look, else the one a place above it passes down
        (look.inherit, "Also for the places inside")
        type   'poi' | 'creature' (the themes of each type are their own)
        opts   { url: path => url }   how to load an image (the dashboard
               reads them from the linked folder); default: the path itself

   Calling it again replaces the previous look; an empty look removes it.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const COLOURS = { accent: '--look-accent', ink: '--look-ink', panel: '--look-panel', card: '--look-card', page: '--look-page' };
    const VARS = [...Object.values(COLOURS), '--look-texture', '--look-texture-size', '--look-texture-position', '--look-texture-opacity',
        '--look-font-title', '--look-font-body', '--look-banner-image', '--look-banner-focus', '--look-banner-opacity'];
    const PREFIXES = ['look--', 'look-frame--', 'look-texture--'];
    const isColour = v => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim());
    // Absolute, because a url() inside a variable is read relative to the stylesheet that uses it
    const cssUrl = (u, doc) => {
        if (!u) return 'none';
        let abs = String(u);
        try { abs = new URL(abs, doc.baseURI).href; } catch (e) { /* keep it as it is */ }
        return `url("${abs.replace(/["\\]/g, '\\$&')}")`;
    };

    function isEmpty(look) {
        // `inherit` alone is not a look: it only passes one on (resolve, below)
        return !look || typeof look !== 'object' || !Object.entries(look).some(([k, v]) => k !== 'inherit' && v !== undefined && v !== null && v !== '');
    }

    /* The look a record's page gets: its own, else the look of the nearest place above it
       (of the same type) that is ticked "Also for the places inside" (look.inherit).
       -> { look, from }   from = the record the look comes from (null: none) */
    function resolve(store, rec) {
        if (!rec) return { look: null, from: null };
        if (!isEmpty(rec.look)) return { look: rec.look, from: rec };
        const type = store.typeOf(rec);
        const seen = new Set([rec.id]);
        for (let up = store.parent(rec); up && !seen.has(up.id) && store.typeOf(up) === type; up = store.parent(up)) {
            seen.add(up.id);
            if (up.look && up.look.inherit && !isEmpty(up.look)) return { look: up.look, from: up };
        }
        return { look: null, from: null };
    }

    /* ---------- fonts: only the ones a look uses are fetched ---------- */
    const loaded = new Set();
    function fontOptions() {
        const list = (ATH.schema && ATH.schema.enums && ATH.schema.enums.lookFont) || [];
        return list.map(o => (typeof o === 'string' ? { id: o } : o));
    }
    function loadFont(name, doc) {
        name = String(name || '').replace(/["']/g, '').trim();
        if (!name || loaded.has(name)) return;
        const opt = fontOptions().find(o => o.id === name);
        if (!opt) return;   // a font of the site, or one the browser already has
        loaded.add(name);
        const link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${opt.google || encodeURIComponent(name).replace(/%20/g, '+')}&display=swap`;
        doc.head.appendChild(link);
    }

    function clear(el) {
        [...el.classList].forEach(c => { if (PREFIXES.some(p => c.startsWith(p))) el.classList.remove(c); });
        VARS.forEach(v => el.style.removeProperty(v));
        delete el.dataset.look;
        const banner = el.querySelector(':scope > .look-banner');
        if (banner) banner.remove();
    }

    function apply(el, look, type, opts = {}) {
        if (!el) return;
        const url = opts.url || (p => p);
        const doc = el.ownerDocument || document;
        clear(el);
        if (isEmpty(look)) return;

        el.dataset.look = type;
        if (look.theme) el.classList.add(`look--${type}-${look.theme}`);

        // Colours: only well-formed ones (a half-typed "#e9c" in the dashboard is skipped)
        for (const [key, cssVar] of Object.entries(COLOURS)) if (isColour(look[key])) el.style.setProperty(cssVar, look[key].trim());

        // Texture: a pattern of looks.css, or an image of the site
        if (look.texture === 'image') {
            if (look.textureImage) {
                el.style.setProperty('--look-texture', cssUrl(url(look.textureImage), doc));
                el.style.setProperty('--look-texture-size', 'auto');
                el.style.setProperty('--look-texture-position', '0 0');
            }
        } else if (look.texture) el.classList.add(`look-texture--${look.texture}`);
        if (typeof look.textureStrength === 'number') el.style.setProperty('--look-texture-opacity', String(look.textureStrength / 100));

        // Fonts
        if (look.titleFont) el.style.setProperty('--look-font-title', `"${look.titleFont}"`);
        if (look.bodyFont) el.style.setProperty('--look-font-body', `"${look.bodyFont}"`);

        // Frame: the page's, else the theme's (--look-frame in looks.css)
        const cs = root.getComputedStyle ? root.getComputedStyle(el) : null;
        const frame = look.frame || (cs && cs.getPropertyValue('--look-frame').trim()) || '';
        if (frame) el.classList.add(`look-frame--${frame}`);

        // Fetch the fonts in use, whether set on the page or by the theme
        if (cs) {
            const s = root.getComputedStyle(el);
            loadFont(s.getPropertyValue('--look-font-title'), doc);
            loadFont(s.getPropertyValue('--look-font-body'), doc);
        }

        // Banner (header image)
        if (look.banner) {
            const b = doc.createElement('div');
            b.className = 'look-banner';
            b.setAttribute('aria-hidden', 'true');
            el.style.setProperty('--look-banner-image', cssUrl(url(look.banner), doc));
            if (look.bannerFocus) el.style.setProperty('--look-banner-focus', look.bannerFocus);
            if (typeof look.bannerStrength === 'number') el.style.setProperty('--look-banner-opacity', String(look.bannerStrength / 100));
            el.prepend(b);
        }
    }

    ATH.look = { apply, isEmpty, resolve };
})(typeof window !== 'undefined' ? window : globalThis);
