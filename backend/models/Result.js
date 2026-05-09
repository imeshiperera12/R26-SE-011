const mongoose = require("mongoose");

// =======================================
// HISTORY SCHEMA
// =======================================

const historySchema = new mongoose.Schema({
  version: {
    type: Number,
  },

  oldMarks: {
    type: Number,
  },

  newMarks: {
    type: Number,
  },

  oldGrade: {
    type: String,
  },

  newGrade: {
    type: String,
  },

  editedBy: {
    type: String,
  },

  reason: {
    type: String,
  },

  editedAt: {
    type: Date,
    default: Date.now,
  },
});

// =======================================
// RESULT SCHEMA
// =======================================

const resultSchema = new mongoose.Schema({
  candidateId: {
    type: String,
    required: true,
  },

  moduleCode: {
    type: String,
    required: true,
  },

  marks: {
    type: Number,
    required: true,
  },

  grade: {
    type: String,
    required: true,
  },

  hash: {
    type: String,
  },

  releaseDate: {
    type: Date,
    default: Date.now,
  },

  version: {
    type: Number,
    default: 1,
  },

  history: [historySchema],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Result", resultSchema);
