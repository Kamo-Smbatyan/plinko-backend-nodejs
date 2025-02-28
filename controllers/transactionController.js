const { Keypair, PublicKey,  LAMPORTS_PER_SOL, SystemProgram, VersionedTransaction} = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, NATIVE_MINT } = require('@solana/spl-token');
const dotenv = require('dotenv');
const bs58 = require('bs58');
const axios = require('axios');
const {createTransferInstruction} = require('@solana/spl-token');
const User = require('../models/schema/User');
const { adminWallet, connection, delay, createVersionedTransaction, checkTokenAccountExistence, getTokenBalance, checkTransactionStatus } = require('../utils/helper');
const { SOL_MINT_ADDRESS, USDC_MINT_ADDRESS } = require('../config/constants');
const {sendMessageToClient} = require('../socket/service');
const { newTransactionHistory, findByIdAndUpdateTransaction } = require('../models/model/TransactionModel');

dotenv.config();

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
            sendMessageToClient(user.telegramID, `You are deposting ${amount / LAMPORTS_PER_SOL} SOL. Processing`);
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
            const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${USDC_MINT_ADDRESS}&amount=${Math.floor(tokenBalance)}&slippageBps=30`);
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
        sendMessageToClient(user.telegramID, `Something went wrong. Please try again later`);
        return res.status(500).json({message:'Wallet address not found'});
    }
    if (user.balanceStableCoin *0.975 < amount){
        sendMessageToClient(user.telegramID, `You have no enough balance`);
        res.status(400).json({message: 'Not enough balance'});
    }
    
    const result = await transferUSDC(adminWallet, receiverWallet, amount * 0.975 * (10**6), USDC_MINT_ADDRESS);
    let txHistoryData = {
        telegramID: user.telegramID,
        withdraw:{
            transaction: result,
            amount: amount*0.975,
            toAddress: receiverWallet,
            timeStamp: Date.now(),
            status: 'pending'
        },
        created_at: Date.now(),
    }   
    const txHistory = await newTransactionHistory(txHistoryData);
    await txHistory.save()
    const _id = txHistory._id;
    if (!result){
        console.log("Withraw failed.");
        sendMessageToClient(user.telegramID, `Failed to withraw. Try again!`);
        await findByIdAndUpdateTransaction(_id, {
            withdraw:{
                status: 'failed',
                timeStamp: Date.now(),
            }
        });
        return res.status(400).json({
            message: 'Transaction failed'
        });
    }
    
    sendMessageToClient(user.telegramID, `You successfully withdraw ${amount} USDC. Confirming...`);
    
    const isConfirmed = await checkTransactionStatus(result);

    if (!isConfirmed){
        await findByIdAndUpdateTransaction(_id, {
            withdraw:{
                status: 'failed',
                timeStamp: Date.now(),
            }
        });
        sendMessageToClient(user.telegramID, ` Withdraw transaction confirming failed`);
        return;
    }
    
    user.balanceStableCoin -= amount;
    await user.save();

    sendMessageToClient(user.telegramID, `Withdraw succeed`);
    console.log('Withdraw succeed.');
    return res.status(200).json({
        balance: user.balanceStableCoin,
    });
}

async function transferUSDC(sender, receiver, amount, mint){
    try{
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

        const signature = await connection.sendRawTransaction(versionedTransaction.serialize(), signers);

        return signature;
    } catch(err){
        console.log("Withdraw Error", err);
        return;
    }
}

async function tokenSwap(inputMint, swapAmount, user){
    try{
        let adminWalletTokenBalance = 0;
        const associatedTokenAccountForAdmin = getAssociatedTokenAddressSync(new PublicKey(inputMint), adminWallet.publicKey);
        while(adminWalletTokenBalance < swapAmount){
            adminWalletTokenBalance = await getTokenBalance(associatedTokenAccountForAdmin);
            await delay(2000);
            if (adminWalletTokenBalance >= swapAmount){
                break;
            }
        }
        
        console.log('Swapping', swapAmount, adminWalletTokenBalance);
        const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${USDC_MINT_ADDRESS}&amount=${Math.floor(swapAmount)}&slippageBps=30`);

        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error){
            throw new Error('Get swap quote failed');
        }

        const outAmount = quoteData.outAmount;

        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: adminWallet.publicKey.toString(),
            dynamicComputeUnitLimit: true,
            // prioritizationFeeLamports: {
            //     jitoTipLamports: 0.001 * LAMPORTS_PER_SOL
            // },
        };

        const swapResponse = await axios.post(`https://api.jup.ag/swap/v1/swap`, swapRequestBody);
        
        if (swapResponse.error){
            throw new Error('Failed to get swap instructions:');
        }

        const swapData = swapResponse.data;
                
        const deserializedTransaction = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
        deserializedTransaction.sign([adminWallet]);
        const rawTransaction = deserializedTransaction.serialize();
        // const message = deserializeTransaction(swapData.swapTransaction);
        // const accountKeysFromLookups = await resolveAddressLookups(message);
        // const swapInstructions = await createTransactionInstructions(message, accountKeysFromLookups);

        // const versionedTrasnactionSwap = await createVersionedTransaction([adminWallet], swapInstructions, latestBlockhash);
        // versionedTrasnactionSwap.sign([adminWallet]);
        // const transactionBinary = versionedTrasnactionSwap.serialize()
        // const swapTransactionSignature = versionedTrasnactionSwap.signatures[0];
        // const serializedSwapTransaction = bs58.encode(transactionBinary);

        const swapTransactionSignature = deserializedTransaction.signatures[0];
        const serializedSwapTransaction = bs58.encode(rawTransaction);
        
        let tx_id;
        try{
            console.log('Sending swap transaction...');
            tx_id = await connection.sendRawTransaction(rawTransaction);
        } catch(err){
            console.log('Swap error on rpc');
            tx_id = '';
        }

        if(tx_id != ''){
            tx_id = bs58.encode(Buffer.from(tx_id));
        }
        const isConfirmed = await checkTransactionStatus(tx_id);
        
        // let isSent = false;
        // let retry = 0
        // while(!isSent) {
        //     retry ++;
        //     console.log(`Swap transaction pending...${retry}`);
        //     isSent = await sendBundleRequest([serializedSwapTransaction]);
        //     if(!isSent) {
        //         await delay(2000);
        //         if (retry > 5){
        //             transactionStatus = TX_STATE.FAILED;
        //             break;
        //         }
        //     }
        //     else{
        //         transactionStatus = TX_STATE.SENT;
        //         break;
        //     }
        // }

        // if(!isSent){
        //     return;
        // }

        // retry = 0;
        // console.log('Swap transaction sent.')
        // let isConfirmed = false;
        // while(isConfirmed) {
        //     console.log('Confirming...');
        //     retry++
        //     const result = await checkTransactionStatus(swapTransactionSignature, latestBlockhash);
        //     if(!result.confirmed) {
        //         if(retry > 5){
        //             transactionStatus = TX_STATE.FAILED
        //         }
        //         await delay(2000);
        //         isConfirmed = result.confirmed;
        //     }
        //     else {
        //         transactionStatus = TX_STATE.CONFIRMED;
        //         break;
        //     }
        // }

        return { 
            tx_id, 
            outAmount,
            isConfirmed,
        };
    } catch(err) {
        console.log(err)
        return ;
    }
}

async function solSwap (swapAmount, user) {
    try {
        await tokenSwap(NATIVE_MINT, swapAmount, user)
    } catch(err) {
        console.log(err);
        return;
    }
}

async function getData(req, res){
   try{ 
        const {telegramID} = req.query;
        const txHistory =await TransactionHistory.find({telegramID: telegramID, tx_type: { $in: ['withdraw', 'deposit'] }}).exec();
        if (!txHistory){
            return res.json([]);
        }
        return res.status(200).json(txHistory);
    } catch (err){
        console.log(err);
    }
}

module.exports = {tokenTransferToAdmin, userWithdraw, transferUSDC, tokenSwap, getData, solSwap};
