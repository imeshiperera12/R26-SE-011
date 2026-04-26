const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  candidateId: String,
  moduleCode: String,
  marks: Number,
  grade: String,
  version: {
    type: Number,
    default: 1
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Result", resultSchema);