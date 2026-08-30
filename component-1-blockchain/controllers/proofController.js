const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const {
    buildMerkleTree,
    getMerkleProof,
    verifyMerkleProof
} = require("../utils/merkle");

const {
    uploadToIPFS,
    getFromIPFS
} = require("../utils/ipfs");

const ResultProofIndex =
    require("../models/ResultProofIndex");


// =====================================================
// LOAD SMART CONTRACT ABI
// =====================================================

const contractArtifact =
    JSON.parse(
        fs.readFileSync(
            path.join(
                __dirname,
                "ProofStorage.json"
            ),
            "utf8"
        )
    );

const CONTRACT_ABI =
    contractArtifact.abi;


// =====================================================
// BLOCKCHAIN CONFIGURATION
// =====================================================
//
// LOCAL:
// RPC_URL=http://127.0.0.1:8545
// CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
//
// PRODUCTION / REMOTE:
// RPC_URL=<persistent RPC>
// CONTRACT_ADDRESS=<deployed ProofStorage address>
//
// =====================================================

const CONTRACT_ADDRESS =
    process.env.CONTRACT_ADDRESS;

const BLOCKCHAIN_RPC_URL =
    process.env.RPC_URL ||
    "http://127.0.0.1:8545";

const DEPLOYER_PRIVATE_KEY =
    process.env.DEPLOYER_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;


if (!CONTRACT_ADDRESS) {

    console.warn(
        "WARNING: CONTRACT_ADDRESS is not configured. Blockchain operations will fail until it is set."
    );
}


// =====================================================
// COMPONENT 2 HASH VERIFICATION
// =====================================================
//
// Must exactly match Component 2:
//
// candidateId|moduleCode|marks|grade|version
//
// =====================================================

function verifyComponent2Hash(record) {

    const hashData = [

        record.candidateId,

        record.moduleCode,

        record.marks,

        record.grade,

        record.version

    ].join("|");


    return crypto
        .createHash("sha256")
        .update(hashData)
        .digest("hex");
}


// =====================================================
// NORMALIZE MERKLE ROOT
// =====================================================

function normalizeMerkleRoot(root) {

    if (!root) {
        return null;
    }


    return root.startsWith("0x")
        ? root
        : `0x${root}`;
}


// =====================================================
// CREATE BLOCKCHAIN PROVIDER
// =====================================================

function createBlockchainProvider() {

    return new ethers.JsonRpcProvider(
        BLOCKCHAIN_RPC_URL
    );
}


// =====================================================
// CREATE READ-ONLY PROOF STORAGE CONTRACT
// =====================================================

