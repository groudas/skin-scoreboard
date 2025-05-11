import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs'; // For saving HTML if needed for debugging
import path from 'path';
import config from '../config.js'; // Assuming config is also an ES module or can be imported


//::Carregar pricedb.json e DAILY_COSMETIC_STATS_MARKETABLE.json::
let priceDB = {}
let itemsDB = []

try {
    itemsDB = fs.readFileSync(config.module2.itemsDbFile);
    try {
        itemsDB = JSON.parse(itemsDB);
        let allItemNames = new Set();
        if (Array.isArray(itemsDB)) {
            itemsDB.forEach(entry => {
                if (entry && typeof entry.items === 'object') {
                    Object.keys(entry.items).forEach(itemName => allItemNames.add(itemName));
                }
            });
        }
        itemsDB = Array.from(allItemNames);
     } catch (e) {console.log("Failed to parse ItemsDB."); process.exit()};
    console.log(`File ${config.module2.itemsDbFile} loaded.`);
} catch (e) {
    console.log("Error when loading items database! It will be impossible to identify new itens to gather prices. Only the ones present at the Price DB will be updated.", e);
}

try {
    priceDB = fs.readFileSync(config.module2.priceDbFile);
    try { priceDB = JSON.parse(priceDB) } catch (e) {console.log("Failed to parse PriceDB."); process.exit()};
    console.log(`File ${config.module2.priceDbFile} loaded.`)

} catch (e) {
    console.log("Price database not found or incorrectly loaded! Continuing without initial database.", e);
}

if (!itemsDB && !priceDB) {
    console.log(`Unable to load neither ${config.module2.priceDbFile} and ${config.module2.itemsDbFile}. Prices not updated. Terminating price the fetching process.`);
    process.exit()
}


//::Função::
async function extractPriceHistory(itemString) {
    let url = `https://steamcommunity.com/market/listings/570/${encodeURIComponent(itemString)}`
    const targetFingerprint = 'var line1=[[';
    try {
        console.log(`Fetching URL: ${url}`);

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        });

        const html = response.data;
        console.log("HTML fetched successfully.");

        const $ = cheerio.load(html);
        const scriptElements = $('#responsive_page_template_content > script');

        let targetScriptContent = null;

        if (scriptElements.length > 0) {
            scriptElements.each((index, element) => {
                const currentScriptContent = $(element).html();
                if (currentScriptContent && currentScriptContent.includes(targetFingerprint)) {
                    console.log(`\nFound target script containing "${targetFingerprint}"`);
                    targetScriptContent = currentScriptContent;
                    return false; // Exit .each loop
                }
            });
        }

        if (targetScriptContent) {
            const line1Regex = /\bvar\s+line1\s*=\s*(\[\[[\s\S]*?\]\]);/;
            const match = targetScriptContent.match(line1Regex);

            if (match && match[1]) {
                const line1ArrayString = match[1];
                console.log("\n--- Extracted line1 Array String ---");

                try {
                    const priceHistoryArray = JSON.parse(line1ArrayString);

                    console.log("\n--- Successfully Parsed Price History (line1) ---");
                    console.log(`Total data points: ${priceHistoryArray.length}`);

                    if (priceHistoryArray.length > 0) {
                        console.log("\nFirst 5 data points:");
                        for (let i = 0; i < Math.min(5, priceHistoryArray.length); i++) {
                            console.log(priceHistoryArray[i]);
                        }

                        console.log("\nLast 5 data points (if more than 5):");
                        if (priceHistoryArray.length > 5) {
                            for (let i = Math.max(0, priceHistoryArray.length - 5); i < priceHistoryArray.length; i++) {
                                console.log(priceHistoryArray[i]);
                            }
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return priceHistoryArray;

                } catch (e) {
                    console.error("\nError parsing the extracted line1 array string as JSON:", e);
                    console.log("Extracted string that failed to parse (first 500 chars):");
                    console.log(line1ArrayString.substring(0,500));
                    // Fallback or further debugging needed here if JSON.parse fails.
                    // For this specific Steam data, JSON.parse should work.
                }
            } else {
                console.log("\nCould not find 'var line1=[[...]];' with regex in the target script.");
                console.log("The script content might have changed, or the regex needs adjustment.");
                // console.log("Target script content (first 1000 chars):");
                // console.log(targetScriptContent.substring(0,1000));
            }
        } else {
            console.log(`\nTarget script containing "${targetFingerprint}" NOT FOUND.`);
            console.log("This could mean:");
            console.log("1. The fingerprint is no longer present or has changed.");
            console.log("2. The script is not a direct child of #responsive_page_template_content.");
            console.log("3. Steam is serving a different page (CAPTCHA, error, etc.).");

            const filePath = 'fetched_page_no_line1_script.html';
            fs.writeFileSync(filePath, html);
            console.log(`\nThe full HTML content has been saved to: ${filePath}`);
        }

    } catch (error) {
        console.error("Error during the process:");
        if (error.response) {
            console.error("Status:", error.response.status);
            const errorFilePath = 'error_response_content.html';
            fs.writeFileSync(errorFilePath, typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data));
            console.log(`Error response data saved to: ${errorFilePath}`);
        } else if (error.request) {
            console.error("Request Error: No response received.", error.request);
        } else {
            console.error("Error Message:", error.message);
        }
    }
}

//LOOP1: CICLAR EM CADA ITEM DE DAILY_COSMETIC_STATS_MARKETABLE QUE NÃO TENHA DADOS NO PRICEDB.JSON

//Cria array dos itens que constam no priceDB
let priceDBItems = Object.keys(priceDB);

//Compara array de items DB com array de priceDB, gerando nova lista itemsMissingPrice
let itemsMissingPrice = itemsDB.filter(itemFromDB => !priceDBItems.includes(itemFromDB));

// Agora itemsMissingPrice contém apenas os itens que precisam ter o preço extraído
// e itemsMissingPrice é um array (ou vazio se não houver itens faltando).

if (itemsMissingPrice.length > 0) {
    console.log(`\nFound ${itemsMissingPrice.length} items missing from priceDB. Fetching prices...`);

    for (const item of itemsMissingPrice) { 
        console.log(`Fetching price history for: ${item}`);
        const historyData = await extractPriceHistory(item);
        if (historyData) {
            priceDB[item] = historyData;
            console.log(`Successfully fetched and added history for ${item}`);
        } else {
            console.warn(`Não foi possível extrair o histórico para o item: ${item}`);
        }
    }
} else {
    console.log("Nenhum item com preço faltando foi encontrado.");
}

console.log("Conteúdo de priceHistoryArray após buscar os preços faltantes:", priceHistoryArray);

//LOOP2: CICLAR NOS ITENS DE DAILY_COSMETIC_STATS_MARKETABLE, DO MAIS DESATUALIZADO PARA O MENOS ATUALIZADO
