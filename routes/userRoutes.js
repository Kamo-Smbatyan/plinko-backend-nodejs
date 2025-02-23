const express = require("express");
const {checkUserByTelegram, createUser, getUserData} = require("../controllers/userController");
const router = express.Router();

router.post("/getUserData", getUserData);
// router.post('/update-balance', updateBallance);
router.post('/checkUserByTelegram/', checkUserByTelegram);
router.post('/createUserByTelegram', createUser);
module.exports = router;
