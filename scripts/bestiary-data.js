const bestiaryData = [
    {
        id: "jeff-skull",
        arcana: "I · THE GUARDIAN",
        specimenNo: "002",
        name: "Jeff",
        location: "The Valehouse",
        image: "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master/_img/ToB2/creature/Wicked%20Skull.webp",
        threatLevel: "Friendly", // Lethal, High, Moderate, Low, Harmless, Friendly
        realm: "",
        phylogeny: "Monstrosity",
        shortDesc: "This skull chatters eerily, gently rocking as it comes to life. It calls out a warning in a hauntingly musical voice.",

        stats: {
            "Brute Strength": 7,
            "Agility & Speed": 68,
            "Arcane Resonance": 82,
            "Cunning": 75
        },

        tags: ["CONSTRUCT", "SHAPESHIFTER"],
        habitats: ["Urban", "Arcane Labs", "Libraries", "Wizard Hangouts"],

        loreTitle: "Lore of the Wicked Skull",
        body: `
            <p><span class="float-left text-5xl font-headline text-secondary leading-none pr-3 pt-2">B</span>orn of the whims of a trickster wizard, <i>Jeff</i> is born of malice and cunning. Wicked skulls crave entertainment above all else, and they do not consider their tricks to be malicious. Pretending to be a person transformed into an object or horrifying monster, giving confusing directions through a dungeon, or speaking only in rhymes are just a few tactics they seem to enjoy. A wicked skull avoids direct combat whenever possible and prefers to play mind games.</p> `,

        behaviors: [
            "Tricks and treats",
            "Triple-sensory awareness (360° proprioception)",
            "(Limited?) Shapeshifting"
        ],
        weaknesses: [
            "Fear of abandonment",
            "Anti-magic fields",
            "???"
        ],
        loot: [
            { name: "Pseudoresin", type: "Rare Alchemy Ingredient", icon: "colorize" },
            { name: "Bone Fragment", type: "Trophy & Crafting", icon: "ac_unit" },
        ],
        scholarQuote: "Such wicked skulls seem to have been made for hundreds of year. But the way to make them appears to escape common knowledge.",
        scholarName: "L. Maldy"
    },
    {
        id: "chimera",
        arcana: "XXII · THE ABOMINATION",
        specimenNo: "042",
        name: "Chimera",
        location: "Wolf's Teeth Range",
        image: "https://www.startpage.com/av/proxy-image?piurl=https%3A%2F%2Fimages6.alphacoders.com%2F105%2F1053213.jpg&sp=1775984310T02b36fa49acdd4a77043be2ebfb0424c7a6ad09304c2ba92fefcef0915c03527",
        threatLevel: "Lethal",
        realm: "Material Plane",
        phylogeny: "Monstrosity",
        shortDesc: "A monstrous fusion of predator, underworld fire, and petrifying venom.",

        stats: {
            "Brute Strength": 94,
            "Agility & Speed": 78,
            "Arcane Resonance": 62,
            "Cunning": 45
        },

        tags: ["LEGENDARY", "CURSED"],
        habitats: ["Obsidian Peaks", "Whispering Woods", "Lost Temples"],

        loreTitle: "Lore of the Tri-Headed",
        body: `
            <p>First recorded in the <em>Annals of the Broken Sky</em>, the Chimera is not a creature of nature, but a scar upon it. Legends speak of a sorcerer-king who sought to bind the three primal instincts—might, cunning, and malice—into a single vessel.</p>
            <p>The result was a monstrous fusion that defies biological logic. The lion's head provides the brute strength of the predator, the goat's head exhales the sulfurous fires of the underworld, and the serpent's tail carries a venom that turns the blood to stone.</p>
            <p>In modern times, sightings have increased near the volcanic rifts of the Northern Reaches. They are solitary hunters, possessing a territorial instinct so fierce they will often engage in battles with their own shadows until the sun sets.</p>
        `,
        behaviors: [
            "Nocturnal territorial patrol",
            "Triple-sensory awareness (360° sight)",
            "Fire-breathing during threat displays"
        ],
        weaknesses: [
            "Conflict between the heads",
            "Vulnerable soft-belly under goat neck",
            "Susceptible to silver-tipped arrows"
        ],
        loot: [
            { name: "Chimera Venom", type: "Rare Alchemy Ingredient", icon: "colorize" },
            { name: "Mane Fragment", type: "Rare Alchemy Ingredient", icon: "colorize" },
            { name: "Ever-Warm Heart", type: "Legendary Essence", icon: "local_fire_department" }
        ],
        scholarQuote: "The creature's heads do not always agree. If you can incite a disagreement between the serpent and the lion, the opening for a strike becomes wide enough for even a novice to exploit.",
        scholarName: "M. Valerius"
    },
];