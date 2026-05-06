const { generateHash } = require("../utils/hash");
const { buildMerkleTree } = require("../utils/merkle");
const { uploadToIPFS } = require("../utils/ipfs");

// Step 1: sample data
const records = [
    { id: 1, grade: "A" },
    { id: 2, grade: "B" },
    { id: 3, grade: "C" }
];

// Step 2: generate hashes
const hashes = records.map(generateHash);

// Step 3: generate Merkle Root
const merkleRoot = buildMerkleTree(hashes);

// Step 4: combine data
const finalData = {
    records,
    merkleRoot
};

// Step 5: upload to IPFS
async function run() {
    console.log("Merkle Root:", merkleRoot);

    const cid = await uploadToIPFS(finalData);

    console.log("CID:", cid);
}

run();
