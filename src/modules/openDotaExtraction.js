async function processOpenDotaData(filteredMatchIds, config, matchMap) {
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
    let nonMarketableSet = new Set();

    loadDatabase(processedMatchesMap, dbMap, nonMarketableSet, config);
    log('info', 'Starting Step 2: Fetching Community Posts...');
    const communityPostsFetchResults = await fetchCommunityPosts(filteredMatchIds, config);
    log('info', `Step 2 completed. Fetched: ${communityPostsFetchResults.fetchedCount}, Failed: ${communityPostsFetchResults.failedCount}..`);

    const matchDetailsDir = config.matchDetailsDir;
    const filteredMatchesDir = config.filteredMatchesDir;
    let fetchedCount = 0;
    let errorCountStep3 = 0;
    let processedNewCount = 0;
    let processedUpdateCount = 0;
    let skippedCount = 0;
    let errorCountStep5 = 0;

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
          // Do NOT call removeOldContribution if previousEntry date is invalid
        } else if (currentMatch.spectators > previousEntry.spectators) {
          log('info', `  -> Update detected for match ${currentMatchId}: New spectators (${currentMatch.spectators}) > Old (${previousEntry.spectators}).`);
        shouldProcess = true;
          isUpdate = true;
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
    try {
          const cosmetics = Array.isArray(currentMatch.cosmetics) ? currentMatch.cosmetics : [];
          addNewContribution(currentMatchId, currentDate, currentMatch.spectators, cosmetics, dbMap);
          processedMatchesMap.set(currentMatchId, { date: currentDate, spectators: currentMatch.spectators });
          if (isUpdate) {
            processedUpdateCount++;
      } else {
            processedNewCount++;
      }
          fetchedCount++;
        } catch (addContributionError) {
          log('error', `  -> Error adding contribution for match ${currentMatchId}: ${addContributionError.message}`);
          errorCountStep3++;
    }
      }
      // If not shouldProcess, it's skipped, already counted
    }

    log('info', `Step 3: Match details processing completed. Processed New: ${processedNewCount}, Processed Updates: ${processedUpdateCount}, Skipped: ${skippedCount}, Errors: ${errorCountStep3}.`);

    log('info', 'Starting Step 4: Extracting and Filtering Match Data...');
    const step4ExtractionResults = await extractMatchData(filteredMatchIds, config);
    log('info', `Step 4 completed. Processed: ${step4ExtractionResults.processedCount}, Filtered: ${step4ExtractionResults.filteredCount}, Errors: ${step4ExtractionResults.errorCount}.`);
    errorCountStep5 += step4ExtractionResults.errorCount;

    log('info', '\nPreparing original database data...');
    let finalDbData = [];
    try {
      finalDbData = Array.from(dbMap.values()).sort((a, b) => {
        const dateA = a.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        const dateB = b.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        if (dateA === dateB) {
          return Object.keys(a.items || {}).length - Object.keys(b.items || {}).length;
        }
        return dateA.localeCompare(dateB);
      });

      finalDbData.forEach(day => {
        if (day.items) {
          const sortedItems = {};
          if (typeof day.items === 'object' && day.items !== null) {
            Object.keys(day.items).sort().forEach(key => {
              if (day.items[key] > 0) {
                sortedItems[key] = day.items[key];
              }
            });
            day.items = sortedItems;
          } else {
            log('warn', `Items data for date ${day.date} is not an object.`);
            day.items = {}; // Reset to empty object if invalid
            errorCountStep5++;
          }
        } else {
          day.items = {}; // Ensure items property exists as object
        }
        if (Array.isArray(day.matches)) {
          day.matches.sort((a, b) => String(a.match_id).localeCompare(String(b.match_id)));
        } else {
          day.matches = []; // Ensure matches property exists as array
        }
      });

      log('info', `Final original database data prepared with ${finalDbData.length} date entries.`);
    } catch (sortError) {
      log('error', `Error preparing final database array: ${sortError.message}`);
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
            if (!nonMarketableSet.has(item) && score > 0) {
              filteredItems[item] = score;
              hasMarketableItems = true;
            }
          }
        } else {
          log('warn', `Items data for date ${date} is missing or not an object for filtered DB preparation.`);
          // Don't increment errorCount here, it's handled during original prep/sort
        }
        if (hasMarketableItems) {
          const filteredDayData = { ...dayData, items: filteredItems };
          // Ensure matches property exists as array for filtered data too
          if (!Array.isArray(filteredDayData.matches)) {
            filteredDayData.matches = [];
          }
          filteredDbMap.set(date, filteredDayData);
        }
      }

      finalFilteredDbData = Array.from(filteredDbMap.values()).sort((a, b) => {
        const dateA = a.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        const dateB = b.date.split('/').reverse().join(''); // Converts MM/DD/YYYY to YYYYDDMM
        if (dateA === dateB) {
          return Object.keys(a.items || {}).length - Object.keys(b.items || {}).length;
        }
        return dateA.localeCompare(dateB);
      });

      finalFilteredDbData.forEach(day => {
        if (day.items) {
          const sortedItems = {};
          if (typeof day.items === 'object' && day.items !== null) {
            Object.keys(day.items).sort().forEach(key => {
              if (day.items[key] > 0) {
                sortedItems[key] = day.items[key];
              }
            });
            day.items = sortedItems;
          } else {
            log('warn', `Items data for date ${day.date} is not an object.`);
            day.items = {}; // Reset to empty object if invalid
            errorCountStep5++;
          }
        } else {
          day.items = {}; // Ensure items property exists as object
        }
        if (Array.isArray(day.matches)) {
          day.matches.sort((a, b) => String(a.match_id).localeCompare(String(b.match_id)));
        } else {
          day.matches = []; // Ensure matches property exists as array
        }
      });

      log('info', `Final filtered database data prepared with ${finalFilteredDbData.length} date entries.`);
    } catch (filterSortError) {
      log('error', `Error preparing final filtered database array: ${filterSortError.message}`);
      errorCountStep5++;
    }

    log('info', 'Saving filtered database...');
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
    log('info', `Step 2 (Community Posts): Fetched: ${communityPostsFetchResults.fetchedCount}, Failed: ${communityPostsFetchResults.failedCount}`);
    log('info', `Step 3 (Fetch Details): Fetched/Already Existed: ${fetchedCount}, Failed: ${errorCountStep3}`);
    log('info', `Step 4 (Extract/Filter): Processed: ${step4ExtractionResults.processedCount}, Filtered: ${step4ExtractionResults.filteredCount}, Errors: ${step4ExtractionResults.errorCount}`);
    log('info', `Step 5 (DB Update): Processed New: ${processedNewCount}, Processed Updates: ${processedUpdateCount}, Skipped: ${skippedCount}, Errors: ${errorCountStep5}`);
    log('info', `Database Files Saved: Original: ${dbSavedSuccessfully ? 'Yes' : 'No'}, Filtered: ${filteredDbSavedSuccessfully ? 'Yes' : 'No'}`);
    log('info', '---------------------------------------');
    log('info', "OpenDota Data Processing (Steps 2-5) finished.");

    return {
      success: (errorCountStep3 + step4ExtractionResults.errorCount + errorCountStep5) === 0 && dbSavedSuccessfully && filteredDbSavedSuccessfully,
      step2: communityPostsFetchResults,
      step3: { fetchedCount, failedCount: errorCountStep3 },
      step4: step4ExtractionResults,
      step5: { processedNewCount, processedUpdateCount, skippedCount, errorCount: errorCountStep5, dbSaved: dbSavedSuccessfully, filteredDbSaved: filteredDbSavedSuccessfully }
    };
  } catch (catchAllError) {
    log('error', `Caught unexpected error during processing: ${catchAllError.message}`, catchAllError);
    // Return a consistent error structure
    return {
      success: false,
      error: catchAllError.message,
      step2: { fetchedCount: 0, failedCount: 0 },
      step3: { fetchedCount: 0, failedCount: 0 },
      step4: { processedCount: 0, filteredCount: 0, errorCount: 0 },
      step5: { processedNewCount: 0, processedUpdateCount: 0, skippedCount: 0, errorCount: 0, dbSaved: false, filteredDbSaved: false }
    };
  }
}

module.exports = {
  processOpenDotaData
};

