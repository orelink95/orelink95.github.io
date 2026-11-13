// scripts/vault-scripts.js — the Artifact Vault: loot cards (data/items.json)
//
// A campaign's vault holds the items found in its sessions (session.loot, newest
// session first) and the party's own (campaign.inventory). Items from the newest
// session lie face down until a player turns them over; this browser remembers
// which ones it has turned.

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const grid = document.getElementById('vault-grid');
    const search = document.getElementById('vault-search');
    const picker = document.getElementById('vault-campaign');

    const RARITY_CLASS = Athenaeum.lootCard.rarityClass;
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // --- which cards this browser has already turned over
    const SEEN_KEY = 'athenaeum.vault.revealed';
    const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); } })();
    const markSeen = id => { seen.add(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch (e) { /* private window */ } };

    // --- campaigns with something in the vault
    const sessionsOf = id => store.all('session').filter(s => s.campaign === id);
    function vaultOf(campaign) {
        const sessions = sessionsOf(campaign.id);
        const newest = new Set((sessions[0] && sessions[0].loot) || []);
        const ids = [...new Set([...sessions.flatMap(s => s.loot || []), ...(campaign.inventory || [])])];
        return ids.map(id => store.get(id)).filter(Boolean).map(item => ({ item, isNew: newest.has(item.id) }));
    }
    const campaigns = store.all('campaign').filter(c => vaultOf(c).length);

    // ?item=… opens that card (in its campaign); ?campaign=… picks a campaign
    const params = new URLSearchParams(window.location.search);
    const linkedItem = store.get(params.get('item'));
    const holder = linkedItem && campaigns.find(c => vaultOf(c).some(v => v.item.id === linkedItem.id));
    const wanted = (holder && holder.id) || params.get('campaign') || store.settings.currentCampaign;
    let campaign = campaigns.find(c => c.id === wanted) || campaigns[0];

    if (campaigns.length > 1) {
        picker.innerHTML = campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        picker.value = campaign.id;
        picker.classList.remove('hidden');
        picker.addEventListener('change', () => {
            campaign = campaigns.find(c => c.id === picker.value);
            history.replaceState(null, '', `?campaign=${campaign.id}`);
            render();
        });
    }

    // --- the gallery
    // A card (markup: scripts/loot-card.js); new finds lie face down until turned over
    const cardHtml = ({ item, isNew }) => Athenaeum.lootCard.front(item, { faceDown: isNew && !seen.has(item.id) });

    function render() {
        const q = search.value.trim().toLowerCase();
        const cards = (campaign ? vaultOf(campaign) : []).filter(({ item }) =>
            !q || [item.name, item.type, item.rarity, item.summary].some(t => (t || '').toLowerCase().includes(q)));
        grid.innerHTML = cards.length
            ? cards.map(cardHtml).join('')
            : `<p class="vault-grid__empty">${campaign ? 'Nothing in the vault matches.' : 'The vault is empty.'}</p>`;
    }

    grid.addEventListener('click', e => {
        const card = e.target.closest('.loot-card');
        if (!card) return;
        if (card.classList.contains('is-face-down')) {
            // Turn it over (the flip is a CSS transition); the next click opens it
            card.classList.remove('is-face-down');
            card.setAttribute('aria-label', store.get(card.dataset.id).name);
            markSeen(card.dataset.id);
            return;
        }
        openItem(card.dataset.id);
    });
    search.addEventListener('input', render);

    // --- the opened card
    // Kept on screen when the page is scrolled (see liftOutOfBody, general-scripts.js).
    // The vault's own styles leave the cards unbrightened, in their printed colours.
    const modal = document.getElementById('vault-modal');
    liftOutOfBody(modal);
    function openItem(id) {
        const item = store.get(id);
        if (!item || store.typeOf(item) !== 'item') return;
        markSeen(id);
        const hero = item.attunedBy && store.get(item.attunedBy);
        document.getElementById('sheet').innerHTML = Athenaeum.lootCard.sheet(item, store);
        document.getElementById('sheet-note').textContent = hero ? `Attuned to ${hero.name}` : '';
        // A potion shows its bottle (drawn from the recipe) instead of a picture
        const bottle = Athenaeum.lootCard.potionArt(item, store, {
            uid: 'open', title: item.name, width: 300, height: 390,
            animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        const picture = document.getElementById('sheet-picture');
        picture.classList.toggle('vault-modal__picture--potion', !!bottle);
        picture.innerHTML = bottle ? bottle
            : item.image
            ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">`
            : `<span class="vault-modal__placeholder material-symbols-outlined ${RARITY_CLASS(item.rarity)}">diamond</span>`;
        modal.classList.remove('hidden');
        history.replaceState(null, '', `?item=${id}`);
    }
    window.closeItem = () => {
        modal.classList.add('hidden');
        if (campaign) history.replaceState(null, '', `?campaign=${campaign.id}`);
        render();   // a card opened from a link counts as turned over
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) window.closeItem(); });

    render();
    if (linkedItem && holder) openItem(linkedItem.id);
});
