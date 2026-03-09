"use strict";

/**
 * api-server.js
 * Express API server for the grade-verification portal.
 *
 * Endpoints:
 *   POST /api/proof/generate   — Generate a ZKP for a given grade
 *   POST /api/proof/verify     — Verify a submitted proof on-chain
 *   GET  /api/health           — Health check
 */

const express = require("express");
const { ethers } = require("ethers");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { generateProof, exportSolidityCalldata } = require("./proof-generator");

const app = express();
app.use(express.json());

// ----------------------------------------------------------------
// Rate limiting — prevent abuse
// ----------------------------------------------------------------
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ----------------------------------------------------------------
// Blockchain provider & contract
// ----------------------------------------------------------------
const GRADE_VERIFIER_ABI = [
  "function verifyProof(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[1] input) view returns (bool)",
];

// Provider and contract are created lazily — only when /api/proof/verify is called.
// This lets the server start without a running Ethereum node.
function getContract() {
  if (!process.env.RPC_URL || !process.env.CONTRACT_ADDRESS) {
    throw new Error("RPC_URL and CONTRACT_ADDRESS must be set in backend/.env to use on-chain verification");
  }
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  return new ethers.Contract(process.env.CONTRACT_ADDRESS, GRADE_VERIFIER_ABI, provider);
}

// ----------------------------------------------------------------
// Routes
// ----------------------------------------------------------------

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * POST /api/proof/generate
 * Body: { gradeValue: number|string }  // 0–5  OR  F/D/C/B/A/A+
 */
app.post("/api/proof/generate", async (req, res) => {
  const { gradeValue } = req.body;

  if (gradeValue === undefined) {
    return res.status(400).json({
      error: "Missing required field: gradeValue (0-5 or F/D/C/B/A/A+)",
    });
  }

  try {
    const { proof, publicSignals, gradeHash } = await generateProof({ gradeValue });
    const calldata = await exportSolidityCalldata(proof, publicSignals);
    return res.json({ proof, publicSignals, gradeHash, calldata });
  } catch (err) {
    if (err instanceof RangeError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Proof generation error:", err);
    return res.status(500).json({ error: "Proof generation failed" });
  }
});

/**
 * POST /api/proof/verify
 * Body: { proof: { a, b, c }, input: [gradeHash] }
 */
app.post("/api/proof/verify", async (req, res) => {
  const { proof, input } = req.body;

  if (!proof || !input || !Array.isArray(input) || input.length < 1) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const isValid = await getContract().verifyProof(proof, input);
    return res.json({ valid: isValid });
  } catch (err) {
    console.error("On-chain verification error:", err);
    return res.status(500).json({ error: "On-chain verification failed" });
  }
});

// ----------------------------------------------------------------
// Start server
// ----------------------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Verification API server running on port ${PORT}`);
});

module.exports = app; // export for testing
