const express = require("express");
const {handleWebhook, handleAdminWebhook} = require('../controllers/webHookHander');


const router = express.Router();

router.post('/webhook', handleWebhook);
router.post('webhookAdmin', handleAdminWebhook)

module.exports = router;
