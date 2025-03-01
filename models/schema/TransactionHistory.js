const mongoose = require("mongoose");
const transactionHistorySchema = new mongoose.Schema(
  {
    telegramID: {type: String, required:true, index:true},
    deposit:{
      transaction:{type:String},
      fromAddress: { type:String },
      mintAddress: {type: String},
      amount: { type: Number},
      status: { type: String, enum: ["pending", "failed", "successful"]},
      timeStamp: { type: Date }
    },
    forward: {
      transaction: {type:String},
      amount: {type: Number},
      status: {type: String, enum: ['pending', 'failed', 'successful']},
      timeStamp: {type: Date}
    },
    swap: {
      transaction: {type:String},
      amountIn: {type:Number},
      amountOut: { type: Number},
      status: { type: String, enum: ['pending', 'failed', 'successful']},
      typeStamp: { type:Date}
    },
    withdraw: {
      transaction: {type: String},
      amount: {type: Number},
      toAddress: {type: String},
      timeStamp: {type: Date},
      status: { type: String, enum: ['pending', 'failed', 'successful']},
    },
    created_at:{type: String, required: true}
  }
)

// Creating an index for better performance on frequently queried fields
// transactionHistorySchema.index({ telegramID: 1, mintAddress: 1, created_at: -1 });

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);