const { editWebhookUser, createWebhookUser } = require("../config/webhook");
const WEBHOOK_ID = require('../config/constants');
const {Keypair} = require('@solana/web3.js');
const {sendStatusMessageToClient} = require("../socket/service");
const { getUser, createNewUser } = require("../models/model/UserModel");

async function checkUserByTelegram(req, res){
  const { telegramID } = req.body;
  sendStatusMessageToClient(telegramID, `Verifying your telegram ID`);

  if(!telegramID){
    return res.status(400).json({error: 'failed'})
  }

  const userData = await getUser(telegramID);

  if (!userData.success){
    sendStatusMessageToClient(telegramID, `Didn't find any data`);
  } else {
    sendStatusMessageToClient(telegramID, `Successfully virified. Play game.`);
  }

  return res.json(userData.success);
}

async function createUser(req,res){
  sendStatusMessageToClient(telegramID, `Creating new user...`);
  const {telegramID} = req.body;
  try{
    const wallet = Keypair.generate();
    if (!telegramID || telegramID=='0'){
      return res.status(500).json({message: 'Account is not valid'});
    }
    const userData = await createNewUser(telegramID, wallet);
    if (!userData.success){
      sendStatusMessageToClient(telegramID, `Creating account failed. Please reload app and try again.`);
      return res.status(500).json({message: 'Account is not created'});
    }

    sendStatusMessageToClient(telegramID, `Successfully created. You have no balance to play game.`);
    
    if(WEBHOOK_ID.getUserWebHookID() == 'no'){
       await createWebhookUser();
    }
    else{
      await editWebhookUser(WEBHOOK_ID.getUserWebHookID());
    }

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
    if (!telegramID || telegramID == '0'){
      return res.status(400).json({error: 'Bad request'});
    }
    sendStatusMessageToClient(telegramID, `Welcome to back. Getting your information`);
    const userData = await getUser(telegramID);
    if (!userData.success){
      sendStatusMessageToClient(telegramID, `We cannot get any information. Reload app and please try again`);
      return res.status(400).json({error: 'Bad request'});
    }
    const user = userData.data;
    sendStatusMessageToClient(telegramID, `Your balance: ${user.balanceStableCoin.toFixed(2)}`);
    return res.json({
      walletAddress: user.walletAddress,
      balance: user.balanceStableCoin
    });
  }
  catch (error){
    sendStatusMessageToClient(telegramID, `Something went wrong`);
    res.status(500).json({
      error: error,
      message: 'Server Error'
    });
  }
}

module.exports = { getUserData, checkUserByTelegram, createUser};
