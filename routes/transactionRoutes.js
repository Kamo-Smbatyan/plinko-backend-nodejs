const express = require("express");
const { userWithdraw, getData } = require("../controllers/transactionController");
const dotenv = require('dotenv');
dotenv.config()
const router = express.Router();

router.post('/withdraw', userWithdraw);
router.get('/getData', getData);

module.exports = router;