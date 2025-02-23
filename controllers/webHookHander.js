const { LAMPORTS_PER_SOL, Keypair } = require("@solana/web3.js");
const axios = require('axios');
const User = require("../models/User");
const {swapMintToStable, transferUSDC} = require('./transactionController');
const {adminWallet, connection} = require('../utils/helper');
const bs58 = require('bs58');
const dotenv = require('dotenv');

dotenv.config();
const SOL_MINT_ADDRESS='So11111111111111111111111111111111111111112';
const USDC_MINT = process.env.USDC_MINT;


const  HELIUS_API_KEY = process.env.HELIUS_API_KEY;


async function handleWebhook(req, res){
    const txData = req.body;
    console.log('Received transaction:', JSON.stringify(txData, null, 2));
    if (txData.length > 0){
        await parseTransferTx(txData); 
    }
    res.status(200).send('Webhook received successfully');
}

async function getDecimal(mint) {
    try {
        const response = await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            jsonrpc: "2.0",
            id: "test",
            method: "getAsset",
            params: {
                id: mint
            }
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });
        
        const decimals = response.data?.result?.token_info?.decimals;
        console.log("Decimals:", decimals);
        return decimals;
    } catch (error) {
        console.error("Error fetching decimals:");
    }
}


const parseTransferTx = async (txDatas) => {
    for(const txData of txDatas){
        if (!txData.type || txData.type !=='TRANSFER'){
            continue;
        }
        let receiver = null;
        let amount = 0;
        let tokenMint = null;

        if(txData.tokenTransfers.length > 0){
            if (txData.transactionError != null ){
                return;
            }
            for (const tokenTransfer of txData.tokenTransfers){
                receiver = tokenTransfer.toUserAccount;
                console.log('Receiver:', receiver);
                const user = await User.findOne({walletAddress: receiver});
                if (!user){
                    return;
                }

                const userWallet = Keypair.fromSecretKey(bs58.decode(user.secretKey));

                tokenMint = tokenTransfer.mint;
                const decimal = parseInt(await getDecimal(tokenMint));
                amount = parseFloat(tokenTransfer.tokenAmount) * (10 ** (decimal == 1 ? decimal-1: decimal));
                
                console.log('Token Amount to know the token Decimal', amount);

                if (tokenMint == USDC_MINT){   
                    const transferResult = await transferUSDC(userWallet, adminWallet.publicKey.toBase58(), Math.floor(amount));
                    
                    if (!transferResult){
                        console.log('Transfer failed');
                        continue;
                    }
                    
                    user.balanceStableCoin += parseFloat((amount-1) * 0.975);
                    await user.save();
                    console.log('User deposit with USDC');
                    continue ;
                }

                const swapResult = await swapMintToStable(tokenMint, receiver, amount);
                
                if(!swapResult){
                    console.log('Swap failed');
                    continue;
                }

                const swapedAmount = swapResult.outAmount/(10**6);

                user.balanceStableCoin += (swapedAmount *0.975 -1);

                await user.save();
                console.log('Deposit Completed', swapResult.tx_id);
            }
            
        } else if (txData.nativeTransfers.length > 0){
            for (const nativeTransfer of txData.nativeTransfers){

                receiver = nativeTransfer.toUserAccount;
                amount = nativeTransfer.amount;
                if (amount<50000){
                    continue;
                }
                const user = await User.findOne({walletAddress: receiver});
                
                if (!user){
                    console.log('User not found');
                    return;
                }
        
                const swapResult = await swapMintToStable(SOL_MINT_ADDRESS, receiver, amount);
        
                if(!swapResult){
                    console.log( 'SWAP FAILED');
                    return
                }

                swapAmount = swapResult.outAmount/(10**6);
                user.balanceStableCoin += parseFloat((swapAmount - 1) * 0.975);
                await user.save();
                console.log('Deposit SOL completed', swapResult.tx_id);
            }
        }
    }
    // return {sender, receiver, fee, amount, tokenMint};
}

module.exports = {handleWebhook}