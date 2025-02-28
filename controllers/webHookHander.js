const { LAMPORTS_PER_SOL, Keypair } = require("@solana/web3.js");
const User = require("../models/User");
const TransactionHistory = require('../models/TransactionHistory');
const {tokenTransferToAdmin, tokenSwap} = require('./transactionController');
const {sendMessageToClient} = require('../socket/socketHandler');
const {adminWallet, getDecimal} = require('../utils/helper');
const dotenv = require('dotenv');
const { NATIVE_MINT } = require("@solana/spl-token");
const {TX_STATE, TX_TYPE} = require('../config/constants');

let tempTxData = '';

dotenv.config();
const SOL_MINT_ADDRESS='So11111111111111111111111111111111111111112';
const USDC_MINT = process.env.USDC_MINT;

async function handleWebhook(req, res){
    const txData = req.body;
    if (txData.length > 0){
        if(txData[0] == tempTxData){
            console.log('Got same transaction: Ignored');
            return;
        }
        tempTxData = txData[0];
        await parseUserTx(txData[0]); 
    }
}

async function handleAdminWebhook(req, res){
    const txData = req.body;
    // console.log('Admin wallet transaction detected by webhook', txData);
    // if (txData.length > 0){
    //     await parseAdminTx(txData[0]);
    // }
}

const parseUserTx = async (txData) => {
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

        const tokenMint = tokenTransfer.mint;
        const amount = tokenTransfer.tokenAmount;
        const decimals = await getDecimal(tokenMint);

        await sendMessageToClient(user.telegramID, 'Deposit', 'hook', amount, tokenMint);
        
        const transferResult = await tokenTransferToAdmin(tokenMint, amount, user);// token transfer

        console.log('TRANSFER TRANSACTION RESULT', transferResult);

        if(!transferResult || !transferResult.transferSignature){
            console.log('Transfer Failed');
            sendMessageToClient(user.telegramID, 'Deposit', 'failed', amount, tokenMint);
            return;
        }        

        const transactionHistory = new TransactionHistory({
            telegramID: user.telegramID,
            signature: transferResult.transferSignature.toString(),
            tx_type : TX_TYPE.DEPOSIT,
            tx_state: TX_STATE.SENT,
            inAmount: amount,
            mintAddress: tokenMint,
            outAmount: transferResult.outAmount,
            created_at: Date.now(),
            updated_at: Date.now()
        });

        await transactionHistory.save();
        if(transferResult.outAmount == null){
            sendMessageToClient(user.telegramID, 'Deposit', 'failed', amount, tokenMint);
            console.log('Deposit made, but not swappable token');
            return;
        }

        user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6);
        await user.save();

        await sendMessageToClient(user.telegramID, 'Deposit', 'sent', amount, tokenMint);

        console.log('Transfer successed', transferResult.transferSignature);

        const swapResult = await tokenSwap(tokenMint, amount * (10**decimals), user);

        if (!swapResult){
            console.log('Transfer successed, but swapping failed');
            return;
        }
        if(!swapResult.transactionHistory){
            console.log("Transfer successfull, but swapping " , swapResult.transactionStatus , "!");
            return;
        }
        if (swapResult.isConfirmed){
            transactionHistory.tx_state = TX_STATE.CONFIRMED;
        }
        else {
            transactionHistory.tx_state = TX_STATE.FAILED;
        }
        transactionHistory.updated_at = Date.now();
        await transactionHistory.save();
        sendMessageToClient(user.telegramID, 'Deposit', 'updated', amount, tokenMint);
        return;
    } else if (txData.nativeTransfers.length > 0){
        const nativeTransfer = txData.nativeTransfers[0];
        const receiver = nativeTransfer.toUserAccount;
        const amount = nativeTransfer.amount;
        
        const user = await User.findOne({walletAddress: receiver});
            
        if (!user){
            console.log('User not found');
            return;
        }
        
        if (amount < 50000){
            console.log(`Deposit amount is too small: ${amount}`);
            return;
        }

        await sendMessageToClient(user.telegramID, 'Deposit', 'hook', amount, 'SOL');
    
        const transferResult = await tokenTransferToAdmin(SOL_MINT_ADDRESS, amount, user);
    
        if(!transferResult){
            console.log('Transfer Failed');
            await sendMessageToClient(user.telegramID, 'Deposit', 'failed', amount, tokenMint);
            return;
        }

        if (!transferResult.transactionDatabase){
            await sendMessageToClient(user.telegramID, 'Deposit', 'failed', amount, tokenMint);
            console.log('Database Error');
            return;
        }

        const transactionHistory = new TransactionHistory({
            telegramID: user.telegramID,
            signature: transferResult.transferSignature.toString(),
            tx_type : TX_TYPE.DEPOSIT,
            tx_state: TX_STATE.SENT,
            inAmount: amount,
            mintAddress: tokenMint,
            outAmount: transferResult.outAmount,
            created_at: Date.now(),
            updated_at: Date.now()
        });

        await transactionHistory.save();

        user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6);
        await user.save();

        if(transferResult.outAmount == null){
            await sendMessageToClient(user.telegramID, 'Deposit', 'failed', amount, tokenMint);
            console.log('Amount is zero, Transfer Failed');
            return;
        }

        user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6);
        await user.save();
        transactionHistory.updated_at = Date.now();
        transactionHistory.tx_state = TX_STATE.CONFIRMED;
        await transactionHistory.save();

        sendMessageToClient(user.telegramID, 'Deposit', 'sent', amount, tokenMint);
        console.log('Transfer successed', transferResult.transferSignature);
        const swapResult = await tokenSwap(NATIVE_MINT, amount , user); ///send swap transaction
        const swapTransactionHis = swapResult.transactionHistory;
        if (!swapTransactionHis){
            console.log("Swap failed");
            return;
        }
        if (swapResult.isConfirmed){
            swapTransactionHis.tx_state = TX_STATE.CONFIRMED;
            swapTransactionHis.updated_at = Date.now();
            await swapTransactionHis.save()
            console.log('Swapped successfully');
            sendMessageToClient(user.telegramID, 'Deposit', 'updated', amount, tokenMint);
        }
        else{
            swapTransactionHis.tx_state = TX_STATE.SENT;
            swapTransactionHis.updated_at = Date.now();
            await swapTransactionHis.save();
            console.log('Swap transaction sent, but not confirmed');
        }
    }
}

