import fs from 'fs';
import path from 'path';
import configModule from './config.js';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLogLevel = LOG_LEVELS[configModule.logLevel] ?? LOG_LEVELS.info;

function log(level, message, ...args) {
    if (LOG_LEVELS[level] >= currentLogLevel) {
        const timestamp = new Date().toISOString();
        console[level](`[${timestamp}] [${level.toUpperCase()}]`, message, ...args);
    }
}

// Helper function for creating directories if they don't exist
function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        log('info', `Creating directory: ${dirPath}`);
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            log('debug', `Directory created successfully: ${dirPath}`);
            return true;
        } catch (error) {
            log('error', `Failed to create directory "${dirPath}":`, error.message);
            return false;
        }
    }
    return true; // Directory already exists
}

// Helper function for delay
const sleep = (ms) => {
    log('debug', `Sleeping for ${ms / 1000} seconds...`);
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to format date from Unix timestamp (seconds)
function formatDate(unixTimestamp) {
    if (!unixTimestamp || typeof unixTimestamp !== 'number') return null;
    try {
        const date = new Date(unixTimestamp * 1000); // Convert seconds to milliseconds
        if (isNaN(date.getTime())) return null; // Invalid date
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        log('warn', `Error formatting timestamp ${unixTimestamp}: ${e.message}`);
        return null;
    }
}

// Helper function to read JSON file safely
function readJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            log('warn', `File not found: ${filePath}. Returning null.`);
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        log('error', `Error reading or parsing JSON file ${filePath}:`, error.message);
        return null; // Indicate failure
    }
}

// Helper function to write JSON file safely
function writeJsonFile(filePath, data) {
    try {
        const jsonData = JSON.stringify(data, null, 2); // Pretty print
        fs.writeFileSync(filePath, jsonData);
        log('debug', `Successfully wrote JSON to ${filePath}`);
        return true;
    } catch (error) {
        log('error', `Error writing JSON file ${filePath}:`, error.message);
        return false;
    }
}

export {
    log,
    ensureDirExists,
    sleep,
    formatDate,
    readJsonFile,
    writeJsonFile
};