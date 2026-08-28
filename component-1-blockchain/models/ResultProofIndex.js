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

        // Optional for backward compatibility with proof-index documents
        // created before historical versioning was introduced. Every new
        // finalized record is indexed with its explicit academic version.
        version: {
            type: Number,
            min: 0,
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
// Preserve every finalized candidate/module/version/root context. This is an
// append-only lookup index over immutable blockchain/IPFS evidence; repeated
// ingestion of the same root remains idempotent.
// =====================================================

resultProofIndexSchema.index({
    candidateId: 1,
    moduleCode: 1,
    version: 1,
    merkleRoot: 1
}, {
    unique: true,
    partialFilterExpression: {
        version: { $type: "number" }
    }
});


module.exports = mongoose.model(
    "ResultProofIndex",
    resultProofIndexSchema
);
