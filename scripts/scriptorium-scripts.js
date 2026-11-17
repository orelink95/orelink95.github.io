/* =====================================================================
   THE SCRIPTORIUM (scriptorium.html) — a campaign's chronicle.
   Four tabs (body[data-view]):
   - sessions : the timeline of the sessions, newest first, grouped by arc,
                with the next session planned on top (data/schedule.json, the
                homepage's cards) and the ledger (leads, finds) beside it on
                wide screens
   - journey  : the places visited, on the maps (scripts/scriptorium-journey.js)
   - story    : the full story, one chapter per arc (campaign.chapters)
   - ledger   : leads and finds on their own (phones only)
   A session opens in its folio (<dialog id="scr-folio">). Under the title: a
   memorable quote of the campaign (session.quotes), at random, and the
   "Previously on…" button (<dialog id="scr-recap">: the latest session's recap).
   The campaign is the one the Dramatis Personae pages share
   (scripts/personae.js): ?campaign=…, else the last one picked, else
   settings.currentCampaign. ?session=… opens that session's folio.
   Styles: styles/pages/scriptorium.css
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const personae = Athenaeum.personae;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const els = {
        title: $('scr-title'), meta: $('scr-meta'), picker: $('scr-campaign'),
        search: $('scr-search'), arcs: $('scr-arcs'), count: $('scr-count'), timeline: $('scr-timeline'),
        quests: $('scr-quests'), finds: $('scr-finds'), findsFoot: $('scr-finds-foot'),
        story: $('scr-story'), folio: $('scr-folio'), folioBody: $('folio-body'), folioLabel: $('folio-label'),
        days: $('folio-days'), quote: $('scr-quote'), recapBtn: $('scr-recap-btn'),
        recap: $('scr-recap'), recapBody: $('recap-body'), journey: $('scr-journey'),
    };

    const campaigns = store.all('campaign').slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!campaigns.length) {
        els.timeline.innerHTML = `<p class="scr-empty">No campaign has been recorded yet.</p>`;
        return;
    }

    /* ---------------- small helpers ---------------- */

    const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    function roman(n) {
        if (!Number.isInteger(n) || n < 1) return '';
        let out = '';
        for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
        return out;
    }
    // "Session IV", "Sessions I – III": the first and the last of the numbers
    function sessionsLabel(numbers) {
        const ns = [...new Set(numbers.filter(Number.isInteger))].sort((a, b) => a - b);
        if (!ns.length) return '';
        if (ns.length === 1) return `Session ${roman(ns[0])}`;
        return `Sessions ${roman(ns[0])} – ${roman(ns[ns.length - 1])}`;
    }
    const worldDate = (d, o) => (store.calendar && d ? store.calendar.format(d, o) : '');
    const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

    // The NPCs of a session that exist in the data
    const npcsOf = s => (s.npcs || []).map(e => ({ entry: e, npc: store.get(e.npc) }))
        .filter(x => x.npc && store.typeOf(x.npc) === 'npc');
    const faceSrc = npc => npc.avatar || npc.portrait || '';

    // Who said a quote: a hero or an NPC (session.quotes[].by), else any name
    const speakerOf = q => { const r = q && q.by ? store.get(q.by) : null; return r && ['hero', 'npc'].includes(store.typeOf(r)) ? r : null; };
    const speakerName = q => { const r = speakerOf(q); return r ? r.name : (q && q.name) || ''; };
    const quotesOf = s => (s.quotes || []).filter(q => q && q.text);
    const handoutsOf = s => (s.handouts || []).map(id => store.get(id)).filter(h => h && store.typeOf(h) === 'handout' && !h.draft);

    // A link to a record, with its preview card (data-kw: scripts/core/preview.js)
    function recLink(rec, cls, inner) {
        const href = store.url(rec);
        const label = inner === undefined ? esc(rec.name) : inner;
        return href ? `<a href="${esc(href)}" class="${cls}" data-kw="${esc(rec.id)}">${label}</a>`
                    : `<span class="${cls}" data-kw="${esc(rec.id)}">${label}</span>`;
    }
    // A place with no page: a click searches the chronicle for it
    const searchLink = (term, cls) => `<button type="button" class="scr-searchlink ${cls || ''}" data-search="${esc(term)}" title="Search the chronicle">${esc(term)}</button>`;

    // The places of a session: records first, then the ones with no page
    const placesOf = s => [
        ...(s.places || []).map(id => store.get(id)).filter(Boolean).map(rec => ({ name: rec.name, rec })),
        ...(s.otherPlaces || []).map(name => ({ name, rec: null })),
    ];
    const placeHtml = (p, cls) => (p.rec ? recLink(p.rec, `kw-place ${cls || ''}`) : searchLink(p.name, cls));

    /* ---------------- linked names ---------------- */

    // Glossary terms (data/lore.json) search the chronicle; everything else is a link
    function keywordAttrs(rec) {
        if (store.typeOf(rec) === 'lore') return `onclick="event.preventDefault(); triggerSearch('${rec.id}')"`;
        return '';
    }

    // Handout names become links to the handout's file. One pass, longest names
    // first, never inside another link or a {kept plain} name.
    const handouts = store.all('handout').filter(h => !h.draft);
    const handoutByName = new Map(handouts.map(h => [h.name.toLowerCase(), h]));
    const handoutRe = handouts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${[...handouts]
        .sort((a, b) => b.name.length - a.name.length)
        .map(h => h.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
    function linkHandouts(html) {
        if (!handoutRe) return html;
        let inAnchor = 0;
        const spans = [];   // for each open <span>: is it a nolink one?
        return html.split(/(<[^>]+>)/g).map(part => {
            if (part.startsWith('<')) {
                if (/^<a[\s>]/i.test(part)) inAnchor++;
                else if (/^<\/a>/i.test(part)) inAnchor = Math.max(0, inAnchor - 1);
                else if (/^<span[\s>]/i.test(part)) spans.push(/\bclass="[^"]*\bnolink\b/.test(part));
                else if (/^<\/span>/i.test(part)) spans.pop();
                return part;
            }
            if (!part || inAnchor || spans.includes(true)) return part;
            return part.replace(handoutRe, match => {
                const h = handoutByName.get(match.toLowerCase());
                if (!h) return match;
                return `<a href="${esc(h.file || '#')}" target="_blank" rel="noopener noreferrer" class="keyword-link kw-object" data-kw="${esc(h.id)}">${match}</a>`;
            });
        }).join('');
    }

    // Plain text (escaped) or Markdown, with the names of the world linked
    function linked(text, { markdown = false, dropCap = false } = {}) {
        if (!text) return '';
        const html = markdown ? store.md(text, { dropCap }) : esc(text);
        return store.autolink(linkHandouts(html), { className: 'keyword-link', attrs: keywordAttrs, terms: true });
    }

    /* ---------------- state ---------------- */

    let current = null;      // the campaign shown
    let sessions = [];       // its sessions, newest first
    let arcIndex = new Map(); // arc name -> its number (oldest arc = 1)
    let haystacks = new Map(); // session id -> lower-case text the search reads
    let arcFilter = 'all';

    // Everything a search can find in a session
    function haystack(s) {
        const names = ids => (ids || []).map(id => (store.get(id) || {}).name || '');
        return [
            s.name, s.summary, s.region, s.arc, s.body,
            ...(s.keywords || []), ...placesOf(s).map(p => p.name),
            ...npcsOf(s).map(x => [x.npc.name, ...(x.npc.aliases || [])].join(' ')),
            ...names(s.loot), ...(s.accomplished || []), ...(s.leadsPursued || []), ...(s.futureLeads || []),
            s.recap, ...(s.quotes || []).map(q => [q.text, speakerName(q)].join(' ')), ...names(s.handouts),
        ].filter(Boolean).join(' \n ').toLowerCase();
    }

    const arcLabel = arc => (arc ? (arcIndex.has(arc) ? `Arc ${roman(arcIndex.get(arc))} · ${arc}` : arc) : '');
    const arcSessions = arc => sessions.filter(s => s.arc === arc);

    function loadCampaign(campaign) {
        current = campaign;
        sessions = store.all('session').filter(s => s.campaign === campaign.id);
        arcIndex = new Map();
        [...sessions].reverse().forEach(s => { if (s.arc && !arcIndex.has(s.arc)) arcIndex.set(s.arc, arcIndex.size + 1); });
        haystacks = new Map(sessions.map(s => [s.id, haystack(s)]));
        arcFilter = 'all';
        els.search.value = '';

        renderHero();
        renderArcs();
        renderTimeline();
        renderLedger();
        renderStory();
        if (journey) journey.load(sessions);
    }

    /* ---------------- header ---------------- */

    function renderHero() {
        els.title.textContent = current.name;
        const dated = sessions.filter(s => s.date && s.date.year != null);
        let span = '';
        if (dated.length) {
            const a = dated[dated.length - 1].date, b = dated[0].date;
            if (dated.length === 1 || (a.year === b.year && a.month === b.month && a.day === b.day)) span = worldDate(a, { weekday: false });
            else if (a.year === b.year && a.month === b.month && a.day != null) span = `${a.day} – ${worldDate(b, { weekday: false })}`;
            else if (a.year === b.year) span = `${worldDate(a, { weekday: false, year: false })} – ${worldDate(b, { weekday: false })}`;
            else span = `${worldDate(a, { weekday: false })} – ${worldDate(b, { weekday: false })}`;
        }
        const n = sessions.length;
        els.meta.textContent = [`The chronicle of ${current.partyName || current.name}`, `${n} ${n === 1 ? 'session' : 'sessions'}`, span]
            .filter(Boolean).join(' · ');

        // A memorable quote of the campaign, a different one at each visit
        const quotes = sessions.flatMap(s => quotesOf(s).map(q => ({ q, s })));
        els.quote.hidden = !quotes.length;
        if (quotes.length) {
            const { q, s } = quotes[Math.floor(Math.random() * quotes.length)];
            const who = speakerOf(q);
            els.quote.innerHTML = `<blockquote class="scr-quote__text">“${esc(q.text)}”</blockquote>
                <figcaption class="scr-quote__by">— ${who ? recLink(who, 'scr-quote__name') : esc(q.name || 'Unknown')}
                    · <button type="button" class="scr-quote__session" data-open="${esc(s.id)}">Session ${esc(roman(s.number) || s.name)}</button></figcaption>`;
        }
        els.recapBtn.hidden = !sessions.length;
    }

    /* ---------------- sessions ---------------- */

    function renderArcs() {
        const arcs = [...arcIndex.keys()];
        if (arcs.length < 2) { els.arcs.innerHTML = ''; els.arcs.hidden = true; return; }
        els.arcs.hidden = false;
        els.arcs.innerHTML = [['all', 'All arcs'], ...arcs.map(a => [a, a])].map(([v, label]) =>
            `<button type="button" class="scr-pill" data-arc="${esc(v)}" aria-pressed="${v === arcFilter}">${esc(label)}</button>`).join('');
    }

    function filtered() {
        const q = els.search.value.trim().toLowerCase();
        return sessions.filter(s => (arcFilter === 'all' || s.arc === arcFilter) && (!q || haystacks.get(s.id).includes(q)));
    }

    function faces(s, max = 4) {
        const list = npcsOf(s);
        const shown = list.slice(0, max).map(({ npc }) => {
            const src = faceSrc(npc);
            const inner = src ? `<img src="${esc(src)}" alt="${esc(npc.name)}" loading="lazy">` : `<span aria-label="${esc(npc.name)}">${esc(initials(npc.name))}</span>`;
            return recLink(npc, 'scr-face', inner);
        }).join('');
        const more = list.length > max ? `<span class="scr-face scr-face--more">+${list.length - max}</span>` : '';
        return shown || more ? `<span class="scr-faces">${shown}${more}</span>` : '';
    }

    function entryHtml(s, latest) {
        const places = placesOf(s);
        const placeLine = places.length ? `<span class="scr-card__places"><span class="material-symbols-outlined" aria-hidden="true">location_on</span>
            ${places.slice(0, 2).map(p => placeHtml(p)).join('<span class="scr-dot" aria-hidden="true">·</span>')}
            ${places.length > 2 ? `<span class="scr-card__more">+${places.length - 2}</span>` : ''}</span>` : '';
        const loot = (s.loot || []).length;
        const lootLine = loot ? `<span class="scr-card__finds"><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>${loot} ${loot === 1 ? 'find' : 'finds'}</span>` : '';
        return `
            <article id="${esc(s.id)}" class="scr-entry">
                <span class="scr-seal${latest ? ' is-latest' : ''}" aria-hidden="true">${roman(s.number)}</span>
                <div class="scr-card${latest ? ' is-latest' : ''}" data-card="${esc(s.id)}">
                    <div class="scr-card__top">
                        <span class="scr-card__date">${esc(worldDate(s.date) || 'Unknown date')}</span>
                        ${latest ? '<span class="scr-badge">Latest folio</span>' : ''}
                        ${faces(s)}
                    </div>
                    <h3 class="scr-card__title"><button type="button" data-open="${esc(s.id)}">${esc(s.name)}</button></h3>
                    ${s.summary ? `<p class="scr-card__summary">${linked(s.summary)}</p>` : ''}
                    <div class="scr-card__foot">
                        ${placeLine}${lootLine}
                        <button type="button" class="scr-card__read" data-open="${esc(s.id)}" aria-label="Read the folio of ${esc(s.name)}">Read folio<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
                    </div>
                </div>
            </article>`;
    }

    function renderTimeline() {
        const list = filtered();
        const q = els.search.value.trim();
        els.count.textContent = `${list.length} ${list.length === 1 ? 'folio' : 'folios'}`;
        if (!list.length) {
            els.timeline.innerHTML = sessions.length
                ? `<div class="scr-empty"><span class="material-symbols-outlined" aria-hidden="true">ink_eraser</span>
                    <p class="scr-empty__title">${q ? `No folio mentions “${esc(q)}”.` : 'No folio in this arc.'}</p>
                    <p class="scr-empty__help">The search reads titles, summaries, places, people, finds and transcripts.</p></div>`
                : `<div class="scr-empty"><span class="material-symbols-outlined" aria-hidden="true">ink_pen</span>
                    <p class="scr-empty__title">No session has been recorded for this campaign yet.</p></div>`;
            return;
        }
        const plain = !q && arcFilter === 'all';
        let html = plain ? nextSessionHtml() : '', arc = null;
        list.forEach((s, i) => {
            if (i === 0 || s.arc !== arc) {
                arc = s.arc;
                const range = sessionsLabel(arcSessions(arc).map(x => x.number));
                html += `<div class="scr-arc"><span class="scr-arc__mark" aria-hidden="true"></span>
                    <h2 class="scr-arc__title">${esc(arcLabel(arc) || 'Sessions')}</h2>${range ? `<span class="scr-arc__range">${esc(range)}</span>` : ''}</div>`;
            }
            html += entryHtml(s, plain && s === sessions[0]);
        });
        els.timeline.innerHTML = `<div class="scr-spine" aria-hidden="true"></div>${html}`;
    }

    /* The next session planned for this campaign (data/schedule.json, the
       homepage's cards; same rules: scripts/upcoming-sessions.js) */
    function nextSessionHtml() {
        const up = Athenaeum.upcoming;
        const schedule = (store.singletons && store.singletons.schedule) || {};
        if (!up || !Array.isArray(schedule.sessions)) return '';
        const mine = up.resolve(schedule.sessions, { campaigns })
            .filter(x => x.entry.campaign === current.id && !x.past && x.variant !== 'cancelled');
        if (!mine.length) return '';
        const [next, then] = mine;
        const label = next.variant === 'next' ? 'Next session' : next.label;
        const when = [next.dateText, next.timeText].filter(Boolean).join(' · ');
        const extra = [next.where, next.countdown].filter(Boolean).join(' · ');
        return `<div class="scr-entry scr-next${next.variant === 'postponed' ? ' is-postponed' : ''}">
                <span class="scr-seal scr-seal--next" aria-hidden="true"><span class="material-symbols-outlined">hourglass_top</span></span>
                <div class="scr-next__card">
                    <div><p class="scr-next__label">${esc(label)}${next.number != null ? ` · ${esc(roman(next.number))}` : ''}</p>
                        <p class="scr-next__when">${esc(when)}</p>
                        ${next.notice ? `<p class="scr-next__extra">${esc(next.notice)}</p>` : ''}</div>
                    ${extra ? `<p class="scr-next__extra">${esc(extra)}</p>` : ''}
                    ${then ? `<p class="scr-next__then">Then: ${esc(then.dateText)}${then.variant === 'tbd' ? ' · tentative' : ''}</p>` : ''}
                </div>
            </div>`;
    }

    /* ---------------- the ledger ---------------- */

    function renderLedger() {
        const quests = current.quests || [];
        els.quests.innerHTML = quests.length ? quests.map(q => {
            const primary = q.status === 'Primary';
            return `<div class="scr-quest${primary ? ' is-primary' : ''}">
                <span class="scr-quest__mark material-symbols-outlined" aria-hidden="true">${primary ? 'workspace_premium' : 'radio_button_unchecked'}</span>
                <div><h3 class="scr-quest__title">${esc(q.title)}${primary ? '<span class="scr-quest__tag">Primary</span>' : ''}</h3>
                ${q.description ? `<p class="scr-quest__text">${linked(q.description)}</p>` : ''}</div></div>`;
        }).join('') : '<p class="scr-panel__none">No lead is being followed.</p>';

        const ids = [...new Set(sessions.flatMap(s => s.loot || []))];
        const found = sessions.filter(s => (s.loot || []).length).length;
        els.finds.innerHTML = ids.map(id => {
            const item = store.get(id);
            const name = item ? item.name : id;
            const inner = item && item.image
                ? `<img src="${esc(item.image)}" alt="" loading="lazy">`
                : `<span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>`;
            const cls = `scr-find${item && item.image ? '' : ' scr-find--plain'}`;
            return item ? recLink(item, cls, `${inner}<span class="sr-only">${esc(name)}</span>`).replace('data-kw', `title="${esc(name)}" data-kw`)
                        : `<span class="${cls}" title="${esc(name)}">${inner}<span class="sr-only">${esc(name)}</span></span>`;
        }).join('');
        els.findsFoot.innerHTML = ids.length
            ? `<span>${ids.length} ${ids.length === 1 ? 'find' : 'finds'} across ${found} ${found === 1 ? 'session' : 'sessions'}</span><a href="vault.html" class="scr-finds__vault">Open the Vault →</a>`
            : '<span>Nothing found yet.</span>';
    }

    /* ---------------- the full story ---------------- */

    function renderStory() {
        const chapters = (current.chapters || []).filter(c => c && (c.passages || []).some(p => p && p.text));
        const written = new Set(chapters.map(c => c.arc));
        const unwritten = [...arcIndex.keys()].filter(a => !written.has(a));

        if (!chapters.length) {
            els.story.innerHTML = `<div class="scr-empty"><span class="material-symbols-outlined" aria-hidden="true">ink_pen</span>
                <p class="scr-empty__title">The scribes have not begun this story yet.</p></div>`;
            return;
        }
        const num = id => (store.get(id) || {}).number;
        const nav = chapters.map((c, i) => {
            const range = sessionsLabel(arcSessions(c.arc).map(s => s.number));
            return `<a href="#chapter-${i + 1}" class="scr-toc${i === 0 ? ' is-active' : ''}" data-chapter="${i + 1}">${esc(arcLabel(c.arc) || c.arc)}${range ? `<small>${esc(range)}</small>` : ''}</a>`;
        }).join('') + unwritten.map(a => `<span class="scr-toc is-unwritten">${esc(arcLabel(a))}<small>Yet unwritten</small></span>`).join('');

        const body = chapters.map((c, i) => {
            const passages = (c.passages || []).filter(p => p && p.text);
            const told = passages.flatMap(p => (p.sessions || []).map(num));
            const last = Math.max(0, ...told.filter(Number.isInteger));
            return `<article id="chapter-${i + 1}" class="scr-chapter">
                <p class="scr-chapter__eyebrow">${i === chapters.length - 1 ? 'The Story So Far' : 'The Story'}</p>
                <h2 class="scr-chapter__title">${esc(arcLabel(c.arc) || c.arc)}</h2>
                ${last ? `<p class="scr-chapter__sub">As set down after Session ${roman(last)}</p>` : ''}
                ${passages.map((p, j) => {
                    const refs = (p.sessions || []).filter(id => store.get(id));
                    const label = sessionsLabel(refs.map(num));
                    const note = refs.length && label
                        ? `<button type="button" class="scr-note" data-open="${esc(refs[0])}"><span class="material-symbols-outlined" aria-hidden="true">bookmark</span>${esc(label)}</button>`
                        : '<span class="scr-note scr-note--none"></span>';
                    return `<div class="scr-passage"><div class="scr-passage__text story-text">${linked(p.text, { markdown: true, dropCap: j === 0 })}</div>${note}</div>`;
                }).join('')}
                <div class="scr-chapter__end" aria-hidden="true"><span></span><span class="material-symbols-outlined">auto_awesome</span><span></span></div>
            </article>`;
        }).join('');

        els.story.innerHTML = `<nav class="scr-chapters" aria-label="Chapters"><p class="scr-chapters__title">Chapters</p>${nav}</nav>
            <div class="scr-manuscript">${body}</div>`;
    }

    /* ---------------- the folio ---------------- */

    const MOOD = {
        like: { icon: 'sentiment_satisfied', label: 'Friendly' },
        dislike: { icon: 'sentiment_dissatisfied', label: 'Hostile' },
        neutral: { icon: 'sentiment_neutral', label: 'Neutral' },
    };
    let shown = null;   // the session in the folio

    function section(cls, icon, title, inner) {
        return `<section class="folio-sec ${cls}"><h3 class="folio-sec__title">${icon ? `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>` : ''}${title}</h3>${inner}</section>`;
    }
    const listOf = (items, cls) => `<ul class="${cls}">${items.map(t => `<li>${linked(t)}</li>`).join('')}</ul>`;

    function folioHtml(s) {
        const places = placesOf(s);
        const npcs = npcsOf(s);
        const loot = (s.loot || []).map(id => ({ id, item: store.get(id) }));
        const date = worldDate(s.date) || 'Unknown date';

        const main = [
            s.summary ? `<p class="folio__summary">${linked(s.summary)}</p>` : '',
            quotesOf(s).length ? section('folio-sec--quotes', 'format_quote', 'Memorable Quotes',
                `<div class="folio-quotes">${quotesOf(s).map(q => {
                    const who = speakerOf(q);
                    const src = who ? faceSrc(who) : '';
                    const face = src ? `<img class="folio-quote__face" src="${esc(src)}" alt="" loading="lazy">`
                        : `<span class="folio-quote__face folio-quote__face--plain material-symbols-outlined" aria-hidden="true">format_quote</span>`;
                    const role = who ? (store.typeOf(who) === 'hero' ? 'Hero' : '') : '';
                    return `<figure class="folio-quote">${face}<div>
                        <blockquote class="folio-quote__text">“${esc(q.text)}”</blockquote>
                        <figcaption class="folio-quote__by">— ${who ? recLink(who, `folio-quote__name${store.typeOf(who) === 'hero' ? ' is-hero' : ''}`) : esc(q.name || 'Unknown')}${role ? ` <span class="folio-quote__role">· ${role}</span>` : ''}</figcaption>
                    </div></figure>`;
                }).join('')}</div>`) : '',
            (s.accomplished || []).length ? section('folio-sec--done', 'verified', 'Things Accomplished',
                `<ul class="folio-done">${s.accomplished.map(t => `<li><span class="folio-done__mark" aria-hidden="true">✦</span><span>${linked(t)}</span></li>`).join('')}</ul>`) : '',
            section('folio-sec--transcript', 'history_edu', 'Archival Transcript', s.body
                ? `<div class="folio__transcript session-text">${linked(s.body, { markdown: true })}</div>`
                : `<div class="folio__unwritten"><span class="material-symbols-outlined" aria-hidden="true">ink_pen</span><p>The scribes have not finished this folio yet.</p></div>`),
        ].join('');

        const rail = [
            places.length || s.region ? section('folio-sec--places', 'location_on', 'Places',
                `${s.region ? `<p class="folio__region">${esc(s.region)}</p>` : ''}
                 ${places.length ? `<ul class="folio-places">${places.map(p => `<li>${placeHtml(p)}</li>`).join('')}</ul>` : ''}
                 ${(s.places || []).some(id => store.get(id)) ? `<button type="button" class="folio__journey" data-journey="${esc(s.id)}"><span class="material-symbols-outlined" aria-hidden="true">route</span>Follow on the Journey</button>` : ''}`) : '',
            npcs.length ? section('folio-sec--people', 'group', 'Encounters',
                `<ul class="folio-people">${npcs.map(({ npc, entry }) => {
                    const m = MOOD[entry.sentiment] || MOOD.neutral;
                    const src = faceSrc(npc);
                    return `<li>${src ? `<img class="folio-people__face" src="${esc(src)}" alt="" loading="lazy">` : `<span class="folio-people__face folio-people__face--initials" aria-hidden="true">${esc(initials(npc.name))}</span>`}
                        ${recLink(npc, 'kw-person folio-people__name')}
                        <span class="folio-mood folio-mood--${esc(entry.sentiment || 'neutral')} material-symbols-outlined" title="${m.label}" role="img" aria-label="${m.label}">${m.icon}</span></li>`;
                }).join('')}</ul>`) : '',
            loot.length ? section('folio-sec--vault', 'inventory_2', 'The Vault',
                `<ul class="folio-loot">${loot.map(({ id, item }) => {
                    const pic = item && item.image ? `<img class="folio-loot__pic" src="${esc(item.image)}" alt="" loading="lazy">`
                        : `<span class="folio-loot__pic folio-loot__pic--plain material-symbols-outlined" aria-hidden="true">auto_awesome</span>`;
                    return `<li>${pic}${item ? recLink(item, 'kw-object') : `<span class="kw-object">${esc(id)}</span>`}</li>`;
                }).join('')}</ul>`) : '',
            handoutsOf(s).length ? section('folio-sec--handouts', 'contract', 'Handouts Received',
                `<ul class="folio-handouts">${handoutsOf(s).map(h => {
                    const pic = h.thumbnail ? `<img class="folio-handouts__pic" src="${esc(h.thumbnail)}" alt="" loading="lazy">`
                        : `<span class="folio-handouts__pic folio-handouts__pic--plain material-symbols-outlined" aria-hidden="true">${esc(h.icon || 'contract')}</span>`;
                    const name = h.file ? `<a href="${esc(h.file)}" target="_blank" rel="noopener noreferrer" class="kw-object" data-kw="${esc(h.id)}">${esc(h.name)}</a>`
                        : `<span class="kw-object" data-kw="${esc(h.id)}">${esc(h.name)}</span>`;
                    return `<li>${pic}<span>${name}${h.category ? `<small>${esc(h.category)}</small>` : ''}</span></li>`;
                }).join('')}</ul>`) : '',
            (s.leadsPursued || []).length ? section('folio-sec--pursued', '', 'Leads Pursued', listOf(s.leadsPursued, 'folio-list')) : '',
            (s.futureLeads || []).length ? section('folio-sec--future', 'explore', 'Future Leads', listOf(s.futureLeads, 'folio-list')) : '',
        ].join('');

        return `
            <header class="folio__head">
                <div class="folio__date-row"><span class="folio__rule"></span>
                    <p class="folio__date">${esc([date, s.region].filter(Boolean).join(' — '))}</p><span class="folio__rule"></span></div>
                <h2 id="folio-title" class="folio__title">${esc(s.name)}</h2>
                ${s.arc ? `<p class="folio__arc">${esc(arcLabel(s.arc))}</p>` : ''}
            </header>
            <div class="folio__grid">
                <div class="folio__main">${main}</div>
                ${rail ? `<aside class="folio__rail">${rail}</aside>` : ''}
            </div>`;
    }

    function setAddress(id) {
        const url = new URL(location.href);
        if (id) url.searchParams.set('session', id); else url.searchParams.delete('session');
        history.replaceState(history.state, '', url.pathname.split('/').pop() + url.search + url.hash);
    }

    function openFolio(id) {
        const s = sessions.find(x => x.id === id);
        if (!s) return;
        shown = s;
        const i = sessions.indexOf(s);
        els.folioLabel.textContent = [s.number ? `Folio ${roman(s.number)}` : 'Folio', current.name].join(' · ');
        els.folio.querySelector('[data-step="1"]').disabled = i === sessions.length - 1;
        els.folio.querySelector('[data-step="-1"]').disabled = i === 0;
        els.folioBody.innerHTML = folioHtml(s);
        els.days.href = `timeline.html?session=${encodeURIComponent(s.id)}`;
        els.folioBody.scrollTop = 0;
        if (Athenaeum.preview) Athenaeum.preview.close();
        if (!els.folio.open) {
            els.folio.showModal();
            document.body.classList.add('scr-locked');
        }
        setAddress(s.id);
    }
    function closeFolio() { if (els.folio.open) els.folio.close(); }
    els.folio.addEventListener('close', () => {
        document.body.classList.remove('scr-locked');
        if (Athenaeum.preview) Athenaeum.preview.close();
        setAddress(null);
        // Back to the card it came from
        const card = shown && document.querySelector(`[data-card="${CSS.escape(shown.id)}"] [data-open]`);
        if (card && document.body.dataset.view === 'sessions') card.focus({ preventScroll: true });
        shown = null;
    });
    // A click on the dimmed page around it closes it
    els.folio.addEventListener('click', e => { if (e.target === els.folio) closeFolio(); });
    els.folio.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
        const i = sessions.indexOf(shown) + Number(b.dataset.step);
        if (sessions[i]) openFolio(sessions[i].id);
    }));
    els.folio.querySelector('[data-close]').addEventListener('click', closeFolio);

    /* ---------------- "Previously on…" ---------------- */

    function recapHtml() {
        const s = sessions[0];
        if (!s) return '';
        const loot = (s.loot || []).map(id => store.get(id)).filter(Boolean);
        const date = worldDate(s.date);
        return `
            <header class="recap__head">
                <p class="recap__eyebrow">Previously on…</p>
                <h2 id="recap-title" class="recap__title">${esc(current.name)}</h2>
                <p class="recap__sub">${esc([s.number ? `Session ${roman(s.number)}` : '', s.name, date].filter(Boolean).join(' · '))}</p>
            </header>
            <div class="recap__text story-text">${s.recap ? linked(s.recap, { markdown: true }) : `<p>${linked(s.summary || '')}</p>`}</div>
            ${(s.futureLeads || []).length || loot.length ? `<div class="recap__cols">
                ${(s.futureLeads || []).length ? `<section class="recap__leads"><h3 class="recap__h"><span class="material-symbols-outlined" aria-hidden="true">explore</span>Where things stand</h3>
                    <ul>${s.futureLeads.map(t => `<li>${linked(t)}</li>`).join('')}</ul></section>` : ''}
                ${loot.length ? `<section class="recap__finds"><h3 class="recap__h recap__h--vault"><span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>New in the Vault</h3>
                    <div class="recap__grid">${loot.map(item => recLink(item, `recap__find${item.image ? '' : ' recap__find--plain'}`,
                        `${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : '<span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>'}<span class="recap__find-name">${esc(item.name)}</span>`)).join('')}</div></section>` : ''}
            </div>` : ''}`;
    }
    function openRecap() {
        els.recapBody.innerHTML = recapHtml();
        els.recapBody.scrollTop = 0;
        if (!els.recap.open) { els.recap.showModal(); document.body.classList.add('scr-locked'); }
    }
    els.recapBtn.addEventListener('click', openRecap);
    els.recap.addEventListener('close', () => { document.body.classList.remove('scr-locked'); if (Athenaeum.preview) Athenaeum.preview.close(); });
    els.recap.addEventListener('click', e => { if (e.target === els.recap) els.recap.close(); });
    els.recap.querySelector('[data-close]').addEventListener('click', () => els.recap.close());
    els.recap.querySelector('[data-print]').addEventListener('click', () => {
        document.body.classList.add('scr-printing');
        window.print();
        document.body.classList.remove('scr-printing');
    });

    /* ---------------- the journey ---------------- */

    const journey = Athenaeum.journey ? Athenaeum.journey({ store, el: els.journey, roman, esc, recLink }) : null;

    /* ---------------- tabs ---------------- */

    const tabs = [...document.querySelectorAll('.scr-tab')];
    function setView(view, { focus = false } = {}) {
        document.body.dataset.view = view;
        tabs.forEach(t => {
            const on = t.dataset.view === view;
            t.setAttribute('aria-selected', String(on));
            t.tabIndex = on ? 0 : -1;
            if (on && focus) t.focus();
        });
    }
    tabs.forEach(t => {
        t.addEventListener('click', () => { setView(t.dataset.view); window.scrollTo({ top: 0 }); });
        t.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const visible = tabs.filter(x => x.offsetParent !== null);
            const i = visible.indexOf(t) + (e.key === 'ArrowRight' ? 1 : -1);
            const next = visible[(i + visible.length) % visible.length];
            setView(next.dataset.view, { focus: true });
            e.preventDefault();
        });
    });

    /* ---------------- search ---------------- */

    function search(term) {
        closeFolio();
        if (Athenaeum.preview) Athenaeum.preview.close();
        arcFilter = 'all';
        renderArcs();
        els.search.value = term;
        setView('sessions');
        renderTimeline();
        els.search.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Glossary terms: called with a term's id, or with any text
    window.triggerSearch = term => {
        const rec = store.get(term);
        search(rec ? rec.name : term);
    };
    // The same search from a term's preview card (the button of the sheet on phones)
    Athenaeum.loreAction = { label: 'Search the Chronicle', run: id => window.triggerSearch(id) };

    els.search.addEventListener('input', renderTimeline);
    els.arcs.addEventListener('click', e => {
        const b = e.target.closest('[data-arc]');
        if (!b) return;
        arcFilter = b.dataset.arc;
        els.arcs.querySelectorAll('[data-arc]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        renderTimeline();
    });

    /* ---------------- clicks anywhere ---------------- */

    document.addEventListener('click', e => {
        const open = e.target.closest('[data-open]');
        if (open) { openFolio(open.dataset.open); return; }
        const follow = e.target.closest('[data-journey]');
        if (follow && journey) {
            closeFolio();
            setView('journey');
            journey.followSession(follow.dataset.journey);
            window.scrollTo({ top: 0 });
            return;
        }
        const term = e.target.closest('[data-search]');
        if (term) { search(term.dataset.search); return; }
        // The rest of a card opens its folio too (not its links)
        const card = e.target.closest('[data-card]');
        if (card && !e.target.closest('a, button, [data-kw]') && !String(window.getSelection() || '')) openFolio(card.dataset.card);
    });

    // The chapters list: the chapter being read is marked
    els.story.addEventListener('click', e => {
        const a = e.target.closest('[data-chapter]');
        if (!a) return;
        e.preventDefault();
        const target = $(`chapter-${a.dataset.chapter}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        els.story.querySelectorAll('[data-chapter]').forEach(x => x.classList.toggle('is-active', x === a));
    });

    /* ---------------- start ---------------- */

    const params = new URLSearchParams(location.search);
    const linkedSession = store.get(params.get('session'));
    const wanted = linkedSession && store.typeOf(linkedSession) === 'session' ? linkedSession.campaign : null;
    const firstId = campaigns.some(c => c.id === wanted) ? wanted : personae.choose(store, { campaigns, allowAll: false });
    const first = campaigns.find(c => c.id === firstId) || campaigns[0];
    // Keep the campaign shared with the other pages, so the preview cards follow it
    if (store.viewCampaign() !== first.id) personae.remember(first.id);

    personae.picker(els.picker, {
        campaigns, value: first.id, allowAll: false,
        onChange: id => { closeFolio(); loadCampaign(campaigns.find(c => c.id === id)); },
    });
    if (['story', 'journey'].includes(params.get('view'))) setView(params.get('view'));
    loadCampaign(first);

    // ?session=…: its card glows, then its folio opens
    if (linkedSession && sessions.includes(linkedSession)) {
        const entry = $(linkedSession.id);
        if (entry) {
            entry.scrollIntoView({ block: 'center' });
            const card = entry.querySelector('.scr-card');
            card.classList.add('is-flash');
            setTimeout(() => card.classList.remove('is-flash'), 2200);
        }
        setTimeout(() => openFolio(linkedSession.id), 350);
    }
});
