const fs = require('fs');
const csv = require('csv-parser');

const CSV_FILE_PATH = './data/npcs.csv';
const OUTPUT_JS_PATH = './scripts/almanach.js';

const npcAlmanach = {};

console.log('Reading Obsidian archives...');

fs.createReadStream(CSV_FILE_PATH)
    .pipe(csv())
    .on('data', (row) => {
        // Grab the ID (make sure the CSV has an 'ID' column)
        const id = row['ID'];
        if (!id) return; // Skip empty rows

        // Map the CSV columns to the JS object properties
        npcAlmanach[id] = {
            name: row['Name'] || 'Unknown',
            role: row['Role'] || 'Unknown',
            quote: row['Quote'] || 'No recorded dialogue.',
            image: row['Image'] || 'images/placeholder_profile.png',
            homePinTitle: row['Home Pin Title'] || 'Unknown Location',
            settlement: row['Settlement'] || 'Unknown',
            species: row['Species'] || 'Unknown',
            age: row['Age'] || 'Unknown',
            gender: row['Gender'] || 'Unknown',
            affiliation: row['Affiliation'] || 'Independent',
            relationToParty: row['Relation to Party'] || 'Unknown',
            biography: row['Biography'] || '<p class="italic text-on-surface/40">No archival biography exists for this individual.</p>',
            secrets: row['Secrets'] || ''
        };
    })
    .on('end', () => {
        // Format it into the exact JavaScript string expected
        const fileContent = `const npcAlmanach = ${JSON.stringify(npcAlmanach, null, 4)};\n`;

        // Write the new almanach.js file
        fs.writeFileSync(OUTPUT_JS_PATH, fileContent, 'utf8');

        console.log(`Success! ${Object.keys(npcAlmanach).length} NPCs have been inscribed into ${OUTPUT_JS_PATH}.`);
    });