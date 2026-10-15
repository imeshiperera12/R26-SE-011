const fs = require('fs/promises');
const path = require('path');
const crypto = require('node:crypto');
const jwt = require('./jwt-adapter');
const snarkjs = require('snarkjs');
const { buildPoseidon } = require('circomlibjs');
const {
  canonicalRecordString,
  canonicalizeGrade,
  canonicalizeIdentifier,
  gradeToGpa,
  getMerkleProof,
  normalizeMerkleRoot,
  sha256Hex,
  verifyMerkleProof,
} = require('./verification-utils');
const { listInstitutions, registerInstitution, resolveInstitution } = require('./institutions-clean');
const {
  listCompanies,
  authenticateCompanyUser,
  createCompanyUser,
  updateCompanyUser,
  listCompanyUsers,
  listAuditEvents,
  getPasswordPolicySummary,
  registerCompanyAdmin,
  getUserByEmail,
  getUserById,
  bumpRefreshTokenVersion,
  createRefreshSession,
  getRefreshSession,
  revokeRefreshSession,
  revokeUserRefreshSessions,
  ensureEmailVerificationToken,
  verifyEmailWithToken,
  ensurePasswordResetToken,
  resetPasswordWithToken,
  addAuditEvent,
} = require('./company-accounts');
const { recordVerificationAttempt } = require('./mongo-verification-store');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EMAIL_OUTBOX_FILE = path.join(DATA_DIR, 'email-outbox.json');
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
let poseidonPromise;

function textField(value) {
  return BigInt(`0x${sha256Hex(String(value))}`) % FIELD_MODULUS;
}

function rootLimbs(root) {
  const normalized = normalizeMerkleRoot(root).padStart(64, '0');
  return {
    low: BigInt(`0x${normalized.slice(32)}`),
    high: BigInt(`0x${normalized.slice(0, 32)}`),
  };
}

async function claimPublicSignals({ candidateId, moduleCode, grade, merkleRoot }) {
  poseidonPromise ||= buildPoseidon();
  const poseidon = await poseidonPromise;
  const candidateField = textField(canonicalizeIdentifier(candidateId));
  const moduleField = textField(canonicalizeIdentifier(moduleCode));
  const gradeValue = gradeToCircuitValue(grade);
  const limbs = rootLimbs(merkleRoot);
  const claim = poseidon([candidateField, moduleField, BigInt(gradeValue), limbs.low, limbs.high]);
  const candidateCommitment = poseidon([candidateField]);
  const moduleCommitment = poseidon([moduleField]);
  return {
    candidateField: candidateField.toString(), moduleField: moduleField.toString(), gradeValue: String(gradeValue),
    rootLow: limbs.low.toString(), rootHigh: limbs.high.toString(),
    claimCommitment: poseidon.F.toString(claim),
    candidateCommitment: poseidon.F.toString(candidateCommitment),
    moduleCommitment: poseidon.F.toString(moduleCommitment),
  };
}

function gradeToCircuitValue(grade) {
  const map = { F: 0, D: 1, 'C-': 2, C: 3, 'C+': 4, 'B-': 5, B: 6, 'B+': 7, 'A-': 8, A: 9, 'A+': 10 };
  const normalized = canonicalizeGrade(grade);
  if (!(normalized in map)) throw new Error(`Unsupported grade for ZKP circuit: ${normalized}`);
  return map[normalized];
}

const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'component4-dev-access-secret-change-me';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'component4-dev-refresh-secret-change-me';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '7d';

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function persistJson(filePath, value) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function randomId() {
  return crypto.randomBytes(16).toString('hex');
}

// Component 1's finalized ledger uses SHA-256 over the textual concatenation
// of hexadecimal child hashes. Keep this implementation isolated from the
// legacy byte-concatenation Merkle helper used by local Component 4 fixtures.
function component1HashPair(left, right) {
  return crypto.createHash('sha256').update(`${normalizeMerkleRoot(left)}${normalizeMerkleRoot(right)}`, 'utf8').digest('hex');
}

function component1LeafHash(record) {
  return sha256Hex([record.candidateId, record.moduleCode, record.marks, record.grade, record.version].join('|'));
}

function verifyComponent1MerkleProof(leafHash, proof, expectedRoot) {
  let current = normalizeMerkleRoot(leafHash);
  for (const step of proof || []) {
    const sibling = normalizeMerkleRoot(step.sibling || step.hash || '');
    if (!sibling || !['left', 'right'].includes(step.position)) return false;
    current = step.position === 'left' ? component1HashPair(sibling, current) : component1HashPair(current, sibling);
  }
  return current === normalizeMerkleRoot(expectedRoot);
}


function parseDurationMs(value, fallbackMs) {
  if (!value || typeof value !== 'string') return fallbackMs;
  const match = value.match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;

  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
}

function buildSessionFromClaims(claims) {
  return {
    role: claims.role,
    companyId: claims.companyId,
    companyName: claims.companyName,
    userEmail: claims.userEmail,
    userName: claims.userName,
    userId: claims.sub,
    authType: claims.authType || 'company-credentials',
    institutionId: claims.institutionId || null,
    institutionName: claims.institutionName || null,
    authenticated: true,
    authenticatedAt: claims.iat ? new Date(claims.iat * 1000).toISOString() : new Date().toISOString(),
  };
}

