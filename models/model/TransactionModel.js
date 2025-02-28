const TransactionHistory = require("../schema/TransactionHistory");

const newTransactionHistory = async (transactionData) => {
    try {
      const transaction = new TransactionHistory(transactionData);
      await transaction.save();
      return transaction;
    } catch (error) {
      throw error;
    }
  };
const getTransactionsByTelegramID = async (telegramID) => {
    try {
      return await TransactionHistory.find({ telegramID }).sort({ created_at: -1 });
    } catch (error) {
      throw error;
    }
};

const updateTransactionStatus = async (_id, newStatus, type) => {
    try {
      const updateField = `${type}.status`; // e.g., "deposit.status", "forward.status", or "swap.status"
      return await TransactionHistory.findByIdAndUpdate(
        transactionID,
        { $set: { [updateField]: newStatus } },
        { new: true }
      );
    } catch (error) {
      throw error;
    }
};

const deleteTransaction = async (transactionID) => {
    try {
      return await TransactionHistory.findByIdAndDelete(transactionID);
    } catch (error) {
      throw error;
    }
};

const findByIdAndUpdateTransaction = async (id, updateData) => {
    try{
      return await TransactionHistory.findByIdAndUpdate(id, updateData);
    } catch(error){
        throw error;
    }
}

module.exports = {
    getTransactionsByTelegramID,
    deleteTransaction,
    updateTransactionStatus,
    getTransactionsByTelegramID,
    newTransactionHistory,
    findByIdAndUpdateTransaction,
};
  
  