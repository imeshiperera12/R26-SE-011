const test = require('node:test');
const assert = require('node:assert/strict');
const { createVerificationService } = require('../backend/src/verification-service-clean');
const { sha256Hex } = require('../backend/src/verification-utils');

function service(config = {}) {
  const record = { candidateId: 'TEST001', moduleCode: 'SE3040', marks: 75, grade: config.grade || 'A-', version: 1 };
  const hash = sha256Hex([record.candidateId, record.moduleCode, record.marks, record.grade, record.version].join('|'));
  const cid = 'bafyfinalized';
  const response = (status, body) => ({ ok: status === 200, status, json: async () => body });
  return createVerificationService({
    dataBaseUrl: 'http://component1/proof',
    gradeOrdering: config.gradeOrdering,
    authenticateTokenImpl: async (token) => token === 'authorized' ? { role: config.role || 'verifier' } : null,
    fetchImpl: async (url) => {
      if (config.failure === 'anchor' && url.endsWith(`/${hash}`)) throw new Error('Blockchain unavailable');
      if (config.failure && url.includes(config.failure)) throw new Error('Network unavailable');
      if (url.includes('/record/')) return config.missing ? response(404, {}) : response(200, { success: true, record: { ...record, merkleRoot: hash, ipfsCID: cid } });
      if (url.endsWith(`/${hash}`)) return response(200, { success: true, merkleRoot: hash, ipfsCID: cid });
      if (url.endsWith(`/${hash}/data`)) return response(200, { verificationSource: { blockchain: { merkleRoot: hash, ipfsCID: cid } }, data: { merkleRoot: hash, recordsWithHashes: [{ ...record, hash, ...(config.datasetTamper ? { marks: 99 } : {}) }] } });
      if (url.endsWith('/merkle-proof')) return response(200, { success: true, merkleRoot: hash, record: { ...record, hash, ...(config.tamper ? { marks: 99 } : {}) }, proof: config.badProof ? [{ position: 'right', hash: 'b'.repeat(64) }] : [], proofVerified: true });
      return response(404, {});
    },
  });
}
const input = { candidateId: 'TEST001', moduleCode: 'SE3040', minimumGrade: 'B+', sessionToken: 'authorized' };
for (const [name, config, minimumGrade, expected] of [
  ['A- meets B+', {}, 'B+', 'MEETS_REQUIREMENT'],
  ['B does not meet A', { grade: 'B' }, 'A', 'DOES_NOT_MEET'],
  ['exact match meets requirement', {}, 'A-', 'MEETS_REQUIREMENT'],
  ['missing record', { missing: true }, 'B+', 'UNABLE_TO_VERIFY'],
  ['tampered record hash', { tamper: true }, 'B+', 'UNABLE_TO_VERIFY'],
  ['tampered IPFS record', { datasetTamper: true }, 'B+', 'UNABLE_TO_VERIFY'],
  ['invalid Merkle proof despite upstream success', { badProof: true }, 'B+', 'UNABLE_TO_VERIFY'],
  ['lookup outage', { failure: '/record/' }, 'B+', 'UNABLE_TO_VERIFY'],
  ['blockchain outage', { failure: 'anchor' }, 'B+', 'UNABLE_TO_VERIFY'],
  ['IPFS outage', { failure: '/data' }, 'B+', 'UNABLE_TO_VERIFY'],
  ['Merkle service outage', { failure: '/merkle-proof' }, 'B+', 'UNABLE_TO_VERIFY'],
]) {
  test(name, async () => {
    const result = await service(config).verifyGradeRequirement({ ...input, minimumGrade });
    assert.equal(result.result, expected);
    assert.equal(result.evidence.officialRecordAuthenticated, expected !== 'UNABLE_TO_VERIFY');
    for (const field of ['grade', 'marks', 'record', 'claim', 'proof', 'publicSignals']) assert.equal(Object.hasOwn(result, field), false);
  });
}
test('invalid fields and unsupported grades are rejected', async () => {
  for (const overrides of [{ minimumGrade: 'Z' }, { minimumGrade: 3 }, { candidateId: {} }, { moduleCode: '' }, { candidateId: 'x'.repeat(129) }]) {
    assert.equal((await service().verifyGradeRequirement({ ...input, ...overrides })).status, 400);
  }
});
test('unknown module cannot produce an academic decision', async () => {
  assert.equal((await service().verifyGradeRequirement({ ...input, moduleCode: 'UNKNOWN' })).result, 'UNABLE_TO_VERIFY');
});
test('authentication and roles are enforced', async () => {
  assert.equal((await service().verifyGradeRequirement({ ...input, sessionToken: 'invalid' })).status, 401);
  assert.equal((await service({ role: 'student' }).verifyGradeRequirement(input)).status, 403);
});
test('configured scale controls accepted grades', async () => {
  assert.equal((await service({ gradeOrdering: ['F', 'B', 'A'] }).verifyGradeRequirement(input)).status, 400);
});


test('HTTP endpoint protects authorization, validates input and returns only decisions', async () => {
  // Loading the API reads .env; fixture tests must never connect to a live DB.
  process.env.MONGODB_URI = '';
  process.env.REQUIRE_GRADE_ZKP = 'false';
  const supertest = require('../backend/node_modules/supertest');
  const serviceModule = require('../backend/src/verification-service-clean');
  const originalFactory = serviceModule.createVerificationService;
  const instance = service();
  serviceModule.createVerificationService = () => instance;
  let app;
  try { app = require('../backend/src/api-server-clean'); }
  finally { serviceModule.createVerificationService = originalFactory; }
  const request = supertest(app);
  await request.post('/api/verify/grade-requirement').send(input).expect(401);
  const result = await request.post('/api/verify/grade-requirement').set('Authorization', 'Bearer authorized').send({ ...input, grade: 'F' }).expect(200);
  assert.deepEqual(result.body, { success: true, result: 'MEETS_REQUIREMENT', evidence: { officialRecordAuthenticated: true, blockchainAnchor: 'VERIFIED', ipfsDataset: 'VERIFIED', recordHash: 'VALID', merkleProof: 'VALID' } });
  await request.post('/api/verify/grade-requirement').set('Authorization', 'Bearer authorized').send({ ...input, minimumGrade: 'Z' }).expect(400);
  const scale = await request.get('/api/verify/grade-scale').set('Authorization', 'Bearer authorized').expect(200);
  assert.equal(scale.body.grades[0], 'A+');
  await request.post('/api/verify/transcript').set('Authorization', 'Bearer authorized').send(input).expect(404);
  const claim = await request.post('/api/verify/claim').set('Authorization', 'Bearer authorized').send({ ...input, claimedGrade: 'A-' }).expect(200);
  assert.deepEqual(claim.body, { success: true, valid: true, result: 'VALID' });
});

test.after(async () => {
  await globalThis.curve_bn128?.terminate();
  await globalThis.curve_bls12381?.terminate();
});
