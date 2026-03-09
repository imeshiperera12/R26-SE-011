// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GradeVerifier
 * @notice Auto-generated Groth16 verifier for the gradeVerifier circuit.
 *         Replace the verification key constants below with values exported
 *         from `snarkjs zkey export solidityverifier`.
 *
 * @dev    Do NOT edit the pairing library section manually.
 *         Re-generate this file whenever the circuit or trusted setup changes.
 */

library Pairing {
    struct G1Point { uint256 X; uint256 Y; }
    struct G2Point { uint256[2] X; uint256[2] Y; }

    function negate(G1Point memory p) internal pure returns (G1Point memory) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00030000, 1037618708483) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00030001, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00030005, 1) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00036000, p) }
        if (p.X == 0 && p.Y == 0) return G1Point(0, 0);
        uint256 q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        return G1Point(p.X, q - (p.Y % q));
    }

    function addition(G1Point memory p1, G1Point memory p2)
        internal view returns (G1Point memory r)
    {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00040000, 1037618708484) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00040001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00040005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00046001, p2) }
        uint256[4] memory input = [p1.X, p1.Y, p2.X, p2.Y];
        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0x80, r, 0x40)
        }
        require(success, "Pairing: addition failed");
    }

    function scalar_mul(G1Point memory p, uint256 s)
        internal view returns (G1Point memory r)
    {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00050000, 1037618708485) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00050001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00050005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00056001, s) }
        uint256[3] memory input = [p.X, p.Y, s];
        bool success;
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x60, r, 0x40)
        }
        require(success, "Pairing: scalar_mul failed");
    }

    function pairing(G1Point[] memory p1, G2Point[] memory p2)
        internal view returns (bool)
    {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00060000, 1037618708486) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00060001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00060005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00066001, p2) }
        require(p1.length == p2.length, "Pairing: length mismatch");
        uint256 elements = p1.length;
        uint256 inputSize = elements * 6;
        uint256[] memory input = new uint256[](inputSize);
        for (uint256 i = 0; i < elements; i++) {
            input[i * 6 + 0] = p1[i].X;
            input[i * 6 + 1] = p1[i].Y;
            input[i * 6 + 2] = p2[i].X[0];
            input[i * 6 + 3] = p2[i].X[1];
            input[i * 6 + 4] = p2[i].Y[0];
            input[i * 6 + 5] = p2[i].Y[1];
        }
        uint256[1] memory out;
        bool success;
        assembly {
            success := staticcall(
                sub(gas(), 2000), 8,
                add(input, 0x20), mul(inputSize, 0x20),
                out, 0x20
            )
        }
        require(success, "Pairing: pairing check failed");
        return out[0] != 0;
    }
}

contract GradeVerifier {
    using Pairing for *;

    // ── Ownership ────────────────────────────────────────────────────────
    address public owner;

    // ── Security flags ───────────────────────────────────────────────────
    bool public paused;
    bool public verificationKeySet;

    // ── Metrics ──────────────────────────────────────────────────────────
    uint256 public proofCount;

    // ── Events ───────────────────────────────────────────────────────────
    event ProofSubmitted(address indexed submitter, bool valid);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ── Structs ──────────────────────────────────────────────────────────
    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[] IC;
    }

    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }

    // ── Constructor ──────────────────────────────────────────────────────
    constructor() {
        owner             = msg.sender;
        verificationKeySet = true;   // VK is hardcoded in verifyingKey()
        paused            = false;
        proofCount        = 0;
    }

    // ── Modifiers ────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "GradeVerifier: caller is not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "GradeVerifier: operations are paused");
        _;
    }

    // ── Admin ────────────────────────────────────────────────────────────

    /// @notice Owner can pause all proof submissions.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Owner can un-pause.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Re-affirms the verification key is set; exposed for CVL spec.
    function initialize() external onlyOwner {
        verificationKeySet = true;
    }

    // ── Verification key ─────────────────────────────────────────────────
    // TODO: Replace placeholder values with those exported by
    //       `snarkjs zkey export solidityverifier` from build/gradeVerifier_final.zkey
    function verifyingKey() internal pure returns (VerifyingKey memory vk) {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00000000, 1037618708480) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00000001, 0) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00000004, 0) }
        vk.alfa1  = Pairing.G1Point(0, 0);
        vk.beta2  = Pairing.G2Point([uint256(0), uint256(0)], [uint256(0), uint256(0)]);
        vk.gamma2 = Pairing.G2Point([uint256(0), uint256(0)], [uint256(0), uint256(0)]);
        vk.delta2 = Pairing.G2Point([uint256(0), uint256(0)], [uint256(0), uint256(0)]);
        vk.IC     = new Pairing.G1Point[](2); // IC[0] constant + IC[1] for gradeHash (1 public input)
        vk.IC[0]  = Pairing.G1Point(0, 0);
        vk.IC[1]  = Pairing.G1Point(0, 0);
    }

    // ── Core verification ─────────────────────────────────────────────────

    /**
     * @notice Verifies a Groth16 ZKP proof.
     * @dev    Pure verification — no state changes. Reverts when paused.
     * @param proof  The proof (A, B, C).
     * @param input  Public inputs: [gradeHash].
     * @return       true if the proof is valid.
     */
    function verifyProof(Proof memory proof, uint256[1] memory input)
        public view logInternal2(input)whenNotPaused returns (bool)
    {
        VerifyingKey memory vk = verifyingKey();
        require(input.length + 1 == vk.IC.length, "Verifier: invalid public input length");

        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);
        vk_x = Pairing.addition(vk_x, vk.IC[0]);
        for (uint256 i = 0; i < input.length; i++) {
            vk_x = Pairing.addition(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }

        Pairing.G1Point[] memory p1 = new Pairing.G1Point[](4);
        Pairing.G2Point[] memory p2 = new Pairing.G2Point[](4);
        p1[0] = Pairing.negate(proof.A); p2[0] = proof.B;
        p1[1] = vk.alfa1;                p2[1] = vk.beta2;
        p1[2] = vk_x;                    p2[2] = vk.gamma2;
        p1[3] = proof.C;                 p2[3] = vk.delta2;

        return Pairing.pairing(p1, p2);
    }modifier logInternal2(uint256[1] memory input) { assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00020000, 1037618708482) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00020001, 2) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00020005, 9) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00026001, input) } _; }

    /**
     * @notice Submit a proof for on-chain recording. Increments proofCount on success.
     * @return valid  true if the proof verified.
     */
    function submitVerification(Proof memory proof, uint256[1] memory input)
        external returns (bool valid)
    {
        valid = verifyProof(proof, input);
        if (valid) {
            proofCount++;
        }
        emit ProofSubmitted(msg.sender, valid);
    }

    /**
     * @notice Public wrapper around elliptic-curve scalar multiplication.
     * @dev    Exposed so the Certora Prover can reason about determinism and
     *         field-element safety of the pairing library.
     * @return rx  X-coordinate of the result point.
     * @return ry  Y-coordinate of the result point.
     */
    function ecMul(uint256 px, uint256 py, uint256 scalar)
        public view returns (uint256 rx, uint256 ry)
    {assembly ("memory-safe") { mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00010000, 1037618708481) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00010001, 3) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00010005, 73) mstore(0xffffff6e4604afefe123321beef1b01fffffffffffffffffffffffff00016002, scalar) }
        Pairing.G1Point memory r = Pairing.scalar_mul(Pairing.G1Point(px, py), scalar);
        return (r.X, r.Y);
    }
}
