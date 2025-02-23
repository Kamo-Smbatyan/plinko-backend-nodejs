const { Telegraf } = require("telegraf");
const User = require("../models/User");
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.start(async (ctx) => {
  const telegramId = ctx.message.from.id;
  let user = await User.findOne({ telegramId });

  if (!user) {
    user = new User({ telegramId, walletAddress: "" });
    await user.save();
    ctx.reply("Welcome! Please set your wallet address.");
  } else {
    ctx.reply("Welcome back! Use /balance to check your funds.");
  }
});

bot.command("balance", async (ctx) => {
  const user = await User.findOne({ telegramId: ctx.message.from.id });
  if (!user) return ctx.reply("You are not registered.");
  
  ctx.reply(`Your balance: 
  - Stablecoin: ${user.balanceStablecoin} 
  - MemeCoin: ${user.balanceMemecoin}`);
});

bot.launch();
