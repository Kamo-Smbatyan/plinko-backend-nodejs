const User = require("../models/User");

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

        socket.on("disconnect", () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
        });
    });
}

module.exports = { socketHandler };
