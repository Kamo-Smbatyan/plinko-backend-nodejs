const { Keypair, PublicKey,  LAMPORTS_PER_SOL, SystemProgram, VersionedTransaction} = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, NATIVE_MINT, transfer } = require('@solana/spl-token');
const dotenv = require('dotenv');
const bs58 = require('bs58');
const axios = require('axios');
const {createTransferInstruction} = require('@solana/spl-token');
const User = require('../models/schema/User');
const { adminWallet, connection, delay, createVersionedTransaction, checkTokenAccountExistence, getTokenBalance, checkTransactionStatus, checkLiquidity } = require('../utils/helper');
const { SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, TRANSACTION_FEE } = require('../config/constants');
const {sendSuccessMessageToClient, sendErrorMessageToClient, sendStatusMessageToClient} = require('../socket/service');
const { newTransactionHistory, findByIdAndUpdateTransaction, getTransactionsByTelegramID } = require('../models/model/TransactionModel');

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
    try{
        const {telegramID, tokenMint, receiver, decimals, inputAmount} = req.body;
        const user = await User.findOne({telegramID});
        if (!user) {
            console.log("Withdraw", "User is not found");
            return res.status(500).json({error: "User fetch error", message: "User not found"});
        }
        const isSwappable = await checkLiquidity(tokenMint);
        if(!isSwappable){
            await sendErrorMessageToClient(user.telegramID, `This token has no enough liquidity`);
            await sendStatusMessageToClient(user.telegramID, `This token has no enough liquidity`);
            return res.status(500).json({error: "Lack of liquiity", message: "This token has no enough liquidity"});
        }
        const withdrawResult = await withdrawToken(receiver, tokenMint, inputAmount, user, decimals);
        if (!withdrawResult){
            await sendErrorMessageToClient(user.telegramID, `Something went wrong.Please try again later`);
            await sendStatusMessageToClient(user.telegramID, `Failed to withdraw`);
            return res.status(500).json({error:"Error wirhdrawl", message: "Try again later"});
        }
        await sendSuccessMessageToClient(user.telegramID, `Withdrawl is confirmed successfully`);
        await sendStatusMessageToClient(user.telegramID, `Withdrawl is confirmed successfully`);
        return res.status(200).json(true);
    } catch (err){
        console.log(err);
        await sendErrorMessageToClient(user.telegramID, `Something went wrong.Please try again later`);
        await sendStatusMessageToClient(user.telegramID, `Failed to withdraw`);
        return res.status(400).json({error: err, message: "Bad request"})
    }
}

async function transferToken(sender, receiver, amt, mint){
    const amount =  Math.floor(amt);
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
        console.log("token balance:",tokenBalance)
        if(tokenBalance < amount) {
            console.log('Admin wallet has no enough assets');
            //sendErrorMessageToClient(user.telegramID, "Failed! Admin wallet has no enough assets. Please try again later");
            return;
        }

        const signers = (sender === adminWallet) ? [adminWallet] : [adminWallet, sender] ;

        instructions.push(createTransferInstruction(senderATA, receiverATA, adminWallet.publicKey, amount));
        const versionedTransaction = await createVersionedTransaction(signers, instructions, latestBlockhash);

        const signature = await connection.sendRawTransaction(versionedTransaction.serialize(), signers);

        return signature;
    } catch(err){
        console.log(err)
        return;
    }
}

