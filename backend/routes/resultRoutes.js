const express = require("express");
const router = express.Router();
const Result = require("../models/Result");

// GET results by module
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

// POST edit result
router.post("/edit", async (req, res) => {
  const { candidateId, newMarks, newGrade, editedBy, reason } = req.body;

  try {
    let result = await Result.findOne({ candidateId });

    // 👉 FIRST TIME INSERT
    if (!result) {
      result = new Result({
        candidateId,
        marks: newMarks,
        grade: newGrade,
        version: 1,
        history: [],
      });

      await result.save();

      return res.json({
        message: "Initial record created",
        result,
      });
    }

    // 👉 SAVE AUDIT TRAIL
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

    // 👉 UPDATE VALUES
    result.marks = newMarks;
    result.grade = newGrade;

    // 👉 VERSION INCREMENT
    result.version += 1;

    await result.save();

    res.json({
      message: "Edit saved with audit trail",
      result,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
