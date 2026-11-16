/* =====================================================================
   PREVIEW — the card that opens over a name the store turned into a link
   (store.autolink: every link it makes carries data-kw="<record id>").
   ---------------------------------------------------------------------
   Loaded by scripts/general-scripts.js on every page that loads the store;
   styles: styles/preview.css.
   - Mouse: hover a name for a moment and its card opens under it (above it
     near the bottom of the screen). The card stays while the pointer is on
     it; Esc, scrolling or leaving closes it. Clicking the name still opens
     its page.
   - Keyboard: Tab onto a name opens its card at once.
   - Touch: a tap on a name opens the card as a sheet at the bottom of the
     screen, with an "Open page" button; a tap outside or Close shuts it.
   One card per kind of record: people, factions, places (continent to POI),
   creatures, items, spells, gods, glossary terms and handouts (the Scriptorium
   links those itself, with data-kw too; their card opens the handout's file). Cards show only public
   fields (never secrets) and follow the campaign being viewed
   (store.viewCampaign): an NPC's relation and a faction's standing there.
   They hold no links of their own, so a card never opens another.
   A glossary term has no page. A page can give it an action, shown on its
   card (and as the sheet's button on phones), before or after this file loads:
       Athenaeum.loreAction = { label: 'Search the Chronicle', run: id => … };
   ===================================================================== */
