document.addEventListener("DOMContentLoaded", () => {
    if (typeof factionsData === 'undefined') return;

    const tabsContainer = document.getElementById('faction-tabs');

    // 1. Render the Slanted Tabs
    tabsContainer.innerHTML = factionsData.map((faction, index) => {
        let statusColor = "text-white/40";
        let icon = "public";

        if (faction.status.toLowerCase() === "allied") { statusColor = "text-[#4ade80]"; icon = "handshake"; }
        if (faction.status.toLowerCase() === "hostile") { statusColor = "text-error"; icon = "visibility"; }

        return `
        <button onclick="openDossier('${faction.id}')" id="tab-${faction.id}" class="faction-tab w-full text-left -skew-x-3 transform transition-all duration-300 hover:-skew-x-1 hover:translate-x-2 group outline-none">
            
            <div class="bg-[#121412] border border-white/5 group-hover:border-white/20 p-3 md:p-4 shadow-lg flex items-center gap-4">
                
                <div class="w-9 h-9 rounded bg-black/40 border border-white/5 flex items-center justify-center shrink-0 group-hover:border-[#e9c176]/30 transition-colors">
                    <span class="material-symbols-outlined ${statusColor} text-base group-hover:text-[#e9c176] transition-colors">${icon}</span>
                </div>
                
                <div class="min-w-0 flex-1">
                    <h3 class="font-headline text-base md:text-lg text-white group-hover:text-[#e9c176] transition-colors skew-x-3 truncate">${faction.name}</h3>
                    <p class="font-label text-[8px] uppercase tracking-widest ${statusColor} skew-x-3 mt-0.5">Status: ${faction.status}</p>
                </div>
            </div>
        </button>
        `;
    }).join('');

    // 2. Auto-open dossier if ID is passed in the URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    if (targetId) {
        setTimeout(() => {
            if (typeof window.openDossier === 'function') {
                window.openDossier(targetId);
            }
        }, 100);
    }
});

// --- DOSSIER RENDERING ENGINE ---

// Helper: Color code threat levels
const getThreatColor = (level) => {
    if (!level) return 'text-white/40';
    const l = level.toLowerCase();
    if (l === 'low') return 'text-[#4ade80]'; // Green
    if (l === 'moderate') return 'text-[#e9c176]'; // Gold
    if (l === 'severe') return 'text-error'; // Red
    if (l === 'omega') return 'text-[#c084fc] animate-pulse'; // Purple
    return 'text-white/60';
};

