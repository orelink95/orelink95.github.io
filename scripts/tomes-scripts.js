// scripts/tomes-scripts.js

document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById('tome-grid');
    const searchInput = document.getElementById('tome-search');
    const filtersContainer = document.getElementById('tome-filters');
    let currentCategory = 'All';

    // Fixed Tailwind Color Mapping (Prevents JIT Purging)
    const themeMap = {
        secondary: { text: 'text-secondary', bg: 'bg-secondary', border: 'border-secondary', spine: 'border-l-secondary' },
        error: { text: 'text-error', bg: 'bg-error', border: 'border-error', spine: 'border-l-error' },
        void: { text: 'text-void', bg: 'bg-void', border: 'border-void', spine: 'border-l-void' },
        primary: { text: 'text-primary', bg: 'bg-primary', border: 'border-primary', spine: 'border-l-primary' },
        ethereal: { text: 'text-ethereal', bg: 'bg-ethereal', border: 'border-ethereal', spine: 'border-l-ethereal' },
        cyan: { text: 'text-cyan-400', bg: 'bg-cyan-400', border: 'border-cyan-400', spine: 'border-l-cyan-400' }
    };

    function renderFilters() {
        const categories = ['All', ...new Set(tomesData.map(t => t.category))].filter(Boolean).sort();
        filtersContainer.innerHTML = categories.map(cat => {
            const isActive = cat === currentCategory;
            const baseClass = "px-5 py-2 rounded-full text-xs font-label uppercase tracking-widest transition-all duration-300 border cursor-pointer";
            const activeClass = isActive 
                ? "bg-secondary/20 text-secondary border-secondary/50 shadow-[0_0_15px_rgba(233,193,118,0.2)]" 
                : "bg-black/40 text-white/50 border-white/20 hover:text-white hover:border-white/40 hover:bg-black/60";
            return `<button class="${baseClass} ${activeClass}" onclick="setTomeCategory('${cat}')">${cat}</button>`;
        }).join('');
    }

    window.setTomeCategory = (cat) => {
        currentCategory = cat;
        applyFilters();
        renderFilters();
    };

    function renderGrid(tomes) {
        if (tomes.length === 0) {
            grid.innerHTML = `<p class="col-span-full text-center text-white/40 py-20 italic font-newsreader text-xl">No records found.</p>`;
            return;
        }

        grid.innerHTML = tomes.map(tome => {
            const theme = themeMap[tome.themeColor] || themeMap.secondary;
            
            // --- NEW: Smart Title Resizer ---
            let titleSize = "text-3xl"; // Default size
            if (tome.title.length > 35) {
                titleSize = "text-lg"; // Very long titles
            } else if (tome.title.length > 20) {
                titleSize = "text-xl"; // Medium-long titles
            } else if (tome.title.length > 15) {
                titleSize = "text-2xl"; // Slightly long titles
            }
            
            // IF SCROLL
            if (tome.type === 'Scroll') {
                const scrollIcon = tome.icon || 'history_edu';
                const customColorStyle = tome.iconColor ? `color: ${tome.iconColor}; filter: drop-shadow(0 0 8px ${tome.iconColor}80);` : '';
                const iconClass = tome.iconColor ? '' : `${theme.text} drop-shadow-[0_0_8px_currentColor]`;

                return `
                <div onclick="openTomeModal('${tome.id}')" class="group relative bg-[#1a1c1a] border border-white/20 rounded p-6 shadow-[0_15px_40px_rgba(0,0,0,0.8)] hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(233,193,118,0.15)] hover:border-white/40 transition-all duration-500 cursor-pointer overflow-hidden aspect-[2/3] flex flex-col justify-center items-center">
                    
                    <div class="absolute top-1/2 left-0 right-0 h-16 bg-[#121412] border-y border-white/10 -translate-y-1/2 flex items-center justify-center shadow-lg">
                        <div class="w-20 h-20 rounded-full ${theme.bg}/20 border-2 ${theme.border}/60 shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 bg-[#0a0b0a]">
                            <span class="material-symbols-outlined text-3xl transition-colors ${iconClass}" style="${customColorStyle}">${scrollIcon}</span>
                        </div>
                    </div>

                    <div class="absolute top-8 left-0 right-0 text-center px-6">
                        <h3 class="font-headline ${titleSize} font-bold text-white mb-2 group-hover:${theme.text} transition-colors drop-shadow-md leading-tight">${tome.title}</h3>
                        <p class="font-label text-[10px] uppercase tracking-[0.2em] text-white/60">${tome.author}</p>
                    </div>

                    <div class="absolute bottom-8 border-t border-white/10 pt-4 text-center w-full px-6">
                        <span class="inline-block px-4 py-1.5 bg-black/50 border border-white/10 rounded-full text-[9px] font-label uppercase tracking-widest text-white/50">${tome.category}</span>
                    </div>
                </div>`;
            }

            // IF BOOK (IMAGE OR CSS)
            const hasImage = tome.coverImage ? true : false;
            const isCleanCover = tome.cleanCover ? true : false; // Checks for your new flag
            
            let bookHtml = `
            <div onclick="openTomeModal('${tome.id}')" class="group relative bg-[#1a1c1a] border-y border-r border-white/20 rounded-r shadow-[0_15px_40px_rgba(0,0,0,0.8)] hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(233,193,118,0.15)] hover:border-white/40 transition-all duration-500 cursor-pointer overflow-hidden aspect-[2/3] flex flex-col`;

            if (hasImage) {
                bookHtml += ` border-l border-white/20 p-0">
                    <img src="${tome.coverImage}" class="absolute inset-0 w-full h-full object-cover ${isCleanCover ? 'opacity-95' : 'opacity-70'} group-hover:opacity-100 transition-opacity duration-700 z-0">
                    
                    <div class="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/90 to-transparent z-10 pointer-events-none border-l-2 border-white/30"></div>
                    
                    ${isCleanCover ? '' : `<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/60 z-10 pointer-events-none group-hover:bg-black/40 transition-colors"></div>`}
                `;
            } else {
                bookHtml += ` ${theme.spine} border-l-[12px] p-6">
                    <div class="absolute top-5 left-5 right-5 h-px ${theme.bg}/30 pointer-events-none group-hover:${theme.bg}/60 transition-colors"></div>
                    <div class="absolute bottom-5 left-5 right-5 h-px ${theme.bg}/30 pointer-events-none group-hover:${theme.bg}/60 transition-colors"></div>
                    <div class="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/20 pointer-events-none"></div>
                `;
            }

            // Only append the text block if the user DID NOT request a clean cover
            if (!isCleanCover) {
                bookHtml += `
                    <div class="relative z-20 flex flex-col h-full ${hasImage ? 'p-8' : ''}">
                        <p class="font-label text-[10px] uppercase tracking-[0.4em] ${hasImage ? 'text-white/90 drop-shadow-md' : theme.text+'/80'} mb-auto text-center pt-2">${tome.spineText}</p>
                        
                        <div class="text-center flex flex-col items-center mt-auto mb-auto bg-black/40 p-4 rounded-xl backdrop-blur-sm border border-white/5 group-hover:border-white/20 transition-colors">
                            <span class="material-symbols-outlined ${hasImage ? 'text-white/80' : theme.text+'/60'} text-5xl mb-4 group-hover:${theme.text} transition-colors drop-shadow-lg">${hasImage ? 'import_contacts' : 'menu_book'}</span>
                            <h3 class="font-headline ${titleSize} font-bold text-white mb-3 group-hover:${theme.text} transition-colors drop-shadow-lg leading-tight">${tome.title}</h3>
                            <p class="font-label text-[10px] uppercase tracking-[0.3em] text-white/70 drop-shadow-md">By ${tome.author}</p>
                        </div>

                        <div class="mt-auto ${hasImage ? '' : `border-t ${theme.border}/30 pt-3.5 mb-3`} text-center">
                            <span class="inline-block px-4 py-1.5 bg-black/70 backdrop-blur-md border border-white/20 rounded-full text-[9px] font-label uppercase tracking-widest text-white/70 shadow-lg">${tome.category}</span>
                        </div>
                    </div>
                `;
            }

            bookHtml += `</div>`; // Close the main wrapper

            return bookHtml;
        }).join('');
    }

    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const filtered = tomesData.filter(t => {
            const matchSearch = t.title.toLowerCase().includes(query) || t.author.toLowerCase().includes(query);
            const matchCategory = currentCategory === 'All' || t.category === currentCategory;
            return matchSearch && matchCategory;
        });
        renderGrid(filtered);
    }

    searchInput.addEventListener('input', applyFilters);

    window.openTomeModal = (id) => {
        const tome = tomesData.find(t => t.id === id);
        if (!tome) return;
        document.getElementById('modal-tome-type').textContent = `${tome.category} ${tome.type}`;
        document.getElementById('modal-tome-title').textContent = tome.title;
        document.getElementById('modal-tome-author').textContent = `By ${tome.author}`;
        const contentArea = document.getElementById('modal-tome-content');
        contentArea.innerHTML = typeof autoLinkContent === 'function' ? autoLinkContent(tome.content) : tome.content;
        document.getElementById('tome-modal').classList.replace('hidden', 'flex');
    };

    window.closeTomeModal = () => document.getElementById('tome-modal').classList.replace('flex', 'hidden');

    renderFilters();
    renderGrid(tomesData);
});