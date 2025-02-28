const express = require("express");
const router = express.Router();
const {clients, numb, getNum, setNum, setUserTxState, getUserTxState} = require('../config/constants');
const { newTransactionHistory } = require("../models/model/TransactionModel");
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
    let txHistoryData = {
        telegramID: "7394315902",
        withdraw:{
            transaction: 'afsdafafadfasdfsadfasf',
            amount: 0.5,
            toAddress: 'afdssafadfadfsadfasdfdsfsdafafd',
            timeStamp: Date.now(),
            status: 'pending'
        },
        created_at: Date.now(),
    }   
    const txHistory = await newTransactionHistory(txHistoryData);
    return res.json('Success');
    //await txHistory.save();
});

module.exports = router;
