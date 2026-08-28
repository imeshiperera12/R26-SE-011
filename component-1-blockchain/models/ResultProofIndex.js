const mongoose = require("mongoose");

const resultProofIndexSchema = new mongoose.Schema(
    {
        candidateId: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        moduleCode: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        merkleRoot: {
            type: String,
            required: true,
            trim: true
        },

        ipfsCID: {
            type: String,
            required: true,
            trim: true
        },

        anchoredAt: {
            type: Date,
            required: true,
            index: true
        }
    },
    {
        timestamps: true,
        collection: "result_proof_index"
    }
);


// =====================================================
// LOOKUP INDEX
// =====================================================
//
// Candidate + module are used to find the proof context.
// If the same candidate/module appears in a later
// anchored dataset, the newest anchoredAt value is used.
//
// Version is intentionally NOT stored here.
// =====================================================

resultProofIndexSchema.index({
    candidateId: 1,
    moduleCode: 1,
    anchoredAt: -1
});


module.exports = mongoose.model(
    "ResultProofIndex",
    resultProofIndexSchema
);