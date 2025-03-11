const User = require("../schema/User"); // Import the User model
const bs58 = require('bs58');
const createNewUser = async (telegramID, newWallet) => {
  try {
    const newUser = new User({
      telegramID: telegramID,
      walletAddress: newWallet.publicKey.toBase58(),
      secretKey: bs58.encode(newWallet.secretKey),
    });
    await newUser.save();
    return { success: true, data: newUser };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getUser = async (identifier) => {
  try {
    const user = await User.findOne({
      $or: [{ walletAddress: identifier }, { telegramID: identifier }],
    });
    if (!user) return { success: false, error: "User not found" };
    return { success: true, data: user };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateUserBalance = async (telegramID, balanceUpdate) => {
  try {
    const updatedUser = await User.findOneAndUpdate(
      { telegramID },
      { $set: {"balanceStableCoin": balanceUpdate} },
    );
    if (!updatedUser) return { success: false, error: "User not found" };
    return { success: true, data: updatedUser };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteUser = async (identifier) => {
  try {
    const deletedUser = await User.findOneAndDelete({
      $or: [{ walletAddress: identifier }, { telegramID: identifier }],
    });
    if (!deletedUser) return { success: false, error: "User not found" };
    return { success: true, message: "User deleted successfully" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getAllUsers = async () => {
  try {
    const users = await User.find();
    return { success: true, data: users };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  createNewUser,
  getUser,
  updateUserBalance,
  deleteUser,
  getAllUsers,
};
