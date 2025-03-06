const express = require("express");
const { fetchTokenListFromBirdeye, fetchTokenMetaData, getSwapTransactionFromJup, getSwapInstructionFromJup, getSwapQuoteFromJup, adminWallet } = require("../utils/helper");
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
    const quoteResult = await getSwapQuoteFromJup(SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, 0.001*(10 ** 9),30, adminWallet.publicKey.toBase58() )
    const ins = await getSwapInstructionFromJup(quoteResult.swapRequestBody);
    const swap = await getSwapTransactionFromJup(quoteResult.swapRequestBody);
    return res.status(200).json({insstruction: ins, swap: swap});
});

module.exports = router;
