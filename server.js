require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { checkWebhooks } = require('./utils/helper');
const userRoutes = require("./routes/userRoutes");
const gameRoutes = require("./routes/gameRoutes");
const webHookRouter = require('./routes/webHookRouter');
const transactionRouter = require('./routes/transactionRoutes');
const { startSocketService } = require("./socket/service");

require('./config/database');

// const transactionRoutes = require("./routes/transactionRoutes");

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => res.status(200).json("Server is running!"));

app.use("/user", userRoutes);
app.use("/game", gameRoutes);
app.use('/monitor', webHookRouter);
app.use('/transaction', transactionRouter)

main = async () =>{
    await checkWebhooks();
}
main();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Start Socket Service
startSocketService(app);