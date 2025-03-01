const mongoose = require("mongoose");

const transactionHistorySchema = new mongoose.Schema({
  telegramID: { type: String, required: true, index: true }, 
  deposit: {
    transaction: { type: String }, 
    fromAddress: { type: String },
    mintAddress: { type: String },
    amount: { type: Number },
    status: { type: String, enum: ["pending", "failed", "successful"] },
    timeStamp: { type: Date },
  },
  forward: {
    transaction: { type: String }, 
    amount: { type: Number },
    status: { type: String, enum: ["pending", "failed", "successful"] },
    timeStamp: { type: Date },
  },
  swap: {
    transaction: { type: String }, 
    amountIn: { type: Number },
    amountOut: { type: Number },
    status: { type: String, enum: ["pending", "failed", "successful"] },
    timeStamp: { type: Date },
  },
  withdraw: {
    transaction: { type: String }, 
    amount: { type: Number },
    toAddress: { type: String },
    timeStamp: { type: Date },
    status: { type: String, enum: ["pending", "failed", "successful"] },
  },
  created_at: { type: String, required: true },
});

transactionHistorySchema.index(
  { "deposit.transaction": 1 },
  { unique: true, partialFilterExpression: { "deposit.transaction": { $ne: null } } } // ✅ Exclude null values
);

transactionHistorySchema.index(
  { "forward.transaction": 1 },
  { unique: true, partialFilterExpression: { "forward.transaction": { $ne: null } } } // ✅ Exclude null values
);

transactionHistorySchema.index(
  { "swap.transaction": 1 },
  { unique: true, partialFilterExpression: { "swap.transaction": { $ne: null } } } // ✅ Exclude null values
);

transactionHistorySchema.index(
  { "withdraw.transaction": 1 },
  { unique: true, partialFilterExpression: { "withdraw.transaction": { $ne: null } } } // ✅ Exclude null values
);

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);
