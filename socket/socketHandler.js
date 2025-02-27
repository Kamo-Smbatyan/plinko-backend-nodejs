const User = require("../models/User");
const {clients, addClient, getClient, numb} = require('../config/constants');
const TransactionHistory = require("../models/TransactionHistory");

function socketHandler(io) {
    io.on("connection", (socket) => {
        console.log(`🔗 Client connected: ${socket.id}`);
        socket.on("update-balance", async (data) => {
            try {
                const walletAddress = data.walletAddress;
                const amount = data.amount;

                const user = await User.findOne({ walletAddress: walletAddress });
                if (!user) {
                    socket.emit("update-failed", { error: "User not found" });
                    return;
                }
                user.balanceStableCoin = Number(amount).toFixed(2);
                await user.save();
                socket.emit("update-success", { walletAddress, status: "updated" });
            } catch (error) {
                console.error("❌ Update Error:", error);
                socket.emit("update-failed", { error: "Update failed" });
            }
        });
        socket.on('transaction-state', async(data) => {
            try{
                const telegramID = data.telegramID;
                socket.emit('trasaction-state', numb.toString());
                if(!telegramID){
                    return;
                }
                const txnHistory = await TransactionHistory.find({telegramID: telegramID});
                if (!txnHistory){
                    return;
                }

                socket.emit('transaction-state', JSON.stringify({
                    telegramID: telegramID,
                }));

                addClient(telegramID, socket);
                console.log('Socket detected:', telegramID, clients[telegramID]);

            }
            catch (err){
                socket.emit('transaction-state', err)
            }
        });

        socket.on("disconnect", () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
        });
    });
}

async function sendMessageToClient(telegramID, data){
    
}

module.exports = { socketHandler, sendMessageToClient};
