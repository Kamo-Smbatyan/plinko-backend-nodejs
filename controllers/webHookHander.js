const { LAMPORTS_PER_SOL, Keypair } = require("@solana/web3.js");
const User = require("../models/User");
const TransactionHistory = require('../models/TransactionHistory');
const {tokenTransferToAdmin, tokenSwap} = require('./transactionController');
const {adminWallet, getDecimal, sendSignalToFrontend} = require('../utils/helper');
const bs58 = require('bs58');
const dotenv = require('dotenv');
const {clients} = require('../config/constants');


dotenv.config();
const SOL_MINT_ADDRESS='So11111111111111111111111111111111111111112';
const USDC_MINT = process.env.USDC_MINT;

async function handleWebhook(req, res){
    const txData = req.body;
    console.log('Admin Transaction Received by Webhook:');
    if (txData.length > 0){
        await parseUserTx(txData[0]); 
    }
}

async function handleAdminWebhook(req, res){
    const txData = req.body;
    console.log('Admin wallet transaction detected by webhook');
    if (txData.length > 0){
        await parseAdminTx(txData[0]);
    }
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

        await sendSignalToFrontend(user.telegramID, 'hook');
        const tokenMint = tokenTransfer.mint;
        const amount = tokenTransfer.tokenAmount;

        const transferResult = await tokenTransferToAdmin(tokenMint, amount, user);

        console.log('TRANSFER SWAP RESULT', transferResult);

        if(!transferResult){
            console.log('Transfer Failed');
              await sendSignalToFrontend(user.telegramID, 'transfer_failed');
            return;
        }

        TransactionHistory.insertOne({
            telegramID: user.telegramID,
            signature: transferResult.transferSignature,
            tx_type : 1,
            tx_state: 1,
            inAmount: amount,
            mintAddress: tokenMint,
            tx_type:  1, 
            tx_state: 1,
            outAmount: transferResult.outAmount,
            created_at: Date.now().toLocaleString(),
            updated_at: Date.now().toLocaleString()
        });

        if(transferResult.outAmount == null){
            sendSignalToFrontend(user.telegramID, 'transfer_failed_amount_zero');
            console.log('Amount is zero, Transfer Failed');
        }

        user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6);
        await user.save();

        await sendSignalToFrontend( user.telegramID, `transfer_confirmed_${user.balanceStableCoin}`);

        console.log('Transfer successed', transferResult.transferSignature);

    } else if (txData.nativeTransfers.length > 0){
        const nativeTransfer = txData.nativeTransfers[0];
        const receiver = nativeTransfer.toUserAccount;
        const amount = nativeTransfer.amount;

        if (amount < 50000){
            console.log(`Deposit amount is too small: ${amount / LAMPORTS_PER_SOL}`);
            return;
        }

        const user = await User.findOne({walletAddress: receiver});
            
        if (!user){
            console.log('User not found');
            return;
        }
           
        await sendSignalToFrontend(user.telegramID, 'hook');
    
        const transferResult = await tokenTransferToAdmin(SOL_MINT_ADDRESS, amount, user);
    
        if(!transferResult){
            console.log('Transfer Failed');
            sendSignalToFrontend('transfer_failed');
            return;
        }
        let transactionDatabase;

        if (!transferResult.transactionDatabase){
            sendSignalToFrontend(user.telegramID, 'transfer_failed_database_error');
            console.log('Database Error');
            return;
        }

        const transactionHistory = TransactionHistory.insertOne({
            telegramID: user.telegramID,
            signature: transferResult.transferSignature,
            tx_type : 1,
            tx_state: 1,
            inAmount: amount,
            mintAddress: tokenMint,
            tx_type:  1, 
            tx_state: 1,
            outAmount: transferResult.outAmount,
            created_at: Date.now().toLocaleString(),
            updated_at: Date.now().toLocaleString()
        });

        user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6);
        await user.save();

        if(transferResult.outAmount == null){
            sendSignalToFrontend(user.telegramID, 'transfer_failed_amount_zero');
            console.log('Amount is zero, Transfer Failed');
            return;
        }

        user.balanceStableCoin += (transferResult.outAmount) / (10 ** 6);
        await user.save();
        transactionHistory.updated_at = Date.now().toLocaleString();
        transactionHistory.tx_state = 3;
        await transactionHistory.save();

        sendSignalToFrontend(`user.telegramID,  transfer_confirmed_${user.balanceStableCoin}`);
        console.log('Transfer successed', transferResult.transferSignature);
    }
    // return {sender, receiver, fee, amount, tokenMint};
}

const parseAdminTx = async (txData) => {
    if (!txData.type || txData.type !=='TRANSFER'){
        return;
    }

    if (txData.transactionError != null ){
        return;
    }

    if(txData.tokenTransfers.length > 0){
        const tokenTransfer = txData.tokenTransfers[0];
        const senderWalletAddress = tokenTransfer.fromUserAccount;
        const user = await User.findOne({walletAddress: senderWalletAddress});
        
        if(!user){
            return;
        }
        if(!tokenTransfer.toUserAccount || tokenTransfer.toUserAccount != adminWallet.publicKey.toBase58()){
            return;
        }

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
        
        if (amount < 50000){
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
            transactionDatabase.updated_at = Date.now().toLocaleString();
            transactionDatabase.tx_state = 3;
            return;
        }

        transactionDatabase.updated_at = Date.now().toLocaleString();
        transactionDatabase.tx_state = 3;

        user.balanceStableCoin += swapedAmount;
        await user.save();
        console.log(`Deposit ${swapResult.transactionStatus}`, swapResult.tx_id);
    }
}

module.exports = { handleWebhook, handleAdminWebhook };
