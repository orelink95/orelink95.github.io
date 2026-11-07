// scripts/spellbook-scripts.js — the Book of Shadows (spellbook.html)
//
// Pick a campaign, then a hero: their spell cards appear, grouped by level.
// What a hero knows is in campaign.spellbooks, so a hero who is in two
// campaigns (Eli, M3MU) can know different spells in each.
// Cards and pop-ups: scripts/spell-card.js.
//
// URL:  ?campaign=<id>&hero=<id>  picks them (shareable link)
//       ?spell=<id>               opens that card, whatever is picked (auto-links)

document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const SC = Athenaeum.spellCard;
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const campaignPick = document.getElementById('spellbook-campaign');
    const heroPick = document.getElementById('spellbook-hero');
    const cards = document.getElementById('spellbook-cards');

    // --- campaigns where at least one hero knows a spell
    const heroesOf = campaign => (campaign.spellbooks || [])
        .filter(b => b.hero && (b.spells || []).length)
        .map(b => store.get(b.hero))
        .filter(Boolean);
    const campaigns = store.all('campaign').filter(c => heroesOf(c).length);

    const params = new URLSearchParams(window.location.search);
    let campaign = campaigns.find(c => c.id === params.get('campaign')) || null;
    let hero = null;

    // --- the two pickers
    campaignPick.innerHTML = `<option value="">Choose a campaign…</option>` +
        campaigns.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

    function fillHeroes(wanted) {
        const heroes = campaign ? heroesOf(campaign) : [];
        heroPick.innerHTML = `<option value="">${campaign ? 'Choose a hero…' : 'Choose a campaign first'}</option>` +
            heroes.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
        heroPick.disabled = !campaign;
        // Keep the hero if they are also in this campaign
        hero = heroes.find(h => h.id === wanted) || null;
        heroPick.value = hero ? hero.id : '';
    }

    function remember() {
        const q = new URLSearchParams();
        if (campaign) q.set('campaign', campaign.id);
        if (hero) q.set('hero', hero.id);
        const s = q.toString();
        history.replaceState(null, '', s ? `?${s}` : location.pathname);
    }

    // --- the cards (nothing until both are picked)
    function render() {
        if (!campaigns.length) {
            cards.innerHTML = `<p class="spellbook-empty">No hero has a spellbook yet.</p>`;
            return;
        }
        if (!campaign || !hero) {
            cards.innerHTML = `<p class="spellbook-empty">${campaign ? 'Now choose a hero.' : 'Choose a campaign, then a hero.'}</p>`;
            return;
        }
        const spells = SC.known(store, campaign, hero);
        cards.innerHTML = spells.length
            ? SC.levels(spells, store)
            : `<p class="spellbook-empty">${esc(hero.name)} knows no spell in this campaign.</p>`;
    }

    campaignPick.addEventListener('change', () => {
        campaign = campaigns.find(c => c.id === campaignPick.value) || null;
        fillHeroes(hero && hero.id);
        remember();
        render();
    });
    heroPick.addEventListener('change', () => {
        hero = campaign && heroesOf(campaign).find(h => h.id === heroPick.value) || null;
        remember();
        render();
    });

    campaignPick.value = campaign ? campaign.id : '';
    fillHeroes(params.get('hero'));
    render();

    // A link to one spell (spellbook.html?spell=…) opens its card
    const linked = params.get('spell');
    if (linked) SC.openSpell(linked, store);
});
