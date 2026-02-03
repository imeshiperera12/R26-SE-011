// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GradeVerification {

    enum GradeStatus { PENDING, APPROVED }

    struct VerificationRecord {
        bytes32 gradeHash;
        GradeStatus status;
        uint256 approvalCount;
    }

    // studentHash => verification record
    mapping(bytes32 => VerificationRecord) public verificationRecords;

    // approved reviewers
    mapping(address => bool) public reviewers;

    // studentHash => reviewer => approved?
    mapping(bytes32 => mapping(address => bool)) public approvals;

    uint256 public requiredApprovals;
    address public owner;

    event ReviewerApproved(address reviewer);
    event GradeApprovalReceived(bytes32 indexed studentHash, address reviewer);
    event GradeApproved(bytes32 indexed studentHash);

    constructor(address[] memory _reviewers, uint256 _requiredApprovals) {
        owner = msg.sender;
        requiredApprovals = _requiredApprovals;

        for (uint i = 0; i < _reviewers.length; i++) {
            reviewers[_reviewers[i]] = true;
            emit ReviewerApproved(_reviewers[i]);
        }
    }

    // Called AFTER grade is stored in GradeStorage
    function initVerification(bytes32 studentHash, bytes32 gradeHash) public {
        verificationRecords[studentHash] = VerificationRecord(
            gradeHash,
            GradeStatus.PENDING,
            0
        );
    }

    function approveGrade(bytes32 studentHash) public {
        require(reviewers[msg.sender], "Not an authorized reviewer");
        require(!approvals[studentHash][msg.sender], "Already approved");
        require(
            verificationRecords[studentHash].status == GradeStatus.PENDING,
            "Grade already approved"
        );

        approvals[studentHash][msg.sender] = true;
        verificationRecords[studentHash].approvalCount++;

        emit GradeApprovalReceived(studentHash, msg.sender);

        if (
            verificationRecords[studentHash].approvalCount >= requiredApprovals
        ) {
            verificationRecords[studentHash].status = GradeStatus.APPROVED;
            emit GradeApproved(studentHash);
        }
    }

    function getGradeStatus(bytes32 studentHash)
        public
        view
        returns (GradeStatus)
    {
        return verificationRecords[studentHash].status;
    }
}