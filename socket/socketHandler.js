const User = require("../models/User");
const {clients, addClient, getClient} = require('../config/constants')

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
                if(!telegramID){
                    return;
                }
                const user = await User.findOne({telegramID: telegramID});
                if (!user){
                    return;
                }
                addClient(telegramID, socket);                
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

function sendMessageToClient(telegramID, data){
    const clientTG = getClient(telegramID)
    if(clientTG){
        console.log('client is not connected', telegramID);
        return;
    }
    clientTG.emit('transaction-state', data);
}

module.exports = { socketHandler, sendMessageToClient};
