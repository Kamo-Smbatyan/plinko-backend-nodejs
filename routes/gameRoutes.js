const express = require("express");
const { placeBet } = require("../controllers/gameController");
const router = express.Router();

router.post("/bet", placeBet);

module.exports = router;
