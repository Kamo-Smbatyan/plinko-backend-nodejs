const { Transaction, Keypair, PublicKey,  LAMPORTS_PER_SOL, SystemProgram, VersionedTransaction, VersionedMessage} = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, NATIVE_MINT } = require('@solana/spl-token');
const User = require('../models/User');
const dotenv = require('dotenv');
const bs58 = require('bs58');
const axios = require('axios');
const {createTransferInstruction} = require('@solana/spl-token');
const { adminWallet, connection, sendSignalToFrontend, createTransactionInstructions, deserializeTransaction, delay, createVersionedTransaction, checkTokenAccountExistence, getTokenBalance, sendBundleRequest, checkTransactionStatus, resolveAddressLookups } = require('../utils/helper');
const {clients} = require('../config/constants');
const TransactionHistory = require('../models/TransactionHistory');

dotenv.config();

const SOL_MINT_ADDRESS='So11111111111111111111111111111111111111112';
const USDC_MINT=process.env.USDC_MINT;

const tokenTransferToAdmin = async (inputMint, amount, user) => {
    try {
        const secretKey = user.secretKey;
        const userWallet = Keypair.fromSecretKey(bs58.decode(secretKey));
        const instructions = [];
        let tokenBalance = 0;
        let associatedTokenAccountForAdmin, associatedTokenAccountForUser ;
        
        if(inputMint === SOL_MINT_ADDRESS){
            let userBalance = await connection.getBalance(new PublicKey(user.walletAddress));
            console.log(`Sol Balance ${amount / LAMPORTS_PER_SOL} ${userWallet.publicKey.toBase58()}`);
            sendSignalToFrontend(user.telegramID, 'data: ' + 'sol' + '\n\n');
            let retrying = 0
            while (userBalance == 0){
                delay(1000);
                retrying ++;
                userBalance = await connection.getBalance(new PublicKey(user.walletAddress));
                if(retrying > 10){
                    return;
                }
            }
    
            instructions.push(
                SystemProgram.transfer({
                    fromPubkey: userWallet.publicKey,
                    toPubkey: adminWallet.publicKey,
                    lamports: userBalance
                })
            );

            const latestBlockhash = await connection.getLatestBlockhash();
            const versionedTransaction = await createVersionedTransaction([adminWallet, userWallet], instructions, latestBlockhash);
            
            console.log('Forwarding asset to admin wallet...');
        } else{
            //console.log(`${amount} token to ${userWallet.publicKey.toBase58()}`);
            sendSignalToFrontend(user.telegramID, 'data: ' + `token_${amount}` + '\n\n');
            [ associatedTokenAccountForAdmin, associatedTokenAccountForUser ] = await Promise.all([
                getAssociatedTokenAddressSync(new PublicKey(inputMint), adminWallet.publicKey),
                getAssociatedTokenAddressSync(new PublicKey(inputMint), userWallet.publicKey),
            ]);
            const checkATAExists = await checkTokenAccountExistence(associatedTokenAccountForAdmin);

            if(!(checkATAExists)) {
                instructions.push(createAssociatedTokenAccountInstruction(adminWallet.publicKey, associatedTokenAccountForAdmin, adminWallet.publicKey, new PublicKey(inputMint)));
            }

            while(tokenBalance === 0) {
                try {
                    tokenBalance = await getTokenBalance(associatedTokenAccountForUser);
                } catch(err) { }
                if(tokenBalance === 0) await delay(1000);
            }

            instructions.push(createTransferInstruction(associatedTokenAccountForUser, associatedTokenAccountForAdmin, userWallet.publicKey, tokenBalance));
        }

        const latestBlockhash = await connection.getLatestBlockhash();
        const versionedTransaction = await createVersionedTransaction([adminWallet, userWallet], instructions, latestBlockhash);
        
        console.log('Forwarding tokens to admin wallet...');

        const transferSignature = await connection.sendRawTransaction(versionedTransaction.serialize(), [adminWallet, userWallet]);
        
        let outAmount = null;
        try{
            const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${USDC_MINT}&amount=${Math.floor(tokenBalance)}&slippageBps=30`);
            const quoteResponseData = quoteResponse.data; 
            outAmount = quoteResponseData.outAmount;
            return {transferSignature, outAmount}
        } catch (err){
            console.log(err);
            return {transferSignature, outAmount};
        }

    } catch(err) {
        console.error(err);
        return;
    }
}

async function userWithdraw(req, res){
    const {amount, receiverWallet, senderWallet} = req.body;
    console.log('Withdraw', senderWallet, receiverWallet, amount);
    const user = await User.findOne({walletAddress: senderWallet});

    if(!user){
        return res.status(500).json({message:'Wallet address not found'});
    }
    if (user.balanceStableCoin < amount){
        res.status(400).json({message: 'Not enough balance'});
    }
    
    const result = await transferUSDC(adminWallet, receiverWallet, amount * 0.975 * (10**6), USDC_MINT);
    if (!result){
        return res.status(400).json({
            message: 'Transaction failed'
        });
    }

    user.balanceStableCoin -= amount;
    await user.save();

    return res.status(200).json({
        balance: user.balanceStableCoin,
        transaction: result
    })
}

async function transferUSDC(sender, receiver, amount, mint){
    const [ senderATA, receiverATA ] = await Promise.all([
        getAssociatedTokenAddressSync(new PublicKey(mint), sender.publicKey),
        getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(receiver)),
    ]);
    const instructions = [];
    
    if(!(await checkTokenAccountExistence(receiverATA))) {
        instructions.push(createAssociatedTokenAccountInstruction(adminWallet.publicKey, receiverATA, new PublicKey(receiver), new PublicKey(mint)));
    }
    const [ tokenBalance, latestBlockhash ] = await Promise.all([
        getTokenBalance(senderATA),
        connection.getLatestBlockhash()
    ]);
    
    if(tokenBalance < amount) {
        return;
    }

    const signers = (sender === adminWallet) ? [adminWallet] : [adminWallet, sender] ;
    console.log(signers.length);

    instructions.push(createTransferInstruction(senderATA, receiverATA, adminWallet.publicKey, amount));
    const versionedTransaction = await createVersionedTransaction(signers, instructions, latestBlockhash);
    
    let success = false;

    const signature = await connection.sendRawTransaction(versionedTransaction.serialize(), signers);

    return signature;
}

async function tokenSwap(inputMint, swapAmount, user){
    try{
        let adminWalletTokenBalance = 0;
        const associatedTokenAccountForAdmin = getAssociatedTokenAddressSync(new PublicKey(inputMint), adminWallet.publicKey);
        while(adminWalletTokenBalance === 0){
            try {
                adminWalletTokenBalance = await getTokenBalance(associatedTokenAccountForAdmin);
            } catch(err) {
                console.log("Error occurred in get tokenBalance")
            }
            if(adminWalletTokenBalance === 0) {
                await delay(2000);
                continue;
            }
            else{ break; }
        }
        
        console.log('Swapping', swapAmount, adminWalletTokenBalance);
        const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${USDC_MINT}&amount=${Math.floor(swapAmount)}&slippageBps=30`);

        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error){
            throw new Error('Get swap quote failed');
        }

        const outAmount = quoteData.outAmount;

        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: adminWallet.publicKey.toString(),
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: {
                jitoTipLamports: 0.001 * LAMPORTS_PER_SOL
            },
        };

        const swapResponse = await axios.post(`https://api.jup.ag/swap/v1/swap`, swapRequestBody);
        
        if (swapResponse.error){
            throw new Error('Failed to get swap instructions:');
        }

        const swapData = swapResponse.data;
        
        const message = deserializeTransaction(swapData.swapTransaction);
        const accountKeysFromLookups = await resolveAddressLookups(message);
        const swapInstructions = await createTransactionInstructions(message, accountKeysFromLookups);

        const versionedTrasnactionSwap = await createVersionedTransaction([ adminWallet ], swapInstructions, latestBlockhash);
        versionedTrasnactionSwap.sign([adminWallet]);
        const transactionBinary = versionedTrasnactionSwap.serialize()
        const swapTransactionSignature = versionedTrasnactionSwap.signatures[0];
        const serializedSwapTransaction = bs58.encode(transactionBinary);
        
        const transactionHistory = await TransactionHistory.insertOne({
            telegramID: user.telegramID,
            signature: swapTransactionSignature,
            mintAddress: USDC_MINT,
            tx_type: 2,
            tx_state: 1,
            inAmount: swapAmount/LAMPORTS_PER_SOL,
            outAmount: outAmount,
            created_at: Date.now().toLocaleString(),
            updated_at: Date.now().toLocaleString()
        });

        await transactionHistory.save();
        let transactionStatus;
        let isSent = false;
        let reply = 0
        while(!isSent) {
            retry ++;
            console.log(`Swap transaction pending...${retry}`);
            isSent = await sendBundleRequest([serializedSwapTransaction]);
            if(!isSent) {
                await delay(1000);
                if (retry > 5){
                    transactionStatus = "Failed";
                }
            }
            else{
                transactionStatus = 'Sent';
                break;
            }
        }

        console.log('Swap transaction sent.')
        let isConfirmed = false;
        while(isConfirmed) {
            console.log('Confirming...');
            const result = await checkTransactionStatus(swapTransactionSignature, latestBlockhash);
            if(!result.confirmed) {
                await delay(1000);
                isConfirmed = result.confirmed;
            }
            else {
                transactionStatus = 'Confirmed';
                break;
            }
        }

        return { 
            tx_id: swapTransactionSignature, 
            outAmount,
            transactionStatus,
            transactionHistory
        };
    } catch(err) {
        console.log(err)
        return ;
    }
}

