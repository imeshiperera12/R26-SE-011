const express = require("express");

const router = express.Router();

const {
  getResultsByModule,
  getCandidateById,
  editResult,
} = require("../controllers/resultController");

router.get("/results/:moduleCode", getResultsByModule);

router.get("/candidate/:candidateId", getCandidateById);

router.post("/edit", editResult);

module.exports = router;
