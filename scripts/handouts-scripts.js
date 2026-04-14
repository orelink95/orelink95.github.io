document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('handout-grid');
    const searchInput = document.getElementById('handout-search');
    const filtersContainer = document.getElementById('handout-filters');
    const campaignFilter = document.getElementById('filter-campaign');

    let currentCategory = 'All';

    // --- 1. DYNAMIC CATEGORY FILTERS ---
    function renderFilters() {
        // Automatically extract all unique categories from your data!
        const categories = ['All', ...new Set(handoutsData.map(h => h.category))].filter(Boolean).sort();

        filtersContainer.innerHTML = categories.map(cat => {
            const isActive = cat === currentCategory;
            const baseClass = "px-5 py-2 rounded-full text-xs font-label uppercase tracking-widest transition-all duration-300 border cursor-pointer";
            const activeClass = isActive 
                ? "bg-secondary/20 text-secondary border-secondary/50 shadow-[0_0_15px_rgba(233,193,118,0.2)]" 
                : "bg-black/40 text-white/50 border-white/10 hover:text-white hover:border-white/30";
            
            return `<button class="${baseClass} ${activeClass}" onclick="setCategory('${cat}')">${cat}</button>`;
        }).join('');
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
        const campaigns = [...new Set(handouts.map(h => h.campaign).filter(Boolean))].sort();
        
        campaignFilter.innerHTML = `<option value="all">All Campaigns</option>` +
            campaigns.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // --- 2. RENDER THE HANDOUT GRID ---
    function renderGrid(handouts) {
        if (handouts.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-white/40 py-20 italic font-newsreader text-xl">No evidence matches your search.</p>`;
            return;
        }

        grid.innerHTML = handouts.map(handout => `
            <a href="${handout.fileUrl}" target="_blank" rel="noopener noreferrer" 
               class="group relative bg-[#050505] border border-white/10 rounded-xl p-6 shadow-2xl hover:-translate-y-2 hover:border-secondary/60 hover:shadow-[0_0_30px_rgba(233,193,118,0.2)] transition-all duration-500 cursor-pointer overflow-hidden flex flex-col h-full">
                
                <div class="absolute inset-0 bg-gradient-to-b from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                <div class="text-center mb-5 relative z-10 flex flex-col items-center">
                    <h3 class="font-headline text-xl font-bold text-white uppercase tracking-wider group-hover:text-secondary transition-colors drop-shadow-md">${handout.title}</h3>
                    <p class="font-label text-[10px] uppercase tracking-widest text-white/50 mt-1">${handout.category}</p>
                </div>

                <div class="w-full aspect-[4/3] bg-[#0a0b0a] border border-white/10 rounded-md relative mb-8 overflow-hidden shrink-0 shadow-inner group-hover:border-secondary/30 transition-colors">
                    <img src="${handout.thumbnail}" alt="${handout.title}" class="w-full h-full object-cover opacity-80 grayscale-[40%] group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700">
                    
                    <div class="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent pointer-events-none"></div>
                </div>

                <div class="absolute top-[220px] sm:top-[230px] md:top-[200px] lg:top-[210px] xl:top-[230px] 2xl:top-[250px] left-0 right-0 flex justify-center z-20 pointer-events-none">
                    <div class="absolute top-1/2 left-6 right-6 h-px bg-white/10 group-hover:bg-secondary/30 transition-colors"></div>
                    
                    <div class="w-10 h-10 bg-[#0a0b0a] border border-white/20 rounded-md flex items-center justify-center relative z-10 group-hover:border-secondary group-hover:shadow-[0_0_15px_rgba(233,193,118,0.3)] transition-all duration-500">
                        <span class="material-symbols-outlined text-white/50 text-[18px] group-hover:text-secondary transition-colors">${handout.icon}</span>
                    </div>
                </div>

                <div class="relative z-10 flex-grow flex flex-col pt-2">
                    <p class="font-newsreader text-white/70 text-sm leading-relaxed mb-6">${handout.description}</p>
                    
                    <div class="mt-auto pt-4 flex justify-between items-center border-t border-white/5">
                        <span class="text-[8px] font-label uppercase tracking-widest text-white/30 flex items-center gap-1">
                            <span class="material-symbols-outlined text-[10px]">location_on</span> ${handout.locationFound}
                        </span>
                        <span class="text-[9px] font-label uppercase tracking-widest text-secondary opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all duration-500 flex items-center gap-1">
                            Examine <span class="material-symbols-outlined text-[10px]">arrow_forward</span>
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
            const matchSearch = h.title.toLowerCase().includes(query) || 
                                h.description.toLowerCase().includes(query) || 
                                h.locationFound.toLowerCase().includes(query);
            
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