const { MessageV0, Connection, AddressLookupTableAccount, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const {createWebhookUser, createWebhookAdmin, getWebhooks, editWebhookUser, editWebhookAdmin} = require('../config/webhook');
const dotenv = require('dotenv');
const { AccountLayout, } = require('@solana/spl-token');
const axios = require('axios');
const {clients} =  require('../config/constants');
const WEBHOOK_ID = require('../config/constants');
const { JITO_TIP_ACCOUNTS, JITO_ENDPOINTS } = require('../config/constants');

dotenv.config();
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const connection = new Connection(process.env.SOLANA_RPC_URL);
const adminWallet = Keypair.fromSecretKey(bs58.decode(process.env.ADMIN_WALLET_SECRETKEY));

const deserializeTransaction = (swapTransaction) => {
    const transactionBuffer = Buffer.from(swapTransaction, 'base64');
    return VersionedTransaction.deserialize(transactionBuffer).message;
}

const resolveAddressLookups = async (message) => {
    if (!message.addressTableLookups.length) {
        return { writable:[], readonly:[] };
    }

    const lookupTableAccounts = await Promise.all(
        message.addressTableLookups.map(async (lookup, i) => {
            const accountInfo = await connection.getAccountInfo(lookup.accountKey);
            if (!accountInfo) {
                throw new Error(`Missing address lookup table account info at index ${i}`);
            }
            
            return new AddressLookupTableAccount({
                key: lookup.accountKey,
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
        }),
    );

    return message.resolveAddressTableLookups(lookupTableAccounts);
}

const createTransactionInstructions = (message, accountKeysFromLookups) => {
    const accountKeys = message.getAccountKeys({ accountKeysFromLookups });
    return message.compiledInstructions.map(({ accountKeyIndexes, programIdIndex, data }) => {
        const keys = accountKeyIndexes.map(index => ({
            pubkey: accountKeys.get(index),
            isSigner: message.isAccountSigner(index),
            isWritable: message.isAccountWritable(index),
        }));

        return new TransactionInstruction({ keys, programId: accountKeys.get(programIdIndex), data: Buffer.from(data) });
    });
}

const createVersionedTransaction = async (payer, instructions, latestBlockhash) => {
    try {
        //console.log('PAYER:', payer, instructions, latestBlockhash);
        const message = new TransactionMessage({
            payerKey: payer[0].publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions,
        }).compileToV0Message();

        const tx = new VersionedTransaction(message);
        tx.sign(payer);
        return tx;
    } catch (error) {
        console.error('Error in createVersionedTransaction:', error);
        throw new Error('Failed to create transaction');
    }
}

const checkTokenAccountExistence = async (associatedTokenAccount) => {
    const accountInfo = await connection.getAccountInfo(associatedTokenAccount);
  
    if (accountInfo) {
      return true;
    } else {
      return false;
    }
}

const getTokenBalance = async (associatedTokenAccount) => {
    try {
      const accountInfo = await connection.getAccountInfo(associatedTokenAccount);
  
      if (!accountInfo) {
        console.log("Token account does not exist.");
        return 0;
      }
  
      const decodedData = AccountLayout.decode(accountInfo.data);
  
      const balance = decodedData.amount;
  
      return Number(balance);
    } catch (error) {
      console.error("Error fetching token balance:", error);
    }
}

const sendBundleRequest = async (serializedTransactions) => {
    const request = JITO_ENDPOINTS.map((url) => 
        axios.post(url, 
            {
                jsonrpc: '2.0',
                id: 1,
                method: 'sendBundle',
                params: [serializedTransactions]
            }, 
            {
                headers: { 
                    'Content-Type': 'application/json' 
                }
            }
        )
    );
    
    console.log('Jito: Sending transactions to endpoints...');
    
    const results = await Promise.all(request.map((result) => result.catch((e) => e)));

    const successfulResults = results.filter((result) => !(result instanceof Error));

    if (successfulResults.length > 0) {
        // console.log('Jito: At least one successful response');
        // console.log('Jito: Confirming transaction...');
        console.log(signautre)
        return true;
    } else {
        console.log('Jito: No successful responses received for jito');
        return false;
    }
}

const checkTransactionStatus = async (signatures) => {
    try {
        console.log('Confirming transaction....');
        const confirmation = await connection.getSignatureStatus(signatures, {searchTransactionHistory: true});

        return { confirmed: !confirmation.value.err, err: confirmation.value.err };
    } catch (error) {
        return { confirmed: false, err: error };
    }
}

async function getDecimal(mint) {
    try {
        const response = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            jsonrpc: "2.0",
            id: "test",
            method: "getAsset",
            params: {
                id: mint
            }
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        
        const decimals = response.data?.result?.token_info?.decimals;
        return decimals;
    } catch (error) {
        console.error("Error fetching decimals:", error);
    }
}

const delay =  (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const checkWebhooks = async () => {
    const webhooks = await getWebhooks();
    if (webhooks == 'failed'){
        console.log('Webhooks fetching error');
        return;
    } else if (webhooks == 'no'){
        await createWebhookUser();
        await createWebhookAdmin();
    }
    else if (Array.isArray(webhooks)){
        let webhookFlags;
        // console.log(WEBHOOK_ID.getUserWebHookID(), WEBHOOK_ID.getAdminWebhookID());
        for (const webhook of webhooks){
            if (webhook.webhookID == WEBHOOK_ID.getUserWebHookID() ){
                await editWebhookUser(webhook.webhookID);
                webhookFlags ++
            }
            else if (webhook.webhookID == WEBHOOK_ID.getAdminWebhookID()) {
                await editWebhookAdmin(webhook.webhookID);
                webhookFlags ++
            }
        }
        if (webhookFlags<2){
            console.log('At least 2 webhook should be required');
            return;
        }
    }
}

module.exports = {
    connection, 
    adminWallet,
    deserializeTransaction,
    resolveAddressLookups,
    createTransactionInstructions,
    createVersionedTransaction,
    checkTokenAccountExistence,
    getTokenBalance,
    sendBundleRequest,
    checkTransactionStatus,
    delay,
    checkWebhooks,
    getDecimal,
}