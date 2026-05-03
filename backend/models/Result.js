const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  candidateId: String,

  moduleCode: String,

  marks: Number,
  grade: String,

  hash: String,

  releaseDate: {
    type: Date,
    default: Date.now,
  },

  version: {
    type: Number,
    default: 1,
  },

  history: [
    {
      version: Number,
      oldMarks: Number,
      newMarks: Number,
      oldGrade: String,
      newGrade: String,
      editedBy: String,
      reason: String,
      editedAt: Date,
    },
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Result", resultSchema);
