const { checkModuleAccess } = require("../services/moduleAccessService");
const XLSX = require("xlsx");
const Result = require("../models/Result");

// =======================================
// EXPORT RESULTS BY MODULE
// =======================================

exports.exportResultsByModule = async (req, res) => {
  try {
    const moduleCode = req.params.moduleCode.trim().toUpperCase();

    console.log(`\n📤 Excel export requested for module: ${moduleCode}`);

    // MODULE ACCESS CONTROL
    if (!req.user.assignedModules.includes(moduleCode)) {
      return res.status(403).json({
        message: "You are not assigned to this module.",
      });
    }

    // =======================================
    // MODULE REVIEW STATUS
    // =======================================

    const access = await checkModuleAccess(moduleCode);

    if (!access.allowed) {
      return res.status(403).json({
        message: "BOE review period for this module has ended.",
        status: access.status.status,
      });
    }

    // =======================================
    // GET RESULTS
    // =======================================

    const results = await Result.find({
      moduleCode,
      isRecorrection: false,
    })
      .sort({ candidateId: 1 })
      .lean();

    // =======================================
    // CHECK RESULTS
    // =======================================

    if (results.length === 0) {
      return res.status(404).json({
        message: "No results found for this module.",
      });
    }

    // =======================================
    // PREPARE EXCEL DATA
    // =======================================

    const exportData = results.map((result) => ({
      "Candidate ID": result.candidateId,
      Marks: result.marks,
      Grade: result.grade,
      Version: result.version,
    }));

    // =======================================
    // CREATE WORKSHEET
    // =======================================

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // =======================================
    // SET COLUMN WIDTHS
    // =======================================

    worksheet["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

    // =======================================
    // CREATE WORKBOOK
    // =======================================

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");

    // =======================================
    // GENERATE EXCEL FILE
    // =======================================

    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // =======================================
    // FILE NAME
    // =======================================

    const fileName = `${moduleCode}_Results.xlsx`;

    // =======================================
    // RESPONSE HEADERS
    // =======================================

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    // =======================================
    // SEND EXCEL FILE
    // =======================================

    console.log(`✅ Exporting ${results.length} results for ${moduleCode}`);

    res.send(excelBuffer);
  } catch (error) {
    console.error("❌ Excel export error:", error);

    res.status(500).json({
      message: "Server error while generating Excel file.",
    });
  }
};
