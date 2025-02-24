const User = require("../models/User");
const dotenv = require('dotenv');

dotenv.config();
const WEBHOOK_ID = require('./constants')

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

const getWebHooks = async () => {
  try {
    let url = `https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log('WebHook', data)
    if (Array.isArray(data) && data.length > 0) {
      const walletArray = await getAllWalletAddresses();
      for (const webhook of data){
        if (webhook.webhookID != WEBHOOK_ID.getWebHookID()){
          continue
        }
          WEBHOOK_ID.setWebHookID(webhook.webhookID);
          if (walletArray != webhook.accountAddresses){
            editWebhook(WEBHOOK_ID.getWebHookID());
          }
          return webhook.webhookID;
      } // Return all webhook IDs
    } else {
      return 'no'; // No webhooks found
    }
  } catch (error) {
    console.error("Get webhooks error",error);
    return 'failed';
  }
};

const createWebhook = async () => {
  try {
    const walletArray = await getAllWalletAddresses();
    console.log('Wallet Array', walletArray);
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
    WEBHOOK_ID.setWebHookID(data.webhookID);
    console.log('Web hook created', data)
    return data.webhookID || 'no';
  } catch (e) {
    console.error("Webhook Creation error", e);
    WEBHOOK_ID.setWebHookID(null);
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
    console.error("delete webhook error", e);
    return false;
  }
};

const editWebhook = async (webhookID) => {
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
    WEBHOOK_ID.setWebHookID(data.webhookID);
    console.log('Editing webhook success.', WEBHOOK_ID.getWebHookID());
    return data.data && walletArray === data.accountAddresses;
  } catch (e) {
    console.error("edit webhook error", e);
    return false;
  }
};

module.exports = { editWebhook, createWebhook, deleteWebhook, getWebHooks };