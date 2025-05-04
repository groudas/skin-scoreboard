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
        jsonFile = readJsonFile(currentFilePath);
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

    if (existingTimestamps.has(timestamp)) {
        log('warn', `  -> Timestamp ${timestamp} already exists in output. Skipping processing but renaming file.`);
        await renameFile(currentFilePath, newFilePath);
        return { skipped: true, renamed: true, timestamp: timestamp };
    }

    let liveData;
    try {
        liveData = processJsonFile(currentFilePath, filename);
    } catch (fileProcessingError) {
        log('error', fileProcessingError.message);
        return { error: true, message: fileProcessingError.message };
    }
    if (liveData.error) {
        return { success: false, error: liveData.error, message: liveData.message };
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
    if (!ensureDirExists(config.rawDataDir) || !ensureDirExists(config.processedDir)) {
        log('error', 'Input or output directory cannot be created/accessed. Exiting.');
        process.exit(1);
    }

    log('info', `Raw Data Dir: ${config.rawDataDir}`);
    log('info', `Output File: ${config.outputFile}`);

    let allFilteredResults = readJsonFile(config.outputFile) || [];
    if (!Array.isArray(allFilteredResults)) {
        log('warn', `Existing output file ${config.outputFile} is not a valid JSON array. Starting fresh.`);
        allFilteredResults = [];
    }
    const existingTimestamps = new Set(allFilteredResults.map(item => item.timestamp));
    log('info', `Loaded ${allFilteredResults.length} existing timestamp blocks. ${existingTimestamps.size} unique timestamps found.`);

    let filesToProcess = [];
    try {
        const allFiles = fs.readdirSync(config.rawDataDir);
        filesToProcess = allFiles
            .filter(file =>
                /^live_data_\d{8}_\d{6}\.json$/.test(file) &&
                !fs.existsSync(path.join(config.rawDataDir, `${config.processedPrefix}${file}`))
            )
            .sort();
        log('info', `Found ${filesToProcess.length} new raw data files to process.`);
    } catch (error) {
        log('error', `Failed to read raw data directory ${config.rawDataDir}:`, error.message);
        process.exit(1);
    }

    if (filesToProcess.length === 0) {
        log('info', "No new raw files found to process.");
        if (!fs.existsSync(config.outputFile)) {
            writeJsonFile(config.outputFile, []);
        }
    log('info', "Step 2 finished.");
        return;
}
    let newBlocksAdded = 0;
    let processedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const filename of filesToProcess) {
        log('info', `\nProcessing file: ${filename}`);
        const result = await filterTopMatches(filename, existingTimestamps, config);

        if (result.success) {
            if (result.validMatchesCount > 0) {
                allFilteredResults.push({
                    timestamp: result.timestamp,
                    top_matches: result.topMatches
                });
                existingTimestamps.add(result.timestamp);
                newBlocksAdded++;
                processedCount++;
        } else {
                processedCount++;
        }
            if (result.error || !result.renamed) {
                errorCount++;
    }
        } else if (result.skipped) {
            skippedCount++;
            if (result.error || !result.renamed) {
                errorCount++;
            }
        } else if (result.error) {
            errorCount++;
        }

        log('info', `  -> Finished processing ${filename}. Result: ${result.success ? 'Success' : result.skipped ? 'Skipped' : 'Error'}. ${result.message || ''}`);
    }

    allFilteredResults.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (writeJsonFile(config.outputFile, allFilteredResults)) {
        log('info', `\nSuccessfully updated ${config.outputFile} with ${newBlocksAdded} new timestamp blocks.`);
    } else {
        log('error', `\nFailed to write updated data to ${config.outputFile}.`);
    }

    log('info', `\n--- Step 2 Summary ---`);
    log('info', `Files found for processing: ${filesToProcess.length}`);
    log('info', `Files processed successfully (data extracted): ${processedCount}`);
    log('info', `Files skipped (timestamp already exists): ${skippedCount}`);
    log('info', `Files with errors: ${errorCount}`);
    log('info', `New timestamp blocks added to output: ${newBlocksAdded}`);
    log('info', `Total blocks in output file: ${allFilteredResults.length}`);
    log('info', `----------------------`);
    log('info', "Step 2 finished.");
}

runStep2();
