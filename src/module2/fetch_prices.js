import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { randomSleep } from '../utils.js';

//::Carregar pricedb.json e DAILY_COSMETIC_STATS_MARKETABLE.json::
let priceDB = {};
let itemsDB = [];

// --- Load itemsDB ---
try {
    const itemsDbRaw = fs.readFileSync(config.module2.itemsDbFile, { encoding: 'utf8' });
    try {
        const parsedItemsDb = JSON.parse(itemsDbRaw);
        let allItemNames = new Set();
        if (Array.isArray(parsedItemsDb)) {
            parsedItemsDb.forEach(entry => {
                if (entry && typeof entry.items === 'object') {
                    Object.keys(entry.items).forEach(itemName => allItemNames.add(itemName));
                }
            });
        } else {
             console.warn(`ItemsDB file "${config.module2.itemsDbFile}" did not contain an array. Items list will be empty.`);
        }
        itemsDB = Array.from(allItemNames);
        console.log(`File ${config.module2.itemsDbFile} loaded and parsed. Found ${itemsDB.length} unique items.`);
    } catch (e) {
        console.error(`Failed to parse ItemsDB file "${config.module2.itemsDbFile}".`, e);

    }
} catch (e) {
    console.error(`Error when loading items database file "${config.module2.itemsDbFile}". Item discovery will be impossible. Only items already in PriceDB will be updated.`, e);
}

// --- Load priceDB ---
const priceDBFile = config.module2.priceDbFile;

if (fs.existsSync(priceDBFile)) {
  try {
    const fileContent = fs.readFileSync(priceDBFile, { encoding: 'utf8' });

    if (fileContent.trim() === '') {
        console.warn(`PriceDB file "${priceDBFile}" is empty. Starting with an empty database.`);
        priceDB = {};
    } else {
        priceDB = JSON.parse(fileContent);
        console.log(`File ${priceDBFile} loaded and parsed successfully. Contains ${Object.keys(priceDB).length} items.`);
    }
  } catch (e) {
    console.error(`Error loading or parsing PriceDB file "${priceDBFile}":`, e.message);
    console.error("Due to the error, the application will exit. Please fix the file or remove it.");
    process.exit(1);
  }
} else {
  console.log(`PriceDB file "${priceDBFile}" not found. Starting with an empty database.`);
  priceDB = {};
}


const itemsToProcess = new Set([...itemsDB, ...Object.keys(priceDB)]);

if (itemsToProcess.size === 0) {
    console.log("No items found in ItemsDB or PriceDB. Nothing to process. Terminating price fetching process.");
    process.exit(0);
} else {
    console.log(`Found ${itemsToProcess.size} unique items to potentially process/update.`);
}


//::Função para extrair histórico de preço::
/**
 * Extracts price history array from a Steam Community Market listing page.
 * @param {string} itemString The name of the item (e.g., "A Dire Gaze").
 * @returns {Promise<Array<Array<string|number|string>> | null>} A promise that resolves with the price history array on success, or null on failure.
 */
async function extractPriceHistory(itemString) {
    let url = `https://steamcommunity.com/market/listings/570/${encodeURIComponent(itemString)}`;
    const targetFingerprint = 'var line1=[[';

    try {
        console.log(`Fetching URL for ${itemString}: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',

            },
            timeout: 15000
        });

        const html = response.data;


        const $ = cheerio.load(html);

        const scriptElements = $('script');

        let targetScriptContent = null;


        scriptElements.each((index, element) => {
            const currentScriptContent = $(element).html();
            if (currentScriptContent && currentScriptContent.includes(targetFingerprint)) {

                targetScriptContent = currentScriptContent;
                return false;
            }
        });

        if (targetScriptContent) {

            const line1Regex = /\bvar\s+line1\s*=\s*(\[\[[\s\S]*?\]\]);/;
            const match = targetScriptContent.match(line1Regex);

            if (match && match[1]) {
                const line1ArrayString = match[1];


                try {

                    const priceHistoryArray = JSON.parse(line1ArrayString);

                    console.log(`Successfully extracted history for ${itemString}. Data points: ${priceHistoryArray.length}`);

                    return priceHistoryArray;

                } catch (e) {
                    console.error(`Error parsing the extracted line1 array string for "${itemString}" as JSON:`, e.message);
                    console.log("Extracted string that failed to parse (first 500 chars):");
                    console.log(line1ArrayString.substring(0,500));
                    return null;
                }
            } else {
                console.warn(`Could not find 'var line1=[[...]];' with regex in the target script for "${itemString}".`);
                console.warn("The script content might have changed, or the regex needs adjustment.");
                return null;
            }
        } else {
            console.warn(`Target script containing "${targetFingerprint}" NOT FOUND for "${itemString}".`);
            console.warn("This could mean the fingerprint changed, or the page structure is different (e.g., CAPTCHA).");

            return null;
        }

    } catch (error) {
        console.error(`Error fetching or processing "${itemString}":`);
        if (error.response) {
            console.error("Status:", error.response.status);

            if (error.response.status === 429) {
                console.error("Received 429 Too Many Requests. Consider increasing sleep time.");
            }
        } else if (error.request) {
            console.error("Request Error: No response received.", error.request.code);
        } else {
            console.error("Error Message:", error.message);
        }
        return null;
    }
}


async function processItems() {
    console.log("\n--- Starting price history fetching process ---");

    const itemsArrayToProcess = Array.from(itemsToProcess);

    for (const item of itemsArrayToProcess) {
        console.log(`\nProcessing item: ${item}`);


        const historyData = await extractPriceHistory(item);

        if (historyData) {

            priceDB[item] = historyData;
            console.log(`Successfully updated price data for "${item}" in memory.`);


             if (index % 10 === 0) { // Save every 10 items
                 console.log(`Saving progress after processing ${index + 1} items...`);
                 try {
                     const dir = path.dirname(priceDBFile);
                     fs.mkdirSync(dir, { recursive: true });
                     fs.writeFileSync(priceDBFile, JSON.stringify(priceDB, null, 2), { encoding: 'utf8' });
                     console.log("Progress saved.");
                 } catch (saveError) {
                     console.error("Error saving progress file:", saveError);
                 }
             }

        } else {
            console.warn(`Skipping update for "${item}" due to failed data extraction.`);
        }

        console.log("Waiting randomly before the next request...");
        await randomSleep();
    }


    console.log("\n--- All items processed. Saving final PriceDB file ---");
    try {
        const dir = path.dirname(priceDBFile);
        fs.mkdirSync(dir, { recursive: true });


        const jsonOutput = JSON.stringify(priceDB, null, 2);

        fs.writeFileSync(priceDBFile, jsonOutput, { encoding: 'utf8' });
        console.log(`Successfully saved updated PriceDB to "${priceDBFile}". Total items saved: ${Object.keys(priceDB).length}`);
    } catch (saveError) {
        console.error(`Error saving final PriceDB file "${priceDBFile}":`, saveError);
    }

    console.log("\n--- Price history fetching process finished ---");
}


processItems();