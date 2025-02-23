const { MessageV0, Connection, AddressLookupTableAccount, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const dotenv = require('dotenv');
const { AccountLayout, } = require('@solana/spl-token');
const axios = require('axios');
const WEBHOOK_ID = require('../config/constants');
const { JITO_TIP_ACCOUNTS, JITO_ENDPOINTS } = require('../config/constants');
const {getWebHooks, createWebhook} = require('../config/webhook');
dotenv.config();

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
        axios.post(url, {
            jsonrpc: '2.0',
            id: 1,
            method: 'sendBundle',
            params: [serializedTransactions]}, {
                headers: { 'Content-Type': 'application/json' }
            })
        );
    
    console.log('Jito: Sending transactions to endpoints...');
    
    const results = await Promise.all(request.map((result) => result.catch((e) => e)));

    const successfulResults = results.filter((result) => !(result instanceof Error));

    if (successfulResults.length > 0) {
        console.log('Jito: At least one successful response');
        console.log('Jito: Confirming transaction...');

        return true;
    } else {
        console.log('Jito: No successful responses received for jito');
        return false;
    }
}

const checkTransactionStatus = async (signature, latestBlockhash) => {
    try {
        const confirmation = await connection.confirmTransaction(
            {
                signature,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                blockhash: latestBlockhash.blockhash,
            },
            connection.commitment,
        );

        return { confirmed: !confirmation.value.err, err: confirmation.value.err };
    } catch (error) {
        return { confirmed: false, err: error };
    }
}

const checkAndSetWebhookID = async () => {
    let webHook =await getWebHooks();
    if(webHook == 'no'){
        console.log('Webhook not found. Creating new...')
        webHook = await createWebhook(); 
    }
    else if(webHook == 'failed'){
        console.log('Failed to get hooks. Check internet status.');
        return
    }
    WEBHOOK_ID.setWebHookID(webHook);
    console.log("Webhook ID:", WEBHOOK_ID.getWebHookID());
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
    checkAndSetWebhookID,
}