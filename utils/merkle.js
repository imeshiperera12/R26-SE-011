const crypto = require("crypto");

function hash(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
}

function buildMerkleTree(hashes) {
    if (hashes.length === 1) {
        return hashes[0];
    }

    const newLevel = [];

    for (let i = 0; i < hashes.length; i += 2) {
        if (i + 1 < hashes.length) {
            newLevel.push(hash(hashes[i] + hashes[i + 1]));
        } else {
            // if odd number, duplicate last
            newLevel.push(hash(hashes[i] + hashes[i]));
        }
    }

    return buildMerkleTree(newLevel);
}

module.exports = { buildMerkleTree };