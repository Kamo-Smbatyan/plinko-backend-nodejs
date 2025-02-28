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

  watchUserBalanceUpdates()
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
        const telegramID = documentKey._id;

        // Fetch the updated user data
        const user = await User.findById(telegramID);
        if (!user) return;

        // Emit socket event with updated balance
        socketIO.emit("transaction-state", JSON.stringify({
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

const sendMessageToClient = async (telegramID, msg) => {
  socketIO.emit('notification', JSON.stringify({
    telegramID,
    msg
  }));
}

module.exports = {
  startSocketService,
  sendMessageToClient
}