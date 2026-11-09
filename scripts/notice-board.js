/* =====================================================================
   NOTICE BOARD  —  Athenaeum.noticeBoard
   The pinned notes of a board (settlement page and POI page).
   Posts: data/notices.json, picked by Athenaeum.market.notices().
   Styles: styles/notice-board.css.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const STAMP = { taken: 'Taken', done: 'Closed' };

    // A small tilt per note, the same on every visit
    function tilt(id) {
        let h = 0;
        for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
        return ((Math.abs(h) % 7) - 3) * 0.6;
    }

    function note(store, n) {
        const kinds = store.enumOptions('noticeKind');
        const kind = (kinds.find(k => k.id === n.kind) || { label: 'Notice' }).label;
        const status = n.status || 'open';
        const issuer = n.issuer && store.get(n.issuer);
        const signedBy = issuer
            ? (store.url(issuer) ? `<a href="${store.url(issuer)}">${esc(issuer.name)}</a>` : esc(issuer.name))
            : esc(n.issuerText || '');
        const sign = [signedBy, n.issuer && n.issuerText ? esc(n.issuerText) : '', esc(n.posted || '')].filter(Boolean).join(' · ');
        const body = n.body ? store.autolink(store.md(n.body)) : '';
        return `
            <article class="notice notice--${esc(n.kind || 'job')}${status !== 'open' ? ` is-${status}` : ''}" style="--tilt:${tilt(n.id)}deg">
                <span class="notice__pin" aria-hidden="true"></span>
                <p class="notice__kind">${esc(kind)}</p>
                <h4 class="notice__title">${esc(n.name)}</h4>
                ${n.image ? `<img class="notice__image" src="${esc(n.image)}" alt="">` : ''}
                ${body ? `<div class="notice__body">${body}</div>` : ''}
                ${n.reward ? `<p class="notice__reward"><span>Reward</span> ${esc(n.reward)}</p>` : ''}
                ${sign ? `<p class="notice__sign">— ${sign}</p>` : ''}
                ${STAMP[status] ? `<span class="notice__stamp">${STAMP[status]}</span>` : ''}
            </article>`;
    }

    // HTML of a board: its notes, or a line saying it is bare
    function render(store, list, { empty = 'Nothing pinned here but old nail holes.' } = {}) {
        if (!list.length) return `<p class="notice-board__empty">${esc(empty)}</p>`;
        return `<div class="notice-board__grid">${list.map(n => note(store, n)).join('')}</div>`;
    }

    ATH.noticeBoard = { render, note };
})(typeof window !== 'undefined' ? window : globalThis);
