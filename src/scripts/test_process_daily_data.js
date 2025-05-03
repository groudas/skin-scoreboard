const processDailyData = require('./processDailyData');

const dateToProcess = '2025-04-29';
const targetDate = new Date(`${dateToProcess}T00:00:00.000Z`);

if (isNaN(targetDate.getTime())) {
    console.error(`[ERROR] Invalid date format: ${dateToProcess}. Please use YYYY-MM-DD.`);
    process.exit(1);
}

console.log(`[INFO] Attempting to process daily data for: ${targetDate.toISOString()}`);

async function runTest() {
    try {
        await processDailyData(targetDate);
        console.log(`[INFO] Successfully ran processDailyData for ${dateToProcess}. Check MongoDB 'DailyIndicators' collection.`);
    } catch (error) {
        console.error(`[ERROR] Failed to run processDailyData for ${dateToProcess}:`, error);
        process.exit(1);
    } finally {

    }
}

runTest();