window.openDossier = (id) => {
    const faction = factionsData.find(f => f.id === id);
    if (!faction) return;

    // Highlight active tab
    document.querySelectorAll('.faction-tab div').forEach(el => el.classList.remove('bg-surface-container-highest', 'border-[#e9c176]/40'));
    const activeTab = document.querySelector(`#tab-${id} div`);
    if (activeTab) activeTab.classList.add('bg-surface-container-highest', 'border-[#e9c176]/40');

    // Hide empty state, reveal dossier
    document.getElementById('empty-state').classList.add('hidden');
    const dossierView = document.getElementById('dossier-view');
    dossierView.classList.remove('hidden');
    dossierView.classList.add('animate-fade-in');

    // --- HTML GENERATION ---

    // 1. The Header (Crest + Name)
    let html = `
        <div class="absolute -top-32 -right-32 text-white/5 pointer-events-none transform rotate-12 scale-150">
            <span class="material-symbols-outlined text-[300px]">fingerprint</span>
        </div>

        <div class="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-white/5 pb-8 mb-8 relative z-10">
            <div class="flex items-center gap-6">
                <img src="${faction.crest}" class="w-24 h-24 rounded-lg border border-[#e9c176]/30 object-cover shadow-[0_0_20px_rgba(233,193,118,0.2)] shrink-0">
                <div>
                    <h1 class="text-4xl md:text-5xl font-headline font-bold text-white mb-2">${faction.name}</h1>
                    <p class="font-newsreader italic text-[#e9c176]/80 text-lg">"${faction.quote}"</p>
                </div>
            </div>
            <div class="shrink-0 pt-2 text-right hidden md:block">
                <span class="inline-block border-2 border-error/40 text-error font-label text-sm uppercase tracking-[0.3em] px-4 py-2 rounded shadow-[0_0_15px_rgba(248,113,113,0.1)] opacity-80">Classified</span>
            </div>
        </div>
    `;

    // 2. Operational Intel (Quick Facts Grid)
    if (faction.quickFacts) {
        html += `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-black/40 border border-white/5 rounded-lg p-6 relative z-10">
            <div>
                <p class="font-label text-[9px] uppercase tracking-widest text-[#e9c176]/50 mb-1">Base of Operations</p>
                <p class="font-body text-sm text-white/90">${faction.quickFacts.base || 'Unknown'}</p>
            </div>
            <div>
                <p class="font-label text-[9px] uppercase tracking-widest text-[#e9c176]/50 mb-1">Scale of Influence</p>
                <p class="font-body text-sm text-white/90">${faction.quickFacts.scale || 'Unknown'}</p>
            </div>
            <div>
                <p class="font-label text-[9px] uppercase tracking-widest text-[#e9c176]/50 mb-1">Modus Operandi</p>
                <p class="font-body text-sm text-white/90 truncate" title="${faction.quickFacts.mo}">${faction.quickFacts.mo || 'Unknown'}</p>
            </div>
            <div>
                <p class="font-label text-[9px] uppercase tracking-widest text-[#e9c176]/50 mb-1">Assessed Threat</p>
                <p class="font-body text-sm font-bold ${getThreatColor(faction.quickFacts.threatLevel)}">${faction.quickFacts.threatLevel || 'Unassessed'}</p>
            </div>
        </div>`;
    }

    // 3. Reputation Bar (Now with dynamic color-coding!)
    let repTextColor = "text-[#e9c176]"; // Default Gold
    let repBarGradient = "via-[#e9c176] to-[#e9c176]"; // Default Gold

    const factionStatus = (faction.status || "").toLowerCase();
    if (factionStatus === "allied") {
        repTextColor = "text-[#4ade80]"; // Green
        repBarGradient = "via-[#4ade80] to-[#4ade80]";
    } else if (factionStatus === "hostile") {
        repTextColor = "text-error"; // Red
        repBarGradient = "via-[#f87171] to-[#f87171]";
    }

    html += `
        <div class="mb-10 relative z-10">
            <div class="flex justify-between items-center mb-2">
                <span class="font-label text-[10px] uppercase tracking-[0.2em] text-white/40">Current Standing</span>
                <span class="font-label text-[10px] uppercase tracking-widest ${repTextColor} font-bold">${faction.reputationText}</span>
            </div>
            <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-transparent ${repBarGradient} transition-all duration-1000 w-[0%]" id="f-rep-bar-dynamic"></div>
            </div>
        </div>
    `;

    // 4. The 3-Column Deep Dive (Assets, Directives, Web of Power)
    const hasAssets = faction.assets && faction.assets.length > 0;
    const hasDirectives = faction.directives && faction.directives.length > 0;
    const hasRelationships = faction.relationships && (faction.relationships.allies?.length > 0 || faction.relationships.rivals?.length > 0);

    if (hasAssets || hasDirectives || hasRelationships) {
        html += `<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 border-b border-white/5 pb-10 relative z-10">`;

        // Assets Column
        if (hasAssets) {
            html += `
            <div>
                <h4 class="font-label text-[10px] uppercase text-[#60a5fa] tracking-widest mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-sm">inventory_2</span> Known Assets</h4>
                <ul class="space-y-3">
                    ${faction.assets.map(a => `<li class="text-sm text-white/70 font-body flex items-start gap-2"><span class="text-[#60a5fa]/50 mt-0.5">•</span> ${a}</li>`).join('')}
                </ul>
            </div>`;
        }

        // Directives Column
        if (hasDirectives) {
            html += `
            <div>
                <h4 class="font-label text-[10px] uppercase text-error tracking-widest mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-sm">priority_high</span> Active Directives</h4>
                <ul class="space-y-3">
                    ${faction.directives.map(d => `<li class="text-sm text-white/70 font-body flex items-start gap-2"><span class="text-error/50 mt-0.5">•</span> ${d}</li>`).join('')}
                </ul>
            </div>`;
        }

        // Web of Power Column
        if (hasRelationships) {
            html += `
            <div class="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                <h4 class="font-label text-[10px] uppercase text-[#e9c176] tracking-widest mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-sm">hub</span> Web of Power</h4>
                
                ${faction.relationships.allies?.length > 0 ? `
                    <p class="text-[9px] uppercase tracking-widest text-[#4ade80] mb-2 font-bold">Allies</p>
                    <ul class="space-y-1 mb-4">
                        ${faction.relationships.allies.map(a => `<li class="text-sm text-white/70 font-body border-l border-[#4ade80]/30 pl-2">${a}</li>`).join('')}
                    </ul>
                ` : ''}

                ${faction.relationships.rivals?.length > 0 ? `
                    <p class="text-[9px] uppercase tracking-widest text-error mb-2 font-bold">Rivals</p>
                    <ul class="space-y-1">
                        ${faction.relationships.rivals.map(r => `<li class="text-sm text-white/70 font-body border-l border-error/30 pl-2">${r}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>`;
        }
        html += `</div>`;
    }

    // 4.5 Known Roster (Auto-generated Target Profiles from Almanach)
    let affiliatedNPCs = [];

    // Scan the almanach for anyone affiliated with this faction
    if (typeof npcAlmanach !== 'undefined') {
        for (const [npcId, npcData] of Object.entries(npcAlmanach)) {
            // Check if the NPC's affiliation matches the Faction Name
            if (npcData.affiliation && (
                npcData.affiliation.toLowerCase().includes(faction.name.toLowerCase()) ||
                faction.name.toLowerCase().includes(npcData.affiliation.toLowerCase())
            )) {
                affiliatedNPCs.push({ id: npcId, ...npcData });
            }
        }
    }

    // If we found matches, build the Target Profiles!
    if (affiliatedNPCs.length > 0) {
        html += `<h4 class="font-label text-sm uppercase text-white/90 tracking-[0.3em] mb-6 flex items-center gap-3 relative z-10"><span class="material-symbols-outlined text-[#e9c176]">group</span> Known Roster</h4>`;
        html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mb-10 relative z-10">`;

        html += affiliatedNPCs.map(npc => {
            // Color-code their relationship tag automatically
            let tagColor = "text-[#60a5fa] border-[#60a5fa]/30";
            const rel = (npc.relationToParty || "").toLowerCase();
            if (rel.includes("ally")) tagColor = "text-[#4ade80] border-[#4ade80]/30 bg-[#4ade80]/10";
            if (rel.includes("displeased") || rel.includes("hostile")) tagColor = "text-error border-error/30 bg-error/10";
            if (rel.includes("killed")) tagColor = "text-white/40 border-white/20 bg-white/5";

            // The Clickable Card linking to npc.html
            return `
            <a href="npc.html?id=${npc.id}" class="bg-black/40 border border-white/5 rounded-lg p-5 flex gap-5 group hover:border-[#e9c176]/50 transition-colors md:col-span-2 cursor-pointer relative overflow-hidden">
                <img src="${npc.image || npc.avatar}" class="w-24 h-24 rounded object-cover border border-white/10 shrink-0 grayscale group-hover:grayscale-0 transition-all">
                <div class="flex flex-col justify-center min-w-0 w-full">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-label text-[10px] uppercase text-[#e9c176] tracking-widest">Target Profile</h4>
                        <span class="material-symbols-outlined text-white/20 group-hover:text-[#e9c176] transition-colors text-[16px]">open_in_new</span>
                    </div>
                    <h3 class="font-headline text-xl text-white group-hover:text-[#e9c176] transition-colors truncate">${npc.name}</h3>
                    <p class="font-body text-xs text-white/60 mb-3 line-clamp-2">${npc.biography}</p>
                    <div class="flex flex-wrap gap-2">
                        <span class="px-2 py-0.5 border rounded text-[8px] uppercase tracking-widest text-[#e9c176] border-[#e9c176]/30">${npc.role}</span>
                        <span class="px-2 py-0.5 border rounded text-[8px] uppercase tracking-widest ${tagColor}">${npc.relationToParty || 'Unknown'}</span>
                    </div>
                </div>
            </a>`;
        }).join('');

        html += `</div>`;
    }

    // 5. Evidence Board (Intel Grid)
    if (faction.intel && faction.intel.length > 0) {
        html += `<h4 class="font-label text-sm uppercase text-white/90 tracking-[0.3em] mb-6 flex items-center gap-3 relative z-10"><span class="material-symbols-outlined text-[#e9c176]">folder_supervised</span> Field Evidence</h4>`;
        html += `<div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mb-10 relative z-10">`;

        html += faction.intel.map(item => {
            if (item.type === "note") {
                return `
                <div class="bg-black/40 border border-white/5 rounded-lg p-6 relative overflow-hidden group hover:border-white/10 transition-colors">
                    <div class="absolute -top-3 -right-3 w-12 h-12 bg-error rounded-full flex items-center justify-center shadow-lg transform rotate-12 group-hover:scale-110 transition-transform"><span class="font-headline font-bold text-black text-xs">${item.seal}</span></div>
                    <h4 class="font-label text-[10px] uppercase text-[#e9c176] tracking-widest mb-3">${item.title}</h4>
                    <p class="font-newsreader italic text-white/70 text-sm leading-relaxed pr-6">"${item.content}"</p>
                </div>`;
            }
            if (item.type === "map") {
                return `
                <div class="bg-black/40 border border-white/5 rounded-lg p-2 relative group hover:border-white/10 transition-colors">
                    <div class="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-sm border border-[#e9c176]/30 px-2 py-1 rounded text-[8px] uppercase tracking-widest text-[#e9c176]">${item.title}</div>
                    <img src="${item.image}" class="w-full h-40 object-cover rounded opacity-80 group-hover:opacity-100 transition-opacity grayscale hover:grayscale-0">
                </div>`;
            }
            if (item.type === "target") {
                const tagsHTML = (item.tags || []).map(t => `<span class="px-2 py-0.5 border rounded text-[8px] uppercase tracking-widest ${t.color}">${t.text}</span>`).join('');
                return `
                <div class="bg-black/40 border border-white/5 rounded-lg p-5 flex gap-5 group hover:border-white/10 transition-colors md:col-span-2">
                    <img src="${item.image}" class="w-24 h-24 rounded object-cover border border-white/10 shrink-0 grayscale group-hover:grayscale-0 transition-all">
                    <div class="flex flex-col justify-center">
                        <h4 class="font-label text-[10px] uppercase text-[#e9c176] tracking-widest mb-1">Target Profile</h4>
                        <h3 class="font-headline text-xl text-white mb-2">${item.name}</h3>
                        <p class="font-body text-xs text-white/60 mb-3 line-clamp-2">${item.description}</p>
                        <div class="flex flex-wrap gap-2">${tagsHTML}</div>
                    </div>
                </div>`;
            }
            return '';
        }).join('');

        html += `</div>`;
    }

    // 6. Unverified Rumors (Penciled Notes Aesthetic)
    if (faction.rumors && faction.rumors.length > 0) {
        html += `
        <div class="relative z-10 mt-12 bg-[#e9c176]/5 border border-[#e9c176]/20 p-8 rounded-lg transform rotate-1">
            <div class="absolute -top-4 left-1/2 -translate-x-1/2 text-white/40">
                <span class="material-symbols-outlined text-3xl transform -rotate-12">attach_file</span>
            </div>
            <h4 class="font-newsreader font-bold italic text-lg text-[#e9c176] mb-4 border-b border-[#e9c176]/20 pb-2">Unverified Field Rumors</h4>
            <ul class="space-y-4">
                ${faction.rumors.map(r => `
                    <li class="font-newsreader italic text-white/80 text-base flex gap-3">
                        <span class="material-symbols-outlined text-error text-lg shrink-0 mt-0.5">edit</span>
                        ${r}
                    </li>
                `).join('')}
            </ul>
        </div>`;
    }

    // Inject the completed HTML!
    dossierView.innerHTML = html;

    // Trigger the reputation bar animation
    setTimeout(() => {
        const repBar = document.getElementById('f-rep-bar-dynamic');
        if (repBar) repBar.style.width = `${faction.reputation}%`;
    }, 50);

};
