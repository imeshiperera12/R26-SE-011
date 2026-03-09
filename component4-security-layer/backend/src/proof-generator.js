"use strict";

/**
 * proof-generator.js
 * ZKP generation service — generates Groth16 proofs for grade verification
 * using snarkjs and the compiled gradeVerifier circuit artifacts.
 */

const snarkjs = require("snarkjs");
const { buildPoseidon } = require("circomlibjs");
const path = require("path");
const fs = require("fs");

const WASM_PATH = path.resolve(
  __dirname,
  "../../build/gradeVerifier_js/gradeVerifier.wasm"
);
const ZKEY_PATH = path.resolve(
  __dirname,
  "../../build/gradeVerifier_final.zkey"
);

// Grade letter to numeric value mapping (must match circuit)
const GRADE_MAP = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, F: 0, D: 1, C: 2, B: 3, A: 4, "A+": 5 };

/**
 * Computes a Poseidon commitment for a grade value.
 * This is the public hash stored on blockchain.
 * @param {bigint|number} gradeValue - numeric grade 0-5
 * @returns {Promise<string>} field element string
 */
async function computeCommitment(gradeValue) {
  const poseidon = await buildPoseidon();
  const hash = poseidon([BigInt(gradeValue)]);
  return poseidon.F.toString(hash);
}

/**
 * Generates a Groth16 proof for grade verification.
 *
 * Circuit interface:
 *   Private input : gradeValue  (numeric: F=0 D=1 C=2 B=3 A=4 A+=5)
 *   Public  input : gradeHash   (Poseidon(gradeValue) — stored on blockchain)
 *
 * @param {object} params
 * @param {number|string} params.gradeValue - Numeric grade (0–5) OR letter (F/D/C/B/A/A+)
 * @returns {Promise<{ proof: object, publicSignals: string[], gradeHash: string }>}
 */
async function generateProof({ gradeValue }) {
  // Accept letter grades as well as numeric
  const numericGrade = typeof gradeValue === 'string' && isNaN(gradeValue)
    ? GRADE_MAP[gradeValue.toUpperCase()]
    : Number(gradeValue);

  if (numericGrade === undefined || numericGrade < 0 || numericGrade > 5) {
    throw new RangeError(`gradeValue must be 0-5 or F/D/C/B/A/A+, got ${gradeValue}`);
  }

  const gradeHash = await computeCommitment(numericGrade);

  const input = {
    gradeValue: numericGrade.toString(),
    gradeHash,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH
  );

  return { proof, publicSignals, gradeHash };
}

/**
 * Exports proof in Solidity-compatible calldata format.
 *
 * @param {object} proof
 * @param {string[]} publicSignals
 * @returns {Promise<string>} ABI-encoded calldata string
 */
async function exportSolidityCalldata(proof, publicSignals) {
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );
  return calldata;
}

module.exports = { generateProof, exportSolidityCalldata, computeCommitment };
