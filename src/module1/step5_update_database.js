import fs from 'fs'
import path from 'path'
import config from '../config.js';
import { log, ensureDirExists, readJsonFile, writeJsonFile } from '../utils.js';

// --- Helper Function to Load Non-Marketable Items ---
function loadNonMarketableItems(filePath) {
    log('info', `Loading non-marketable items list from: ${filePath}`);
    const nonMarketableSet = new Set();
    try {
        const fileExists = fs.existsSync(filePath);
        if (!fileExists) {
            log('warn', `Non-marketable items file not found at ${filePath}. No filtering will be applied.`);
            return nonMarketableSet; // Return empty set
        }
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split(/\r?\n/);

        lines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                nonMarketableSet.add(trimmedLine);
            }
        });
        log('info', `Loaded ${nonMarketableSet.size} unique non-marketable item names.`);

    } catch (error) {
        log('error', `Error reading non-marketable items file ${filePath}: ${error.message}. Filtering will not be applied.`);
        return new Set();
    }
    return nonMarketableSet;
}

// Function to load the database and build helper maps
function loadDatabase(dbFilePath) {
    log('info', `Loading database from ${dbFilePath}`);
    const dbData = readJsonFile(dbFilePath) || []; // Corrected: changed [; to []
    const dbMap = new Map(); // Map<date_string, dailyEntryObject>
    const processedMatchesMap = new Map(); // Map<matchId_string, { date: string, spectators: number }>

    if (!Array.isArray(dbData)) {
        log('warn', `Database file ${dbFilePath} is not a valid JSON array. Starting with empty DB.`);
        return { dbMap, processedMatchesMap }; // Return empty maps
    }

    dbData.forEach(dailyEntry => {
        if (dailyEntry && typeof dailyEntry.date === 'string' && dailyEntry.items && typeof dailyEntry.items === 'object') {
             dailyEntry.items = dailyEntry.items || {};
             dailyEntry.matches = Array.isArray(dailyEntry.matches) ? dailyEntry.matches : [];
             dbMap.set(dailyEntry.date, dailyEntry);
             dailyEntry.matches.forEach(matchInfo => {
                if (matchInfo && typeof matchInfo.match_id === 'string' && typeof matchInfo.spectators === 'number') {
                     processedMatchesMap.set(matchInfo.match_id, {
                        date: dailyEntry.date,
                        spectators: matchInfo.spectators
                    });
                } else {
                     log('warn', `Invalid match entry found in DB for date ${dailyEntry.date}:`, matchInfo);
                }
            });
        } else {
            log('warn', 'Invalid daily entry structure found in DB:', dailyEntry);
        }
    });

    log('info', `Database loaded: ${dbMap.size} dates, ${processedMatchesMap.size} previously processed matches.`);
    return { dbMap, processedMatchesMap };
}

// Function to remove the contribution of an old match entry
function removeOldContribution(matchId, oldDate, oldSpectators, cosmetics, dbMap) {
    const oldDailyEntry = dbMap.get(oldDate);
    if (!oldDailyEntry) {
        log('warn', `Cannot remove old contribution for ${matchId}: Date entry ${oldDate} not found in DB map.`);
        return;
    }
    log('debug', `  -> Removing old contribution (${oldSpectators} spectators) for match ${matchId} from date ${oldDate}.`);
    if (Array.isArray(cosmetics)) {
        cosmetics.forEach(cosmeticName => {
            if (oldDailyEntry.items && oldDailyEntry.items[cosmeticName] !== undefined) {
                oldDailyEntry.items[cosmeticName] = Math.max(0, oldDailyEntry.items[cosmeticName] - oldSpectators);
            } else {
                 log('warn', `  -> Cosmetic "${cosmeticName}" (from new data) not found in old date entry ${oldDate} items for subtraction.`);
            }
        });
    }
    if (Array.isArray(oldDailyEntry.matches)) {
        oldDailyEntry.matches = oldDailyEntry.matches.filter(m => m.match_id !== matchId);
    }
}

