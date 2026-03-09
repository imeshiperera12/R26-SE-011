#!/usr/bin/env bash
# compile.sh — Compile the gradeVerifier circuit and run the trusted setup (Powers of Tau)
set -euo pipefail

CIRCUIT_NAME="gradeVerifier"
BUILD_DIR="../build/circuits"
PTAU_FILE="../build/pot12_final.ptau"
PTAU_DOWNLOAD="https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau"

mkdir -p "$BUILD_DIR"

echo "=== [1/5] Compiling circuit ==="
circom "${CIRCUIT_NAME}.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR"

echo "=== [2/5] Downloading Powers of Tau (if needed) ==="
if [ ! -f "$PTAU_FILE" ]; then
  curl -L "$PTAU_DOWNLOAD" -o "$PTAU_FILE"
fi

echo "=== [3/5] Generating zkey (Phase 2 setup) ==="
snarkjs groth16 setup \
  "${BUILD_DIR}/${CIRCUIT_NAME}.r1cs" \
  "$PTAU_FILE" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey"

echo "=== [4/5] Contributing randomness to zkey ==="
echo "random entropy" | snarkjs zkey contribute \
  "${BUILD_DIR}/${CIRCUIT_NAME}_0000.zkey" \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  --name="Initial contribution" \
  -v

echo "=== [5/5] Exporting verification key ==="
snarkjs zkey export verificationkey \
  "${BUILD_DIR}/${CIRCUIT_NAME}_final.zkey" \
  "${BUILD_DIR}/verification_key.json"

echo ""
echo "Done! Artifacts are in ${BUILD_DIR}/"
echo "  - ${CIRCUIT_NAME}.r1cs"
echo "  - ${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm"
echo "  - ${CIRCUIT_NAME}_final.zkey"
echo "  - verification_key.json"
