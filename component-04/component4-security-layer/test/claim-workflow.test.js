const test = require('node:test');
const assert = require('node:assert/strict');

const { createVerificationService } = require('../backend/src/verification-service-clean');
const { buildMerkleTree, canonicalRecordString, getMerkleProof, sha256Hex } = require('../backend/src/verification-utils');

const CID = 'bafycomponent1finalizeddataset';
const RECORD = { candidateId: 'TEST001', moduleCode: 'SE3040', grade: 'A-', version: 1 };
const HASH = sha256Hex(canonicalRecordString(RECORD));
const ROOT = HASH;
const TREE = buildMerkleTree([HASH]);

function component1Fetch({ lookup = true, anchored = true, dataRoot = ROOT, validProof = true } = {}) {
  return async (url, options = {}) => {
    const response = (status, body) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });
    if (url.includes('/record/')) {
      return lookup
        ? response(200, { success: true, record: { candidateId: RECORD.candidateId, moduleCode: RECORD.moduleCode, version: 1, merkleRoot: `0x${ROOT}`, ipfsCID: CID } })
        : response(404, { success: false });
    }
    if (url.endsWith(`/${ROOT}`)) {
      return anchored
        ? response(200, { success: true, merkleRoot: `0x${ROOT}`, ipfsCID: CID })
        : response(404, { success: false });
    }
    if (url.endsWith(`/${ROOT}/data`)) {
      return response(200, {
        verificationSource: { blockchain: { merkleRoot: `0x${ROOT}`, ipfsCID: CID } },
        data: { merkleRoot: `0x${dataRoot}`, ipfsCID: CID, recordsWithHashes: [{ ...RECORD, hash: HASH }] },
      });
    }
    if (url.endsWith('/merkle-proof')) {
      assert.equal(JSON.parse(options.body).candidateId, 'TEST001');
      assert.equal(JSON.parse(options.body).moduleCode, 'SE3040');
      return response(200, {
        success: true,
        merkleRoot: `0x${ROOT}`,
        record: { ...RECORD, hash: HASH },
        proof: validProof ? getMerkleProof([HASH], 0) : [{ position: 'right', sibling: 'b'.repeat(64) }],
        proofVerified: validProof,
      });
    }
    throw new Error(`Unexpected Component 1 URL: ${url}`);
  };
}

function service(options = {}) {
  return createVerificationService({
    dataBaseUrl: 'http://component1/proof',
    fetchImpl: component1Fetch(options),
    authenticateTokenImpl: async (token) => token === 'authorized' ? { userId: 'u1', userEmail: 'verifier@example.edu', companyId: 'EMP', role: 'verifier' } : null,
    verifyProofImpl: async ({ proof }) => proof?.valid === true,
  });
}

async function verify(overrides = {}, config = {}) {
  return service(config).verifyGradeRequest({
    candidateId: 'TEST001', moduleCode: 'SE3040', claimedGrade: 'A-', sessionToken: 'authorized', ...overrides,
  });
}

test('correct claim is VALID using the Component 1 anchor chain', async () => {
  const result = await verify();
  assert.equal(result.result, 'VALID');
  assert.deepEqual(result.checks, { recordFound: true, blockchainAnchorValid: true, ipfsDatasetValid: true, hashMatch: true, merkleProofValid: true, zkpValid: true });
});

test('single-record Component 1 dataset uses the five-field leaf hash with an empty proof', async () => {
  const record = { candidateId: 'IT22111210', moduleCode: 'SE4010', marks: 55, grade: 'B', version: 1 };
  const hash = sha256Hex([record.candidateId, record.moduleCode, record.marks, record.grade, record.version].join('|'));
  const fetchImpl = async (url, options = {}) => {
    const response = (status, body) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });
    if (url.includes('/record/')) return response(200, { success: true, record: { ...record, merkleRoot: `0x${hash}`, ipfsCID: CID } });
    if (url.endsWith(`/${hash}`)) return response(200, { success: true, merkleRoot: `0x${hash}`, ipfsCID: CID });
    if (url.endsWith(`/${hash}/data`)) return response(200, {
      verificationSource: { blockchain: { merkleRoot: `0x${hash}`, ipfsCID: CID } },
      data: { merkleRoot: `0x${hash}`, ipfsCID: CID, recordsWithHashes: [{ ...record, hash }] },
    });
    if (url.endsWith('/merkle-proof')) {
      const claim = JSON.parse(options.body);
      assert.deepEqual({ candidateId: claim.candidateId, moduleCode: claim.moduleCode }, { candidateId: record.candidateId, moduleCode: record.moduleCode });
      return response(200, { success: true, merkleRoot: `0x${hash}`, record: { ...record, hash }, proof: [], proofVerified: true });
    }
    throw new Error(`Unexpected Component 1 URL: ${url}`);
  };
  const component1Service = createVerificationService({
    dataBaseUrl: 'http://component1/proof',
    fetchImpl,
    authenticateTokenImpl: async () => ({ userId: 'u1', userEmail: 'verifier@example.edu', companyId: 'EMP', role: 'verifier' }),
  });

  const result = await component1Service.verifyGradeRequest({ ...record, claimedGrade: record.grade, sessionToken: 'authorized' });
  assert.equal(result.result, 'VALID');
  assert.equal(result.checks.hashMatch, true);
  assert.equal(result.checks.merkleProofValid, true);
});


test('wrong claimed grade is INVALID without sending grade to lookup', async () => {
  const result = await verify({ claimedGrade: 'B' });
  assert.equal(result.result, 'INVALID');
  assert.equal(result.checks.hashMatch, false);
  assert.equal(result.checks.merkleProofValid, true);
});

test('unknown candidate returns RECORD_NOT_FOUND', async () => {
  const result = await verify({ candidateId: 'TEST999' }, { lookup: false });
  assert.equal(result.status, 404);
  assert.equal(result.code, 'RECORD_NOT_FOUND');
});

test('unknown module returns RECORD_NOT_FOUND', async () => {
  const result = await verify({ moduleCode: 'SE9999' }, { lookup: false });
  assert.equal(result.status, 404);
  assert.equal(result.code, 'RECORD_NOT_FOUND');
});

test('blockchain/IPFS root mismatch is detected', async () => {
  const result = await verify({}, { dataRoot: 'b'.repeat(64) });
  assert.equal(result.status, 409);
  assert.equal(result.code, 'BLOCKCHAIN_IPFS_ROOT_MISMATCH');
});

test('invalid Component 1 Merkle proof is INVALID', async () => {
  const result = await verify({}, { validProof: false });
  assert.equal(result.result, 'INVALID');
  assert.equal(result.checks.merkleProofValid, false);
});

test('invalid supplied ZKP makes the claim INVALID', async () => {
  const result = await verify({ gradeProof: { valid: false }, gradePublicSignals: ['signal'] });
  assert.equal(result.result, 'INVALID');
  assert.equal(result.checks.zkpValid, false);
});

test('Component 1 lookup outage is reported clearly', async () => {
  const unavailable = createVerificationService({
    dataBaseUrl: 'http://component1/proof',
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); },
    authenticateTokenImpl: async () => ({ userId: 'u1', userEmail: 'verifier@example.edu', companyId: 'EMP', role: 'verifier' }),
  });
  const result = await unavailable.verifyGradeRequest({ candidateId: 'TEST001', moduleCode: 'SE3040', claimedGrade: 'A-', sessionToken: 'authorized' });
  assert.equal(result.status, 503);
  assert.equal(result.code, 'COMPONENT1_LOOKUP_UNAVAILABLE');
});
