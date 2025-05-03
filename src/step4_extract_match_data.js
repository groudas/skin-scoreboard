const fs = require('fs');
const path = require('path');
const config = require('./config');
const { log, ensureDirExists, readJsonFile, writeJsonFile, formatDate } = require('./utils');
const mongoose = require('mongoose');
const DailyReport = require('./models/DailyReport');

function extractCosmetics(matchData) {
  const cosmeticNames = new Set();

  if (matchData && matchData.players && Array.isArray(matchData.players)) {
    matchData.players.forEach(player => {
      if (player && player.items && Array.isArray(player.items)) {
        player.items.forEach(item => {
          if (item && item.name && typeof item.name === 'string' && item.name !== '') {
            if (!item.name.startsWith('item_') && !item.name.startsWith('ability_') && !item.name.startsWith('npc_')) {
              cosmeticNames.add(item.name);
            }
          }
        });
      }
    });
  }

  if (matchData && matchData.cosmetic_data && Array.isArray(matchData.cosmetic_data)) {
    matchData.cosmetic_data.forEach(cosmetic => {
      if (cosmetic && cosmetic.name && typeof cosmetic.name === 'string' && cosmetic.name !== '') {
        cosmeticNames.add(cosmetic.name);
      }
    });
  }

  return Array.from(cosmeticNames);
}
async function runStep4() {
  log('info', "Starting Step 4: Extracting Data from Match Details and Updating DailyReports...");

  const matchesDir = config.step3.outputDir;
  const processedMatchesDir = path.join(matchesDir, 'processed');
  try {
    await mongoose.connect("mongodb://localhost:27017/skinscoreboard", {
      serverSelectionTimeoutMS: 5000,
      // useNewUrlParser: true,
      // useUnifiedTopology: true
    });
    log('info', 'MongoDB connection successful.');
  } catch (error) {
    log('error', 'MongoDB connection failed:', error.message);
    process.exit(1);
}

  if (!fs.existsSync(matchesDir)) {
    log('error', `Input directory ${matchesDir} not found. Exiting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!ensureDirExists(processedMatchesDir)) {
    log('error', `Processed matches directory cannot be created/accessed at ${processedMatchesDir}. Exiting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  let filesToProcess = [];
  try {
    const allFiles = fs.readdirSync(matchesDir);
    const processedFiles = fs.existsSync(processedMatchesDir) ? fs.readdirSync(processedMatchesDir) : [];
    const processedFilesSet = new Set(processedFiles);

    filesToProcess = allFiles
      .filter(file => /^\d+\.json$/.test(file) && !processedFilesSet.has(file));

    log('info', `Found ${filesToProcess.length} new match detail file(s) in ${matchesDir} to process.`);
  } catch (error) {
    log('error', `Failed to read directories for processing:`, error.message);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (filesToProcess.length === 0) {
    log('info', "No new match detail files found to process.");
    log('info', "Step 4 finished.");
    await mongoose.disconnect();
    return;
  }

  let successfullyProcessedFiles = 0;
  let skippedNoCosmeticsCount = 0;
  let errorCount = 0;
  let totalDailyReportUpdatesAttempted = 0;
  let successfullyMovedFiles = 0;

  for (const filename of filesToProcess) {
    const matchIdStr = filename.replace('.json', '');
    const matchId = parseInt(matchIdStr, 10);

    const matchFilePath = path.join(matchesDir, filename);
    const processedFilePath = path.join(processedMatchesDir, filename);

    log('info', `\nProcessing ${filename} (Match ID: ${matchId})...`);

    const matchData = readJsonFile(matchFilePath);
    if (!matchData || typeof matchData !== 'object') {
      log('warn', `  -> Skipping ${filename}: Failed to read or parse, or it's empty/invalid.`);
      errorCount++;
      continue;
    }

    if (typeof matchData.match_id !== 'number' || matchData.match_id !== matchId) {
      log('warn', `  -> Skipping ${filename}: Mismatched match_id (${matchData.match_id} in file vs ${matchId} from filename) or missing.`);
      errorCount++;
      continue;
    }

    const uniqueCosmetics = extractCosmetics(matchData);
    if (uniqueCosmetics.length === 0) {
      log('info', `  -> Skipping processing: No valid cosmetic names found in ${filename}.`);
      skippedNoCosmeticsCount++;
      try {
        fs.renameSync(matchFilePath, processedFilePath);
        log('info', `  -> Moved file to processed: ${path.basename(processedFilePath)}`);
        successfullyMovedFiles++;
      } catch (moveError) {
        log('error', `  -> Failed to move file ${filename} to processed:`, moveError.message);
        errorCount++;
      }
      continue;
    }
    log('debug', `  -> Found ${uniqueCosmetics.length} unique cosmetic items.`);

    try {
      const reportsToUpdate = await DailyReport.find({
        'matches.match_id': matchId
      });

      if (reportsToUpdate.length === 0) {
        log('warn', `  -> Skipping update: No DailyReport(s) found containing match ID ${matchId}.`);
        try {
          fs.renameSync(matchFilePath, processedFilePath);
          log('info', `  -> Moved file to processed: ${path.basename(processedFilePath)}`);
          successfullyMovedFiles++;
        } catch (moveError) {
          log('error', `  -> Failed to move file ${filename} to processed:`, moveError.message);
          errorCount++;
        }
        errorCount++;
        continue;
      }

      log('info', `  -> Found ${reportsToUpdate.length} DailyReport(s) to potentially update for match ID ${matchId}.`);

      let successfulUpdatesForThisMatch = 0;
      for (const report of reportsToUpdate) {
        log('debug', `    -> Attempting update for DailyReport date: ${report.date}`);

        const matchEntry = report.matches.find(m => m.match_id === matchId);
        if (!matchEntry) {
          log('warn', `    -> Match ID ${matchId} not found within matches array of DailyReport for date ${report.date}. Skipping update for this specific report.`);
          errorCount++;
          continue;
        }

        const spectatorCount = matchEntry.spectators || 0;
        log('debug', `    -> Using spectator count ${spectatorCount} from report entry for match ID ${matchId}.`);

        if (!report.items) {
          report.items = {};
        }

        for (const cosmeticName of uniqueCosmetics) {
          const key = cosmeticName.toString();
          report.items[key] = (report.items[key] || 0) + spectatorCount;
          log('debug', `      -> Incremented count for "${key}" by ${spectatorCount}. New count: ${report.items[key]}`);
        }

        report.markModified('items');

        try {
          await report.save();
          log('debug', `    -> Successfully saved updated DailyReport for date: ${report.date}`);
          successfulUpdatesForThisMatch++;
          totalDailyReportUpdatesAttempted++;
        } catch (saveError) {
          log('error', `    -> Failed to save updated DailyReport for date ${report.date}:`, saveError.message);
          errorCount++;
        }
      }

      if (successfulUpdatesForThisMatch > 0) {
        log('info', `  -> Successfully updated ${successfulUpdatesForThisMatch} DailyReport(s) for match ID ${matchId}.`);
        try {
          fs.renameSync(matchFilePath, processedFilePath);
          log('info', `  -> Moved file to processed: ${path.basename(processedFilePath)}`);
          successfullyMovedFiles++;
          successfullyProcessedFiles++;
        } catch (moveError) {
          log('error', `  -> Failed to move file ${filename} to processed AFTER database updates:`, moveError.message);
          errorCount++;
        }
      } else {
        log('warn', `  -> No DailyReports were successfully updated for match ID ${matchId}, or no matching entries were found.`);
        log('warn', `  -> File ${filename} was NOT moved to processed as no DailyReports were successfully updated.`);
        errorCount++;
      }

    } catch (dbError) {
      log('error', `  -> Unexpected database operation error for ${filename}:`, dbError.message);
      errorCount++;

      log('warn', `  -> File ${filename} was NOT moved to processed due to an unexpected database error.`);
    }
  }

  log('info', `\n--- Step 4 Summary ---`);
  log('info', `Total match detail files found initially: ${filesToProcess.length}`);
  log('info', `Files successfully processed (extracted data, attempted DB updates, and moved): ${successfullyProcessedFiles}`);
  log('info', `Files skipped (no valid cosmetics found) and moved: ${skippedNoCosmeticsCount}`);
  log('info', `Total files successfully moved to processed directory: ${successfullyMovedFiles}`);
  log('info', `Total DailyReport document save attempts: ${totalDailyReportUpdatesAttempted}`);
  log('info', `Errors encountered (read/parse issues, DB find/save errors, file move errors, reports not found for match): ${errorCount}`);
  log('info', `------------------------`);
  log('info', "Step 4 finished.");

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

runStep4();

