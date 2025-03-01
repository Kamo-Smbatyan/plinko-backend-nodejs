const User = require("../models/schema/User");
const {Keypair} = require('@solana/web3.js');
const WEBHOOK_ID = require('./constants');
const dotenv = require('dotenv');
dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const SERVER_URL = process.env.SERVER_URL;
const WEBHOOK_TYPE = process.env.WEBHOOK_TYPE;

const getAllWalletAddresses = async () => {
  try {
    const users = await User.find({}, 'walletAddress');
    return users.map(user => user.walletAddress);
  } catch (error) {
    console.error("Error fetching wallet addresses:", error);
    return [];
  }
};

const getWebhooks = async () => {
  try {
    let url = `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;  // Return all webhook IDs
    } else {
      return 'no'; // No webhooks found
    }
  } catch (error) {
    console.error("Get webhooks error", error);
    return 'failed';
  }
};

const createWebhookUser = async () => {
  try {
    const walletArray = await getAllWalletAddresses();
    console.log('Wallet Array', walletArray);
    if (!walletArray){
      tempWallet = Keypair.generate();
      walletArray = [tempWallet.publicKey]
    }
    const response = await fetch(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookURL: `${SERVER_URL}/monitor/webhook/`,
          transactionTypes: ['ANY'],
          accountAddresses: walletArray,
          webhookType: WEBHOOK_TYPE,
        }),
      }
    );
    const data = await response.json();
    WEBHOOK_ID.setUserWebHookID(data.webhookID);
    // console.log('User webhook created', data);
    return data.webhookID || 'no';
  } catch (e) {
    console.error("Webhook Creation error", e);
    WEBHOOK_ID.setUserWebHookID(null);
    return 'failed';
  }
};

const createWebhookAdmin = async () => {
  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookURL: `${SERVER_URL}/monitor/webhookAdmin/`,
          transactionTypes: ['ANY'],
          accountAddresses: [process.env.ADMIN_WALLET_ADDRESS],
          webhookType: WEBHOOK_TYPE,
        }),
      }
    );
    const data = await response.json();
    return data.webhookID || 'no';
  } catch (e) {
    console.error("Webhook Creation error", e);
    WEBHOOK_ID.setAdminWebhookID(null);
    return 'failed';
  }
};

const deleteWebhook = async (webHookID) => {
  try {
    await fetch(
      `https://api.helius.xyz/v0/webhooks/${webHookID}?api-key=${HELIUS_API_KEY}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return true;
  } catch (e) {
    return false;
  }
};

const editWebhookUser = async (webhookID) => {
  try {
    const walletArray = await getAllWalletAddresses();
    if(walletArray.length === 0) {
      return;
    }
    const response = await fetch(
      `https://api.helius.xyz/v0/webhooks/${webhookID}?api-key=${HELIUS_API_KEY}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookURL:`${SERVER_URL}/monitor/webhook`,
          transactionTypes: ["ANY"],
          txnStatus: 'success',
          accountAddresses: walletArray,
          webhookType: 'enhanced'
        }),
      }
    );
    const data = await response.json();
    console.log("Editting hook:", data);
    
    if (data.error){
      // console.log("Editing webhook error", data.error);
      return;
    }

    return data.data && walletArray === data.accountAddresses;
  } catch (e) {
    console.error("edit webhook error", e);
    return false;
  }
};

const editWebhookAdmin = async (webhookID) => {
  try {
    const walletArray = [process.env.ADMIN_WALLET_ADDRESS];
    if(walletArray.length === 0) {
      return;
    }
    const response = await fetch(
      `https://api.helius.xyz/v0/webhooks/${webhookID}?api-key=${HELIUS_API_KEY}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookURL:`${SERVER_URL}/monitor/webhookAdmin`,
          txnStatus: 'success',
          transactionTypes: ["ANY"],
          accountAddresses: walletArray,
          webhookType: 'enhanced'
        }),
      }
    );
    const data = await response.json();
    console.log("Editting hook:", data);
    
    if (data.error){
      console.log("Editing webhook error", data.error);
      return;
    }

    return data.data && walletArray === data.accountAddresses;
  } catch (e) {
    console.error("edit webhook error", e);
    return false;
  }
};

module.exports = { 
  editWebhookUser,
  editWebhookAdmin, 
  deleteWebhook, 
  getWebhooks, 
  createWebhookAdmin, 
  createWebhookUser 
};