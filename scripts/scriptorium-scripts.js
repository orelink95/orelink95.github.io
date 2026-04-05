document.addEventListener("DOMContentLoaded", () => {
    const timelineContainer = document.getElementById('chronicle-timeline');
    const questList = document.getElementById('quest-list');
    const lootList = document.getElementById('notable-loot-list');
    const searchInput = document.getElementById('scriptorium-search');
    const arcFilter = document.getElementById('filter-arc');
    const storyPreview = document.getElementById('story-so-far-preview');

    if (typeof scriptoriumData !== 'undefined') {
        storyPreview.textContent = scriptoriumData.storySoFar.preview;
        renderQuests(scriptoriumData.activeQuests);
        populateArcFilter(scriptoriumData.sessions);
        renderTimeline(scriptoriumData.sessions);
        renderGlobalLoot(scriptoriumData.sessions);
    }

    function findNPC(id) {
        for (const sett of Object.values(settlementRegistry)) {
            for (const dist of sett.districts || []) {
                const found = (dist.npcs || []).find(n => n.id === id);
                if (found) return { ...found, settlement: sett.settlementName };
            }
        }
        return null;
    }

    // UPDATED: Now checks Settlements, Districts, Pins AND their Aliases!
    function findLocation(title) {
        const lowerTitle = title.toLowerCase();

        for (const [settId, sett] of Object.entries(settlementRegistry)) {
            const settMatch = sett.settlementName.toLowerCase() === lowerTitle || (sett.aliases || []).some(a => a.toLowerCase() === lowerTitle);
            if (settMatch) return { title: sett.settlementName, url: `settlement.html?id=${settId}` };

            for (const dist of sett.districts || []) {
                const distMatch = dist.name.toLowerCase() === lowerTitle || (dist.aliases || []).some(a => a.toLowerCase() === lowerTitle);
                if (distMatch) return { title: dist.name, url: `settlement.html?id=${settId}` };

                const found = (dist.pins || []).find(p => p.title.toLowerCase() === lowerTitle || (p.aliases || []).some(a => a.toLowerCase() === lowerTitle));
                if (found) {
                    const uid = found.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    return { ...found, url: `pois.html?id=${uid}` };
                }
            }
        }
        return null;
    }

    // --- ADVANCED CONTENT PARSER ---
    function findLocation(title) {
        const lowerTitle = title.toLowerCase();

        // 1. Check Country Registry
        if (typeof countryRegistry !== 'undefined') {
            for (const [countryId, country] of Object.entries(countryRegistry)) {
                const countryMatch = (country.regionName && country.regionName.toLowerCase() === lowerTitle) ||
                    (country.aliases || []).some(a => a.toLowerCase() === lowerTitle);
                if (countryMatch) return { title: country.regionName, url: `country.html?id=${countryId}` };
            }
        }

        // 2. Check Settlement Registry
        for (const [settId, sett] of Object.entries(settlementRegistry)) {
            const settMatch = sett.settlementName.toLowerCase() === lowerTitle || (sett.aliases || []).some(a => a.toLowerCase() === lowerTitle);
            if (settMatch) return { title: sett.settlementName, url: `settlement.html?id=${settId}` };

            for (const dist of sett.districts || []) {
                const distMatch = dist.name.toLowerCase() === lowerTitle || (dist.aliases || []).some(a => a.toLowerCase() === lowerTitle);
                if (distMatch) return { title: dist.name, url: `settlement.html?id=${settId}` };

                const found = (dist.pins || []).find(p => p.title.toLowerCase() === lowerTitle || (p.aliases || []).some(a => a.toLowerCase() === lowerTitle));
                if (found) {
                    const uid = found.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    return { ...found, url: `pois.html?id=${uid}` };
                }
            }
        }
        return null;
    }

    // --- ADVANCED CONTENT PARSER ---
    function autoLinkContent(text) {
        if (!text) return "";
        let linkedText = text;

        // 1. Link NPCs (Green)
        Object.keys(npcAlmanach).forEach(id => {
            const npcData = findNPC(id);
            if (npcData) {
                const regex = new RegExp(`\\b${npcData.name}\\b(?![^<]*>)`, 'gi');
                linkedText = linkedText.replace(regex, (match) => `<a href="npc.html?id=${id}" onclick="event.stopPropagation()" class="kw-person relative z-10">${match}</a>`);
            }
        });

        // 2. Link Locations (Blue) - Includes Countries, Settlements, Districts, Pins, and Aliases
        let locTargets = [];

        // Add Countries to Targets
        if (typeof countryRegistry !== 'undefined') {
            Object.entries(countryRegistry).forEach(([countryId, country]) => {
                if (country.regionName) locTargets.push({ name: country.regionName, url: `country.html?id=${countryId}` });
                (country.aliases || []).forEach(alias => locTargets.push({ name: alias, url: `country.html?id=${countryId}` }));
            });
        }

        // Add Settlements to Targets
        Object.entries(settlementRegistry).forEach(([settId, sett]) => {
            if (sett.settlementName) locTargets.push({ name: sett.settlementName, url: `settlement.html?id=${settId}` });
            (sett.aliases || []).forEach(alias => locTargets.push({ name: alias, url: `settlement.html?id=${settId}` }));

            (sett.districts || []).forEach(dist => {
                if (dist.name) locTargets.push({ name: dist.name, url: `settlement.html?id=${settId}` });
                (dist.aliases || []).forEach(alias => locTargets.push({ name: alias, url: `settlement.html?id=${settId}` }));

                (dist.pins || []).forEach(pin => {
                    const uid = pin.title.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    if (pin.title) locTargets.push({ name: pin.title, url: `pois.html?id=${uid}` });
                    (pin.aliases || []).forEach(alias => locTargets.push({ name: alias, url: `pois.html?id=${uid}` }));
                });
            });
        });

        // Sort by length descending to prevent partial overlaps (e.g., "Kingdom of Eperina" vs "Eperina")
        locTargets.sort((a, b) => b.name.length - a.name.length);

        locTargets.forEach(target => {
            // Negative lookahead (?![^<]*>) ensures we don't accidentally replace a word already inside an HTML tag
            const regex = new RegExp(`\\b${target.name}\\b(?![^<]*>)`, 'gi');
            linkedText = linkedText.replace(regex, (match) => `<a href="${target.url}" onclick="event.stopPropagation()" class="kw-place relative z-10">${match}</a>`);
        });

        // 3. Link Lexicon Keywords (Dynamic Color)
        Object.keys(keywordLexicon).forEach(term => {
            const regex = new RegExp(`\\b${term}\\b(?![^<]*>)`, 'gi');
            const entry = keywordLexicon[term];
            const definition = (typeof entry === 'string' ? entry : entry.definition).replace(/'/g, "\\'");
            const type = (typeof entry === 'string' ? 'lore' : entry.type) || 'lore';
            const typeClass = `kw-${type}`;

            linkedText = linkedText.replace(regex, (match) => `
                <span class="${typeClass} relative z-10" onmouseenter="showTooltip(event, '${term}', '${definition}', '${type}')" onclick="event.stopPropagation(); triggerSearch('${term}')">${match}</span>`);
        });

        return linkedText;
    };

    // --- TIMELINE RENDERING ---
    function renderTimeline(sessions) {
        if (sessions.length === 0) {
            timelineContainer.innerHTML = `<p class="py-20 text-center italic text-white/20">No records match your search criteria.</p>`;
            return;
        }

        let currentArc = "";
        let html = `<div class="absolute top-0 bottom-0 left-[23px] md:left-[31px] w-px bg-white/5"></div>`;

        sessions.forEach((session, index) => {
            if (session.arc !== currentArc) {
                currentArc = session.arc;
                html += `
                    <div class="relative pl-12 md:pl-20 mb-8 mt-12 first:mt-0">
                        <h4 class="text-[10px] font-label uppercase tracking-[0.4em] text-[#e9c176]/40 border-b border-white/5 pb-2 inline-block">${currentArc}</h4>
                    </div>
                `;
            }

            // NPC Tags (Green: #4ade80)
            const npcTags = (session.npcsMet || []).map(entry => {
                const data = findNPC(entry.id);
                return data ? `<a href="npc.html?id=${entry.id}" onclick="event.stopPropagation()" class="flex items-center gap-1.5 px-2 py-1 rounded bg-[#4ade80]/10 border border-[#4ade80]/20 text-[#4ade80] text-[9px] uppercase tracking-widest hover:bg-[#4ade80]/20 transition-colors relative z-10"><span class="material-symbols-outlined text-[12px]">person</span> ${data.name}</a>` : '';
            }).join('');

            // Location Tags (Blue: #60a5fa)
            const locTags = (session.locationsVisited || []).map(title => {
                const data = findLocation(title);
                return data ? `<a href="${data.url}" onclick="event.stopPropagation()" class="flex items-center gap-1.5 px-2 py-1 rounded bg-[#60a5fa]/10 border border-[#60a5fa]/20 text-[#60a5fa] text-[9px] uppercase tracking-widest hover:bg-[#60a5fa]/20 transition-colors relative z-10"><span class="material-symbols-outlined text-[12px]">location_on</span> ${title}</a>`
                    : `<span onclick="event.stopPropagation(); triggerSearch('${title}')" class="flex items-center gap-1.5 px-2 py-1 rounded bg-[#60a5fa]/10 border border-[#60a5fa]/20 text-[#60a5fa] text-[9px] uppercase tracking-widest cursor-pointer hover:bg-[#60a5fa]/20 transition-colors relative z-10"><span class="material-symbols-outlined text-[12px]">location_on</span> ${title}</span>`;
            }).join('');

            // Loot Tags (Purple: #c084fc)
            const lootTags = (session.lootObtained || []).map(item => `
                <span class="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#c084fc]/80"><span class="material-symbols-outlined text-[12px]">auto_awesome</span> ${item}</span>
            `).join('');

            const isLatest = index === 0 && searchInput.value === "" && arcFilter.value === "all";

            html += `
                <div class="relative pl-10 md:pl-16 mb-12 group animate-fade-in">
                    <div class="absolute left-[11.5px] md:left-[19.5px] top-6 w-2.5 h-2.5 rounded-full ${isLatest ? 'bg-[#e9c176] shadow-[0_0_15px_rgba(233,193,118,0.6)]' : 'bg-white/10 group-hover:bg-white/30'} z-10 transition-all"></div>
                    
                    <div onclick="openSessionFolio('${session.id}')" class="bg-[#121412] ${isLatest ? 'border-l-2 border-[#e9c176]/40' : 'border-l-2 border-transparent'} rounded-r-lg p-6 md:p-8 hover:bg-[#161816] transition-all border-t border-r border-b border-white/5 cursor-pointer shadow-lg hover:shadow-2xl">
                        <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                            <div>
                                <p class="font-label text-[9px] uppercase tracking-[0.2em] text-white/40 mb-1">${session.dateSpan || "Unknown Date"}</p>
                                <h3 class="text-2xl font-headline font-bold text-white group-hover:text-[#e9c176] transition-colors">${session.title}</h3>
                            </div>
                            <div class="flex flex-wrap gap-2">${npcTags}</div>
                        </div>

                        <p class="font-body text-sm text-[#8a8a8a] leading-relaxed mb-6 line-clamp-2">${autoLinkContent(session.summary)}</p>
                        
                        <div class="flex flex-wrap items-center justify-between gap-6 pt-6 border-t border-white/5">
                            <div class="flex flex-wrap gap-4">${locTags} ${lootTags}</div>
                            <span class="text-[9px] font-label uppercase tracking-widest text-white/20 group-hover:text-white transition-colors flex items-center gap-2">Read Folio <span class="material-symbols-outlined text-sm transition-transform group-hover:translate-x-1">arrow_forward</span></span>
                        </div>
                    </div>
                </div>
            `;
        });
        timelineContainer.innerHTML = html;
    }

    // --- SIDEBAR RENDERING ---
    function renderQuests(quests) {
        questList.innerHTML = quests.map(q => `
            <div class="group/quest">
                <div class="flex items-center gap-2 mb-1">
                    <span class="w-1 h-1 rounded-full ${q.status === 'Primary' ? 'bg-[#e9c176]' : 'bg-white/20'}"></span>
                    <h4 class="text-xs font-headline font-bold text-white group-hover/quest:text-[#e9c176] transition-colors">${q.title}</h4>
                </div>
                <p class="text-[10px] text-white/40 leading-relaxed pl-3">${q.description}</p>
            </div>
        `).join('');
    }

    function renderGlobalLoot(sessions) {
        const allLoot = [...new Set(sessions.flatMap(s => s.lootObtained || []))];
        lootList.innerHTML = allLoot.map(item => `
            <span class="px-2 py-1 rounded bg-white/5 border border-white/10 text-[8px] uppercase tracking-widest text-white/40 hover:text-[#c084fc] hover:border-[#c084fc]/30 transition-all cursor-help" title="Acquired in Archive">${item}</span>
        `).join('');
    }

    function populateArcFilter(sessions) {
        const arcs = [...new Set(sessions.map(s => s.arc))];
        arcFilter.innerHTML = `<option value="all">All Campaign Arcs</option>` +
            arcs.map(arc => `<option value="${arc}">${arc}</option>`).join('');
    }

    // --- SEARCH / FILTER LOGIC ---
    const applyFilters = () => {
        const query = searchInput.value.toLowerCase();
        const selectedArc = arcFilter.value;

        const filtered = scriptoriumData.sessions.filter(s => {
            const matchesArc = selectedArc === "all" || s.arc === selectedArc;
            const matchesSearch = s.title.toLowerCase().includes(query) ||
                s.summary.toLowerCase().includes(query) ||
                (s.keywords || []).some(k => k.toLowerCase().includes(query)) ||
                (s.npcsMet || []).some(n => n.id.toLowerCase().includes(query));
            return matchesArc && matchesSearch;
        });
        renderTimeline(filtered);
    };

    searchInput.addEventListener('input', applyFilters);
    arcFilter.addEventListener('change', applyFilters);

    // --- ADVANCED TOOLTIP LOGIC ---
    window.closeTooltip = () => {
        const tt = document.getElementById('keyword-tooltip');
        if (tt) tt.style.display = 'none';
    };

    window.triggerSearch = (term) => {
        const searchInput = document.getElementById('scriptorium-search');
        if (searchInput) {
            searchInput.value = term;
            document.getElementById('session-modal').classList.replace('flex', 'hidden');
            window.closeTooltip();
            searchInput.dispatchEvent(new Event('input'));
        }
    };

    window.showTooltip = (e, term, definition, type) => {
        const tt = document.getElementById('keyword-tooltip');
        const title = document.getElementById('tooltip-title');

        const typeColors = {
            person: '#4ade80',  // Green
            place: '#60a5fa',   // Blue
            monster: '#f87171', // Red
            faction: '#fb923c', // Orange
            lore: '#e9c176',    // Gold
            object: '#c084fc'   // Purple
        };

        const activeColor = typeColors[type] || typeColors.lore;

        title.textContent = term;
        title.style.color = activeColor;
        tt.style.borderColor = activeColor;
        document.getElementById('tooltip-body').textContent = definition;

        tt.style.left = `${e.clientX + 15}px`;
        tt.style.top = `${e.clientY - 20}px`;
        tt.style.display = 'block';
    };

    // --- MODAL LOGIC ---
    window.openStoryFolio = () => {
        const modal = document.getElementById('story-modal');
        if (!modal.innerHTML.trim()) {
            modal.innerHTML = `
                <div class="max-w-4xl w-full bg-[#121412] rounded-xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
                    <div class="p-6 md:p-8 border-b border-white/5 flex justify-between items-center shrink-0">
                        <div><p class="font-label text-[#e9c176] text-[10px] uppercase tracking-[0.3em] mb-1">Archival Summary</p><h2 class="text-2xl font-headline font-bold text-white">The Story So Far</h2></div>
                        <button onclick="closeStoryModal()" class="text-[#a0a0a0] hover:text-white p-2 rounded-full hover:bg-white/5"><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <div class="p-6 md:p-12 overflow-y-auto custom-scrollbar font-body text-base text-[#b0b0b0] leading-relaxed space-y-6">${scriptoriumData.storySoFar.full}</div>
                </div>
            `;
        }
        modal.classList.replace('hidden', 'flex');
    };

    window.openSessionFolio = (id) => {
        const session = scriptoriumData.sessions.find(s => s.id === id);
        if (!session) return;

        const modal = document.getElementById('session-modal');
        const content = document.getElementById('session-modal-content');

        const getSentiment = (s) => {
            if (s === 'like') return '<span class="material-symbols-outlined text-[#4ade80] text-sm" title="Positive Interaction">sentiment_satisfied</span>';
            if (s === 'dislike') return '<span class="material-symbols-outlined text-error text-sm" title="Hostile/Negative">sentiment_dissatisfied</span>';
            return '<span class="material-symbols-outlined text-[#60a5fa] text-sm" title="Neutral/Business">sentiment_neutral</span>';
        };

        const npcCards = (session.npcsMet || []).map(entry => {
            const data = findNPC(entry.id);
            if (!data) return '';
            return `
            <div class="flex items-center justify-between p-2 rounded bg-white/5 border border-white/10">
                <a href="npc.html?id=${entry.id}" class="kw-person text-xs">${data.name}</a>
                ${getSentiment(entry.sentiment)}
            </div>`;
        }).join('');

        content.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-8 pb-20">
            <header class="text-center mb-12">
                <div class="flex justify-center items-center gap-4 mb-4">
                    <div class="h-px w-12 bg-secondary/30"></div>
                    <p class="font-label text-secondary text-[10px] uppercase tracking-[0.4em]">${session.dateSpan} — ${session.region}</p>
                    <div class="h-px w-12 bg-secondary/30"></div>
                </div>
                <h1 class="text-5xl md:text-7xl font-headline font-bold text-white mb-4">${session.title}</h1>
                <p class="font-label text-[10px] uppercase tracking-[0.2em] text-white/20">${session.arc}</p>
            </header>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div class="md:col-span-12 p-8 rounded-xl bg-white/[0.02] border border-white/10 relative overflow-hidden">
                    <h3 class="font-label text-[10px] uppercase text-secondary tracking-widest mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">summarize</span> Summary
                    </h3>
                    <p class="font-body text-xl text-white/90 leading-relaxed italic">${autoLinkContent(session.summary)}</p>
                </div>

                <div class="md:col-span-6 p-6 rounded-xl bg-white/[0.02] border border-white/5">
                    <h3 class="font-label text-[10px] uppercase text-[#60a5fa] tracking-widest mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">location_on</span> Locations Visited
                    </h3>
                    <div class="flex flex-wrap gap-2">${session.locationsVisited.map(loc => {
            const data = findLocation(loc);
            return data
                ? `<a href="${data.url}" class="kw-place text-sm">${loc}</a>`
                : `<span class="kw-place text-sm cursor-pointer" onclick="triggerSearch('${loc}')">${loc}</span>`;
        }).join(', ')}</div>
                </div>

                <div class="md:col-span-6 p-6 rounded-xl bg-white/[0.02] border border-white/5">
                    <h3 class="font-label text-[10px] uppercase text-[#4ade80] tracking-widest mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">group</span> Notable Encounters
                    </h3>
                    <div class="grid grid-cols-2 gap-2">${npcCards}</div>
                </div>

                <div class="md:col-span-8 p-6 rounded-xl bg-white/[0.02] border border-white/5">
                    <h3 class="font-label text-[10px] uppercase text-white/40 tracking-widest mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">verified</span> Things Accomplished
                    </h3>
                    <ul class="space-y-3">
                        ${session.accomplished.map(item => `<li class="text-sm text-white/70 flex gap-3"><span class="text-secondary">→</span> <span>${autoLinkContent(item)}</span></li>`).join('')}
                    </ul>
                </div>

                <div class="md:col-span-4 p-6 rounded-xl bg-[#c084fc]/5 border border-[#c084fc]/20 shadow-inner">
                    <h3 class="font-label text-[10px] uppercase text-[#c084fc] tracking-widest mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">inventory_2</span> The Vault
                    </h3>
                    <div class="space-y-2">
                        ${session.lootObtained.map(item => `<div class="text-xs font-bold text-white flex items-center gap-2"><span class="material-symbols-outlined text-xs text-[#c084fc]">auto_awesome</span> ${item}</div>`).join('')}
                    </div>
                </div>

                <div class="md:col-span-6 p-6 rounded-xl bg-white/[0.02] border border-white/5 border-l-secondary/40 border-l-2">
                    <h3 class="font-label text-[10px] uppercase text-secondary tracking-widest mb-4">Leads Pursued</h3>
                    <ul class="space-y-2">
                        ${session.leadsPursued.map(item => `<li class="text-xs text-white/60 italic">${autoLinkContent(item)}</li>`).join('')}
                    </ul>
                </div>

                <div class="md:col-span-6 p-6 rounded-xl bg-white/[0.02] border border-white/5 border-l-error/40 border-l-2">
                    <h3 class="font-label text-[10px] uppercase text-error tracking-widest mb-4">Future Leads</h3>
                    <ul class="space-y-2">
                        ${session.futureLeads.map(item => `<li class="text-xs text-white/60">${autoLinkContent(item)}</li>`).join('')}
                    </ul>
                </div>
<div class="md:col-span-12 p-8 rounded-xl bg-[#0a0b0a] border border-white/5 mt-4 shadow-inner">
                    <h3 class="font-label text-[10px] uppercase text-[#e9c176] tracking-widest mb-8 flex items-center gap-2 border-b border-white/5 pb-4">
                        <span class="material-symbols-outlined text-sm">history_edu</span> Archival Transcript
                    </h3>
                    <div class="prose prose-invert prose-gold max-w-none font-body text-base md:text-lg leading-relaxed text-white/80 space-y-6">
                        ${autoLinkContent(session.body)}
                    </div>
                </div>
            </div>
        </div>
    `;
        modal.classList.replace('hidden', 'flex');
    };

    window.closeStoryModal = () => document.getElementById('story-modal').classList.replace('flex', 'hidden');
    window.closeSessionModal = () => document.getElementById('session-modal').classList.replace('flex', 'hidden');

    document.getElementById('open-story-btn').onclick = window.openStoryFolio;

    // --- CLICK OUTSIDE TO CLOSE MODALS ---
    const storyModalElement = document.getElementById('story-modal');
    const sessionModalElement = document.getElementById('session-modal');

    // Close Story Modal on background click
    storyModalElement.addEventListener('click', (e) => {
        // If the click target is the background itself (not the inner content)
        if (e.target === storyModalElement) {
            window.closeStoryModal();
        }
    });

    // Close Session Modal on background click
    sessionModalElement.addEventListener('click', (e) => {
        // If the click target is the background itself (not the inner content)
        if (e.target === sessionModalElement) {
            window.closeSessionModal();
        }
    });
});