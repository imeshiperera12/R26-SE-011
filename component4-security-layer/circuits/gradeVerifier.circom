pragma circom 2.0.0;

/*
 * gradeVerifier.circom
 *
 * Research: Blockchain-Based Transparent and Secure Academic Grading System
 * Component 4: Security, Privacy & Verification Layer
 * Author  : Susara Perera (IT22276346)
 *
 * PURPOSE
 * -------
 * Prove knowledge of a grade value whose Poseidon hash equals a
 * publicly committed gradeHash, WITHOUT revealing the grade itself.
 *
 * GRADE ENCODING
 * --------------
 *   F = 0  D = 1  C = 2  B = 3  A = 4  A+ = 5
 *
 * ZERO-KNOWLEDGE PROPERTY
 * -----------------------
 *   Private : gradeValue  (never leaves the prover)
 *   Public  : gradeHash   (stored on blockchain / shared with verifier)
 *
 * ZKP guarantees
 *   Completeness   - a valid grade always produces a valid proof
 *   Soundness      - a fake grade cannot produce a valid proof
 *   Zero-Knowledge - the proof reveals nothing about the grade
 */

include "circomlib/circuits/poseidon.circom";

template GradeVerifier() {

    // PRIVATE input -- not listed in {public [...]}, so never revealed.
    signal input gradeValue;   // numeric grade, e.g. 4 for "A"

    // PUBLIC input -- the Poseidon commitment stored on the blockchain.
    signal input gradeHash;    // Poseidon(gradeValue)

    // Core constraint: hash the private grade and assert it equals gradeHash.
    // If they differ, snarkjs refuses to generate a proof.
    component hasher = Poseidon(1);
    hasher.inputs[0] <== gradeValue;
    gradeHash === hasher.out;
}

// gradeHash is the only public signal; gradeValue stays private.
component main {public [gradeHash]} = GradeVerifier();
