const { Transaction, Keypair, PublicKey,  LAMPORTS_PER_SOL, SystemProgram, VersionedTransaction} = require('@solana/web3.js');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createNativeMint, } = require('@solana/spl-token');
const User = require('../models/User');
const dotenv = require('dotenv');
const bs58 = require('bs58');
const axios = require('axios');
const {createTransferInstruction} = require('@solana/spl-token');
const { adminWallet, connection, deserializeTransaction, resolveAddressLookups, createTransactionInstructions, createVersionedTransaction, checkTokenAccountExistence, getTokenBalance, sendBundleRequest, checkTransactionStatus } = require('../utils/helper');
const { VersionedMessage } = require('solana-web3.js');

dotenv.config();

const SOL_MINT_ADDRESS='So11111111111111111111111111111111111111112';
const USDC_MINT=process.env.USDC_MINT;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

const swapMintToStable = async (mint, walletAddress, amount) => {
    let signature;
    let outAmount
    try {
        await delay(7000);
        console.log("Swap Wallet Address",walletAddress);
        const user = await User.findOne({walletAddress});
        
        if(!user){
            throw new Error('Error fetching user data');
        }

        const secretKey = user.secretKey;
        const userWallet = Keypair.fromSecretKey(bs58.decode(secretKey));
        const instructions = [];
        let tokenBalance, latestBlockhash;

        if(mint == SOL_MINT_ADDRESS){

            [tokenBalance, latestBlockhash] = await Promise.all([
                connection.getBalance(userWallet.publicKey),
                connection.getLatestBlockhash()
            ]);
            if (tokenBalance == 0){
                throw new Error('Balance is zero');
            }

            console.log('Token Sol Balance',tokenBalance, userWallet.publicKey);
            instructions.push(
                SystemProgram.transfer({
                    fromPubkey: userWallet.publicKey,
                    toPubkey:adminWallet.publicKey,
                    lamports: amount
                })
            );
        }

        else{
            const [ associatedTokenAccountForAdmin, associatedTokenAccountForUser ] = await Promise.all([
                getAssociatedTokenAddressSync(new PublicKey(mint), adminWallet.publicKey),
                getAssociatedTokenAddressSync(new PublicKey(mint), userWallet.publicKey),
            ]);
            
            const checkATAExists = await checkTokenAccountExistence(associatedTokenAccountForAdmin);
            if(!(checkATAExists)) {
                instructions.push(createAssociatedTokenAccountInstruction(adminWallet.publicKey, associatedTokenAccountForAdmin, adminWallet.publicKey, new PublicKey(mint)));
            }

            [ tokenBalance, latestBlockhash ] = await Promise.all([
                getTokenBalance(associatedTokenAccountForUser),
                connection.getLatestBlockhash()
            ]);

            instructions.push(createTransferInstruction(associatedTokenAccountForUser, associatedTokenAccountForAdmin, userWallet.publicKey, amount));
        }
        const versionedTransaction = await createVersionedTransaction([adminWallet, userWallet], instructions, latestBlockhash);

        let success = false;

        while(!success) {
            signature = await connection.sendRawTransaction(versionedTransaction.serialize(), [adminWallet, userWallet]);

            // console.log("Transaction sent with signature:", signature);
            console.log('Confirming...');
            
            const confirmationStatus = await connection.getSignatureStatus(signature, {searchTransactionHistory: true});
            
            const signatureStatus = confirmationStatus.value;
            if (signatureStatus && signatureStatus.err){
                console.log('Confrimation Failed:', signatureStatus.err)
                success = false;
            } else{
                console.log('Transfer Transaction sucessful', signature);
                success = true;
            }
        }
        
        delay(10000);
        console.log('Swapping', amount);
        const quoteResponse = await axios.get(`https://api.jup.ag/swap/v1/quote?inputMint=${mint}&outputMint=${USDC_MINT}&amount=${Math.floor(amount)}&slippageBps=10`);

        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error){
            throw new Error('Get swap quote failed');
        }

        outAmount = quoteData.outAmount;

        const swapRequestBody = {
            quoteResponse: quoteData,
            userPublicKey: adminWallet.publicKey.toString(),
            // dynamicComputeUnitLimit: true,
            // prioritizationFeeLamports: {
            //     jitoTipLamports: 0.001 * LAMPORTS_PER_SOL
            // },
        };

        const swapResponse = await axios.post(`https://api.jup.ag/swap/v1/swap`, swapRequestBody);
        
        if (swapResponse.error){
            throw new Error('Failed to get swap instructions:');
        }

        const swapData = swapResponse.data;
        
        // const message = deserializeTransaction(swapData.swapTransaction);
        // const accountKeysFromLookups = await resolveAddressLookups(message);
        // const swapInstructions = createTransactionInstructions(message, accountKeysFromLookups);

        const versionedTrasnactionSwap = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64')) //await createVersionedTransaction([ adminWallet ], swapInstructions, latestBlockhash);
        versionedTrasnactionSwap.sign([adminWallet]);
        const transactionBinary = versionedTrasnactionSwap.serialize()
        const swapTransactionSignature = versionedTrasnactionSwap.signatures[0];
        const serializedSwapTransaction = bs58.encode(transactionBinary);
        signature = await connection.sendRawTransaction(transactionBinary);
        
        success = false;
        let retry = 0

        while (!success){
            const confirmSwap = await connection.getSignatureStatus(signature, {searchTransactionHistory: true});
            const signatureStatus = confirmSwap.value;
            if (signatureStatus && signatureStatus.err){
                console.log('Confrimation Failed:', signatureStatus.err)
                success = false;
                retry++
                
                if (retry>5){
                    console.log(`${retry} times retried, but failed`)
                    break;
                }

                console.log(`Swap failed. Retrying(${retry})...`);

                continue;
            } else{
                console.log('Transfer Transaction sucessful', signature);
                success = true;
            }
            // const isSent = await sendBundleRequest([serializedSwapTransaction]);
            // const result = await checkTransactionStatus(swapTransactionSignature, latestBlockhash);

            // if(!isSent) {
            //     retry++
                
            //     if (retry>5){
            //         console.log(`${retry} times retried, but failed`)
            //         return;
            //     }

            //     console.log(`Swap failed. Retrying(${retry})...`);

            //     continue;
            //     //throw new Error('Not confirmed swap transaction');
            // }

            // if(result.confirmed) {
            //     console.log('Successfuly swaped!');
            //     success = true;
            // } else {

            //     if (retry>5){
            //         console.log(`${retry} times retried, but failed`)
            //         return;
            //     }

            //     console.log(`Swap failed. Retrying(${retry})...`);
            // } 
        }   

        return {tx_id: swapTransactionSignature, outAmount};        
    } catch(err) {
        console.error(err);
        if (signature){
            return {tx_id: signature, outAmount}
        }
    }
}

