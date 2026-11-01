// scripts/handouts-scripts.js — the evidence locker (data/handouts.json)
document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const handoutsData = store.all('handout').filter(h => !h.draft);
    const campaignName = id => (store.get(id) || {}).name || id;
    const grid = document.getElementById('handout-grid');
    const searchInput = document.getElementById('handout-search');
    const filtersContainer = document.getElementById('handout-filters');
    const campaignFilter = document.getElementById('filter-campaign');

    let currentCategory = 'All';

    // --- 1. DYNAMIC CATEGORY FILTERS ---
    function renderFilters() {
        // Automatically extract all unique categories from your data!
        const categories = ['All', ...new Set(handoutsData.map(h => h.category))].filter(Boolean).sort();

        // The chosen category is marked .is-active (see pages/handouts.css)
        filtersContainer.innerHTML = categories.map(cat =>
            `<button class="handout-filter${cat === currentCategory ? ' is-active' : ''}" onclick="setCategory('${cat}')">${cat}</button>`
        ).join('');
    }

    // Expose the filter function to the window so the inline HTML buttons can use it
    window.setCategory = (cat) => {
        currentCategory = cat;
        applyFilters();
        renderFilters(); // Re-render to update the glowing active state
    };

    // to populate the campaign filter dropdown
    function populateCampaignFilter(handouts) {
        if (!campaignFilter) return;
        const campaigns = [...new Set(handouts.map(h => h.campaign).filter(Boolean))]
            .sort((a, b) => campaignName(a).localeCompare(campaignName(b)));
        
        campaignFilter.innerHTML = `<option value="all">All Campaigns</option>` +
            campaigns.map(c => `<option value="${c}">${campaignName(c)}</option>`).join('');
    }

    // --- 2. RENDER THE HANDOUT GRID ---
    function renderGrid(handouts) {
        if (handouts.length === 0) {
            grid.innerHTML = `<p class="handout-grid__empty">No evidence matches your search.</p>`;
            return;
        }

        grid.innerHTML = handouts.map(handout => `
            <a href="${handout.file || '#'}" target="_blank" rel="noopener noreferrer" 
               class="handout-card">
                
                <div class="handout-card__glow"></div>

                <div class="handout-card__head">
                    <h3 class="handout-card__title">${handout.name}</h3>
                    <p class="handout-card__category">${handout.category || ''}</p>
                </div>

                <div class="handout-card__frame">
                    <img src="${handout.thumbnail}" alt="${handout.name}" class="handout-card__image">
                    
                    <div class="handout-card__fade"></div>
                </div>

                <div class="handout-card__seal-row">
                    <div class="handout-card__seal-line"></div>
                    
                    <div class="handout-card__seal">
                        <span class="handout-card__seal-icon material-symbols-outlined">${handout.icon || 'description'}</span>
                    </div>
                </div>

                <div class="handout-card__body">
                    <p class="handout-card__text">${handout.description || ''}</p>
                    
                    <div class="handout-card__foot">
                        <span class="handout-card__place">
                            <span class="handout-card__small-icon material-symbols-outlined">location_on</span> ${handout.foundAt || ''}
                        </span>
                        <span class="handout-card__cta">
                            Examine <span class="handout-card__small-icon material-symbols-outlined">arrow_forward</span>
                        </span>
                    </div>
                </div>
            </a>
        `).join('');
    }

    // --- 3. FILTER & SEARCH LOGIC ---
    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const selectedCampaign = campaignFilter ? campaignFilter.value : "all"; // Grab the dropdown value

        const filtered = handoutsData.filter(h => {
            const matchSearch = [h.name, h.description, h.foundAt].some(t => (t || '').toLowerCase().includes(query));
            
            const matchCategory = currentCategory === 'All' || h.category === currentCategory;
            
            // Check if the handout matches the selected campaign
            const matchCampaign = selectedCampaign === 'all' || h.campaign === selectedCampaign;
            
            return matchSearch && matchCategory && matchCampaign; // Ensure all three match!
        });

        renderGrid(filtered);
    }

    // Event Listeners
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    // Listen for changes on the campaign dropdown
    if (campaignFilter) {
        campaignFilter.addEventListener('change', applyFilters);
    }

    // Initialize
    renderFilters();
    populateCampaignFilter(handoutsData); // Pass the handouts data, not Scriptorium!
    renderGrid(handoutsData);
});