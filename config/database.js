const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.DATABASE_URL || "mongodb://localhost:27017/plinko_game";

mongoose.connect(MONGO_URI)
  .then( ()=> console.log('Connected to MongoDB'))
  .catch((err) => console.error('Mongo connection error:', err));

module.exports = mongoose;
