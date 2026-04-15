document.addEventListener("DOMContentLoaded", () => {
    const timelineContainer = document.getElementById('chronicle-timeline');
    const questList = document.getElementById('quest-list');
    const lootList = document.getElementById('notable-loot-list');
    const searchInput = document.getElementById('scriptorium-search');
    const arcFilter = document.getElementById('filter-arc');
    const storyPreview = document.getElementById('story-so-far-preview');
    const campaignFilter = document.getElementById('filter-campaign');

    let currentCampaignName = "";
    window.campaignData = window.campaignData || {};

    // --- WORKSPACE INITIALIZATION ---
    function initWorkspace() {
        const campaigns = Object.keys(window.campaignData).sort();
        if (campaigns.length === 0) return;

        // 1. Populate the Campaign Dropdown
        if (campaignFilter) {
            campaignFilter.innerHTML = campaigns.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // 2. Check URL for Deep Linking (Auto-switches to the right campaign!)
        const urlParams = new URLSearchParams(window.location.search);
        const targetSessionId = urlParams.get('session');

        if (targetSessionId) {
            for (const [name, data] of Object.entries(window.campaignData)) {
                if ((data.sessions || []).some(s => s.id === targetSessionId)) {
                    currentCampaignName = name;
                    break;
                }
            }
        }

        // 3. Fallback to default campaign if no link was provided
        if (!currentCampaignName) {
            currentCampaignName = campaigns.includes("Echoes from the Void") ? "Echoes from the Void" : campaigns[0];
        }

        if (campaignFilter) campaignFilter.value = currentCampaignName;

        // 4. Load the selected workspace!
        loadCampaignWorkspace();
    }

    // --- WORKSPACE SWAPPER ---
    function loadCampaignWorkspace() {
        const data = window.campaignData[currentCampaignName];
        if (!data) return;

        // Update the Story Preview
        if (storyPreview) storyPreview.textContent = data.storySoFar.preview;

        // Update the Sidebar
        renderQuests(data.activeQuests || []);
        renderGlobalLoot(data.sessions || []);

        // Update Arc Filter for this specific campaign
        populateArcFilter(data.sessions || []);

        // Render the Timeline
        applyFilters();
    }

    // --- SEARCH & FILTER LOGIC ---
    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const selectedArc = arcFilter.value;
        const data = window.campaignData[currentCampaignName];

        if (!data) return;

        const filtered = (data.sessions || []).filter(s => {
            const matchesArc = selectedArc === "all" || s.arc === selectedArc;
            const matchesSearch = s.title.toLowerCase().includes(query) ||
                s.summary.toLowerCase().includes(query) ||
                (s.keywords || []).some(k => k.toLowerCase().includes(query)) ||
                (s.npcsMet || []).some(n => n.id.toLowerCase().includes(query));
                
            return matchesArc && matchesSearch; 
        });

        renderTimeline(filtered);
    }

    // Event Listeners for Filters
    if (campaignFilter) {
        campaignFilter.addEventListener('change', (e) => {
            currentCampaignName = e.target.value;
            if (arcFilter) arcFilter.value = "all"; // Reset Arc filter on campaign swap
            if (searchInput) searchInput.value = ""; // Reset Search
            loadCampaignWorkspace();
        });
    }
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (arcFilter) arcFilter.addEventListener('change', applyFilters);


    function findNPC(id) {
        if (typeof npcAlmanach !== 'undefined' && npcAlmanach[id]) {
            return { id: id, ...npcAlmanach[id] };
        }
        return null;
    }

    function findLocation(title) {
        const lowerTitle = title.toLowerCase();

        if (typeof countryRegistry !== 'undefined') {
            for (const [countryId, country] of Object.entries(countryRegistry)) {
                const countryMatch = (country.regionName && country.regionName.toLowerCase() === lowerTitle) ||
                    (country.aliases || []).some(a => a.toLowerCase() === lowerTitle);
                if (countryMatch) return { title: country.regionName, url: `country.html?id=${countryId}` };
            }
        }

        if (typeof settlementRegistry !== 'undefined') {
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
        }
        return null;
    }

    function autoLinkContent(text) {
        if (!text) return "";
        let linkedText = text;

        if (typeof npcAlmanach !== 'undefined') {
            Object.keys(npcAlmanach).forEach(id => {
                const npcData = findNPC(id);
                if (npcData) {
                    const regex = new RegExp(`\\b${npcData.name}\\b(?![^<]*>)`, 'gi');
                    linkedText = linkedText.replace(regex, (match) => `<a href="npc.html?id=${id}" onclick="event.stopPropagation()" class="kw-person relative z-10">${match}</a>`);
                }
            });
        }

        let locTargets = [];

        if (typeof countryRegistry !== 'undefined') {
            Object.entries(countryRegistry).forEach(([countryId, country]) => {
                if (country.regionName) locTargets.push({ name: country.regionName, url: `country.html?id=${countryId}` });
                (country.aliases || []).forEach(alias => locTargets.push({ name: alias, url: `country.html?id=${countryId}` }));
            });
        }

        if (typeof settlementRegistry !== 'undefined') {
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
        }

        locTargets.sort((a, b) => b.name.length - a.name.length);

        locTargets.forEach(target => {
            const regex = new RegExp(`\\b${target.name}\\b(?![^<]*>)`, 'gi');
            linkedText = linkedText.replace(regex, (match) => `<a href="${target.url}" onclick="event.stopPropagation()" class="kw-place relative z-10">${match}</a>`);
        });

        if (typeof keywordLexicon !== 'undefined') {
            Object.keys(keywordLexicon).forEach(term => {
                const regex = new RegExp(`\\b${term}\\b(?![^<]*>)`, 'gi');
                const entry = keywordLexicon[term];
                const definition = (typeof entry === 'string' ? entry : entry.definition).replace(/'/g, "\\'");
                const type = (typeof entry === 'string' ? 'lore' : entry.type) || 'lore';
                const typeClass = `kw-${type}`;

                linkedText = linkedText.replace(regex, (match) => `
                    <span class="${typeClass} relative z-10" onmouseenter="showTooltip(event, '${term}', '${definition}', '${type}')" onclick="event.stopPropagation(); triggerSearch('${term}')">${match}</span>`);
            });
        }

        if (typeof handoutsData !== 'undefined') {
            const sortedHandouts = [...handoutsData].sort((a, b) => b.title.length - a.title.length);
            
            sortedHandouts.forEach(handout => {
                const safeTitle = handout.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${safeTitle}\\b(?![^<]*>)`, 'gi');
                
                linkedText = linkedText.replace(regex, (match) => `
                    <a href="${handout.fileUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="kw-object relative z-10" onmousemove="showHandoutTooltip(event, '${handout.id}')" onmouseleave="hideHandoutTooltip()" title="Click to view evidence">${match}</a>`
                );
            });
        }

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

            const npcTags = (session.npcsMet || []).map(entry => {
                const data = findNPC(entry.id);
                if (!data) return '';
                
                const avatarImg = data.avatar || 'https://ui-avatars.com/api/?background=1a1c1a&color=4ade80&name=' + data.name;

                return `
                <div class="group/avatar relative z-10 hover:z-50">
                    <a href="npc.html?id=${entry.id}" onclick="event.stopPropagation()" class="block">
                        <img src="${avatarImg}" alt="${data.name}" class="w-10 h-10 rounded-full border-2 border-[#121412] object-cover hover:scale-110 transition-transform shadow-md">
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/avatar:opacity-100 pointer-events-none transition-opacity duration-300 flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded bg-[#4ade80]/15 border border-[#4ade80]/30 text-[#4ade80] text-[9px] uppercase tracking-widest backdrop-blur-md shadow-lg">
                            ${data.name}
                        </div>
                    </a>
                </div>`;
            }).join('');

            const locTags = (session.locationsVisited || []).map(title => {
                const data = findLocation(title);
                return data ? `<a href="${data.url}" onclick="event.stopPropagation()" class="flex items-center gap-1.5 px-2 py-1 rounded bg-[#60a5fa]/10 border border-[#60a5fa]/20 text-[#60a5fa] text-[9px] uppercase tracking-widest hover:bg-[#60a5fa]/20 transition-colors relative z-10"><span class="material-symbols-outlined text-[12px]">location_on</span> ${title}</a>`
                    : `<span onclick="event.stopPropagation(); triggerSearch('${title}')" class="flex items-center gap-1.5 px-2 py-1 rounded bg-[#60a5fa]/10 border border-[#60a5fa]/20 text-[#60a5fa] text-[9px] uppercase tracking-widest cursor-pointer hover:bg-[#60a5fa]/20 transition-colors relative z-10"><span class="material-symbols-outlined text-[12px]">location_on</span> ${title}</span>`;
            }).join('');

            const lootTags = (session.lootObtained || []).map(item => `
                <span class="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[#c084fc]/80"><span class="material-symbols-outlined text-[12px]">auto_awesome</span> ${item}</span>
            `).join('');

            const isLatest = index === 0 && searchInput.value === "" && arcFilter.value === "all";

            html += `
                <div id="${session.id}" class="relative pl-10 md:pl-16 mb-12 group animate-fade-in">
                    <div class="absolute left-[11.5px] md:left-[19.5px] top-6 w-2.5 h-2.5 rounded-full ${isLatest ? 'bg-[#e9c176] shadow-[0_0_15px_rgba(233,193,118,0.6)]' : 'bg-white/10 group-hover:bg-white/30'} z-10 transition-all"></div>
                    
                    <div onclick="openSessionFolio('${session.id}')" class="bg-[#121412] ${isLatest ? 'border-l-2 border-[#e9c176]/40' : 'border-l-2 border-transparent'} rounded-r-lg p-6 md:p-8 hover:bg-[#161816] transition-all border-t border-r border-b border-white/20 cursor-pointer shadow-lg hover:shadow-2xl">
                        <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                            <div>
                                <div class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/5 border border-white/20 text-[8px] font-label uppercase tracking-widest text-purple-600/70 mb-3 shadow-inner">
                                    <span class="material-symbols-outlined text-[10px] text-purple-600">explore</span> ${currentCampaignName}
                                </div>

                                <p class="font-label text-[9px] uppercase tracking-[0.2em] text-white/40 mb-1">${session.dateSpan || "Unknown Date"}</p>
                                <h3 class="text-2xl font-headline font-bold text-white group-hover:text-[#e9c176] transition-colors">${session.title}</h3>
                            </div>
                           <div class="flex flex-wrap -space-x-3 pl-2">${npcTags}</div>
                        </div> <p class="font-body text-sm text-[#8a8a8a] leading-relaxed mb-6 line-clamp-2">${autoLinkContent(session.summary)}</p>
                        
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
        if (!questList) return;
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
        if (!lootList) return;
        const allLoot = [...new Set(sessions.flatMap(s => s.lootObtained || []))];
        lootList.innerHTML = allLoot.map(item => `
            <span class="px-2 py-1 rounded bg-white/5 border border-white/10 text-[8px] uppercase tracking-widest text-white/40 hover:text-[#c084fc] hover:border-[#c084fc]/30 transition-all cursor-help" title="Acquired in Archive">${item}</span>
        `).join('');
    }

    function populateArcFilter(sessions) {
        if (!arcFilter) return;
        const arcs = [...new Set(sessions.map(s => s.arc))];
        arcFilter.innerHTML = `<option value="all">All Campaign Arcs</option>` +
            arcs.map(arc => `<option value="${arc}">${arc}</option>`).join('');
    }

    // --- TOOLTIP LOGIC ---
    window.closeTooltip = () => {
        const tt = document.getElementById('keyword-tooltip');
        if (tt) tt.style.display = 'none';
    };

    window.triggerSearch = (term) => {
        if (searchInput) {
            searchInput.value = term;
            document.getElementById('session-modal').classList.replace('flex', 'hidden');
            document.getElementById('story-modal').classList.replace('flex', 'hidden'); 
            window.closeTooltip();
            searchInput.dispatchEvent(new Event('input'));
        }
    };

    window.showTooltip = (e, term, definition, type) => {
        const tt = document.getElementById('keyword-tooltip');
        const title = document.getElementById('tooltip-title');

        const typeColors = {
            person: '#4ade80', place: '#60a5fa', monster: '#f87171', 
            faction: '#fb923c', lore: '#e9c176', object: '#c084fc'
        };

        const activeColor = typeColors[type] || typeColors.lore;

        if (tt.style.display !== 'block' || title.textContent !== term) {
            tt.style.left = `${e.clientX + 15}px`; // fixed ? 
            tt.style.top = `${e.clientY + 15}px`;  // fixed, hopefully
        }

        title.textContent = term;
        title.style.color = activeColor;
        tt.style.borderColor = activeColor;
        document.getElementById('tooltip-body').textContent = definition;

        tt.style.display = 'block';

        if (typeof window.resetTooltipTimer === 'function') {
            window.resetTooltipTimer();
        }
    };

    window.showHandoutTooltip = (e, handoutId) => {
        const tt = document.getElementById('handout-tooltip');
        if (!tt) return;

        const handout = typeof handoutsData !== 'undefined' ? handoutsData.find(h => h.id === handoutId) : null;
        if (!handout) return;

        if (tt.getAttribute('data-current-id') !== handoutId) {
            tt.setAttribute('data-current-id', handoutId);
            
            tt.innerHTML = `
                <div class="relative bg-[#050505] border border-white/20 rounded-xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-b from-secondary/10 to-transparent pointer-events-none"></div>

                    <div class="text-center mb-3 relative z-10 flex flex-col items-center">
                        <h3 class="font-headline text-lg font-bold text-secondary uppercase tracking-wider drop-shadow-md">${handout.title}</h3>
                        <p class="font-label text-[9px] uppercase tracking-widest text-white/50 mt-1">${handout.category}</p>
                    </div>

                    <div class="relative mb-5 shrink-0">
                        <div class="w-full aspect-[4/3] bg-[#0a0b0a] border border-white/10 rounded-md relative overflow-hidden shadow-inner">
                            <img src="${handout.thumbnail}" class="w-full h-full object-cover opacity-90">
                            <div class="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent pointer-events-none"></div>
                        </div>

                        <div class="absolute -bottom-4 left-0 right-0 flex justify-center z-20 pointer-events-none">
                            <div class="absolute top-1/2 left-4 right-4 h-px bg-secondary/30"></div>
                            <div class="w-8 h-8 bg-[#0a0b0a] border border-secondary rounded-md flex items-center justify-center relative z-10 shadow-[0_0_15px_rgba(233,193,118,0.3)]">
                                <span class="material-symbols-outlined text-secondary text-[16px]">${(handout.icon || 'description').toLowerCase()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="relative z-10 flex-grow flex flex-col pt-2">
                        <p class="font-newsreader text-white/80 text-xs leading-relaxed line-clamp-3 mb-3">${handout.description}</p>
                        <div class="mt-auto pt-3 flex justify-between items-center border-t border-white/10">
                            <span class="text-[8px] font-label uppercase tracking-widest text-white/40 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[10px]">location_on</span> ${handout.locationFound}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }

        tt.style.left = `${e.clientX + 15}px`; 
        tt.style.top = `${e.clientY + 20}px`;  
        tt.style.display = 'block';
    };

    window.hideHandoutTooltip = () => {
        const tt = document.getElementById('handout-tooltip');
        if (tt) tt.style.display = 'none';
    };

    // --- DRAG & TIMER ENGINE ---
    let tooltipTimeout;
    const tt = document.getElementById('keyword-tooltip');
    
    if (tt) {
        const ttHeader = tt.firstElementChild; 
        
        window.resetTooltipTimer = () => {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = setTimeout(() => {
                window.closeTooltip();
            }, 8000); 
        };

        tt.addEventListener('mouseenter', () => clearTimeout(tooltipTimeout));
        tt.addEventListener('mouseleave', window.resetTooltipTimer);

        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        if (ttHeader) {
            ttHeader.style.cursor = 'grab';

            ttHeader.addEventListener('mousedown', (e) => {
                isDragging = true;
                ttHeader.style.cursor = 'grabbing';
                
                offsetX = e.clientX - parseInt(tt.style.left || 0, 10); 
                offsetY = e.clientY - parseInt(tt.style.top || 0, 10);  
                e.preventDefault(); 
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                tt.style.left = `${e.clientX - offsetX}px`; 
                tt.style.top = `${e.clientY - offsetY}px`;  
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    ttHeader.style.cursor = 'grab';
                }
            });
        }
    }

    // --- MODAL LOGIC ---
    window.openStoryFolio = () => {
        const data = window.campaignData[currentCampaignName];
        if (!data) return;

        const modal = document.getElementById('story-modal');
        modal.innerHTML = `
            <div class="max-w-4xl w-full bg-[#121412] rounded-xl border border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
                <div class="p-6 md:p-8 border-b border-white/5 flex justify-between items-center shrink-0">
                    <div><p class="font-label text-[#e9c176] text-[10px] uppercase tracking-[0.3em] mb-1">Archival Summary</p><h2 class="text-2xl font-headline font-bold text-white">The Story So Far</h2></div>
                    <button onclick="closeStoryModal()" class="text-[#a0a0a0] hover:text-white p-2 rounded-full hover:bg-white/5"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="p-6 md:p-12 overflow-y-auto custom-scrollbar font-body text-base text-[#b0b0b0] leading-relaxed space-y-6">
                    ${autoLinkContent(data.storySoFar.full)}
                </div>
            </div>
        `;
        modal.classList.replace('hidden', 'flex');
    };

    window.openSessionFolio = (id) => {
        const data = window.campaignData[currentCampaignName];
        if (!data) return;

        const session = (data.sessions || []).find(s => s.id === id);
        if (!session) return;

        const modal = document.getElementById('session-modal');
        const content = document.getElementById('session-modal-content');

        const getSentiment = (s) => {
            if (s === 'like') return '<span class="material-symbols-outlined text-[#4ade80] text-sm" title="Positive Interaction">sentiment_satisfied</span>';
            if (s === 'dislike') return '<span class="material-symbols-outlined text-error text-sm" title="Hostile/Negative">sentiment_dissatisfied</span>';
            return '<span class="material-symbols-outlined text-[#60a5fa] text-sm" title="Neutral/Business">sentiment_neutral</span>';
        };

        const npcCards = (session.npcsMet || []).map(entry => {
            const npc = findNPC(entry.id);
            if (!npc) return '';
            return `
            <div class="flex items-center justify-between p-2 rounded bg-white/5 border border-white/10">
                <a href="npc.html?id=${entry.id}" class="kw-person text-xs">${npc.name}</a>
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
                    <div class="flex flex-wrap gap-2">${(session.locationsVisited || []).map(loc => {
            const locData = findLocation(loc);
            return locData
                ? `<a href="${locData.url}" class="kw-place text-sm">${loc}</a>`
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
                        ${(session.accomplished || []).map(item => `<li class="text-sm text-white/70 flex gap-3"><span class="text-secondary">→</span> <span>${autoLinkContent(item)}</span></li>`).join('')}
                    </ul>
                </div>

                <div class="md:col-span-4 p-6 rounded-xl bg-[#c084fc]/5 border border-[#c084fc]/20 shadow-inner">
                    <h3 class="font-label text-[10px] uppercase text-[#c084fc] tracking-widest mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm">inventory_2</span> The Vault
                    </h3>
                    <div class="space-y-2">
                        ${(session.lootObtained || []).map(item => `<div class="text-xs font-bold text-white flex items-center gap-2"><span class="material-symbols-outlined text-xs text-[#c084fc]">auto_awesome</span> ${item}</div>`).join('')}
                    </div>
                </div>

                <div class="md:col-span-6 p-6 rounded-xl bg-white/[0.02] border border-white/5 border-l-secondary/40 border-l-2">
                    <h3 class="font-label text-[10px] uppercase text-secondary tracking-widest mb-4">Leads Pursued</h3>
                    <ul class="space-y-2">
                        ${(session.leadsPursued || []).map(item => `<li class="text-xs text-white/60 italic">${autoLinkContent(item)}</li>`).join('')}
                    </ul>
                </div>

                <div class="md:col-span-6 p-6 rounded-xl bg-white/[0.02] border border-white/5 border-l-error/40 border-l-2">
                    <h3 class="font-label text-[10px] uppercase text-error tracking-widest mb-4">Future Leads</h3>
                    <ul class="space-y-2">
                        ${(session.futureLeads || []).map(item => `<li class="text-xs text-white/60">${autoLinkContent(item)}</li>`).join('')}
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