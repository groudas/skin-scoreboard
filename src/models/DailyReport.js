// src/models/DailyReport.js
const mongoose = require('mongoose');

// Define schema for embedded match data
const matchSchema = new mongoose.Schema({
  match_id: {
    type: String,
    required: true
  },
  spectators: {
    type: Number,
    required: true
  },
  // Add activateTime to the embedded match schema
  activateTime: {
    type: Date, // Store as Date object
    required: true
  }
}, { _id: false }); // Don't create default _id for subdocuments

const dailyReportSchema = new mongoose.Schema({
  // Change 'date' to 'timestamp' to match the filename format
  timestamp: {
    type: String, // Use String to store the 'YYYYMMDD_HHMMSS' format
    required: true,
    unique: true // Ensure only one report per exact timestamp
  },
  // Store item counts using a Map where key is item name and value is count
  items: {
    type: Map,
    of: Number, // The values in the map are numbers (counts)
    required: true, // Keep required as it's part of the schema
    default: {} // Add a default empty map
  },
  // Array of embedded match objects
  matches: {
    type: [matchSchema], // An array of objects following the matchSchema
    required: true
  },
  // Mongoose adds a default _id primary key
});

const DailyReport = mongoose.model('DailyReport', dailyReportSchema);

module.exports = DailyReport;