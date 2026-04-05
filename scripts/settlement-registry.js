const settlementRegistry = {
    'brightend': {
        continentName: 'Maltona', continentId: 'continent.html',
        countryName: 'Kingdom of Eperina', countryId: 'country.html?id=eperina',
        settlementName: 'Brightend', descriptor: 'The shining capital of Eperina. A sprawling metropolis divided by wealth, altitude, and ambition.',

        districts: [
            {
                id: 'cloud_district', name: 'Cloud District',
                mapImage: './images/cloud_district_map.png', mapWidth: 1167, mapHeight: 1080,
                lore: {
                    entry: 'District: Alpha', title: 'The Cloud District', body: `<p><span class="float-left text-5xl font-headline text-secondary leading-none pr-2 pt-1">S</span>uspended above the smog, this is where the elite reside. Palaces of white marble and hanging gardens dominate the skyline.</p>`
                },
                npcs: [
                    { id: 'lordwhite', name: 'Derril Sitsk', role: 'Lord White', quote: 'Order is the only thing separating us from the Ash.', image: './images/lord_white.png', homePinTitle: 'The Alabaster Palace' },
                    { id: 'hammer_nim', name: 'Hammer', role: 'Candymaker', quote: '', image: 'images/hammer.jpg', homePinTitle: 'Hammer\'s Candy' },
                    { id: 'maeravoss', name: 'Maera Voss', role: 'Scholar', quote: '', image: 'images/maera_voss.png', homePinTitle: 'Hammer\'s Candy' }
                ],
                pins: [
                    {
                        y: 990, x: 705, icon: 'capital', title: 'The Alabaster Palace', subtitle: 'King\'s Estate', isDanger: false, isFeatured: false, isSafe: false, image: 'images/pois/alabaster_palace.png', body: `<p>The seat of power in Brightend. From here, the King oversees the distribution of resources across the vale.</p>`
                    },
                    {
                        y: 342, x: 119, icon: 'pay-money', title: 'Hammer\'s Candy', subtitle: 'Yummy yummy', isDanger: false, isFeatured: false, isSafe: true, image: 'images/pois/hammer-candy.png',
                        body: `<p>Hammer's famousest candy ! Now 100% crack-free.</p>`
                    }
                ]
            },
            {
                id: 'ash_district', name: 'Ash',
                mapImage: './images/ash_district_map.png', mapWidth: 1149, mapHeight: 1080,
                lore: {
                    entry: 'District: Omega', title: 'The Ash District',
                    body: `<p><span class="float-left text-5xl font-headline text-error leading-none pr-2 pt-1">B</span>eneath the shadow of the industrial forges lies the Ash District. Crime is rampant, and the air is thick with soot.</p>`
                },
                npcs: [
                    { id: 'silas-smug', name: 'Oldebear', role: 'Undercity Leader', quote: 'The Gates check your papers, but the Ash only checks your coin.', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC-irB6beipaKqd88hSv3OI4FRCksQF_7s4eKHKxj4JWJA3qK1LuOgdygfW8oxtHuIVcI-SCe_hYCX69T8voZegbrpFRdsbCDLIldnTc8qzxui0ttJ4mN34Gce5bvAySGypePoPVdAWsJY_Ie7d9slV9VvrUeQx-SnuH5oZfCiHzz080vKa0Aw_Sji8u6MG-f6Y5zatQ5hAhVke82ZolwnQpmsO9ZEOCHMPw3VHcwp61mDBOlOPJPGOb55Eou8SZEv3FpM050AUHLM', homePinTitle: 'The Fighting Pits' }
                ],
                pins: [
                    {
                        y: 500, x: 500, icon: 'skull', title: 'The Fighting Pits', subtitle: 'Danger Zone', isDanger: true, isFeatured: false, isSafe: false, image: 'images/pois/brightend_fightpits.png',
                        body: `<p>Underground arenas where disputes are settled in blood and illegal wagers are the city's true currency.</p>`
                    }
                ]
            },
            {
                id: 'the_docks', name: 'Docks',
                mapImage: './images/placeholder_text.png', mapWidth: 1000, mapHeight: 1000,
                lore: {
                    entry: 'District: Delta', title: 'The Docks', body: `<p>Fish and ships</p>`
                },
                npcs: [
                ],
                pins: [
                ]
            },
            {
                id: 'the_gate', name: 'Gate',
                mapImage: './images/placeholder.png', mapWidth: 1000, mapHeight: 1000,
                lore: {
                    entry: 'District: Gamma', title: 'The Gate', body: `<p>The (once) heavily militarized entrance to the capital.</p>`
                },
                npcs: [
                ],
                pins: [
                ]
            },
            {
                id: 'bazaar', name: 'Bazaar',
                mapImage: './images/placeholder_text.png', mapWidth: 1000, mapHeight: 1000,
                lore: {
                    entry: 'District: Epsilon', title: 'The Grand Bazaar', body: `<p>Home to the great markets.</p>`
                },
                npcs: [
                ],
                pins: [
                ]
            },
            {
                id: 'unnamed_2', name: 'Artisan Row',
                mapImage: './images/placeholder.png', mapWidth: 1000, mapHeight: 1000,
                lore: {
                    entry: 'District: Zeta', title: 'The Artisan Row', body: `<p>Guildhouses and master crafters.</p>`
                },
                npcs: [
                ],
                pins: [
                ]
            }
        ]
    },
    'deercrest': {
        continentName: 'Maltona', continentId: 'continent.html',
        countryName: 'Eperina', countryId: 'country.html?id=eperina',
        settlementName: 'Deercrest', descriptor: '',

        districts: [
            {
                id: 'deercrest', name: 'main',
                mapImage: './images/deercrest_map.png', mapWidth: 1411, mapHeight: 1080,
                lore: {
                    entry: 'Village', title: 'Deercrest', body: `<p>Cute lil town</p>`
                },
                npcs: [
                ],
                pins: [
                    {
                        y: 0, x: 0, icon: 'castle', title: 'Black Rose Inn', subtitle: 'Fresh Water, Warm Beds, Decent Wine... sometimes', isDanger: false, isFeatured: false, isSafe: false, image: '',
                        body: `<p>The coolest and edgiest inn in town.</p>`
                    }
                ]
            }
        ]
    }
};