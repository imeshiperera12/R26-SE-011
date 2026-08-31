const FinalResult = require("../models/FinalResult");
const { sendResultsToComponent1 } = require("../services/blockchainService");

// =======================================
// DYNAMIC POLICY READER
// =======================================

const getPolicyConfig = () => {
  return {
    timeUnit: process.env.TIME_UNIT || "minutes",
    specialConcernsWindow: Number(process.env.SPECIAL_CONCERNS_WINDOW || 3),
  };
};

// =======================================
// AUTOMATIC BLOCKCHAIN JOB
// =======================================

const JOB_INTERVAL = 5000; // 5 seconds

const startBlockchainJob = () => {
  // Run once when server starts
  runBlockchainSync();

  // Run every 5 seconds
  setInterval(async () => {
    await runBlockchainSync();
  }, JOB_INTERVAL);

  console.log("⛓️ High-Speed Synchronized Blockchain Job Started.");
  console.log("   → Checking blockchain-eligible results every 5 seconds.");
};

// =======================================
// RUN BLOCKCHAIN SYNC
// =======================================

const runBlockchainSync = async () => {
  try {
    const policy = getPolicyConfig();

    const now = new Date();

    const eligibleResults = await FinalResult.find({
      blockchainEligibleAt: {
        $lte: now,
      },

      blockchainStatus: {
        $in: ["PENDING", "READY"],
      },
    });

    if (eligibleResults.length === 0) {
      return;
    }

    console.log(
      `\n🔗 [Blockchain Sync] Found ${eligibleResults.length} eligible result(s) ` +
        `ready for anchoring (Unit: ${policy.timeUnit}).`,
    );

    // =======================================
    // MARK RESULTS AS READY
    // =======================================

    for (const result of eligibleResults) {
      if (result.blockchainStatus === "PENDING") {
        result.blockchainStatus = "READY";

        await result.save();
      }
    }

    // =======================================
    // SEND TO COMPONENT 1
    // =======================================

    try {
      await sendResultsToComponent1(eligibleResults);

      // =======================================
      // MARK AS STORED
      // =======================================

      for (const result of eligibleResults) {
        result.blockchainStatus = "STORED";

        result.blockchainStoredAt = new Date();

        await result.save();
      }

      console.log(
        `✅ Successfully anchored ${eligibleResults.length} result(s) to Component 1.`,
      );
    } catch (error) {
      console.error("❌ Failed to send results to Component 1:", error.message);

      // Keep them ready for retry
      for (const result of eligibleResults) {
        result.blockchainStatus = "READY";

        await result.save();
      }

      console.log("🔄 Results remain READY and will be retried on next tick.");
    }
  } catch (error) {
    console.error("❌ Blockchain synchronization failed:", error);
  }
};

module.exports = {
  startBlockchainJob,
};
