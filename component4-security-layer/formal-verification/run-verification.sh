#!/usr/bin/env bash
# run-verification.sh — Submit GradeVerifier to the Certora Prover
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="${SCRIPT_DIR}/../contracts"
SPECS_DIR="${SCRIPT_DIR}/specs"

# Require CERTORAKEY environment variable
if [ -z "${CERTORAKEY:-}" ]; then
  echo "ERROR: CERTORAKEY environment variable is not set."
  echo "  Export your Certora API key: export CERTORAKEY=<your-key>"
  exit 1
fi

echo "=== Running Certora Formal Verification ==="
echo "Contract : ${CONTRACTS_DIR}/GradeVerifier.sol"
echo "Specs    : ${SPECS_DIR}/"
echo ""

certoraRun \
  "${CONTRACTS_DIR}/GradeVerifier.sol" \
  --verify "GradeVerifier:${SPECS_DIR}/access-control.cvl" \
  --verify "GradeVerifier:${SPECS_DIR}/state-invariants.cvl" \
  --verify "GradeVerifier:${SPECS_DIR}/arithmetic-safety.cvl" \
  --solc solc \
  --solc_args "--optimize --optimize-runs 200" \
  --msg "GradeVerifier formal verification run" \
  --rule_sanity basic \
  --optimistic_loop \
  --loop_iter 3

echo ""
echo "Verification job submitted. Check the Certora dashboard for results."
