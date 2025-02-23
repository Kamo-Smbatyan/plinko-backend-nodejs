const express = require("express");
const { userWithdraw, swapMintToStable } = require("../controllers/transactionController");
const router = express.Router();

router.post('/withdraw', userWithdraw);

router.get('/test', (req, res) => {

    swapMintToStable('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', 1062248.87105 * 10^5, 'Ax18ST5ToJe8KQMS9SJj9C2W1mKukua1pqNMsiRpcNuh')
    return res.status(200).json('ok');
})

module.exports = router;