// src/step3_fetch_match_details.js
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import config from '../config.js';
import { log, ensureDirExists, sleep, readJsonFile, writeJsonFile } from '../utils.js';

async function fetchAndSaveMatch(matchId, outputFilePath) {
    const apiUrl = `${config.step3.apiBaseUrl}${matchId}`;
    log('debug', `  -> Fetching from: ${apiUrl}`);
    try {
        const response = await axios.get(apiUrl, {
            timeout: config.step3.requestTimeoutMs,
        });

        if (response.status === 200 && response.data) {
            if (writeJsonFile(outputFilePath, response.data)) {
                log('info', `  -> Success! Saved to ${path.basename(outputFilePath)}`);
                return 'fetched';
            } else {
                log('error', `  -> Failed to write downloaded data for ${matchId} to file.`);
                return 'error';
            }
        } else {
            log('warn', `  -> Received non-200 status for ${matchId}: ${response.status}`);
            return 'error';
        }
    } catch (error) {
        if (error.response) {
            log('error', `  -> API Error for ${matchId}: Status ${error.response.status} - ${error.response.statusText}`);
            if (error.response.status === 404) {
                log('warn', `  -> Match ${matchId} not found on OpenDota API (404).`);
                return 'not_found';
            }
        } else if (error.request) {
            log('error', `  -> Network Error for ${matchId}: No response received. Timeout: ${config.step3.requestTimeoutMs}ms.`, error.message);
        } else {
            log('error', `  -> Request Setup Error for ${matchId}:`, error.message);
        }
        return 'error';
    }
}


async function runStep3() {
    log('info', "Starting Step 3: Fetching Match Details...");
    if (!ensureDirExists(config.step3.outputDir)) {
        log('error', 'Output directory cannot be created/accessed. Exiting.');
        process.exit(1);
    }

    const filteredData = readJsonFile(config.step3.filteredMatchesFile);
    if (!filteredData) {
        log('error', `Failed to load or parse ${config.step3.filteredMatchesFile}. Exiting.`);
        process.exit(1);
    }
    if (!Array.isArray(filteredData)) {
        log('error', `Data in ${config.step3.filteredMatchesFile} is not a valid JSON array. Exiting.`);
        process.exit(1);
    }

    const matchIdsToCheck = new Map();
    const now = Date.now();
    const minAgeMillis = config.step3.minimumMatchAgeHours * 60 * 60 * 1000;

    log('info', `Checking match age against current time. Minimum age: ${config.step3.minimumMatchAgeHours} hours.`);

    filteredData.forEach(block => {
        if (block && block.timestamp && block.top_matches) {
            Object.entries(block.top_matches).forEach(([matchId, matchInfo]) => {
                if (Array.isArray(matchInfo) && matchInfo.length === 2 && typeof matchInfo[1] === 'number') {
                    const activateTime = matchInfo[1];
                    const activateTimeMillis = activateTime * 1000;
                    const ageMillis = now - activateTimeMillis;

                    if (ageMillis >= minAgeMillis) {
                        if (!matchIdsToCheck.has(matchId)) {
                            log('debug', `  -> Match ${matchId} (activated: ${new Date(activateTimeMillis).toISOString()}) meets age requirement. Added for download check.`);
                            matchIdsToCheck.set(matchId, { activate_time: activateTime, earliest_timestamp: block.timestamp });
                        } else {
                             if(block.timestamp < matchIdsToCheck.get(matchId).earliest_timestamp) {
                                 matchIdsToCheck.get(matchId).earliest_timestamp = block.timestamp;
                             }
                        }
                    } else {
                        if (!matchIdsToCheck.has(matchId)) {
                            log('debug', `  -> Match ${matchId} (activated: ${new Date(activateTimeMillis).toISOString()}) is too recent (${(ageMillis / (1000 * 60 * 60)).toFixed(2)}h old). Skipping for now.`);
                        }
                    }
                } else {
                    log('warn', `  -> Invalid match data format for match_id ${matchId} in timestamp block ${block.timestamp}. Skipping.`);
                }
            });
        }
    });

    const uniqueMatchIds = Array.from(matchIdsToCheck.keys());
    log('info', `Found ${uniqueMatchIds.length} unique match IDs meeting the age requirement.`);

    if (uniqueMatchIds.length === 0) {
        log('info', "No matches meet the criteria for downloading details at this time.");
        log('info', "Step 3 finished.");
        return;
    }

    let fetchedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;

    log('info', `Starting download process. Delay between requests: ${config.step3.requestDelayMs / 1000}s`);

    for (let i = 0; i < uniqueMatchIds.length; i++) {
        const matchId = uniqueMatchIds[i];
        const outputFilePath = path.join(config.step3.outputDir, `${matchId}.json`);
        const progress = `(${(i + 1)}/${uniqueMatchIds.length})`;

        log('info', `${progress} Checking match ${matchId}...`);

        if (fs.existsSync(outputFilePath)) {
            log('info', `  -> Skipping ${matchId}.json (already exists)`);
            skippedCount++;
        } else {
            log('info', `  -> File not found. Preparing to download ${matchId}.json`);
            if (i > 0 || fetchedCount > 0 || errorCount > 0 || notFoundCount > 0) {
                 await sleep(config.step3.requestDelayMs);
            }

            const fetchResult = await fetchAndSaveMatch(matchId, outputFilePath);

            switch (fetchResult) {
                case 'fetched':
                    fetchedCount++;
                    break;
                case 'not_found':
                    notFoundCount++;
                    break;
                case 'error':
                default:
                    errorCount++;
                    break;
            }
        }
    }

    log('info', `\n--- Step 3 Summary ---`);
    log('info', `Total unique matches meeting age criteria: ${uniqueMatchIds.length}`);
    log('info', `Successfully downloaded: ${fetchedCount}`);
    log('info', `Skipped (already existed): ${skippedCount}`);
    log('info', `Not Found (404): ${notFoundCount}`);
    log('info', `Errors (network/API/write): ${errorCount}`);
    log('info', `----------------------`);
    log('info', "Step 3 finished.");
}

runStep3();