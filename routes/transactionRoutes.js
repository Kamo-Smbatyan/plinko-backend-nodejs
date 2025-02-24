const express = require("express");
const { userWithdraw, tokenSwap } = require("../controllers/transactionController");
const { NATIVE_MINT } = require("@solana/spl-token");
const { LAMPORTS_PER_SOL } = require("@solana/web3.js");
const dotenv = require('dotenv');
dotenv.config()
const router = express.Router();

router.post('/withdraw', userWithdraw);

module.exports = router;