async function appendEmailOutbox(message) {
  const outbox = (await readJsonIfExists(EMAIL_OUTBOX_FILE)) || { messages: [] };
  if (!Array.isArray(outbox.messages)) {
    outbox.messages = [];
  }

  outbox.messages.push({
    id: randomId(),
    createdAt: new Date().toISOString(),
    ...message,
  });

  if (outbox.messages.length > 2000) {
    outbox.messages = outbox.messages.slice(-2000);
  }

  await persistJson(EMAIL_OUTBOX_FILE, outbox);
}

function createVerificationService(options = {}) {
  // This must be Component 1 in a deployed system. Component 4 never selects a
  // root itself: Component 1 maps candidate + module to the anchored root/CID.
  // Development can exercise the entire Component 1 contract against the
  // local mock endpoints. Set this to false once Component 1 provides its
  // deployed base URL and API contract.
  const configuredDataBaseUrl = options.dataBaseUrl || process.env.ACADEMIC_DATA_BASE_URL;
  if (!configuredDataBaseUrl) {
    throw new Error('ACADEMIC_DATA_BASE_URL must point to the Component 1 proof API');
  }
  const dataBaseUrl = configuredDataBaseUrl.replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || global.fetch;
  const verifyProofImpl = options.verifyProofImpl || null;
  const authenticateTokenImpl = options.authenticateTokenImpl || null;
  const refreshTokenTtlMs = parseDurationMs(REFRESH_TOKEN_TTL, 7 * 24 * 60 * 60 * 1000);

  const loginVerificationKeyPaths = options.loginVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_vkey.json'),
    path.resolve(__dirname, '..', '..', 'build', 'verification_key.json'),
  ];
  const gradeVerificationKeyPaths = options.gradeVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'gradeVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'gradeVerifier_vkey.json'),
  ];
  const claimVerificationKeyPaths = options.claimVerificationKeyPaths || [
    path.resolve(__dirname, '..', '..', 'build', 'claimBoundVerifier_verification_key.json'),
    path.resolve(__dirname, '..', '..', 'build', 'claimBoundVerifier_vkey.json'),
  ];
  const claimWasmPath = options.claimWasmPath || path.resolve(__dirname, '..', '..', 'build', 'claimBoundVerifier_js', 'claimBoundVerifier.wasm');
  const claimZkeyPath = options.claimZkeyPath || path.resolve(__dirname, '..', '..', 'build', 'claimBoundVerifier_final.zkey');

  async function loadVerificationKey(candidatePaths) {
    for (const candidatePath of candidatePaths) {
      const key = await readJsonIfExists(candidatePath);
      if (key) {
        return key;
      }
    }

    return null;
  }

  async function verifyProof({ proof, publicSignals, keyPaths }) {
    if (verifyProofImpl) {
      return verifyProofImpl({ proof, publicSignals, keyPaths });
    }

    const verificationKey = await loadVerificationKey(keyPaths);
    if (!verificationKey) {
      // Missing verification material must never turn into an authentication or
      // verification success.
      return false;
    }

    try {
      return await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    } catch (_error) {
      return false;
    }
  }

  async function requestJson(url, options = {}) {
    if (!fetchImpl) {
      throw new Error('Fetch is not available in this runtime');
    }

    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetchImpl(url, requestOptions);
    if (!response.ok) {
      const error = new Error(`Failed to fetch verification data: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  async function fetchJson(url) {
    return requestJson(url);
  }

  async function issueTokensForUser(user, authType = 'company-credentials') {
    const jti = randomId();

    const baseClaims = {
      sub: user.userId,
      role: user.role,
      companyId: user.companyId,
      companyName: user.companyName,
      userEmail: user.email,
      userName: user.name,
      authType,
    };

    const accessToken = jwt.sign(baseClaims, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'component4-security-layer',
      audience: 'component4-api',
    });

    const refreshToken = jwt.sign(
      {
        sub: user.userId,
        typ: 'refresh',
        ver: user.refreshTokenVersion || 0,
        jti,
      },
      REFRESH_TOKEN_SECRET,
      {
        expiresIn: REFRESH_TOKEN_TTL,
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      },
    );

    const now = Date.now();
    await createRefreshSession({
      jti,
      userId: user.userId,
      companyId: user.companyId,
      version: user.refreshTokenVersion || 0,
      expiresAt: new Date(now + refreshTokenTtlMs),
    });

    return {
      accessToken,
      refreshToken,
      session: buildSessionFromClaims(baseClaims),
    };
  }

  async function authenticateToken(token) {
    if (!token) return null;

    if (authenticateTokenImpl) {
      return authenticateTokenImpl(token);
    }

    try {
      const claims = jwt.verify(token, ACCESS_TOKEN_SECRET, {
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      });
      return buildSessionFromClaims(claims);
    } catch (_error) {
      return null;
    }
  }

  async function refreshSessionTokens(refreshToken) {
    if (!refreshToken) {
      return { success: false, status: 400, error: 'refreshToken is required' };
    }

    let claims;
    try {
      claims = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, {
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      });
    } catch (_error) {
      return { success: false, status: 401, error: 'Invalid refresh token' };
    }

    if (claims.typ !== 'refresh' || !claims.jti) {
      return { success: false, status: 401, error: 'Invalid refresh token' };
    }

    const record = await getRefreshSession(claims.jti);

    if (!record || record.revokedAt || record.replacedBy) {
      const userId = claims.sub;
      await revokeUserRefreshSessions(userId);
      await bumpRefreshTokenVersion(userId);

      return { success: false, status: 401, error: 'Refresh token replay detected. Please sign in again.' };
    }

    if (Date.now() > new Date(record.expiresAt).getTime()) {
      await revokeRefreshSession(record.jti);
      return { success: false, status: 401, error: 'Refresh token expired' };
    }

    const user = await getUserById(claims.sub);
    if (!user || user.status !== 'active') {
      return { success: false, status: 401, error: 'User is inactive' };
    }

    const expectedVersion = Number(user.refreshTokenVersion || 0);
    if (Number(claims.ver) !== expectedVersion || Number(record.version) !== expectedVersion) {
      await revokeRefreshSession(record.jti);
      return { success: false, status: 401, error: 'Refresh token invalidated. Please sign in again.' };
    }

    const issued = await issueTokensForUser(user, 'company-credentials');
    const nextClaims = jwt.decode(issued.refreshToken);

    await revokeRefreshSession(record.jti, nextClaims?.jti || null);

    return {
      success: true,
      status: 200,
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      session: issued.session,
    };
  }

  async function revokeToken({ refreshToken }) {
    if (!refreshToken) return;

    try {
      const claims = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, {
        issuer: 'component4-security-layer',
        audience: 'component4-api',
      });
      await revokeRefreshSession(claims.jti);
    } catch (_error) {
      // Ignore invalid refresh tokens during logout.
    }
  }

  async function readVerificationSource() {
    const payload = await fetchJson(`${dataBaseUrl}/latest`);
    const proof = payload?.proof || payload;
    const merkleRoot = normalizeMerkleRoot(proof?.merkleRoot);
    if (!payload?.success || !merkleRoot || !proof?.ipfsCID) {
      throw new Error('Component 1 returned an invalid latest-anchor response');
    }
    return {
      merkleRoot,
      ipfsCID: proof.ipfsCID,
      timestamp: proof.timestamp || null,
      uploadedBy: proof.uploadedBy || null,
    };
  }

  async function fetchFinalizedDataset(merkleRoot) {
    const normalizedRoot = normalizeMerkleRoot(merkleRoot);
    return fetchJson(`${dataBaseUrl}/${normalizedRoot}/data`);
  }

  async function fetchOfficialMerkleProof({ merkleRoot, candidateId, moduleCode }) {
    return requestJson(`${dataBaseUrl}/merkle-proof`, {
      method: 'POST',
      body: {
        merkleRoot,
        candidateId,
        moduleCode,
      },
    });
  }

  async function generateBoundClaimProof({ candidateId, moduleCode, grade, merkleRoot }) {
    const input = await claimPublicSignals({ candidateId, moduleCode, grade, merkleRoot });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, claimWasmPath, claimZkeyPath);
    return { proof, publicSignals, input };
  }

  async function fetchAnchoredMetadata(merkleRoot) {
    const normalizedRoot = normalizeMerkleRoot(merkleRoot);
    const payload = await fetchJson(`${dataBaseUrl}/${normalizedRoot}`);
    // Component 1 may return anchor data directly or wrap it as { proof: {} }.
    // Normalize the contract so both formats remain compatible.
    return payload?.proof ? { success: payload.success, ...payload.proof } : payload;
  }

  async function lookupAnchoredRecord({ candidateId, moduleCode, version }) {
    const candidate = canonicalizeIdentifier(candidateId);
    const module = canonicalizeIdentifier(moduleCode);
    const query = version == null || version === '' ? '' : `?version=${encodeURIComponent(version)}`;
    let payload;
    try {
      payload = await fetchJson(`${dataBaseUrl}/record/${encodeURIComponent(candidate)}/${encodeURIComponent(module)}${query}`);
    } catch (error) {
      if (error.status !== 404) throw error;

      // A blockchain anchor can remain valid even when Component 1's optional
      // MongoDB proof index has been rebuilt. Resolve the reference from the
      // same official latest anchor and finalized IPFS dataset in that case.
      try {
        const source = await readVerificationSource();
        const dataset = await fetchFinalizedDataset(source.merkleRoot);
        const records = dataset?.data?.recordsWithHashes || dataset?.data?.records || [];
        const record = records.find((entry) =>
          canonicalizeIdentifier(entry.candidateId) === candidate &&
          canonicalizeIdentifier(entry.moduleCode) === module &&
          (version == null || version === '' || String(entry.version) === String(version))
        );
        if (!record) throw error;
        return { candidateId: candidate, moduleCode: module, version: record.version, merkleRoot: source.merkleRoot, ipfsCID: source.ipfsCID };
      } catch (_fallbackError) {
        // The direct Component 1 record endpoint is authoritative for a miss.
        // A failed optional dataset fallback must not turn that 404 into 503.
        throw error;
      }
    }
    // Component 1 may return the reference in `record` or at the top level.
    const record = payload?.record || payload;
    const merkleRoot = normalizeMerkleRoot(record?.merkleRoot);

    if (!payload?.success || !record || !merkleRoot || !record.ipfsCID) {
      const error = new Error('Component 1 returned an invalid anchored-record lookup response');
      error.status = 502;
      throw error;
    }

    return {
      candidateId: candidate,
      moduleCode: module,
      version: record.version,
      merkleRoot,
      ipfsCID: record.ipfsCID,
    };
  }


  async function getOfficialVerificationDataset() {
    const source = await readVerificationSource();
    if (!source.merkleRoot) {
      throw new Error('No anchored Merkle root is configured for verification');
    }

    const dataset = await fetchFinalizedDataset(source.merkleRoot);
    const blockchainRoot = normalizeMerkleRoot(dataset?.verificationSource?.blockchain?.merkleRoot || source.merkleRoot);
    const ipfsCID = dataset?.verificationSource?.blockchain?.ipfsCID || source.ipfsCID || null;
    const records = Array.isArray(dataset?.data?.recordsWithHashes) ? dataset.data.recordsWithHashes : [];
    const dataRoot = normalizeMerkleRoot(dataset?.data?.merkleRoot || source.merkleRoot);

    return {
      blockchainRoot,
      dataRoot,
      ipfsCID,
      dataset,
      records,
      source,
      totalRecords: dataset?.data?.totalRecords ?? records.length,
    };
  }

  async function getTranscript(candidateId) {
    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const verificationDataset = await getOfficialVerificationDataset();
    const candidateRecords = verificationDataset.records.filter(
      (record) => canonicalizeIdentifier(record.candidateId) === normalizedCandidateId,
    );

    if (candidateRecords.length === 0) {
      const error = new Error('Candidate not found');
      error.status = 404;
      throw error;
    }

    const transcriptEntries = candidateRecords.map((record, index) => ({
      ...record,
      gpa: gradeToGpa(record.grade),
      index,
    }));

    return {
      candidateId: normalizedCandidateId,
      verificationSource: {
        blockchain: {
          merkleRoot: verificationDataset.blockchainRoot,
          ipfsCID: verificationDataset.ipfsCID,
          timestamp: verificationDataset.source.timestamp,
          uploadedBy: verificationDataset.source.uploadedBy,
        },
      },
      data: {
        merkleRoot: verificationDataset.dataRoot,
        totalRecords: verificationDataset.totalRecords,
        generatedAt: verificationDataset.dataset?.data?.generatedAt || null,
        recordsWithHashes: transcriptEntries,
      },
      transcript: transcriptEntries,
      gpa: transcriptEntries.length
        ? transcriptEntries.reduce((sum, record) => sum + (record.gpa ?? 0), 0) / transcriptEntries.length
        : null,
    };
  }

  async function verifyLoginProof({ institutionId, proof, publicSignals, commitment }) {
    const institution = await resolveInstitution(institutionId);
    if (!institution) {
      return { success: false, status: 404, error: 'Unknown institution' };
    }

    const normalizedSignals = Array.isArray(publicSignals) ? publicSignals.map((value) => String(value ?? '').trim()) : [];
    const normalizedCommitment = String(commitment || normalizedSignals[0] || '').trim();

    if (normalizedCommitment !== institution.commitment) {
      return { success: false, status: 403, error: 'Institution commitment mismatch' };
    }

    if (!proof || !Array.isArray(publicSignals) || normalizedSignals.length !== 1 || normalizedSignals[0] !== institution.commitment) {
      return { success: false, status: 400, error: 'A Groth16 proof with the institution commitment as its only public signal is required' };
    }

    const verified = await verifyProof({ proof, publicSignals, keyPaths: loginVerificationKeyPaths });
    if (!verified) {
      return { success: false, status: 403, error: 'ZKP authentication failed' };
    }

    const claims = {
      sub: `inst:${institution.id}`,
      role: 'institution',
      companyId: institution.id,
      companyName: institution.name,
      userEmail: `${institution.id.toLowerCase()}@institution.local`,
      userName: institution.name,
      authType: 'zkp-institution',
      institutionId: institution.id,
      institutionName: institution.name,
    };

    const token = jwt.sign(claims, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'component4-security-layer',
      audience: 'component4-api',
    });

    return {
      success: true,
      token,
      refreshToken: null,
      institution,
      session: buildSessionFromClaims(claims),
    };
  }

  async function loginCompanyVerifier({ companyId, email, password }) {
    const normalizedCompanyId = String(companyId ?? '').trim().toUpperCase();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const normalizedPassword = String(password ?? '');

    if (!normalizedCompanyId || !normalizedEmail || !normalizedPassword) {
      return { success: false, status: 400, error: 'companyId, email and password are required' };
    }

    const account = await authenticateCompanyUser({
      companyId: normalizedCompanyId,
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (!account || account.success === false) {
      return { success: false, status: 401, error: account?.error || 'Invalid company credentials' };
    }

    if (!account.user.emailVerified) {
      return {
        success: false,
        status: 403,
        error: 'Email not verified. Please verify your email before logging in.',
        requiresEmailVerification: true,
      };
    }

    const issued = await issueTokensForUser(account.user, 'company-credentials');

    return {
      success: true,
      token: issued.accessToken,
      refreshToken: issued.refreshToken,
      account: {
        company: {
          id: account.user.companyId,
          name: account.user.companyName,
          companyId: account.user.companyId,
          companyName: account.user.companyName,
        },
        user: account.user,
      },
      session: issued.session,
    };
  }

  async function signupCompanyAdmin({ companyId, companyName, adminName, adminEmail, adminPassword }) {
    const result = await registerCompanyAdmin({
      companyId,
      companyName,
      adminName,
      adminEmail,
      adminPassword,
    });

    if (!result.success) {
      return { ...result, status: result.status || 400 };
    }

    return {
      ...result,
      status: 201,
      message: 'Company signup successful. You can now sign in with the administrator account.',
    };
  }

  async function requestEmailVerification({ email }) {
    const user = await getUserByEmail(email);
    if (!user) {
      return { success: true, status: 200, message: 'If the account exists, a verification email has been queued.' };
    }

    const verification = await ensureEmailVerificationToken(user.email);
    if (!verification.success) {
      return { success: false, status: 400, error: verification.error };
    }

    await appendEmailOutbox({
      type: 'email_verification',
      to: user.email,
      subject: 'Verify your email',
      metadata: {
        companyId: user.companyId,
        userId: user.userId,
        token: verification.token,
        expiresAt: verification.expiresAt,
      },
    });

    await addAuditEvent('email_verification_requested', user.email, user.companyId, {
      reason: 'manual_request',
    });

    return {
      success: true,
      status: 200,
      message: 'Verification email queued.',
    };
  }

  async function confirmEmailVerification({ token }) {
    const result = await verifyEmailWithToken(token);
    if (!result.success) {
      return { ...result, status: 400 };
    }

    return {
      success: true,
      status: 200,
      user: result.user,
      message: 'Email verified successfully.',
    };
  }

  async function requestPasswordReset({ email }) {
    const user = await getUserByEmail(email);
    if (!user) {
      return { success: true, status: 200, message: 'If the account exists, a reset email has been queued.' };
    }

    const reset = await ensurePasswordResetToken(user.email);
    if (!reset.success) {
      return { success: false, status: 400, error: reset.error };
    }

    await appendEmailOutbox({
      type: 'password_reset',
      to: user.email,
      subject: 'Reset your password',
      metadata: {
        companyId: user.companyId,
        userId: user.userId,
        token: reset.token,
        expiresAt: reset.expiresAt,
      },
    });

    await addAuditEvent('password_reset_requested', user.email, user.companyId, {
      userId: user.userId,
    });

    return {
      success: true,
      status: 200,
      message: 'Password reset email queued.',
    };
  }

  async function confirmPasswordReset({ token, newPassword }) {
    const result = await resetPasswordWithToken(token, newPassword);
    if (!result.success) {
      return { ...result, status: 400 };
    }

    return {
      success: true,
      status: 200,
      user: result.user,
      message: 'Password reset complete.',
    };
  }

  async function getSessionProfile(token) {
    return authenticateToken(token);
  }

  async function resolveAdminActor(sessionToken) {
    const session = await authenticateToken(sessionToken);
    if (!session) {
      return { error: { success: false, status: 401, error: 'Unauthorized' } };
    }

    if (session.role !== 'admin') {
      return { error: { success: false, status: 403, error: 'Admin role is required' } };
    }

    return { session };
  }

  async function getAdminUsers(sessionToken) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return {
      success: true,
      users: await listCompanyUsers(actor.session.companyId),
      passwordPolicy: getPasswordPolicySummary(),
    };
  }

  async function createAdminUser({ sessionToken, email, name, role, password }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    const result = await createCompanyUser(actor.session, {
      email,
      name,
      role,
      password,
    });

    if (result.success) {
      await addAuditEvent('admin_user_created', actor.session.userEmail, actor.session.companyId, { userId: result.user.userId });
    }

    return result;
  }

  async function updateAdminUser({ sessionToken, email, name, role, password }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return updateCompanyUser(actor.session, email, {
      name,
      role,
      password,
    });
  }

  async function getAdminAuditEvents({ sessionToken, limit }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return {
      success: true,
      events: await listAuditEvents({
        companyId: actor.session.companyId,
        limit,
      }),
    };
  }

  async function registerAdminInstitution({ sessionToken, id, name, label, commitment }) {
    const actor = await resolveAdminActor(sessionToken);
    if (actor.error) {
      return actor.error;
    }

    return registerInstitution({
      id,
      name,
      label,
      commitment,
    });
  }

  const requirementGrades = options.gradeOrdering || JSON.parse(process.env.GRADE_REQUIREMENT_ORDER || '["F","E","D","D+","C-","C","C+","B-","B","B+","A-","A","A+"]');
  if (!Array.isArray(requirementGrades) || !requirementGrades.length || new Set(requirementGrades).size !== requirementGrades.length || requirementGrades.some((grade) => typeof grade !== 'string' || !/^[A-F][+-]?$/.test(grade))) {
    throw new Error('GRADE_REQUIREMENT_ORDER must be a unique array of grades ordered lowest to highest');
  }

  async function verifyGradeRequirement({ candidateId, moduleCode, minimumGrade, sessionToken }) {
    const session = await authenticateToken(sessionToken);
    if (!session) return { success: false, status: 401, error: 'Unauthorized' };
    if (!['admin', 'verifier', 'auditor', 'institution'].includes(session.role)) return { success: false, status: 403, error: 'Forbidden' };
    if ([candidateId, moduleCode].some((value) => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.\/-]{0,127}$/.test(value.trim())) || typeof minimumGrade !== 'string' || !requirementGrades.includes(minimumGrade.trim().toUpperCase())) {
      return { success: false, status: 400, error: 'Valid Candidate ID, Module Code and supported minimum grade are required' };
    }
    const unable = () => ({ success: true, status: 200, result: 'UNABLE_TO_VERIFY', evidence: { officialRecordAuthenticated: false } });
    try {
      const lookup = await lookupAnchoredRecord({ candidateId, moduleCode });
      const dataset = await fetchFinalizedDataset(lookup.merkleRoot);
      const records = dataset?.data?.recordsWithHashes || dataset?.data?.records || dataset?.records || [];
      const record = records.find((entry) => canonicalizeIdentifier(entry.candidateId) === canonicalizeIdentifier(candidateId) && canonicalizeIdentifier(entry.moduleCode) === canonicalizeIdentifier(moduleCode));
      if (!record || typeof record.grade !== 'string') return unable();
      const officialGrade = record.grade.trim().toUpperCase();
      if (!requirementGrades.includes(officialGrade)) return unable();
      const expectedHash = record.marks !== undefined && record.version !== undefined
        ? component1LeafHash(record)
        : sha256Hex(canonicalRecordString(record));
      if (normalizeMerkleRoot(record.hash || '') !== normalizeMerkleRoot(expectedHash)) return unable();
      if (lookup.version != null && String(record.version) !== String(lookup.version)) return unable();
      // Reuse the complete anchor, dataset, SHA-256 and Merkle validation chain.
      // The claim here comes exclusively from Component 1, never from the client.
      const authenticated = await verifyGradeRequest({ candidateId, moduleCode, claimedGrade: officialGrade, sessionToken });
      if (authenticated.result !== 'VALID') return unable();
      const meets = requirementGrades.indexOf(officialGrade) >= requirementGrades.indexOf(minimumGrade.trim().toUpperCase());
      return {
        success: true, status: 200,
        result: meets ? 'MEETS_REQUIREMENT' : 'DOES_NOT_MEET',
        evidence: { officialRecordAuthenticated: true, blockchainAnchor: 'VERIFIED', ipfsDataset: 'VERIFIED', recordHash: 'VALID', merkleProof: 'VALID' },
      };
    } catch (_error) {
      return unable();
    }
  }

  async function verifyGradeRequest({ candidateId, moduleCode, claimedGrade, sessionToken, gradeProof, gradePublicSignals }) {
    const session = await authenticateToken(sessionToken);
    if (!session) {
      return { success: false, status: 401, error: 'Unauthorized' };
    }

    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const normalizedModuleCode = canonicalizeIdentifier(moduleCode);
    const normalizedClaimedGrade = String(claimedGrade ?? '').trim().toUpperCase();

    if (!normalizedCandidateId || !normalizedModuleCode || !normalizedClaimedGrade) {
      return { success: false, status: 400, error: 'Missing required academic verification fields' };
    }

    const checks = {
      recordFound: false,
      blockchainAnchorValid: false,
      ipfsDatasetValid: false,
      hashMatch: false,
      merkleProofValid: false,
      zkpValid: false,
    };
    const failure = (status, error, code) => ({
      success: false,
      status,
      result: 'INVALID',
      tampered: true,
      error,
      code,
      candidateId: normalizedCandidateId,
      moduleCode: normalizedModuleCode,
      checks,
    });

    let lookup;
    try {
      lookup = await lookupAnchoredRecord({ candidateId: normalizedCandidateId, moduleCode: normalizedModuleCode });
    } catch (error) {
      return failure(error.status === 404 ? 404 : 503, error.status === 404 ? 'Official record reference not found' : 'Component 1 lookup service is unavailable', error.status === 404 ? 'RECORD_NOT_FOUND' : 'COMPONENT1_LOOKUP_UNAVAILABLE');
    }

    let verificationDataset;
    try {
      const anchor = await fetchAnchoredMetadata(lookup.merkleRoot);
      const anchorRoot = normalizeMerkleRoot(anchor?.merkleRoot);
      const anchorCid = anchor?.ipfsCID || null;
      if (!anchor?.success || anchorRoot !== lookup.merkleRoot || !anchorCid || anchorCid !== lookup.ipfsCID) {
        return failure(409, 'Blockchain anchor does not match Component 1 record reference', 'BLOCKCHAIN_ANCHOR_MISMATCH');
      }
      checks.blockchainAnchorValid = true;

      const dataset = await fetchFinalizedDataset(lookup.merkleRoot);
      const blockchainRoot = normalizeMerkleRoot(dataset?.verificationSource?.blockchain?.merkleRoot || '');
      const dataRoot = normalizeMerkleRoot(dataset?.data?.merkleRoot || '');
      if (blockchainRoot !== anchorRoot || dataRoot !== anchorRoot) {
        return failure(409, 'Blockchain and IPFS dataset Merkle roots do not match', 'BLOCKCHAIN_IPFS_ROOT_MISMATCH');
      }
      const datasetCid = dataset?.verificationSource?.blockchain?.ipfsCID || dataset?.data?.ipfsCID || null;
      if (!datasetCid || datasetCid !== anchorCid) {
        return failure(409, 'IPFS dataset CID does not match the blockchain anchor', 'IPFS_CID_MISMATCH');
      }
      checks.ipfsDatasetValid = true;
      verificationDataset = {
        blockchainRoot,
        dataRoot,
        ipfsCID: lookup.ipfsCID,
        dataset,
        records: dataset?.data?.recordsWithHashes || dataset?.data?.records || dataset?.records || [],
        source: { merkleRoot: blockchainRoot, ipfsCID: lookup.ipfsCID, timestamp: dataset?.verificationSource?.blockchain?.timestamp || null, uploadedBy: dataset?.verificationSource?.blockchain?.uploadedBy || null },
      };
    } catch (error) {
      return failure(error.status || 503, 'Component 1 anchored dataset service is unavailable', 'COMPONENT1_DATA_UNAVAILABLE');
    }
    const recordIndex = verificationDataset.records.findIndex(
      (record) =>
        canonicalizeIdentifier(record.candidateId) === normalizedCandidateId &&
        canonicalizeIdentifier(record.moduleCode) === normalizedModuleCode,
    );

    if (recordIndex < 0) {
      return failure(404, 'Official record not found in the finalized dataset', 'RECORD_NOT_FOUND');
    }
    checks.recordFound = true;

    const record = verificationDataset.records[recordIndex];

    let officialProof;
    const merkleProofSource = 'component1-endpoint';
    try {
      officialProof = await fetchOfficialMerkleProof({
        merkleRoot: `0x${verificationDataset.blockchainRoot}`,
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
      });
    } catch (_error) {
      return failure(503, 'Component 1 Merkle-proof service is unavailable', 'COMPONENT1_MERKLE_UNAVAILABLE');
    }

    if (!officialProof?.success || !Array.isArray(officialProof.proof)) {
      return failure(502, 'Component 1 returned an invalid Merkle proof', 'INVALID_MERKLE_PROOF_RESPONSE');
    }

    const officialRecord = officialProof?.record || record;
    const officialHash = normalizeMerkleRoot(officialRecord?.hash || record.hash || '');
    // Component 1's leaf commits to marks and version as well as the claim.
    // Component 4 validates that official leaf locally, then compares only the
    // employer-supplied grade; raw official values never leave this backend.
    // A single-record Component 1 dataset has an empty Merkle proof, so proof
    // step shape alone cannot identify its five-field leaf contract.
    const usesComponent1MerkleContract =
      (officialRecord?.marks !== undefined && officialRecord?.version !== undefined) ||
      (Array.isArray(officialProof?.proof) && officialProof.proof.some((step) => Object.prototype.hasOwnProperty.call(step, 'hash')));
    const officialLeafValid = usesComponent1MerkleContract
      ? officialHash === normalizeMerkleRoot(component1LeafHash(officialRecord))
      : officialHash === normalizeMerkleRoot(sha256Hex(canonicalRecordString({ candidateId: normalizedCandidateId, moduleCode: normalizedModuleCode, grade: normalizedClaimedGrade })));
    const claimTargetsOfficialRecord =
      canonicalizeIdentifier(officialRecord.candidateId) === normalizedCandidateId &&
      canonicalizeIdentifier(officialRecord.moduleCode) === normalizedModuleCode &&
      canonicalizeGrade(officialRecord.grade) === normalizedClaimedGrade;
    const hashValid = officialLeafValid && claimTargetsOfficialRecord;
    checks.hashMatch = hashValid;

    const officialProofRoot = normalizeMerkleRoot(officialProof.merkleRoot || verificationDataset.blockchainRoot);
    const proof = officialProof.proof;
    const proofFromEndpointValid = officialProof.proofVerified === true;
    const locallyReconstructedValid = usesComponent1MerkleContract
      ? verifyComponent1MerkleProof(officialHash, proof, officialProofRoot)
      : verifyMerkleProof(officialHash, proof, officialProofRoot);
    const merkleValid =
      proofFromEndpointValid &&
      locallyReconstructedValid &&
      verificationDataset.blockchainRoot === verificationDataset.dataRoot &&
      officialProofRoot === verificationDataset.blockchainRoot;
    checks.merkleProofValid = merkleValid;

    const zkpRequired = String(process.env.REQUIRE_GRADE_ZKP || 'false').toLowerCase() === 'true';
    let zkpValid = true;
    if (zkpRequired) {
      // The portal does not receive the official grade/marks.  Component 4
      // therefore creates a short-lived bound proof from the authenticated
      // Component 1 response when the client has not supplied one.  A client
      // supplied proof is accepted only when it uses the five-signal bound
      // circuit, preventing replay of the legacy grade-only proof.
      let proofToVerify = gradeProof;
      let signalsToVerify = gradePublicSignals;
      if (!proofToVerify || !Array.isArray(signalsToVerify) || signalsToVerify.length !== 5) {
        if (!claimTargetsOfficialRecord) {
          return failure(400, 'A claim-bound ZKP is required and the claimed grade is not official', 'ZKP_PROOF_REQUIRED');
        }
        try {
          const generated = await generateBoundClaimProof({
            candidateId: normalizedCandidateId,
            moduleCode: normalizedModuleCode,
            grade: normalizedClaimedGrade,
            merkleRoot: verificationDataset.blockchainRoot,
          });
          proofToVerify = generated.proof;
          signalsToVerify = generated.publicSignals;
        } catch (_error) {
          return failure(503, 'Claim-bound ZKP artifacts are unavailable', 'ZKP_ARTIFACTS_UNAVAILABLE');
        }
      }
      zkpValid = Array.isArray(signalsToVerify) && signalsToVerify.length === 5
        ? await verifyProof({ proof: proofToVerify, publicSignals: signalsToVerify, keyPaths: claimVerificationKeyPaths })
        : false;
    } else if (gradeProof && gradePublicSignals) {
      // Backward-compatible opt-in verification for the original grade-only
      // circuit while deployments migrate to the claim-bound artifact.
      zkpValid = await verifyProof({ proof: gradeProof, publicSignals: gradePublicSignals, keyPaths: gradeVerificationKeyPaths });
    }
    checks.zkpValid = zkpValid;

    const valid = checks.recordFound && checks.blockchainAnchorValid && checks.ipfsDatasetValid && checks.hashMatch && checks.merkleProofValid && checks.zkpValid;

    const response = {
      success: valid,
      status: 200,
      valid,
      result: valid ? 'VALID' : 'INVALID',
      tampered: !valid,
      verificationSource: {
        blockchain: {
          merkleRoot: verificationDataset.blockchainRoot,
          ipfsCID: verificationDataset.ipfsCID,
          timestamp: verificationDataset.source.timestamp,
          uploadedBy: verificationDataset.source.uploadedBy,
        },
      },
      claim: {
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
        claimedGrade: normalizedClaimedGrade,
      },
      checks,
    };

    try {
      await recordVerificationAttempt({
        session,
        candidateId: normalizedCandidateId,
        moduleCode: normalizedModuleCode,
        claimedGrade: normalizedClaimedGrade,
        result: response,
      });
    } catch (error) {
      // The cryptographic decision is retained; server startup checks MongoDB
      // connectivity whenever MONGODB_URI is configured.
      console.error('Unable to persist Component 4 verification history:', error.message);
    }

    return response;
  }


  function formatRootWithPrefix(rootValue) {
    const normalized = normalizeMerkleRoot(rootValue);
    return normalized ? `0x${normalized}` : null;
  }

  async function getMerkleProofForRecord({ merkleRoot, candidateId, moduleCode }) {
    const normalizedCandidateId = canonicalizeIdentifier(candidateId);
    const normalizedModuleCode = canonicalizeIdentifier(moduleCode);
    const requestedRoot = normalizeMerkleRoot(merkleRoot);

    if (!requestedRoot || !normalizedCandidateId || !normalizedModuleCode) {
      return { success: false, status: 400, error: 'Missing required fields: merkleRoot, candidateId, moduleCode' };
    }

    const verificationDataset = await getOfficialVerificationDataset();
    const blockchainRoot = normalizeMerkleRoot(verificationDataset.blockchainRoot);
    const dataRoot = normalizeMerkleRoot(verificationDataset.dataRoot);

    if (requestedRoot !== blockchainRoot && requestedRoot !== dataRoot) {
      return { success: false, status: 404, error: 'Merkle root not found' };
    }

    const leafIndex = verificationDataset.records.findIndex(
      (record) =>
        canonicalizeIdentifier(record.candidateId) === normalizedCandidateId &&
        canonicalizeIdentifier(record.moduleCode) === normalizedModuleCode,
    );

    if (leafIndex < 0) {
      return { success: false, status: 404, error: 'Candidate or module not found in finalized dataset' };
    }

    const record = verificationDataset.records[leafIndex];
    const proof = getMerkleProof(verificationDataset.records.map((entry) => entry.hash), leafIndex);
    const proofVerified = verifyMerkleProof(record.hash, proof, blockchainRoot);

    return {
      success: true,
      status: 200,
      merkleRoot: formatRootWithPrefix(blockchainRoot),
      ipfsCID: verificationDataset.ipfsCID,
      record: {
        candidateId: record.candidateId,
        moduleCode: record.moduleCode,
        version: record.version,
        hash: normalizeMerkleRoot(record.hash),
      },
      leafIndex,
      proof,
      proofVerified,
    };
  }

  return {
    authenticateToken,
    verifyGradeRequirement,
    requirementGrades: [...requirementGrades],
    refreshSessionTokens,
    createAdminUser,
    confirmEmailVerification,
    confirmPasswordReset,
    fetchFinalizedDataset,
    lookupAnchoredRecord,
    getAdminAuditEvents,
    getAdminUsers,
    getMerkleProofForRecord,
    getOfficialVerificationDataset,
    getSessionProfile,
    getTranscript,
    listCompanies,
    listInstitutions,
    loginCompanyVerifier,
    readVerificationSource,
    registerAdminInstitution,
    requestEmailVerification,
    requestPasswordReset,
    revokeToken,
    signupCompanyAdmin,
    updateAdminUser,
    verifyGradeRequest,
    verifyLoginProof,
  };
}

module.exports = {
  createVerificationService,
};
