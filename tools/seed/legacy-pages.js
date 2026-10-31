/* Values that were hard-coded in page scripts (continent-scripts.js and
   atlas-scripts.js on main @4ce1e9a), frozen here because phase 4 rewrites
   those scripts. Used once by tools/convert.js.
   world: the lore shown in world.html on load (the live version);
   worldScriptLore: the older copy in atlas-scripts.js, shown after a reset. */
module.exports = {
    "continentMaps": {
        "maltona": {
            "src": "images/maltona_map.png",
            "width": 2930,
            "height": 1760
        }
    },
    "world": {
        "entry": "Codex Entry: 04.A",
        "title": "The Known Realms",
        "body": "\n                        <p><span\n                                class=\"float-left text-5xl lg:text-6xl font-headline text-secondary leading-none pr-3 pt-1 lg:pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]\">F</span>rom\n                            the jagged peaks of the Wolf's Teeth Range to the depths of the North Sea, lies a world\n                            scarred by ancient magic and forgotten dynasties. The Athenaeum records these lands as they\n                            are, open to what they might become.</p>\n                        <p>To the east, the <span class=\"text-[#e2e3df] font-semibold\">Boundless Vale</span> still\n                            radiate with the chaotic energy of the Ophrasian War.</p>\n\n                        <div class=\"relative my-6 lg:my-8 pl-6 border-l-2 border-primary/30\">\n                            <span\n                                class=\"material-symbols-outlined absolute -left-3 -top-3 text-primary/20 text-3xl lg:text-4xl bg-surface-container-low\"\n                                style=\"font-variation-settings: 'FILL' 1;\">format_quote</span>\n                            <p class=\"italic text-on-surface/80 relative z-10 text-sm\">\"Do not trust the maps drawn\n                                before the War. The land remembers the trauma, it has been disfigured.\"</p>\n                            <span\n                                class=\"block text-[9px] lg:text-[10px] font-label uppercase tracking-widest text-primary mt-3\">—\n                                Master Sage Elara</span>\n                        </div>\n                    ",
        "map": {
            "src": "images/eraldom_world_map.png",
            "width": 1920,
            "height": 1078
        }
    },
    "worldScriptLore": {
        "entry": "Codex Entry: 04.A",
        "title": "The Known Realms",
        "body": "<p>\n                            <span\n                                class=\"float-left text-6xl font-headline text-secondary leading-none pr-3 pt-2 drop-shadow-[0_0_10px_rgba(233,193,118,0.3)]\">B</span>\n                            eyond the jagged peaks of the Iron Span lies a world scarred by ancient magic and forgotten\n                            dynasties. The Athenaeum records these lands not as they are, but as they survive.\n                        </p>\n                        <p>\n                            To the east, the <span class=\"text-e2e3df font-semibold\">Sunken Isles</span> still radiate\n                            with the chaotic energy of the First Sundering. Travelers speak of waters that glow like\n                            liquid starlight, though few return to verify such claims.\n                        </p>\n\n                        <div class=\"relative my-8 pl-6 border-l-2 border-primary/30\">\n                            <span\n                                class=\"material-symbols-outlined absolute -left-3 -top-3 text-primary/20 text-4xl bg-surface-container-low\"\n                                style=\"font-variation-settings: 'FILL' 1;\">format_quote</span>\n                            <p class=\"italic text-on-surface/80 relative z-10\">\n                                \"Do not trust the maps drawn before the War. The land remembers the trauma, it has been disfigured.\"\n                            </p>\n                            <span class=\"block text-[10px] font-label uppercase tracking-widest text-primary mt-3\">—\n                                Master Sage Elara</span>\n                        </div>"
    }
};
