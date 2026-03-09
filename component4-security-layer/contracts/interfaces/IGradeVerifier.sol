// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGradeVerifier
 * @notice Interface for the GradeVerifier ZKP verifier contract.
 */
interface IGradeVerifier {
    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    /**
     * @notice Verifies a Groth16 proof for grade verification.
     * @param proof   The ZKP proof components.
     * @param input   Public inputs: [gradeHash].
     * @return valid  True if the proof is valid.
     */
    function verifyProof(Proof calldata proof, uint256[1] calldata input)
        external view returns (bool valid);
}
