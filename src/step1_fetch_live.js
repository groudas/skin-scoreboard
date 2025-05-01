// src/step1_fetch_live.js
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
            const dataString = JSON.stringify(response.data, null, 2);

            if (Array.isArray(response.data) && response.data.length > 0) {
                fs.writeFileSync(outputFilePath, dataString);
                log('info', `Success. Data saved to ${outputFilename}`);
            } else if (Array.isArray(response.data) && response.data.length === 0) {
                 fs.writeFileSync(outputFilePath, dataString);
                 log('warn', `Saved file is an empty array. Server returned no live games? Saved to ${outputFilename}.`);
            } else {
                 fs.writeFileSync(outputFilePath, dataString);
                 log('warn', `Saved file does not contain a JSON array as expected. Check API response format. Saved to ${outputFilename}.`);
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