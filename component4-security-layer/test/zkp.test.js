"use strict";

/**
 * zkp.test.js
 * Unit tests for ZKP proof generation and verification logic.
 *
 * Circuit design:
 *   Private input  : gradeValue  (0=F, 1=D, 2=C, 3=B, 4=A, 5=A+)
 *   Public  input  : gradeHash   (Poseidon(gradeValue) — commitment)
 *
 * The proof proves knowledge of a gradeValue whose Poseidon hash equals
 * the public gradeHash, without revealing the grade itself.
 */

const { expect } = require("chai");
const { generateProof, exportSolidityCalldata, computeCommitment } = require(
  "../backend/src/proof-generator"
);

describe("ZKP — proof-generator", function () {
  this.timeout(120_000); // snarkjs is slow in test environments

  it("generates a valid proof for grade A (value=4)", async function () {
    const { proof, publicSignals, gradeHash } = await generateProof({ gradeValue: 4 });

    expect(proof).to.have.keys(["pi_a", "pi_b", "pi_c", "protocol", "curve"]);
    expect(publicSignals).to.be.an("array").with.length(1);
    // publicSignals[0] is the gradeHash (Poseidon commitment to gradeValue=4)
    expect(publicSignals[0]).to.equal(gradeHash);
  });

  it("accepts letter grade input (A → value 4)", async function () {
    const { proof, publicSignals } = await generateProof({ gradeValue: "A" });
    expect(proof).to.have.keys(["pi_a", "pi_b", "pi_c", "protocol", "curve"]);
    expect(publicSignals).to.be.an("array").with.length(1);
  });

  it("generates different hashes for different grades", async function () {
    const { gradeHash: hashA } = await generateProof({ gradeValue: 4 }); // A
    const { gradeHash: hashB } = await generateProof({ gradeValue: 3 }); // B
    expect(hashA).to.not.equal(hashB);
  });

  it("throws for a grade value outside [0, 5]", async function () {
    await expect(
      generateProof({ gradeValue: 6 })
    ).to.be.rejectedWith(RangeError);
  });

  it("exports valid Solidity calldata", async function () {
    const { proof, publicSignals } = await generateProof({ gradeValue: 3 }); // B
    const calldata = await exportSolidityCalldata(proof, publicSignals);
    expect(calldata).to.be.a("string").that.includes("[");
  });

  it("computeCommitment is deterministic for same gradeValue", async function () {
    const c1 = await computeCommitment(4); // grade A
    const c2 = await computeCommitment(4); // grade A again
    expect(c1).to.equal(c2);
  });

  it("computeCommitment returns a large integer string (field element)", async function () {
    const c = await computeCommitment(4);
    expect(c).to.be.a("string");
    expect(Number(c)).to.be.greaterThan(0);
  });
});
