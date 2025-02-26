const express = require("express");
const router = express.Router();
const {clients} = require('../config/constants');
// const {createWebhookAdmin} = require('../config/webhook');

router.get("/events", async (req, res) => {
    const { telegramID } = req.query;

    if (!telegramID) {
        res.status(400).json({ error: "Missing telegramID" });
        return;
    }
    console.log('Event Telegram ID:::::::::', telegramID)

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Store client response
    clients[telegramID] = res;
    console.log('Current clients:', clients.length)
    clients[telegramID].write('data: '+"test"+'\n\n');
    // Handle disconnection
    req.on("close", () => {
        delete clients[telegramID];
    });
});

router.get('/testSSE', async (req, res) => {
    let result;
    if (clients.length > 0){
        clients[0].write('data: ' + 'Success' + '\n\n');
        result = true
    }
    else(
        result= false
    )
    return res.json(result);
})

module.exports = router;
