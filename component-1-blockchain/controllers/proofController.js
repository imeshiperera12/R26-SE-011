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
// PRODUCTION:
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


        const serialized =
            JSON.stringify(
                error
            );


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

async function upsertProofIndex(
    finalizedRecords,
    merkleRoot,
    ipfsCID,
    anchoredAt
) {

    let storedCount = 0;


    for (
        const record
        of finalizedRecords
    ) {

        await ResultProofIndex.updateOne(

            {
                candidateId:
                    record.candidateId,

                moduleCode:
                    record.moduleCode
            },

            {

                $set: {

                    merkleRoot:
                        merkleRoot,

                    ipfsCID:
                        ipfsCID,

                    anchoredAt:
                        anchoredAt
                },

                $setOnInsert: {

                    candidateId:
                        record.candidateId,

                    moduleCode:
                        record.moduleCode
                }

            },

            {
                upsert: true
            }
        );


        storedCount++;
    }


    return storedCount;
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
            } = req.body;


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


            if (!CONTRACT_ADDRESS) {

                throw new Error(
                    "CONTRACT_ADDRESS is missing from environment variables."
                );
            }


            const provider =
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


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
                    await provider.getSigner(0);

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
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


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
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


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
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


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
                new ethers.JsonRpcProvider(
                    BLOCKCHAIN_RPC_URL
                );


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