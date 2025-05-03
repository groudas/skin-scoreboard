const mongoose = require('mongoose');

// Schema for individual item indicators within a DailyIndicators document
const itemIndicatorSchema = new mongoose.Schema({
    itemName: {
        type: String,
        required: true,
        index: true // Index for efficient lookup when calculating moving averages
    },
    popularityPercentage: {
        type: Number,
        required: true
    },
    // Add fields for moving averages as requested
    movingAverage3Day: {
        type: Number,
        default: null // Use null initially if not enough data
    },
    movingAverage7Day: {
        type: Number,
        default: null // Use null initially if not enough data
    },
    // You can add more fields here if needed, e.g., historical trends, etc.
    // lastUpdated: { type: Date, default: Date.now } // Optional: track when this specific item data was last updated within the document
});

// Main schema for the DailyIndicators collection
const dailyIndicatorsSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        unique: true, // Ensure only one document per day
        index: true // Index for date-based queries (essential for moving averages)
    },
    totalSpectatorsDay: {
        type: Number,
        required: true
    },
    totalMatchesAnalyzedDay: {
        type: Number,
        required: true
    },
    itemIndicators: {
        type: [itemIndicatorSchema], // Array of embedded itemIndicator documents
        default: []
    },
    // Metadata fields
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the `updatedAt` field on save
dailyIndicatorsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create the model
const DailyIndicators = mongoose.model('DailyIndicators', dailyIndicatorsSchema);

module.exports = DailyIndicators;