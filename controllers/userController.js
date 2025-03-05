const { editWebhookUser, createWebhookUser } = require("../config/webhook");
const WEBHOOK_ID = require('../config/constants');
const {Keypair} = require('@solana/web3.js');
const User = require("../models/schema/User");
const bs58 = require('bs58');
const {sendStatusMessageToClient} = require("../socket/service");

async function checkUserByTelegram(req, res){
  const { telegramID } = req.body;
  sendStatusMessageToClient(telegramID, `Verifying your telegram ID`);
  if(!telegramID){
    return res.status(400).json({error: 'failed'})
  }

  const user = await User.findOne({telegramID: telegramID});
  if (!user){
    sendStatusMessageToClient(telegramID, `Didn't find any data`);
    return res.json(false);
  }
  sendStatusMessageToClient(telegramID, `Successfully virified. Play game.`);
  return res.json(!!user);
}

async function createUser(req,res){
  sendStatusMessageToClient(telegramID, `Creating new user...`);
  const {telegramID} = req.body;
  try{
    const wallet = Keypair.generate();
    if (telegramID=='0'){
      return res.status(500).json({message: 'Account is not valid'});
    }
    const user = await User.insertOne({
      telegramID : telegramID, 
      walletAddress: wallet.publicKey.toBase58(), 
      secretKey: bs58.encode(wallet.secretKey),
    });
    sendStatusMessageToClient(telegramID, `Successfully created. You have no balance to play game.`);
    if(WEBHOOK_ID.getUserWebHookID() == 'no'){
       await createWebhookUser();
    }
    else
      await editWebhookUser(WEBHOOK_ID.getUserWebHookID());
    return res.json({
      walletAddress: wallet.publicKey.toBase58(),
    });
  } catch (error){
    sendStatusMessageToClient(telegramID, `Creating account failed. Please reload app and try again.`);
    console.error('User Creation Failed', error);
    return res.status(500).json({message: 'DB Error'});
  }
}

async function getUserData(req, res){
  const {telegramID} = req.body;
  try{
    sendStatusMessageToClient(telegramID, `Welcome to back. Getting your information`);
    if (!telegramID || telegramID == '0'){
      return res.status(400).json({error: 'Bad request'});
    }
    const user = await User.findOne({telegramID: telegramID});
    if(!user){
      return res.status(500).json({
        error:'User not found'
      });
    }
    sendStatusMessageToClient(telegramID, `Your balance: ${user.balanceStableCoin}`);
    return res.json({
      walletAddress: user.walletAddress,
      balance: user.balanceStableCoin
    });
  }
  catch (error){
    sendStatusMessageToClient(telegramID, `Something went wrong`);
    res.status(500).json({
      error: error,
      data: 'Server Error'
    });
  }
}

module.exports = { getUserData, checkUserByTelegram, createUser};
