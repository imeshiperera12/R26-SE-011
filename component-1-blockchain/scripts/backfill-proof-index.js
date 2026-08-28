"use strict";

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { ethers } = require("ethers");
const { connectProofIndexDatabase } = require("../config/db");
const ResultProofIndex = require("../models/ResultProofIndex");
const { getFromIPFS } = require("../utils/ipfs");

const artifact = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "controllers", "ProofStorage.json"),
    "utf8"
));

async function readAnchoredEvents(contract, provider, fromBlock) {
    const latestBlock = await provider.getBlockNumber();
    const chunkSize = Number(process.env.PROOF_HISTORY_BLOCK_CHUNK || 2000);
    const events = [];

    for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, latestBlock);
        events.push(...await contract.queryFilter(contract.filters.ProofAnchored(), start, end));
    }

    return events;
}

async function backfillProofIndex() {
    const rpcUrl = process.env.RPC_URL;
    const contractAddress = process.env.CONTRACT_ADDRESS;
    if (!rpcUrl || !contractAddress) {
        throw new Error("RPC_URL and CONTRACT_ADDRESS are required for proof-history backfill");
    }

    await connectProofIndexDatabase();
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    if (await provider.getCode(contractAddress) === "0x") {
        throw new Error(`No ProofStorage contract found at ${contractAddress}`);
    }

    const contract = new ethers.Contract(contractAddress, artifact.abi, provider);
    const fromBlock = Number(process.env.PROOF_HISTORY_FROM_BLOCK || 0);
    const events = await readAnchoredEvents(contract, provider, fromBlock);
    let indexedRecords = 0;

    for (const event of events) {
        const merkleRoot = event.args.merkleRoot;
        const ipfsCID = event.args.ipfsCID;
        const proof = await contract.getProof(merkleRoot);
        const anchoredAt = new Date(Number(proof[1]) * 1000);
        const dataset = await getFromIPFS(ipfsCID);
        const records = dataset?.recordsWithHashes || dataset?.records || [];

        const operations = records
            .filter((record) =>
                record.candidateId &&
                record.moduleCode &&
                Number.isInteger(Number(record.version))
            )
            .map((record) => ({
                updateOne: {
                    filter: {
                        candidateId: String(record.candidateId).trim(),
                        moduleCode: String(record.moduleCode).trim(),
                        version: Number(record.version),
                        merkleRoot
                    },
                    update: {
                        $set: { ipfsCID, anchoredAt },
                        $setOnInsert: {
                            candidateId: String(record.candidateId).trim(),
                            moduleCode: String(record.moduleCode).trim(),
                            version: Number(record.version),
                            merkleRoot
                        }
                    },
                    upsert: true
                }
            }));

        if (operations.length) {
            await ResultProofIndex.bulkWrite(operations, { ordered: false });
            indexedRecords += operations.length;
        }
    }

    return { anchorsScanned: events.length, indexedRecords };
}

if (require.main === module) {
    backfillProofIndex()
        .then((result) => {
            console.log(`Proof history backfilled: ${result.anchorsScanned} anchor(s), ${result.indexedRecords} record(s).`);
        })
        .catch((error) => {
            console.error(`Proof history backfill failed: ${error.message}`);
            process.exitCode = 1;
        })
        .finally(async () => {
            await mongoose.disconnect();
        });
}

module.exports = { backfillProofIndex, readAnchoredEvents };
