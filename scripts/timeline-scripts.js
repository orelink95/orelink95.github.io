/* =====================================================================
   THE ASTROLABE (timeline.html) — the timeline of the world, newest first.
   ---------------------------------------------------------------------
   - The year now (calendar.now, else the latest session's date). Sessions
     are hidden until the reader shows one campaign or more (the chips under
     "Sessions", remembered for the visit): then the year now folds open on
     them by month, alternating sides, each with its campaign's colour. A
     session with no date sits after the dated session before it in its
     campaign ("Date unknown").
   - Then the events (data/events.json), newest first, alternating sides:
     an event (a panel that opens on click), a major event (a wide red
     panel across the line), the start of an age (a round seal). Long
     empty stretches become "some N years of silence".
   - Then the Old Days: the events marked oldDays, by `order`.
   - Hidden history (event.sealed): a sealed page until the campaign in the
     drop-down has learned it (store.revealed, like the Elder gods).
   An event can have its own `colour` (its panel, line and node) and its own
   icon (`icon`, a Material Symbols name, or `iconImage`, an uploaded picture;
   an SVG is tinted in the event's colour) in place of the star on the line.
   Hovering a panel sends a line of energy around its border (timeline.css).
   Filters: "Viewing as" (the campaign, shared with Dramatis Personae:
   scripts/personae.js) decides which hidden history is sealed; World history
   shows or hides the events; the session chips show campaigns' sessions.
   ?event=<id> opens an event and scrolls to it.
   Dates: scripts/core/calendar.js (store.calendar). Sky: scripts/core/sky.js.
   Styles: styles/pages/timeline.css.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const cal = store.calendar;
    const $ = id => document.getElementById(id);
    const list = $('timeline');
    if (!list || !cal) return;

    Athenaeum.sky($('sky'));

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const GAP = 50;   // years: a longer empty stretch gets a "years of silence" marker
    const COLOURS = ['#b79cf5', '#e8ad5c', '#6aa8f8', '#66c488', '#f28b82', '#4fd1c5'];

    const campaigns = store.all('campaign');
    const colourOf = id => COLOURS[Math.max(0, campaigns.findIndex(c => c.id === id)) % COLOURS.length];
    let campaign = campaigns.length ? Athenaeum.personae.choose(store, { campaigns, allowAll: true }) : 'all';
    // Sessions shown: none by default; the campaigns the reader picks, for this visit
    const SHOWN_KEY = 'athenaeum_timeline_sessions';
    let shown;
    try { shown = new Set(JSON.parse(sessionStorage.getItem(SHOWN_KEY) || '[]')); } catch { shown = new Set(); }
    const state = { world: true, present: true, open: new Set() };
    const asked = new URLSearchParams(location.search).get('event');
    if (asked) state.open.add(asked);

    const now = cal.now(store);
    const nowYear = now ? Number(now.year) : null;
    const yearsAgo = d => (nowYear && cal.isDate(d) && nowYear - d.year > 1 ? `${(nowYear - d.year).toLocaleString('en')} years ago` : '');
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const written = n => ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'][n] || String(n);

    // How long an event lasted: "Forty years", "12 days"
    const TENS = { 20: 'Twenty', 30: 'Thirty', 40: 'Forty', 50: 'Fifty', 60: 'Sixty', 70: 'Seventy', 80: 'Eighty', 90: 'Ninety', 100: 'A hundred' };
    function lasted(e) {
        if (!cal.isDate(e.date) || !cal.isDate(e.end)) return '';
        const years = e.end.year - e.date.year;
        if (years >= 1) return TENS[years] ? `${TENS[years]} years` : plural(years, 'year');
        if (e.date.month && e.date.day && e.end.month && e.end.day) return plural(cal.dayNumber(e.end) - cal.dayNumber(e.date) + 1, 'day');
        return '';
    }
    // "1341 – 1381 LF", "c. 993 LF", "Eksten 7 Pholawal, 1693 LF"
    function when(e) {
        if (!cal.isDate(e.date)) return '';
        if (cal.isDate(e.end)) {
            const sameYear = e.end.year === e.date.year;
            return `${cal.format(e.date, { era: false, year: !sameYear || !e.date.month })} – ${cal.format(e.end)}`;
        }
        return cal.format(e.date);
    }

    /* ---------- the names an event links to: links with their preview cards ---------- */
    function linkName(id) {
        const rec = store.get(id);
        if (!rec) return '';
        const name = esc(rec.name);
        const linked = store.autolink(name, { terms: true });
        if (linked !== name) return linked;
        const url = store.url(rec);
        return url ? `<a href="${url}" data-kw="${rec.id}">${name}</a>` : `<span>${name}</span>`;
    }

    /* ---------- sessions: newest first, the undated ones after the dated one before them ---------- */
    function sessionRows() {
        const placed = [];
        for (const c of campaigns) {
            const own = store.all('session').filter(s => s.campaign === c.id).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
            let lastDate = null;
            const pending = [];
            for (const s of own) {
                if (cal.isDate(s.date) && !cal.check(s.date)) {
                    lastDate = s.date;
                    pending.splice(0).forEach(p => placed.push({ s: p, at: s.date, known: false, before: true }));
                    placed.push({ s, at: s.date, known: true });
                } else if (lastDate) placed.push({ s, at: lastDate, known: false });
                else pending.push(s);
            }
            pending.forEach(p => placed.push({ s: p, at: null, known: false }));
        }
        // newest first; an undated session right after (above) the dated one it follows
        const key = p => (p.at ? cal.dayNumber({ month: cal.months[0] && cal.months[0].name, day: 1, ...p.at }) : -Infinity);
        placed.sort((a, b) => key(b) - key(a) || (b.s.number ?? 0) - (a.s.number ?? 0));
        return placed;
    }

    /* ---------- rendering ---------- */
    const star = (cls = '', style = '') => `<span class="tl-star ${cls}" aria-hidden="true"${style ? ` style="${style}"` : ''}></span>`;
    // An event's own colour, as a CSS custom property (only a real colour gets through)
    const colourOf_ = e => (e.colour && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(e.colour.trim()) ? e.colour.trim() : '');
    const evStyle = e => (colourOf_(e) ? ` style="--ev:${colourOf_(e)}"` : '');
    // The node on the line: the event's icon (Material Symbols or a picture), else a star
    function node(e) {
        const c = colourOf_(e);
        if (e.iconImage) {
            const src = esc(e.iconImage);
            const svg = /\.svg(\?|#|$)/i.test(e.iconImage);
            return `<span class="tl-node${c ? ' has-colour' : ''}" aria-hidden="true"${evStyle(e)}>${svg
                ? `<span class="tl-node__mask" style="-webkit-mask-image:url('${src}');mask-image:url('${src}')"></span>`
                : `<img class="tl-node__img" src="${src}" alt="" loading="lazy">`}</span>`;
        }
        if (e.icon) return `<span class="tl-node${c ? ' has-colour' : ''}" aria-hidden="true"${evStyle(e)}><span class="material-symbols-outlined">${esc(e.icon)}</span></span>`;
        return star('', c ? `--camp:${c}` : '');
    }

    function nowPanel(count) {
        const label = now ? `${now.year} ${cal.era} · The year now` : 'The year now';
        return `<div class="tl-now" id="the-year-now">
            <button type="button" class="tl-glass tl-now__btn" ${shown.size ? `aria-expanded="${state.present}" aria-controls="tl-sessions"` : 'disabled'} data-action="present">
                ${star('tl-star--now')}
                <span class="tl-now__text"><span class="tl-label">${esc(label)}</span>
                <span class="tl-now__title">${!shown.size ? 'Sessions hidden' : count ? plural(count, 'session') + (now ? ' this year' : '') : 'No session yet'}</span>
                ${!shown.size ? '<span class="tl-now__hint">Show a campaign’s sessions above</span>' : ''}</span>
                ${shown.size ? `<span class="tl-now__chev material-symbols-outlined" aria-hidden="true">${state.present ? 'expand_less' : 'expand_more'}</span>` : ''}
            </button>
        </div>`;
    }

    function sessionsHtml(rows) {
        let month = null, side = 0;
        const out = [];
        for (const p of rows) {
            const m = p.at ? `${p.at.month || ''} ${p.at.year}`.trim() : 'Undated';
            if (m !== month) { month = m; out.push(`<div class="tl-month"><span class="tl-month__label">${esc(m)}</span></div>`); }
            const s = p.s, c = colourOf(s.campaign), camp = store.get(s.campaign);
            const dim = false;
            const day = p.known ? cal.format(s.date, { year: false }).replace(/ \S+$/, '') : 'Date unknown';
            const left = side++ % 2 === 0;
            const card = `<a href="${store.url(s)}" class="tl-session tl-energy${dim ? ' is-dim' : ''}" id="se-${esc(s.id)}" style="--camp:${c};--ev:${c}">
                    <span class="tl-session__camp">${esc(camp ? camp.name : s.campaign)}</span>
                    <span class="tl-session__text"><span class="tl-label tl-label--muted">${esc(day)} · Session ${esc(s.number)}</span>
                    <span class="tl-session__title">${esc(s.name)}</span></span>
                </a>`;
            out.push(`<div class="tl-row tl-row--session${left ? ' is-left' : ''}">
                <div class="tl-row__a">${left ? card : ''}</div>
                ${star('tl-star--small' + (dim ? ' tl-star--dim' : ''), dim ? '' : `--camp:${c}`)}
                <div class="tl-row__b">${left ? '' : card}</div>
            </div>`);
        }
        return `<div class="tl-sessions" id="tl-sessions">${out.join('')}</div>`;
    }

    function details(e, centred) {
        if (!state.open.has(e.id)) return '';
        const body = e.body ? store.autolink(store.md(e.body)) : '';
        const links = (e.links || []).map(linkName).filter(Boolean);
        const learned = e.sealed ? (e.revealedIn || []).map(id => (store.get(id) || {}).name).filter(Boolean) : [];
        return `<div class="tl-event__more${centred ? ' is-centred' : ''}" id="more-${esc(e.id)}">
            ${e.image ? `<img class="tl-event__img" src="${esc(e.image)}" alt="" loading="lazy">` : ''}
            ${body ? `<div class="tl-event__body">${body}</div>` : ''}
            ${links.length ? `<p class="tl-event__links"><span class="tl-label tl-label--muted">Linked</span> ${links.join(' ')}</p>` : ''}
            ${learned.length ? `<p class="tl-label tl-label--muted">Learned in ${esc(learned.join(', '))}</p>` : ''}
        </div>`;
    }
    const hasMore = e => !!(e.body || e.image || (e.links || []).length || e.sealed);
    function toggleBtn(e) {
        if (!hasMore(e)) return '';
        const open = state.open.has(e.id);
        return `<button type="button" class="tl-event__toggle" data-action="open" data-id="${esc(e.id)}" aria-expanded="${open}" aria-controls="more-${esc(e.id)}">${open ? 'Close' : 'Read more'}</button>`;
    }
    function dateBlock(e) {
        const ago = yearsAgo(e.date);
        return `<div class="tl-date"><span class="tl-date__main">${esc(when(e) || 'Undated')}</span>${lasted(e) ? `<span class="tl-label tl-label--muted">${esc(lasted(e))}</span>` : ago ? `<span class="tl-label tl-label--muted">${esc(ago)}</span>` : ''}</div>`;
    }

    function eventHtml(e, left) {
        const panel = `<article class="tl-glass tl-event tl-energy${left ? ' is-left' : ''}${colourOf_(e) ? ' has-colour' : ''}" id="ev-${esc(e.id)}"${evStyle(e)}>
                <h3 class="tl-event__title">${esc(e.name)}</h3>
                ${e.summary ? `<p class="tl-event__sum">${esc(store.plain(e.summary))}</p>` : ''}
                ${details(e, false)}${toggleBtn(e)}
            </article>`;
        return `<div class="tl-row${left ? ' is-left' : ''}">
            <div class="tl-row__a">${left ? panel : dateBlock(e)}</div>
            ${node(e)}
            <div class="tl-row__b">${left ? dateBlock(e) : panel}</div>
        </div>`;
    }
    function majorHtml(e) {
        const icon = e.icon || e.iconImage ? `<div class="tl-major__icon">${node(e)}</div>` : '';
        return `<div class="tl-wide"><article class="tl-glass tl-major tl-energy${colourOf_(e) ? ' has-colour' : ''}" id="ev-${esc(e.id)}"${evStyle(e)}>
            ${icon}
            <p class="tl-major__date">${esc(when(e))}</p>
            ${lasted(e) ? `<p class="tl-label tl-major__span">${esc(lasted(e))}</p>` : ''}
            <h3 class="tl-major__title">${esc(e.name)}</h3>
            ${e.summary ? `<p class="tl-event__sum">${esc(store.plain(e.summary))}</p>` : ''}
            ${details(e, true)}${toggleBtn(e)}
        </article></div>`;
    }
    function ageHtml(e) {
        return `<div class="tl-wide tl-wide--age"><div class="tl-seal tl-energy${colourOf_(e) ? ' has-colour' : ''}" id="ev-${esc(e.id)}"${evStyle(e)}>
            ${e.icon || e.iconImage ? node(e) : ''}
            <span class="tl-label">${esc(cal.format(e.date))}</span>
            <span class="tl-seal__name">${esc(e.name)}</span>
        </div>
        ${e.summary ? `<p class="tl-seal__sum">${esc(store.plain(e.summary))}</p>` : ''}
        ${hasMore(e) ? `<div class="tl-seal__more">${details(e, true)}${toggleBtn(e)}</div>` : ''}</div>`;
    }
    function sealedHtml(left) {
        const where = campaign === 'all' ? 'any campaign' : ((store.get(campaign) || {}).name || campaign);
        const panel = `<div class="tl-glass tl-event tl-event--sealed${left ? ' is-left' : ''}">
                <span class="material-symbols-outlined" aria-hidden="true">lock</span>
                <span><span class="tl-event__title">A sealed page</span><span class="tl-event__sum">Not yet learned in ${esc(where)}.</span></span>
            </div>`;
        const date = `<div class="tl-date tl-date--sealed"><span class="tl-date__main">— ${esc(cal.era)}</span></div>`;
        return `<div class="tl-row${left ? ' is-left' : ''}">
            <div class="tl-row__a">${left ? panel : date}</div>
            ${star('tl-star--dim')}
            <div class="tl-row__b">${left ? date : panel}</div>
        </div>`;
    }
    const gapHtml = years => `<div class="tl-gap"><span>Some ${years >= 100 ? Math.round(years / 10) * 10 : years} years of silence</span></div>`;

    function render() {
        const out = [];
        const rows = sessionRows().filter(p => shown.has(p.s.campaign));
        out.push(nowPanel(rows.length));
        if (state.present && rows.length) out.push(sessionsHtml(rows));

        if (state.world) {
            const all = store.all('event');
            const dated = all.filter(e => !e.oldDays && cal.isDate(e.date) && !cal.check(e.date))
                .sort((a, b) => cal.compare(b.date, a.date) || (b.kind === 'age') - (a.kind === 'age'));
            const old = all.filter(e => e.oldDays).sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
            let side = 0, prevYear = nowYear;
            for (const e of dated) {
                if (prevYear !== null && prevYear - e.date.year >= GAP) out.push(gapHtml(prevYear - e.date.year));
                prevYear = Number(e.date.year);
                if (!store.revealed(e, campaign)) { out.push(sealedHtml(side++ % 2 === 1)); continue; }
                if (e.kind === 'major') out.push(majorHtml(e));
                else if (e.kind === 'age') out.push(ageHtml(e));
                else out.push(eventHtml(e, side++ % 2 === 1));
            }
            out.push(`<div class="tl-wide tl-wide--old" id="the-old-days"><span class="tl-old">${esc(cal.before)} · undated</span></div>`);
            side = 0;
            for (const e of old) {
                if (!store.revealed(e, campaign)) { out.push(sealedHtml(side++ % 2 === 1)); continue; }
                if (e.kind === 'major') out.push(majorHtml(e));
                else if (e.kind === 'age') out.push(ageHtml(e));
                else out.push(eventHtml({ ...e, date: null }, side++ % 2 === 1));
            }
        }
        list.innerHTML = out.join('');
        renderJumps();
    }

    // "Jump to": the year now, the major events and the ages, the Old Days
    function renderJumps() {
        const box = $('tl-jumps');
        if (!box) return;
        const marks = [{ id: 'the-year-now', name: 'The year now' }];
        if (state.world) {
            store.all('event').filter(e => (e.kind === 'major' || e.kind === 'age') && store.revealed(e, campaign) && document.getElementById('ev-' + e.id))
                .forEach(e => marks.push({ id: 'ev-' + e.id, name: e.name }));
            marks.push({ id: 'the-old-days', name: cal.before });
        }
        box.innerHTML = `<span class="tl-label tl-label--muted">Jump to</span>${marks.map(m => `<a href="#${esc(m.id)}" class="tl-jump">${esc(m.name)}</a>`).join('')}`;
    }

    /* ---------- controls ---------- */
    const picker = $('tl-campaign');
    if (picker && campaigns.length) {
        Athenaeum.personae.picker(picker, { campaigns, value: campaign, allowAll: true, onChange: v => { campaign = v; render(); } });
    }
    // The session chips: one per campaign, in its colour
    const chips = $('tl-sessions-chips');
    function renderChips() {
        if (!chips) return;
        chips.innerHTML = campaigns.map(c => {
            const on = shown.has(c.id);
            return `<button type="button" class="tl-chip${on ? ' is-on' : ''}" data-camp="${esc(c.id)}" aria-pressed="${on}" style="--camp:${colourOf(c.id)}"><span class="tl-chip__dot" aria-hidden="true"></span>${esc(c.name)}</button>`;
        }).join('');
    }
    if (chips) chips.addEventListener('click', e => {
        const b = e.target.closest('[data-camp]');
        if (!b) return;
        const id = b.dataset.camp;
        shown.has(id) ? shown.delete(id) : shown.add(id);
        try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown])); } catch { /* private mode */ }
        if (shown.size) state.present = true;
        renderChips();
        render();
    });
    renderChips();
    document.querySelectorAll('[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            const k = btn.dataset.toggle;
            state[k] = !state[k];
            btn.setAttribute('aria-pressed', String(state[k]));
            btn.classList.toggle('is-on', state[k]);
            render();
        });
    });
    list.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'present') { if (!shown.size) return; state.present = !state.present; }
        if (btn.dataset.action === 'open') {
            const id = btn.dataset.id;
            state.open.has(id) ? state.open.delete(id) : state.open.add(id);
        }
        render();
        const again = btn.dataset.id ? list.querySelector(`[data-action="open"][data-id="${CSS.escape(btn.dataset.id)}"]`)
            : list.querySelector('[data-action="present"]');
        if (again) again.focus({ preventScroll: true });
    });

    render();
    if (asked) {
        const target = document.getElementById('ev-' + asked);
        if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
});
