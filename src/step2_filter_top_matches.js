const fs = require('fs');
const path = require('path');
const config = require('./config').step2;
const { log, ensureDirExists, readJsonFile, writeJsonFile } = require('./utils');
const mongoose = require('mongoose');
const DailyReport = require('./models/DailyReport');

function getTimestampFromFilename(filename) {
    const match = filename.match(/live_data_(\d{8}_\d{6})\.json$/);
    return match ? match[1] : null;
}

async function runStep2() {
    log('info', `Starting Step 2: Filtering Top ${config.numberOfTopMatches} Matches...`);
    if (!ensureDirExists(config.rawDataDir) || !ensureDirExists(config.processedDir)) {
        log('error', 'Input or output directory cannot be created/accessed. Exiting.');
        process.exit(1);
    }

    try {
        await mongoose.connect("mongodb://localhost:27017/skinscoreboard", {
            serverSelectionTimeoutMS: 5000
        });
        log('info', 'MongoDB connection successful.');
    } catch (error) {
        log('error', 'MongoDB connection failed:', error.message);
        process.exit(1);
    }

    log('info', `Raw Data Dir: ${config.rawDataDir}`);

    log('info', 'Checking for existing timestamps in MongoDB...');
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
    log('info', "Step 2 finished.");
        await mongoose.disconnect();
        log('info', 'MongoDB connection closed.');
        return;
}

    let newBlocksAdded = 0;
    let processedCount = 0;
    let errorCount = 0;

    for (const filename of filesToProcess) {
        const currentFilePath = path.join(config.rawDataDir, filename);
        const newFilePath = path.join(config.rawDataDir, `${config.processedPrefix}${filename}`);
        const timestamp = getTimestampFromFilename(filename);

        log('info', `\nProcessing file: ${filename}`);

        if (!timestamp) {
            log('warn', `  -> Could not extract timestamp from ${filename}. Skipping.`);
            errorCount++;
            continue;
        }

        try {
            const existingReport = await DailyReport.findOne({ timestamp: timestamp });
            if (existingReport) {
                log('warn', `  -> Timestamp ${timestamp} already exists in database. Skipping processing but renaming file.`);
                try {
                    fs.renameSync(currentFilePath, newFilePath);
                    log('info', `  -> Renamed to: ${path.basename(newFilePath)}`);
                } catch (renameError) {
                    log('error', `  -> Failed to rename already processed file ${filename}:`, renameError.message);
                    errorCount++;
                }
                continue;
            }
        } catch (dbError) {
            log('error', `  -> Database error checking for timestamp ${timestamp}:`, dbError.message);
            errorCount++;
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

            const topMatches = sortedMatches.slice(0, config.numberOfTopMatches);

            const topMatchesFormatted = [];
            let validMatchesCount = 0;
            topMatches.forEach(match => {
                if (typeof match.activate_time === 'number') {
                    topMatchesFormatted.push({
                        matchId: match.match_id.toString(),
                        spectators: match.spectators,
                        activateTime: new Date(match.activate_time * 1000)
                    });
                    validMatchesCount++;
                } else {
                    log('warn', `  -> Match ${match.match_id} in ${filename} is missing 'activate_time'. Excluding from top matches for this timestamp.`);
                }
            });

            if (validMatchesCount > 0) {
                try {
                    const dailyReport = new DailyReport({
                        timestamp: timestamp,
                        matches: topMatchesFormatted.map(match => ({
                            match_id: match.matchId,
                            spectators: match.spectators,
                            activateTime: match.activateTime
                        })),
                        items: new Map()
                    });
                    await dailyReport.save();
                    newBlocksAdded++;
                    log('info', `  -> Successfully saved ${validMatchesCount} top matches for timestamp ${timestamp} to database.`);
                } catch (saveError) {
                    log('error', `  -> Failed to save data for timestamp ${timestamp} to database:`, saveError.message);
                    errorCount++;
                    continue;
                }
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

    log('info', `\n--- Step 2 Summary ---`);
    log('info', `Files successfully processed and data added to DB: ${newBlocksAdded}`);
    log('info', `Files skipped (existing timestamp): ${processedCount - newBlocksAdded}`);
    log('info', `Files with processing errors: ${errorCount}`);
    log('info', `----------------------`);
    log('info', "Step 2 finished.");

    await mongoose.disconnect();
    log('info', 'MongoDB connection closed.');
}

runStep2();