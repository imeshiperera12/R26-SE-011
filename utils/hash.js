const crypto = require("crypto");

function generateHash(data) {
    const stringData = JSON.stringify(data);
    return crypto.createHash("sha256").update(stringData).digest("hex");
}

module.exports = { generateHash };