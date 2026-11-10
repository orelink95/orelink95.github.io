/* =====================================================================
   INSTITUTIONS  —  large places with maps, key locations and people
   (a university, a great library…). Shared by poi.html and the dashboard.
   ---------------------------------------------------------------------
   An institution is a POI with an `institution` block (data/schema.js):
       kind     one of the `institutionKind` enum (sets the wording)
       maps     [{ id, name, image: {src, width, height}, note }]
       groups   [{ name, desc, members: [{ npc, title }] }]
   Its key locations are ordinary POIs whose `parent` is the institution.
   Each is pinned on one of the institution's maps: map: { x, y, icon, on }
   where `on` is the id of the map (empty = the first map).

   Load after scripts/core/store.js:
       const I = Athenaeum.institution;
       I.block(poi)              -> the block, or null
       I.kind(store, poi)        -> { id, label, map, places, people, cta }
       I.maps(poi)               -> the maps that have an image
       I.locations(store, poi)   -> the POIs that sit in it
       I.mapOf(poi, location)    -> the map a location is pinned on, or null
       I.people(store, poi)      -> { groups: [{ name, desc, members: [{ npc, title, at }] }],
                                      others: [{ npc, title, at }] }
                                    `at` = the location the NPC lives in, when not the
                                    institution itself. `others` = people whose home is
                                    here or in one of its locations and who are in no group.
   ===================================================================== */
(function (root) {
    const ATH = root.Athenaeum = root.Athenaeum || {};

    const block = poi => (poi && poi.institution && poi.institution.kind ? poi.institution : null);

    function kind(store, poi) {
        const b = block(poi);
        if (!b) return null;
        const options = store.enumOptions('institutionKind');
        const fallback = { label: 'Institution', map: 'Plan of the Grounds', places: 'Places Within', people: 'Who’s Who', cta: 'Visit the place' };
        return { ...fallback, ...(options.find(o => o.id === b.kind) || { id: b.kind }) };
    }

    // Only maps that can be drawn: an id and an image with its size
    const maps = poi => ((block(poi) || {}).maps || [])
        .filter(m => m && m.id && m.image && m.image.src && m.image.width && m.image.height);

    // Any POI can hold others; only an institution has maps to pin them on
    const locations = (store, poi) => store.children(poi, 'poi');

    function mapOf(poi, location) {
        const pin = location && location.map;
        if (!pin || typeof pin.x !== 'number' || typeof pin.y !== 'number') return null;
        const list = maps(poi);
        return pin.on ? (list.find(m => m.id === pin.on) || null) : (list[0] || null);
    }

    function people(store, poi) {
        const b = block(poi) || {};
        // Where someone lives, when it is one of the institution's locations
        const within = new Set(store.descendants(poi, 'poi').map(p => p.id));
        const at = npc => (npc.home && within.has(npc.home) ? store.get(npc.home) : null);

        const grouped = new Set();
        const groups = (b.groups || []).map(g => ({
            name: (g && g.name) || '',
            desc: (g && g.desc) || '',
            members: ((g && g.members) || [])
                .map(m => ({ npc: m && store.get(m.npc), title: m && m.title }))
                .filter(m => m.npc && store.typeOf(m.npc) === 'npc')
                .map(m => { grouped.add(m.npc.id); return { npc: m.npc, title: m.title || m.npc.role || '', at: at(m.npc) }; }),
        })).filter(g => g.members.length);

        const seen = new Set();
        const others = [poi, ...store.descendants(poi, 'poi')]
            .flatMap(p => store.backrefs(p, 'npc', 'home'))
            .filter(npc => !grouped.has(npc.id) && !seen.has(npc.id) && seen.add(npc.id))
            .map(npc => ({ npc, title: npc.role || '', at: at(npc) }));

        return { groups, others };
    }

    ATH.institution = { block, kind, maps, locations, mapOf, people };
})(typeof window !== 'undefined' ? window : globalThis);
