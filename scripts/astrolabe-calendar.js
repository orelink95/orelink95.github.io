/* =====================================================================
   THE BOOK OF DAYS — the Calendar tab (timeline.html), and the two tabs.
   ---------------------------------------------------------------------
   A month of the world's calendar (data/calendar.json, store.calendar):
   one column per weekday, each day with its two moons in their phase, the
   first day of a season, the festivals of that day (data/festivals.json,
   every year) and the history events of that day (data/events.json: on
   their exact date, or every year when `yearly`). Today (calendar.now, else
   the latest session) glows. The panel beside it tells the chosen day:
   season, moons, what happens, and what is coming.
   Festivals only of other campaigns, and hidden history not yet learned,
   follow the campaign chosen on the Timeline tab (shared with Dramatis
   Personae).
   URL: ?view=calendar opens this tab; &date=1693-Pholawal-7 a day;
   &festival=<id> its next day. Styles: styles/pages/timeline.css (“cal-”).
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const cal = store.calendar;
    const $ = id => document.getElementById(id);
    const views = { timeline: $('view-timeline'), calendar: $('view-calendar') };
    const tabs = document.querySelectorAll('[data-view-tab]');
    if (!cal || !views.calendar) return;

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const KIND = {   // festival kinds: colour, label
        festival: ['#e9c176', 'Festival'], holy: ['#b79cf5', 'Holy day'],
        market: ['#6aa8f8', 'Market or fair'], remembrance: ['#e08585', 'Day of remembrance'],
        event: ['#f0b0a0', 'History'],
    };
    const months = cal.months.map(m => m.name);
    const today = cal.now(store) || { year: 1, month: months[0], day: 1 };
    const sameDay = (a, b) => a && b && Number(a.year) === Number(b.year) && a.month === b.month && Number(a.day) === Number(b.day);
    const campaign = () => {
        const list = store.all('campaign');
        return list.length ? Athenaeum.personae.choose(store, { campaigns: list, allowAll: true }) : 'all';
    };

    /* ---------- what happens on a day ---------- */
    function happenings(d) {
        const cid = campaign();
        const out = [];
        for (const f of store.all('festival')) {
            if (!store.inCampaign(f, cid)) continue;
            const k = cal.occursOn(f, d);
            if (!k) continue;
            const n = Math.max(1, Number(f.days) || 1);
            const [colour, label] = KIND[f.kind] || KIND.festival;
            out.push({ rec: f, colour, kind: label, name: f.name, part: n > 1 ? `day ${k} of ${n}` : '', first: k === 1 });
        }
        for (const e of store.all('event')) {
            const on = e.date;
            if (e.oldDays || !cal.isDate(on) || !on.month || !on.day || !store.revealed(e, cid)) continue;
            let note = '';
            if (e.yearly) {
                if (Number(d.year) < Number(on.year) || !cal.occursOn({ on }, d)) continue;
                const n = d.year - on.year;
                note = n ? `${n} year${n === 1 ? '' : 's'} ago` : '';
            } else if (!sameDay(on, d)) continue;
            const own = e.colour && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(e.colour.trim()) ? e.colour.trim() : '';
            out.push({ rec: e, colour: own || KIND.event[0], kind: e.yearly ? 'Anniversary' : 'History', name: e.name, part: note, first: true });
        }
        return out;
    }

    /* ---------- a moon, drawn with CSS: a lit disc with an inset shadow ---------- */
    function moonHtml(m, size, extra = '') {
        const dx = Math.round((1 - m.lit) * size * 1.05) * (m.waning ? -1 : 1);
        const glow = m.lit > 0.85 ? `, 0 0 ${Math.round(size * 0.8)}px ${m.colour}99` : '';
        return `<span class="cal-moon${extra}" style="width:${size}px;height:${size}px;background:${esc(m.colour)};box-shadow:inset ${dx}px 0 0 0 #1b1830${glow}" title="${esc(m.name)}: ${esc(m.phase)}" aria-hidden="true"></span>`;
    }

    const phone = matchMedia('(max-width: 767.98px)');
    phone.addEventListener('change', () => { if (!views.calendar.hidden) render(); });

    // "full tonight", "was full 1 day ago", "full in 3 days"
    const days = n => `${n} day${n === 1 ? '' : 's'}`;
    const moonWhen = m => (m.full ? 'full tonight' : m.phase === 'Full' && m.sinceFull < m.toFull ? `was full ${days(m.sinceFull)} ago` : `full in ${days(m.toFull)}`);

    /* ---------- state ---------- */
    const state = { year: Number(today.year), month: Math.max(0, months.indexOf(today.month)), sel: { ...today } };

    function render() {
        const { year, month } = state;
        const name = months[month];
        const length = cal.daysIn(year, month);
        const first = { year, month: name, day: 1 };
        const startCol = Math.max(0, cal.weekdays.indexOf(cal.weekday(first)));
        const sStart = cal.season(first), sEnd = cal.season({ year, month: name, day: length });

        // the months of the year, coloured by season
        const ribbon = months.map((m, i) => {
            const se = cal.season({ year, month: m, day: Math.ceil(cal.daysIn(year, i) / 2) });
            return `<button type="button" class="cal-pill${i === month ? ' is-on' : ''}" data-month="${i}" style="--season:${esc(se ? se.colour : '#888')}" aria-label="${esc(m)}" aria-pressed="${i === month}">${esc(m.slice(0, 3))}</button>`;
        }).join('');

        const cells = [];
        for (let i = 0; i < startCol; i++) cells.push('<span class="cal-cell is-empty" aria-hidden="true"></span>');
        for (let day = 1; day <= length; day++) {
            const d = { year, month: name, day };
            const ms = cal.moons(d);
            const se = cal.season(d);
            const hap = happenings(d);
            const notes = [];
            ms.filter(m => m.full || m.isNew).forEach(m => notes.push(`<span class="cal-note" style="color:${esc(m.colour)}">${m.full ? 'Full' : 'New'} ${esc(m.name.split(/[’']/)[0])}’</span>`));
            if (se && se.day === 1) notes.push(`<span class="cal-note" style="color:${esc(se.colour)}">${esc(se.name)} begins</span>`);
            const tags = hap.slice(0, 2).map(h => `<span class="cal-tag" style="--c:${esc(h.colour)}">${esc(h.name)}${h.part && !h.first ? ' ·' : ''}</span>`).join('')
                + (hap.length > 2 ? `<span class="cal-more">+${hap.length - 2}</span>` : '');
            const dots = hap.map(h => `<span class="cal-dot" style="background:${esc(h.colour)}"></span>`).join('');
            const isToday = sameDay(d, today), isSel = sameDay(d, state.sel);
            const label = `${cal.format(d)}${isToday ? ', today' : ''}${hap.length ? ': ' + hap.map(h => h.name).join(', ') : ''}`;
            cells.push(`<button type="button" class="cal-cell${isToday ? ' is-today' : ''}${isSel ? ' is-sel' : ''}" data-day="${day}" aria-pressed="${isSel}" aria-label="${esc(label)}">
                <span class="cal-cell__top"><span class="cal-cell__n">${day}</span><span class="cal-cell__moons">${ms.map(m => moonHtml(m, phone.matches ? 7 : 12)).join('')}</span></span>
                ${notes.join('')}
                <span class="cal-cell__tags">${tags}</span>
                <span class="cal-cell__dots" aria-hidden="true">${dots}</span>
            </button>`);
        }

        $('cal-month').innerHTML = `
            <div class="cal-head">
                <button type="button" class="cal-nav" data-step="-1" aria-label="Previous month"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
                <div class="cal-head__title">
                    <h2>${esc(name)} <span>${year} ${esc(cal.era)}</span></h2>
                    ${sStart ? `<span class="tl-label" style="color:${esc(sStart.colour)}">${esc(sStart.name === sEnd.name ? sStart.name : sStart.name + ' → ' + sEnd.name)}</span>` : ''}
                </div>
                <button type="button" class="cal-nav" data-step="1" aria-label="Next month"><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
            </div>
            <div class="cal-ribbon">${ribbon}</div>
            <div class="cal-grid" role="group" aria-label="${esc(name)} ${year}">
                ${cal.weekdays.map(w => `<span class="cal-wd"><span class="cal-wd__long">${esc(w)}</span><span class="cal-wd__short" aria-hidden="true">${esc(w.slice(0, 3))}</span></span>`).join('')}
                ${cells.join('')}
            </div>`;
        renderDay();
        renderToday();
    }

    function renderDay() {
        const d = state.sel;
        const se = cal.season(d);
        const hap = happenings(d);
        const ms = cal.moons(d);
        const what = hap.length ? hap.map(h => {
            const r = h.rec;
            const extra = [];
            if (r.deity && store.get(r.deity)) extra.push(`In honour of ${store.autolink(esc(store.get(r.deity).name))}`);
            const places = (r.places || []).map(id => store.get(id)).filter(Boolean);
            if (places.length) extra.push(places.map(p => store.autolink(esc(p.name))).join(', '));
            const page = store.typeOf(r) === 'event' ? `<a class="cal-happen__link" href="timeline.html?event=${encodeURIComponent(r.id)}">On the timeline →</a>` : '';
            return `<article class="cal-happen" style="--c:${esc(h.colour)}">
                <span class="tl-label" style="color:${esc(h.colour)}">${esc(h.kind)}${h.part ? ' · ' + esc(h.part) : ''}</span>
                <h3>${esc(h.name)}</h3>
                ${r.summary ? `<p>${esc(store.plain(r.summary))}</p>` : ''}
                ${r.body && store.typeOf(r) === 'festival' ? `<div class="cal-happen__body">${store.autolink(store.md(r.body))}</div>` : ''}
                ${extra.length ? `<p class="cal-happen__meta">${extra.join(' · ')}</p>` : ''}
                ${page}
            </article>`;
        }).join('') : '<p class="cal-none">Nothing is written for this day.</p>';

        $('cal-day').innerHTML = `
            ${sameDay(d, today) ? '<span class="tl-label">Today</span>' : ''}
            <h2 class="cal-day__title">${esc(cal.format(d))}</h2>
            ${se ? `<p class="cal-day__season"><span class="cal-swatch" style="background:${esc(se.colour)}"></span>${esc(se.name)} · day ${se.day} of ${se.of}</p>` : ''}
            ${ms.length ? `<div class="cal-day__block"><span class="tl-label tl-label--muted">The moons</span>
                ${ms.map(m => `<div class="cal-day__moon">${moonHtml(m, 34, ' cal-moon--big')}<span><b>${esc(m.name)}</b><small>${esc(m.phase)} · ${moonWhen(m)}</small></span></div>`).join('')}
            </div>` : ''}
            <div class="cal-day__block"><span class="tl-label tl-label--muted">On this day</span>${what}</div>
            <div class="cal-day__block cal-day__coming"><span class="tl-label tl-label--muted">Coming up</span>${comingUp()}</div>`;
    }

    // The next festivals and anniversaries after today (first days only)
    function comingUp() {
        const out = [];
        let d = { ...today };
        for (let k = 1; k <= 200 && out.length < 4; k++) {
            d = next(d);
            happenings(d).filter(h => h.first).forEach(h => { if (out.length < 4) out.push({ h, k, d: { ...d } }); });
        }
        return out.length ? out.map(({ h, k, d: when }) => `<button type="button" class="cal-coming" data-go="${when.year}|${esc(when.month)}|${when.day}">
                <span style="color:${esc(h.colour)}">${esc(h.name)}</span><small>in ${k} day${k === 1 ? '' : 's'}</small></button>`).join('')
            : '<p class="cal-none">Nothing in the coming months.</p>';
    }
    function next(d) {
        const i = months.indexOf(d.month);
        if (d.day < cal.daysIn(d.year, i)) return { year: d.year, month: d.month, day: d.day + 1 };
        if (i < months.length - 1) return { year: d.year, month: months[i + 1], day: 1 };
        return { year: Number(d.year) + 1, month: months[0], day: 1 };
    }

    function renderToday() {
        const box = $('cal-today');
        if (!box) return;
        const se = cal.season(today);
        box.innerHTML = `<span class="tl-label">Today in Eraldom</span>
            <span class="cal-today__date">${esc(cal.format(today))}</span>
            ${se ? `<span class="cal-today__bit"><span class="cal-swatch" style="background:${esc(se.colour)}"></span>${esc(se.name)} · day ${se.day} of ${se.of}</span>` : ''}
            <span class="cal-today__moons">${cal.moons(today).map(m => `<span class="cal-today__bit">${moonHtml(m, 14)}${esc(m.name)} · ${esc(m.phase)}</span>`).join('')}</span>
            <button type="button" class="cal-today__go" data-today>Go to today</button>`;
    }

    function goTo(d) {
        state.year = Number(d.year);
        state.month = Math.max(0, months.indexOf(d.month));
        state.sel = { year: Number(d.year), month: d.month, day: Number(d.day) };
        render();
    }

    /* ---------- events ---------- */
    views.calendar.addEventListener('click', e => {
        const t = e.target.closest('[data-day],[data-step],[data-month],[data-today],[data-go]');
        if (!t) return;
        if (t.dataset.day) {
            state.sel = { year: state.year, month: months[state.month], day: Number(t.dataset.day) };
            render();
            const again = views.calendar.querySelector(`[data-day="${t.dataset.day}"]`);
            if (again) again.focus({ preventScroll: true });
            if (phone.matches) $('cal-day').scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        if (t.dataset.step) {
            state.month += Number(t.dataset.step);
            if (state.month < 0) { state.month = months.length - 1; state.year--; }
            if (state.month >= months.length) { state.month = 0; state.year++; }
        }
        if (t.dataset.month) state.month = Number(t.dataset.month);
        if (t.dataset.today !== undefined) return goTo(today);
        if (t.dataset.go) { const [y, m, d] = t.dataset.go.split('|'); return goTo({ year: y, month: m, day: d }); }
        render();
    });

    /* ---------- the two tabs ---------- */
    function show(view, push) {
        Object.entries(views).forEach(([k, el]) => { if (el) el.hidden = k !== view; });
        tabs.forEach(t => {
            const on = t.dataset.viewTab === view;
            t.classList.toggle('is-on', on);
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
        });
        if (view === 'calendar') render();
        if (push) {
            const url = new URL(location.href);
            if (view === 'calendar') url.searchParams.set('view', 'calendar'); else url.searchParams.delete('view');
            ['date', 'festival', 'event'].forEach(k => url.searchParams.delete(k));
            history.replaceState(null, '', url);
        }
    }
    tabs.forEach(t => {
        t.addEventListener('click', () => show(t.dataset.viewTab, true));
        t.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const list = [...tabs], i = list.indexOf(t);
            const n = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
            n.focus(); show(n.dataset.viewTab, true);
        });
    });

    // ?view=calendar, &date=1693-Pholawal-7, &festival=<id>
    const q = new URLSearchParams(location.search);
    if (q.get('date')) {
        const [y, m, d] = q.get('date').split('-');
        if (!cal.check({ year: Number(y), month: m, day: Number(d) })) goTo({ year: y, month: m, day: d });
    }
    if (q.get('festival')) {
        const f = store.get(q.get('festival'));
        let d = { ...today };
        for (let k = 0; f && k < 400; k++, d = next(d)) if (cal.occursOn(f, d) === 1) { goTo(d); break; }
    }
    show(q.get('view') === 'calendar' || q.get('festival') || q.get('date') ? 'calendar' : 'timeline', false);
});
