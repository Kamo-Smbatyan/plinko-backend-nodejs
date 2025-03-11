const { Connection, AddressLookupTableAccount, Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const {createWebhookUser, createWebhookAdmin, getWebhooks, editWebhookUser, editWebhookAdmin} = require('../config/webhook');
const dotenv = require('dotenv');
const { AccountLayout, createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddressSync} = require('@solana/spl-token');
const axios = require('axios');

const WEBHOOK_ID = require('../config/constants');
const { JITO_ENDPOINTS } = require('../config/constants');

dotenv.config();
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const connection = new Connection(process.env.SOLANA_RPC_URL);
const adminWallet = Keypair.fromSecretKey(bs58.decode(process.env.ADMIN_WALLET_SECRETKEY));

const deserializeTransaction = (swapTransaction) => {
    try{
        const transactionBuffer = Buffer.from(swapTransaction, 'base64');
        return VersionedTransaction.deserialize(transactionBuffer).message;
    } catch (err){
        throw new Error("Error in deserializing transaction");
    }
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
    console.log(JITO_ENDPOINTS);
    const request = JITO_ENDPOINTS.map(async (url) => 
        await axios.post(url, 
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
        console.log('Jito: At least one successful response');
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
        if(!confirmation.value.err) return true;
        else return false;
    } catch (error) {
        return false;
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
        let webhookFlags = 0;
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

const fetchTokenListFromBirdeye = async (offset) => {
    try {
        const apiKey = process.env.BIRDEYE_API_KEY || '14d4adcd88284ab29a2f80c8481c202d';
        const res = await axios.get(`https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=${offset}&min_liquidity=10000`,{
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
            },
        });

        const tokenData = await res.data?.data.tokens;
        const tokenArray = Object.values(tokenData).map(token => ({
            address: token?.address,
            logoURI: token.logoURI,
            name: token.name,
            price: token.price,
            symbol: token.symbol,
            liquidity: token.liquidity,
            decimals: token.decimals,
        }))
        console.log("Token List: ", tokenArray.length);
        return tokenArray;
    } catch (err){
        console.error("Failed to fetch from Birdeye:", err);
        return;
    }
}

const checkLiquidity  = async (tokenMint) => {
    //add actual logic
    try{ 
        const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`);
        if(!response || response.status != 200){
            return false
        }
        const data = response?.data?.totalMarketLiquidity;
        return (data > 10000);
    } catch (err){
        return false;
    } 
}

const fetchTokenMetaData = async (req, res) => {
    try{ 
        const {tokenMint} = req.query;
        const response = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`);
        if(!response || response.status != 200){
            return res.status(500).json({error: "Error fetching token metadata", message: "Failed to fetch token metadata"});
        }
        const data = response?.data;
        return res.status(200).json({tokenMetaData: data});   
    } catch (err){
        return res.status(500).json({error: err, message: "Failed to fetch token metadata"});
    } 
}

const getSwapQuoteFromJup = async (inputMint, outputMint, inputAmount, slippageBps, walletAddress) => {

        if (!inputMint || !outputMint || !inputAmount){
            throw new Error("Invailed parameters");
        }
        if(inputMint === outputMint){
            throw new Error("Input token equals output token");
        }
        const url = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${Math.floor(inputAmount)}&slippageBps=${slippageBps}`
        console.log(url);
        const quoteResponse = await axios.get(url);
        if(quoteResponse.error){
            throw new Error("Error:", err);
        }
        const quoteData = quoteResponse.data;
        if (quoteData.error){
            throw new Error('Get swap quote failed');
        }
        const outAmount = quoteData.outAmount;
        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: walletAddress,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: {
                jitoTipLamports: 0.0001 * LAMPORTS_PER_SOL
            },
        };
        return { swapRequestBody, outAmount };
}

// const getSwapTransactionFromJup = async ( quoteResponse ) => {
//     try {
//         const swapResponse = await axios.post(`https://api.jup.ag/swap/v1/swap`, quoteResponse);
            
//         if ( swapResponse.error){
//             throw new Error('Failed to get swap instructions:', swapResponse.error);
//         }

//         const swapData = swapResponse.data

//         return swapData.swapTransaction
//     } catch (err){
//         throw new Error("Failed to get swap Instruction", err);
//     }
// }

const getSwapInstructionFromJup = async (quoteResponse, signers) => {
    try {
        const instructions = await axios.post('https://api.jup.ag/swap/v1/swap-instructions', quoteResponse);
    
        if (instructions.error) {
            throw new Error("Failed to get swap instructions: " + instructions.error);
        }
        const {
            tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
            computeBudgetInstructions, // The necessary instructions to setup the compute budget.
            setupInstructions, // Setup missing ATA for the users.
            swapInstruction: swapInstructionPayload, // The actual swap instruction.
            cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
            addressLookupTableAddresses,// The lookup table addresses that you can use if you are using versioned transaction.
            otherInstructions,
        } = instructions.data;
        // console.log('INSTRUCTUcTIONS:', instructions.data);
        const deserializeInstruction = (instruction) => {
            return new TransactionInstruction({ 
            programId: new PublicKey(instruction.programId),
            keys: instruction.accounts.map((key) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            data: Buffer.from(instruction.data, "base64"),
            });
        };
        
        const getAddressLookupTableAccounts = async (keys) => {
            const addressLookupTableAccountInfos =
            await connection.getMultipleAccountsInfo(
                keys.map((key) => new PublicKey(key))
            );
        
            return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
                const addressLookupTableAddress = keys[index];
                if (accountInfo) {
                    const addressLookupTableAccount = new AddressLookupTableAccount({
                    key: new PublicKey(addressLookupTableAddress),
                    state: AddressLookupTableAccount.deserialize(accountInfo.data),
                    });
                    acc.push(addressLookupTableAccount);
                }
            
                return acc;
            }, new Array());
        };
        
        const addressLookupTableAccounts = [];
        
        addressLookupTableAccounts.push(
            ...(await getAddressLookupTableAccounts(addressLookupTableAddresses))
        );
        
        const blockhash = (await connection.getLatestBlockhash()).blockhash;
        const messageV0 = new TransactionMessage({
            payerKey: signers[0].publicKey,
            recentBlockhash: blockhash,
            instructions: [
                ...computeBudgetInstructions.map(deserializeInstruction),
                ...setupInstructions.map(deserializeInstruction),
                deserializeInstruction(swapInstructionPayload),
                deserializeInstruction(cleanupInstruction),
                ...otherInstructions.map(deserializeInstruction),
            ],
        }).compileToV0Message(addressLookupTableAccounts);
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign(signers);
        console.log("HASH", bs58.encode(transaction.signatures[0]));
        const txBinary = bs58.encode(transaction.serialize());
        const txSignature = bs58.encode(transaction.signatures[0])
        return {txBinary, txSignature};
    } catch (err){
        console.log(err);
        // throw new Error("Failed to get swap instruction", err);
    }
}

const tokenSwap = async (walletAddress, inputMint, outputMint, inputAmount, slippageBps, signers) => {
    try{
        const {swapRequestBody, outAmount} = await getSwapQuoteFromJup(inputMint, outputMint, inputAmount, slippageBps, walletAddress);
        const swapInsResult = await getSwapInstructionFromJup (swapRequestBody, signers);
        const isSent = await sendBundleRequest([swapInsResult.txBinary]);
        return {isSent, swapTxHash: swapInsResult.txSignature, outAmount};
    } catch (error){
        console.log(error);
        throw new Error("Error in token swap", error.message);
    }
}

const tokenTransfer = async (senderWallet, receiverAddress, tokenMint, amount, signers) => {
    try{
        const [ senderATA, receiverATA ] = await Promise.all([
            getAssociatedTokenAddressSync(new PublicKey(tokenMint), senderWallet.publicKey),
            getAssociatedTokenAddressSync(new PublicKey(tokenMint), new PublicKey(receiverAddress)),
        ]);
        const instructions = [];
        if(!(await checkTokenAccountExistence(receiverATA))) {
            instructions.push( createAssociatedTokenAccountInstruction( signers[0].publicKey, receiverATA, new PublicKey(receiverAddress), new PublicKey(tokenMint)));
        }
        const [ tokenBalance, latestBlockhash ] = await Promise.all([
            getTokenBalance(senderATA),
            connection.getLatestBlockhash()
        ]);
        console.log("token balance:",tokenBalance)
        if(tokenBalance < amount) {
            console.log('Sender wallet has no enough assets');
            return;
        }

        const signersArray = (senderWallet in signers) ? signers : [...signers, senderWallet] ;

        instructions.push(createTransferInstruction(senderATA, receiverATA, senderWallet.publicKey, amount));
        const versionedTransaction = await createVersionedTransaction(signersArray, instructions, latestBlockhash);

        const signature = await connection.sendRawTransaction(versionedTransaction.serialize(), signersArray);

        return signature;
    } catch(err){
        console.log(err)
        return;
    }
}

const solTransfer = async (senderWallet, receiverAddress, amount, signers) => {
    let userBalance = await connection.getBalance(senderWallet.publicKey);
    console.log(`Sol Balance ${amount / LAMPORTS_PER_SOL} ${senderWallet.publicKey.toBase58()}`);
    let retrying = 0
    while (userBalance == 0){
        await delay(1000);
        retrying ++;
        userBalance = await connection.getBalance(senderWallet.publicKey);
        if(retrying > 10 && userBalance < amount){
            console.log("Not enough assets in user wallet");
            return;
        }
    }
    const instructions = [];
    instructions.push(
        SystemProgram.transfer({
            fromPubkey: senderWallet.publicKey,
            toPubkey: new PublicKey(receiverAddress),
            lamports: userBalance
        })
    );

    const latestBlockhash = await connection.getLatestBlockhash();
    const signersArray = (senderWallet in signers) ? signers: [...signers, senderWallet]
    const versionedTransaction = await createVersionedTransaction(signersArray, instructions, latestBlockhash);
    const tx_id = await connection.sendRawTransaction(versionedTransaction.serialize(), signers);
    console.log('Forwarding asset to admin wallet...');
    return tx_id;
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
    fetchTokenListFromBirdeye,
    checkLiquidity,
    fetchTokenMetaData,
    getSwapQuoteFromJup,
    // getSwapTransactionFromJup,
    tokenSwap,
    getSwapInstructionFromJup,
    tokenTransfer,
    solTransfer    
}