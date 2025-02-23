const mongoose = require("mongoose");

const gameHistorySchema = new mongoose.Schema({
  telegramId: { type: Number, required: true },
  betAmount: { type: Number, required: true },
  winAmount: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("GameHistory", gameHistorySchema);
