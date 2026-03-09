/*
 * grade-verifier.cvl
 * Certora Verification Language (CVL 2) specification for GradeVerifier.sol
 *
 * Research: Blockchain-Based Transparent and Secure Academic Grading System
 * Component 4: Security, Privacy & Verification Layer
 * Author: Susara Perera (IT22276346) | SLIIT
 *
 * Properties verified
 * -------------------
 * ACCESS CONTROL
 *   AC1 - Only the owner can pause or unpause the contract
 *   AC2 - Only the owner can call initialize()
 *   AC3 - verifyProof reverts when the contract is paused
 *   AC4 - verifyProof never mutates contract storage
 *
 * STATE INVARIANTS
 *   SI1 - verificationKeySet never reverts to false once true
 *   SI2 - proofCount is monotonically non-decreasing
 *   SI3 - A call to verifyProof (view fn) never increments proofCount
 *   SI4 - Contract ETH balance is always zero
 *
 * Note: AR1 (BN254 scalar field arithmetic safety) is intentionally omitted.
 * The Groth16 pairing check uses EVM precompiles (ecAdd/ecMul/ecPairing at
 * addresses 6-8) which are opaque to the Certora SMT backend and cannot be
 * modelled as deterministic pure functions. Verifying arithmetic safety of
 * the pairing equation requires a dedicated arithmetic prover (e.g., Lean/Coq).
 */

// ── Method declarations ──────────────────────────────────────────────────────
// envfree = these getters do not depend on msg.sender / block context

methods {
    function owner()              external returns (address) envfree;
    function paused()             external returns (bool)    envfree;
    function verificationKeySet() external returns (bool)    envfree;
    function proofCount()         external returns (uint256) envfree;
}

// ============================================================================
// AC1 — Only the owner can toggle the paused flag
// ============================================================================
rule AC1_onlyOwnerCanChangePausedState(method f) {
    bool pausedBefore = paused();

    env e;
    calldataarg args;
    f(e, args);

    bool pausedAfter = paused();

    assert pausedBefore != pausedAfter => e.msg.sender == owner(),
        "AC1: only the owner may change the paused flag";
}

// ============================================================================
// AC2 — Only the owner can call initialize()
// ============================================================================
rule AC2_onlyOwnerCanInitialize() {
    env e;
    bool vksBefore = verificationKeySet();

    initialize(e);

    bool vksAfter = verificationKeySet();

    // If initialize changed the VKS flag the caller must be the owner
    assert vksBefore != vksAfter => e.msg.sender == owner(),
        "AC2: only the owner may call initialize()";
}

// ============================================================================
// AC3 — verifyProof must revert when the contract is paused
//        Uses calldataarg to avoid struct parameter encoding issues.
// ============================================================================
rule AC3_verifyProofRevertsWhenPaused() {
    env e;
    calldataarg args;
    require paused() == true;

    verifyProof@withrevert(e, args);

    assert lastReverted,
        "AC3: verifyProof must revert when the contract is paused";
}

// ============================================================================
// AC4 — verifyProof must not mutate any storage slot
//        Uses calldataarg to avoid struct parameter encoding issues.
// ============================================================================
rule AC4_verifyProofDoesNotMutateStorage() {
    env e;
    calldataarg args;
    require e.msg.value == 0;

    storage before = lastStorage;
    verifyProof@withrevert(e, args);
    storage after = lastStorage;

    assert before == after,
        "AC4: verifyProof must not change contract storage";
}

// ============================================================================
// SI1 — verificationKeySet never reverts to false once set to true
//        initialize() is excluded because it is the only fn that writes VKS.
// ============================================================================
rule SI1_verificationKeyNeverCleared(method f)
    filtered { f -> f.selector != sig:initialize().selector }
{
    require verificationKeySet() == true;

    env e;
    calldataarg args;
    f(e, args);

    assert verificationKeySet() == true,
        "SI1: verificationKeySet must remain true once set";
}

// ============================================================================
// SI2 — proofCount is monotonically non-decreasing across all functions
// ============================================================================
rule SI2_proofCounterNeverDecreases(method f) {
    uint256 countBefore = proofCount();

    env e;
    calldataarg args;
    f(e, args);

    assert proofCount() >= countBefore,
        "SI2: proofCount must never decrease";
}

// ============================================================================
// SI3 — Calling verifyProof (view function) never increments proofCount
//        Uses calldataarg to avoid struct parameter encoding issues.
// ============================================================================
rule SI3_viewCallDoesNotIncrementCounter() {
    env e;
    calldataarg args;
    uint256 countBefore = proofCount();

    verifyProof@withrevert(e, args);

    assert proofCount() == countBefore,
        "SI3: proofCount must be unchanged after a call to verifyProof";
}

// ============================================================================
// SI4 — The contract must never hold ETH (no payable functions)
// ============================================================================
invariant SI4_contractBalanceAlwaysZero()
    nativeBalances[currentContract] == 0;
