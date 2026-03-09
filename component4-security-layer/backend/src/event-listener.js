"use strict";

/**
 * event-listener.js
 * Blockchain event listener — monitors GradeVerifier contract events
 * and persists them for the verification portal.
 */

const { ethers } = require("ethers");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const GRADE_VERIFIER_ABI = [
  "event ProofVerified(address indexed submitter, bool indexed result, uint256 timestamp)",
  "event VerificationKeyUpdated(address indexed updatedBy, uint256 timestamp)",
];

const {
  RPC_URL,
  CONTRACT_ADDRESS,
  START_BLOCK,
} = process.env;

if (!RPC_URL || !CONTRACT_ADDRESS) {
  throw new Error(
    "Missing required env vars: RPC_URL and CONTRACT_ADDRESS must be set in .env"
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  GRADE_VERIFIER_ABI,
  provider
);

/**
 * Handles a ProofVerified event.
 */
function onProofVerified(submitter, result, timestamp, event) {
  console.log("[ProofVerified]", {
    submitter,
    result,
    timestamp: new Date(Number(timestamp) * 1000).toISOString(),
    txHash: event.log.transactionHash,
    blockNumber: event.log.blockNumber,
  });
  // TODO: persist to database or emit via WebSocket
}

/**
 * Handles a VerificationKeyUpdated event.
 */
function onVerificationKeyUpdated(updatedBy, timestamp, event) {
  console.warn("[VerificationKeyUpdated]", {
    updatedBy,
    timestamp: new Date(Number(timestamp) * 1000).toISOString(),
    txHash: event.log.transactionHash,
  });
}

/**
 * Starts listening for contract events.
 */
async function startListening() {
  const network = await provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`Listening on contract: ${CONTRACT_ADDRESS}`);

  contract.on("ProofVerified", onProofVerified);
  contract.on("VerificationKeyUpdated", onVerificationKeyUpdated);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nRemoving listeners and shutting down...");
    contract.removeAllListeners();
    process.exit(0);
  });
}

startListening().catch((err) => {
  console.error("Event listener failed to start:", err);
  process.exit(1);
});
