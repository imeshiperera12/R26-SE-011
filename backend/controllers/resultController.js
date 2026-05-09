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
// AUTOMATIC GRADE GENERATION
// =======================================

const calculateGrade = (marks) => {
  const m = Number(marks);

  if (m >= 90) return "A+";
  if (m >= 80) return "A";
  if (m >= 75) return "A-";
  if (m >= 70) return "B+";
  if (m >= 65) return "B";
  if (m >= 60) return "B-";
  if (m >= 55) return "C+";
  if (m >= 50) return "C";
  if (m >= 40) return "C-";
  if (m >= 35) return "D+";
  if (m >= 30) return "D";

  return "E";
};

// =======================================
// GET RESULTS BY MODULE
// =======================================

exports.getResultsByModule = async (req, res) => {
  try {
    const moduleCode = req.params.moduleCode;

    const results = await Result.find({ moduleCode });

    res.json(results);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Server error",
    });
  }
};

// =======================================
// GET CANDIDATE BY ID
// =======================================

exports.getCandidateById = async (req, res) => {
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
};

// =======================================
// EDIT RESULT
// =======================================

exports.editResult = async (req, res) => {
  const { boaUser, moduleCode, candidateId, newMarks, editedBy, reason } =
    req.body;

  try {
    // =======================================
    // VALIDATION
    // =======================================

    if (
      !boaUser ||
      !moduleCode ||
      !candidateId ||
      newMarks === undefined ||
      !reason
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const numericMarks = Number(newMarks);

    if (numericMarks < 0 || numericMarks > 100) {
      return res.status(400).json({
        message: "Marks must be between 0 and 100",
      });
    }

    if (reason.trim().length < 5) {
      return res.status(400).json({
        message: "Reason must contain at least 5 characters",
      });
    }

    // =======================================
    // FIND RESULT
    // =======================================

    let result = await Result.findOne({ candidateId });

    if (!result) {
      return res.status(404).json({
        message: "Candidate record not found",
      });
    }

    // =======================================
    // DEADLINE LOCK
    // =======================================

    const deadline = new Date(result.releaseDate);

    deadline.setDate(deadline.getDate() + 14);

    if (new Date() > deadline) {
      return res.status(403).json({
        message: "Editing deadline has passed",
      });
    }

    // =======================================
    // MODULE ACCESS CONTROL
    // =======================================

    const allowedModule = boaUsers[boaUser];

    if (allowedModule !== moduleCode) {
      return res.status(403).json({
        message: "Access denied for this module",
      });
    }

    // =======================================
    // AUTO GRADE
    // =======================================

    const generatedGrade = calculateGrade(numericMarks);

    // =======================================
    // SAVE HISTORY
    // =======================================

    result.history.push({
      version: result.version,

      oldMarks: result.marks,
      newMarks: numericMarks,

      oldGrade: result.grade,
      newGrade: generatedGrade,

      editedBy: editedBy || boaUser,

      reason,

      editedAt: new Date(),
    });

    // =======================================
    // UPDATE MAIN RECORD
    // =======================================

    result.marks = numericMarks;

    result.grade = generatedGrade;

    // =======================================
    // VERSION INCREMENT
    // =======================================

    result.version += 1;

    // =======================================
    // HASH GENERATION
    // =======================================

    const hashData = `
      ${candidateId}
      ${moduleCode}
      ${numericMarks}
      ${generatedGrade}
      ${result.version}
    `;

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
      message: "Result updated successfully",

      generatedGrade,

      generatedHash,

      result,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Server error",
    });
  }
};
