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
                    entry: 'District: Alpha', title: 'The Cloud District', body: `



<p><span class="float-left text-5xl font-headline text-secondary leading-none pr-2 pt-1">S</span>uspended above the smog, this is where the elite reside. Palaces of white marble and hanging gardens dominate the skyline.</p>
                
                
                
                
                
                
                
                
                
                ` },
                npcs: [
                    'lordwhite', 'hammer_nim', 'maeravoss', 'wardenfoll', 'mertonlensher', 'erikthayne'],
                pins: [
                    {
                        y: 990, x: 705, icon: 'capital', title: 'The Alabaster Palace', subtitle: 'King\'s Estate', isDanger: false, isFeatured: false, isSafe: false, image: 'images/pois/alabaster_palace.png', body: `









<p>The seat of power in Brightend. From here, the King oversees the distribution of resources across the vale.</p>
                    
                    
                    
                    
                    
                    
                    
                    
                    
                    ` },
                    {
                        y: 342, x: 119, icon: 'pay-money', title: 'Hammer\'s Candy', subtitle: 'Yummy yummy', isDanger: false, isFeatured: false, isSafe: true, image: 'images/pois/hammer-candy.png', body: `









<p>Hammer's famousest candy ! Now 100% crack-free.</p>
                    
                    
                    
                    
                    
                    
                    
                    
                    
                    ` },
                    {
                        y: 916, x: 800, icon: 'fort', title: 'Warden Fort', aliases: ['Alabaster Warden Barracks'], subtitle: 'Headquarters and barracks', isDanger: false, isFeatured: false, isSafe: false, image: 'images/pois/alabaster_ward.png', body: `









<p>The epicenter of law enforcement and military power in Brightend. The elite military corp is respected through the whole country.</p>
                    
                    
                    
                    
                    
                    
                    
                    
                    
                    ` },
                    {
                        y: 718, x: 424, icon: 'bookshelf', title: 'Oddmoss Librarium', subtitle: 'Ancient tomes and dusty books', isDanger: false, isFeatured: false, isSafe: false, image: '', body: `








<p>One of the finest bookshops in the region, known by scholars for their dedication to procuring old and rare volumes.</p>
                    
                    
                    
                    
                    
                    
                    
                    
                    ` },
                    {
                        y: 533, x: 1018, icon: 'spinning-blades', title: 'Brawn & Brawn Agency', subtitle: 'Nimo and Gust\'s mercenary agency', isDanger: false, isFeatured: false, isSafe: true, image: 'images/pois/bbagency.png', body: `






<p>A small office tucked neatly between two impressive homes in the Cloud District houses the yound mercenary agency. Already hired by the Crown, the agency sees itself becoming a staple of the city. </p>
                    
                    
                    
                    
                    
                    
                    ` },
                    {
                        y: 730, x: 298, icon: 'beer', title: 'Gilded Goldfinch', subtitle: 'The finest drinks and eats the city has to offer', isDanger: false, isFeatured: false, isSafe: false, image: 'images/pois/gilded_goldfinch.png', body: `




<p>The finest inn in the city... or the country, according to owner Merton Lensher.</p>
                    
                    
                    
                    
                    ` },
                    {
                        y: 367, x: 600, icon: 'house', title: 'Thayne Household', subtitle: 'Where the traumatized widower lives.', isDanger: false, isFeatured: false, isSafe: false, image: 'images/pois/thaynehouse.png', body: `


<p>We all know what happened here... it's like zombies were done to the cupboard<p>
                    
                    
                    ` }
                ]
            },
            {
                id: 'ash_district', name: 'Ash',
                mapImage: './images/ash_district_map.png', mapWidth: 1149, mapHeight: 1080,
                lore: {
                    entry: 'District: Omega', title: 'The Ash District', body: `









<p><span class="float-left text-5xl font-headline text-error leading-none pr-2 pt-1">B</span>eneath the shadow of the industrial forges lies the Ash District. Crime is rampant, and the air is thick with soot.</p>
                
                
                
                
                
                
                
                
                
                ` },
                npcs: [
                    'silas-smug'],
                pins: [
                    {
                        y: 500, x: 500, icon: 'danger', title: 'The Fighting Pits', subtitle: 'Danger Zone', isDanger: true, isFeatured: false, isSafe: false, image: 'images/pois/brightend_fightpits.png', body: `









<p>Underground arenas where disputes are settled in blood and illegal wagers are the city's true currency.</p>
                    
                    
                    
                    
                    
                    
                    
                    
                    
                    ` }
                ]
            },
            {
                id: 'the_docks', name: 'Docks',
                mapImage: './images/brightend_docks_map.png', mapWidth: 926, mapHeight: 1080,
                lore: {
                    entry: 'District: Delta', title: 'The Docks', body: `
<p>Fish and ships</p>        
                ` },
                npcs: [
                ],
                pins: [
                    {
                        y: 514, x: 262, icon: 'castle', title: 'Harbour Master', subtitle: '', isDanger: false, isFeatured: false, isSafe: false, image: '', body: `
Where the master habours... or something
                    ` }
                ]
            },
            {
                id: 'the_gate', name: 'Gate',
                mapImage: './images/placeholder.png', mapWidth: 1000, mapHeight: 1000,
                lore: {
                    entry: 'District: Gamma', title: 'The Gate', body: `









<p>The (once) heavily militarized entrance to the capital.</p>
                
                
                
                
                
                ` },
                npcs: [
                ],
                pins: [
                ]
            },
            {
                id: 'bazaar', name: 'Bazaar',
                mapImage: './images/placeholder_text.png', mapWidth: 1000, mapHeight: 1000,
                lore: {
                    entry: 'District: Epsilon', title: 'The Grand Bazaar', body: `









<p>Home to the great markets.</p>
                
                
                
                
                
                
                
                
                
                ` },
                npcs: [
                ],
                pins: [
                ]
            },
            {
                id: 'brightend_artisan', name: 'Artisan Row',
                mapImage: './images/brightend_artisan.png', mapWidth: 862, mapHeight: 1080,
                lore: {
                    entry: 'District: Zeta', title: 'The Artisan Row', body: `

<p>Guildhouses and master crafters.</p>  
                
                ` },
                npcs: [
                ],
                pins: [
                    {
                        y: 777, x: 277, icon: 'pay-money', title: 'Oxana\'s Gems', subtitle: 'Jewelry Emporium', isDanger: false, isFeatured: false, isSafe: false, image: '', body: `

Oxana's Gem stands tall and proud as the oldest jeweler in Brightend. This 4th generation shop is famous through out the city, and even further...
                    
                    ` }
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
                    entry: 'Village', title: 'Deercrest', body: `









<p>Cute lil town</p>
                
                
                
                
                
                
                
                
                
                ` },
                npcs: [
                ],
                pins: [
                    {
                        y: 0, x: 0, icon: 'beer', title: 'Black Rose Inn', subtitle: 'Fresh Water, Warm Beds, Decent Wine... sometimes', isDanger: false, isFeatured: false, isSafe: false, image: '', body: `









<p>The coolest and edgiest inn in town.</p>
                    
                    
                    
                    
                    
                    
                    
                    
                    
                    ` }
                ]
            }
        ]
    }
};