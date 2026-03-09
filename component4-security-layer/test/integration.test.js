"use strict";

/**
 * integration.test.js
 * End-to-end integration tests: proof generation → on-chain verification.
 *
 * Prerequisites:
 *   1. Local Hardhat/Anvil node running at RPC_URL.
 *   2. GradeVerifier contract deployed and CONTRACT_ADDRESS set in .env.
 *   3. Circuit compiled and artifacts present in build/circuits/.
 */

const { expect } = require("chai");
const { ethers }  = require("ethers");
const request    = require("supertest");
const app        = require("../backend/src/api-server");
require("dotenv").config({ path: require("path").resolve(__dirname, "../backend/.env") });

const GRADE_VERIFIER_ABI = [
  "function verifyProof(tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[1] input) view returns (bool)",
];

describe("Integration — API ↔ On-chain Verifier", function () {
  this.timeout(180_000);

  let provider;
  let contract;

  before(async function () {
    if (!process.env.RPC_URL || !process.env.CONTRACT_ADDRESS) {
      this.skip(); // skip when env not configured
    }
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    // Skip gracefully when no local node is reachable
    try {
      await provider.getNetwork();
    } catch (_) {
      this.skip(); // skip when node not available
    }
    contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      GRADE_VERIFIER_ABI,
      provider
    );
  });

  it("GET /api/health returns 200", async function () {
    const res = await request(app).get("/api/health");
    expect(res.status).to.equal(200);
    expect(res.body.status).to.equal("ok");
  });

  it("POST /api/proof/generate returns proof and calldata", async function () {
    const res = await request(app)
      .post("/api/proof/generate")
      .send({ gradeValue: 3 }); // B = 3

    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("proof");
    expect(res.body).to.have.property("gradeHash");
    expect(res.body).to.have.property("calldata");
  });

  it("Generated proof passes on-chain verifyProof", async function () {
    const genRes = await request(app)
      .post("/api/proof/generate")
      .send({ gradeValue: 4 }); // A = 4

    expect(genRes.status).to.equal(200);

    const { proof, publicSignals } = genRes.body;

    // Convert snarkjs proof to the struct expected by the contract
    const solidityProof = {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
    };

    // Circuit has 1 public signal: gradeHash
    const input = [publicSignals[0]];
    const isValid = await contract.verifyProof(solidityProof, input);
    expect(isValid).to.be.true;
  });

  it("POST /api/proof/verify returns { valid: true } for a valid proof", async function () {
    const genRes = await request(app)
      .post("/api/proof/generate")
      .send({ gradeValue: 2 }); // C = 2

    const { proof, publicSignals } = genRes.body;
    const solidityProof = {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
    };

    const verifyRes = await request(app)
      .post("/api/proof/verify")
      .send({ proof: solidityProof, input: publicSignals }); // publicSignals = [gradeHash]

    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.body.valid).to.be.true;
  });
});
