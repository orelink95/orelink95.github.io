// The real data : story so far & session summaries


const scriptoriumData = {
    storySoFar: {
        preview: "A ragged band of mercenaries, drawn together by a mysterious summons, arrived in Brightend just as the King's peace began to fracture...",
        full: `
            <p><span class="float-left text-5xl md:text-7xl font-headline text-[#e9c176] leading-none pr-3 pt-1 md:pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]">S</span>ummoned to the Alabaster Palace by Lord White, a ragged band of mercenaries took on what seemed to be a simple retrieval job: find a missing Runebridge scholar named <span class="kw-person">Maera Voss</span>, and secure the ancient text she was hired to translate.</p>
            
            <p>Their investigation through the streets of <span class="kw-place">Brightend</span> led them to a disappearing door hidden in a wealthy alleyway. Stepping through the anomaly, the party was pulled into the <span class="kw-place">Vale House</span>—an impossible, time-displaced mansion suspended in a permanent pocket dimension. Battling animated armor, mimics, and the fiendish illusions of the mansion's defenses, they unearthed the disturbing, ancient laboratories of its long-gone masters and successfully rescued the captive scholar from a chained room.</p>
            
            <p>But their salvation brought a terrifying revelation. Maera's research proved that the established history of the ancient <span class="kw-lore">Doleris</span> civilization was a lie, and the timeline of the world itself had been altered. Worse still, upon escaping back to the material plane, they found her office ransacked. The highly coveted <strong>Ninefold Commentary</strong> had been stolen by three hooded figures.</p>

            <div class="pl-6 border-l-2 border-[#1a3020] my-8 py-2">
                <p class="font-newsreader italic text-[#e2e3df] text-lg">
                    "Only the King and I seem to think something is happening... there is no guild, but one group has become much more present."
                </p>
            </div>
            
            <p>Now, the party must hide Maera from those who want her silenced. Forging a tense alliance with the Grand Warden, they have been tasked to hunt down an invisible, highly-organized syndicate responsible for a string of perfect crimes—before the stolen secrets of the void can be unleashed upon <span class="kw-place">Eperina</span>.</p>
        `
    },

    activeQuests: [
        { title: "A String of Thefts", description: "Brightened has been plagued by a string of mysterious thefts, according to The Wardens.", status: "Primary" },
        { title: "Eyes in the Fog", description: "Investigate the disappearances near the North Gate.", status: "Secondary" }
    ],

    sessions: [
        {
            id: "session-3",
            dateSpan: "Pemtasten 6 Pholawal, 1693LF",
            region: "Brightend, Maltona",
            title: "Back in Brightend",
            arc: "Echoes from the Void",
            summary: "After rescuing Maera Voss and escaping the Vale House, the party discovered a highly coordinated thieve's guild had stolen their prize.",

            locationsVisited: [
                "The Vale House",
                "Cloud District",
                "Hammer's Candy",
                "The Alabaster Palace"
            ],

            npcsMet: [
                { id: "maeravoss", sentiment: "like" },
                { id: "hammer_nim", sentiment: "like" },
                { id: "lordwhite", sentiment: "neutral" },
                { id: "grand-warden", sentiment: "neutral" }
            ],

            lootObtained: [
            ],

            accomplished: [
                "Rescued Maera Voss from a hidden, chained room in the Vale House.",
                "Escaped the pocket dimension and safely smuggled Maera to a hideout.",
                "Secured an alliance with the Grand Warden to hunt the new thieve's guild."
            ],

            leadsPursued: [
                "Discussed the timeline paradox of the Doleris civilization with Maera.",
                "Used magic to view a 'security recording' of the thieves stealing the tome.",
                "Reported their findings (mostly) honestly to Lord White and the Grand Warden."
            ],

            futureLeads: [
                "Track down the three hooded figures and recover The Ninefold Commentary.",
                "Locate Verrick, the missing King's mage cadet.",
                "Smuggle Maera Voss out of the capital to the Lemerolai border."
            ],

            keywords: [
                "Maera Voss",
                "Doleris",
                "The Ninefold Commentary",
                "Alabaster Wardens",
                "Thieves Guild",
                "Lemerolai"
            ],

            body: `
                <p>Solving the telescope puzzle in the planetarium triggered a secret door in the basement. Inside, the party found a chained bookshelf and a heavily cloaked figure passed out on the floor. It was <span class="kw-person">Maera Voss</span>—who was surprisingly revealed to be a Madaru (an anthropomorphic fox).</p>
                
                <p>After surviving an attack by the magically chained books, Maera explained the terrifying truth of her research. The <span class="kw-lore">Doleris</span> civilization supposedly vanished around 700 2E, but the books in this house referenced the Ophrasian War from 1341. History had been rewritten, and the Vale House was proof.</p>
                
                <p>Fleeing back through the portal, the party emerged in Maera's office only to find it ransacked. <strong>The Ninefold Commentary</strong> was gone. Maera cast a spell to reveal the past, showing three highly organized, hooded figures stealing the tome in a Bag of Holding.</p>

                <div class="pl-6 border-l-2 border-[#1a3020] my-8 py-2">
                    <p class="font-newsreader italic text-[#e2e3df] text-xl">
                        "Only the King and I seem to think something is happening... there is no 'guild', but one group has become much more present."
                    </p>
                </div>
                
                <p>Knowing Lord White could not be fully trusted, the party smuggled Maera to <span class="kw-place">Hammer's Candy</span>, a front run by Nimo's ex-lover, to lay low. They then marched to the <span class="kw-place">Alabaster Palace</span> to report the theft.</p>
                
                <p>Lord White directed them to the Grand Warden. A review of the Warden's case-board revealed clerical errors, erased witnesses, and a chillingly precise crime wave that began right after the King's mage cadet, Verrick, disappeared. The hunt for the phantom guild had officially begun.</p>
            `
        },

        {
            id: "session-2",
            dateSpan: "???",
            region: "The Vale House",
            title: "Secrets of the Vale House",
            arc: "Echoes from the Void",
            summary: "The party explored the impossible mansion, battling animated furniture and uncovering the disturbing, time-displaced experiments of its ancient masters.",

            locationsVisited: [
                "The Vale House",
                "Maera Voss's Study"
            ],

            npcsMet: [
                { id: "jeff-the-skull", sentiment: "like" },
                { id: "coriander", sentiment: "like" },
                { id: "cumin", sentiment: "like" }
            ],

            lootObtained: [
                "Potion of Healing",
                "4 Pints of Excellent Whisky"
            ],

            accomplished: [
                "Defeated an animated suit of armor and a mimic disguised as a dining chair.",
                "Slew a Quasit that burst from the mouth of an enchanted toad.",
                "Discovered a hidden basement filled with alchemical and necromantic experiments.",
                "Mapped a constellation puzzle within a magical planetarium."
            ],

            leadsPursued: [
                "Investigated the master bedroom, finding evidence of the mansion's masters: Alensia and Freyot."
            ],

            futureLeads: [
                "Figure out the purpose of the pristine blue books scattered around the house.",
                "Find the missing Maera Voss, who Jeff claims is somewhere 'no fun'."
            ],

            keywords: [
                "Alensia",
                "Freyot",
                "Homunculi",
                "Mimic",
                "Quasit"
            ],

            body: `
                <p>Ascending the stairs of the extradimensional mansion they learned was called the <span class="kw-place">Vale House</span>, the party quickly realized the home was aggressively defending itself. After Gust poked a highly ornate suit of armor, Nimo was forced to quickly dispatch it in combat.</p>
                
                <p>Exploring the upper floors, they found a bizarre mix of the mundane and the magical. A planetarium housed five telescopes, each transporting the viewer's mind to a grassy hill under a specific star. In the master bedroom, they found correspondence between the mansion's creators: an elven mistress named <span class="kw-lore">Alensia</span> and a mage named <span class="kw-lore">Freyot</span>.</p>
                
                <p>Down in the kitchens, they were greeted by two ancient, talking homunculi named Coriander and Cumin, who peacefully cooked them ratatouille and provided Davnis with an Alchemist's Jug full of whisky. However, the peace was short-lived when the dining room chairs revealed themselves to be Mimics.</p>

                <div class="pl-6 border-l-2 border-[#1a3020] my-8 py-2">
                    <p class="font-newsreader italic text-[#e2e3df] text-xl">
                        "The longevity of this pocket dimension is incredibly unusual... we are completely outside of time and space."
                    </p>
                </div>
                
                <p>Using a fake wooden book, Gust and Nimo uncovered a secret stairwell leading down into the dark. The basement revealed a horrific magical laboratory. They found transmutational alchemy notes, a demonic altar that spat a Quasit at them, and massive glass tubes preserving bizarre creatures—including a cockatrice, a fire beetle, and severed hands pulsing with necromancy.</p>
            `
        },
        {
            id: "session-1",
            dateSpan: "Deftesten 3 Pholawal, 1693LF",
            region: "Brightend, Eperina",
            title: "A Tome Twice Missing",
            arc: "Echoes from the Void",
            summary: "Hired by Lord White and two anxious scholars, the party tracked a missing academic through a disappearing door into an impossible pocket dimension.",

            locationsVisited: [
                "The Alabaster Palace",
                "Cloud District",
                "Oddmoss Librarium",
                "The Gilded Goldfinch",
                "The Vale House"
            ],

            npcsMet: [
                { id: "lordwhite", sentiment: "neutral" },
                { id: "aregan-olm", sentiment: "neutral" },
                { id: "bram-sureoak", sentiment: "neutral" },
                { id: "ovan", sentiment: "neutral" },
                { id: "jeff-the-skull", sentiment: "dislike" }
            ],

            lootObtained: [
                "Notes on The Everlasting (Book)",
                "Meditations on the Way of the Lizard (Book)",
                "Pirate Erotica",
                "Maera's Shawl"
            ],

            accomplished: [
                "Secured a 2,000gp contract to retrieve Maera Voss and her tome.",
                "Discovered an invisible, primal sylvan portal hidden in an alleyway.",
                "Survived an ambush by an animated suit of armor.",
                "Bested a fiendish shapeshifter at its own riddles."
            ],

            leadsPursued: [
                "Questioned Ovan at the Oddmoss Librarium about Maera's reading habits.",
                "Followed a trail of conjuration magic and rats' whispers to a blank wall."
            ],

            futureLeads: [
                "Explore the rest of the Vale House to locate Maera Voss.",
                "Decipher the moving Doleris symbols on the cover of the tome."
            ],

            keywords: [
                "Maera Voss",
                "Runebridge",
                "Doleris",
                "Ekelph",
                "The Ninefold Commentary",
                "Pocket Dimension"
            ],

            body: `
                <p>The party—Nimo, Gust, Eli, and Davnis—were summoned to the Alabaster Palace to meet with Derral Sitsk, the Lord White. He was accompanied by two scholars from Runebridge: a tiefling named Aregan Olm and an owlin named Bram Sureoak.</p>
                
                <p>The scholars were in a panic. Their colleague, the quirky and highly secretive <span class="kw-lore">Maera Voss</span>, had vanished. She was in possession of a highly precious ancient tome, and the scholars were acting noticeably cagey about its true contents. Nimo expertly negotiated a hefty 2,000gp reward for both the scholar's safe return and the retrieval of the book.</p>
                
                <p>Following leads to the wealthy Cloud District, the party stopped at the Oddmoss Librarium. A gnome clerk named Ovan revealed that Maera had recently requested books be delivered to an empty brick wall down the street. While Davnis, Gust, and Nimo did some light book shopping, Eli cast Detect Magic near the wall, picking up trails of abjuration and conjuration magic.</p>
                
                <p>After Davnis cleverly distracted some local guards (who were already arguing about disappearing buildings), Nimo pushed against the empty space. A door infused with primal sylvan magic opened into pitch blackness.</p>
                
                <div class="pl-6 border-l-2 border-[#1a3020] my-8 py-2">
                    <p class="font-newsreader italic text-[#e2e3df] text-xl">
                        "The book on the desk had strange geometries that seemed to move if you looked too long..."
                    </p>
                </div>
                
                <p>They stepped into an abandoned, chaotic study. The desk was burnt in the exact shape of a book resting upon it—a tome titled <strong>The Ninefold Commentary</strong>, covered in an ancient <span class="kw-lore">Doleris</span> alphabet variant known as <span class="kw-lore">Ekelph</span>. The book itself acted as a gateway. When Davnis jumped inside, the rest followed.</p>
                
                <p>They emerged on the porch of a massive, eerie mansion utterly disconnected from the material plane. Inside, they were taunted by a fiendish entity pretending to be a cat (and later a floating skull) named 'Jeff'. Amidst slamming doors, flying books, and a battle with a massive suit of sentient armor, the party realized Maera Voss was trapped somewhere deep within this impossible house.</p>
            `
        }
    ]
};