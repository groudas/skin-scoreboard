// src/step4_extract_match_data.js
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { log, ensureDirExists, readJsonFile, writeJsonFile, formatDate } = require('./utils');

// --- Import modules --- //
const { buildSpectatorMap, extractCosmetics, runStep4 } = require('./modules/openDotaExtraction');

// --- runStep4 --- //
runStep4();