const mongoose = require("mongoose");
const transactionHistorySchema = new mongoose.Schema(
  {
    telegramID: {type: String, required:true, index:true},
    deposit:{
      transaction:{type:String, required: true},
      fromAddress: { type:String, required: true },
      mintAddress: {type: String, required: true},
      amount: { type: Number, required: true },
      status: { type: String, enum: ["pending", "failed", "successful"], required: true},
      timeStamp: { type: Date, default: Date.now }
    },
    forward: {
      transaction: {type:String},
      amount: {type: Number},
      status: {type: String, enum: ['pending', 'failed', 'successful'], default: 'pending'},
      timeStamp: {type: Date}
    },
    swap: {
      transactionID: {type:String},
      amountIn: {type:Number},
      amountOut: { type: Number},
      status: { type: String, enum: ['pending', 'failed', 'successful'], default: 'pending'},
      typeStamp: { type:Date}
    },
    created_at:{type: String, required: true}
  }
)

// Creating an index for better performance on frequently queried fields
// transactionHistorySchema.index({ telegramID: 1, mintAddress: 1, created_at: -1 });

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);