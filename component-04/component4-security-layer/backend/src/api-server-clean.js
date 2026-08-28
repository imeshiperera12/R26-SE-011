require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { createVerificationService } = require('./verification-service-clean');
const { connectMongo, pingMongo } = require('./mongo-verification-store');

const app = express();
const port = Number(process.env.PORT || 3000);
const verificationService = createVerificationService();

app.use(express.json({ limit: '2mb' }));
app.disable('x-powered-by');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 300),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT || 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Please try again later.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/zkp', authLimiter);

function extractToken(req) {
  const authorization = req.get('authorization') || '';

  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return req.body?.token || null;
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  const sessionData = await verificationService.authenticateToken(token);

  if (!sessionData) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  req.authSession = sessionData;
  req.authToken = token;
  return next();
}

function requireRole(allowedRoles) {
  return function roleGuard(req, res, next) {
    const role = req.authSession?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: insufficient role privileges' });
    }

    return next();
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/auth/companies', async (_req, res) => {
  const companies = await verificationService.listCompanies();
  res.json({ success: true, companies });
});

app.get('/api/auth/institutions', async (_req, res) => {
  const institutions = await verificationService.listInstitutions();
  return res.json({ success: true, institutions });
});

app.get('/api/auth/artifacts/login/wasm', (_req, res) => {
  return res.sendFile(path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_js', 'loginVerifier.wasm'));
});

app.get('/api/auth/artifacts/login/zkey', (_req, res) => {
  return res.sendFile(path.resolve(__dirname, '..', '..', 'build', 'loginVerifier_final.zkey'));
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await verificationService.loginCompanyVerifier(req.body || {});

    if (!result.success) {
      return res.status(result.status || 401).json(result);
    }

    return res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      account: result.account,
      session: result.session,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Credential authentication failed' });
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const result = await verificationService.signupCompanyAdmin({
      companyId: req.body?.companyId,
      companyName: req.body?.companyName,
      adminName: req.body?.adminName,
      adminEmail: req.body?.adminEmail,
      adminPassword: req.body?.adminPassword,
    });

    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.status(result.status || 201).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Company signup failed' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const result = await verificationService.refreshSessionTokens(req.body?.refreshToken);
    if (!result.success) {
      return res.status(result.status || 401).json(result);
    }

    return res.status(200).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

app.post('/api/auth/email/verification/request', async (req, res) => {
  try {
    const result = await verificationService.requestEmailVerification({ email: req.body?.email });
    return res.status(result.status || 200).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Unable to request verification email' });
  }
});

app.post('/api/auth/email/verification/confirm', async (req, res) => {
  try {
    const result = await verificationService.confirmEmailVerification({ token: req.body?.token });
    return res.status(result.status || 200).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Unable to verify email token' });
  }
});

app.post('/api/auth/password-reset/request', async (req, res) => {
  try {
    const result = await verificationService.requestPasswordReset({ email: req.body?.email });
    return res.status(result.status || 200).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Unable to request password reset' });
  }
});

app.post('/api/auth/password-reset/confirm', async (req, res) => {
  try {
    const result = await verificationService.confirmPasswordReset({
      token: req.body?.token,
      newPassword: req.body?.newPassword,
    });
    return res.status(result.status || 200).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Unable to reset password' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({
    success: true,
    session: req.authSession,
  });
});

app.get('/api/admin/users', requireAuth, requireRole(['admin']), async (req, res) => {
  const result = await verificationService.getAdminUsers(req.authToken);
  if (!result.success) {
    return res.status(result.status || 400).json(result);
  }

  return res.json(result);
});

app.post('/api/admin/users', requireAuth, requireRole(['admin']), async (req, res) => {
  const result = await verificationService.createAdminUser({
    sessionToken: req.authToken,
    email: req.body?.email,
    name: req.body?.name,
    role: req.body?.role,
    password: req.body?.password,
  });

  if (!result.success) {
    return res.status(result.status || 400).json(result);
  }

  return res.status(result.status || 201).json(result);
});

app.patch('/api/admin/users/:email', requireAuth, requireRole(['admin']), async (req, res) => {
  const result = await verificationService.updateAdminUser({
    sessionToken: req.authToken,
    email: decodeURIComponent(req.params.email || ''),
    name: req.body?.name,
    role: req.body?.role,
    password: req.body?.password,
  });

  if (!result.success) {
    return res.status(result.status || 400).json(result);
  }

  return res.status(result.status || 200).json(result);
});

app.get('/api/admin/audit', requireAuth, requireRole(['admin']), async (req, res) => {
  const result = await verificationService.getAdminAuditEvents({
    sessionToken: req.authToken,
    limit: req.query?.limit,
  });

  if (!result.success) {
    return res.status(result.status || 400).json(result);
  }

  return res.json(result);
});

app.post('/api/admin/institutions', requireAuth, requireRole(['admin']), async (req, res) => {
  const result = await verificationService.registerAdminInstitution({
    sessionToken: req.authToken,
    id: req.body?.id,
    name: req.body?.name,
    label: req.body?.label,
    commitment: req.body?.commitment,
  });
  return res.status(result.status || (result.success ? 201 : 400)).json(result);
});

app.post('/api/admin/evidence/run', requireAuth, requireRole(['admin']), async (req, res) => {
  const candidateId = String(req.body?.candidateId || '').trim();
  const moduleCode = String(req.body?.moduleCode || '').trim();
  const claimedGrade = String(req.body?.claimedGrade || '').trim().toUpperCase();
  if (!candidateId || !moduleCode || !claimedGrade) {
    return res.status(400).json({ success: false, error: 'Candidate ID, module code, and claimed grade are required' });
  }

  try {
    const alteredGrade = claimedGrade === 'F' ? 'A+' : 'F';
    const validClaim = await verificationService.verifyGradeRequest({
      candidateId,
      moduleCode,
      claimedGrade,
      sessionToken: req.authToken,
    });
    const tamperedClaim = await verificationService.verifyGradeRequest({
      candidateId,
      moduleCode,
      claimedGrade: alteredGrade,
      sessionToken: req.authToken,
    });
    const transcript = await verificationService.verifyTranscriptRequest({ candidateId, sessionToken: req.authToken });

    let mongoConnected = false;
    try {
      mongoConnected = await pingMongo();
    } catch (_error) {
      mongoConnected = false;
    }

    return res.json({
      success: true,
      runAt: new Date().toISOString(),
      subject: { candidateId: candidateId.toUpperCase(), moduleCode: moduleCode.toUpperCase() },
      validClaim: { result: validClaim.result, checks: validClaim.checks || {} },
      tamperedClaim: { result: tamperedClaim.result, checks: tamperedClaim.checks || {} },
      transcript: { result: transcript.result },
      operational: {
        component1: validClaim.checks?.recordFound === true,
        mongodb: mongoConnected,
      },
      formalVerification: {
        status: 'PUBLISHED',
        reportUrl: process.env.CERTORA_REPORT_URL || 'https://prover.certora.com/output/3827879/adef4095c4994e9896e13a1b723f61e0',
      },
    });
  } catch (_error) {
    return res.status(503).json({ success: false, error: 'Unable to complete the live evidence run' });
  }
});

app.post('/api/auth/zkp', async (req, res) => {
  try {
    const result = await verificationService.verifyLoginProof({
      institutionId: req.body?.institutionId,
      commitment: req.body?.commitment,
      proof: req.body?.proof,
      publicSignals: req.body?.publicSignals,
    });
    if (!result.success) return res.status(result.status || 401).json(result);
    return res.status(200).json(result);
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'ZKP authentication failed' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await verificationService.revokeToken({ refreshToken: req.body?.refreshToken });
  return res.json({ success: true });
});

async function handleClaimVerification(req, res) {
  try {
    const result = await verificationService.verifyGradeRequest({
      candidateId: req.body?.candidateId,
      moduleCode: req.body?.moduleCode,
      claimedGrade: req.body?.claimedGrade,
      gradeProof: req.body?.gradeProof,
      gradePublicSignals: req.body?.gradePublicSignals,
      sessionToken: req.authToken,
    });

    // An unavailable upstream or missing cryptographic runtime is not an
    // academic INVALID decision. Preserve the privacy boundary while returning
    // an operational status that the UI and monitoring can distinguish.
    if (!result.success && Number(result.status) >= 500) {
      console.error(`Claim verification unavailable: ${result.code || 'VERIFICATION_SERVICE_ERROR'}`);
      return res.status(Number(result.status)).json({
        success: false,
        error: 'Verification service is temporarily unavailable',
        code: result.code || 'VERIFICATION_SERVICE_ERROR',
      });
    }

    // Employer-facing API deliberately reveals the decision only. Detailed
    // cryptographic evidence remains server-side in the MongoDB audit trail.
    return res.status(200).json({
      success: true,
      valid: result.result === 'VALID',
      result: result.result === 'VALID' ? 'VALID' : 'INVALID',
    });
  } catch (error) {
    console.error(`Claim verification failed unexpectedly: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: 'Verification service is temporarily unavailable',
      code: 'VERIFICATION_SERVICE_ERROR',
    });
  }
}

// `/grade` remains temporarily for existing clients. New portal code uses the
// orchestration endpoint explicitly named for an employer claim.
app.post('/api/verify/claim', requireAuth, requireRole(['admin', 'verifier', 'auditor', 'institution']), handleClaimVerification);
app.post('/api/verify/grade', requireAuth, requireRole(['admin', 'verifier', 'auditor', 'institution']), handleClaimVerification);

app.post('/api/verify/transcript', requireAuth, requireRole(['admin', 'verifier', 'auditor', 'institution']), async (req, res) => {
  try {
    const result = await verificationService.verifyTranscriptRequest({ candidateId: req.body?.candidateId, sessionToken: req.authToken });
    return res.status(200).json({ success: true, valid: result.result === 'VALID', result: result.result === 'VALID' ? 'VALID' : 'INVALID' });
  } catch (_error) {
    return res.status(200).json({ success: true, valid: false, result: 'INVALID' });
  }
});

// In production the backend and the compiled React application share one
// origin. This keeps browser API calls on /api and avoids a separate CORS and
// cookie configuration between two cloud services.
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

if (require.main === module) {
  (async () => {
    try {
      await connectMongo();
      app.listen(port, () => {
        console.log(`Component 4 backend listening on http://localhost:${port}`);
      });
    } catch (error) {
      console.error(`Component 4 failed to start: ${error.message}`);
      process.exitCode = 1;
    }
  })();
}

module.exports = app;