async function tokenSwap(inputMint, swapAmount, toMint){
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
        console.log
        const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${toMint}&amount=${Math.floor(swapAmount)}&slippageBps=30`);

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
        await tokenSwap(NATIVE_MINT, swapAmount, USDC_MINT_ADDRESS)
    } catch(err) {
        console.log(err);
        return;
    }
}

async function getData(req, res){
   try{ 
        const {telegramID} = req.query;
        const txHistory =await getTransactionsByTelegramID(telegramID);
        if (!txHistory){
            return res.json([]);
        }
        return res.status(200).json(txHistory);
    } catch (err){
        console.error(err);
        return res.status(500).json({
            error: err,
            message: 'Failed to fetch transaction data',
        });
    }
}

async function withdrawToken(receiver, tokenMint, inputAmount, user, decimals) {//inputAmount is USDC
    if (tokenMint == USDC_MINT_ADDRESS){
        const transactionResult = await transferToken(adminWallet, receiver, inputAmount * TRANSACTION_FEE, USDC_MINT_ADDRESS);
        if (!transactionResult){
            console.log("Here");
            sendStatusMessageToClient(user.telegramID, `Withdraw failed. Try again later`);
            await sendErrorMessageToClient(user.telegramID, `Withdraw failed. Try again later`)
            return false;
        }
        const txHistoryData = {
            telegramID: user.telegramID,
            withdraw:{
                transfer:{
                    transaction: transactionResult,
                    amount: inputAmount * TRANSACTION_FEE/(10**6),
                    toAddress: receiver,
                    tokenMint: tokenMint,
                    timeStamp: Date.now(),
                    status: "pending"
                },
            },
            created_at: Date.now(),
        };
        const txHistory = await newTransactionHistory(txHistoryData);
        await txHistory.save();
        const _id = txHistory._id;
        console.log(txHistory);
        const isConfirmed = await checkTransactionStatus(transactionResult);
        if (isConfirmed) {
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    "withdraw.transfer.timeStamp": Date.now(),
                    "withdraw.transfer.status": "successful"
                }
            });
            console.log("confirmed");
            sendSuccessMessageToClient(user.telegramID, `Withdraw successfully!`);
            sendStatusMessageToClient(user.telegramID, `Success. Your balance is updated`);
            user.balanceStableCoin -= inputAmount / (10**6);
            await user.save()
            return true;
        } else {
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    "withdraw.transfer.timeStamp": Date.now(),
                    "withdraw.transfer.status": "failed"
                }
            });
            sendStatusMessageToClient(user.telegramID, `Not confirmed`);
            await sendErrorMessageToClient(user.telegramID, `Transaction is not confirmed. Try again later`)
            return false;
        }
    }
    else{
        console.log(USDC_MINT_ADDRESS, inputAmount, tokenMint);
        const swapResult =await tokenSwap(USDC_MINT_ADDRESS, inputAmount * TRANSACTION_FEE, tokenMint);
        if (!swapResult) {
            await sendErrorMessageToClient(user.telegramID, `Something went wrong. Try again later`);
            await sendStatusMessageToClient(user.telegramID, `Failed to withdraw`);
            console.log("Withdraw swap transaction failed");
            return false
        }
        const txHistoryData = {
            telegramID: user.telegramID,
            withdraw:{
                swap:{
                    transaction: swapResult.tx_id,
                    amount: Math.floor(inputAmount * TRANSACTION_FEE) / (10**decimals),
                    toMint: tokenMint,
                    toAddress: receiver,
                    timeStamp: Date.now(),
                    status: "pending"
                },
            },
            created_at: Date.now(),
        };
        const txHistory = await newTransactionHistory(txHistoryData);
        await txHistory.save();
        const _id = txHistory._id
        if(!swapResult.isConfirmed){
            await sendErrorMessageToClient(user.telegramID, `Swap transaction confirmation failed. Try again later`);
            await sendStatusMessageToClient(user.telegramID, `Not confirmed`);
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    "withdraw.swap.timeStamp": Date.now(),
                    "withdraw.swap.status": "failed"
                }
            });
            return false;
        }
        console.log("Confirmed", swapResult.outAmount)

        await findByIdAndUpdateTransaction(_id, {
            $set: {
                "withdraw.swap.timeStamp": Date.now(),
                "withdraw.swap.status": "successful"
            }
        });
        await sendStatusMessageToClient(user.telegramID, `Transfer succeed. Swapping...`);
        const transferResult = await transferToken(adminWallet, receiver, swapResult.outAmount * TRANSACTION_FEE, tokenMint);
        if (!transferResult){
            await sendStatusMessageToClient(user.telegramID, `Transfer succeed`);
            await sendErrorMessageToClient(user.telegramID, `Withdraw failed. Try again later`)
            return false;
        }
        await findByIdAndUpdateTransaction(_id,{
            $set: {
                "withdraw.transfer.transaction": transferResult,
                "withdraw.transfer.status": "pending",
                "withdraw.transfer.tokenMint": tokenMint,
                "withdraw.transfer.amount": swapResult.outAmount/(10**decimals),
                "withdraw.transfer.toAddress": receiver,
                "withdraw.transfer.timeStamp": Date.now(),
            }
            
        });

        const isConfirmed = await checkTransactionStatus(transferResult);
        if (isConfirmed) {
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    "withdraw.transfer.timeStamp": Date.now(),
                    "withdraw.transfer.status": "successful"
                }
            });
            sendSuccessMessageToClient(user.telegramID, `Withdraw successfully!`);
            await sendStatusMessageToClient(user.telegramID, `Withdraw successfully`);
            user.balanceStableCoin -= inputAmount / (10**6);
            await user.save();
            return true;
        } else {
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    "withdraw.transfer.timeStamp": Date.now(),
                    "withdraw.transfer.status": "failed"
                }
            });
            await sendStatusMessageToClient(user.telegramID, `Swap transaction is not confirmed`);
            await sendErrorMessageToClient(user.telegramID, `Transaction is not confirmed. Try again later`)
            return false;
        }
    }
}

module.exports = {tokenTransferToAdmin, userWithdraw, transferToken, tokenSwap, getData, solSwap};
