const Result = require("../models/Result");
const FinalResult = require("../models/FinalResult");
const { generateResultHash } = require("../utils/hashGenerator");

// =======================================
// DYNAMIC CONFIG READER (Synced with Component 3 Admin Policy)
// =======================================
const getSystemPolicy = () => {
  const policy = {
    timeUnit: process.env.TIME_UNIT || "minutes",
    standardUploadWindow: Number(process.env.STANDARD_UPLOAD_WINDOW || 1),
    boeReviewWindow: Number(process.env.BOE_REVIEW_WINDOW || 2),
    specialConcernsWindow: Number(process.env.SPECIAL_CONCERNS_WINDOW || 3),
  };

  console.log("📡 [Policy Loaded] Using environment configuration:", policy);

  return policy;
};

// =======================================
// FINALIZE EXPIRED BOE RESULTS
// =======================================

const finalizeExpiredResults = async () => {
  try {
    const policy = getSystemPolicy();
    const now = new Date();

    let deadlineMs = 0;
    const boeWindow = Number(policy.boeReviewWindow);

    if (policy.timeUnit === "minutes") {
      deadlineMs = boeWindow * 60 * 1000;
    } else {
      deadlineMs = boeWindow * 24 * 60 * 60 * 1000;
    }

    const deadline = new Date(now.getTime() - deadlineMs);

    console.log(`\n==================================================`);
    console.log(`⚙️ [BOE Time-Gate Check] Running Synchronization Job`);
    console.log(`   - Time Unit Active: ${policy.timeUnit}`);
    console.log(
      `   - BOE Review Window Threshold: ${boeWindow} ${policy.timeUnit}`,
    );
    console.log(`   - Target Cutoff Deadline: ${deadline.toISOString()}`);
    console.log(`==================================================\n`);

    // =======================================
    // FIND EXPIRED RESULTS
    // =======================================

    const expiredResults = await Result.find({
      releaseDate: {
        $lte: deadline,
      },
      finalized: false,
    }).lean();

    if (expiredResults.length === 0) {
      console.log(
        `ℹ️ No expired BOE results found matching deadline criteria.`,
      );
      return {
        finalized: 0,
        skipped: 0,
      };
    }

    console.log(
      `\n🔒 Found ${expiredResults.length} expired BOE result(s) ready for finalization.`,
    );

    let finalized = 0;
    let skipped = 0;

    // =======================================
    // PROCESS EACH RESULT
    // =======================================

    for (const result of expiredResults) {
      const existingFinal = await FinalResult.findOne({
        candidateId: result.candidateId,
        moduleCode: result.moduleCode,
      });

      if (existingFinal) {
        skipped++;
        continue;
      }

      const finalizedAt = new Date();

      const specialWindow = Number(policy.specialConcernsWindow);

      let specialWindowMs = 0;

      if (policy.timeUnit === "minutes") {
        specialWindowMs = specialWindow * 60 * 1000;
      } else {
        specialWindowMs = specialWindow * 24 * 60 * 60 * 1000;
      }

      const blockchainEligibleAt = new Date(
        result.releaseDate.getTime() + specialWindowMs,
      );

      const hash = generateResultHash({
        candidateId: result.candidateId,
        moduleCode: result.moduleCode,
        marks: result.marks,
        grade: result.grade,
        version: result.version,
      });

      const finalResult = new FinalResult({
        candidateId: result.candidateId,
        moduleCode: result.moduleCode,
        marks: result.marks,
        grade: result.grade,
        gradingData: result.gradingData,
        uploader: result.uploader,
        provenanceHash: result.provenanceHash,
        payloadHash: result.payloadHash,
        version: result.version,
        history: result.history || [],
        finalizedAt,
        blockchainEligibleAt,
        hash,
        blockchainStatus: "PENDING",
      });

      await finalResult.save();

      await Result.updateOne(
        {
          _id: result._id,
        },
        {
          $set: {
            finalized: true,
          },
        },
      );

      finalized++;

      console.log(
        `✅ [Finalized] Student: ${result.candidateId} | Module: ${result.moduleCode}`,
      );
      console.log(`   - Version: ${result.version}`);
      console.log(`   - Generated Hash: ${hash}`);
      console.log(
        `   - Blockchain Eligible At: ${blockchainEligibleAt.toISOString()}`,
      );
    }

    console.log(
      `\n📊 Job Complete -> Finalized: ${finalized} | Skipped: ${skipped}\n`,
    );

    return {
      finalized,
      skipped,
    };
  } catch (error) {
    console.error("❌ Finalization service error:", error);
    throw error;
  }
};

module.exports = {
  finalizeExpiredResults,
};
