/* =====================================================================
   THE PANTHEON  —  pantheon.html
   Every god of data/deities.json as a card, one section per tier (the
   deityTier enum in data/schema.js, in its order). A card opens the god's
   page (deity.html). Elder gods not revealed in the chosen campaign
   (deity.revealedIn) are sealed slots: no name, no link.
   The campaign drop-down is shared with Dramatis Personae (scripts/personae.js).
   Cards: scripts/deity-card.js. Styles: styles/pages/pantheon.css.
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
    const store = await Athenaeum.ready;
    const Card = Athenaeum.deityCard;
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const box = document.getElementById('pantheon-tiers');

    // Old links (pantheon.html?id=…) now lead to the god's own page
    const asked = new URLSearchParams(location.search).get('id');
    if (asked && store.typeOf(asked) === 'deity') {
        location.replace(store.url(asked));
        return;
    }

    const deities = store.all('deity');
    if (!deities.length) {
        box.innerHTML = '<p class="pantheon-empty">The archive has not yet recorded any god by name.</p>';
        return;
    }

    // Campaign: only Elder gods depend on it, so the drop-down shows when there are some
    const campaigns = store.all('campaign');
    const hasElders = deities.some(d => Card.tierOf(d) === 'elder');
    let campaign = campaigns.length ? Athenaeum.personae.choose(store, { campaigns, allowAll: false }) : 'all';
    if (hasElders) {
        Athenaeum.personae.picker(document.getElementById('pantheon-campaign'), {
            campaigns, value: campaign, allowAll: false,
            onChange: value => { campaign = value; render(); },
        });
    }

    function render() {
        box.innerHTML = store.enumOptions('deityTier').map(tier => {
            const gods = deities.filter(d => Card.tierOf(d) === tier.id);
            if (!gods.length) return '';
            const cards = gods.map(d => store.revealed(d, campaign)
                ? `<li>${Card.card(d, { href: store.url(d) })}</li>`
                : `<li>${Card.sealed()}</li>`).join('');
            return `
            <section class="pantheon-tier pantheon-tier--${esc(tier.id)}" aria-labelledby="tier-${esc(tier.id)}">
                <div class="pantheon-tier__head">
                    <span class="pantheon-tier__rule" aria-hidden="true"></span>
                    <h2 id="tier-${esc(tier.id)}" class="pantheon-tier__title">${esc(tier.label)}</h2>
                    <span class="pantheon-tier__rule" aria-hidden="true"></span>
                </div>
                <ul class="pantheon-tier__cards" role="list">${cards}</ul>
            </section>`;
        }).join('');
    }
    render();
});