async function getReadOnlyProofStorageContract(
    provider
) {

    if (!CONTRACT_ADDRESS) {

        throw new Error(
            "CONTRACT_ADDRESS is missing from environment variables."
        );
    }


    const contractCode =
        await provider.getCode(
            CONTRACT_ADDRESS
        );


    if (
        contractCode === "0x"
    ) {

        throw new Error(
            `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
        );
    }


    return new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
    );
}


// =====================================================
// LOAD IPFS DATA FOR AN ANCHORED ROOT
// =====================================================

async function loadAnchoredIPFSData(
    proofStorageContract,
    merkleRoot
) {

    const blockchainProof =
        await proofStorageContract.getProof(
            merkleRoot
        );


    const ipfsCID =
        blockchainProof[0];

    const timestamp =
        blockchainProof[1];

    const uploadedBy =
        blockchainProof[2];


    if (
        !ipfsCID ||
        timestamp === undefined ||
        timestamp === null ||
        timestamp === 0n
    ) {

        throw new Error(
            "Blockchain proof exists but contains invalid proof metadata."
        );
    }


    const ipfsData =
        await getFromIPFS(
            ipfsCID
        );


    if (
        !ipfsData ||
        !ipfsData.merkleRoot
    ) {

        throw new Error(
            "IPFS dataset does not contain a Merkle Root."
        );
    }


    let normalizedIPFSRoot =
        ipfsData.merkleRoot;


    if (
        !normalizedIPFSRoot.startsWith("0x")
    ) {

        normalizedIPFSRoot =
            `0x${normalizedIPFSRoot}`;
    }


    return {

        blockchainProof: {

            ipfsCID,

            timestamp,

            uploadedBy

        },

        ipfsData,

        normalizedIPFSRoot

    };
}


// =====================================================
// CHECK WHETHER ROOT IS ALREADY ANCHORED
// =====================================================

async function getExistingAnchoredProof(
    provider,
    proofStorageContract,
    merkleRoot
) {

    try {

        const proof =
            await proofStorageContract.getProof(
                merkleRoot
            );


        const ipfsCID =
            proof[0];

        const timestamp =
            proof[1];

        const uploadedBy =
            proof[2];


        if (
            !ipfsCID ||
            !timestamp ||
            timestamp === 0n
        ) {

            return {
                exists: false
            };
        }


        return {

            exists: true,

            ipfsCID,

            timestamp,

            uploadedBy

        };

    } catch (error) {

        const message =
            String(
                error?.reason ||
                error?.shortMessage ||
                error?.message ||
                ""
            );


        if (
            message.includes(
                "Proof not found for the provided Merkle Root"
            )
        ) {

            return {
                exists: false
            };
        }


        let serialized = "";

        try {

            serialized =
                JSON.stringify(
                    error
                );

        } catch (_) {

            serialized =
                String(error);

        }


        if (
            serialized.includes(
                "Proof not found for the provided Merkle Root"
            )
        ) {

            return {
                exists: false
            };
        }


        throw error;
    }
}


// =====================================================
// UPSERT PROOF INDEX
// =====================================================
//
// IMPORTANT:
// The Merkle Root is part of the lookup key.
//
// This allows the same candidate/module to appear in
// multiple historical finalized datasets without
// overwriting the previous proof context.
//
// =====================================================

async function upsertProofIndex(
    finalizedRecords,
    merkleRoot,
    ipfsCID,
    anchoredAt
) {

    let storedCount =
        0;


    for (
        const record
        of finalizedRecords
    ) {

        await ResultProofIndex.updateOne(

            {

                candidateId:
                    record.candidateId,

                moduleCode:
                    record.moduleCode,

                merkleRoot:
                    merkleRoot

            },

            {

                $set: {

                    ipfsCID:
                        ipfsCID,

                    anchoredAt:
                        anchoredAt

                },

                $setOnInsert: {

                    candidateId:
                        record.candidateId,

                    moduleCode:
                        record.moduleCode,

                    merkleRoot:
                        merkleRoot

                }

            },

            {
                upsert:
                    true
            }

        );


        storedCount++;

    }


    return storedCount;
}


// =====================================================
// PERFORM ANCHOR INTEGRITY CHECK
// =====================================================
//
// Checks:
//
// 1. Blockchain proof exists.
// 2. IPFS dataset exists.
// 3. Blockchain Root == IPFS Root.
// 4. Every finalized record hash is correct.
// 5. Rebuilt Merkle Root == blockchain Root.
// 6. Proof Index contains all records for the anchor.
//
// =====================================================

async function performAnchorIntegrityCheck(
    merkleRoot
) {

    const formattedMerkleRoot =
        normalizeMerkleRoot(
            merkleRoot
        );


    if (
        !formattedMerkleRoot ||
        !/^0x[a-fA-F0-9]{64}$/.test(
            formattedMerkleRoot
        )
    ) {

        throw new Error(
            "Invalid Merkle Root format."
        );
    }


    const provider =
        createBlockchainProvider();


    const proofStorageContract =
        await getReadOnlyProofStorageContract(
            provider
        );


    // =================================================
    // LOAD BLOCKCHAIN + IPFS EVIDENCE
    // =================================================

    const {

        blockchainProof,

        ipfsData,

        normalizedIPFSRoot

    } =
        await loadAnchoredIPFSData(

            proofStorageContract,

            formattedMerkleRoot

        );


    // =================================================
    // BLOCKCHAIN ↔ IPFS ROOT
    // =================================================

    const blockchainRootMatch =
        formattedMerkleRoot.toLowerCase() ===
        normalizedIPFSRoot.toLowerCase();


    // =================================================
    // FINALIZED RECORDS
    // =================================================

    const records =
        ipfsData.recordsWithHashes;


    if (
        !Array.isArray(records)
    ) {

        throw new Error(
            "IPFS dataset does not contain a valid finalized record list."
        );
    }


    // =================================================
    // SHA-256 VALIDATION
    // =================================================

    const hashResults =
        records.map(
            (record) => {

                const expectedHash =
                    verifyComponent2Hash(
                        record
                    );


                return {

                    candidateId:
                        record.candidateId,

                    moduleCode:
                        record.moduleCode,

                    expectedHash:
                        expectedHash,

                    storedHash:
                        record.hash,

                    matches:
                        expectedHash.toLowerCase() ===
                        String(
                            record.hash
                        ).toLowerCase()

                };

            }
        );


    const invalidHashCount =
        hashResults.filter(
            (result) =>
                !result.matches
        ).length;


    const allHashesMatch =
        invalidHashCount === 0;


    // =================================================
    // MERKLE VALIDATION
    // =================================================

    const leafHashes =
        records.map(
            (record) =>
                record.hash
        );


    const rebuiltMerkleRoot =
        normalizeMerkleRoot(
            buildMerkleTree(
                leafHashes
            )
        );


    const merkleRootMatch =
        rebuiltMerkleRoot &&
        rebuiltMerkleRoot.toLowerCase() ===
        formattedMerkleRoot.toLowerCase();


    // =================================================
    // PROOF INDEX VALIDATION
    // =================================================

    const proofIndexCount =
        await ResultProofIndex.countDocuments({

            merkleRoot:
                formattedMerkleRoot

        });


    const proofIndexMatch =
        proofIndexCount ===
        records.length;


    // =================================================
    // FINAL RESULT
    // =================================================

    const blockchainVerified =
        true;


    const ipfsVerified =
        blockchainRootMatch;


    const merkleVerified =
        Boolean(
            merkleRootMatch
        );


    const hashVerified =
        allHashesMatch;


    const proofIndexVerified =
        proofIndexMatch;


    const verified =
        blockchainVerified &&
        ipfsVerified &&
        merkleVerified &&
        hashVerified &&
        proofIndexVerified;


    return {

        verified,

        merkleRoot:
            formattedMerkleRoot,

        ipfsCID:
            blockchainProof.ipfsCID,

        timestamp:
            blockchainProof.timestamp.toString(),

        uploadedBy:
            blockchainProof.uploadedBy,

        totalRecords:
            records.length,

        checks: {

            blockchain: {

                passed:
                    blockchainVerified,

                status:
                    "PASS",

                message:
                    "Blockchain proof exists for this Merkle Root."

            },


            ipfs: {

                passed:
                    ipfsVerified,

                status:
                    ipfsVerified
                        ? "PASS"
                        : "FAIL",

                message:
                    ipfsVerified
                        ? "IPFS Merkle Root matches blockchain."
                        : "IPFS Merkle Root does not match blockchain.",

                ipfsMerkleRoot:
                    normalizedIPFSRoot

            },


            sha256: {

                passed:
                    hashVerified,

                status:
                    hashVerified
                        ? "PASS"
                        : "FAIL",

                message:
                    hashVerified
                        ? "All finalized record hashes match."
                        : `${invalidHashCount} record hash(es) failed validation.`,

                invalidHashCount

            },


            merkle: {

                passed:
                    merkleVerified,

                status:
                    merkleVerified
                        ? "PASS"
                        : "FAIL",

                message:
                    merkleVerified
                        ? "Rebuilt Merkle Root matches blockchain."
                        : "Rebuilt Merkle Root does not match blockchain.",

                rebuiltMerkleRoot:
                    rebuiltMerkleRoot

            },


            proofIndex: {

                passed:
                    proofIndexVerified,

                status:
                    proofIndexVerified
                        ? "PASS"
                        : "FAIL",

                message:
                    proofIndexVerified
                        ? "Proof index contains all records for this anchor."
                        : "Proof index count does not match the finalized dataset.",

                indexedRecords:
                    proofIndexCount,

                datasetRecords:
                    records.length

            }

        }

    };
}


// =====================================================
// GENERATE PROOF MANIFEST
// =====================================================
//
// POST /generate-proof
// POST /blockchain/storeHash
//
// =====================================================

exports.generateProofManifest =
    async (req, res) => {

        try {

            const {
                records
            } =
                req.body;


            // =================================================
            // REQUEST VALIDATION
            // =================================================

            if (
                !records ||
                !Array.isArray(records) ||
                records.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Payload missing valid academic records array."

                });
            }


            // =================================================
            // VALIDATE COMPONENT 2 RECORDS
            // =================================================

            const finalizedRecords =
                records.map(
                    (record) => {

                        if (
                            !record.candidateId ||
                            !record.moduleCode ||
                            record.marks === undefined ||
                            !record.grade ||
                            record.version === undefined ||
                            !record.hash
                        ) {

                            throw new Error(
                                `Incomplete record received for candidate ${
                                    record.candidateId ||
                                    "unknown"
                                }`
                            );
                        }


                        const expectedHash =
                            verifyComponent2Hash(
                                record
                            );


                        if (
                            record.hash !==
                            expectedHash
                        ) {

                            throw new Error(
                                `Hash verification failed for candidate ${record.candidateId}`
                            );
                        }


                        return {

                            candidateId:
                                record.candidateId,

                            moduleCode:
                                record.moduleCode,

                            marks:
                                Number(
                                    record.marks
                                ),

                            grade:
                                record.grade,

                            version:
                                Number(
                                    record.version
                                ),

                            hash:
                                record.hash

                        };

                    }
                );


            // =================================================
            // EXTRACT LEAF HASHES
            // =================================================

            const leafHashes =
                finalizedRecords.map(
                    (record) =>
                        record.hash
                );


            // =================================================
            // BUILD MERKLE ROOT
            // =================================================

            const globalMerkleRoot =
                buildMerkleTree(
                    leafHashes
                );


            if (
                !globalMerkleRoot
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Merkle Root generation failed."

                });
            }


            console.log(
                "Generated Merkle Root:",
                globalMerkleRoot
            );


            // =================================================
            // FORMAT MERKLE ROOT
            // =================================================

            const formattedMerkleRoot =
                normalizeMerkleRoot(
                    globalMerkleRoot
                );


            // =================================================
            // CONNECT TO BLOCKCHAIN
            // =================================================

            console.log(
                `Connecting to blockchain RPC: ${BLOCKCHAIN_RPC_URL}`
            );


            if (
                !CONTRACT_ADDRESS
            ) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            // =================================================
            // CHECK CONTRACT DEPLOYMENT
            // =================================================

            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            // =================================================
            // GET SIGNER
            // =================================================
            //
            // Local Hardhat:
            // Uses account 0.
            //
            // Remote/production:
            // Requires DEPLOYER_PRIVATE_KEY or PRIVATE_KEY.
            //
            // =================================================

            let signer;


            if (
                DEPLOYER_PRIVATE_KEY
            ) {

                signer =
                    new ethers.Wallet(
                        DEPLOYER_PRIVATE_KEY,
                        provider
                    );

            } else if (
                /^(https?:\/\/)?(127\.0\.0\.1|localhost|::1)(:\d+)?$/
                    .test(
                        BLOCKCHAIN_RPC_URL
                    )
            ) {

                signer =
                    await provider.getSigner(
                        0
                    );

            } else {

                throw new Error(
                    "DEPLOYER_PRIVATE_KEY or PRIVATE_KEY is required when using a remote blockchain RPC."
                );

            }


            // =================================================
            // CONTRACT INSTANCE
            // =================================================

            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    signer
                );


            // =================================================
            // CHECK EXISTING ROOT BEFORE IPFS
            // =================================================

            console.log(
                "Checking whether this Merkle Root is already anchored..."
            );


            const existingProof =
                await getExistingAnchoredProof(
                    provider,
                    proofStorageContract,
                    formattedMerkleRoot
                );


            // =================================================
            // CASE A — ROOT ALREADY EXISTS
            // =================================================

            if (
                existingProof.exists
            ) {

                console.log(
                    "Merkle Root is already anchored."
                );


                console.log(
                    "Reusing existing blockchain IPFS CID:",
                    existingProof.ipfsCID
                );


                const existingCID =
                    existingProof.ipfsCID;


                const existingAnchoredAt =
                    new Date(
                        Number(
                            existingProof.timestamp
                        ) * 1000
                    );


                let proofIndexReady =
                    true;


                let proofIndexError =
                    null;


                let indexRecordsStored =
                    0;


                try {

                    indexRecordsStored =
                        await upsertProofIndex(

                            finalizedRecords,

                            formattedMerkleRoot,

                            existingCID,

                            existingAnchoredAt

                        );


                    console.log(
                        `Existing proof reused. Proof lookup index updated for ${indexRecordsStored} record(s).`
                    );

                } catch (indexError) {

                    proofIndexReady =
                        false;


                    proofIndexError =
                        indexError.message;


                    console.error(
                        "Existing blockchain proof reused, but Proof Index update failed:",
                        indexError.message
                    );

                }


                return res.status(200).json({

                    success:
                        true,

                    message:
                        "Merkle Root was already anchored. Existing IPFS proof was reused.",

                    reusedExistingProof:
                        true,

                    blockchainTx: {

                        transactionHash:
                            null,

                        blockNumber:
                            null,

                        contractAddress:
                            CONTRACT_ADDRESS,

                        anchoredBy:
                            existingProof.uploadedBy

                    },

                    proofData: {

                        merkleRoot:
                            formattedMerkleRoot,

                        ipfsCID:
                            existingCID,

                        totalRecordsProcessed:
                            finalizedRecords.length,

                        indexRecordsStored:
                            indexRecordsStored,

                        storageStatus:
                            "Existing blockchain + IPFS proof reused",

                        blockchainReady:
                            true,

                        proofIndexReady:
                            proofIndexReady,

                        proofIndexError:
                            proofIndexError

                    }

                });
            }


            // =================================================
            // CASE B — NEW ROOT
            // =================================================

            console.log(
                "Merkle Root is not anchored yet."
            );


            console.log(
                "Creating new IPFS proof manifest..."
            );


            const ipfsPayload = {

                recordsWithHashes:
                    finalizedRecords,

                merkleRoot:
                    globalMerkleRoot,

                totalRecords:
                    finalizedRecords.length,

                generatedAt:
                    new Date().toISOString()

            };


            // =================================================
            // UPLOAD TO IPFS
            // =================================================

            console.log(
                "Uploading grade proof manifest to IPFS via Pinata..."
            );


            const ipfsCID =
                await uploadToIPFS(
                    ipfsPayload
                );


            console.log(
                "Successfully uploaded to IPFS."
            );


            console.log(
                "IPFS CID:",
                ipfsCID
            );


            // =================================================
            // ANCHOR
            // =================================================

            console.log(
                `Submitting anchoring transaction for Merkle Root: ${formattedMerkleRoot}`
            );


            const tx =
                await proofStorageContract.storeProof(
                    formattedMerkleRoot,
                    ipfsCID
                );


            console.log(
                `Transaction sent! Hash: ${tx.hash}. Waiting for block confirmation...`
            );


            const receipt =
                await tx.wait();


            console.log(
                "Transaction successfully anchored in block number:",
                receipt.blockNumber
            );


            // =================================================
            // STORE PROOF INDEX
            // =================================================

            const anchoredAt =
                new Date();


            let proofIndexReady =
                true;


            let proofIndexError =
                null;


            let indexRecordsStored =
                0;


            try {

                indexRecordsStored =
                    await upsertProofIndex(

                        finalizedRecords,

                        formattedMerkleRoot,

                        ipfsCID,

                        anchoredAt

                    );


                console.log(
                    `Proof lookup index updated for ${indexRecordsStored} record(s).`
                );

            } catch (indexError) {

                proofIndexReady =
                    false;


                proofIndexError =
                    indexError.message;


                console.error(
                    "Blockchain anchor succeeded, but Proof Index update failed:",
                    indexError.message
                );

            }


            return res.status(200).json({

                success:
                    true,

                message:
                    "Cryptographic layer proofs successfully minted and permanently anchored to blockchain ledger.",

                reusedExistingProof:
                    false,

                blockchainTx: {

                    transactionHash:
                        tx.hash,

                    blockNumber:
                        receipt.blockNumber,

                    contractAddress:
                        CONTRACT_ADDRESS,

                    anchoredBy:
                        receipt.from

                },

                proofData: {

                    merkleRoot:
                        globalMerkleRoot,

                    ipfsCID:
                        ipfsCID,

                    totalRecordsProcessed:
                        finalizedRecords.length,

                    indexRecordsStored:
                        indexRecordsStored,

                    storageStatus:
                        "Decentralized IPFS Immutable Storage Layer Confirmed",

                    blockchainReady:
                        true,

                    proofIndexReady:
                        proofIndexReady,

                    proofIndexError:
                        proofIndexError

                }

            });

        } catch (error) {

            console.error(
                "Pipeline failure in integrated backend generation:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Internal server processing failure or blockchain anchoring rejection.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// GET LATEST ANCHORED PROOF
// =====================================================

exports.getLatestProof =
    async (req, res) => {

        try {

            console.log(
                "Reading latest anchored proof from blockchain event..."
            );


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );


            const filter =
                proofStorageContract.filters.ProofAnchored();


            const events =
                await proofStorageContract.queryFilter(
                    filter,
                    0,
                    "latest"
                );


            if (
                !events ||
                events.length === 0
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "No latest anchored proof is available."

                });

            }


            const latestEvent =
                events[
                    events.length - 1
                ];


            const eventArgs =
                latestEvent.args;


            const merkleRoot =
                eventArgs?.merkleRoot ||
                eventArgs?.[0];


            const ipfsCID =
                eventArgs?.ipfsCID ||
                eventArgs?.[1];


            const uploadedBy =
                eventArgs?.uploadedBy ||
                eventArgs?.[2];


            if (
                !merkleRoot ||
                !ipfsCID
            ) {

                throw new Error(
                    "Latest ProofAnchored event did not contain a Merkle Root and IPFS CID."
                );
            }


            let timestamp =
                null;


            try {

                const block =
                    await provider.getBlock(
                        latestEvent.blockNumber
                    );


                if (block) {

                    timestamp =
                        block.timestamp;

                }

            } catch (timestampError) {

                console.warn(
                    "Unable to read anchor block timestamp:",
                    timestampError.message
                );

            }


            return res.status(200).json({

                success:
                    true,

                proof: {

                    merkleRoot:
                        merkleRoot,

                    ipfsCID:
                        ipfsCID,

                    timestamp:
                        timestamp !== null
                            ? timestamp.toString()
                            : null,

                    uploadedBy:
                        uploadedBy,

                    blockNumber:
                        latestEvent.blockNumber,

                    transactionHash:
                        latestEvent.transactionHash

                }

            });

        } catch (error) {

            console.error(
                "Latest blockchain proof error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to retrieve the latest anchored proof.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// GET PROOF HISTORY
// =====================================================
//
// GET /proof/history
//
// Reads ProofAnchored events directly from blockchain.
//
// The smart contract does not need to be modified because
// ProofAnchored is already emitted for every anchor.
//
// =====================================================

exports.getProofHistory =
    async (req, res) => {

        try {

            console.log(
                "Reading blockchain proof history..."
            );


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            const proofStorageContract =
                await getReadOnlyProofStorageContract(
                    provider
                );


            const filter =
                proofStorageContract.filters.ProofAnchored();


            const events =
                await proofStorageContract.queryFilter(
                    filter,
                    0,
                    "latest"
                );


            if (
                !events ||
                events.length === 0
            ) {

                return res.status(200).json({

                    success:
                        true,

                    history:
                        [],

                    totalAnchors:
                        0

                });

            }


            const history =
                [];


            for (
                const event
                of events
            ) {

                const args =
                    event.args;


                const merkleRoot =
                    args?.merkleRoot ||
                    args?.[0];


                const ipfsCID =
                    args?.ipfsCID ||
                    args?.[1];


                const uploadedBy =
                    args?.uploadedBy ||
                    args?.[2];


                let blockTimestamp =
                    null;


                try {

                    const block =
                        await provider.getBlock(
                            event.blockNumber
                        );


                    if (
                        block
                    ) {

                        blockTimestamp =
                            block.timestamp;

                    }

                } catch (
                    timestampError
                ) {

                    console.warn(
                        "Unable to read history block timestamp:",
                        timestampError.message
                    );

                }


                let recordCount =
                    null;


                try {

                    const ipfsData =
                        await getFromIPFS(
                            ipfsCID
                        );


                    if (
                        ipfsData &&
                        Array.isArray(
                            ipfsData.recordsWithHashes
                        )
                    ) {

                        recordCount =
                            ipfsData.recordsWithHashes.length;

                    }

                } catch (
                    ipfsError
                ) {

                    console.warn(
                        `Unable to count records for historical CID ${ipfsCID}:`,
                        ipfsError.message
                    );

                }


                history.push({

                    merkleRoot,

                    ipfsCID,

                    uploadedBy,

                    blockNumber:
                        event.blockNumber,

                    transactionHash:
                        event.transactionHash,

                    timestamp:
                        blockTimestamp !== null
                            ? blockTimestamp.toString()
                            : null,

                    recordCount

                });

            }


            // Newest first.
            history.reverse();


            return res.status(200).json({

                success:
                    true,

                history,

                totalAnchors:
                    history.length

            });

        } catch (error) {

            console.error(
                "Proof history error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to retrieve blockchain proof history.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// VERIFY LATEST ANCHOR INTEGRITY
// =====================================================
//
// GET /proof/integrity
//
// Finds the latest ProofAnchored event and performs a
// real consistency check against blockchain, IPFS,
// SHA-256 record hashes, Merkle Root and MongoDB proof index.
//
// =====================================================

exports.verifyLatestAnchor =
    async (req, res) => {

        try {

            console.log(
                "Verifying latest anchor integrity..."
            );


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            const proofStorageContract =
                await getReadOnlyProofStorageContract(
                    provider
                );


            const filter =
                proofStorageContract.filters.ProofAnchored();


            const events =
                await proofStorageContract.queryFilter(
                    filter,
                    0,
                    "latest"
                );


            if (
                !events ||
                events.length === 0
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "No anchored proof is available to verify."

                });

            }


            const latestEvent =
                events[
                    events.length - 1
                ];


            const merkleRoot =
                latestEvent.args?.merkleRoot ||
                latestEvent.args?.[0];


            const result =
                await performAnchorIntegrityCheck(
                    merkleRoot
                );


            return res.status(
                result.verified
                    ? 200
                    : 409
            ).json({

                success:
                    true,

                verified:
                    result.verified,

                verification:
                    result,

                blockchainEvent: {

                    blockNumber:
                        latestEvent.blockNumber,

                    transactionHash:
                        latestEvent.transactionHash

                }

            });

        } catch (error) {

            console.error(
                "Latest anchor integrity error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to verify latest anchor integrity.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// VERIFY SPECIFIC ANCHOR
// =====================================================
//
// GET /proof/integrity/:merkleRoot
//
// =====================================================

exports.verifyAnchorByRoot =
    async (req, res) => {

        try {

            let {
                merkleRoot
            } =
                req.params;


            if (
                !merkleRoot.startsWith("0x")
            ) {

                merkleRoot =
                    `0x${merkleRoot}`;
            }


            if (
                !/^0x[a-fA-F0-9]{64}$/.test(
                    merkleRoot
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid Merkle Root format."

                });

            }


            const result =
                await performAnchorIntegrityCheck(
                    merkleRoot
                );


            return res.status(
                result.verified
                    ? 200
                    : 409
            ).json({

                success:
                    true,

                verified:
                    result.verified,

                verification:
                    result

            });

        } catch (error) {

            console.error(
                "Anchor integrity error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to verify anchor integrity.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// GET CANDIDATE + MODULE PROOF CONTEXT
// =====================================================

exports.getRecordProofContext =
    async (req, res) => {

        try {

            const {
                candidateId,
                moduleCode
            } =
                req.params;


            if (
                !candidateId ||
                !moduleCode
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Candidate ID and module code are required."

                });
            }


            const normalizedCandidateId =
                candidateId.trim();


            const normalizedModuleCode =
                moduleCode.trim();


            const indexEntry =
                await ResultProofIndex
                    .findOne({

                        candidateId:
                            normalizedCandidateId,

                        moduleCode:
                            normalizedModuleCode

                    })
                    .sort({

                        anchoredAt:
                            -1

                    })
                    .lean();


            if (
                !indexEntry
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "No anchored proof index found for this candidate and module.",

                    candidateId:
                        normalizedCandidateId,

                    moduleCode:
                        normalizedModuleCode

                });
            }


            return res.status(200).json({

                success:
                    true,

                record: {

                    candidateId:
                        indexEntry.candidateId,

                    moduleCode:
                        indexEntry.moduleCode,

                    merkleRoot:
                        indexEntry.merkleRoot,

                    ipfsCID:
                        indexEntry.ipfsCID,

                    anchoredAt:
                        indexEntry.anchoredAt

                }

            });

        } catch (error) {

            console.error(
                "Proof index lookup error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to retrieve the anchored proof lookup.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// GET ANCHORED PROOF BY ROOT
// =====================================================

exports.getAnchoredProof =
    async (req, res) => {

        try {

            let {
                merkleRoot
            } =
                req.params;


            if (
                !merkleRoot.startsWith("0x")
            ) {

                merkleRoot =
                    `0x${merkleRoot}`;
            }


            if (
                !/^0x[a-fA-F0-9]{64}$/.test(
                    merkleRoot
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid Merkle Root format."

                });
            }


            console.log(
                "Reading proof from blockchain..."
            );


            console.log(
                "Merkle Root:",
                merkleRoot
            );


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );


            const proof =
                await proofStorageContract.getProof(
                    merkleRoot
                );


            return res.status(200).json({

                success:
                    true,

                proof: {

                    merkleRoot:
                        merkleRoot,

                    ipfsCID:
                        proof[0],

                    timestamp:
                        proof[1].toString(),

                    uploadedBy:
                        proof[2]

                }

            });

        } catch (error) {

            console.error(
                "Blockchain read error:",
                error
            );


            return res.status(404).json({

                success:
                    false,

                message:
                    "No blockchain proof found for this Merkle Root.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// GET FINALIZED PROOF DATA FROM IPFS
// =====================================================

exports.getProofData =
    async (req, res) => {

        try {

            let {
                merkleRoot
            } =
                req.params;


            if (
                !merkleRoot.startsWith("0x")
            ) {

                merkleRoot =
                    `0x${merkleRoot}`;
            }


            if (
                !/^0x[a-fA-F0-9]{64}$/.test(
                    merkleRoot
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid Merkle Root format."

                });
            }


            console.log(
                "Retrieving finalized proof data..."
            );


            console.log(
                "Requested Merkle Root:",
                merkleRoot
            );


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );


            const proof =
                await proofStorageContract.getProof(
                    merkleRoot
                );


            const ipfsCID =
                proof[0];

            const timestamp =
                proof[1];

            const uploadedBy =
                proof[2];


            // =================================================
            // RETRIEVE IPFS DATA
            // =================================================

            const ipfsData =
                await getFromIPFS(
                    ipfsCID
                );


            if (
                !ipfsData ||
                !ipfsData.merkleRoot
            ) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "IPFS data does not contain a Merkle Root."

                });
            }


            let normalizedIPFSRoot =
                ipfsData.merkleRoot;


            if (
                !normalizedIPFSRoot.startsWith(
                    "0x"
                )
            ) {

                normalizedIPFSRoot =
                    `0x${normalizedIPFSRoot}`;
            }


            if (
                normalizedIPFSRoot.toLowerCase() !==
                merkleRoot.toLowerCase()
            ) {

                return res.status(409).json({

                    success:
                        false,

                    message:
                        "IPFS data does not match the blockchain Merkle Root.",

                    blockchainMerkleRoot:
                        merkleRoot,

                    ipfsMerkleRoot:
                        normalizedIPFSRoot

                });
            }


            if (
                !Array.isArray(
                    ipfsData.recordsWithHashes
                )
            ) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "IPFS dataset does not contain a valid finalized record list."

                });
            }


            return res.status(200).json({

                success:
                    true,

                verificationSource: {

                    blockchain: {

                        merkleRoot:
                            merkleRoot,

                        ipfsCID:
                            ipfsCID,

                        timestamp:
                            timestamp.toString(),

                        uploadedBy:
                            uploadedBy

                    }

                },

                data:
                    ipfsData

            });

        } catch (error) {

            console.error(
                "Finalized proof data retrieval error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to retrieve finalized proof data from IPFS.",

                error:
                    error.message

            });

        }

    };


// =====================================================
// GET STUDENT MERKLE PROOF
// =====================================================

exports.getStudentMerkleProof =
    async (req, res) => {

        try {

            const {
                merkleRoot,
                candidateId,
                moduleCode
            } =
                req.body;


            if (
                !merkleRoot ||
                !candidateId ||
                !moduleCode
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "merkleRoot, candidateId and moduleCode are required."

                });
            }


            let formattedMerkleRoot =
                merkleRoot;


            if (
                !formattedMerkleRoot.startsWith("0x")
            ) {

                formattedMerkleRoot =
                    `0x${formattedMerkleRoot}`;
            }


            if (
                !/^0x[a-fA-F0-9]{64}$/.test(
                    formattedMerkleRoot
                )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "Invalid Merkle Root format."

                });
            }


            console.log(
                "Generating student Merkle proof..."
            );


            console.log(
                "Candidate ID:",
                candidateId
            );


            console.log(
                "Module Code:",
                moduleCode
            );


            console.log(
                "Merkle Root:",
                formattedMerkleRoot
            );


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                createBlockchainProvider();


            const contractCode =
                await provider.getCode(
                    CONTRACT_ADDRESS
                );


            if (
                contractCode === "0x"
            ) {

                throw new Error(
                    `No smart contract deployed at ${CONTRACT_ADDRESS} on ${BLOCKCHAIN_RPC_URL}`
                );
            }


            const proofStorageContract =
                new ethers.Contract(
                    CONTRACT_ADDRESS,
                    CONTRACT_ABI,
                    provider
                );


            // =================================================
            // GET CID FROM BLOCKCHAIN
            // =================================================

            const blockchainProof =
                await proofStorageContract.getProof(
                    formattedMerkleRoot
                );


            const ipfsCID =
                blockchainProof[0];


            // =================================================
            // GET FINALIZED DATA FROM IPFS
            // =================================================

            const ipfsData =
                await getFromIPFS(
                    ipfsCID
                );


            if (
                !ipfsData ||
                !Array.isArray(
                    ipfsData.recordsWithHashes
                )
            ) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "IPFS dataset does not contain valid finalized records."

                });
            }


            // =================================================
            // VERIFY IPFS ROOT == BLOCKCHAIN ROOT
            // =================================================

            let ipfsRoot =
                ipfsData.merkleRoot;


            if (
                !ipfsRoot.startsWith("0x")
            ) {

                ipfsRoot =
                    `0x${ipfsRoot}`;
            }


            if (
                ipfsRoot.toLowerCase() !==
                formattedMerkleRoot.toLowerCase()
            ) {

                return res.status(409).json({

                    success:
                        false,

                    message:
                        "IPFS Merkle Root does not match blockchain Merkle Root.",

                    blockchainMerkleRoot:
                        formattedMerkleRoot,

                    ipfsMerkleRoot:
                        ipfsRoot

                });
            }


            // =================================================
            // FIND TARGET RECORD
            // =================================================

            const recordIndex =
                ipfsData.recordsWithHashes.findIndex(

                    (record) =>

                        record.candidateId ===
                            candidateId &&

                        record.moduleCode ===
                            moduleCode

                );


            if (
                recordIndex === -1
            ) {

                return res.status(404).json({

                    success:
                        false,

                    message:
                        "Student/module record not found in finalized dataset.",

                    candidateId,

                    moduleCode

                });
            }


            // =================================================
            // EXTRACT LEAF HASHES
            // =================================================

            const leafHashes =
                ipfsData.recordsWithHashes.map(
                    (record) =>
                        record.hash
                );


            // =================================================
            // BUILD PROOF
            // =================================================

            const proof =
                getMerkleProof(
                    leafHashes,
                    recordIndex
                );


            const targetRecord =
                ipfsData.recordsWithHashes[
                    recordIndex
                ];


            // =================================================
            // VERIFY PROOF
            // =================================================

            const proofIsValid =
                verifyMerkleProof(
                    targetRecord.hash,
                    proof,
                    ipfsData.merkleRoot
                );


            if (
                !proofIsValid
            ) {

                return res.status(500).json({

                    success:
                        false,

                    message:
                        "Generated Merkle proof could not be verified against the official Merkle Root."

                });
            }


            return res.status(200).json({

                success:
                    true,

                merkleRoot:
                    formattedMerkleRoot,

                ipfsCID:
                    ipfsCID,

                record: {

                    candidateId:
                        targetRecord.candidateId,

                    moduleCode:
                        targetRecord.moduleCode,

                    marks:
                        targetRecord.marks,

                    grade:
                        targetRecord.grade,

                    version:
                        targetRecord.version,

                    hash:
                        targetRecord.hash

                },

                leafIndex:
                    recordIndex,

                proof:
                    proof,

                proofVerified:
                    true

            });

        } catch (error) {

            console.error(
                "Student Merkle proof error:",
                error
            );


            return res.status(500).json({

                success:
                    false,

                message:
                    "Unable to generate Merkle proof.",

                error:
                    error.message

            });

        }

    };