// Function to add the contribution of a new match entry
function addNewContribution(matchId, newDate, newSpectators, cosmetics, dbMap) {
    log('debug', `  -> Adding new contribution (${newSpectators} spectators) for match ${matchId} to date ${newDate}.`);
    let dailyEntry = dbMap.get(newDate);
    if (!dailyEntry) {
        log('info', `  -> Creating new date entry in DB for ${newDate}.`);
        dailyEntry = { date: newDate, items: {}, matches: [] };
        dbMap.set(newDate, dailyEntry);
    }
    dailyEntry.items = dailyEntry.items || {};
    dailyEntry.matches = Array.isArray(dailyEntry.matches) ? dailyEntry.matches : [];
    if (Array.isArray(cosmetics)) {
        cosmetics.forEach(cosmeticName => {
            dailyEntry.items[cosmeticName] = (dailyEntry.items[cosmeticName] || 0) + newSpectators;
        });
    }
    if (!dailyEntry.matches.some(m => m.match_id === matchId)) {
        dailyEntry.matches.push({ match_id: matchId, spectators: newSpectators });
    } else {
         log('warn', `  -> Attempted to add duplicate match reference for ${matchId} on date ${newDate}. Check logic.`);
         const existingMatchIndex = dailyEntry.matches.findIndex(m => m.match_id === matchId);
         if (existingMatchIndex > -1) dailyEntry.matches[existingMatchIndex].spectators = newSpectators;
    }
}

