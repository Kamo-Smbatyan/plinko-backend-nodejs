const express = require("express");
const {checkUserByTelegram, createUser, getUserData} = require("../controllers/userController");
const { fetchTokenListFromBirdeye } = require("../utils/helper");
const router = express.Router();

router.post("/getUserData", getUserData);
// router.post('/update-balance', updateBallance);
router.post('/checkUserByTelegram', checkUserByTelegram);
router.post('/createUserByTelegram', createUser);
router.get('/test', async (req, res) => {
    const data = await fetchTokenListFromBirdeye();
    res.status(200).json(data);    
});
module.exports = router;
