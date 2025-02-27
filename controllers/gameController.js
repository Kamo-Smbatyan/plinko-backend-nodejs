
async function getData(req, res){
  const {telegramID} = req.body;
  if (!telegramID){
    return; 
  }
  const txHistory = TransactionHistory.find({telegramID: telegramID});
  if (!txHistory){
    return;
  }
  return res.json(txHistory);
}

module.exports = { placeBet };