const parseAdminTx = async (txData) => {
    if (!txData.type || txData.type !=='TRANSFER'){
        return;
    }

    if (txData.transactionError != null ){
        console.log("Transaction errors")
        return;
    }

    if(txData.tokenTransfers.length > 0){
        const tokenTransfer = txData.tokenTransfers[0];
        const receiver = tokenTransfer.fromUserAccount;
        
        const user = await User.findOne({walletAddress: receiver});
        
        if(!user){
            return;
        }
        if(tokenTransfer.toUserAccount != adminWallet.publicKey.toBase58()){
            return;
        }

        console.log(`Swapping ${amount} of ${tokenMint} ...`);

        const tokenMint = tokenTransfer.mint;
        const amount = tokenTransfer.tokenAmount;

        const decimals = await getDecimal(tokenMint);
        console.log(`Swapping ${amount} of ${tokenMint} ...`);
        const swapResult = await tokenSwap(tokenMint, amount * decimals, user);

        if(!swapResult){
            console.log('Swap failed');
            return;
        }
        
        const swapedAmount = swapResult.outAmount / (10**6) * 0.975 - 1;

        if(swapedAmount <= 0) {
            console.log('Invalid amount');
            return;
        }

        user.balanceStableCoin += swapedAmount;
        await user.save();

        console.log('Deposit Completed', swapResult.tx_id);
    } else if (txData.nativeTransfers.length > 0){
        const nativeTransfer = txData.nativeTransfers[0];
        const receiver = nativeTransfer.toUserAccount;
        const amount = nativeTransfer.amount;
        
        if (amount < 100000){
            console.log(`Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
            return;
        }

        const user = await User.findOne({walletAddress: receiver});
            
        if (!user){
            console.log('User not found');
            return;
        }
    
        const swapResult = await tokenSwap(SOL_MINT_ADDRESS, amount, user);
        
        if(!swapResult){
            console.log( 'SWAP FAILED');
            return
        }

        const swapedAmount = swapResult.outAmount / LAMPORTS_PER_SOL * 0.975 - 1;
        let transactionHistory = swapResult.transactionHistory;

        if (!transactionHistory){
            console.log(`${swapResult.transactionStatus}`, 'Database processing failed');
        }
        if(swapedAmount <= 0) {
            console.log('Invalid amount');
            transactionDatabase.updated_at = Date.now();
            transactionDatabase.tx_state = TX_STATE.FAILED;
            return;
        }

        transactionDatabase.updated_at = Date.now();
        transactionDatabase.tx_state = TX_STATE.CONFIRMED;

        user.balanceStableCoin += swapedAmount;
        await user.save();
        console.log(`Deposit ${swapResult.transactionStatus}`, swapResult.tx_id);
    }
}

module.exports = { handleWebhook, handleAdminWebhook };
