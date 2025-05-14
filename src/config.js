import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDataDir = path.join(__dirname, '..', 'data');

const config = {
    logLevel: 'debug', // Levels: debug, info, warn, error
    step1: {
        targetUrl: 'https://api.opendota.com/api/live',
        outputDir: path.join(baseDataDir, 'raw'),
        filenamePrefix: 'live_data',
        intervalSeconds: 900,
        fileExt: '.json',
        requestTimeoutMs: 10000,
    },
    step2: {
        rawDataDir: path.join(baseDataDir, 'raw'),
        processedDir: path.join(baseDataDir, 'processed'),
        outputFile: path.join(baseDataDir, 'processed', 'filtered_live_matches.json'),
        processedPrefix: 'filtered_live_matches',
        numberOfTopMatches: 15,
    },
    step3: {
        filteredMatchesFile: path.join(baseDataDir, 'processed', 'filtered_live_matches.json'),
        outputDir: path.join(baseDataDir, 'matches'),
        apiBaseUrl: 'https://api.opendota.com/api/matches/',
        requestDelayMs: 20000,
        requestTimeoutMs: 30000,
        minimumMatchAgeHours: 3,
    },
    step4: {
        matchesDir: path.join(baseDataDir, 'matches'),
        filteredLiveFile: path.join(baseDataDir, 'processed', 'filtered_live_matches.json'),
        outputDir: path.join(baseDataDir, 'filtered_matches'),
        processedFlagFile: '.processed_step4',
    },
    step5: {
        filteredMatchesDir: path.join(baseDataDir, 'filtered_matches'),
        dbDir: path.join(baseDataDir, 'database'),
        dbFile: path.join(baseDataDir, 'database', 'daily_cosmetic_stats.json'),
        // This path assumes nonmarketable.txt is in src/module1/ if config.js is in src/
        nonMarketableFile: path.join(__dirname, 'module1', 'nonmarketable.txt'),
        filteredDbFile: path.join(baseDataDir, 'database', 'daily_cosmetic_stats_marketable.json')
    },
    module2: {
        priceDbDir: path.join(baseDataDir, 'database'),
        priceDbFile: path.join(baseDataDir, 'database', 'priceDB.json'),
        itemsDbDir: path.join(baseDataDir, 'database'),
        itemsDbFile: path.join(baseDataDir, 'database', 'daily_cosmetic_stats_marketable.json')
    },
    randomSleep: {
        minMs: 1000,
        maxMs: 10000,
    }
};

export default config;