const mongoose = require("mongoose");

const transactionHistorySchema = new mongoose.Schema({
  telegramID:   { type: String, required: true },
  signature:    { type: String, required: true },
  mintAddress:  { type: String, required: true },
  inAmount:     { type: Number }, 
  tx_type:      { type: String, enum: ['deposit','swap'], required: true }, //1: deposit, 2: swap
  tx_state:     { type: Number, enum: ['sent', 'failed', 'confirmed'], required: true }, //1:sent, 2: failed, 3: successed
  outAmount:    { type: Number },
  created_at:   { type: Date, default: Date.now() },
  updated_at:   { type: Date, default:Date.now() }
});

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);
