require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require('node-cron');
const bodyParser = require("body-parser");
const connection = require("./utils/helper")
const { checkWebhooks } = require('./utils/helper');
const userRoutes = require("./routes/userRoutes");
const tokenRoutes = require('./routes/tokenRoutes')
const webHookRouter = require('./routes/webHookRouter');
const transactionRouter = require('./routes/transactionRoutes');
const { startSocketService } = require("./socket/service");
const {handleFailedTransaction} = require("./utils/cron")
require('./config/database');

const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/', (req, res) => res.status(200).json("Server is running!"));

app.use("/user", userRoutes);
app.use("/token", tokenRoutes)
app.use('/monitor', webHookRouter);
app.use('/transaction', transactionRouter)

cron.schedule("*/10 * * * *", handleFailedTransaction);

main = async () =>{
    await checkWebhooks();
}
main();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Start Socket Service
startSocketService(app);