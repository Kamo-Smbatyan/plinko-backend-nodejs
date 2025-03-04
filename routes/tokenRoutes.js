const express = require("express");
const { fetchTokenListFromBirdeye, fetchTokenMetaData } = require("../utils/helper");
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

module.exports = router;
