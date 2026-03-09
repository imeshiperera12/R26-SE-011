"use strict";

/**
 * generateProof.js
 * ─────────────────────────────────────────────────────────────────────────
 * Reads dummy grade data, computes a Poseidon hash of the grade, and
 * generates a Groth16 Zero-Knowledge Proof.
 *
 * What this demonstrates:
 *   • The actual grade (e.g. "A") is a PRIVATE input — never exposed.
 *   • The gradeHash is PUBLIC — this is what gets stored on the blockchain.
 *   • The ZK proof lets any verifier confirm the hash is correct without
 *     ever learning the underlying grade.
 *
 * Usage:
 *   node scripts/generateProof.js
 *
 * Prerequisites:
 *   node scripts/setup.js   (run once to compile circuit + trusted setup)
 */

const snarkjs            = require("snarkjs");
const { buildPoseidon }  = require("circomlibjs");
const path               = require("path");
const fs                 = require("fs");

// ── Paths ────────────────────────────────────────────────────────────────
const ROOT         = path.resolve(__dirname, "..");
const BUILD_DIR    = path.join(ROOT, "build");
const OUTPUT_DIR   = path.join(ROOT, "proof-output");
const WASM_PATH    = path.join(BUILD_DIR, "gradeVerifier_js", "gradeVerifier.wasm");
const ZKEY_PATH    = path.join(BUILD_DIR, "gradeVerifier_final.zkey");
const GRADES_PATH  = path.join(ROOT, "dummy-data", "grades.json");

// ── Grade letter → circuit numeric value ─────────────────────────────────
// The circuit works with integers; we map letter grades before hashing.
const GRADE_MAP = { "F": 0, "D": 1, "C": 2, "B": 3, "A": 4, "A+": 5 };

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     ZKP Grade Verifier — Generate Proof                  ║");
  console.log("║     Research Component 4 · Susara Perera IT22276346      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // ── Check circuit artifacts exist ──────────────────────────────────
  if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
    console.error("❌  Circuit artifacts not found.");
    console.error("    Run the one-time setup first:\n");
    console.error("      npm run setup\n");
    process.exit(1);
  }

  // ── Load dummy grade data ───────────────────────────────────────────
  const data = JSON.parse(fs.readFileSync(GRADES_PATH, "utf8"));
  const { studentId, name, course, courseName, grade, semester, academicYear } = data;

  console.log("  📋  STUDENT RECORD  (Dummy Data — IT22276346)");
  console.log("  ┌─────────────────────────────────────────────────────┐");
  console.log(`  │  Student ID    : ${studentId.padEnd(36)}│`);
  console.log(`  │  Name          : ${name.padEnd(36)}│`);
  console.log(`  │  Course        : ${(course + " — " + courseName).padEnd(36)}│`);
  console.log(`  │  Semester      : ${(semester + ", " + academicYear).padEnd(36)}│`);
  console.log(`  │  Grade (PRIVATE): ${grade.padEnd(35)}│`);
  console.log("  └─────────────────────────────────────────────────────┘");
  console.log();
  console.log("  ⚠️   The grade above is a PRIVATE input.");
  console.log("       It will NOT appear in the proof or public signals.");
  console.log();

  // ── Map grade letter → numeric value ────────────────────────────────
  const gradeKey   = grade.toUpperCase().trim();
  const gradeValue = GRADE_MAP[gradeKey];

  if (gradeValue === undefined) {
    console.error(`❌  Unrecognised grade "${grade}".`);
    console.error(`    Valid grades: ${Object.keys(GRADE_MAP).join(", ")}`);
    process.exit(1);
  }

  // ── Step 1: Compute Poseidon hash ────────────────────────────────────
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  STEP 1 — Computing Poseidon Hash of grade value ...");
  console.log();

  const poseidon   = await buildPoseidon();
  const rawHash    = poseidon([BigInt(gradeValue)]);
  const gradeHash  = poseidon.F.toString(rawHash);   // decimal string for snarkjs

  console.log(`  gradeValue  (PRIVATE)  :  ${gradeValue}   [letter grade = "${grade}"]`);
  console.log(`  gradeHash   (PUBLIC)   :  ${gradeHash}`);
  console.log();
  console.log("  → gradeHash is safe to publish on the blockchain.");
  console.log("    It cannot be reversed to reveal the original grade.");
  console.log();

  // ── Step 2: Generate Groth16 ZKP ────────────────────────────────────
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  STEP 2 — Generating Groth16 Zero-Knowledge Proof ...");
  console.log("           (This may take 20-60 seconds)");
  console.log();

  const circuitInput = {
    gradeValue: gradeValue.toString(),   // PRIVATE — hidden in the proof
    gradeHash:  gradeHash,               // PUBLIC  — visible to verifier
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    WASM_PATH,
    ZKEY_PATH
  );

  console.log("  ✓  Proof generated successfully!");
  console.log();

  // ── Step 3: Save outputs ─────────────────────────────────────────────
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "proof.json"),
    JSON.stringify(proof, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "public.json"),
    JSON.stringify(publicSignals, null, 2)
  );

  // Summary for the verifier — intentionally excludes grade and gradeValue
  const summary = {
    studentId,
    name,
    course,
    courseName,
    gradeHash,     // only the commitment is public
    semester,
    academicYear,
    proofGeneratedAt: new Date().toISOString(),
    note: "Grade value is private and not stored here."
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "proof-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("  ─────────────────────────────────────────────────────────");
  console.log("  ✅  Files saved to  proof-output/");
  console.log();
  console.log("     proof.json         → cryptographic proof (sent to verifier)");
  console.log("     public.json        → public signals     (sent to verifier)");
  console.log("     proof-summary.json → human-readable summary (no grade!)");
  console.log();
  console.log("  🔐  ZERO-KNOWLEDGE SUMMARY");
  console.log();
  console.log("     What the VERIFIER (employer) receives:");
  console.log(`       • gradeHash  :  ${gradeHash}`);
  console.log("       • ZKP proof  :  proof.json (cryptographic, unreadable)");
  console.log();
  console.log("     What the VERIFIER never sees:");
  console.log(`       ✗  grade value  (${gradeValue})`);
  console.log(`       ✗  grade letter ("${grade}")`);
  console.log();
  console.log("  Next:  npm run verify");
  console.log("══════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n❌  Proof generation failed:", err.message);
  process.exit(1);
});
