const mongoose = require("mongoose");
const transactionHistorySchema = new mongoose.Schema(
  {
    telegramID: { type: String, required: true, index: true },
    deposit: {
      transaction: { type: String, unique: true },  // Ensuring uniqueness
      fromAddress: { type: String },
      mintAddress: { type: String },
      amount: { type: Number },
      status: { type: String, enum: ["pending", "failed", "successful"] },
      timeStamp: { type: Date },
    },
    forward: {
      transaction: { type: String, unique: true },  // Ensuring uniqueness
      amount: { type: Number },
      status: { type: String, enum: ["pending", "failed", "successful"] },
      timeStamp: { type: Date },
    },
    swap: {
      transaction: { type: String, unique: true },  // Ensuring uniqueness
      amountIn: { type: Number },
      amountOut: { type: Number },
      status: { type: String, enum: ["pending", "failed", "successful"] },
      timeStamp: { type: Date },
    },
    withdraw: {
      transaction: { type: String, unique: true },  // Ensuring uniqueness
      amount: { type: Number },
      toAddress: { type: String },
      timeStamp: { type: Date },
      status: { type: String, enum: ["pending", "failed", "successful"] },
    },
    created_at: { type: String, required: true },
  }
);

// Ensure uniqueness by creating an index
transactionHistorySchema.index({ 
  "deposit.transaction": 1,
  "forward.transaction": 1,
  "swap.transaction": 1,
  "withdraw.transaction": 1
}, { unique: true });

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);
// Creating an index for better performance on frequently queried fields
// transactionHistorySchema.index({ telegramID: 1, mintAddress: 1, created_at: -1 });

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);