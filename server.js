require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require('http');
const bodyParser = require("body-parser");
const mongoose = require('./config/database');
const {Server} = require('socket.io');
const {checkWebhooks} = require('./utils/helper');
const userRoutes = require("./routes/userRoutes");
const gameRoutes = require("./routes/gameRoutes");
const { socketHandler } = require("./socket/socketHandler");
const webHookRouter = require('./routes/webHookRouter');
const transactionRouter = require('./routes/transactionRoutes');

// const transactionRoutes = require("./routes/transactionRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(80, {
    cors:{
        origin: '*',
        methods:['GET', 'POST']
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
    await checkWebhooks();
}
main();
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
