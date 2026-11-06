// scripts/core/threat.js — creature threat levels, shared by bestiary.html and beast.html.
// One place decides the tone (colour, see .threat--* in components.css) and the icon.
// Names are creature-specific: factions-script.js has its own top-level `threatTone`.

const CREATURE_THREAT_ICONS = {
    lethal: 'skull',
    high: 'warning',
    moderate: 'shield',
    low: 'eco',
    friendly: 'favorite',
};

// "High", "Extreme", "Ally"… -> 'lethal' | 'high' | 'moderate' | 'low' | 'friendly'
function creatureThreatTone(level) {
    const t = (level || '').toLowerCase();
    if (t.includes('lethal') || t.includes('extreme')) return 'lethal';
    if (t.includes('high')) return 'high';
    if (t.includes('harmless') || t.includes('low')) return 'low';
    if (t.includes('friendly') || t.includes('ally')) return 'friendly';
    return 'moderate';
}

// The pill: <span class="threat-pill threat--high">[icon] High</span>
// `extraClass` adds a context class (e.g. 'beast-card__threat') for placement tweaks.
function creatureThreatPill(level, extraClass = '') {
    const tone = creatureThreatTone(level);
    return `<span class="threat-pill threat--${tone} ${extraClass}">`
        + `<span class="threat-pill__icon material-symbols-outlined" aria-hidden="true">${CREATURE_THREAT_ICONS[tone]}</span>`
        + `<span class="threat-pill__label">${level || ''}</span>`
        + `</span>`;
}
