const { LAMPORTS_PER_SOL } = require("@solana/web3.js");
const User = require("../models/schema/User");
const {tokenTransferToAdmin, tokenSwap} = require('./transactionController');
const { getDecimal, checkTransactionStatus, checkLiquidity } = require('../utils/helper');
const { SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, TRANSACTION_FEE } = require('../config/constants');
const { sendSuccessMessageToClient, sendErrorMessageToClient, sendStatusMessageToClient } = require("../socket/service");
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
            const checkLp = await checkLiquidity(tokenMint);
            if(!checkLp){
                sendStatusMessageToClient(user.telegramID, `Liquidity is lower than 10k. Please try again with other token`)
                return;
            }

            let txHistoryData = {
                telegramID: user.telegramID,
                deposit: {
                    transaction: txSignature,
                    fromAddress: tokenTransfer.fromUserAccount,
                    mintAddress: tokenMint,
                    amount: amount,
                    status: "successful",
                    timeStamp: new Date().toISOString(),
                },
                created_at: new Date().toISOString(),
            };
            
            const txHistory = await newTransactionHistory(txHistoryData);
            await txHistory.save();
            const _id = txHistory._id;
            
            await sendStatusMessageToClient(user.telegramID, `Deposit detected. processing...`);

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
                //sendErrorMessageToClient(user.telegramID, `Failed to updating balance. Check later!`);
                sendStatusMessageToClient(user.telegramID, 'Fowarding assets failed.')
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
                sendErrorMessageToClient(user.telegramID, `Your token is not swappable. Try with other tokens.`);
                sendSuccessMessageToClient(user.telegramID, `Not swappable token: ${tokenMint}`);
                return;
            }

            sendSuccessMessageToClient(user.telegramID, `Confirming transaction.`);
            let isConfirmed = await checkTransactionStatus(transferResult.transferSignature);

            sendStatusMessageToClient(user.telegramID, `Confirming transaction..`);
            
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
                sendStatusMessageToClient(user.telegramID, `Failed to confirm trnasaction`);
            }

            sendStatusMessageToClient(user.telegramID, `We are swapping tokens to USDC`);

            if (tokenMint == USDC_MINT_ADDRESS){
                user.balanceStableCoin += amount * TRANSACTION_FEE_RATE;
                await user.save();
                sendStatusMessageToClient(user.telegramID, `Confirmed successfully. Your balance is increased `);
                await sendSuccessMessageToClient(user.telegramID, `All are succeed. ${amount * TRANSACTION_FEE} added to your balance . You can play!`);
                return;
            }
            /////////////token swap//////////////
            const swapResult = await tokenSwap(tokenMint, amount * (10 ** decimals), USDC_MINT_ADDRESS);
            if (!swapResult){
                sendErrorMessageToClient(user.telegramID, `Swapping failed.`)
                console.log('Transfer successed, but swapping failed');
                return;
            }
            sendStatusMessageToClient(user.telegramID, `Confirming swap transaction `);
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
                user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6) * TRANSACTION_FEE;
                await user.save();
                sendStatusMessageToClient(user.telegramID, `Confirmed successfully. Your balance is increased`);
                console.log('Swapped successfully');
                await sendSuccessMessageToClient(user.telegramID, `All are succeed. ${swapResult.outAmount} added to your balance . You can play!`);
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
                await sendErrorMessageToClient(user.telegramID, `Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
                sendStatusMessageToClient(user.telegramID, `Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
                return;
            }

            let txHistoryData = {
                telegramID: user.telegramID,
                deposit: {
                    transaction: txSignature,
                    fromAddress: tokenTransfer.fromUserAccount,
                    mintAddress: SOL_MINT_ADDRESS,
                    amount: amount,
                    status: "successful",
                    timeStamp: new Date().toISOString(),
                },
                created_at: new Date().toISOString(),
            };
            
            const txHistory = await newTransactionHistory(txHistoryData);
            await txHistory.save();
            const _id = txHistory._id;

            await sendSuccessMessageToClient(user.telegramID, `${amount / LAMPORTS_PER_SOL} SOL deposit is detected`);
            sendStatusMessageToClient(user.telegramID, `${amount / LAMPORTS_PER_SOL} SOL deposit. Processing...`);

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
                sendErrorMessageToClient(user.telegramID, `Forwading is not confirmed. `);
                sendStatusMessageToClient(user.telegramID, `Forwading failed.`);
            }

            if(transferResult.outAmount == null){
                await sendErrorMessageToClient(user.telegramID, `Deposit confirmed but the amount is too small or something went wrong.`);
                return;
            }

            console.log('Transfer succeed', transferResult.transferSignature);

            const swapResult = await tokenSwap(SOL_MINT_ADDRESS, amount , USDC_MINT_ADDRESS);
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    swap:{
                        transaction: swapResult.tx_id,
                        amountIn: amount / LAMPORTS_PER_SOL,
                        amountOut: swapResult.outAmount / (10 ** 6),
                        status: 'pending',
                        timeStamp: new Date(),
                    },
                },
            });

            if (swapResult.isConfirmed){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: swapResult.tx_id,
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
                await sendSuccessMessageToClient(user.telegramID, `All are succeed. Your balance added ${swapResult.outAmount}. You can play!`);
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
                await sendSuccessMessageToClient(user.telegramID, `You have beed deposited but swap transaction is not confirmed`);
                console.log('Swap transaction sent, but not confirmed');
            }
        }
    } catch (error){
        console.log(error);

    }
}

module.exports = { handleWebhook };
