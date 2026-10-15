const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
// This read-only integration harness uses real upstream evidence without a live employer account.
process.env.MONGODB_URI = '';
const { createVerificationService } = require('../src/verification-service-clean');

async function main() {
  const base = process.env.ACADEMIC_DATA_BASE_URL;
  const fetchJson = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
    return response.json();
  };
  const latest = await fetchJson(`${base}/latest`);
  const root = (latest.proof || latest).merkleRoot.replace(/^0x/, '');
  const dataset = await fetchJson(`${base}/${root}/data`);
  const records = dataset.data?.recordsWithHashes || dataset.data?.records || [];
  console.log(JSON.stringify({ stage: 'liveFinalizedDataset', recordCount: records.length }));
  const service = createVerificationService({ authenticateTokenImpl: async () => ({ role: 'verifier' }) });
  const record = records.find((entry) => service.requirementGrades.includes(entry.grade));
  if (!record) throw new Error('No finalized record with a supported letter grade available for integration check');
  const verify = (minimumGrade) => service.verifyGradeRequirement({ candidateId: record.candidateId, moduleCode: record.moduleCode, minimumGrade, sessionToken: 'integration-harness' });
  const exact = await verify(record.grade);
  console.log(JSON.stringify({ stage: 'liveExactGradeRequirement', ...exact }));
  if (exact.result !== 'MEETS_REQUIREMENT') throw new Error('Live exact grade check did not authenticate successfully');
  const higherGrade = service.requirementGrades[service.requirementGrades.indexOf(record.grade) + 1];
  if (higherGrade) {
    const higher = await verify(higherGrade);
    console.log(JSON.stringify({ stage: 'liveHigherGradeRequirement', ...higher }));
    if (higher.result !== 'DOES_NOT_MEET') throw new Error('Live higher grade check returned an unexpected decision');
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await globalThis.curve_bn128?.terminate();
  await globalThis.curve_bls12381?.terminate();
});
