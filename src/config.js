const path = require('path');

const baseDataDir = path.join(__dirname,'..', 'data');

module.exports = {
    logLevel: 'info',
    step1: {
        targetUrl: 'https://api.opendota.com/api/live',
        outputDir: path.join(baseDataDir, 'raw'),
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
        nonMarketableFile: path.join(__dirname, 'module1', 'nonmarketable.txt'),
        filteredDbFile: path.join(baseDataDir, 'database', 'daily_cosmetic_stats_marketable.json')
    }
};