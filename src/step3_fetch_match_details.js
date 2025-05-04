// src/step3_fetch_match_details.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config').step3;
const { log, ensureDirExists, sleep, readJsonFile, writeJsonFile } = require('./utils');
// Require openDotaExtraction from modules directory instead of node module as this is now our application customized one.
const openDotaExtraction = require('./modules/openDotaExtraction');

