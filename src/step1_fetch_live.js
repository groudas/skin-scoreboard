const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config').step1;
const { log, ensureDirExists, sleep } = require('./utils');

async function fetchLiveData() {
    log('info', `Fetching live data from ${config.targetUrl}`);

    const timestamp = new Date();
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hours = String(timestamp.getHours()).padStart(2, '0');
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const seconds = String(timestamp.getSeconds()).padStart(2, '0');
    const timestampStr = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    const outputFilename = `live_data_${timestampStr}${config.fileExt}`;
    const outputFilePath = path.join(config.outputDir, outputFilename);

    log('info', `Saving to: ${outputFilePath}`);

    try {
        const response = await axios.get(config.targetUrl, {
            timeout: config.requestTimeoutMs,
        });

        if (response.status === 200 && response.data) {
            let rawData = response.data;

            if (Array.isArray(rawData)) {
                const validData = [];
                let invalidCount = 0;
                rawData.forEach((item, index) => {
                    if (item && typeof item === 'object' && item !== null &&
                        typeof item.match_id === 'number' &&
                        typeof item.spectators === 'number' &&
                        typeof item.activate_time === 'number') {
                        validData.push(item);
                    } else {
                        log('warn', `  -> Invalid item format at index ${index} in live data array. Skipping. Item: ${JSON.stringify(item).substring(0, 200)}...`);
                        invalidCount++;
                    }
                });

                if (validData.length > 0) {
                    const dataString = JSON.stringify(validData, null, 2);
                    fs.writeFileSync(outputFilePath, dataString);
                    log('info', `Success. Saved ${validData.length} valid items to ${outputFilename}. Skipped ${invalidCount} invalid items.`);
                } else if (rawData.length > 0 && validData.length === 0) {
                    log('warn', `Raw data array had ${rawData.length} items, but none were valid. Saving empty array. Check API response format. Saved to ${outputFilename}.`);
                    fs.writeFileSync(outputFilePath, JSON.stringify([], null, 2));
                } else {
                    fs.writeFileSync(outputFilePath, JSON.stringify([], null, 2));
                    log('warn', `Saved file is an empty array. Server returned no live games? Saved to ${outputFilename}.`);
                }
            } else {
                const dataString = JSON.stringify(rawData, null, 2);
                fs.writeFileSync(outputFilePath, dataString);
                log('warn', `Saved file does not contain a JSON array as expected. Check API response format. Saved raw data to ${outputFilename}.`);
            }
        } else {
            log('error', `Request failed or returned unexpected status: ${response.status}`);
        }
    } catch (error) {
        log('error', `Error during fetch or save for ${outputFilename}:`, error.message);
        if (fs.existsSync(outputFilePath)) {
            try {
                fs.unlinkSync(outputFilePath);
                log('info', `Cleaned up potentially incomplete file: ${outputFilename}`);
            } catch (cleanupError) {
                log('error', `Failed to cleanup file ${outputFilename}:`, cleanupError.message);
            }
        }
    }
}

async function mainLoop() {
    if (!ensureDirExists(config.outputDir)) {
        log('error', 'Output directory creation failed. Exiting.');
        process.exit(1);
    }

    log('info', `Starting live data fetcher. Interval: ${config.intervalSeconds} seconds.`);

    while (true) {
        await fetchLiveData();
        log('info', `Waiting for ${config.intervalSeconds} seconds...`);
        log('info', `--------------------------------------------------`);
        await sleep(config.intervalSeconds * 1000);
    }
}

mainLoop();