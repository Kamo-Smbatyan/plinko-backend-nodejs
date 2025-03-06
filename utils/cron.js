const { USDC_MINT_ADDRESS } = require("../config/constants");
const { tokenTransferToAdmin, tokenSwap, transferToken } = require("../controllers/transactionController");
const { findByIdAndUpdateTransaction } = require("../models/model/TransactionModel");
const TransactionHistory = require("../models/schema/TransactionHistory");
const User = require("../models/schema/User");
const { checkTransactionStatus, getDecimal, checkLiquidity, adminWallet } = require("./helper");

const handleFailedTransaction = async() => {
    const failedTransactions = await TransactionHistory.find({$or:[
        { "deposit.status": "failed" },
        { "forward.status": "failed" },
        { "swap.status": "failed" },
        { "withdraw.swap.status": "failed" },
        { "withdraw.transfer.status": "failed" }
    ]});

    if (failedTransactions.length < 1){
        console.log("There is no failed transactions");
        return;
    }
    
    for (const failedTransaction of failedTransactions){
        const user = await User.findOne({telegramID: failedTransaction.telegramID});
        const userWalletAddress = user.walletAddress;
        const _id = failedTransaction._id;
        if (failedTransaction.forward.status == "failed"){
            let isConfirmed =await checkTransactionStatus(failedTransaction.forward.transaction);
            if(!isConfirmed) {
                const mintAddress = failedTransaction.deposit.mintAddress;
                const amount = failedTransaction.forward.amount;
                const tx = await tokenTransferToAdmin(mintAddress, amount, user);
                if(!tx){
                    console.log("Resending failed");
                }
                else{
                    isConfirmed = await checkTransactionStatus(tx.transferSignature);
                    if(isConfirmed){
                        await findByIdAndUpdateTransaction(_id, {
                            $set: {
                                "forward.timeStamp": Date.now(),
                                "forward.status": "successful",
                                "forward.transaction": tx.transferSignature,
                            }
                        });
                    }
                }
            }
        }
        if (failedTransaction.swap.status == "failed"){
            let isConfirmed =await checkTransactionStatus(failedTransaction.swap.transaction);
            if(!isConfirmed) {
                const inputMint = failedTransaction.deposit.mintAddress;
                const amount = failedTransaction.swap.amountIn;
                const decimals = await getDecimal(inputMint)
                const tx = await tokenSwap(inputMint, amount*(10**decimals), USDC_MINT_ADDRESS);
                if(!tx){
                    console.log("Reswap failed");
                }
                else{
                    if(tx.isConfirmed.confirmed){
                        await findByIdAndUpdateTransaction(_id, {
                            $set: {
                                "swap.timeStamp": Date.now(),
                                "swap.status": "successful",
                                "swap.transaction": tx.transferSignature,
                            }
                        });
                    }
                }
            }
        }
        if (failedTransaction.withdraw.swap.status == "failed"){
            let isConfirmed =await checkTransactionStatus(failedTransaction.withdraw.swap.transaction);
            if(!isConfirmed) {
                const toMint = failedTransaction.withdraw.swap.toMint;
                const isSwappable = await checkLiquidity(toMint);
                if (isSwappable) {
                    const amount = failedTransaction.withdraw.swap.amount;
                    const decimals = await getDecimal(toMint);
                    const tx = await tokenSwap(USDC_MINT_ADDRESS, amount*(10**6), toMint);
                    if(!tx){
                        console.log("Reswap failed");
                    }
                    else{
                        if(tx.isConfirmed.confirmed){
                            await findByIdAndUpdateTransaction(_id, {
                                $set: {
                                    "withdraw.swap.timeStamp": Date.now(),
                                    "withdraw.swap.status": "successful",
                                    "withdraw.swap.transaction": tx.transferSignature,
                                }
                            });
                        }
                    }
                }
            }
        }
        if (failedTransaction.withdraw.transfer.status == "failed"){
            let isConfirmed =await checkTransactionStatus(failedTransaction.withdraw.transfer.transaction);
            if(!isConfirmed) {
                const tokenMint = failedTransaction.withdraw.transfer.tokenMint;
                const amount = failedTransaction.withdraw.transfer.amount;
                const decimals = await getDecimal(tokenMint);
                const toAddress = failedTransaction.withdraw.transfer.toAddress;
                const tx = await transferToken(adminWallet, toAddress, amount * (10**decimals), tokenMint)
                isConfirmed = await checkTransactionStatus(tx);
                if(!isConfirmed){
                    console.log("Resend failed");
                }
                else{
                    await findByIdAndUpdateTransaction(_id, {
                        $set: {
                            "withdraw.transfer.timeStamp": Date.now(),
                            "withdraw.transfer.status": "successful",
                            "withdraw.transfer.transaction": tx,
                        }
                    });
                }            
            }
        }
    }
}

module.exports = {handleFailedTransaction};