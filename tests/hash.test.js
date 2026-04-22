const { generateHash } = require("../utils/hash");

const record = { id: 1, grade: "A" };

console.log("Hash:", generateHash(record));