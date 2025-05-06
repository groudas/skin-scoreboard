// Import utility functions from src/utils
const { log, ensureDirExists, readJsonFile, writeJsonFile, formatDate } = require('../utils');

// Import database functions from src/step5_update_database.js
const {
  loadDatabase,
  removeOldContribution,
  addNewContribution
} = require('../step5_update_database');

// NOTE: The function 'extractMatchData' called within processOpenDotaData
// was not found in the codebase. Please ensure it is defined or imported correctly.
// Example: const { extractMatchData } = require('./path/to/extractMatchData');

/**
 * Process OpenDota data for a given set of filtered match IDs.
 *
 * @param {string[]} filteredMatchIds - IDs of matches to process.
 * @param {Object} config - Configuration object.
 * @param {Map<string, Object>} matchMap - Map of match data.
 * @param {Object} dailyCosmeticStats - Daily cosmetic stats. (Note: This parameter is declared but not used in the current logic)
 * @param {Set<string>} nonMarketableItems - Non-marketable items.
 */
async function processOpenDotaData(filteredMatchIds, config, matchMap, dailyCosmeticStats, nonMarketableItems) {
  try {
    if (!Array.isArray(filteredMatchIds) || filteredMatchIds.length === 0) {
      log('warn', 'Received empty or invalid filteredMatchIds array. Nothing to process.');
      return {
        success: true,
        step3: { fetchedCount: 0, failedCount: 0 },
        step4: { processedCount: 0, filteredCount: 0, errorCount: 0 },
        step5: { processedNewCount: 0, processedUpdateCount: 0, skippedCount: 0, errorCount: 0, dbSaved: false, filteredDbSaved: false }
      };
    }

    let processedMatchesMap = new Map();
    let dbMap = new Map();
    let nonMarketableSet = nonMarketableItems; // Reuse the provided nonMarketableItems set

    // Load existing processed matches and database into maps/sets
    loadDatabase(processedMatchesMap, dbMap, nonMarketableSet, config);

    // NOTE: matchDetailsDir and filteredMatchesDir are declared but not used in the current logic.
    const matchDetailsDir = config.matchDetailsDir;
    const filteredMatchesDir = config.filteredMatchesDir;

    let fetchedCount = 0; // Note: This counter seems to be incremented regardless of success in the loop below.
    let errorCountStep3 = 0; // Error fetching/basic validation
    let processedNewCount = 0; // Successfully added as new
    let processedUpdateCount = 0; // Successfully added as update
    let skippedCount = 0; // Skipped (already processed, no update)
    let errorCountStep5 = 0; // Errors during DB manipulation/saving later

    for (const currentMatchId of filteredMatchIds) {
      const currentMatchData = matchMap.get(currentMatchId);
      if (!currentMatchData) {
        log('warn', `  -> Skipping: Match ID ${currentMatchId} not found in matchMap.`);
        errorCountStep3++;
        continue;
      }

      const currentMatch = currentMatchData.match;
      if (!currentMatch) {
        log('warn', `  -> Skipping: Match data for ${currentMatchId} is missing 'match' property.`);
        errorCountStep3++;
        continue;
      }

      const currentDate = currentMatch.date;
      if (typeof currentDate !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(currentDate)) {
        log('warn', `  -> Skipping: Invalid or missing data fields or date format (expected MM/DD/YYYY) in ${currentMatchId}.`);
        errorCountStep3++;
        continue;
      }

      const previousEntry = processedMatchesMap.get(currentMatchId);
      let shouldProcess = false;
      let isUpdate = false;

      if (previousEntry) {
        if (typeof previousEntry.date !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(previousEntry.date)) {
          log('warn', `  -> Skipping update check for match ${currentMatchId}: Invalid previous entry date format.`);
          log('info', `  -> Treating match ${currentMatchId} as new due to invalid previous entry date format.`);
          shouldProcess = true;
          isUpdate = false;
        } else if (currentMatch.spectators > previousEntry.spectators) {
          log('info', `  -> Update detected for match ${currentMatchId}: New spectators (${currentMatch.spectators}) > Old (${previousEntry.spectators}).`);
          shouldProcess = true;
          isUpdate = true;
          // Assuming currentMatch.cosmetics contains the cosmetic data for removeOldContribution
          removeOldContribution(currentMatchId, previousEntry.date, previousEntry.spectators, currentMatch.cosmetics, dbMap);
        } else {
          log('info', `  -> Skipping: Match ${currentMatchId} already processed with ${previousEntry.spectators} spectators (>= current ${currentMatch.spectators}).`);
          skippedCount++;
        }
      } else {
        log('info', `  -> New match found: ${currentMatchId}.`);
        shouldProcess = true;
        isUpdate = false;
      }

      if (shouldProcess) {
        // Process the match data and add/update to the database maps
        try {
          // Assuming currentMatch.cosmetics contains the cosmetic data needed by addNewContribution
          const cosmetics = currentMatch.cosmetics; // Get cosmetics from the current match data

          if (!cosmetics) {
               log('warn', `  -> Skipping processing for match ${currentMatchId}: No cosmetic data found.`);
               errorCountStep3++; // Count this as a processing error for step 3
               continue; // Skip adding this match
          }

          addNewContribution(currentMatchId, currentDate, currentMatch.spectators, cosmetics, dbMap);
          processedMatchesMap.set(currentMatchId, { date: currentDate, spectators: currentMatch.spectators }); // Update processed map

          if (isUpdate) {
            processedUpdateCount++;
          } else {
            processedNewCount++;
          }
          fetchedCount++; // Increment fetchedCount for processed matches
        } catch (addContributionError) {
          log('error', `  -> Error adding/updating contribution for match ${currentMatchId}: ${addContributionError.message}`);
          errorCountStep3++; // Count this as a processing error for step 3
        }
      }
    }

    log('info', `Step 3: Match details processing completed. Processed New: ${processedNewCount}, Processed Updates: ${processedUpdateCount}, Skipped: ${skippedCount}, Errors: ${errorCountStep3}.`);

    // NOTE: The call to extractMatchData is still present here.
    // This function is not defined in the provided code snippet or imported.
    // You will need to ensure 'extractMatchData' is correctly defined or imported
    // if this step is still intended.
    log('info', 'Starting Step 4: Extracting and Filtering Match Data...');
    // As extractMatchData is undefined based on our current view,
    // I will add a placeholder result to prevent the script from crashing,
    // but you MUST replace this with the actual call or remove this step
    // if it's no longer needed.
    let step4ExtractionResults = { processedCount: 0, filteredCount: 0, errorCount: 0 };
    try {
       // IMPORTANT: Replace the following line with the actual call to extractMatchData
       // if that function exists and is needed. If not, remove this try/catch block.
       // step4ExtractionResults = await extractMatchData(filteredMatchIds, config);
       log('warn', 'Placeholder for extractMatchData called. Function not defined/imported.');
    } catch(e) {
       log('error', `Error calling extractMatchData (placeholder): ${e.message}`);
       step4ExtractionResults.errorCount++;
    }
    log('info', 'Step 4 completed. Processed: ${step4ExtractionResults.processedCount}, Filtered: ${step4ExtractionResults.filteredCount}, Errors: ${step4ExtractionResults.errorCount}.');
    errorCountStep5 += step4ExtractionResults.errorCount; // Add Step 4 errors to Step 5 total
    log('info', '\nPreparing original database data...');
    let finalDbData = [];
    try {
      finalDbData = Array.from(dbMap.values()).sort((a, b) => {
        const dateA = a.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        const dateB = b.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        if (dateA === dateB) {
          // Sort by number of items for deterministic output on the same day
          return Object.keys(a.items || {}).length - Object.keys(b.items || {}).length;
        }
        return dateA.localeCompare(dateB);
      });

      // Ensure items and matches properties exist and sort items alphabetically
      finalDbData.forEach(day => {
        if (day.items) {
          const sortedItems = {};
          if (typeof day.items === 'object' && day.items !== null) {
            Object.keys(day.items).sort().forEach(key => {
              // Only include items with score > 0 in the final output
              if (day.items[key] > 0) {
                sortedItems[key] = day.items[key];
              }
            });
            day.items = sortedItems;
          } else {
            log('warn', `Items data for date ${day.date} in original DB is not an object.`);
            day.items = {}; // Reset to empty object if invalid
            errorCountStep5++;
          }
        } else {
          day.items = {}; // Ensure items property exists as object
        }
        if (Array.isArray(day.matches)) {
          day.matches.sort((a, b) => String(a.match_id).localeCompare(String(b.match_id)));
        } else {
          // This shouldn't happen if addNewContribution works correctly, but ensure it's an array
          log('warn', `Matches data for date ${day.date} in original DB is not an array.`);
          day.matches = []; // Ensure matches property exists as array
          errorCountStep5++;
        }
      });

      log('info', `Final original database data prepared with ${finalDbData.length} date entries.`);
    } catch (sortError) {
      log('error', `Error preparing final original database array: ${sortError.message}`);
      errorCountStep5++;
    }

    log('info', 'Saving original database...');
    let dbSavedSuccessfully = false;
    try {
      if (writeJsonFile(config.dbFilePath, finalDbData)) {
        log('info', `Original database successfully updated and saved to ${config.dbFilePath}`);
        dbSavedSuccessfully = true;
      } else {
        log('error', `Failed to write original database to ${config.dbFilePath}`);
        errorCountStep5++;
      }
    } catch (saveError) {
      log('error', `Fatal error saving original database: ${saveError.message}`);
      errorCountStep5++;
    }

    log('info', '\nPreparing filtered database data (excluding non-marketable items)...');
    let finalFilteredDbData = [];
    try {
      const filteredDbMap = new Map()
      for (const [date, dayData] of dbMap.entries()) {
        const filteredItems = {};
        let hasMarketableItems = false;
        if (dayData.items && typeof dayData.items === 'object' && dayData.items !== null) {
          for (const [item, score] of Object.entries(dayData.items)) {
            // Check if item is not in the nonMarketableSet and has a score > 0
            if (!nonMarketableSet.has(item) && score > 0) {
              filteredItems[item] = score;
              hasMarketableItems = true;
            }
          }
        } else {
          log('warn', `Items data for date ${date} is missing or not an object for filtered DB preparation.`);
          // Don't increment errorCount here, it's handled during original prep/sort
        }
        // Only add the day to the filtered DB if it contains at least one marketable item
        if (hasMarketableItems) {
          const filteredDayData = { date: dayData.date, spectators: dayData.spectators, items: filteredItems, matches: Array.isArray(dayData.matches) ? dayData.matches : [] };
          // Ensure matches property exists as array for filtered data too
          if (!Array.isArray(filteredDayData.matches)) {
             log('warn', `Matches data for date ${date} in filtered DB prep is not an array.`);
             filteredDayData.matches = []; // Ensure matches property exists as array
             errorCountStep5++;
          }
          filteredDbMap.set(date, filteredDayData);
        }
      }

      finalFilteredDbData = Array.from(filteredDbMap.values()).sort((a, b) => {
        const dateA = a.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        const dateB = b.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        if (dateA === dateB) {
           // Sort by number of items for deterministic output on the same day
          return Object.keys(a.items || {}).length - Object.keys(b.items || {}).length;
        }
        return dateA.localeCompare(dateB);
      });

      // Ensure items and matches properties exist and sort items alphabetically for filtered DB
      finalFilteredDbData.forEach(day => {
        if (day.items) {
          const sortedItems = {};
          if (typeof day.items === 'object' && day.items !== null) {
            Object.keys(day.items).sort().forEach(key => {
               // This check was already done when creating filteredItems, but good practice
              if (day.items[key] > 0) {
                sortedItems[key] = day.items[key];
              }
            });
            day.items = sortedItems;
          } else {
            log('warn', `Items data for date ${day.date} in filtered DB is not an object.`);
            day.items = {}; // Reset to empty object if invalid
            errorCountStep5++;
          }
        } else {
          day.items = {}; // Ensure items property exists as object
        }
         if (Array.isArray(day.matches)) {
          day.matches.sort((a, b) => String(a.match_id).localeCompare(String(b.match_id)));
        } else {
          // This shouldn't happen based on the prep logic, but ensure it's an array
           log('warn', `Matches data for date ${day.date} in filtered DB is not an array.`);
          day.matches = []; // Ensure matches property exists as array
          errorCountStep5++;
        }
      });

      log('info', `Final filtered database data prepared with ${finalFilteredDbData.length} date entries.`);
    } catch (filterSortError) {
      log('error', `Error preparing final filtered database array: ${filterSortError.message}`);
      errorCountStep5++;
    }

    log('info', 'Saving filtered database...');S
    let filteredDbSavedSuccessfully = false;
    try {
      if (writeJsonFile(config.filteredDbFilePath, finalFilteredDbData)) {
        log('info', `Filtered database successfully updated and saved to ${config.filteredDbFilePath}`);
        filteredDbSavedSuccessfully = true;
      } else {
        log('error', `Failed to write filtered database to ${config.filteredDbFilePath}`);
        errorCountStep5++;
      }
    } catch (saveError) {
      log('error', `Fatal error saving filtered database: ${saveError.message}`);
      errorCountStep5++;
    }

    // Final Summary Logs
    log('info', '\n--- OpenDota Data Processing Summary ---');
    log('info', `Step 3 (Process Details): Processed New: ${processedNewCount}, Processed Updates: ${processedUpdateCount}, Skipped: ${skippedCount}, Errors: ${errorCountStep3}`);
    log('info', `Step 4 (Extract/Filter): Processed: ${step4ExtractionResults.processedCount}, Filtered`);