// scripts/campaign-echoes.js

// 1. Ensure the master registry exists
window.campaignData = window.campaignData || {};

// 2. Attach THIS campaign to the registry using its exact name!
window.campaignData["The Last Sigil"] = {

    // --- THE GRAND NARRATIVE ---
    storySoFar: {
        preview: "Two scholars are sent to survey an ancient site recently unearthed. Thought to be an ancient Doleris temple, the site is a labyrinth of strange arcane phenomena that forces the adventurers to confront their own memories",
        full: `
            <p><span class="float-left text-5xl md:text-7xl font-headline text-[#e9c176] leading-none pr-3 pt-1 md:pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]">A</span>asked to investigate old ruins in the Wolf's Cradle, Eli and Maevik are taken through the Wildlands by a group of mercenaries. Upon arrival they discover a strange underground temple inf ar worse shape than expected.</p>
            
            <p>Their investigation quickly led them to realize that itself wasn't flowing properly there. After being stuck in a sort of time loop, plagued by strange dreams, the brave scholars discover what looks like a small study in a demi-plane. There they find copious work written by Doleris Scholars and a strange artifact : The Last Sigil.</p>
            <p>Taking their discovery back to the Athenaeum, they are sent to Runebridge, in search of an eminent scholar who might be able to help them decypher it all... only to find him missing. With the Dean of Runebridge particularly suspect, they decide to flee and keep on investigating, on their own.</p>       `
    },

    // --- ACTIVE LEADS / QUESTS ---
    activeQuests: [
        { title: "Perform the Ritual", description: "Stabilize the Last Sigil before it collapses upon itself.", status: "Primary" },
        { title: "Finding Sam", description: "Sam Eredil, a briliant researcher in mathemagics has gone missing. Thanks to some helpful students, it might possible to find him.", status: "Secondary" }
    ],

    // --- ALL SESSION RECORDS ---
    sessions: [
        {
            id: "session-4",
            dateSpan: "Deftesten 28 Mystawal, 1693LF",
            region: "Wolf's Cradle, Maltona",
            title: "In a hole, in the ground, there lived a Sigil",
            arc: "Main",
            summary: "The party was led Grand Warden Foll who give them partial jurisdiction to investigate a series of crimes. They started by focusing on a string of strange murders.",

            locationsVisited: [
                "Wolf's Cradle",
            ],

            npcsMet: [
            ],

            lootObtained: [
                "Trauma"
            ],

            accomplished: [
                "Weird timey things and odd dreams"
            ],

            leadsPursued: [
                "Went into the hole in the ground"
            ],

            futureLeads: [
                "Figure out what the deal is with this Last Sigil thing"
            ],

            keywords: [
                "",
                "",
                "",
                ""
            ],

            body: `
                <p><i>Nothing yet, come back soon</i></p>
            `
        }
    ]
};