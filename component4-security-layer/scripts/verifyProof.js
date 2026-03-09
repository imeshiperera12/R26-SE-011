"use strict";

/**
 * verifyProof.js
 * ─────────────────────────────────────────────────────────────────────────
 * Verifies the Groth16 ZK proof using the verification key.
 * Simulates what an EMPLOYER or INSTITUTION does when checking a grade.
 *
 * The verifier:
 *   ✓ Can confirm the grade hash is valid
 *   ✗ Cannot learn the actual grade
 *
 * Usage:
 *   node scripts/verifyProof.js
 *
 * Prerequisites:
 *   node scripts/setup.js        (once)
 *   node scripts/generateProof.js
 */

const snarkjs = require("snarkjs");
const path    = require("path");
const fs      = require("fs");

// ── Paths ────────────────────────────────────────────────────────────────
const ROOT        = path.resolve(__dirname, "..");
const BUILD_DIR   = path.join(ROOT, "build");
const OUTPUT_DIR  = path.join(ROOT, "proof-output");
const VK_PATH     = path.join(BUILD_DIR, "verification_key.json");
const PROOF_PATH  = path.join(OUTPUT_DIR, "proof.json");
const PUBLIC_PATH = path.join(OUTPUT_DIR, "public.json");
const SUMMARY_PATH= path.join(OUTPUT_DIR, "proof-summary.json");

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     ZKP Grade Verifier — Verify Proof                    ║");
  console.log("║     Simulating: Employer / Institution Verification       ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // ── Check all required files exist ──────────────────────────────────
  const required = [
    ["Verification key", VK_PATH,     "npm run setup"],
    ["Proof",            PROOF_PATH,  "npm run generate"],
    ["Public signals",   PUBLIC_PATH, "npm run generate"],
  ];
  for (const [label, p, hint] of required) {
    if (!fs.existsSync(p)) {
      console.error(`❌  ${label} not found:\n    ${p}`);
      console.error(`    Run first:  ${hint}\n`);
      process.exit(1);
    }
  }

  // ── Load files ───────────────────────────────────────────────────────
  const vk            = JSON.parse(fs.readFileSync(VK_PATH,     "utf8"));
  const proof         = JSON.parse(fs.readFileSync(PROOF_PATH,  "utf8"));
  const publicSignals = JSON.parse(fs.readFileSync(PUBLIC_PATH, "utf8"));

  // ── Show verifier context (what the employer sees) ───────────────────
  if (fs.existsSync(SUMMARY_PATH)) {
    const s = JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8"));
    console.log("  📋  VERIFICATION REQUEST  (received by employer)");
    console.log("  ┌─────────────────────────────────────────────────────┐");
    console.log(`  │  Student ID  : ${s.studentId.padEnd(37)}│`);
    console.log(`  │  Name        : ${s.name.padEnd(37)}│`);
    console.log(`  │  Course      : ${(s.course + " — " + s.courseName).padEnd(37)}│`);
    console.log(`  │  Grade Hash  : ${s.gradeHash.substring(0, 37).padEnd(37)}│`);
    console.log(`  │              : ${s.gradeHash.substring(37).padEnd(37)}│`);
    console.log(`  │  Generated   : ${s.proofGeneratedAt.padEnd(37)}│`);
    console.log("  └─────────────────────────────────────────────────────┘");
    console.log();
    console.log("  ⚠️   The employer does NOT know the actual grade.");
    console.log("       They only have the hash and the ZKP proof.");
    console.log();
  }

  // ── Verify the proof ─────────────────────────────────────────────────
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  Verifying Groth16 proof against verification key ...");
  console.log();

  const isValid = await snarkjs.groth16.verify(vk, publicSignals, proof);

  // ── Result ───────────────────────────────────────────────────────────
  if (isValid) {
    console.log("  ╔══════════════════════════════════════════════════════╗");
    console.log("  ║                                                      ║");
    console.log("  ║   ✅   PROOF VALID                                   ║");
    console.log("  ║                                                      ║");
    console.log("  ║   The grade hash matches the cryptographic proof.    ║");
    console.log("  ║   The student's grade claim is VERIFIED.             ║");
    console.log("  ║                                                      ║");
    console.log("  ╚══════════════════════════════════════════════════════╝");
    console.log();
    console.log("  🔐  ZERO-KNOWLEDGE PROPERTY MAINTAINED:");
    console.log();
    console.log("     ✓  The grade is VERIFIED");
    console.log("     ✗  The actual grade was NEVER revealed to the employer");
    console.log("     ✓  No private data was leaked during verification");
    console.log("     ✓  Proof is mathematically sound — cannot be faked");
    console.log();
    console.log("  This is the core contribution of Component 4:");
    console.log("  Privacy-preserving grade verification on the blockchain.");
  } else {
    console.log("  ╔══════════════════════════════════════════════════════╗");
    console.log("  ║                                                      ║");
    console.log("  ║   ❌   PROOF INVALID                                 ║");
    console.log("  ║                                                      ║");
    console.log("  ║   The proof does not match the verification key.     ║");
    console.log("  ║   Grade claim REJECTED.                              ║");
    console.log("  ║                                                      ║");
    console.log("  ╚══════════════════════════════════════════════════════╝");
    console.log();
    console.log("  Possible causes:");
    console.log("  • Proof was tampered with");
    console.log("  • Proof was generated with a different circuit/zkey");
    console.log("  • Public signals do not match the proof");
  }

  console.log("\n══════════════════════════════════════════════════════════\n");
  process.exit(isValid ? 0 : 1);
}

main().catch(err => {
  console.error("\n❌  Verification error:", err.message);
  process.exit(1);
});