(function () {
    const ATH = window.Athenaeum = window.Athenaeum || {};
    if (ATH.preview) return;

    const OPEN_DELAY = 220;     // ms of hovering before a card opens
    const SWITCH_DELAY = 60;    // … when another card is already open
    const CLOSE_DELAY = 180;    // ms after the pointer leaves
    const GAP = 8;              // px between the name and its card

    let store = null;
    let pop = null, sheet = null;           // the hover card, the touch sheet
    let anchor = null, shownId = null;      // the link the card belongs to
    let openTimer = 0, closeTimer = 0;
    let lastPointer = 'mouse';      // the last input: 'mouse', 'pen', 'touch' or 'keyboard'
    let sheetOpener = null;

    const preview = ATH.preview = { card, close: closeAll };
    const loreAction = () => ATH.loreAction || null;

    /* ---------- helpers ---------- */
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const plain = t => (store && store.plain ? store.plain(t || '') : (t || '')).trim();
    const label = (enumName, id) => {
        const o = store.enumOptions(enumName).find(x => x.id === id);
        return o ? o.label : id;
    };
    const nameOf = id => { const r = store.get(id); return r ? r.name : ''; };
    const src = path => (!path || /^([a-z]+:|\/)/i.test(path) ? path : (ATH.base || '') + path);
    // "???" placeholders say nothing
    const known = s => !!s && /\p{L}/u.test(String(s));
    const tone = s => String(s || '').toLowerCase().replace(/\s*\(.*\)/, '').replace(/[^a-z]+/g, '-');

    const PLACE_TYPES = { continent: 'Continent', country: 'Country', settlement: 'Settlement', district: 'District', poi: 'Place' };
    const KIND = { npc: 'person', faction: 'faction', creature: 'monster', item: 'object', spell: 'spell', deity: 'deity', handout: 'object', plane: 'plane' };
    const kindOf = (type, rec) => (type === 'lore' ? (rec.kind || 'lore')
        : type === 'planePart' ? (rec._part.part === 'place' ? 'place' : rec._part.item.divine ? 'deity' : 'person')
        : KIND[type] || 'place');
    // An NPC's relation -> the tone of its badge
    const RELATION_TONE = { ally: 'ally', neutral: 'neutral', displeased: 'wary', hostile: 'hostile', enemy: 'hostile', killed: 'killed', unknown: 'unknown', allied: 'ally' };
    // Faction threat levels -> the creature threat tones of components.css (.threat--*)
    const FACTION_THREAT = { low: 'low', moderate: 'moderate', severe: 'high', omega: 'lethal' };
    const CREATURE_THREAT = { lethal: 'lethal', high: 'high', moderate: 'moderate', low: 'low', harmless: 'low', friendly: 'friendly' };

    const chip = (text, cls = '') => `<span class="pv-chip ${cls}">${esc(text)}</span>`;
    const threatChip = (level, toneId) => toneId
        ? `<span class="pv-chip pv-chip--threat threat--${toneId}">Threat · ${esc(level)}</span>` : '';

    /* The campaign row: an NPC's relation or a faction's standing in the
       campaign being viewed. None when the reader views every campaign, or
       the record is not part of this one. */
    function campaignRow(rec) {
        const cid = store.viewCampaign();
        if (!cid || cid === 'all' || !store.inCampaign(rec, cid)) return '';
        const value = store.standing(rec, cid);
        if (!value || value === 'Unknown') return '';
        const campaign = store.get(cid);
        return `<div class="pv-camp">
                <span class="pv-camp__name">${esc(campaign ? campaign.name : cid)}</span>
                <span class="pv-camp__value pv-rel--${RELATION_TONE[tone(value)] || 'neutral'}">${esc(value)}</span>
            </div>`;
    }

    // What a POI offers, from its blocks
    function offers(poi) {
        const out = [];
        if (poi.institution) out.push(label('institutionKind', poi.institution.kind));
        if (poi.tavern) out.push('Tavern');
        if (poi.tavern && (poi.tavern.games || []).length) out.push('Gaming table');
        if (poi.shop) out.push(label('shopKind', poi.shop.kind) || 'Shop');
        if (poi.temple) out.push('Temple');
        if (poi.alchemist) out.push('Alchemist’s bench');
        if (poi.divination) out.push('Seer');
        return out.filter(Boolean);
    }

    /* ---------- one record -> its card (HTML) ----------
       Every card: a head (picture banner, or thumbnail + titles), then the
       summary, quote, chips and campaign row it has, then a foot with where
       it belongs and the way to its page. */
    function card(id, { sheet: asSheet = false } = {}) {
        // A plane's own place or resident (not a record: see store.planePart)
        const part = !store.get(id) && store.planePart ? store.planePart(id) : null;
        const rec = part ? { id, name: part.name, _part: part } : store.get(id);
        if (!rec) return '';
        const type = part ? 'planePart' : store.typeOf(rec);
        const kind = kindOf(type, rec);
        const v = {
            layout: 'text', image: '', focus: '', zoom: 0, thumb: '', kicker: '', sub: '',
            summary: '', quote: '', chips: [], camp: '', foot: '', stats: null, mark: '', extraClass: '',
        };

        if (type === 'npc') {
            Object.assign(v, {
                layout: 'media', image: rec.avatar || rec.portrait, thumb: 'round', kicker: 'Person',
                sub: rec.role, summary: rec.summary, quote: rec.quote, camp: campaignRow(rec),
            });
            if (known(rec.species)) v.chips.push(chip(rec.species));
            const age = String(rec.age ?? '').trim();
            if (/[\p{L}\p{N}]/u.test(age)) v.chips.push(chip(/^\d+$/.test(age) ? `Age ${age}` : age));
            (rec.factions || []).map(nameOf).filter(Boolean).forEach(n => v.chips.push(chip(n)));
            if (rec.home && nameOf(rec.home)) v.foot = `Home · ${nameOf(rec.home)}`;
        } else if (type === 'faction') {
            Object.assign(v, {
                layout: 'media', image: rec.crest, thumb: 'square', kicker: 'Faction',
                sub: [rec.scale, rec.mo].filter(known).join(' · '), summary: rec.summary,
                quote: known(rec.quote) ? rec.quote : '', camp: campaignRow(rec),
                foot: known(rec.base) ? `Base · ${rec.base}` : '',
            });
            if (rec.threatLevel) v.chips.push(threatChip(rec.threatLevel, FACTION_THREAT[tone(rec.threatLevel)]));
            if (known(rec.reputationText)) v.chips.push(chip(`Reputation · ${rec.reputationText}`));
        } else if (PLACE_TYPES[type]) {
            const what = rec.typeLabel || (type === 'poi' ? '' : PLACE_TYPES[type]);
            Object.assign(v, {
                layout: rec.image ? 'banner' : 'text', image: rec.image,
                kicker: what ? `Place · ${what}` : 'Place',
                sub: rec.subtitle || rec.epithet || '', summary: rec.summary,
                foot: store.ancestors(rec).map(p => p.shortName || p.name).join(' › '),
            });
            if (type === 'poi') offers(rec).forEach(o => v.chips.push(chip(o, 'pv-chip--offer')));
            if (rec.danger) v.chips.push(chip('Danger', 'pv-chip--danger'));
            if (rec.safe) v.chips.push(chip('Safe haven', 'pv-chip--safe'));
        } else if (type === 'creature') {
            Object.assign(v, {
                layout: rec.image ? 'banner' : 'text', image: rec.image, focus: rec.imageFocus, zoom: rec.imageZoom,
                kicker: 'Creature' + (known(rec.arcana) ? ` · ${rec.arcana}` : ''),
                sub: [rec.phylogeny, rec.realm].filter(known).join(' · '), summary: rec.shortDesc,
                foot: 'Bestiary' + (rec.specimenNo ? ` · Specimen ${rec.specimenNo}` : ''),
            });
            if (rec.threat) v.chips.push(threatChip(rec.threat, CREATURE_THREAT[tone(rec.threat)]));
            (rec.habitats || []).slice(0, 3).forEach(h => v.chips.push(chip(h)));
        } else if (type === 'item') {
            Object.assign(v, {
                layout: rec.image ? 'media' : 'text', image: rec.image, thumb: 'square',
                kicker: 'Item' + (known(rec.rarity) ? ` · ${rec.rarity}` : ''),
                sub: [rec.type, rec.attunement ? 'Requires attunement' : ''].filter(known).join(' · '),
                summary: rec.summary, foot: 'The Vault',
            });
        } else if (type === 'spell') {
            const lvl = Number(rec.level) || 0;
            Object.assign(v, {
                layout: 'spell', mark: lvl ? String(lvl) : 'C', kicker: 'Spell',
                sub: `${lvl ? `Level ${lvl}` : 'Cantrip'} · ${rec.school || ''}`, summary: rec.summary || rec.body,
                stats: [['Casting', rec.castingTime], ['Range', rec.range], ['Duration', rec.duration]],
                foot: 'Book of Shadows', extraClass: `pv--school-${tone(rec.school)}`,
            });
            ['verbal:V', 'somatic:S', 'material:M'].forEach(p => { const [f, l] = p.split(':'); if (rec[f]) v.chips.push(chip(l)); });
            if (rec.concentration) v.chips.push(chip('Concentration', 'pv-chip--offer'));
            if (rec.ritual) v.chips.push(chip('Ritual', 'pv-chip--offer'));
        } else if (type === 'deity') {
            Object.assign(v, {
                layout: 'media', image: rec.symbol || rec.portrait, thumb: rec.symbol ? 'medallion' : 'round',
                kicker: 'Deity · ' + label('deityTier', rec.tier), sub: rec.epithet, summary: rec.summary,
                foot: known(rec.worshippers) ? rec.worshippers : '',
            });
            (rec.domains || []).slice(0, 6).forEach(d => v.chips.push(chip(d)));
        } else if (type === 'handout') {
            Object.assign(v, {
                layout: rec.thumbnail ? 'banner' : 'text', image: rec.thumbnail, focus: '50% 20%',
                kicker: 'Handout' + (known(rec.category) ? ` · ${rec.category}` : ''),
                summary: rec.description,
                foot: known(rec.foundAt) ? `Found at ${rec.foundAt}` : '',
            });
            if (rec.campaign && nameOf(rec.campaign)) v.chips.push(chip(nameOf(rec.campaign)));
        } else if (type === 'plane') {
            Object.assign(v, {
                kicker: rec.kind === 'demiplane' ? 'Demiplane' : 'Plane of existence', sub: rec.epithet, summary: rec.summary,
                foot: 'The Planes of Existence',
            });
        } else if (part) {
            const it = part.item;
            if (part.part === 'resident') {
                Object.assign(v, {
                    layout: 'media', image: it.portrait, thumb: 'round', kicker: it.divine ? 'Deity' : 'Resident',
                    sub: it.title, summary: it.summary, foot: [part.plane.name, part.group && part.group.name].filter(known).join(' · '),
                });
            } else {
                Object.assign(v, {
                    layout: it.image ? 'banner' : 'text', image: it.image, kicker: 'Place', summary: it.summary,
                    foot: part.plane.name,
                });
            }
        } else if (type === 'lore') {
            Object.assign(v, {
                kicker: 'Glossary · ' + label('loreKind', rec.kind || 'lore'), summary: rec.definition,
            });
        } else {
            return '';
        }

        const page = pageOf(rec);
        const lore = type === 'lore' && loreAction();
        const action = page ? `<a class="pv-foot__open" href="${esc(page.href)}"${page.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''} tabindex="-1">${page.newTab ? 'Open the handout ↗' : 'Open page →'}</a>`
            : lore ? `<span class="pv-foot__open">${esc(lore.label)}</span>` : '';

        const titles = `<div class="pv-titles">
                <div class="pv-kicker">${esc(v.kicker)}</div>
                <div class="pv-name">${esc(rec.name)}</div>
                ${known(v.sub) && v.layout !== 'banner' ? `<div class="pv-sub">${esc(v.sub)}</div>` : ''}
            </div>`;
        let head = '';
        if (v.layout === 'banner') {
            const style = [v.focus ? `object-position:${esc(v.focus)}` : '', v.zoom ? `transform:scale(${Number(v.zoom) / 100})` : '',
                v.focus && v.zoom ? `transform-origin:${esc(v.focus)}` : ''].filter(Boolean).join(';');
            head = `<div class="pv-banner">
                    <img class="pv-banner__img" src="${esc(src(v.image))}" alt="" loading="lazy" style="${style}" onerror="this.parentNode.classList.add('is-empty'); this.remove()">
                    ${titles}
                </div>
                ${known(v.sub) ? `<div class="pv-sub pv-sub--under">${esc(v.sub)}</div>` : ''}`;
        } else if (v.layout === 'media') {
            // No picture, or one that fails to load: the initials instead
            const letters = `<span class="pv-thumb pv-thumb--initials" aria-hidden="true">${esc(initials(rec.name))}</span>`;
            const thumb = v.image
                ? `<img class="pv-thumb pv-thumb--${v.thumb}" src="${esc(src(v.image))}" alt="" loading="lazy"${rec.colour ? ` style="--glow:${esc(rec.colour)}"` : ''} onerror="this.outerHTML = this.nextElementSibling.innerHTML"><template>${letters}</template>`
                : letters;
            head = `<div class="pv-head">${thumb}${titles}</div>`;
        } else if (v.layout === 'spell') {
            head = `<div class="pv-head pv-head--spell"><span class="pv-level" aria-hidden="true">${esc(v.mark)}</span>${titles}</div>
                <div class="pv-stats">${v.stats.filter(s => known(s[1])).map(([l, val]) =>
                    `<div class="pv-stat"><span class="pv-stat__label">${l}</span><span class="pv-stat__value">${esc(val)}</span></div>`).join('')}</div>`;
        } else {
            head = `<div class="pv-head pv-head--text">${titles}</div>`;
        }

        const summary = plain(v.summary);
        const body = [
            known(summary) ? `<p class="pv-summary">${esc(summary)}</p>` : '',
            known(v.quote) ? `<p class="pv-quote">${esc(plain(v.quote))}</p>` : '',
            v.chips.filter(Boolean).length ? `<div class="pv-chips">${v.chips.join('')}</div>` : '',
            v.camp,
        ].filter(Boolean).join('');

        const foot = !asSheet && (v.foot || action)
            ? `<div class="pv-foot"><span class="pv-foot__where">${esc(v.foot)}</span>${action}</div>` : '';

        return `<div class="pv pv--${kind} ${v.extraClass}${asSheet ? ' pv--sheet' : ''}">
                ${head}
                ${body ? `<div class="pv-body">${body}</div>` : ''}
                ${foot}
            </div>`;
    }

    // Where a card leads: the record's page, or a handout's file (in a new tab)
    function pageOf(rec) {
        if (rec && rec._part) { const href = store.partUrl(rec._part); return href ? { href, newTab: false } : null; }
        if (store.typeOf(rec) === 'handout') return rec.file ? { href: src(rec.file), newTab: true } : null;
        const href = store.url(rec);
        return href ? { href, newTab: false } : null;
    }

    // "The Alabaster Wardens" -> "AW"
    function initials(name) {
        const words = String(name || '').split(/\s+/).filter(w => w && !/^(the|of|and|de|la|le)$/i.test(w));
        return words.slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    }

    /* Inside an open modal <dialog> (a session's folio, a card reading), the rest of
       the page is inert and drawn under the dialog: the card goes inside the dialog
       instead, so it shows on top and can be used. Back in <body> otherwise. */
    function attach(el, link) {
        const host = (link && link.closest && link.closest('dialog[open]')) || document.body;
        if (el.parentNode !== host) host.appendChild(el);
    }

    /* ---------- the hover card ---------- */
    function ensurePop() {
        if (pop) return pop;
        pop = document.createElement('div');
        pop.className = 'pv-pop';
        pop.setAttribute('role', 'tooltip');
        pop.id = 'pv-pop';
        pop.hidden = true;
        document.body.appendChild(pop);
        if (typeof liftOutOfBody === 'function') liftOutOfBody(pop);
        pop.addEventListener('mouseenter', () => clearTimeout(closeTimer));
        pop.addEventListener('mouseleave', scheduleClose);
        return pop;
    }

    function openPop(link) {
        const id = link.dataset.kw;
        const html = card(id);
        if (!html) return;
        const el = ensurePop();
        if (shownId !== id || anchor !== link) {
            el.innerHTML = html;
            shownId = id;
        }
        if (anchor && anchor !== link) anchor.removeAttribute('aria-describedby');
        anchor = link;
        link.setAttribute('aria-describedby', 'pv-pop');
        attach(el, link);
        el.hidden = false;
        el.classList.remove('is-shown');
        place(link, el);
        requestAnimationFrame(() => el.classList.add('is-shown'));
    }

    // Under the name, or above it when there is no room below; kept on screen
    function place(link, el) {
        const rects = link.getClientRects();
        const r = rects.length ? rects[0] : link.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight;
        const vw = document.documentElement.clientWidth, vh = window.innerHeight;
        let top = r.bottom + GAP;
        const above = top + h > vh - GAP && r.top - GAP - h > GAP;
        if (above) top = r.top - GAP - h;
        const left = Math.max(GAP, Math.min(r.left, vw - w - GAP));
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(Math.max(GAP, top))}px`;
        el.classList.toggle('is-above', above);
    }

    function closePop() {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        if (anchor) anchor.removeAttribute('aria-describedby');
        anchor = null;
        if (pop) { pop.hidden = true; pop.classList.remove('is-shown'); }
    }

    function scheduleOpen(link) {
        clearTimeout(closeTimer);
        clearTimeout(openTimer);
        if (anchor === link && pop && !pop.hidden) return;
        const wait = pop && !pop.hidden ? SWITCH_DELAY : OPEN_DELAY;
        openTimer = setTimeout(() => openPop(link), wait);
    }

    function scheduleClose() {
        clearTimeout(openTimer);
        clearTimeout(closeTimer);
        closeTimer = setTimeout(closePop, CLOSE_DELAY);
    }

    /* ---------- the touch sheet ---------- */
    function ensureSheet() {
        if (sheet) return sheet;
        sheet = document.createElement('div');
        sheet.className = 'pv-sheet';
        sheet.hidden = true;
        sheet.innerHTML = `
            <button type="button" class="pv-sheet__backdrop" data-pv-close aria-label="Close the preview"></button>
            <div class="pv-sheet__panel" role="dialog" aria-modal="true" aria-label="Preview" tabindex="-1">
                <span class="pv-sheet__handle" aria-hidden="true"></span>
                <div class="pv-sheet__card"></div>
                <div class="pv-sheet__actions"></div>
            </div>`;
        document.body.appendChild(sheet);
        if (typeof liftOutOfBody === 'function') liftOutOfBody(sheet);
        sheet.addEventListener('click', e => {
            if (e.target.closest('[data-pv-close]')) closeSheet();
            const act = e.target.closest('[data-pv-lore]');
            if (act && loreAction()) {
                const id = act.dataset.pvLore;
                closeSheet();
                loreAction().run(id);
            }
        });
        return sheet;
    }

    function openSheet(link) {
        const id = link.dataset.kw;
        const html = card(id, { sheet: true });
        if (!html) return false;
        const el = ensureSheet();
        const part = !store.get(id) && store.planePart ? store.planePart(id) : null;
        const rec = part ? { id, name: part.name, _part: part } : store.get(id);
        const page = pageOf(rec);
        const lore = store.typeOf(rec) === 'lore' && loreAction();
        el.querySelector('.pv-sheet__card').innerHTML = html;
        el.querySelector('.pv-sheet__actions').innerHTML = (page
            ? `<a class="pv-sheet__open" href="${esc(page.href)}"${page.newTab ? ' target="_blank" rel="noopener noreferrer" data-pv-close' : ''}>${openLabel(store.typeOf(rec))}</a>`
            : lore ? `<button type="button" class="pv-sheet__open" data-pv-lore="${esc(id)}">${esc(lore.label)}</button>` : '')
            + `<button type="button" class="pv-sheet__close" data-pv-close>Close</button>`;
        sheetOpener = link;
        attach(el, link);
        el.hidden = false;
        document.documentElement.classList.add('pv-locked');
        requestAnimationFrame(() => el.classList.add('is-open'));
        el.querySelector('.pv-sheet__panel').focus({ preventScroll: true });
        return true;
    }
    const openLabel = type => ({ item: 'Open in the Vault', spell: 'Open in the Book of Shadows', handout: 'Open the handout' }[type] || 'Open page');

    function closeSheet() {
        if (!sheet || sheet.hidden) return;
        sheet.classList.remove('is-open');
        sheet.hidden = true;
        document.documentElement.classList.remove('pv-locked');
        if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
        sheetOpener = null;
    }

    function closeAll() { closePop(); closeSheet(); }

    /* ---------- wiring (delegated: works for names added at any time) ---------- */
    const linkOf = t => (t && t.closest ? t.closest('[data-kw]') : null);
    const inCard = t => (pop && pop.contains(t)) || (sheet && sheet.contains(t));

    function wire() {
        // The last way the reader used: 'mouse', 'pen', 'touch' or 'keyboard'
        document.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, true);
        document.addEventListener('keydown', () => { lastPointer = 'keyboard'; }, true);

        document.addEventListener('pointerover', e => {
            if (e.pointerType === 'touch') return;
            const link = linkOf(e.target);
            if (link && !inCard(link)) scheduleOpen(link);
        });
        document.addEventListener('pointerout', e => {
            if (e.pointerType === 'touch') return;
            const link = linkOf(e.target);
            if (!link) return;
            const to = e.relatedTarget;
            if (to && (link.contains(to) || (pop && pop.contains(to)))) return;
            scheduleClose();
        });

        // Keyboard: Tab onto a name
        document.addEventListener('focusin', e => {
            const link = linkOf(e.target);
            if (!link || inCard(link) || lastPointer !== 'keyboard') return;
            clearTimeout(openTimer);
            clearTimeout(closeTimer);
            openPop(link);
        });
        document.addEventListener('focusout', e => { if (linkOf(e.target) === anchor) scheduleClose(); });

        // Touch: a tap opens the sheet instead of the page (capture: before the
        // page's own handlers, such as a session card opening its folio)
        document.addEventListener('click', e => {
            if (lastPointer !== 'touch') return;
            const link = linkOf(e.target);
            if (!link || inCard(link)) return;
            if (!openSheet(link)) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
        window.addEventListener('scroll', closePop, { passive: true, capture: true });
        window.addEventListener('resize', closeAll);
        window.addEventListener('pagehide', closeAll);
    }

    if (ATH.ready) {
        ATH.ready.then(s => { store = s; wire(); })
            .catch(err => console.error('[Athenaeum] preview:', err));
    }
})();
