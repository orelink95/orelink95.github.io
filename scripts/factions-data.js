
const factionsData = [
    {
        id: "alabaster-wardens",
        name: "The Alabaster Wardens",
        crest: "https://ui-avatars.com/api/?background=e9c176&color=121412&font-size=0.4&name=AW", // Replace with real crest image path
        status: "Allied",
        quote: "\"Order is not a natural state. It must be enforced.\"",
        reputation: 51,
        reputationText: "Respected",

        quickFacts: {
            base: "The Alabaster Palace, Brightend",
            scale: "City-wide",
            mo: "Law Enforcement",
            threatLevel: "Moderate" // Low, Moderate, Severe, Omega
        },

        relationships: {
            allies: ["The Crown", "Merchant's Guild"],
            rivals: ["Criminal Underworld"]
        },

        assets: [
            "500+ heavily armored guards across the country",
            "Access to the city's archive",
            "Close ties to The Crown"
        ],
        directives: [
            "Investigate the surge of crimes in the recent days",
            "Reinforce protections in the Cloud District"
        ],

        // Unverified Rumors
        rumors: [
            "Some Wardens are actually mole people plotting to seize the kingdom",
            "Foll was King Teal's secret lover"
        ],

        // Existing Intel Cards
        intel: [
            {
                type: "note",
                seal: "AW",
                title: "Official Mandate",
                content: "\"The bearers of this writ are operating under the partial jurisdiction of Grand Warden Foll. Provide them necessary access to the Cloud District crime scenes.\""
            },
            {
                type: "target",
                name: "Grand Warden Foll",
                image: "https://ui-avatars.com/api/?background=1a1c1a&color=e9c176&name=Foll",
                description: "Stern, unyielding leader of the city guard. Currently dealing with internal corruption and erased witnesses.",
                tags: [{ text: "ALLY", color: "text-[#4ade80] border-[#4ade80]/30" }]
            }
        ]
    },
    {
        id: "thieves-guild",
        name: "??????",
        crest: "https://ui-avatars.com/api/?background=121412&color=f87171&font-size=0.4&name=??",
        status: "Hostile",
        quote: "\"????? \"",
        reputation: 15,
        reputationText: "Hunted",

        quickFacts: {
            base: "Unknown",
            scale: "Regional",
            mo: "Theft, Smuggling, Assassination, Extortion",
            threatLevel: "Severe"
        },

        relationships: {
            allies: ["Corrupt Port Officials"],
            rivals: ["The Alabaster Wardens"]
        },

        assets: [
            "???",
            "Highly trained magic operatives"
        ],
        directives: [
            "?????????",
            "????????????????"
        ],

        rumors: [
            "Criminals in the city have been brought together under a common banner, and they lurk in the shadows."
        ],

        intel: [
        ]
    }
];