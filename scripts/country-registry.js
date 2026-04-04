const countryRegistry = {
    'eperina': {
        continentName: 'Maltona',
        continentId: 'continent.html',
        regionName: 'Kingdom of Eperina',
        description: 'Built by the survivors of the Ophrasian War, Eperina is the beacon of hope that lights the East of the Vale.',
        mapImage: './images/eperina_map.png',
        mapWidth: 1920,
        mapHeight: 1080,

        defaultLore: {
            entry: 'Codex Entry: 01.E',
            title: 'The Kingdom of Eperina',
            body: `



                <p><span class="float-left text-6xl font-headline text-secondary leading-none pr-3 pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]">B</span>uilt upon the ruins of the old world, Eperina stands as a testament to mortal resilience in the face of ancient terrors.</p>
                <p>Its grand libraries and enchanted fortifications attract scholars, mercenaries, and those fleeing the shadow of the western mountains.</p>
                <div class="relative my-8 pl-6 border-l-2 border-primary/30">
                    <span class="material-symbols-outlined absolute -left-3 -top-3 text-primary/20 text-4xl bg-surface-container-low" style="font-variation-settings: 'FILL' 1;">format_quote</span>
                    <p class="italic text-on-surface/80 relative z-10">
                        "The stone of Eperina does not crumble; it paves the way for tomorrow."
                    </p>
                    <span class="block text-[10px] font-label uppercase tracking-widest text-primary mt-3">— High Archivist Kaelen</span>
                </div>
            
            
            
            
            
            
            `
        },

        pins: [
            {
                y: 619, x: 534, icon: 'settlement', isDanger: false,
                linkId: 'deercrest',
                title: 'Deercrest', subtitle: 'Small Town',
                entry: 'Codex Entry: 14.G',
                body: `



<p>At first a hunter's outpost, Deercrest became the renowned town it is now after decades of steady and laborious growth. At the western border of Eperina, Deercrest is a necessary stop for those who enter the Kingdom through the woods.</p>
                
                
                
                
                
                `
            },
            {
                y: 835, x: 1074, icon: 'danger', isDanger: true,
                linkId: 'loc_bereft-hills',
                title: 'Bereft Hills', subtitle: 'Wilderness',
                entry: 'Codex Entry: 99.X',
                body: `





<p><span class="float-left text-6xl font-headline text-error leading-none pr-3 pt-2 drop-shadow-[0_0_10px_rgba(255,180,171,0.3)]">T</span> he bereft hill are shunned by locals for a good reason. Strange things wander these parts, the walls of Modbury seem too frail hold the flood of nightmares from the region. </p>
                
                
                
                
                
                `
            },
            {
                y: 698, x: 1454, icon: 'capital', isDanger: false,
                linkId: 'brightend',
                title: 'Brightend', subtitle: 'Capital of Eperina',
                entry: 'Codex Entry: 17.B',
                body: `




<p>Brightend, the Beacon of Men, was founded by Amycia Eperina, after the Ophrasian War in order to protect the remaining humans from the nothern provinces who had not been massacred during the conflict. It became a safe haven for the oppressed.</p>
                
                
                
                
                `
            }
        ]
    },
    'lemerolai': {
        continentName: 'Maltona',
        continentId: 'continent.html',
        regionName: 'City-State of Lemerolai',
        description: 'Lemerolai is one of the oldest continuous settlements in Maltona, its survival owed not just to formidable walls but to the iron resolve of its rulers and the hard-earned neutrality it has brokered in countless conflicts. ',
        mapImage: './images/lemerolai_map.png',
        mapWidth: 1920,
        mapHeight: 1080,

        defaultLore: {
            entry: 'Codex 01.H',
            title: 'Lemerolai',
            body: `

<p><span class="float-left text-6xl font-headline text-secondary leading-none pr-3 pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]">L</span>emerolai rises like a dark jewel from the crag-shadowed base of the Wolf’s Teeth Range, nestled just west of the Wolf’s Cradle. Carved into basalt and ironstone, it is a fortress-metropolis whose foundations predate many nations. Its streets are paved with ancient stone, its towers etched with old runes, and its gates, massive and ever-guarded, have not fallen in living memory.

Lemerolai is one of the oldest continuous settlements in Maltona, its survival owed not just to formidable walls but to the iron resolve of its rulers and the hard-earned neutrality it has brokered in countless conflicts. Even the devastating Ophrasian War left its gates unbreached, its people bloodied but unbowed. Over time, the city expanded its influence beyond the mountain’s shadow: lesser settlements have sprung in the nearby valleys and ridgelines, dependent on Lemerolai’s protection and subject to its law and trade.

Today, Lemerolai stands as both a bastion and a beacon—a city of ancient pacts, militant guilds, and secretive archives. Rumors speak of old vaults hidden beneath the city, sealed since before the Ophrasian War, and of a relic-bound throne still held in trust by the Assembly, Lemerolai’s ruling council of houses.</p>
            
            `
        },

        pins: [
            {
                y: 335, x: 206, icon: 'capital', isDanger: false,
                linkId: '',
                title: 'Caeraotrom Athenæum', subtitle: 'Oghma\'s Blessing',
                entry: 'Codex Entry: 03.H',
                body: `

<p>Aratanath Surrkerin, an ancient dragon sage is fabled to have conversed with Oghma. After their last discussion the god missioned him with the construction of the greatest trove of knowledge of the material plane - a place where all could aspire to learn.

There is only one way in and out of the Caeraotrom Athenæum: a small road coming up the mountain from the closest town. There is 150 km separating the two, with a 600m elevation gain.</p>
                
                `
            }
        ]
    }
};