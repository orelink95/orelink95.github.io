/* Corrections from the 2 Aug 2026 audit ("Website audit and optimization")
   that never reached main. tools/convert.js applies them once. */
module.exports = {
    /* Audit #5: referenced by the Ash district but missing from almanach.js.
       Data recovered from the deleted almanach2.js. */
    extraNpcs: {
        'silas-smug': {
            name: 'Oldebear',
            role: 'Undercity Leader',
            quote: 'The Gates check your papers, but the Ash only checks your coin.',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC-irB6beipaKqd88hSv3OI4FRCksQF_7s4eKHKxj4JWJA3qK1LuOgdygfW8oxtHuIVcI-SCe_hYCX69T8voZegbrpFRdsbCDLIldnTc8qzxui0ttJ4mN34Gce5bvAySGypePoPVdAWsJY_Ie7d9slV9VvrUeQx-SnuH5oZfCiHzz080vKa0Aw_Sji8u6MG-f6Y5zatQ5hAhVke82ZolwnQpmsO9ZEOCHMPw3VHcwp61mDBOlOPJPGOb55Eou8SZEv3FpM050AUHLM',
            avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC-irB6beipaKqd88hSv3OI4FRCksQF_7s4eKHKxj4JWJA3qK1LuOgdygfW8oxtHuIVcI-SCe_hYCX69T8voZegbrpFRdsbCDLIldnTc8qzxui0ttJ4mN34Gce5bvAySGypePoPVdAWsJY_Ie7d9slV9VvrUeQx-SnuH5oZfCiHzz080vKa0Aw_Sji8u6MG-f6Y5zatQ5hAhVke82ZolwnQpmsO9ZEOCHMPw3VHcwp61mDBOlOPJPGOb55Eou8SZEv3FpM050AUHLM',
            homePinTitle: 'The Fighting Pits',
            settlement: 'Brightend',
            species: 'Dwarf',
            age: '122',
            gender: 'Male',
            affiliation: 'The Blackwater Syndicate',
            relationToParty: 'Ally',
            biography: 'Known to most simply as "Oldebear," Muraed Oldaber is an important figure in the sprawling underground network of Brightend. If you need something moved without the city guard seeing, or a problem made to quietly disappear, you talk to him. <br> Despite his gruff exterior and ruthless business practices in the Fighting Pits, he operates by a strict personal code of honor and has proven to be incredibly loyal to those who earn his trust.',
            secrets: '',
        },
    },

    /* Audit #4: Bereft Hills is wilderness, not a settlement. Its country pin
       becomes a POI of Eperina instead of a broken settlement link. */
    pinAsPoi: ['loc_bereft-hills'],

    /* Decided 1 Nov 2026. */
    npcFactions: { talonoperative: ['thieves-guild'] },      // sephet stays unknown
    npcWhereabouts: { 'The Vale House': 'The Vale House (a pocket dimension)' },
    settings: { tavernCode: '' },
    pinIcons: { 'Harbour Master': 'rook' },                // castle.svg does not exist

    /* Content that was hard-coded in continent.html (Maltona only), copied
       verbatim so continent.html can render any continent from the data. */
    continentPages: {
        maltona: {
            era: 'Year 1466 LF',
            facts: [
                { title: 'Climate & Fauna', text: 'High humidity, perennially overcast with emerald-tinged mists. Home to the elusive Glass-Winged Wyverns and bioluminescent flora.' },
                { title: 'Political Tension', text: 'The death of King Teal of Eperina has destabilized the country, prompting increased Warden presence across the hold and diminishing their number in Brightend.' },
            ],
            notables: ['maeravoss', 'lordwhite'],
            epigraph: 'Maltona is not merely land and sea; it is a memory written in stone and sang by the winds, a story told by the rocks, the trees and the blood that fed the earth. the Spires.',
            epigraphSource: 'Chronicle of the First Era',
        },
    },
    /* The "Nations of Maltona" list in continent.html. */
    countryEpithets: {
        eperina: 'Humanrest',
        lemerolai: 'Protectorate of the Athenaeum',
        'wolf-teeth-emp': 'The Great Dwarven Empire',
        northlands: 'The Septentrional Peninsula',   // its list entry was commented out
    },
    unlistedCountries: ['northlands', 'beliene'],      // on the map, not in the list
    extraCountries: [
        { id: 'kentaresham', name: 'Duchy of Kentaresham', parent: 'maltona', epithet: 'The Somber Realms' },
    ],

    /* Audit #5, for the second pass (campaign files): session npcsMet ids. */
    npcIdRenames: { 'jeff-the-skull': 'jeff-skull' },
};
