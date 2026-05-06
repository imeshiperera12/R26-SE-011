require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const { generateHash } = require("./utils/hash");
const { buildMerkleTree } = require("./utils/merkle");
const { uploadToIPFS } = require("./utils/ipfs");

const app = express();

app.use(express.static("public"));

app.get("/generate-proof", async (req, res) => {
  try {
    const records = JSON.parse(
      fs.readFileSync("./data/results.json", "utf-8")
    );

    // Step 1: hash each record
    const hashes = records.map(generateHash);

    // Step 2: build Merkle tree and get root
    const root = buildMerkleTree(hashes);

    // Step 3: upload to IPFS
    const cid = await uploadToIPFS({ records, merkleRoot: root });

    res.json({
      success: true,
      merkleRoot: root,
      cid: cid,
      records: records
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});