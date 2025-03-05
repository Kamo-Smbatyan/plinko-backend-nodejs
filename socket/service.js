const TransactionHistory = require("../models/schema/TransactionHistory");
const User = require("../models/schema/User");
const { createSocketServer } = require("./socket");

let users = [];
let socketIO = null;

const startSocketService = (app) => {
  console.log("Socket Service Started!");
  socketIO = createSocketServer(app, (socket) => {
    console.log("User connect: ", socket.telegramID);
    const telegramID = socket.telegramID;
    users.push(telegramID);

    socket.on("update-balance", async (data) => {
      userBalanceUpdate(data);
    });

    socket.on("disconnect", () => {
      users = users.filter((user) => user !== userId);
    });
  });

  watchUserBalanceUpdates();
  watchTransactionHistoryTableUpdates();
};

const userBalanceUpdate = async (data) => {
  const { walletAddress, amount } = data;

  try {
    if (!walletAddress || isNaN(Number(amount))) {
      socketIO.emit("update-failed", { error: "Invalid input data" });
      return;
    }

    const user = await User.findOneAndUpdate(
      { walletAddress },
      { balanceStableCoin: Number(amount).toFixed(2) },
      { new: true }
    );

    if (!user) {
      socketIO.emit("update-failed", { error: "User not found" });
      return;
    }

    socketIO.emit("update-success", { walletAddress, status: "updated" });
  } catch (error) {
    console.error("❌ Update Error:", error);
    socketIO.emit("update-failed", { error: "Update failed" });
  }
}

const watchUserBalanceUpdates = () => {
  // Watch changes in the User collection
  User.watch([{ $match: { "updateDescription.updatedFields.balanceStableCoin": { $exists: true } } }])
    .on("change", async (change) => {
      try {
        const { documentKey, updateDescription } = change;
        const _id = documentKey._id;

        // Fetch the updated user data
        const user = await User.findById(_id);
        if (!user) return;

        // Emit socket event with updated balance
        sendStatusMessageToClient(user.telegramID, `Your balance: ${user.balanceStableCoin}`);
        socketIO.emit("updated-balance", JSON.stringify({
          telegramID: user.telegramID,
          balance: user.balanceStableCoin
        }));

      } catch (err) {
        console.error("Error in watchUserBalanceUpdates:", err);
      }
    })
    .on("error", (err) => {
      console.error("MongoDB Change Stream Error:", err);
    });
};

const watchTransactionHistoryTableUpdates = () => {
  TransactionHistory.watch().on("change", async (change) => {
    try{
      const {documentKey, operationType, fullDocument} = change;
      const _id = documentKey._id;
      const transactionHistory = await TransactionHistory.findById(_id);
      if (!transactionHistory) return;
      socketIO.emit('transaction-history', JSON.stringify({
        telegramID: transactionHistory.telegramID,
        change: operationType,
        document: (change == 'insert'? fullDocument: transactionHistory),
      }));
    } catch (err){
      console.error('Error in transaction history change watch', err);
    }
  })
}

const sendSuccessMessageToClient = async (telegramID, msg) => {
  socketIO.emit('notification', JSON.stringify({
    telegramID,
    msg
  }));
}

const sendErrorMessageToClient = async (telegramID, msg) => {
  socketIO.emit('error-notification',JSON.stringify({
    telegramID, msg
  }));
}

const sendStatusMessageToClient = async (telegramID, msg) => {
  socketIO.emit('status-notification',JSON.stringify({
    telegramID, msg
  }));
}

module.exports = {
  startSocketService,
  sendSuccessMessageToClient,
  sendErrorMessageToClient,
  sendStatusMessageToClient,
}