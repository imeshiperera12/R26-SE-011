"use strict";

/**
 * trusted-setup.js
 * Automates the Groth16 trusted setup (Powers of Tau + Phase 2) using snarkjs.
 *
 * This script is a JS wrapper around the same steps in circuits/compile.sh,
 * useful for CI/CD pipelines on all platforms.
 *
 * Usage:
 *   node scripts/trusted-setup.js
 */

const snarkjs = require("snarkjs");
const fs      = require("fs");
const path    = require("path");

const BUILD_DIR   = path.resolve(__dirname, "../build/circuits");
const R1CS_PATH   = path.join(BUILD_DIR, "gradeVerifier.r1cs");
const PTAU_PATH   = path.join(BUILD_DIR, "pot12_final.ptau");
const ZKEY_0      = path.join(BUILD_DIR, "gradeVerifier_0000.zkey");
const ZKEY_FINAL  = path.join(BUILD_DIR, "gradeVerifier_final.zkey");
const VK_PATH     = path.join(BUILD_DIR, "verification_key.json");

async function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // --- Phase 1: Powers of Tau (12 = up to 2^12 = 4096 constraints) ---
  console.log("[1/4] Generating Powers of Tau...");
  await snarkjs.powersOfTau.newAccumulator(
    "bn128", 12,
    path.join(BUILD_DIR, "pot12_0000.ptau")
  );
  await snarkjs.powersOfTau.contribute(
    path.join(BUILD_DIR, "pot12_0000.ptau"),
    path.join(BUILD_DIR, "pot12_0001.ptau"),
    "First contribution",
    "random entropy from trusted-setup.js"
  );
  await snarkjs.powersOfTau.preparePhase2(
    path.join(BUILD_DIR, "pot12_0001.ptau"),
    PTAU_PATH
  );
  console.log("  Powers of Tau ready:", PTAU_PATH);

  // --- Phase 2: Circuit-specific setup ---
  console.log("[2/4] Setting up zkey (Phase 2)...");
  await snarkjs.zKey.newZKey(R1CS_PATH, PTAU_PATH, ZKEY_0);

  console.log("[3/4] Contributing to zkey...");
  await snarkjs.zKey.contribute(
    ZKEY_0, ZKEY_FINAL,
    "JS contribution",
    "more random entropy"
  );

  // --- Export verification key ---
  console.log("[4/4] Exporting verification key...");
  const vk = await snarkjs.zKey.exportVerificationKey(ZKEY_FINAL);
  fs.writeFileSync(VK_PATH, JSON.stringify(vk, null, 2));

  console.log("\nTrusted setup complete!");
  console.log("  zkey :", ZKEY_FINAL);
  console.log("  vk   :", VK_PATH);
  console.log("\nNEXT: run `snarkjs zkey export solidityverifier` to regenerate GradeVerifier.sol");
}

main().catch((err) => {
  console.error("Trusted setup failed:", err);
  process.exitCode = 1;
});
