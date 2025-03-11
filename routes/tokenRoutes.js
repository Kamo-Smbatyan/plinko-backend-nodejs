const express = require("express");
const { fetchTokenListFromBirdeye, fetchTokenMetaData, getSwapInstructionFromJup, getSwapQuoteFromJup, adminWallet, tokenSwap, checkTransactionStatus, checkLiquidity, tokenTransfer } = require("../utils/helper");
const { USDC_MINT_ADDRESS, SOL_MINT_ADDRESS } = require("../config/constants");
const router = express.Router();

router.get('/tokenlist', async (req, res) => {
    const {cursor} = req.query;
    console.log("cursor:",cursor);
    if (!cursor){
        const data = await fetchTokenListFromBirdeye(cursor);
        return res.status(200).json(data);  
    }
    const data = await fetchTokenListFromBirdeye(cursor);
    return res.status(200).json(data);    
});

router.get('/tokenMetadata', fetchTokenMetaData);

router.get('/test', async(req, res) => {
    const transferResult = await tokenTransfer(adminWallet, 'A7NV1HxoTiTuicWqGYiaeG8Efrvzum5gbyDW3CPcMf8S', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 0.5 * (10 ** 6), [adminWallet]);
    return res.json({transferResult: transferResult});
});

module.exports = router;
