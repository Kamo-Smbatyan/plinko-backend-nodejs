const { LAMPORTS_PER_SOL } = require("@solana/web3.js");
const User = require("../models/schema/User");
const {tokenTransferToAdmin, tokenSwap} = require('./transactionController');
const { getDecimal, checkTransactionStatus } = require('../utils/helper');
const { SOL_MINT_ADDRESS, USDC_MINT_ADDRESS } = require('../config/constants');
const { sendMessageToClient, sendErrorToClient } = require("../socket/service");
const {newTransactionHistory,  findByIdAndUpdateTransaction} = require("../models/model/TransactionModel");

let tempTxData = '';

async function handleWebhook(req, res){
    const txData = req.body;
    if (txData.length > 0){
        if(JSON.stringify(txData[0]) === JSON.stringify(tempTxData)){
            console.log('Got same transaction: Ignored');
            return;
        }
        tempTxData = txData[0];
        await parseUserTx(txData[0]); 
    }
}

const parseUserTx = async (txData) => {
    try {
        if (!txData.type || txData.type !=='TRANSFER'){
            return;
        }

        if (txData.transactionError != null ){
            return;
        }

        if(txData.tokenTransfers.length > 0){
            const tokenTransfer = txData.tokenTransfers[0];
            const receiver = tokenTransfer.toUserAccount;
            
            const user = await User.findOne({ walletAddress: receiver });
            if (!user){
                return;
            }

            const txSignature = txData.signature;
            const tokenMint = tokenTransfer.mint;
            const amount = tokenTransfer.tokenAmount;
            const decimals = await getDecimal(tokenMint);
            let txHistoryData = {
                telegramID: user.telegramID,
                deposit: {
                    transaction: txSignature,
                    fromAddress: tokenTransfer.fromUserAccount,
                    mintAddress: tokenTransfer.tokenMint,
                    amount: amount,
                    status: "successful",
                },
                created_at: new Date().toISOString(),
            };
            
            const txHistory = await newTransactionHistory(txHistoryData);
            await txHistory.save();
            const _id = txHistory._id;
            
            await sendMessageToClient(user.telegramID, `You have been deposit the token ${tokenMint} with ${amount}`);

            const transferResult = await tokenTransferToAdmin(tokenMint, amount, user);
            
            if(!transferResult || !transferResult.transferSignature){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        forward:{
                            transaction: transferResult.transferSignature,
                            mintAddress: tokenMint,
                            amount: amount,
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                console.log('Transfer Failed');
                sendMessageToClient(user.telegramID, `You have been deposit the token ${tokenMint} with ${amount} but it didn't confirm.`);
                return;
            }
            
            if(transferResult.outAmount == null){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        forward:{
                            transaction: transferResult.transferSignature,
                            mintAddress: tokenMint,
                            amount: amount,
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                sendMessageToClient(user.telegramID, `You have been deposit the token ${tokenMint} with ${amount} but it doesnt have enough liquidity.`);

                return;
            }

            let isConfirmed = await checkTransactionStatus(transferResult.transferSignature);

            await sendMessageToClient(user.telegramID, `You have been deposit the token ${tokenMint} with ${amount} and it confirmed. It will swap with USDC soon.`);
            console.log('Token forward to admin successed', transferResult.transferSignature);
            
            if(isConfirmed){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        forward:{
                            transaction: transferResult.transferSignature,
                            mintAddress: tokenMint,
                            amount: amount,
                            status: 'successful',
                            timeStamp: new Date(),
                        },
                    },
                });
            }
            await sendMessageToClient(user.telegramID, `You have been deposit the token ${tokenMint} with ${amount} and it confirmed. It will swap with USDC soon.`);
            if (tokenMint == USDC_MINT_ADDRESS){
                return;
            }
            /////////////token swap//////////////
            const swapResult = await tokenSwap(tokenMint, amount * (10 ** decimals), user);
            if (!swapResult){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: transferResult.transferSignature,
                            amount: amount,
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                await sendMessageToClient(user.telegramID, `System is swapping your token to USDC`);
                console.log('Transfer successed, but swapping failed');
                return;
            }

            if (swapResult.isConfirmed){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: transferResult.transferSignature,
                            amountIn: amount,
                            amountOut:swapResult.outAmount / (10**6),
                            status: 'successful',
                            timeStamp: new Date(),
                        },
                    },
                });
                user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6) * 0.975;
                await user.save();

                console.log('Swapped successfully');
                await sendMessageToClient(user.telegramID, `All are succeed. Your balance added ${swapResult.outAmount}. You can play!`);
            } else{
                console.log('Swap transaction sent, but not confirmed');
            }        
        } else if (txData.nativeTransfers.length > 0){
            const nativeTransfer = txData.nativeTransfers[0];
            const receiver = nativeTransfer.toUserAccount;
            const amount = nativeTransfer.amount;
            
            const user = await User.findOne({ walletAddress: receiver });
                
            if (!user){
                return;
            }
            
            if (amount < 100000){
                await sendMessageToClient(user.telegramID, `Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
                return;
            }

            let txHistoryData = {
                telegramID: user.telegramID,
                deposit: {
                    transaction: txSignature,
                    fromAddress: tokenTransfer.fromUserAccount,
                    mintAddress: tokenTransfer.tokenMint,
                    amount: amount,
                    status: "successful",
                },
                created_at: new Date().toISOString(),
            };
            
            const txHistory = await newTransactionHistory(txHistoryData);
            await txHistory.save();
            const _id = txHistory._id;

            await sendMessageToClient(user.telegramID, `You have been deposit ${amount / LAMPORTS_PER_SOL} SOL`);

            const transferResult = await tokenTransferToAdmin(SOL_MINT_ADDRESS, amount, user);

            if(!transferResult.transferSignature){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        forward:{
                            transaction: transferResult.transferSignature,
                            amount: amount / LAMPORTS_PER_SOL,
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                console.log('Transfer Failed');
                sendErrorToClient(user.telegramID, `You have been deposited ${amount / LAMPORTS_PER_SOL}SOL but it didn't confirm.`);
            }

            if(transferResult.outAmount == null){
                await sendErrorToClient(user.telegramID, `Deposit confirmed but the amount is too small or something went wrong.`);
                return;
            }

            console.log('Transfer succeed', transferResult.transferSignature);

            const swapResult = await tokenSwap(SOL_MINT_ADDRESS, amount , user);

            if (swapResult.isConfirmed){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: transferResult.transferSignature,
                            amountIn: amount / LAMPORTS_PER_SOL,
                            amountOut: swapResult.outAmount / (10 ** 6),
                            status: 'successful',
                            timeStamp: new Date(),
                        },
                    },
                });
                user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6 * 0.975);
                await user.save();
                console.log('Swapped successfully');
                await sendMessageToClient(user.telegramID, `All are succeed. Your balance added ${swapResult.outAmount}. You can play!`);
            } else{
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: transferResult.transferSignature,
                            amountIn: amount / LAMPORTS_PER_SOL,
                            amountOut: 0,
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                await sendMessageToClient(user.telegramID, `You have beed deposited but swap transaction is not confirmed`);
                console.log('Swap transaction sent, but not confirmed');
            }
        }
    } catch (error){
        console.error(error);
        return;
    }
}

module.exports = { handleWebhook };
