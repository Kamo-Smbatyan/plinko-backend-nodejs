const dotenv = require('dotenv');
const { adminWallet, checkTransactionStatus, tokenTransfer, tokenSwap } = require('../utils/helper');
const { USDC_MINT_ADDRESS, TRANSACTION_FEE } = require('../config/constants');
const {sendSuccessMessageToClient, sendErrorMessageToClient, sendStatusMessageToClient} = require('../socket/service');
const { newTransactionHistory, findByIdAndUpdateTransaction, getTransactionsByTelegramID } = require('../models/model/TransactionModel');
const { getUser } = require('../models/model/UserModel');
const { Keypair } = require('@solana/web3.js');

dotenv.config();

async function userWithdraw(req, res){
    try{
        const {telegramID, tokenMint, receiver, decimals, inputAmount} = req.body;
        if (!telegramID || !tokenMint || !receiver || !inputAmount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const userData = await getUser(telegramID);
        if (!userData.success) {
            console.log("Withdraw", "User not found");
            return res.status(500).json({error: "User fetch error", message: "User not found"});
        }
        
        const user = userData.data;
        
        let _id;
        let isConfirmed;
        let outAmount = inputAmount;
        sendStatusMessageToClient(telegramID, `Withdraw processing...`);
        if (tokenMint != USDC_MINT_ADDRESS) {
            sendStatusMessageToClient(telegramID, `Swapping to ${tokenMint}...`);
            const swapResult = await tokenSwap(adminWallet.publicKey.toBase58(), USDC_MINT_ADDRESS, tokenMint, Math.floor(inputAmount * TRANSACTION_FEE), 30, [adminWallet]);
            if (!swapResult.isSent) {
                await sendErrorMessageToClient(telegramID, `Withdraw failed. Try again later`);
                sendStatusMessageToClient(telegramID, `Failed to swap`);
                return res.status(500).json({error: 'Internal server error', message: 'Failed to swap'});
            }
            txHistory = await newTransactionHistory({
                telegramID: telegramID,
                withdraw: {
                    swap:{
                        transaction: swapResult.swapTxHash,
                        amount: inputAmount/(10 ** decimals) * TRANSACTION_FEE,
                        toMint: tokenMint,
                        timeStamp: Date.now(),
                        status: "pending",
                    }
                }
            });
            await txHistory.save();
            _id = txHistory._id;
            isConfirmed = await checkTransactionStatus(swapResult.swapTxHash);
            if(isConfirmed) {
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        "withdraw.swap.timeStamp": Date.now(),
                        "withdraw.swap.status": "successful",
                    }
                });
                outAmount = swapResult.outAmount;
                sendStatusMessageToClient(telegramID, `Swapped successfully. Transfering...`);
            }
            else {
                await findByIdAndUpdateTransaction(_id, {
                    $set:{
                        "withdraw.swap.timeStamp": Date.now(),
                        "withdraw.swap.status": "failed",
                    }
                });
                sendStatusMessageToClient(telegramID, `Swapping failed.`);
                await sendErrorMessageToClient(telegramID, `Swapping failed. Tray again later`);
                return res.status(500).json({error: "Swapping failed", message: "Try again later"});;
            }
        }
        const transferResult = await tokenTransfer(adminWallet, receiver, tokenMint, Math.floor(outAmount), [adminWallet]);
        if(!transferResult) {
            sendErrorMessageToClient(telegramID, `Token transfer failed. Try again later`);
            return res.status(500).json({error: "Internal server error", message: "Transaction failed"});
        }
        if (!txHistory){
            txHistory = await newTransactionHistory({
                telegramID: telegramID,
                withdraw: { "transfer.status": "pending" },  // Update the status immediately
            });
            await txHistory.save();
            _id = txHistory._id;
        }
        sendStatusMessageToClient(telegramID, `Confirming...`);
        await findByIdAndUpdateTransaction(_id, {
            $set:{
                "withdraw.transfer.transaction": transferResult,
                "withdraw.transfer.amount": outAmount/(10**decimals),
                "withdraw.transfer.status": "pending",
                "withdraw.transfer.toAddress": receiver,
                "withdraw.transfer.timeStamp": Date.now(),
            }
        });
        isConfirmed = await checkTransactionStatus(transferResult);
        if(!isConfirmed){
            await findByIdAndUpdateTransaction(_id, {
                $set:{
                    "withdraw.transfer.status": "failed",
                    "withdraw.transfer.timeStamp": Date.now(),
                }
            });
            sendStatusMessageToClient(telegramID, `Not confirmed`);
            await sendErrorMessageToClient(telegramID, `Transaction is not confirmed`);
            return res.status(500).json({error: "Internal server error", message: "Transaction is not confirmed"});
        }
        await findByIdAndUpdateTransaction(_id, {
            $set:{
                "withdraw.transfer.status": "successful",
                "withdraw.transfer.timeStamp": Date.now(),
            }
        });

        user.balanceStableCoin -= outAmount ;
        await user.save();
        sendStatusMessageToClient(telegramID, `Withdrawed successfully`);
        sendSuccessMessageToClient(telegramID, `You withdrawed successfully`);
        return res.status(200).json(true);
    } catch (err){
        console.log(err);
        await sendErrorMessageToClient(user.telegramID, `Something went wrong.Please try again later`);
        await sendStatusMessageToClient(user.telegramID, `Failed to withdraw`);
        return res.status(400).json({error: err, message: "Bad request"})
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

module.exports = { userWithdraw,  getData};
