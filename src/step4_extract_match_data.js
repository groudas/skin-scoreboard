// src/step4_extract_match_data.js
const fs = require('fs');
const path = require('path');
const config = require('./config'); // Need both step3 and step4 configs
const { log, ensureDirExists, readJsonFile, writeJsonFile, formatDate } = require('./utils');

// Build a map of { match_id: max_spectators } from the filtered live data
function buildSpectatorMap(filteredLiveFilePath) {
    log('info', `Building spectator map from ${filteredLiveFilePath}`);
    const spectatorMap = new Map();
    const filteredLiveData = readJsonFile(filteredLiveFilePath);

    if (!Array.isArray(filteredLiveData)) {
        log('error', 'Failed to load or parse filtered live data file. Cannot get spectator counts.');
        return null; // Indicate failure
    }

    filteredLiveData.forEach(block => {
        if (block && block.top_matches) {
            Object.entries(block.top_matches).forEach(([matchId, matchInfo]) => {
                // matchInfo is [spectators, activate_time]
                // Corrected the typeof check syntax
                if (Array.isArray(matchInfo) && typeof matchInfo[0] === 'number') {
                    const currentSpectators = matchInfo[0];
                    const existingSpectators = spectatorMap.get(matchId) || 0;
                    if (currentSpectators > existingSpectators) {
                        spectatorMap.set(matchId, currentSpectators);
                    }
                }
            });
        }
    });
    log('info', `Spectator map built with ${spectatorMap.size} entries.`);
    return spectatorMap;
}

function extractCosmetics(matchData) {
    const cosmeticNames = new Set();
    if (matchData && Array.isArray(matchData.players)) {
        matchData.players.forEach(player => {
            if (player && Array.isArray(player.cosmetics)) {
                player.cosmetics.forEach(cosmetic => {
                    // Ensure cosmetic has a 'name' property which is a non-empty string
                    if (cosmetic && typeof cosmetic.name === 'string' && cosmetic.name.trim()) {
                        cosmeticNames.add(cosmetic.name.trim());
                    }
                });
            }
        });
    }
    return Array.from(cosmeticNames); // Return unique names as an array
}


async function runStep4() {
    log('info', "Starting Step 4: Extracting Data from Match Details...");
    const matchesDir = config.step3.outputDir; // Input directory
    const filteredLiveFile = config.step4.filteredLiveFile; // For spectator map
    const outputDir = config.step4.outputDir; // Output directory

    if (!ensureDirExists(outputDir)) {
        log('error', 'Output directory cannot be created/accessed. Exiting.');
        process.exit(1);
    }
    if (!fs.existsSync(matchesDir)) {
         log('error', `Input directory ${matchesDir} not found. Exiting.`);
         process.exit(1);
    }
     if (!fs.existsSync(filteredLiveFile)) {
         log('error', `Spectator map file ${filteredLiveFile} not found. Exiting.`);
         process.exit(1);
    }

    // 1. Build spectator map
    const spectatorMap = buildSpectatorMap(filteredLiveFile);
    if (!spectatorMap) {
         process.exit(1); // Error already logged
    }

    // 2. Find match detail files to process
    let filesToProcess = [];
    try {
        filesToProcess = fs.readdirSync(matchesDir)
            .filter(file => /^\d+\.json$/.test(file)); // Match files named like {match_id}.json
        log('info', `Found ${filesToProcess.length} potential match detail files in ${matchesDir}.`);
    } catch (error) {
        log('error', `Failed to read match details directory ${matchesDir}:`, error.message);
        process.exit(1);
    }

    if (filesToProcess.length === 0) {
        log('info', "No match detail files found to process.");
        log('info', "Step 4 finished.");
        return;
    }

    // 3. Process each file
    let processedCount = 0;
    let skippedExistingCount = 0;
    let skippedNoCosmeticsCount = 0;
    let errorCount = 0;

    for (const filename of filesToProcess) {
        const matchId = filename.replace('.json', '');
        const matchFilePath = path.join(matchesDir, filename);
        const outputFilePath = path.join(outputDir, `filtered_${matchId}.json`);

        log('info', `\nProcessing ${filename} (Match ID: ${matchId})...`);

        // Check if output already exists
        if (fs.existsSync(outputFilePath)) {
            log('info', `  -> Skipping: Output file ${path.basename(outputFilePath)} already exists.`);
            skippedExistingCount++;
            continue;
        }

        const matchData = readJsonFile(matchFilePath);
        if (!matchData || typeof matchData !== 'object') {
             log('warn', `  -> Skipping: Failed to read or parse ${filename}, or it's empty/invalid.`);
             errorCount++;
             continue;
        }

        // Validate essential fields from match data
         if (typeof matchData.match_id !== 'number' || matchData.match_id.toString() !== matchId) {
             log('warn', `  -> Skipping: Mismatched match_id in ${filename} (${matchData.match_id} vs ${matchId}) or missing.`);
             errorCount++;
             continue;
         }
         if (typeof matchData.start_time !== 'number') {
             log('warn', `  -> Skipping: Missing or invalid 'start_time' in ${filename}.`);
             errorCount++;
             continue;
         }

        // Extract cosmetics
        const uniqueCosmetics = extractCosmetics(matchData);
        if (uniqueCosmetics.length === 0) {
            log('info', `  -> Skipping: No valid cosmetic names found in ${filename}.`);
            skippedNoCosmeticsCount++;
            continue; // Don't create an output file if no cosmetics were found
        }
        log('debug', `  -> Found ${uniqueCosmetics.length} unique cosmetic items.`);

        // Format date
        const formattedDate = formatDate(matchData.start_time);
        if (!formattedDate) {
             log('warn', `  -> Skipping: Failed to format date from start_time ${matchData.start_time} in ${filename}.`);
             errorCount++;
             continue;
        }

        // Get spectator count
        const spectatorCount = spectatorMap.get(matchId);
        if (spectatorCount === undefined) {
            // This might happen if the match appeared in live data but wasn't in the top N when we filtered
            // Or if it was filtered out for missing activate_time in Step 2
            log('warn', `  -> Spectator count not found for match ${matchId}. Using 0.`);
            // Decide whether to skip or use 0/null. Using 0 allows tracking cosmetics even if spec count is missing.
        }
        const finalSpectatorCount = spectatorCount ?? 0; // Use 0 if undefined

        // Prepare output data
        const outputData = {
            match_id: matchId,
            date: formattedDate, // DD/MM/YYYY
            cosmetics: uniqueCosmetics, // Array of unique names
            spectators: finalSpectatorCount // Single number
        };

        // Write output file
        if (writeJsonFile(outputFilePath, outputData)) {
            log('info', `  -> Success! Extracted data saved to ${path.basename(outputFilePath)}`);
            processedCount++;
        } else {
            log('error', `  -> Failed to write output file ${path.basename(outputFilePath)}`);
            errorCount++;
        }
    }

    // --- Step 4 Summary ---
    log('info', `Total match detail files found: ${filesToProcess.length}`);
    log('info', `Successfully processed and created files: ${processedCount}`);
    log('info', `Skipped (output already exists): ${skippedExistingCount}`);
    log('info', `Skipped (no valid cosmetics found): ${skippedNoCosmeticsCount}`);
    log('info', `Skipped/Errored (invalid data, read/write issues): ${errorCount}`);
    // ----------------------
    log('info', "Step 4 finished.");
}

// --- Start Execution ---
runStep4();