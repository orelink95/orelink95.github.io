/* =====================================================================
   TODAY IN ERALDOM — the homepage card (index.html, #today-eraldom).
   ---------------------------------------------------------------------
   Today's date in the world (calendar.now, else the latest session's
   date), its season and how far into it, both moons, and the next
   festival. The whole card opens the Calendar tab of the Book of Days.
   Reads only data/calendar.json, festivals.json, sessions.json,
   settings.json and campaigns.json (not the whole store), leaving out what
   is hidden from players; dates: scripts/core/calendar.js.
   A festival limited to campaigns shows only if the current campaign
   (settings) is one of them. Styles: styles/pages/index.css (.today-card),
   in the family of the session cards under it.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const card = document.getElementById('today-eraldom');
    if (!card || !window.Athenaeum || !Athenaeum.makeCalendar) return;
    const get = f => fetch(f, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const [calendar, allFestivals, allSessions, settings, campaigns] = await Promise.all(
        ['data/calendar.json', 'data/festivals.json', 'data/sessions.json', 'data/settings.json', 'data/campaigns.json'].map(get));
    if (!calendar) return;
    // Records hidden from players (`hidden`, or a session of a hidden campaign) don't count
    const hiddenCamps = new Set((campaigns || []).filter(c => c && c.hidden === true).map(c => c.id));
    const sessions = (allSessions || []).filter(s => s && s.hidden !== true && !hiddenCamps.has(s.campaign));
    const festivals = (allFestivals || []).filter(f => f && f.hidden !== true &&
        !((f.campaigns || []).length && f.campaigns.every(c => hiddenCamps.has(c))));

    const cal = Athenaeum.makeCalendar(calendar);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const store = { all: () => (sessions || []) };   // cal.now() only needs the sessions
    const today = cal.now(store);
    if (!today || !today.month || !today.day) return;

    const months = cal.months.map(m => m.name);
    const next = d => {
        const i = months.indexOf(d.month);
        if (d.day < cal.daysIn(d.year, i)) return { ...d, day: d.day + 1 };
        return i < months.length - 1 ? { year: d.year, month: months[i + 1], day: 1 } : { year: Number(d.year) + 1, month: months[0], day: 1 };
    };
    const current = settings && settings.currentCampaign;
    const known = f => !(f.campaigns || []).length || (current && f.campaigns.includes(current));

    // The next festival: today, or its first day within the coming year
    let coming = null;
    let d = { ...today, year: Number(today.year), day: Number(today.day) };
    for (let k = 0; k < 400 && !coming; k++, d = next(d)) {
        for (const f of (festivals || []).filter(known)) {
            const n = cal.occursOn(f, d);
            if (n && (k === 0 || n === 1)) { coming = { f, k, d: { ...d }, n }; break; }
        }
    }

    const se = cal.season(today);
    const nextSeason = se && cal.seasons.length > 1 ? cal.seasons[(se.index + 1) % cal.seasons.length].name : '';
    const moon = (m, size) => {
        const dx = Math.round((1 - m.lit) * size * 1.05) * (m.waning ? -1 : 1);
        const glow = m.lit > 0.85 ? `, 0 0 ${Math.round(size * 0.8)}px ${m.colour}99` : '';
        return `<span class="today-card__moon" style="width:${size}px;height:${size}px;background:${esc(m.colour)};box-shadow:inset ${dx}px 0 0 0 #1b1830${glow}" aria-hidden="true"></span>`;
    };
    const moons = cal.moons(today);
    const when = coming ? (coming.k === 0 ? (coming.n > 1 ? `day ${coming.n} · today` : 'today') : `in ${coming.k} day${coming.k === 1 ? '' : 's'}`) : '';
    const span = f => (Number(f.days) > 1 ? ` · ${f.days} days` : '');

    card.href = `timeline.html?view=calendar`;
    card.setAttribute('aria-label', `Today in Eraldom: ${cal.format(today)}. Open the calendar.`);
    // One set of parts, laid out by CSS grid: four columns on wide screens; on phones
    // the date and the moons side by side, the season, then the next celebration
    card.innerHTML = `
        <span class="today-card__bar" aria-hidden="true"></span>
        <div class="today-card__part today-card__date">
            <span class="today-card__label">Today in Eraldom</span>
            <span class="today-card__day">${esc(today.day)} ${esc(today.month)}</span>
            <span class="today-card__sub">${esc(cal.weekday(today))} · ${esc(today.year)} ${esc(cal.era)}</span>
        </div>
        ${se ? `<div class="today-card__part today-card__season" style="--season:${esc(se.colour || '#e9c176')}">
            <span class="today-card__label today-card__label--muted">Season</span>
            <span class="today-card__name">${esc(se.name)} <span class="today-card__sub">· day ${se.day} of ${se.of}</span></span>
            <span class="today-card__progress"><span style="width:${Math.round(se.day / se.of * 100)}%"></span></span>
            ${nextSeason && se.left > 0 ? `<span class="today-card__sub">${esc(nextSeason)} in ${se.left + 1} days</span>` : ''}
        </div>` : ''}
        ${moons.length ? `<div class="today-card__part today-card__moons">
            <span class="today-card__label today-card__label--muted">The moons</span>
            ${moons.map(m => `<span class="today-card__moonline">${moon(m, 18)}<span><b>${esc(m.name)}</b><span class="today-card__phase">${esc(m.phase)}</span></span></span>`).join('')}
        </div>` : ''}
        <div class="today-card__part today-card__next">
            <span class="today-card__label today-card__label--muted">Next celebration</span>
            ${coming ? `<span class="today-card__name">${esc(coming.f.name)}</span>
                <span class="today-card__sub">${esc(coming.f.on.day)} ${esc(coming.f.on.month)}${span(coming.f)} · ${when}</span>`
                : '<span class="today-card__sub">None written yet</span>'}
            <span class="today-card__cta">Open the calendar <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></span>
        </div>`;
    card.hidden = false;
});
