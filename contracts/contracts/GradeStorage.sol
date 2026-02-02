// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GradeStorage {

    struct GradeRecord {
        bytes32 gradeHash;
        string assignmentId;
        uint256 timestamp;
    }

    mapping(bytes32 => GradeRecord) public grades;

    event GradeStored(
        bytes32 indexed studentHash,
        string assignmentId,
        uint256 timestamp
    );

    function storeGrade(
        bytes32 studentHash,
        bytes32 gradeHash,
        string memory assignmentId
    ) public {
        grades[studentHash] = GradeRecord(
            gradeHash,
            assignmentId,
            block.timestamp
        );

        emit GradeStored(studentHash, assignmentId, block.timestamp);
    }

    function getGrade(bytes32 studentHash)
        public
        view
        returns (bytes32, string memory, uint256)
    {
        GradeRecord memory record = grades[studentHash];
        return (record.gradeHash, record.assignmentId, record.timestamp);
    }
}
