import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { log, ensureDirExists, readJsonFile, writeJsonFile } from '../utils.js';

function getTimestampFromFilename(filename) {
    const match = filename.match(/live_data_(\d{8}_\d{6})\.json$/);
    return match ? match[1] : null;
}

async function runStep2() {
    log('info', `Starting Step 2: Filtering Top ${config.step2.numberOfTopMatches} Matches...`);
    if (!ensureDirExists(config.step2.rawDataDir) || !ensureDirExists(config.step2.processedDir)) {
        log('error', 'Input or output directory cannot be created/accessed. Exiting.');
        process.exit(1);
    }

    log('info', `Raw Data Dir: ${config.step2.rawDataDir}`);
    log('info', `Output File: ${config.step2.outputFile}`);

    let allFilteredResults = readJsonFile(config.step2.outputFile) || [];
    if (!Array.isArray(allFilteredResults)) {
        log('warn', `Existing output file ${config.step2.outputFile} is not a valid JSON array. Starting fresh.`);
        allFilteredResults = [];
    }
    const existingTimestamps = new Set(allFilteredResults.map(item => item.timestamp));
    log('info', `Loaded ${allFilteredResults.length} existing timestamp blocks. ${existingTimestamps.size} unique timestamps found.`);

    let filesToProcess = [];
    try {
        const allFiles = fs.readdirSync(config.step2.rawDataDir);
        filesToProcess = allFiles
            .filter(file =>
                /^live_data_\d{8}_\d{6}\.json$/.test(file) &&
                !fs.existsSync(path.join(config.step2.rawDataDir, `${config.step2.processedPrefix}${file}`))
            )
            .sort();
        log('info', `Found ${filesToProcess.length} new raw data files to process.`);
    } catch (error) {
        log('error', `Failed to read raw data directory ${config.step2.rawDataDir}:`, error.message);
        process.exit(1);
    }

    if (filesToProcess.length === 0) {
        log('info', "No new raw files found to process.");
        if (!fs.existsSync(config.step2.outputFile)) {
            writeJsonFile(config.step2.outputFile, []);
        }
        log('info', "Step 2 finished.");
        return;
    }

    let newBlocksAdded = 0;
    let processedCount = 0;
    let errorCount = 0;

    for (const filename of filesToProcess) {
        const currentFilePath = path.join(config.step2.rawDataDir, filename);
        const newFilePath = path.join(config.step2.rawDataDir, `${config.step2.processedPrefix}${filename}`);
        const timestamp = getTimestampFromFilename(filename);

        log('info', `\nProcessing file: ${filename}`);

        if (!timestamp) {
            log('warn', `  -> Could not extract timestamp from ${filename}. Skipping.`);
            errorCount++;
            continue;
        }

        if (existingTimestamps.has(timestamp)) {
            log('warn', `  -> Timestamp ${timestamp} already exists in output. Skipping processing but renaming file.`);
            try {
                fs.renameSync(currentFilePath, newFilePath);
                log('info', `  -> Renamed to: ${path.basename(newFilePath)}`);
            } catch (renameError) {
                log('error', `  -> Failed to rename already processed file ${filename}:`, renameError.message);
            errorCount++;
        }
            continue;
        }

        const liveData = readJsonFile(currentFilePath);

        if (!liveData) {
            log('warn', `  -> Failed to read or parse ${filename}. Skipping.`);
            errorCount++;
            continue;
        }

        if (!Array.isArray(liveData)) {
            log('warn', `  -> Content of ${filename} is not a JSON array. Skipping.`);
            errorCount++;
            continue;
    }

        try {
            const sortedMatches = liveData
                .filter(match => match && typeof match.spectators === 'number' && match.match_id)
                .sort((a, b) => b.spectators - a.spectators);

            const topMatches = sortedMatches.slice(0, config.step2.numberOfTopMatches);

            const topMatchesFormatted = {};
            let validMatchesCount = 0;
            topMatches.forEach(match => {
                if (typeof match.activate_time === 'number') {
                    topMatchesFormatted[match.match_id.toString()] = [match.spectators, match.activate_time];
                    validMatchesCount++;
        } else {
                    log('warn', `  -> Match ${match.match_id} in ${filename} is missing 'activate_time'. Excluding from top matches for this timestamp.`);
        }
            });

            if (validMatchesCount > 0) {
                allFilteredResults.push({
                    timestamp: timestamp,
                    top_matches: topMatchesFormatted
                });
                existingTimestamps.add(timestamp);
                newBlocksAdded++;
                log('info', `  -> Added ${validMatchesCount} top matches for timestamp ${timestamp}.`);
    } else {
                log('info', `  -> No valid top matches (with activate_time) found in ${filename}.`);
    }

            fs.renameSync(currentFilePath, newFilePath);
            log('info', `  -> Renamed to: ${path.basename(newFilePath)}`);
            processedCount++;

        } catch (processingError) {
            log('error', `  -> Error processing data inside ${filename}:`, processingError.message);
            errorCount++;
        }
    }

    if (newBlocksAdded > 0) {
        allFilteredResults.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        if (writeJsonFile(config.step2.outputFile, allFilteredResults)) {
            log('info', `\nSuccessfully updated ${config.step2.outputFile} with ${newBlocksAdded} new timestamp blocks.`);
        } else {
             log('error', `\nFailed to write updated data to ${config.step2.outputFile}.`);
        }
    } else {
         log('info', `\nNo new data added to ${config.step2.outputFile}.`);
    }

    log('info', `\n--- Step 2 Summary ---`);
    log('info', `Files processed: ${processedCount}`);
    log('info', `New timestamp blocks added: ${newBlocksAdded}`);
    log('info', `Files skipped/errored: ${errorCount + (filesToProcess.length - processedCount - errorCount)}`);
    log('info', `Total blocks in output: ${allFilteredResults.length}`);
    log('info', `----------------------`);
    log('info', "Step 2 finished.");
}

runStep2();