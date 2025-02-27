const express = require("express");
const router = express.Router();
const {clients, numb, getNum, setNum} = require('../config/constants');
// const {createWebhookAdmin} = require('../config/webhook');

router.get("/events", async (req, res) => {
    const { telegramID } = req.query;

    if (!telegramID) {
        res.status(400).json({ error: "Missing telegramID" });
        return;
    }
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    res.write('data: '+"test"+'\n\n');
    // Handle disconnection
    req.on("close", () => {
        
    });
});

router.get('/testSSE', async (req, res) => {
    let result;
    let num = getNum()
    num ++;
    setNum(num);    
    return res.json(getNum());
})

module.exports = router;
