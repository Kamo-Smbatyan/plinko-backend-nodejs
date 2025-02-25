const express = require("express");
const router = express.Router();
const {clients} = require('../config/constants');
const {createWebhookAdmin} = require('../config/webhook');

router.get("/events", async (req, res) => {
    const {telegramID} = req.query;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    clients[telegramID] = res;
    req.on('close', () => {
        delete clients[telegramID];
    });
});

router.get('/test', async (req, res) => {
    const result = await createWebhookAdmin();
    return res.json(result);
})

module.exports = router;
