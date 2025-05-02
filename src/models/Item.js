// src/models/Item.js
const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  // Item name from the JSON
  name: {
    type: String,
    required: true,
    unique: true // Ensure item names are unique in this collection
  }
  // You could add more fields here later if needed (e.g., item_id, category)
});

const Item = mongoose.model('Item', itemSchema);

module.exports = Item;