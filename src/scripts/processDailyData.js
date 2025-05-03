const mongoose = require('mongoose');
const config = require('../config');
const { log } = require('../utils');
const DailyReport = require('../models/DailyReport');
const DailyIndicators = require('../models/DailyIndicators');

async function processDailyData(targetDate) {
    targetDate.setUTCHours(0, 0, 0, 0);
    const targetDateString = targetDate.toISOString().split('T')[0];
    log('info', `Starting Phase 2: Daily Data Processing for date: ${targetDateString}`);

    try {
        await mongoose.connect(config.mongodb.uri, {
            serverSelectionTimeoutMS: 5000
        });
        log('info', 'MongoDB connection successful.');
    } catch (error) {
        log('error', 'MongoDB connection failed:', error.message);
        process.exit(1);
    }

    try {
        const latestDailyReport = await DailyReport.findOne({
            timestamp: new RegExp(`^${targetDateString.replace(/-/g, '')}_`)
        }).sort({ timestamp: -1 }).lean();

        if (!latestDailyReport) {
            log('warn', `No DailyReport found for date ${targetDateString}. Skipping.`);
            await mongoose.disconnect();
            log('info', 'MongoDB connection closed.');
            return;
        }

        log('info', `Found latest DailyReport for ${targetDateString} with timestamp ${latestDailyReport.timestamp}. Processing...`);

        log('info', 'Calculating daily indicators...');

        let totalItemsDetectedDay = 0;
        if (Array.isArray(latestDailyReport.items)) {
            totalItemsDetectedDay = latestDailyReport.items.reduce((sum, item) => sum + (item?.count || 0), 0);
        } else {
            log('warn', 'latestDailyReport.items is not an array or is missing.');
        }

        const dailyIndicatorsData = {
            date: targetDate,
            totalSpectatorsDay: Array.isArray(latestDailyReport.matches)
                ? latestDailyReport.matches.reduce((sum, match) => sum + (match?.spectators || 0), 0)
                : 0,
            totalMatchesAnalyzedDay: Array.isArray(latestDailyReport.matches)
                ? latestDailyReport.matches.length
                : 0,
            itemIndicators: []
        };

        const sevenDaysAgo = new Date(targetDate);
        sevenDaysAgo.setUTCDate(targetDate.getUTCDate() - 7);

        const historicalIndicators = await DailyIndicators.find({
            date: {
                $gte: sevenDaysAgo,
                $lt: targetDate
            }
        }, {
             date: 1,
             itemIndicators: 1
        }).sort({ date: 1 }).lean();

        log('info', `Fetched ${historicalIndicators.length} historical DailyIndicators documents for moving average calculation.`);

        if (totalItemsDetectedDay > 0 && Array.isArray(latestDailyReport.items)) {
            latestDailyReport.items.forEach(item => {
                if (item && item.name && typeof item.count === 'number') {
                    const popularityPercentage = (item.count / totalItemsDetectedDay) * 100;
                    const itemName = item.name;

                    const historicalPopularityData = [];
                    historicalIndicators.forEach(histDoc => {
                        if (Array.isArray(histDoc.itemIndicators)) {
                            const itemHist = histDoc.itemIndicators.find(itemInd => itemInd.itemName === itemName);
                            if (itemHist && typeof itemHist.popularityPercentage === 'number') {
                                historicalPopularityData.push({
                                    date: histDoc.date,
                                    popularity: itemHist.popularityPercentage
                                });
                            }
                        }
                    });

                    const threeDaysAgo = new Date(targetDate);
                    threeDaysAgo.setUTCDate(targetDate.getUTCDate() - 3);
                    const recentThreeDaysData = historicalPopularityData.filter(data => data.date >= threeDaysAgo);
                    const sum3Day = recentThreeDaysData.reduce((sum, data) => sum + data.popularity, 0);
                    const movingAverage3Day = recentThreeDaysData.length > 0 ? parseFloat((sum3Day / recentThreeDaysData.length).toFixed(2)) : null;

                    const sum7Day = historicalPopularityData.reduce((sum, data) => sum + data.popularity, 0);
                    const movingAverage7Day = historicalPopularityData.length > 0 ? parseFloat((sum7Day / historicalPopularityData.length).toFixed(2)) : null;

                    dailyIndicatorsData.itemIndicators.push({
                        itemName: itemName,
                        popularityPercentage: parseFloat(popularityPercentage.toFixed(2)),
                        movingAverage3Day: movingAverage3Day,
                        movingAverage7Day: movingAverage7Day
                    });
                } else {
                     log('warn', `Skipping item due to missing name or invalid count: ${JSON.stringify(item)}`);
                }
            });
            log('info', `Calculated popularity and moving averages for ${dailyIndicatorsData.itemIndicators.length} items.`);
        } else if (Array.isArray(latestDailyReport.items)) {
             log('warn', 'No items detected or total count is zero. Skipping item popularity calculation.');
        }

        log('info', 'Saving daily indicators...');
        await DailyIndicators.findOneAndUpdate(
            { date: targetDate },
            { $set: dailyIndicatorsData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        log('info', `Daily Indicators document saved/updated for date ${targetDateString}.`);
        log('info', 'Daily data processing complete.');

    } catch (error) {
        log('error', 'Error during daily data processing:', error.message);
        log('error', error.stack);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            log('info', 'MongoDB connection closed.');
        }
    }
}

module.exports = processDailyData;