const dotenv = require('dotenv')
dotenv.config();

const TX_STATE = {
    PENDING: 'Pending',
    SENT: 'Sent',
    FAILED: 'Failed',
    CONFIRMED: 'Confirmed',
}

const USER_WEBHOOK_ID =process.env.USER_WEBHOOK_ID || null ;
const ADMIN_WEBHOOK_ID = process.env.ADMIN_WEBHOOK_ID || null;
const SOL_MINT_ADDRESS = process.env.SOL_MINT_ADDRESS || "";
const USDC_MINT_ADDRESS = process.env.USDC_MINT_ADDRESS || "";


function setUserWebHookID(value){
    USER_WEBHOOK_ID = value
}

function getUserWebHookID(){
    return USER_WEBHOOK_ID;
}

function getAdminWebhookID(){
    return ADMIN_WEBHOOK_ID
}

function setAdminWebhookID(value){
    WEBHOOK_ADMIN = value;
}

const JITO_ENDPOINTS = [
    'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://slc.mainnet.block-engine.jito.wtf'
];

const JITO_TIP_ACCOUNTS = [
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'
]

const JUPITER_API_BASE_URL = {
    QUOTE: 'https://api.jup.ag/swap/v1/quote/',
    SWAP: 'https://api.jup.ag/swap/v1/swap/',
}

const TRANSACTION_FEE = process.env.TRANSACTION_FEE_RATE || 0.975 

module.exports = {
    setUserWebHookID, 
    getUserWebHookID,
    setAdminWebhookID,
    getAdminWebhookID,
    JITO_ENDPOINTS,
    JITO_TIP_ACCOUNTS,
    JUPITER_API_BASE_URL,
    SOL_MINT_ADDRESS,
    USDC_MINT_ADDRESS,
    TRANSACTION_FEE
};
