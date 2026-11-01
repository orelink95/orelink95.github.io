// scripts/tomes-scripts.js — the shelf of tomes (data/tomes.json)

document.addEventListener("DOMContentLoaded", async () => {
    const store = await Athenaeum.ready;
    const tomesData = store.all('tome').filter(t => !t.draft);
    const grid = document.getElementById('tome-grid');
    const searchInput = document.getElementById('tome-search');
    const filtersContainer = document.getElementById('tome-filters');
    let currentCategory = 'All';

    // Tone of a book without a cover, or of a scroll (see .tone-* in pages/tomes.css)
    const TONES = ['secondary', 'primary', 'error', 'void', 'ethereal', 'cyan'];
    const toneOf = tome => `tone-${TONES.includes(tome.tone) ? tome.tone : 'secondary'}`;

    // Long titles get a smaller size
    const titleSize = name => name.length > 35 ? 'tome-title--xs' : name.length > 20 ? 'tome-title--s' : name.length > 15 ? 'tome-title--m' : '';

    function renderFilters() {
        const categories = ['All', ...new Set(tomesData.map(t => t.category))].filter(Boolean).sort();
        filtersContainer.innerHTML = categories.map(cat =>
            `<button class="tome-filter${cat === currentCategory ? ' is-active' : ''}" onclick="setTomeCategory('${cat}')">${cat}</button>`
        ).join('');
    }

    window.setTomeCategory = (cat) => {
        currentCategory = cat;
        applyFilters();
        renderFilters();
    };

    function renderGrid(tomes) {
        if (tomes.length === 0) {
            grid.innerHTML = `<p class="tome-grid__empty">No records found.</p>`;
            return;
        }

        grid.innerHTML = tomes.map(tome => {
            const size = titleSize(tome.name);

            // A scroll: a sealed band across the middle
            if (tome.kind === 'Scroll') {
                const scrollIcon = tome.icon || 'history_edu';
                const customColorStyle = tome.iconColor ? `color: ${tome.iconColor}; filter: drop-shadow(0 0 8px ${tome.iconColor}80);` : '';
                return `
                <div onclick="openTomeModal('${tome.id}')" class="tome-scroll ${toneOf(tome)}">
                    <div class="tome-scroll__band">
                        <div class="tome-scroll__seal">
                            <span class="tome-scroll__icon material-symbols-outlined${tome.iconColor ? '' : ' tome-scroll__icon--tone'}" style="${customColorStyle}">${scrollIcon}</span>
                        </div>
                    </div>

                    <div class="tome-scroll__head">
                        <h3 class="tome-scroll__title ${size}">${tome.name}</h3>
                        <p class="tome-scroll__author">${tome.author || ''}</p>
                    </div>

                    <div class="tome-scroll__foot">
                        <span class="tome-scroll__category">${tome.category || ''}</span>
                    </div>
                </div>`;
            }

            // A book: its cover image, or a coloured binding
            const hasImage = !!tome.cover;
            const isCleanCover = !!tome.cleanCover;   // image only, no title over it

            let bookHtml = `
            <div onclick="openTomeModal('${tome.id}')" class="tome-book ${hasImage ? 'tome-book--cover' : 'tome-book--bound'} ${toneOf(tome)}">`;

            if (hasImage) {
                bookHtml += `
                    <img src="${tome.cover}" class="tome-book__cover${isCleanCover ? ' tome-book__cover--clean' : ''}">
                    <div class="tome-book__spine"></div>
                    ${isCleanCover ? '' : `<div class="tome-book__shade"></div>`}
                `;
            } else {
                bookHtml += `
                    <div class="tome-book__rule tome-book__rule--top"></div>
                    <div class="tome-book__rule tome-book__rule--bottom"></div>
                    <div class="tome-book__sheen"></div>
                `;
            }

            if (!isCleanCover) {
                bookHtml += `
                    <div class="tome-book__content">
                        <p class="tome-book__spine-text">${tome.spineText || ''}</p>

                        <div class="tome-book__plate">
                            <span class="tome-book__icon material-symbols-outlined">${hasImage ? 'import_contacts' : 'menu_book'}</span>
                            <h3 class="tome-book__title ${size}">${tome.name}</h3>
                            <p class="tome-book__author">By ${tome.author || 'an unknown hand'}</p>
                        </div>

                        <div class="tome-book__foot">
                            <span class="tome-book__category">${tome.category || ''}</span>
                        </div>
                    </div>
                `;
            }

            bookHtml += `</div>`;
            return bookHtml;
        }).join('');
    }

    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const filtered = tomesData.filter(t => {
            const matchSearch = t.name.toLowerCase().includes(query) || (t.author || '').toLowerCase().includes(query);
            const matchCategory = currentCategory === 'All' || t.category === currentCategory;
            return matchSearch && matchCategory;
        });
        renderGrid(filtered);
    }

    searchInput.addEventListener('input', applyFilters);

    window.openTomeModal = (id) => {
        const tome = tomesData.find(t => t.id === id);
        if (!tome) return;
        document.getElementById('modal-tome-type').textContent = `${tome.category || ''} ${tome.kind}`;
        document.getElementById('modal-tome-title').textContent = tome.name;
        document.getElementById('modal-tome-author').textContent = `By ${tome.author || 'an unknown hand'}`;
        const contentArea = document.getElementById('modal-tome-content');
        contentArea.innerHTML = store.autolink(store.md(tome.body, { dropCap: tome.kind !== 'Scroll' }), { exclude: tome.id });
        document.getElementById('tome-modal').classList.remove('hidden');
    };

    window.closeTomeModal = () => document.getElementById('tome-modal').classList.add('hidden');

    renderFilters();
    renderGrid(tomesData);

    // tomes.html?id=… opens that tome
    const linked = new URLSearchParams(window.location.search).get('id');
    if (linked) window.openTomeModal(linked);
});