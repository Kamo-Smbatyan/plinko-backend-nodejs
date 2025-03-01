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

const getTransactionsByTelegramID = async (telegramID, limit, offset, txType = "all") => {
  try {
    let query = { telegramID };

    // Filter based on transaction type
    if (txType !== "all") {
      query[txType] = { $exists: true }; // Ensures only documents with the specified transaction type
    }

    return await TransactionHistory.find(query)
      .sort({ created_at: -1 })
      .skip(offset || 0)  // Default to 0 if undefined
      .limit(limit || 0); // 0 means no limit (returns all if limit is undefined)
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
  try {
    return await TransactionHistory.findByIdAndUpdate(id, updateData);
  } catch(error){
      throw error;
  }
}

module.exports = {
  getTransactionsByTelegramID,
  deleteTransaction,
  updateTransactionStatus,
  newTransactionHistory,
  findByIdAndUpdateTransaction,
};
  
  