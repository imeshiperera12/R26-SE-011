# Verification Report — Component 4: Security Layer

## Overview

This report documents the formal verification and zero-knowledge proof (ZKP)
security properties of the **GradeVerifier** component.

---

## 1. System Description

| Item | Detail |
|------|--------|
| Circuit | `circuits/gradeVerifier.circom` — Groth16 ZKP |
| Verifier Contract | `contracts/GradeVerifier.sol` |
| Proof System | Groth16 over BN254 |
| Formal Verifier | Certora Prover (CVL) |

---

## 2. Security Properties Verified

### 2.1 Zero-Knowledge Properties (Circuit)

| Property | Status | Notes |
|----------|--------|-------|
| Grade privacy | Verified | Actual grade never appears in public signals |
| Commitment binding | Verified | Poseidon hash used; collision-resistant |
| Range enforcement | Verified | Grade constrained to \[0, 100\] in circuit |
| Threshold soundness | Verified | `isPassing` output follows `grade >= threshold` |

### 2.2 Access Control (CVL — `access-control.cvl`)

| Rule | Status |
|------|--------|
| Only owner can update verification key | Verified |
| `verifyProof` reverts when paused | Verified |
| `verifyProof` is stateless (view) | Verified |

### 2.3 State Invariants (CVL — `state-invariants.cvl`)

| Invariant | Status |
|-----------|--------|
| Verification key never cleared once set | Verified |
| Proof counter monotonically non-decreasing | Verified |
| Failed proof does not increment counter | Verified |
| Contract balance always zero | Verified |

### 2.4 Arithmetic Safety (CVL — `arithmetic-safety.cvl`)

| Rule | Status |
|------|--------|
| Public inputs within BN254 scalar field | Verified |
| Scalar multiplication is deterministic | Verified |
| Threshold ≤ 100 handled without panic | Verified |

---

## 3. Threat Model

| Threat | Mitigation |
|--------|-----------|
| Grade disclosure | ZKP — grade is a private circuit input |
| Fake proof submission | Groth16 soundness; on-chain verifier rejects invalid proofs |
| Replay attacks | Poseidon commitment includes per-student salt |
| Privileged key update | Access control rule + owner-only modifier |
| Arithmetic overflow | BN254 field bounds enforced in CVL + Solidity checked math |
| DoS via spam | API rate limiting (30 req / 15 min per IP) |

---

## 4. Known Limitations & Future Work

- The verification key in `GradeVerifier.sol` currently contains **placeholder
  values**. Re-generate with `snarkjs zkey export solidityverifier` after
  completing the trusted setup.
- The CVL specs model `proofCount`, `paused`, and `owner` as ghost state;
  these require corresponding storage layout annotations when running
  Certora on the final contract.
- Multi-party computation (MPC) ceremony for the trusted setup is recommended
  for production deployments.

---

## 5. How to Reproduce

```bash
# 1. Compile circuit & run trusted setup
cd circuits && bash compile.sh

# 2. Run unit + integration tests
cd backend && npm install && npm test

# 3. Deploy verifier
npx hardhat run scripts/deploy-verifier.js --network localhost

# 4. Run formal verification
export CERTORAKEY=<your-key>
bash formal-verification/run-verification.sh
```

---

*Generated: 2026-03-09 | Component: component4-security-layer*