async function userWithdraw(req, res){
    const {senderWallet, receiverWallet, amount} = req.body;
    
    const user = await User.findOne({walletAddress: senderWallet});

    if(!user){
        res.status(500).json({message:'Wallet address not found'});
    }
    if (user.balanceStableCoin < amount){
        res.status(400).json({message: 'Not enough balance'});
    }
    
    const result = await transferUSDC(adminWallet, receiverWallet, amount * 0.975);
    if (!result){
        res.status(400).json({
            message: 'Transaction failed'
        });
    }

    user.balanceStableCoin -= amount;
    await user.save();

    res.status(200).json({
        balance: user.balanceStableCoin,
        transaction: result
    })
}

async function transferUSDC(sender, receiver, amount){
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
        getTokenBalance(receiverATA),
        connection.getLatestBlockhash()
    ]);
    
    if(tokenBalance < amount) {
        return;
    }

    const signers = (sender === adminWallet) ? adminWallet : [adminWallet, sender] ;

    instructions.push(createTransferInstruction(senderATA, receiverATA, userWallet.publicKey, amount));
    const versionedTransaction = await createVersionedTransaction(signers, instructions, latestBlockhash);
    
    let success = false;

    let signature;

    while(!success) {
        signature = await connection.sendRawTransaction(versionedTransaction.serialize(), signers);
        console.log("Transaction sent with signature:", signature);

        const confirmation = await connection.confirmTransaction({signature,}, "confirmed");
        if (confirmation.value.err) {
            console.log(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
            continue;
        } else {
            console.log(`Transaction successful: https://solscan.io/tx/${signature}/`);
            success = true;
        }
    }

    return signature;
}

module.exports = {swapMintToStable, userWithdraw, transferUSDC};
