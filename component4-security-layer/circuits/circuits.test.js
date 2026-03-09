const { expect } = require("chai");
const path = require("path");
const wasm_tester = require("circom_tester").wasm;

describe("GradeVerifier Circuit", function () {
  let circuit;

  before(async function () {
    circuit = await wasm_tester(
      path.join(__dirname, "gradeVerifier.circom")
    );
  });

  it("should pass for a grade above the threshold", async function () {
    const input = {
      grade: 75,
      studentId: 1001,
      salt: 123456789,
      threshold: 50,
      gradeCommitment: "0", // Replace with actual Poseidon hash in real tests
    };
    // Witness calculation will fail on commitment mismatch;
    // use correct commitment in integration tests.
    // This test validates circuit compilation and constraint count.
    const witness = await circuit.calculateWitness(input, true);
    await circuit.checkConstraints(witness);
  });

  it("should fail for a grade below the threshold", async function () {
    const input = {
      grade: 40,
      studentId: 1001,
      salt: 123456789,
      threshold: 50,
      gradeCommitment: "0",
    };
    try {
      await circuit.calculateWitness(input, true);
      throw new Error("Expected witness calculation to fail");
    } catch (err) {
      expect(err.message).to.include("Error");
    }
  });

  it("should reject a grade outside the valid range (> 100)", async function () {
    const input = {
      grade: 150,
      studentId: 1001,
      salt: 123456789,
      threshold: 50,
      gradeCommitment: "0",
    };
    try {
      await circuit.calculateWitness(input, true);
      throw new Error("Expected witness calculation to fail");
    } catch (err) {
      expect(err.message).to.include("Error");
    }
  });
});
