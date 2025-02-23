const { text } = require("body-parser");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  
  walletAddress: { type: String, unique:true, required: true },
  telegramID: { type: String, unique:true, required: true},
  secretKey: {type: String, required: true},
  balanceStableCoin: { type: Number, default: 0.0 },
  balanceMemeCoin: { type: Number, default: 0.0 },
});

module.exports = mongoose.model("User", userSchema);
