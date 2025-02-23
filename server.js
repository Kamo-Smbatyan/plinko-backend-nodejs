require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require('http');
const bodyParser = require("body-parser");
const mongoose = require('./config/database');
const {Server} = require('socket.io');
const {checkAndSetWebhookID} = require('./utils/helper');
const userRoutes = require("./routes/userRoutes");
const gameRoutes = require("./routes/gameRoutes");
const { socketHandler } = require("./socket/socketHandler");
const webHookRouter = require('./routes/webHookRouter');
const transactionRouter = require('./routes/transactionRoutes');
const {connection} = require('./utils/helper');
const { PublicKey } = require("solana-web3.js");

// const transactionRoutes = require("./routes/transactionRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors:{
        origin: '*',
    },
});

socketHandler(io);
app.use(cors());
app.use(bodyParser.json());

app.use("/user", userRoutes);
app.use("/game", gameRoutes);
app.use('/monitor', webHookRouter);
app.use('/transaction', transactionRouter)

main = async () =>{
    await checkAndSetWebhookID();
}
main();
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
