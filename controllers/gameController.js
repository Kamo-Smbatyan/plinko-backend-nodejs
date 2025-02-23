const GameHistory = require("../models/GameHistory");

async function placeBet(req, res) {
  const { telegramId, betAmount, winAmount } = req.body;

  const game = new GameHistory({ telegramId, betAmount, winAmount });
  await game.save();
  res.json({ message: "Bet placed", game });
}

module.exports = { placeBet };
