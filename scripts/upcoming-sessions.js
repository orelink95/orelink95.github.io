/* =====================================================================
   UPCOMING SESSIONS (index.html, "The Loom of Fate")
   ---------------------------------------------------------------------
   Data: data/schedule.json, edited in the dashboard (Site > Upcoming
   sessions). The cards are shown in the order of the file.

   Rules
   - A session whose date has passed is hidden on its own (it still shows
     on the day itself). Remove it from the dashboard when convenient.
   - Card style, from the entry's `status`:
       (empty)    confirmed: the first one still to come is "Up Next"
                  (with a countdown), the others "Scheduled"
       tentative  "TBD" (also any session with no date)
       postponed  "Postponed": amber, its old date struck through
       cancelled  "Cancelled": red, dimmed, struck through
     `notice` adds a line to the card (reason, new date…).
   - Confirmed sessions get an "Add to calendar" button (.ics file, at the
     local time of whoever opens it; length: `length` hours, default 4).
   - The card links to the campaign in the scriptorium unless `link` is set.

   The dashboard uses the same rules (Athenaeum.upcoming.resolve) for its
   preview, so what it shows is what the homepage shows.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const DEFAULT_HOURS = 4;

    /* `css`: the card's class set (index.css has next, scheduled, tbd);
       `mod`: an extra class that recolours a tbd card */
    const VARIANTS = {
        next: { label: 'Up Next', icon: 'hourglass_top', css: 'next', glow: 'rgba(233, 193, 118, 0.15)' },
        scheduled: { label: 'Scheduled', icon: 'calendar_month', css: 'scheduled', glow: 'rgba(74, 222, 128, 0.15)' },
        tbd: { label: 'TBD', icon: 'explore', css: 'tbd', glow: 'rgba(192, 132, 252, 0.15)' },
        postponed: { label: 'Postponed', icon: 'update', css: 'tbd', mod: 'session-card--postponed', glow: 'rgba(251, 191, 36, 0.12)' },
        cancelled: { label: 'Cancelled', icon: 'event_busy', css: 'tbd', mod: 'session-card--cancelled', glow: 'rgba(248, 113, 113, 0.1)' },
    };

    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pad = n => String(n).padStart(2, '0');

    /* ---------- dates (local time, no time-zone surprises) ---------- */
    function parseDate(iso) {
        const m = DATE_RE.exec(iso || '');
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return d.getMonth() === Number(m[2]) - 1 ? d : null; // rejects 2026-02-31
    }
    const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayISO = (now = new Date()) => isoDate(now);
    function addDays(iso, n) {
        const d = parseDate(iso);
        if (!d) return '';
        d.setDate(d.getDate() + n);
        return isoDate(d);
    }
    const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
    function ordinal(n) {
        const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
        return n + s;
    }
    /* "2026-11-18" → "Wednesday, November 18th" (the year only when it is not this year's) */
    function formatDate(iso, now = new Date()) {
        const d = parseDate(iso);
        if (!d) return '';
        const year = d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : '';
        return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}${year}`;
    }
    /* "14:00" → "2:00 PM" */
    function formatTime(hhmm) {
        const m = TIME_RE.exec(hhmm || '');
        if (!m) return '';
        const h = Number(m[1]);
        return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
    }
    /* Calendar days from today: "Today", "Tomorrow", "In 5 days", "In 3 weeks", "In 2 months" */
    function countdown(iso, today = todayISO()) {
        if (!parseDate(iso)) return '';
        const n = daysBetween(today, iso);
        if (n < 0) return '';
        if (n === 0) return 'Today';
        if (n === 1) return 'Tomorrow';
        if (n < 14) return `In ${n} days`;
        if (n < 60) return `In ${Math.round(n / 7)} weeks`;
        return `In ${Math.round(n / 30.44)} months`;
    }

    /* ---------- rules ---------- */
    const statusOf = e => e.status || (e.tentative ? 'tentative' : ''); // `tentative: true` = older files

    /* entries: data/schedule.json `sessions`; campaigns: [{id, name}]
       Returns every entry, in order, with what the card shows and `past`
       (hidden on the site). */
    function resolve(entries, { campaigns = [], today = todayISO(), now = new Date() } = {}) {
        const nameOf = id => (campaigns.find(c => c.id === id) || {}).name || id || '';
        let nextGiven = false;
        return (entries || []).map((e, index) => {
            const dated = !!parseDate(e.date);
            const past = dated && e.date < today;
            const status = statusOf(e);
            let variant = 'scheduled';
            if (status === 'cancelled' || status === 'postponed') variant = status;
            else if (status === 'tentative' || !dated) variant = 'tbd';
            else if (!past && !nextGiven) { variant = 'next'; nextGiven = true; }
            return {
                index, past, variant, entry: e,
                label: VARIANTS[variant].label,
                title: e.title || nameOf(e.campaign) || 'Session',
                number: typeof e.number === 'number' ? e.number : null,
                dateText: formatDate(e.date, now) || 'Date to be announced',
                timeText: formatTime(e.time),
                where: e.where || '',
                notice: e.notice || '',
                countdown: variant === 'next' ? countdown(e.date, today) : '',
                calendar: (variant === 'next' || variant === 'scheduled') && !past,
                link: e.link || (e.campaign ? `scriptorium.html?campaign=${encodeURIComponent(e.campaign)}` : ''),
            };
        });
    }

    /* Prefill for a new entry of `campaign`: number after its latest session
       (recorded or already planned), date one interval after its last planned
       date (the gap between its last two dates, else two weeks), same time. */
    function suggest(entries, campaign, recordedSessions = []) {
        const mine = (entries || []).filter(e => e.campaign === campaign);
        const nums = [
            ...recordedSessions.filter(s => s.campaign === campaign).map(s => s.number),
            ...mine.map(e => e.number),
        ].filter(n => typeof n === 'number');
        const dated = mine.filter(e => parseDate(e.date) && statusOf(e) !== 'cancelled').map(e => e.date).sort();
        const last = dated[dated.length - 1];
        const gap = dated.length > 1 ? daysBetween(dated[dated.length - 2], last) : 14;
        const step = gap > 0 ? gap : 14;
        let date = last ? addDays(last, step) : '';
        while (date && date < todayISO()) date = addDays(date, step); // never in the past
        const withTime = [...mine].reverse().find(e => e.time) || [...(entries || [])].reverse().find(e => e.time);
        const out = { campaign };
        if (nums.length) out.number = Math.max(...nums) + 1;
        if (date) out.date = date;
        if (withTime) out.time = withTime.time;
        return out;
    }

    /* ---------- "Add to calendar" (.ics) ---------- */
    const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    // Lines longer than 75 octets are folded (RFC 5545 §3.1)
    function fold(line) {
        const bytes = new TextEncoder().encode(line);
        if (bytes.length <= 75) return line;
        const out = []; let cur = '', len = 0;
        for (const ch of line) {
            const n = new TextEncoder().encode(ch).length;
            if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
            cur += ch; len += n;
        }
        out.push(cur);
        return out.join('\r\n ');
    }
    const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const utcStamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    /* s: one resolved session; hours: its length; pageUrl: absolute link for the description */
    function ics(s, { hours = DEFAULT_HOURS, pageUrl = '' } = {}) {
        const e = s.entry;
        const day = parseDate(e.date);
        const t = TIME_RE.exec(e.time || '');
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eraldom//Athenaeum//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
            `UID:${[e.campaign || 'session', s.number ?? e.date].join('-')}@eraldom-athenaeum`,
            `DTSTAMP:${utcStamp(new Date())}`];
        if (t) {
            // Floating time: 2:00 PM wherever the calendar is (the group shares a time zone)
            const start = new Date(day); start.setHours(Number(t[1]), Number(t[2]));
            const end = new Date(start.getTime() + (hours > 0 ? hours : DEFAULT_HOURS) * 3600000);
            lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
        } else {
            const next = new Date(day); next.setDate(next.getDate() + 1);
            lines.push(`DTSTART;VALUE=DATE:${isoDate(day).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${isoDate(next).replace(/-/g, '')}`);
        }
        lines.push(`SUMMARY:${icsText(`${s.title}${s.number !== null ? ` · Session ${s.number}` : ''}`)}`);
        if (s.where) lines.push(`LOCATION:${icsText(s.where)}`);
        const desc = [s.notice, pageUrl].filter(Boolean).join('\n');
        if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
        if (pageUrl) lines.push(`URL:${pageUrl}`);
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(s.title)}`, 'TRIGGER:-PT2H', 'END:VALARM');
        lines.push('END:VEVENT', 'END:VCALENDAR');
        return lines.map(fold).join('\r\n') + '\r\n';
    }
    const icsName = s => `${(s.entry.campaign || s.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}${s.number !== null ? '-session-' + s.number : ''}.ics`;

    /* ---------- markup (same classes as the original static cards) ---------- */
    function cardHtml(s) {
        const v = VARIANTS[s.variant];
        const css = v.css;
        const lineIcon = css === 'tbd' ? 'session-card__line-icon--faint' : 'session-card__line-icon';
        const label = `${s.title}${s.number !== null ? `, session ${s.number}` : ''}${s.variant === 'cancelled' || s.variant === 'postponed' ? ` (${v.label.toLowerCase()})` : ''}`;
        const line = (icon, text, cls = '') => `<p class="session-card__line--${css}${cls ? ' ' + cls : ''}"><span class="${lineIcon} material-symbols-outlined">${icon}</span> <span>${esc(text)}</span></p>`;
        const struck = s.variant === 'cancelled' || s.variant === 'postponed' ? 'session-card__line--struck' : '';
        return `<div class="session-card--${css}${v.mod ? ' ' + v.mod : ''} cursor-glow-card" style="--glow-color: ${v.glow};">
            ${s.link ? `<a class="session-card__link" href="${esc(s.link)}" aria-label="${esc(label)}"></a>` : ''}
            <div class="session-card__glow" style="background: radial-gradient(400px circle at var(--mouse-x, 0) var(--mouse-y, 0), var(--glow-color), transparent 40%);"></div>
            <div class="session-card__bar--${css}"></div>
            <div class="session-card__head">
                <div class="session-card__ident">
                    <div class="session-card__badge--${css}">
                        <span class="session-card__badge-icon--${css} material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${v.icon}</span>
                    </div>
                    <div>
                        <h3 class="session-card__title--${css}">${esc(s.title)}</h3>
                        ${s.number !== null ? `<p class="session-card__number">Session ${s.number}</p>` : ''}
                    </div>
                </div>
                <div class="session-card__status-wrap">
                    <span class="session-card__status--${css}">${v.label}</span>
                    ${s.countdown ? `<span class="session-card__countdown">${esc(s.countdown)}</span>` : ''}
                </div>
            </div>
            <div class="session-card__details">
                ${line('event', s.dateText, struck)}
                ${s.timeText ? line('schedule', s.timeText, struck) : ''}
                ${s.where ? line('location_on', s.where) : ''}
                ${s.notice ? line('info', s.notice, 'session-card__line--notice') : ''}
                ${s.calendar ? `<button type="button" class="session-card__ics" data-ics="${s.index}" title="Download an event for your calendar app">
                    <span class="material-symbols-outlined">calendar_add_on</span><span class="session-card__ics-label">Add to calendar</span></button>` : ''}
            </div>
        </div>`;
    }
    const EMPTY_HTML = `<p class="sessions__empty">No session on the calendar yet. The threads are still being spun.</p>`;

    function render(grid, schedule, campaigns) {
        const all = resolve(schedule.sessions || [], { campaigns });
        const shown = all.filter(s => !s.past);
        grid.dataset.count = String(shown.length);
        grid.innerHTML = shown.length ? shown.map(cardHtml).join('') : EMPTY_HTML;
        grid.onclick = e => {
            const btn = e.target.closest('[data-ics]');
            if (!btn) return;
            const s = all[Number(btn.dataset.ics)];
            const pageUrl = s.link ? new URL(s.link, location.href).href : '';
            const blob = new Blob([ics(s, { hours: schedule.length, pageUrl })], { type: 'text/calendar;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = icsName(s);
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };
    }

    ATH.upcoming = { resolve, suggest, cardHtml, ics, countdown, formatDate, formatTime, parseDate, todayISO, VARIANTS };

    /* ---------- homepage ---------- */
    if (typeof document === 'undefined' || ATH.manualLoad) return;
    const script = document.currentScript;
    const base = script && script.src ? script.src.replace(/scripts\/upcoming-sessions\.js(\?.*)?$/, '') : './';
    const getJSON = path => fetch(base + path, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`${path}: HTTP ${r.status}`))));
    const start = async () => {
        const grid = document.getElementById('upcoming-sessions-grid');
        if (!grid) return;
        try {
            const [schedule, campaigns] = await Promise.all([getJSON('data/schedule.json'), getJSON('data/campaigns.json').catch(() => [])]);
            render(grid, schedule || {}, campaigns || []);
        } catch (e) {
            console.error('[Athenaeum] upcoming sessions:', e.message);
            grid.dataset.count = '0';
            grid.innerHTML = EMPTY_HTML;
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(typeof window !== 'undefined' ? window : globalThis);