async function solSwap (swapAmount) {
    try {
        const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${NATIVE_MINT}&outputMint=${USDC_MINT}&amount=${Math.floor(swapAmount)}&slippageBps=30`);

        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error){
            throw new Error('Get swap quote failed');
        }

        const outAmount = quoteData.outAmount;

        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: adminWallet.publicKey.toString(),
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: {
                jitoTipLamports: 0.001 * LAMPORTS_PER_SOL
            },
        };

        const swapResponse = await axios.post(`https://api.jup.ag/swap/v1/swap`, swapRequestBody);
            
        if (swapResponse.error){
            throw new Error('Failed to get swap instructions:');
        }

        const swapData = swapResponse.data;
            
        const message = deserializeTransaction(swapData.swapTransaction);
        const accountKeysFromLookups = await resolveAddressLookups(message);
        const swapInstructions = await createTransactionInstructions(message, accountKeysFromLookups);

        const versionedTrasnactionSwap = await createVersionedTransaction([ adminWallet ], swapInstructions, latestBlockhash);
        versionedTrasnactionSwap.sign([adminWallet]);
        const transactionBinary = versionedTrasnactionSwap.serialize()
        const swapTransactionSignature = versionedTrasnactionSwap.signatures[0];
        const serializedSwapTransaction = bs58.encode(transactionBinary);

        let isSent = false;
        while(!isSent) {
            isSent = await sendBundleRequest([serializedSwapTransaction]);
            if(!isSent) await delay(1000);
        }

        let isConfirmed = false;
        while(isConfirmed) {
            const result = await checkTransactionStatus(swapTransactionSignature, latestBlockhash);
            if(!result.confirmed) await delay(1000);
            isConfirmed = result.confirmed;
        }

        return { 
            tx_id: swapTransactionSignature, 
            outAmount
        };
    } catch(err) {
        console.log(err);
        return;
    }
}

module.exports = {tokenTransferToAdmin, userWithdraw, transferUSDC, tokenSwap};
