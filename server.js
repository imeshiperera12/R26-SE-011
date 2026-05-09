require("dotenv").config();

const express = require("express");
const path = require("path");

const { generateHash } = require("./utils/hash");
const { buildMerkleTree } = require("./utils/merkle");
const { uploadToIPFS } = require("./utils/ipfs");

const app = express();

app.use(express.json());
app.use(express.static("public"));

// POST /generate-proof — accepts records from the frontend
app.post("/generate-proof", async (req, res) => {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: "No records provided" });
    }

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
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});