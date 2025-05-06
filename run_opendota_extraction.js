console.log("--- Script file loading started ---");

const path = require('path');
const fs = require('fs').promises;
const { processOpenDotaData } = require('./src/modules/openDotaExtraction');
const { log, ensureDirExists, readJsonFile, writeJsonFile, formatDate } = require('./src/utils');

async function runExtraction() {
  try {
    console.log("Starting OpenDota Extraction execution script...");

    // --- Configuration Check ---
    if (!config.step2 || !config.step2.processedDir || !config.step5 || !config.step5.dbFile || !config.step5.nonMarketableFile || !config.step5.filteredDbFile) {
        log('error', "Configuration error: Required paths are missing in config.");
        return;
    }

    // --- Ensure directories exist ---
    const processedDir = config.step2.processedDir;
    const dbDir = config.step5.dbDir;

    if (!ensureDirExists(processedDir)) {
        log('error', `Failed to ensure processed directory exists: ${processedDir}. Exiting.`);
        return;
      }

    if (!ensureDirExists(dbDir)) {
        log('error', `Failed to ensure database directory exists: ${dbDir}. Exiting.`);
        return;
      }

    // --- Load Daily Cosmetic Stats DB ---
    const dbFilePath = config.step5.dbFile;
    let dailyCosmeticStats = readJsonFile(dbFilePath) || {};

    // --- Load Non-Marketable Items List ---
    const nonMarketableItemsPath = config.step5.nonMarketableFile;
    let nonMarketableItems = new Set();
    try {
        const data = await fs.readFile(nonMarketableItemsPath, 'utf8');
        data.split('\n').forEach(line => {
            const itemName = line.trim();
            if (itemName) {
                nonMarketableItems.add(itemName);
            }
        });
        log('info', `Loaded ${nonMarketableItems.size} non-marketable items.`);
    } catch (readError) {
        log('warn', `Could not read non-marketable items file ${nonMarketableItemsPath}. Proceeding without filtering.`, readError);
        nonMarketableItems = new Set(); // Ensure it's an empty Set if file read fails
    }

    // --- Load Processing Previous State ---
    let latestProcessedFile = null;
    let processedFilePath = config.step2.outputFile;
    let processedFileExists = false;
    try {
        await fs.access(processedFilePath); // This will throw an error if the file doesn't exist
      processedFileExists = true;
        latestProcessedFile = path.basename(processedFilePath); // Set to the filename if it exists

        log('info', `Found previous processed file: ${processedFilePath}`);
    } catch (checkError) {
        log('info', `No previous processed file found at ${processedFilePath}. Starting fresh.`);
        processedFilePath = null; // Ensure path is null if file wasn't found
        latestProcessedFile = null;
    }

    // --- Prepare Arguments for processOpenDotaData ---
    const matchMap = processedFileExists ? readJsonFile(config.step2.outputFile) : {};
    let filteredMatchIds = [];
    for (const entry of Object.values(matchMap)) {
        if (entry && entry.match_id) {
            filteredMatchIds.push(entry.match_id);
        } else {
            log('warn', `Skipping potentially invalid entry found during initial load (missing match_id or match property):`, entry);
        }
    }

    if (filteredMatchIds.length === 0 && processedFileExists) {
        log('warn', "Processed data file found, but contains no valid match entries with 'match_id'. Nothing to process based on previous state.");
    } else if (filteredMatchIds.length > 0) {
        log('info', `Loaded ${filteredMatchIds.length} match IDs from previous processed file.`);
    }

    console.log(`Prepared matchMap with ${Object.keys(matchMap).length} entries.`);
    console.log(`Prepared filteredMatchIds with ${filteredMatchIds.length} IDs.`);

    // --- Call the Extraction Function ---
    log('info', 'Calling processOpenDotaData...');
    const results = await processOpenDotaData(
        filteredMatchIds, // List of filtered match IDs (from previous file state)
      config, // Pass the config object
        matchMap, // Pass the loaded map (from previous file state)
      dailyCosmeticStats, // Pass the daily stats object
      nonMarketableItems // Pass the non-marketable set
    );

    // --- Log Results ---
    console.log("\n--- OpenDota Extraction Script Results ---");
    console.log("Function execution finished.");
    console.log("Results:", JSON.stringify(results, null, 2)); // Log results nicely formatted
    console.log("------------------------------------------");

  } catch (mainError) {
    console.error("An unexpected error occurred in the run script:", mainError);
  }
}

// Execute the main function
runExtraction();