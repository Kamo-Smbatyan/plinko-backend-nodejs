const User = require("../schema/User"); // Import the User model

const createUser = async (userData) => {
  try {
    const newUser = new User(userData);
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
      { $set: balanceUpdate },
      { new: true }
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
  createUser,
  getUser,
  updateUserBalance,
  deleteUser,
  getAllUsers,
};
