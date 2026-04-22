const { generateHash } = require("../utils/hash");
const { buildMerkleTree } = require("../utils/merkle");

const records = [
    { id: 1, grade: "A" },
    { id: 2, grade: "B" },
    { id: 3, grade: "C" },
    { id: 4, grade: "D" }
];

// Step 1: generate hashes
const hashes = records.map(generateHash);

// Step 2: build Merkle root
const root = buildMerkleTree(hashes);

console.log("Merkle Root:", root);