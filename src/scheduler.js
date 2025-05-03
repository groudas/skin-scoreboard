const cron = require('node-cron');
const { log } = require('./utils');
const processDailyData = require('../scripts/processDailyData');

log('info', 'Scheduler started. Setting up daily cron job.');

const dailyProcessingJob = cron.schedule('0 2 * * *', async () => {
  log('info', 'Running scheduled daily data processing job...');
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);
  targetDate.setHours(0, 0, 0, 0);

  try {
    await processDailyData(targetDate);
    log('info', 'Scheduled daily data processing job finished successfully.');
  } catch (error) {
    log('error', 'Error running scheduled daily data processing job:', error);
  }
}, {
  scheduled: true,
  timezone: "Etc/UTC"
});

log('info', 'Daily data processing job scheduled.');

dailyProcessingJob.on('scheduled', () => {
  log('info', 'Daily processing job successfully scheduled.');
});