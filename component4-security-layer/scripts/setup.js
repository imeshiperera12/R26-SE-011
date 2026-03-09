"use strict";

/**
 * setup.js
 * ─────────────────────────────────────────────────────────────────────────
 * ONE-TIME SETUP — Run this before generateProof.js
 *
 * Steps:
 *   1. Compile gradeVerifier.circom  → .r1cs + .wasm
 *   2. Powers of Tau ceremony        → trusted randomness
 *   3. Groth16 Phase 2 setup         → circuit-specific zkey
 *   4. Contribute entropy            → final.zkey
 *   5. Export verification key       → verification_key.json
 *
 * Usage:
 *   node scripts/setup.js
 */

const { execSync }        = require("child_process");
const snarkjs             = require("snarkjs");
const { getCurveFromName }= require("ffjavascript");
const path                = require("path");
const fs                  = require("fs");

// ── Paths ────────────────────────────────────────────────────────────────
const ROOT         = path.resolve(__dirname, "..");
const BUILD_DIR    = path.join(ROOT, "build");
const CIRCUIT_FILE = path.join(ROOT, "circuits", "gradeVerifier.circom");
const NODE_MODULES = path.join(ROOT, "node_modules");

const PTAU_0       = path.join(BUILD_DIR, "pot12_0000.ptau");
const PTAU_1       = path.join(BUILD_DIR, "pot12_0001.ptau");
const PTAU_FINAL   = path.join(BUILD_DIR, "pot12_final.ptau");
const R1CS         = path.join(BUILD_DIR, "gradeVerifier.r1cs");
const ZKEY_0       = path.join(BUILD_DIR, "gradeVerifier_0000.zkey");
const ZKEY_FINAL   = path.join(BUILD_DIR, "gradeVerifier_final.zkey");
const VK_PATH      = path.join(BUILD_DIR, "verification_key.json");

// ── Find the circom binary ────────────────────────────────────────────────
function findCircom() {
  const candidates = [
    "circom",
    path.join(process.env.USERPROFILE || "", ".cargo", "bin", "circom.exe"),
    path.join(process.env.HOME        || "", ".cargo", "bin", "circom"),
  ];
  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { stdio: "pipe" });
      return c;
    } catch { /* try next */ }
  }
  throw new Error(
    "circom binary not found.\n" +
    "  Download from: https://github.com/iden3/circom/releases\n" +
    "  Place circom.exe in your PATH or %USERPROFILE%\\.cargo\\bin\\"
  );
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     ZKP Grade Verifier — One-Time Trusted Setup          ║");
  console.log("║     Research Component 4 · Susara Perera IT22276346      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // ── Step 1: Compile circuit ─────────────────────────────────────────
  console.log("[ 1 / 5 ]  Compiling gradeVerifier.circom ...");
  const circom = findCircom();
  execSync(
    `"${circom}" "${CIRCUIT_FILE}" --r1cs --wasm --sym -l "${NODE_MODULES}" -o "${BUILD_DIR}"`,
    { stdio: "inherit" }
  );
  console.log("           ✓ Circuit compiled  →  build/gradeVerifier.r1cs\n");

  // ── Step 2: Powers of Tau (Phase 1) ─────────────────────────────────
  console.log("[ 2 / 5 ]  Generating Powers of Tau  (BN128, 2^12 constraints) ...");
  const curve = await getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(curve, 12, PTAU_0);
  await snarkjs.powersOfTau.contribute(
    PTAU_0, PTAU_1,
    "Prototype Contribution",
    "GradeVerifier-SLIIT-IT22276346-2026-entropy"
  );
  await snarkjs.powersOfTau.preparePhase2(PTAU_1, PTAU_FINAL);
  await curve.terminate();
  console.log("           ✓ Powers of Tau ready  →  build/pot12_final.ptau\n");

  // ── Step 3: Groth16 Phase 2 setup ───────────────────────────────────
  console.log("[ 3 / 5 ]  Groth16 Phase 2 setup ...");
  await snarkjs.zKey.newZKey(R1CS, PTAU_FINAL, ZKEY_0);
  console.log("           ✓ Initial zkey  →  build/gradeVerifier_0000.zkey\n");

  // ── Step 4: Contribute entropy ──────────────────────────────────────
  console.log("[ 4 / 5 ]  Contributing entropy to zkey ...");
  await snarkjs.zKey.contribute(
    ZKEY_0, ZKEY_FINAL,
    "Susara Perera SLIIT",
    "second-entropy-contribution-2026-SLIIT-RP"
  );
  console.log("           ✓ Final zkey  →  build/gradeVerifier_final.zkey\n");

  // ── Step 5: Export verification key ─────────────────────────────────
  console.log("[ 5 / 5 ]  Exporting verification key ...");
  const vk = await snarkjs.zKey.exportVerificationKey(ZKEY_FINAL);
  fs.writeFileSync(VK_PATH, JSON.stringify(vk, null, 2));
  console.log("           ✓ Verification key  →  build/verification_key.json\n");

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════════════════");
  console.log("  ✅  Setup complete!  Artifacts generated in build/");
  console.log();
  console.log("     build/gradeVerifier.r1cs              circuit constraints");
  console.log("     build/gradeVerifier_js/*.wasm          witness generator");
  console.log("     build/gradeVerifier_final.zkey         proving key");
  console.log("     build/verification_key.json            verifying key");
  console.log();
  console.log("  Next steps:");
  console.log("     npm run generate    →  generate ZKP proof from grade");
  console.log("     npm run verify      →  verify the proof");
  console.log("══════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n❌  Setup failed:", err.message);
  process.exit(1);
});
