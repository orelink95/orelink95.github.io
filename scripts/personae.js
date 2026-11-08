/* =====================================================================
   DRAMATIS PERSONAE — the campaign the section shows
   (npc.html, heroes.html, factions.html).
   One choice for the three pages: picked from the drop-down under each
   page title, kept in the address (?campaign=…) and for the browser tab
   (sessionStorage), so moving between the tabs keeps it.
   'all' = every campaign: NPCs and Factions only (Heroes needs one party).
   Who belongs to a campaign: store.inCampaign / store.standing (core/store.js).
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};
    const KEY = 'athenaeum.personae.campaign';
    const ALL = 'all';

    const read = () => { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } };
    const write = v => { try { sessionStorage.setItem(KEY, v); } catch (e) { /* private mode */ } };

    // The section tabs carry the choice too (a link opened in a new tab)
    function linkTabs(value) {
        document.querySelectorAll('.personae-tab').forEach(a => {
            const url = new URL(a.getAttribute('href'), location.href);
            url.searchParams.set('campaign', value);
            a.setAttribute('href', url.pathname.split('/').pop() + url.search);
        });
    }

    /* Which campaign to show: ?campaign=…, else the last one picked in this
       tab, else the current campaign (data/settings.json), else the first.
       campaigns: the ones this page can show. */
    function choose(store, { campaigns = store.all('campaign'), allowAll = true } = {}) {
        const ids = campaigns.map(c => c.id);
        const ok = v => !!v && (ids.includes(v) || (allowAll && v === ALL));
        const asked = new URLSearchParams(location.search).get('campaign');
        const value = [asked, read(), store.settings.currentCampaign, ids[0]].find(ok) || ALL;
        linkTabs(value);
        return value;
    }

    // A new choice: remembered, written in the address, carried by the tabs
    function remember(value) {
        write(value);
        const url = new URL(location.href);
        url.searchParams.set('campaign', value);
        history.replaceState(history.state, '', url.pathname.split('/').pop() + url.search);
        linkTabs(value);
    }

    /* Fills the drop-down (hidden when there is nothing to choose) and calls
       onChange(value) when the reader picks another campaign. */
    function picker(select, { campaigns, value, allowAll = true, onChange }) {
        const options = (allowAll ? [{ id: ALL, name: 'All campaigns' }] : []).concat(campaigns);
        if (options.length < 2) return;
        select.innerHTML = options.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        select.value = value;
        select.classList.remove('hidden');
        select.addEventListener('change', () => {
            remember(select.value);
            onChange(select.value);
        });
    }

    ATH.personae = { ALL, choose, remember, picker };
})(typeof window !== 'undefined' ? window : globalThis);
