const { log, readJsonFile, writeJsonFile, ensureDirExists } = require('./utils');
const fs = require('fs').promises;
const path = require('path');
const config = require(path.join(__dirname, 'config.js')).step2;

async function getTimestampFromFilename(filename) {
    return filename.slice(13, 21);
}

async function renameFile(currentFilePath, newFilePath) {
    try {
        await fs.rename(currentFilePath, newFilePath);
                log('info', `  -> Renamed to: ${path.basename(newFilePath)}`);
            } catch (renameError) {
        log('error', `  -> Failed to rename processed file:`, renameError.message);
        throw renameError;
        }
        }

async function processJsonFile(currentFilePath, filename) {
    let jsonFile;
        try {
    jsonFile = await readJsonFile(currentFilePath);
        } catch (processingError) {
            log('error', `  -> Error processing data inside ${filename}:`, processingError.message);
        throw processingError;
        }
    if (!Array.isArray(jsonFile)) {
        log('warn', `  -> Content of ${filename} is not a JSON array. Skipping.`);
        return { error: true, message: `Content of ${filename} is not a JSON array` };
    }
    return jsonFile;
}

async function filterTopMatches(filename, existingTimestamps, config) {
    const currentFilePath = path.join(config.rawDataDir, filename);
    const newFilePath = path.join(config.rawDataDir, `${config.processedPrefix}${filename}`);
    const timestamp = getTimestampFromFilename(filename);

    if (!timestamp) {
        log('warn', `  -> Could not extract timestamp from ${filename}. Skipping.`);
        return { error: true, message: `Could not extract timestamp from ${filename}` };
    }

  if (existingTimestamps[timestamp]) {
        log('warn', `  -> Timestamp ${timestamp} already exists in output. Skipping processing but renaming file.`);
        await renameFile(currentFilePath, newFilePath);
        return { skipped: true, renamed: true, timestamp: timestamp };
    }

    let liveData;
    try {
    liveData = await processJsonFile(currentFilePath, filename);
    } catch (fileProcessingError) {
        log('error', fileProcessingError.message);
    return { success: false, error: true, message: fileProcessingError.message };
    }
  if (liveData && liveData.error) {
    log('error', `  -> Skipping file due to content error: ${liveData.message}`);
    return { success: false, error: true, message: liveData.message };
    }

    try {
        const sortedMatches = liveData
            .filter(match => match && typeof match.spectators === 'number' && match.match_id)
            .sort((a, b) => b.spectators - a.spectators);

        const topMatches = sortedMatches.slice(0, config.numberOfTopMatches);

        const topMatchesFormatted = {};
        let validMatchesCount = 0;
        topMatches.forEach(match => {
            if (typeof match.activate_time === 'number') {
                topMatchesFormatted[match.match_id.toString()] = [match.spectators, match.activate_time];
                validMatchesCount++;
        } else {
                log('warn', `  -> Match ${match.match_id} in ${filename} is missing \'activate_time\'. Excluding from top matches for this timestamp.`);
        }
        });

        if (validMatchesCount > 0) {
            await renameFile(currentFilePath, newFilePath);
            log('info', `  -> Processed ${validMatchesCount} top matches for timestamp ${timestamp}.`);
            return { success: true, timestamp: timestamp, topMatches: topMatchesFormatted, validMatchesCount: validMatchesCount, renamed: true };
    } else {
            log('info', `  -> No valid top matches (with activate_time) found in ${filename}.`);
            return { success: false, timestamp: timestamp, validMatchesCount: 0 };
    }
    } catch (processingError) {
        log('error', `  -> Error processing data inside ${filename}:`, processingError.message);
        throw processingError;
    }
}

async function runStep2() {
    log('info', `Starting Step 2: Filtering Top ${config.numberOfTopMatches} Matches...`);

  // Ensure the processed directory exists
  await ensureDirExists(config.processedDir);
    log('info', `Raw Data Dir: ${config.rawDataDir}`);
    log('info', `Output File: ${config.outputFile}`);

  // Load existing processed data to avoid reprocessing timestamps
  const existingProcessedData = await readJsonFile(config.outputFile);
  const existingTimestamps = {};
  if (existingProcessedData && Array.isArray(existingProcessedData.data)) {
    existingProcessedData.data.forEach(block => {
      if (block.timestamp) {
        existingTimestamps[block.timestamp] = true;
    }
    });
  }
  log('info', `Loaded ${existingProcessedData ? (existingProcessedData.data ? existingProcessedData.data.length : 0) : 0} existing timestamp blocks. ${Object.keys(existingTimestamps).length} unique timestamps found.`);
  const rawFiles = await fs.readdir(config.rawDataDir);
  log('info', `Found ${rawFiles.length} raw data files.`);

  // Filter files that need processing using a loop to handle await
  const newFiles = [];
  for (const file of rawFiles) {
    if (file.startsWith('live_data_') && file.endsWith('.json')) {
      const processedFilePath = path.join(config.rawDataDir, `${config.processedPrefix}${file}`);
            let alreadyProcessed = false;
            try {
                // Use fs.access to check if the processed file exists
                await fs.access(processedFilePath);
                alreadyProcessed = true; // If access succeeds, the file exists
            } catch (error) {
                // If fs.access throws, the file doesn't exist or is not accessible
                alreadyProcessed = false;
      }

            // Check if the file has *not* already been processed and renamed/moved
            if (!alreadyProcessed) {
                newFiles.push(file);
    }
  }
    }

  log('info', `Found ${newFiles.length} new raw data files to process.`);

  if (newFiles.length === 0) {
    log('info', 'No new files to process. Step 2 finished.');
    return; // Exit if no new files
    }

  const processedBlocks = [];
  for (const file of newFiles) {
    log('info', `\nProcessing file: ${file}`);
    const result = await filterTopMatches(file, existingTimestamps, config);

    if (result.success && result.topMatches) {
      processedBlocks.push({ timestamp: result.timestamp, top_matches: result.topMatches, validMatchesCount: result.validMatchesCount });
            } else {
      log('error', `  -> Skipping file ${file} due to processing error or no data.`);
            }
            }

  // Combine new processed blocks with existing data
  let finalData = { data: [] };
  if (existingProcessedData && Array.isArray(existingProcessedData.data)) {
    finalData.data = existingProcessedData.data;
        }
  finalData.data = finalData.data.concat(processedBlocks);

  // Write the combined data back to the processed file
  await writeJsonFile(config.outputFile, finalData);

  log('info', 'Step 2: Filtering Top Matches completed.');
    }

runStep2();

