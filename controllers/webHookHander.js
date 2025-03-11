const { LAMPORTS_PER_SOL, Keypair } = require("@solana/web3.js");
const bs58 = require('bs58');
const { getDecimal, checkTransactionStatus, checkLiquidity, tokenTransfer, adminWallet, tokenSwap, solTransfer } = require('../utils/helper');
const { SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, TRANSACTION_FEE } = require('../config/constants');
const { sendSuccessMessageToClient, sendErrorMessageToClient, sendStatusMessageToClient } = require("../socket/service");
const {newTransactionHistory,  findByIdAndUpdateTransaction} = require("../models/model/TransactionModel");
const TransactionHistory = require('../models/schema/TransactionHistory');
const { getUser } = require("../models/model/UserModel");

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
            const tokenTransferData = txData.tokenTransfers[0];
            const receiver = tokenTransferData.toUserAccount;
            
            const userData = await getUser(receiver);
            if (!userData.success){
                return;
            }

            const user = userData.data;
            const txSignature = txData.signature;
            const tokenMint = tokenTransferData.mint;
            const amount = tokenTransferData.tokenAmount;
            const decimals = await getDecimal(tokenMint);
            const checkLp = await checkLiquidity(tokenMint);
            const existingTransaction = await TransactionHistory.findOne({
                "deposit.transaction": txSignature,
            });
            
            if(!(!existingTransaction)){
                console.log("Ignored");
                return;
            }

            let txHistoryData = {
                telegramID: user.telegramID,
                deposit: {
                    transaction: txSignature,
                    fromAddress: tokenTransferData.fromUserAccount,
                    mintAddress: tokenMint,
                    amount: amount,
                    status: "pending",
                    timeStamp: new Date().toISOString(),
                },
                created_at: new Date().toISOString(),
            };
            
            const txHistory = await newTransactionHistory(txHistoryData);
            await txHistory.save();
            const _id = txHistory._id;

            await sendStatusMessageToClient(user.telegramID, `Deposit detected. processing...`);

            if(!checkLp){
                await findByIdAndUpdateTransaction(_id, {
                    $set:{
                        "deposit.status": "failed",
                        "deposit.timeStamp": Date.now(),
                    }
                });
                sendStatusMessageToClient(user.telegramID, `Liquidity is lower than 10k. Please try again with other token`)
                return;
            };

            await findByIdAndUpdateTransaction(_id, {
                $set:{
                    "deposit.status": "successful",
                    "deposit.timeStamp": Date.now(),
                }
            });
            const userWallet = Keypair.fromSecretKey(bs58.decode(user.secretKey));
            const transferResult = await tokenTransfer(userWallet,receiver, tokenMint, amount*(10 ** decimals), [adminWallet, userWallet]);
            
            if(!transferResult){
                sendErrorMessageToClient(user.telegramID, `Failed to forward assets. It would be done in 10 mins`);
                return;
            }

            sendSuccessMessageToClient(user.telegramID, `Confirming transaction.`);    
            if(!(await checkTransactionStatus(transferResult))){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        forward:{
                            transaction: transferResult,
                            mintAddress: tokenMint,
                            amount: amount,
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                console.log('Transfer Failed');
                sendStatusMessageToClient(user.telegramID, `Failed to confirm trnasaction`);
                return;
            }

            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    forward:{
                        transaction: transferResult,
                        mintAddress: tokenMint,
                        amount: amount,
                        status: 'successful',
                        timeStamp: new Date(),
                    },
                },
            });
            
            sendStatusMessageToClient(user.telegramID, `We are swapping tokens to USDC`);

            if (tokenMint == USDC_MINT_ADDRESS){
                user.balanceStableCoin += amount * TRANSACTION_FEE;
                await user.save();
                sendStatusMessageToClient(user.telegramID, `Confirmed successfully. Your balance is increased `);
                await sendSuccessMessageToClient(user.telegramID, `All are succeed. ${amount * TRANSACTION_FEE} added to your balance . You can play!`);
                return;
            }

            /////////////token swap//////////////
            const swapResult = await tokenSwap(userWallet.publicKey.toBase58(), tokenMint, USDC_MINT_ADDRESS, amount * (10 ** decimals), 30, [adminWallet]);
            if (!swapResult.isSent){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: swapResult.swapTxHash,
                            amountIn: amount,
                            amountOut:swapResult.outAmount / (10**6),
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                sendErrorMessageToClient(user.telegramID, `Swapping failed. We will try again in 10 mins`);
                return;
            }

            sendStatusMessageToClient(user.telegramID, `Confirming swap transaction `);
            const isConfirmed = await checkTransactionStatus(swapResult.swapTxHash);
            if (!isConfirmed) {
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: swapResult.swapTxHash,
                            amountIn: amount,
                            amountOut:swapResult.outAmount / (10**6),
                            status: 'failed',
                            timeStamp: new Date(),
                        },
                    },
                });
                sendStatusMessageToClient(user.telegramID, `Swap not confirmed`);
                sendErrorMessageToClient(user.telegramID, `Swap transaction is not confirmed. We will try in 10 mins`);
                return;
            }
            
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    swap:{
                        transaction: swapResult.swapTxHash,
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
            await sendSuccessMessageToClient(user.telegramID, `All are succeed. ${user.balanceMemeCoin.toFixed(2)} added to your balance . You can play!`);      
        } else if (txData.nativeTransfers.length > 0){
            const nativeTransfer = txData.nativeTransfers[0];
            const receiver = nativeTransfer.toUserAccount;
            const amount = nativeTransfer.amount;
            const txSignature = txData.signature;

            const userData = await getUser(receiver);
            
            if (!userData.success){
                return;
            }
            const user = userData.data;
            const userWallet = Keypair.fromSecretKey(bs58.decode(user.secretKey));
            if (amount < 100000){
                await sendErrorMessageToClient(user.telegramID, `Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
                sendStatusMessageToClient(user.telegramID, `Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
                return;
            }

            let txHistoryData = {
                telegramID: user.telegramID,
                deposit: {
                    transaction: txSignature,
                    fromAddress: nativeTransfer.fromUserAccount,
                    mintAddress: SOL_MINT_ADDRESS,
                    amount: amount/(10**LAMPORTS_PER_SOL),
                    status: "successful",
                    timeStamp: new Date().toISOString(),
                },
                created_at: new Date().toISOString(),
            };
            
            const txHistory = await newTransactionHistory(txHistoryData);
            await txHistory.save();
            const _id = txHistory._id;

            // sendSuccessMessageToClient(user.telegramID, `${amount / LAMPORTS_PER_SOL} SOL deposit is detected`);
            sendStatusMessageToClient(user.telegramID, `${amount / LAMPORTS_PER_SOL} SOL deposit. Processing...`);

            const transferResult = await solTransfer(userWallet, receiver, amount, [adminWallet, userWallet]);

            if(!transferResult){
                console.log('Transfer Failed');
                sendErrorMessageToClient(user.telegramID, `Forwading is not completed. `);
                sendStatusMessageToClient(user.telegramID, `Forwading failed.`);
                return;
            }

            console.log('Transfer succeed', transferResult);
            sendStatusMessageToClient(user.telegramID, `Swapping...`);
            const swapResult = await tokenSwap(adminWallet.publicKey.toBase58(), SOL_MINT_ADDRESS, USDC_MINT_ADDRESS, amount, 30, [adminWallet]);
            if(!swapResult.isSent){
                await sendErrorMessageToClient(user.telegramID, `Failed to swap token, We will try again in 10 mins`);
                sendStatusMessageToClient(user.telegramID, `Failed to swap`);
                return
            }
            await findByIdAndUpdateTransaction(_id, {
                $set: {
                    swap:{
                        transaction: swapResult.swapTxHash,
                        amountIn: amount / LAMPORTS_PER_SOL,
                        amountOut: swapResult.outAmount / (10 ** 6),
                        status: 'pending',
                        timeStamp: new Date(),
                    },
                },
            });

            sendStatusMessageToClient(user.telegramID, `Confirming swap transaction`);
            const isConfirmed = await checkTransactionStatus(swapResult.swapTxHash);
            if (isConfirmed){
                await findByIdAndUpdateTransaction(_id, {
                    $set: {
                        swap:{
                            transaction: swapResult.swapTxHash,
                            amountIn: amount / LAMPORTS_PER_SOL,
                            amountOut: swapResult.outAmount / (10 ** 6),
                            status: 'successful',
                            timeStamp: new Date(),
                        },
                    },
                });
                user.balanceStableCoin += (swapResult.outAmount) / (10 ** 6 )* TRANSACTION_FEE;
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
                return;
            }
        }
    } catch (error){
        console.log(error);
    }
}

module.exports = { handleWebhook };
