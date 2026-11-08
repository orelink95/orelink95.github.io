// Built from the store on load, in the shape the dossier code expects.
var factionsData = [];
var factionsStore = null;

document.addEventListener("DOMContentLoaded", async () => {
    const store = factionsStore = await Athenaeum.ready;
    const names = ids => (ids || []).map(id => (store.get(id) || {}).name).filter(Boolean);
    // Stubs (named somewhere, not written up yet) get no dossier tab.
    factionsData = store.all('faction').filter(f => !f.stub).map(f => ({
        id: f.id, name: f.name, crest: f.crest || 'images/placeholder.png',
        status: f.status || 'Unknown', quote: f.quote || '',
        reputation: f.reputation || 0, reputationText: f.reputationText || '',
        quickFacts: { base: f.base, scale: f.scale, mo: f.mo, threatLevel: f.threatLevel },
        relationships: { allies: names(f.allies), rivals: names(f.rivals) },
        assets: f.assets || [], directives: f.directives || [], rumors: f.rumors || [], intel: f.intel || []
    }));

    const tabsContainer = document.getElementById('faction-tabs');

    // 1. Render the Slanted Tabs
    tabsContainer.innerHTML = factionsData.map((faction, index) => {
        // Tab tone (see .faction-tab--* in pages/factions.css)
        let tone = "";
        let icon = "public";

        if (faction.status.toLowerCase() === "allied") { tone = "faction-tab--allied"; icon = "handshake"; }
        if (faction.status.toLowerCase() === "hostile") { tone = "faction-tab--hostile"; icon = "visibility"; }

        return `
        <button onclick="openDossier('${faction.id}')" id="tab-${faction.id}" class="faction-tab ${tone}">
            
            <div class="faction-tab__card">
                
                <div class="faction-tab__badge">
                    <span class="faction-tab__icon material-symbols-outlined">${icon}</span>
                </div>
                
                <div class="faction-tab__text">
                    <h3 class="faction-tab__name">${faction.name}</h3>
                    <p class="faction-tab__status">Status: ${faction.status}</p>
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

// Helper: threat level -> colour modifier (see .dossier-facts__threat--* in pages/factions.css)
const threatTone = (level) => {
    if (!level) return 'none';
    const l = level.toLowerCase();
    return ['low', 'moderate', 'severe', 'omega'].includes(l) ? l : 'other';
};

window.openDossier = (id) => {
    const faction = factionsData.find(f => f.id === id);
    if (!faction) return;

    // Highlight active tab
    document.querySelectorAll('.faction-tab').forEach(el => el.classList.remove('is-active'));
    const activeTab = document.getElementById(`tab-${id}`);
    if (activeTab) activeTab.classList.add('is-active');

    // Hide empty state, reveal dossier
    document.getElementById('empty-state').classList.add('hidden');
    const dossierView = document.getElementById('dossier-view');
    dossierView.classList.remove('hidden');

    // --- HTML GENERATION ---

    // 1. The Header (Crest + Name)
    let html = `
        <div class="dossier__watermark">
            <span class="dossier__watermark-icon material-symbols-outlined">fingerprint</span>
        </div>

        <div class="dossier-head">
            <div class="dossier-head__identity">
                <img src="${faction.crest}" class="dossier-head__crest">
                <div>
                    <h1 class="dossier-head__name">${faction.name}</h1>
                    <p class="dossier-head__quote">"${faction.quote}"</p>
                </div>
            </div>
            <div class="dossier-head__stamp-wrap">
                <span class="dossier-head__stamp">Classified</span>
            </div>
        </div>
    `;

    // 2. Operational Intel (Quick Facts Grid)
    if (faction.quickFacts) {
        html += `
        <div class="dossier-facts">
            <div>
                <p class="dossier-facts__label">Base of Operations</p>
                <p class="dossier-facts__value">${faction.quickFacts.base || 'Unknown'}</p>
            </div>
            <div>
                <p class="dossier-facts__label">Scale of Influence</p>
                <p class="dossier-facts__value">${faction.quickFacts.scale || 'Unknown'}</p>
            </div>
            <div>
                <p class="dossier-facts__label">Modus Operandi</p>
                <p class="dossier-facts__long-value" title="${faction.quickFacts.mo}">${faction.quickFacts.mo || 'Unknown'}</p>
            </div>
            <div>
                <p class="dossier-facts__label">Assessed Threat</p>
                <p class="dossier-facts__threat dossier-facts__threat--${threatTone(faction.quickFacts.threatLevel)}">${faction.quickFacts.threatLevel || 'Unassessed'}</p>
            </div>
        </div>`;
    }

    // 3. Reputation Bar (Now with dynamic color-coding!)
    // Gold by default, green when allied, red when hostile (see .standing--* in pages/factions.css)
    const factionStatus = (faction.status || "").toLowerCase();
    const standingTone = factionStatus === "allied" ? "standing--allied" : factionStatus === "hostile" ? "standing--hostile" : "";

    html += `
        <div class="standing ${standingTone}">
            <div class="standing__head">
                <span class="standing__label">Current Standing</span>
                <span class="standing__value">${faction.reputationText}</span>
            </div>
            <div class="standing__track">
                <div class="standing__bar" id="f-rep-bar-dynamic"></div>
            </div>
        </div>
    `;

    // 4. The 3-Column Deep Dive (Assets, Directives, Web of Power)
    const hasAssets = faction.assets && faction.assets.length > 0;
    const hasDirectives = faction.directives && faction.directives.length > 0;
    const hasRelationships = faction.relationships && (faction.relationships.allies?.length > 0 || faction.relationships.rivals?.length > 0);

    if (hasAssets || hasDirectives || hasRelationships) {
        html += `<div class="dossier-columns">`;

        // Assets Column
        if (hasAssets) {
            html += `
            <div>
                <h4 class="assets__title"><span class="dossier-column__icon material-symbols-outlined">inventory_2</span> Known Assets</h4>
                <ul class="dossier-list">
                    ${faction.assets.map(a => `<li class="dossier-list__item"><span class="assets__bullet">•</span> ${a}</li>`).join('')}
                </ul>
            </div>`;
        }

        // Directives Column
        if (hasDirectives) {
            html += `
            <div>
                <h4 class="directives__title"><span class="dossier-column__icon material-symbols-outlined">priority_high</span> Active Directives</h4>
                <ul class="dossier-list">
                    ${faction.directives.map(d => `<li class="dossier-list__item"><span class="directives__bullet">•</span> ${d}</li>`).join('')}
                </ul>
            </div>`;
        }

        // Web of Power Column
        if (hasRelationships) {
            html += `
            <div class="power">
                <h4 class="power__title"><span class="dossier-column__icon material-symbols-outlined">hub</span> Web of Power</h4>
                
                ${faction.relationships.allies?.length > 0 ? `
                    <p class="power__allies-label">Allies</p>
                    <ul class="power__allies">
                        ${faction.relationships.allies.map(a => `<li class="power__ally">${a}</li>`).join('')}
                    </ul>
                ` : ''}

                ${faction.relationships.rivals?.length > 0 ? `
                    <p class="power__rivals-label">Rivals</p>
                    <ul class="power__rivals">
                        ${faction.relationships.rivals.map(r => `<li class="power__rival">${r}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>`;
        }
        html += `</div>`;
    }

    // 4.5 Known Roster (Auto-generated Target Profiles from Almanach)
    let affiliatedNPCs = [];

    // Members: NPCs whose factions list this one
    affiliatedNPCs = factionsStore.backrefs(faction.id, 'npc', 'factions').map(npc => ({
        id: npc.id, name: npc.name, role: npc.role || '', relationToParty: npc.relation || 'Unknown',
        image: npc.portrait || npc.avatar || 'images/placeholder.png',
        biography: factionsStore.plain(npc.biography)
    }));

    // If we found matches, build the Target Profiles!
    if (affiliatedNPCs.length > 0) {
        html += `<h4 class="dossier-section-title"><span class="dossier-section-title__icon material-symbols-outlined">group</span> Known Roster</h4>`;
        html += `<div class="evidence-grid">`;

        html += affiliatedNPCs.map(npc => {
            // Color-code their relationship tag automatically
            let tagTone = "tag--blue";
            const rel = (npc.relationToParty || "").toLowerCase();
            if (rel.includes("ally")) tagTone = "tag--ally";
            if (rel.includes("displeased") || rel.includes("hostile")) tagTone = "tag--hostile";
            if (rel.includes("killed")) tagTone = "tag--killed";

            // The Clickable Card linking to npc.html
            return `
            <a href="${factionsStore.url(npc.id)}" class="roster-card">
                <img src="${npc.image || npc.avatar}" class="profile-img">
                <div class="roster-card__body">
                    <div class="roster-card__head">
                        <h4 class="roster-card__kicker">Target Profile</h4>
                        <span class="roster-card__open material-symbols-outlined">open_in_new</span>
                    </div>
                    <h3 class="roster-card__name">${npc.name}</h3>
                    <p class="profile-desc">${npc.biography}</p>
                    <div class="tag-list">
                        <span class="tag tag--gold">${npc.role}</span>
                        <span class="tag ${tagTone}">${npc.relationToParty || 'Unknown'}</span>
                    </div>
                </div>
            </a>`;
        }).join('');

        html += `</div>`;
    }

    // 5. Evidence Board (Intel Grid)
    if (faction.intel && faction.intel.length > 0) {
        html += `<h4 class="dossier-section-title"><span class="dossier-section-title__icon material-symbols-outlined">folder_supervised</span> Field Evidence</h4>`;
        html += `<div class="evidence-grid">`;

        html += faction.intel.map(item => {
            if (item.type === "note") {
                return `
                <div class="intel-note">
                    <div class="intel-note__seal"><span class="intel-note__seal-text">${item.seal}</span></div>
                    <h4 class="intel-note__title">${item.title}</h4>
                    <p class="intel-note__text">"${item.content}"</p>
                </div>`;
            }
            if (item.type === "map") {
                return `
                <div class="intel-map">
                    <div class="intel-map__label">${item.title}</div>
                    <img src="${item.image}" class="intel-map__img">
                </div>`;
            }
            if (item.type === "target") {
                const tagsHTML = (item.tags || []).map(t => `<span class="tag ${t.tone ? 'tag--' + t.tone : ''}">${t.text}</span>`).join('');
                return `
                <div class="intel-target">
                    <img src="${item.image}" class="profile-img">
                    <div class="intel-target__body">
                        <h4 class="intel-target__kicker">Target Profile</h4>
                        <h3 class="intel-target__name">${item.name}</h3>
                        <p class="profile-desc">${item.description}</p>
                        <div class="tag-list">${tagsHTML}</div>
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
        <div class="rumors">
            <div class="rumors__clip">
                <span class="rumors__clip-icon material-symbols-outlined">attach_file</span>
            </div>
            <h4 class="rumors__title">Unverified Field Rumors</h4>
            <ul class="rumors__list">
                ${faction.rumors.map(r => `
                    <li class="rumors__item">
                        <span class="rumors__icon material-symbols-outlined">edit</span>
                        ${r}
                    </li>
                `).join('')}
            </ul>
        </div>`;
    }

    // Inject the completed HTML!
    dossierView.innerHTML = html;

    // Single column (phones, tablets): bring the dossier into view
    if (window.matchMedia('(max-width: 1023.98px)').matches) {
        dossierView.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Trigger the reputation bar animation
    setTimeout(() => {
        const repBar = document.getElementById('f-rep-bar-dynamic');
        if (repBar) repBar.style.width = `${faction.reputation}%`;
    }, 50);

};
