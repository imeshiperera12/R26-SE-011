const { checkModuleAccess } = require("../services/moduleAccessService");
const Result = require("../models/Result");
const FinalResult = require("../models/FinalResult");

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
    const moduleCode = req.params.moduleCode.trim().toUpperCase();

    // MODULE ASSIGNMENT CHECK
    if (!req.user.assignedModules.includes(moduleCode)) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    // MODULE REVIEW STATUS
    const access = await checkModuleAccess(moduleCode);

    if (!access.allowed) {
      return res.status(403).json({
        message: "BOE review period for this module has ended.",
        status: access.status.status,
      });
    }

    // GET RESULTS
    const results = await Result.find({
      moduleCode,
      isRecorrection: false,
      finalized: false,
    }).sort({
      candidateId: 1,
    });

    res.json(results);
  } catch (error) {
    console.error("❌ Get results by module error:", error);

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

    const result = await Result.findOne({
      candidateId,
      isRecorrection: false,
    });

    if (!result) {
      return res.status(404).json({
        message: "Candidate not found",
      });
    }

    // MODULE ASSIGNMENT CHECK
    if (!req.user.assignedModules.includes(result.moduleCode)) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    // MODULE REVIEW STATUS CHECK
    const access = await checkModuleAccess(result.moduleCode);

    if (!access.allowed) {
      return res.status(403).json({
        message: "BOE review period for this module has ended.",
        status: access.status.status,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Get candidate error:", error);

    res.status(500).json({
      error: "Server error",
    });
  }
};

// =======================================
// EDIT RESULT
// =======================================

exports.editResult = async (req, res) => {
  const { moduleCode, candidateId, newMarks, reason } = req.body;

  try {
    // VALIDATION
    if (!moduleCode || !candidateId || newMarks === undefined || !reason) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const normalizedModuleCode = moduleCode.trim().toUpperCase();

    const numericMarks = Number(newMarks);

    if (Number.isNaN(numericMarks) || numericMarks < 0 || numericMarks > 100) {
      return res.status(400).json({
        message: "Marks must be between 0 and 100",
      });
    }

    if (reason.trim().length < 5) {
      return res.status(400).json({
        message: "Reason must contain at least 5 characters",
      });
    }

    // MODULE ACCESS CONTROL
    const allowedModules = req.user.assignedModules;

    if (!allowedModules.includes(normalizedModuleCode)) {
      return res.status(403).json({
        message: "You are not assigned to this module.",
      });
    }

    // FIND RESULT
    const result = await Result.findOne({
      candidateId,
      moduleCode: normalizedModuleCode,
    });

    if (!result) {
      return res.status(404).json({
        message: "Candidate record not found",
      });
    }

    // MODULE REVIEW STATUS CHECK
    const access = await checkModuleAccess(normalizedModuleCode);

    if (!access.allowed) {
      return res.status(403).json({
        message: "BOE review period for this module has ended.",
        status: access.status.status,
      });
    }

    // AUTO GRADE
    const generatedGrade = calculateGrade(numericMarks);

    // SAVE HISTORY
    result.history.push({
      version: result.version,

      oldMarks: result.marks,
      newMarks: numericMarks,

      oldGrade: result.grade,
      newGrade: generatedGrade,

      editedBy: req.user.username,

      reason,

      editedAt: new Date(),
    });

    // UPDATE RESULT
    result.marks = numericMarks;
    result.grade = generatedGrade;

    // VERSION INCREMENT
    result.version += 1;

    // SAVE
    await result.save();

    // RESPONSE
    res.json({
      message: "Result updated successfully",

      generatedGrade,

      version: result.version,

      result,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      error: "Server error",
    });
  }
};

// =======================================
// GET ALL FINALIZED RESULTS
// =======================================

exports.getFinalizedResults = async (req, res) => {
  try {
    const results = await FinalResult.find({})
      .sort({
        finalizedAt: -1,
        candidateId: 1,
      })
      .lean();

    res.status(200).json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("❌ Get finalized results error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch finalized results.",
    });
  }
};
