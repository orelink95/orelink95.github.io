document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const timelineContainer = document.getElementById('chronicle-timeline');
    const questList = document.getElementById('quest-list');
    const lootList = document.getElementById('notable-loot-list');
    const searchInput = document.getElementById('scriptorium-search');
    const arcFilter = document.getElementById('filter-arc');
    const storyPreview = document.getElementById('story-so-far-preview');
    const campaignFilter = document.getElementById('filter-campaign');

    // Campaigns (data/campaigns.json) and their sessions (data/sessions.json, newest first)
    const campaigns = store.all('campaign').slice().sort((a, b) => a.name.localeCompare(b.name));
    const sessionsOf = id => store.all('session').filter(s => s.campaign === id);
    const itemName = id => (store.get(id) || {}).name || id;
    // A session's in-world date, written with the world's calendar (data/calendar.json)
    const worldDate = d => (store.calendar && d ? store.calendar.format(d) : '');
    // An item from a session's loot: a link to its card in the Vault when it exists
    const itemLink = (id, cls, inner) => {
        const href = store.get(id) ? store.url(id) : null;
        return href ? `<a href="${href}" onclick="event.stopPropagation()" class="${cls}">${inner}</a>`
                    : `<span class="${cls}">${inner}</span>`;
    };
    let current = null;   // the campaign on screen

    // --- WORKSPACE INITIALIZATION ---
    function initWorkspace() {
        if (campaigns.length === 0) return;

        // 1. Populate the Campaign Dropdown
        if (campaignFilter) {
            campaignFilter.innerHTML = campaigns.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        // 2. Deep links: ?session=… opens its campaign, ?campaign=… picks one
        const urlParams = new URLSearchParams(window.location.search);
        const linkedSession = store.get(urlParams.get('session'));
        const wanted = (linkedSession && linkedSession.campaign) || urlParams.get('campaign');

        // 3. Otherwise the current campaign (data/settings.json), else the first
        current = campaigns.find(c => c.id === wanted) || campaigns.find(c => c.id === store.settings.currentCampaign) || campaigns[0];

        if (campaignFilter) campaignFilter.value = current.id;

        // 4. Load the selected workspace!
        loadCampaignWorkspace();
    }

    // --- WORKSPACE SWAPPER ---
    function loadCampaignWorkspace() {
        if (!current) return;
        const sessions = sessionsOf(current.id);

        // Update the Story Preview
        if (storyPreview) storyPreview.textContent = current.preview || '';

        // Update the Sidebar
        renderQuests(current.quests || []);
        renderGlobalLoot(sessions);

        // Update Arc Filter for this specific campaign
        populateArcFilter(sessions);

        // Render the Timeline
        applyFilters();
    }

    // --- SEARCH & FILTER LOGIC ---
    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const selectedArc = arcFilter.value;
        if (!current) return;

        const filtered = sessionsOf(current.id).filter(s => {
            const matchesArc = selectedArc === "all" || s.arc === selectedArc;
            const matchesSearch = s.name.toLowerCase().includes(query) ||
                (s.summary || '').toLowerCase().includes(query) ||
                (s.keywords || []).some(k => k.toLowerCase().includes(query)) ||
                (s.npcs || []).some(n => n.npc.toLowerCase().includes(query));
                
            return matchesArc && matchesSearch; 
        });

        renderTimeline(filtered);
    }

    // Event Listeners for Filters
    if (campaignFilter) {
        campaignFilter.addEventListener('change', (e) => {
            current = campaigns.find(c => c.id === e.target.value);
            if (arcFilter) arcFilter.value = "all"; // Reset Arc filter on campaign swap
            if (searchInput) searchInput.value = ""; // Reset Search
            loadCampaignWorkspace();
        });
    }
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (arcFilter) arcFilter.addEventListener('change', applyFilters);


    function findNPC(id) {
        const npc = store.get(id);
        if (!npc || store.typeOf(npc) !== 'npc') return null;
        return { ...npc, image: npc.portrait, avatar: npc.avatar || npc.portrait };
    }

    // Keywords: names of NPCs, places, factions and creatures become links; glossary
    // terms (data/lore.json) become spans that search the chronicle. Hovering any of
    // them opens its preview card (scripts/core/preview.js).
    function keywordAttrs(rec) {
        if (store.typeOf(rec) === 'lore') return `onclick="event.stopPropagation(); triggerSearch('${rec.id}')"`;
        return `onclick="event.stopPropagation()"`;
    }
    const handoutsData = store.all('handout').filter(h => !h.draft);

    // Handout names become links to the handout's file (their preview card says
    // what it is). One pass, longest names first, never inside another link or a
    // {kept plain} name.
    const handoutByName = new Map(handoutsData.map(h => [h.name.toLowerCase(), h]));
    const handoutRe = handoutsData.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${[...handoutsData]
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
                const handout = handoutByName.get(match.toLowerCase());
                if (!handout) return match;
                return `<a href="${handout.file || '#'}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="keyword-link kw-object" data-kw="${handout.id}">${match}</a>`;
            });
        }).join('');
    }

    function autoLinkContent(text, { markdown = false } = {}) {
        if (!text) return "";
        const html = markdown ? store.md(text) : text;
        // Handouts first, so a handout named like an item or a place is the link;
        // the store's names (NPCs, places, factions, creatures, items, glossary
        // terms) never go inside it
        return store.autolink(linkHandouts(html), { className: 'keyword-link', attrs: keywordAttrs, terms: true });
    }

    function sessionPlaces(session) {
        return [
            ...(session.places || []).map(id => store.get(id)).filter(Boolean).map(p => ({ title: p.name, url: store.url(p) })),
            ...(session.otherPlaces || []).map(title => ({ title, url: null })),
        ];
    }

    // --- TIMELINE RENDERING ---
    function renderTimeline(sessions) {
        if (sessions.length === 0) {
            timelineContainer.innerHTML = `<p class="timeline__empty">No records match your search criteria.</p>`;
            return;
        }

        let currentArc = "";
        let html = `<div class="timeline__line"></div>`;

        sessions.forEach((session, index) => {
            if (session.arc !== currentArc) {
                currentArc = session.arc;
                html += `
                    <div class="timeline-arc">
                        <h4 class="timeline-arc__title">${currentArc}</h4>
                    </div>
                `;
            }

            const npcTags = (session.npcs || []).map(entry => {
                const data = findNPC(entry.npc);
                if (!data) return '';
                
                const avatarImg = data.avatar || 'https://ui-avatars.com/api/?background=1a1c1a&color=4ade80&name=' + data.name;

                return `
                <div class="npc-avatar">
                    <a href="${store.url(entry.npc)}" onclick="event.stopPropagation()" class="npc-avatar__link">
                        <img src="${avatarImg}" alt="${data.name}" class="npc-avatar__img">
                        <div class="npc-avatar__tip">
                            ${data.name}
                        </div>
                    </a>
                </div>`;
            }).join('');

            const locTags = sessionPlaces(session).map(({ title, url }) => {
                return url ? `<a href="${url}" onclick="event.stopPropagation()" class="place-tag"><span class="tag-icon material-symbols-outlined">location_on</span> ${title}</a>`
                    : `<span onclick="event.stopPropagation(); triggerSearch(this.dataset.term)" data-term="${title.replace(/"/g, '&quot;')}" class="place-tag place-tag--search"><span class="tag-icon material-symbols-outlined">location_on</span> ${title}</span>`;
            }).join('');

            const lootTags = (session.loot || []).map(id =>
                itemLink(id, 'loot-tag', `<span class="tag-icon material-symbols-outlined">auto_awesome</span> ${itemName(id)}`)
            ).join('');

            const isLatest = index === 0 && searchInput.value === "" && arcFilter.value === "all";
            const latestClass = isLatest ? 'is-latest' : '';   // the newest session is lit in gold

            html += `
                <div id="${session.id}" class="timeline-entry">
                    <div class="timeline-entry__dot ${latestClass}"></div>
                    
                    <div onclick="openSessionFolio('${session.id}')" class="timeline-entry__card ${latestClass}">
                        <div class="timeline-entry__head">
                            <div>
                                <div class="timeline-entry__campaign">
                                    <span class="timeline-entry__campaign-icon material-symbols-outlined">explore</span> ${current.name}
                                </div>

                                <p class="timeline-entry__date">${worldDate(session.date) || "Unknown Date"}</p>
                                <h3 class="timeline-entry__title">${session.name}</h3>
                            </div>
                           <div class="timeline-entry__npcs">${npcTags}</div>
                        </div> <p class="timeline-entry__summary">${autoLinkContent(session.summary)}</p>
                        
                        <div class="timeline-entry__foot">
                            <div class="timeline-entry__tags">${locTags} ${lootTags}</div>
                            <span class="timeline-entry__read">Read Folio <span class="timeline-entry__read-icon material-symbols-outlined">arrow_forward</span></span>
                        </div>
                    </div>
                </div>
            `;
        });
        timelineContainer.innerHTML = html;
    }

    // --- SIDEBAR RENDERING ---
    function renderQuests(quests) {
        if (!questList) return;
        questList.innerHTML = quests.map(q => `
            <div class="quest">
                <div class="quest__head">
                    <span class="quest__dot ${q.status === 'Primary' ? 'quest__dot--primary' : ''}"></span>
                    <h4 class="quest__title">${q.title}</h4>
                </div>
                <p class="quest__text">${q.description}</p>
            </div>
        `).join('');
    }

    function renderGlobalLoot(sessions) {
        if (!lootList) return;
        const allLoot = [...new Set(sessions.flatMap(s => s.loot || []))];
        lootList.innerHTML = allLoot.map(id => itemLink(id, 'acquisition', itemName(id))).join('');
    }

    function populateArcFilter(sessions) {
        if (!arcFilter) return;
        const arcs = [...new Set(sessions.map(s => s.arc))];
        arcFilter.innerHTML = `<option value="all">All Campaign Arcs</option>` +
            arcs.map(arc => `<option value="${arc}">${arc}</option>`).join('');
    }

    // --- GLOSSARY TERMS: a click searches the chronicle ---
    window.triggerSearch = (term) => {
        const rec = store.get(term);
        if (rec) term = rec.name;   // called with a glossary id
        if (searchInput) {
            searchInput.value = term;
            document.getElementById('session-modal').classList.add('hidden');
            document.getElementById('story-modal').classList.add('hidden');
            if (Athenaeum.preview) Athenaeum.preview.close();
            searchInput.dispatchEvent(new Event('input'));
        }
    };
    // The same search from a term's preview card (the button of the sheet on phones)
    Athenaeum.loreAction = { label: 'Search the Chronicle', run: id => window.triggerSearch(id) };

    // --- MODAL LOGIC ---
    window.openStoryFolio = () => {
        if (!current) return;

        const modal = document.getElementById('story-modal');
        modal.innerHTML = `
            <div class="story-folio">
                <div class="story-folio__head">
                    <div><p class="story-folio__eyebrow">Archival Summary</p><h2 class="story-folio__title">The Story So Far</h2></div>
                    <button onclick="closeStoryModal()" class="story-folio__close"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="story-folio__text story-text custom-scrollbar">
                    ${autoLinkContent(store.md(current.story, { dropCap: true }))}
                </div>
            </div>
        `;
        modal.classList.remove('hidden');
    };

    window.openSessionFolio = (id) => {
        const session = store.get(id);
        if (!session || store.typeOf(session) !== 'session') return;

        const modal = document.getElementById('session-modal');
        const content = document.getElementById('session-modal-content');

        const getSentiment = (s) => {
            if (s === 'like') return '<span class="sentiment sentiment--like material-symbols-outlined" title="Positive Interaction">sentiment_satisfied</span>';
            if (s === 'dislike') return '<span class="sentiment sentiment--dislike material-symbols-outlined" title="Hostile/Negative">sentiment_dissatisfied</span>';
            return '<span class="sentiment sentiment--neutral material-symbols-outlined" title="Neutral/Business">sentiment_neutral</span>';
        };

        const npcCards = (session.npcs || []).map(entry => {
            const npc = findNPC(entry.npc);
            if (!npc) return '';
            return `
            <div class="encounter">
                <a href="${store.url(entry.npc)}" class="encounter__name kw-person">${npc.name}</a>
                ${getSentiment(entry.sentiment)}
            </div>`;
        }).join('');

        content.innerHTML = `
        <div class="folio">
            <header class="folio__head">
                <div class="folio__date-row">
                    <div class="folio__rule"></div>
                    <p class="folio__date">${worldDate(session.date) || 'Unknown date'} — ${session.region || ''}</p>
                    <div class="folio__rule"></div>
                </div>
                <h1 class="folio__title">${session.name}</h1>
                <p class="folio__arc">${session.arc || ''}</p>
            </header>

            <div class="folio__grid">
                <div class="folio-summary">
                    <h3 class="folio-summary__title">
                        <span class="folio-icon material-symbols-outlined">summarize</span> Summary
                    </h3>
                    <p class="folio-summary__text">${autoLinkContent(session.summary)}</p>
                </div>

                <div class="folio-panel">
                    <h3 class="folio-places__title">
                        <span class="folio-icon material-symbols-outlined">location_on</span> Locations Visited
                    </h3>
                    <div class="folio-places__list">${sessionPlaces(session).map(({ title, url }) => url
                ? `<a href="${url}" class="folio-place kw-place">${title}</a>`
                : `<span class="folio-place folio-place--search kw-place" onclick="triggerSearch(this.dataset.term)" data-term="${title.replace(/"/g, '&quot;')}">${title}</span>`
        ).join(', ')}</div>
                </div>

                <div class="folio-panel">
                    <h3 class="folio-encounters__title">
                        <span class="folio-icon material-symbols-outlined">group</span> Notable Encounters
                    </h3>
                    <div class="folio-encounters__list">${npcCards}</div>
                </div>

                <div class="folio-accomplished">
                    <h3 class="folio-accomplished__title">
                        <span class="folio-icon material-symbols-outlined">verified</span> Things Accomplished
                    </h3>
                    <ul class="folio-accomplished__list">
                        ${(session.accomplished || []).map(item => `<li class="folio-accomplished__item"><span class="folio-accomplished__arrow">→</span> <span>${autoLinkContent(item)}</span></li>`).join('')}
                    </ul>
                </div>

                <div class="folio-vault">
                    <h3 class="folio-vault__title">
                        <span class="folio-icon material-symbols-outlined">inventory_2</span> The Vault
                    </h3>
                    <div class="folio-list">
                        ${(session.loot || []).map(id => itemLink(id, 'folio-vault__item', `<span class="folio-vault__icon material-symbols-outlined">auto_awesome</span> ${itemName(id)}`)).join('')}
                    </div>
                </div>

                <div class="folio-leads">
                    <h3 class="folio-leads__title">Leads Pursued</h3>
                    <ul class="folio-list">
                        ${(session.leadsPursued || []).map(item => `<li class="folio-leads__item">${autoLinkContent(item)}</li>`).join('')}
                    </ul>
                </div>

                <div class="folio-future">
                    <h3 class="folio-future__title">Future Leads</h3>
                    <ul class="folio-list">
                        ${(session.futureLeads || []).map(item => `<li class="folio-future__item">${autoLinkContent(item)}</li>`).join('')}
                    </ul>
                </div>
