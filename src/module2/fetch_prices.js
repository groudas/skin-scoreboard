import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import config from '../config.js';
import { randomSleep } from '../utils.js';

//::Load pricedb.json and DAILY_COSMETIC_STATS_MARKETABLE.json::
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


//::Function to extract price history::

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

function calculateMedian(numbers) {
    if (!numbers || numbers.length === 0) {
        return 0; // Or handle as an error, or return null
    }
    const sortedNumbers = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sortedNumbers.length / 2);

    if (sortedNumbers.length % 2 === 0) {
        // Even number of elements, average of the two middle ones
        return (sortedNumbers[mid - 1] + sortedNumbers[mid]) / 2;
    } else {
        // Odd number of elements, the middle one
        return sortedNumbers[mid];
    }
}

function consolidatePriceData(priceDB) {
    const consolidatedDB = {};

    for (const itemName in priceDB) {
        if (Object.hasOwnProperty.call(priceDB, itemName)) {
            const itemEntries = priceDB[itemName];
            if (!Array.isArray(itemEntries) || itemEntries.length === 0) {
                consolidatedDB[itemName] = []; // Keep empty if no entries
                continue;
            }

            const dailyAggregates = {}; // Key: "Mon DD YYYY", Value: { prices: [], volumes: [], firstFullDate: "" }

            for (const entry of itemEntries) {
                if (!Array.isArray(entry) || entry.length < 3) {
                    console.warn(`Skipping malformed entry for ${itemName}:`, entry);
                    continue;
                }
                const [fullDateStr, price, volumeStr] = entry;

                // Extract just the date part (e.g., "May 15 2025")
                // Assuming format "Mon DD YYYY HH: +TZ"
                const dateParts = fullDateStr.split(" ");
                if (dateParts.length < 3) {
                    console.warn(`Skipping entry with unparseable date for ${itemName}: ${fullDateStr}`);
                    continue;
                }
                const dayKey = `${dateParts[0]} ${dateParts[1]} ${dateParts[2]}`;

                if (!dailyAggregates[dayKey]) {
                    dailyAggregates[dayKey] = {
                        prices: [],
                        volumes: [],
                        // Store the first full date string encountered for this day
                        // This will be used as the representative date for the consolidated entry
                        firstFullDate: fullDateStr
                    };
                }

                dailyAggregates[dayKey].prices.push(parseFloat(price));
                dailyAggregates[dayKey].volumes.push(parseInt(volumeStr, 10));
            }

            const consolidatedEntriesForItem = [];
            // Ensure days are processed in chronological order if possible
            // Object.keys doesn't guarantee order, but if they were added chronologically, they often are.
            // For true chronological order, you'd parse dayKey and sort.
            // However, Steam data is usually chronological, so this often works out.
            const sortedDayKeys = Object.keys(dailyAggregates).sort((a, b) => {
                // Attempt to sort by date if necessary, though steam data is usually in order
                // For simplicity, we'll rely on typical insertion order or that steam data is pre-sorted
                // A more robust sort would parse 'a' and 'b' into Date objects.
                // For now, let's trust the input order or accept object key order.
                // To ensure, we'd parse dailyAggregates[a].firstFullDate and dailyAggregates[b].firstFullDate
                return new Date(dailyAggregates[a].firstFullDate.split(" ").slice(0,3).join(" ")) - new Date(dailyAggregates[b].firstFullDate.split(" ").slice(0,3).join(" "));
            });


            for (const dayKey of sortedDayKeys) {
                const data = dailyAggregates[dayKey];
                const medianPrice = calculateMedian(data.prices);
                const totalVolume = data.volumes.reduce((sum, vol) => sum + vol, 0);

                consolidatedEntriesForItem.push([
                    data.firstFullDate, // Use the first full date string of that day
                    parseFloat(medianPrice.toFixed(3)), // Keep 3 decimal places for price
                    totalVolume.toString()
                ]);
            }
            consolidatedDB[itemName] = consolidatedEntriesForItem;
        }
    }
    return consolidatedDB;
}

async function processItems() {
    console.log("\n--- Starting price history fetching process ---");

    const itemsArrayToProcess = Array.from(itemsToProcess);
    let itemsProcessedCount = 0;

    for (const item of itemsArrayToProcess) {
        console.log(`\nProcessing item: ${item} (${itemsProcessedCount + 1} of ${itemsArrayToProcess.length})`);

        const historyData = await extractPriceHistory(item);

        if (historyData) {
            priceDB[item] = historyData;
            console.log(`Successfully updated price data for "${item}" in memory.`);
            itemsProcessedCount++;

            if (itemsProcessedCount > 0 && itemsProcessedCount % 10 === 0) {
                console.log(`Saving progress after processing ${itemsProcessedCount} items...`);
                try {
                    const dir = path.dirname(priceDBFile);
                    fs.mkdirSync(dir, { recursive: true });

                    // Consolidate before periodic save
                    const consolidatedDataForSave = consolidatePriceData(priceDB);
                    fs.writeFileSync(priceDBFile, JSON.stringify(consolidatedDataForSave, null, 2), { encoding: 'utf8' });
                    console.log("Progress saved (consolidated).");
                } catch (saveError) {
                    console.error("Error saving progress file:", saveError);
                }
            }
        } else {
            console.warn(`Skipping update for "${item}" due to failed data extraction.`);
        }

        if (itemsArrayToProcess.indexOf(item) < itemsArrayToProcess.length - 1) {
            console.log("Waiting randomly before the next request...");
            await randomSleep();
        }
    }

    console.log("\n--- All items processed. Consolidating and saving final PriceDB file ---");
    try {
        const dir = path.dirname(priceDBFile);
        fs.mkdirSync(dir, { recursive: true });

        // Consolidate before final save
        const finalConsolidatedPriceDB = consolidatePriceData(priceDB);

        const jsonOutput = JSON.stringify(finalConsolidatedPriceDB, null, 2);
        fs.writeFileSync(priceDBFile, jsonOutput, { encoding: 'utf8' });
        console.log(`Successfully saved consolidated PriceDB to "${priceDBFile}". Total items saved: ${Object.keys(finalConsolidatedPriceDB).length}`);
    } catch (saveError) {
        console.error(`Error saving final PriceDB file "${priceDBFile}":`, saveError);
    }

    console.log("\n--- Price history fetching process finished ---");
}

processItems();