// --- Main Execution Function ---
async function runStep5() {
    log('info', "Starting Step 5: Updating Cosmetic Stats Database...");
    const filteredMatchesDir = config.step5.filteredMatchesDir;
    const dbDir = config.step5.dbDir;
    const dbFilePath = config.step5.dbFile; // Original DB Path
    const nonMarketableFilePath = config.step5.nonMarketableFile; // Filter list path
    const filteredDbFilePath = config.step5.filteredDbFile; // Filtered DB Path

    if (!ensureDirExists(dbDir)) { // Ensure DB directory exists
        log('error', 'Database directory cannot be created/accessed. Exiting.');
        process.exit(1);
    }
    if (!fs.existsSync(filteredMatchesDir)) {
        log('error', `Input directory ${filteredMatchesDir} not found. Exiting.`);
        process.exit(1);
    }

    // Load Non-Marketable Items FIRST
    const nonMarketableSet = loadNonMarketableItems(nonMarketableFilePath);

    // 1. Load existing DB and build helper maps
    const { dbMap, processedMatchesMap } = loadDatabase(dbFilePath);

    // 2. Find filtered match files to process
    let filesToProcess = [];
    try {
        filesToProcess = fs.readdirSync(filteredMatchesDir)
            .filter(file => /^filtered_\d+\.json$/.test(file));
        log('info', `Found ${filesToProcess.length} filtered match files to process.`);
    } catch (error) {
        log('error', `Failed to read filtered matches directory ${filteredMatchesDir}:`, error.message);
    }

     if (filesToProcess.length === 0 && dbMap.size === 0) {
        log('info', "No filtered match files found and DB is empty. Nothing to do.");
        log('info', "Step 5 finished.");
        return;
    }

    // 3. Process each file to build the complete dbMap
    let processedNewCount = 0;
    let processedUpdateCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const filename of filesToProcess) {
        const matchFilePath = path.join(filteredMatchesDir, filename);
        log('info', `\nProcessing ${filename}...`);
        const currentMatchData = readJsonFile(matchFilePath);

        if (!currentMatchData || typeof currentMatchData !== 'object') {
            log('warn', `  -> Skipping: Failed to read/parse ${filename} or invalid format.`);
            errorCount++;
            continue;
        }
        const { match_id: currentMatchId, date: currentDate, cosmetics: currentCosmetics, spectators: currentSpectators } = currentMatchData;

        if (!currentMatchId || typeof currentMatchId !== 'string' || !currentDate || typeof currentDate !== 'string' || !Array.isArray(currentCosmetics) || typeof currentSpectators !== 'number') {
            log('warn', `  -> Skipping: Invalid or missing data fields in ${filename}.`);
            errorCount++;
            continue;
        }

        const previousEntry = processedMatchesMap.get(currentMatchId);
        let shouldProcess = false;
        let isUpdate = false;

        if (previousEntry) {
            if (currentSpectators > previousEntry.spectators) {
                log('info', `  -> Update detected for match ${currentMatchId}: New spectators (${currentSpectators}) > Old (${previousEntry.spectators}).`);
                shouldProcess = true;
                isUpdate = true;
                removeOldContribution(currentMatchId, previousEntry.date, previousEntry.spectators, currentCosmetics, dbMap);
            } else {
                log('info', `  -> Skipping: Match ${currentMatchId} already processed with ${previousEntry.spectators} spectators (>= current ${currentSpectators}).`);
                skippedCount++;
            }
        } else {
            log('info', `  -> New match found: ${currentMatchId}.`);
            shouldProcess = true;
            isUpdate = false;
        }

        if (shouldProcess) {
            addNewContribution(currentMatchId, currentDate, currentSpectators, currentCosmetics, dbMap);
            processedMatchesMap.set(currentMatchId, { date: currentDate, spectators: currentSpectators });
            if (isUpdate) {
                processedUpdateCount++;
            } else {
                processedNewCount++;
            }
        }
    } // End loop through files

    // 4. Prepare the final *original* database data
    log('info', '\nPreparing original database data...');
    let finalDbData = [];
    try {
        // Convert map back to array and sort by date
        finalDbData = Array.from(dbMap.values()).sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('');
            const dateB = b.date.split('/').reverse().join('');
            return dateA.localeCompare(dateB);
        });

        // Sort items and matches within each date (optional consistency)
        finalDbData.forEach(day => {
            if (day.items) {
                const sortedItems = {};
                Object.keys(day.items).sort().forEach(key => {
                    if (day.items[key] > 0) {
                        sortedItems[key] = day.items[key];
                    }
                });
                day.items = sortedItems;
            }
             if (Array.isArray(day.matches)) {
                 day.matches.sort((a, b) => a.match_id.localeCompare(b.match_id));
             }
        });
    } catch (sortError) {
        log('error', `Error preparing final database array: ${sortError.message}`);
        // Continue to save attempt if possible
    }

    // 5. Save the *original* database
    log('info', 'Saving original database...');
    try {
        if (writeJsonFile(dbFilePath, finalDbData)) {
            log('info', `Original database successfully updated and saved to ${dbFilePath}`);
        } else {
            log('error', `Failed to write original database to ${dbFilePath}`);
        }
    } catch (saveError) {
        log('error', `Fatal error saving original database file ${dbFilePath}:`, saveError.message);
    }

    // 6. Create and save the *filtered* (marketable only) database
    log('info', 'Preparing filtered (marketable items only) database data...');
    let filteredDbData = [];
    if (nonMarketableSet.size > 0) { // Only filter if the set is not empty
        try {
            filteredDbData = finalDbData.map(dailyEntry => {
                const filteredItems = {};
                // Iterate over items of the original entry for this day
                if (dailyEntry.items) {
                    Object.entries(dailyEntry.items).forEach(([itemName, score]) => {
                        // Include item only if it's NOT in the nonMarketableSet
                        if (!nonMarketableSet.has(itemName)) {
                            filteredItems[itemName] = score;
                        }
                    });
                }
                // Return a new object with the filtered items, keeping other properties
                return {
                    ...dailyEntry,
                    items: filteredItems // Replace items with the filtered version
                };
            });
            log('info', 'Filtered database data created.');

            // Save the filtered database
            log('info', 'Saving filtered database...');
            if (writeJsonFile(filteredDbFilePath, filteredDbData)) {
                log('info', `Filtered database successfully saved to ${filteredDbFilePath}`);
            } else {
                log('error', `Failed to write filtered database to ${filteredDbFilePath}`);
            }

        } catch (filterError) {
            log('error', `Error creating or saving filtered database: ${filterError.message}`);
        }
    } else {
        log('info', 'Skipping creation of filtered database because non-marketable list was empty or failed to load.');
    }

    // Final Summary
    log('info', `\n--- Step 5 Summary ---`);
    log('info', `Total filtered files processed: ${filesToProcess.length}`);
    log('info', `New matches added to DB: ${processedNewCount}`);
    log('info', `Existing matches updated in DB: ${processedUpdateCount}`);
    log('info', `Matches skipped (already processed, specs <=): ${skippedCount}`);
    log('info', `Files skipped/Errored: ${errorCount}`);
    log('info', `Total dates in DB: ${dbMap.size}`);
    log('info', `Total unique matches tracked in DB: ${processedMatchesMap.size}`);
    log('info', `Non-marketable items list size: ${nonMarketableSet.size}`);
    log('info', `Saved original DB to: ${dbFilePath}`);
    if (fs.existsSync(filteredDbFilePath)) { // Check if filtered file was actually saved
        log('info', `Saved filtered (marketable) DB to: ${filteredDbFilePath}`);
    }
    log('info', `----------------------`);
    log('info', "Step 5 finished.");
}

// --- Start Execution ---
runStep5();