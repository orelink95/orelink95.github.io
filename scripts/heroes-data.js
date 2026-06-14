const partyData = {
    partyName: "Tulcuvaina",

    // Shared Party Resources
    assets: {
        gold: 60,
        silver: 8,
        copper: 50
    },

    sharedInventory: [
    ],

    groupFactions: [
        { name: "The Alabaster Wardens", status: "Allied" },
        { name: "Oddmoss Librarium", status: "Neutral" }
    ],

    // The Characters
    heroes: [
        {
            id: "nimo",
            name: "Nimo",
            raceClass: "Mousefolk Rogue/Warlock",
            avatar: "https://ui-avatars.com/api/?background=121412&color=e9c176&name=Nimo",
            quote: "I can pick that. Probably.",
            backstory: "A quick-fingered resident of Brightend who negotiated the 2,000gp contract with Lord White.",
            personalGoal: "Find what happened to their long lost brother.",
            password: "coin",
            secret: "<p>Nimo secretly pocketed an extra 100gp from the reward advance without telling the party. Also, the guild mark found at the scene matches the one on the dagger Nimo inherited...</p>",
            stats: { ac: 15, hp: 32, speed: 30, str: 10, dex: 16, con: 14, int: 12, wis: 10, cha: 14 },
            level: 4,
            background: "Sailor",
            factions: ["The Alabaster Wardens"],
        },
        {
            id: "gust",
            name: "Gust",
            raceClass: "Shifter Monk",
            avatar: "https://ui-avatars.com/api/?background=121412&color=e9c176&name=Gust",
            quote: "Let's just poke the ornate suit of armor and see what happens.",
            backstory: "A brave combatant who isn't afraid to trigger a trap or get into a fight.",
            personalGoal: "Avenge his family.",
            password: "charm",
            secret: "<p>Gust has a scret too</p>",
            stats: { ac: 15, hp: 32, speed: 30, str: 10, dex: 16, con: 14, int: 12, wis: 10, cha: 14 },
            level: 4,
            background: "Mercenary",
            factions: ["The Alabaster Wardens"],
        },
        {
            id: "eli",
            name: "Eli",
            raceClass: "Elf Warlock",
            avatar: "https://ui-avatars.com/api/?background=121412&color=e9c176&name=Eli",
            quote: "It's like Zombies were done to the cupboard.",
            backstory: "A perceptive researcherr with a keen eye for detecting the unseen and unraveling magical mysteries.",
            personalGoal: "Know more, discover all. Understand the world, and the Void beyond it.",
            password: "knowledge",
            secret: "<p>Eli forgot his own brother</p>",
            stats: { ac: 15, hp: 32, speed: 30, str: 10, dex: 16, con: 14, int: 12, wis: 10, cha: 14 },
            level: 4,
            background: "Scholar",
            factions: ["The Alabaster Wardens"],
        },
        {
            id: "davnis",
            name: "Davnis",
            raceClass: "Human Fighter",
            avatar: "https://ui-avatars.com/api/?background=121412&color=e9c176&name=Davnis",
            quote: "Look over there! Disappearing buildings!",
            backstory: "A master of distraction and holder of the Alchemist's jug. Always ready to jump into a magical book first.",
            personalGoal: "Keep the whisky flowing.",
            password: "love",
            secret: "<p>A part of Davnis revels in looking for love on his term because he couldn't cope with an actual relationship.</p>",
            stats: { ac: 15, hp: 32, speed: 30, str: 10, dex: 16, con: 14, int: 12, wis: 10, cha: 14 },
            level: 6,
            background: "Shepherd",
            factions: ["The Alabaster Wardens"],
        }
    ]
};