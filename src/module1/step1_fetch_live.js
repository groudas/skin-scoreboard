import axios from 'axios';
import fs from 'fs';
import path from 'path';
import configModule from '../config.js';
import * as utils from '../utils.js';

const config = configModule.step1;

function formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

async function fetchLiveData() {
    utils.log('info', `Fetching live data from ${config.targetUrl}`);

    try {
        const response = await axios.get(config.targetUrl, { timeout: config.requestTimeoutMs });
        const data = response.data;

        const now = new Date();
        const timestamp = formatTimestamp(now);
        const outputFilename = `${config.filenamePrefix}_${timestamp}${config.fileExt}`;
        const outputFilePath = path.join(config.outputDir, outputFilename);

        utils.log('info', `Saving to: ${outputFilePath}`);

        if (response.status === 200) {
            if (Array.isArray(data)) {
                if (data.length > 0) {
                    fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2));
                utils.log('info', `Success. Data saved to ${outputFilename}`);
                    try {
                        const stats = fs.statSync(outputFilePath);
                        utils.log('debug', `File successfully written. Size: ${stats.size} bytes.`);
                    } catch (statError) {
                        utils.log('debug', `Error stating file after write: ${statError.message}`);
            }
        } else {
                    fs.writeFileSync(outputFilePath, JSON.stringify(data));
                    utils.log('warn', `Saved file is an empty array. Server returned no live games? Saved to ${outputFilename}.`);
        }
        } else {
                utils.log('warn', `API response is not an array. Check API format. Response content type: ${typeof data}`);
                fs.writeFileSync(outputFilePath, JSON.stringify(data, null, 2));
                utils.log('warn', `Saved potentially unexpected data format to ${outputFilename}.`);
            try {
                    const stats = fs.statSync(outputFilePath);
                    utils.log('debug', `File successfully written (unexpected format). Size: ${stats.size} bytes.`);
                } catch (statError) {
                    utils.log('debug', `Error stating file after write (unexpected format): ${statError.message}`);
    }
}
        } else {
            utils.log('error', `Request failed or returned unexpected status: ${response.status}. Response data:`, data);
            // No automatic cleanup here - let the catch block handle potential errors.
    }
    } catch (error) {
        // Ensure outputFilePath is defined in catch scope
        const now = new Date();
        const timestamp = formatTimestamp(now);
        const outputFilename = `${config.filenamePrefix}_${timestamp}${config.fileExt}`;
        const outputFilePath = path.join(config.outputDir, outputFilename);

        utils.log('error', `Error during fetch or save for ${outputFilename}:`, error.message);

        if (fs.existsSync(outputFilePath)) {
            utils.log('info', `File ${outputFilename} exists in catch block. Attempting cleanup.`);
            try {
                fs.unlinkSync(outputFilePath);
                utils.log('info', `Cleaned up: ${outputFilename}`);
            } catch (cleanupError) {
                utils.log('error', `Failed to cleanup file ${outputFilename}:`, cleanupError.message);
}
        }
    }
}

async function mainLoop() {
    if (!utils.ensureDirExists(config.outputDir)) {
        utils.log('error', 'Output directory creation failed. Exiting.');
        process.exit(1);
    }

    utils.log('info', `Starting live data fetcher. Interval: ${config.intervalSeconds} seconds.`);

    while (true) {
        await fetchLiveData();
        utils.log('info', `Waiting for ${config.intervalSeconds} seconds...`);
        utils.log('info', `--------------------------------------------------`);
        await utils.sleep(config.intervalSeconds * 1000);
    }
}

utils.log('info', 'Script starting...');
mainLoop();