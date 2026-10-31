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

    /* Audit #5, for the second pass (campaign files): session npcsMet ids. */
    npcIdRenames: { 'jeff-the-skull': 'jeff-skull' },
};
