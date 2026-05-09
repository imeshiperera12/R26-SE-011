const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const Result = require("../models/Result");

// =======================================
// MODULE ASSIGNMENTS
// =======================================

const boaUsers = {
  boaA: "SE3040",
  boaB: "SE3050",
};

// =======================================
// GET RESULTS BY MODULE
// =======================================
router.get("/results/:moduleCode", (req, res) => {
  const moduleCode = req.params.moduleCode;

  const dummyData = [
    {
      candidateId: "IT001",
      moduleCode: moduleCode,
      marks: 75,
      grade: "B",
      version: 1,
    },
  ];

  res.json(dummyData);
});

// =======================================
// GET CANDIDATE BY ID
// =======================================
router.get("/candidate/:candidateId", async (req, res) => {
  try {
    const candidateId = req.params.candidateId;

    const result = await Result.findOne({ candidateId });

    if (!result) {
      return res.status(404).json({
        message: "Candidate not found",
      });
    }

    res.json(result);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Server error",
    });
  }
});

// =======================================
// POST EDIT RESULT
// =======================================
router.post("/edit", async (req, res) => {
  const {
    boaUser,
    moduleCode,
    candidateId,
    newMarks,
    newGrade,
    editedBy,
    reason,
  } = req.body;

  try {
    // =======================================
    // FIND RESULT
    // =======================================

    let result = await Result.findOne({ candidateId });

    // =======================================
    // CHECK 14-DAY DEADLINE
    // =======================================

    if (result) {
      const deadline = new Date(result.releaseDate);

      // ADD 14 DAYS
      deadline.setDate(deadline.getDate() + 14);

      // CHECK CURRENT DATE
      if (new Date() > deadline) {
        return res.status(403).json({
          message: "Editing deadline has passed for this result",
        });
      }
    }

    // =======================================
    // CHECK MODULE ACCESS
    // =======================================

    const allowedModule = boaUsers[boaUser];

    if (allowedModule !== moduleCode) {
      return res.status(403).json({
        message: "Access denied for this module",
      });
    }

    // =======================================
    // FIRST INSERT
    // =======================================

    if (!result) {
      return res.status(404).json({
        message: "Candidate record not found",
      });
    }

    // =======================================
    // SAVE AUDIT TRAIL
    // =======================================

    result.history.push({
      version: result.version,

      oldMarks: result.marks,
      newMarks,

      oldGrade: result.grade,
      newGrade,

      editedBy: editedBy || "BOA Member",

      reason: reason || "Not specified",

      editedAt: new Date(),
    });

    // =======================================
    // UPDATE VALUES
    // =======================================

    result.marks = newMarks;
    result.grade = newGrade;

    // =======================================
    // VERSION INCREMENT
    // =======================================

    result.version += 1;

    // =======================================
    // GENERATE NEW HASH
    // =======================================

    const hashData = `${candidateId}-${newMarks}-${newGrade}-${result.version}`;

    const generatedHash = crypto
      .createHash("sha256")
      .update(hashData)
      .digest("hex");

    result.hash = generatedHash;

    // =======================================
    // SAVE
    // =======================================

    await result.save();

    // =======================================
    // RESPONSE
    // =======================================

    res.json({
      message: "Edit saved successfully",
      result,
      generatedHash,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Server error",
    });
  }
});

module.exports = router;
