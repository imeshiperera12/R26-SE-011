const express = require("express");
const router = express.Router();

// GET results by module
router.get("/results/:moduleCode", (req, res) => {
  const moduleCode = req.params.moduleCode;

  const dummyData = [
    {
      candidateId: "IT001",
      moduleCode: moduleCode,
      marks: 75,
      grade: "B",
      version: 1
    }
  ];

  res.json(dummyData);
});

module.exports = router;