<div class="folio-transcript">
                    <h3 class="folio-transcript__title">
                        <span class="folio-icon material-symbols-outlined">history_edu</span> Archival Transcript
                    </h3>
                    <div class="folio-transcript__text session-text">
                        ${autoLinkContent(session.body, { markdown: true })}
                    </div>
                </div>
            </div>
        </div>
    `;
        modal.classList.remove('hidden');
    };

    window.closeStoryModal = () => document.getElementById('story-modal').classList.add('hidden');
    window.closeSessionModal = () => document.getElementById('session-modal').classList.add('hidden');

    const openStoryBtn = document.getElementById('open-story-btn');
    if (openStoryBtn) openStoryBtn.onclick = window.openStoryFolio;

    const storyModalElement = document.getElementById('story-modal');
    const sessionModalElement = document.getElementById('session-modal');

    if (storyModalElement) {
        storyModalElement.addEventListener('click', (e) => {
            if (e.target === storyModalElement) window.closeStoryModal();
        });
    }

    if (sessionModalElement) {
        sessionModalElement.addEventListener('click', (e) => {
            if (e.target === sessionModalElement) window.closeSessionModal();
        });
    }

    // Call Initialization!
    initWorkspace();

    // After workspace loads, check for deep link scrolling
    const urlParams = new URLSearchParams(window.location.search);
    const targetSessionId = urlParams.get('session');
    
    if (targetSessionId) {
        setTimeout(() => {
            const sessionElement = document.getElementById(targetSessionId);
            if (sessionElement) {
                sessionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const card = sessionElement.querySelector('.cursor-pointer');
                if (card) {
                    const originalShadow = card.style.boxShadow;
                    card.style.transition = "box-shadow 0.5s ease";
                    card.style.boxShadow = "0 0 30px rgba(233, 193, 118, 0.6)";
                    setTimeout(() => { card.style.boxShadow = originalShadow; }, 2000);
                }
                if (typeof window.openSessionFolio === 'function') {
                    setTimeout(() => { window.openSessionFolio(targetSessionId); }, 400);
                }
            }
        }, 400);
    }
});