/* =====================================================================
   LATEST UPDATES — the bottom of the homepage (index.html).
   ---------------------------------------------------------------------
   The cards of “Latest Updates” and the closing quote come from
   data/homepage.json (dashboard: Site › Homepage). A card links to a
   record (its page, name and picture) or is one of the DM's own (title,
   picture and link); `title`, `image` and `link` win over the record's.
   Under the title: `caption`, else “Added … ago” from `added`.
   Read through the store, so a card linked to a record hidden from
   players is already gone (store.js, withoutHidden).
       Athenaeum.latest.resolve(store, homepage, today) -> [{title, href, image, caption}]
       Athenaeum.latest.ago('2026-11-12', '2026-11-19')  -> 'Added 1 week ago'
   The dashboard uses resolve() for its preview. Styles: styles/pages/index.css
   (.update-card, .epigraph).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const PLACEHOLDER = 'images/pois/placeholder.png';
    const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    // “Added 3 days ago” from a YYYY-MM-DD date
    function ago(date, today = todayISO()) {
        const t = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : NaN);
        const days = Math.round((t(today) - t(date)) / 86400000);
        if (Number.isNaN(days)) return '';
        if (days <= 0) return 'Added today';
        if (days === 1) return 'Added yesterday';
        const n = (k, unit) => `Added ${k} ${unit}${k === 1 ? '' : 's'} ago`;
        if (days < 14) return n(days, 'day');
        if (days < 61) return n(Math.round(days / 7), 'week');
        if (days < 730) return n(Math.round(days / 30.44), 'month');
        return n(Math.round(days / 365.25), 'year');
    }

    // A record's own picture: its first picture field in the schema, else (a place) the map of one of its parts
    function pictureOf(store, rec) {
        const def = store.schema.types[store.typeOf(rec)];
        for (const [k, f] of Object.entries((def && def.fields) || {})) {
            const v = rec[k];
            if (f.kind === 'image' && typeof v === 'string' && v) return v;
            if (f.kind === 'mapImage' && v && v.src) return v.src;
        }
        const part = store.children(rec).find(c => c.mapImage && c.mapImage.src);
        return part ? part.mapImage.src : '';
    }

    function resolve(store, homepage, today) {
        return ((homepage && homepage.updates) || []).map(c => {
            if (!c || typeof c !== 'object') return null;
            const rec = c.record ? store.get(c.record) : null;
            if (c.record && !rec) return null;          // hidden from players, or deleted
            const title = c.title || (rec && rec.name) || '';
            const href = c.link || (rec && store.url(rec)) || '';
            if (!title) return null;
            return {
                title, href,
                image: c.image || (rec && pictureOf(store, rec)) || PLACEHOLDER,
                caption: c.caption || (c.added ? ago(c.added, today) : ''),
                record: rec,
            };
        }).filter(Boolean);
    }

    const cardHtml = (c, i) => `
          <div class="update-card">
            <div class="update-card__frame">
              <img class="update-card__image-tilt-${i % 2 ? 'left' : 'right'}" src="${esc(c.image)}" alt="" loading="lazy" />
              <div class="update-card__ring"></div>
              <div class="update-card__fade"></div>
            </div>
            ${c.href ? `<a href="${esc(c.href)}" class="update-card__title">${esc(c.title)}</a>` : `<span class="update-card__title">${esc(c.title)}</span>`}
            ${c.caption ? `<p class="update-card__date">${esc(c.caption)}</p>` : ''}
          </div>`;

    ATH.latest = { resolve, ago, pictureOf, cardHtml };

    /* ---------- homepage ---------- */
    if (typeof document === 'undefined' || ATH.manualLoad) return;
    const start = async () => {
        const grid = document.getElementById('latest-updates-grid');
        if (!grid || !ATH.ready) return;
        let store;
        try { store = await ATH.ready; } catch (e) { console.error('[Athenaeum] latest updates:', e.message); return; }
        const home = store.singletons.homepage || {};
        const cards = resolve(store, home);
        const section = grid.closest('.updates');
        grid.innerHTML = cards.map(cardHtml).join('');
        if (section) section.hidden = !cards.length;
        const all = document.getElementById('latest-updates-all');
        if (all) {
            all.textContent = home.allLabel || 'View All Scrolls';
            all.href = home.allLink || 'scriptorium.html';
        }
        // The closing quote
        const quote = document.querySelector('.epigraph');
        if (quote) {
            const q = quote.querySelector('.epigraph__quote'), by = quote.querySelector('.epigraph__cite');
            quote.hidden = !home.quote;
            if (home.quote) {
                if (q) q.textContent = `"${home.quote}"`;
                if (by) { by.textContent = home.quoteBy ? `— ${home.quoteBy}` : ''; by.hidden = !home.quoteBy; }
            }
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(typeof window !== 'undefined' ? window : globalThis);
