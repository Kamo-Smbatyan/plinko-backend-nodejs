const express = require("express");
const { handleWebhook } = require('../controllers/webHookHander');


const router = express.Router();

router.post('/webhook', handleWebhook);

module.exports = router;
