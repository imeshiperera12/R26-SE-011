import React, { useEffect, useState } from 'react';
import './VerificationPortal.css';
import { deriveInstitutionCommitment, generateLoginProof } from '../lib/zkp-clean';

let activeSessionToken = null;
let activeRefreshToken = null;

async function requestJson(path, options = {}) {
  async function execute(withAuthToken = activeSessionToken) {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(withAuthToken ? { Authorization: `Bearer ${withAuthToken}` } : {}),
        ...(options.headers || {}),
      },
      credentials: 'include',
      ...options,
    });

    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  let { response, payload } = await execute();

  if (response.status === 401 && activeRefreshToken && path !== '/api/auth/refresh') {
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken: activeRefreshToken }),
    });

    const refreshPayload = await refreshResponse.json().catch(() => ({}));

    if (refreshResponse.ok && refreshPayload?.token) {
      activeSessionToken = refreshPayload.token;
      activeRefreshToken = refreshPayload.refreshToken || activeRefreshToken;
      ({ response, payload } = await execute(activeSessionToken));
    } else {
      activeSessionToken = null;
      activeRefreshToken = null;
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function ResultBadge({ label, value }) {
  return (
    <div className="result-badge">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VerificationTimeline({ verificationResult }) {
  const steps = [
    {
      label: 'Claim intake',
      detail: 'Candidate ID, module code, and claimed grade captured for verification.',
      state: verificationResult ? 'complete' : 'pending',
    },
    {
      label: 'Dataset anchor',
      detail: verificationResult
        ? `Blockchain anchor ${verificationResult.checks?.blockchainAnchorValid ? 'VERIFIED' : 'FAILED'}`
        : 'Awaiting anchored dataset lookup.',
      state: verificationResult
        ? verificationResult.checks?.blockchainAnchorValid
          ? 'complete'
          : 'error'
        : 'pending',
    },
    {
      label: 'Cryptographic hash',
      detail: verificationResult
        ? `Hash validation ${verificationResult.checks?.hashMatch ? 'VERIFIED' : 'FAILED'}`
        : 'Awaiting canonical hash comparison.',
      state: verificationResult
        ? verificationResult.checks?.hashMatch
          ? 'complete'
          : 'error'
        : 'pending',
    },
    {
      label: 'Merkle membership',
      detail: verificationResult
        ? `Membership check ${verificationResult.checks?.merkleProofValid ? 'VERIFIED' : 'FAILED'}`
        : 'Awaiting finalized dataset proof evaluation.',
      state: verificationResult
        ? verificationResult.checks?.merkleProofValid
          ? 'complete'
          : 'error'
        : 'pending',
    },
    {
      label: 'Final decision',
      detail: verificationResult
        ? verificationResult.valid
          ? 'Anchored academic result confirmed as authentic.'
          : 'Submitted claim marked invalid or tampered.'
        : 'Awaiting verification request.',
      state: verificationResult ? (verificationResult.valid ? 'complete' : 'error') : 'pending',
    },
  ];

  return (
    <div className="timeline-card">
      <div className="timeline-card-header">
        <span>Verification Timeline</span>
        <strong>Execution Trace</strong>
      </div>
      <div className="timeline-list">
        {steps.map((step) => (
          <div key={step.label} className={`timeline-step ${step.state}`}>
            <div className="timeline-dot" />
            <div>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginView({ onAuthenticated }) {
  const [authMode, setAuthMode] = useState('company-login');
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [institutionId, setInstitutionId] = useState('');
  const [institutionSecret, setInstitutionSecret] = useState('');
  const [signupForm, setSignupForm] = useState({
    companyId: '',
    companyName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [recoveryExpanded, setRecoveryExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadCompanies() {
      const [companyResult, institutionResult] = await Promise.allSettled([
        requestJson('/api/auth/companies'),
        requestJson('/api/auth/institutions'),
      ]);
      if (!mounted) return;

      const companyPayload = companyResult.status === 'fulfilled' ? companyResult.value : null;
      const institutionPayload = institutionResult.status === 'fulfilled' ? institutionResult.value : null;
      setCompanies(Array.isArray(companyPayload?.companies) ? companyPayload.companies : []);
      setInstitutions(Array.isArray(institutionPayload?.institutions) ? institutionPayload.institutions : []);
    }

    loadCompanies();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!companyId && companies.length > 0) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  useEffect(() => {
    if (!institutionId && institutions.length > 0) setInstitutionId(institutions[0].id);
  }, [institutions, institutionId]);

  async function handleAuthenticate(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      if (authMode === 'company-login') {
        const authPayload = await requestJson('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            companyId,
            email,
            password,
          }),
        });

        activeSessionToken = authPayload.token;
        activeRefreshToken = authPayload.refreshToken || null;
        onAuthenticated({
          account: authPayload.account,
          session: authPayload.session,
          token: authPayload.token,
          refreshToken: authPayload.refreshToken,
        });
      } else if (authMode === 'institution-zkp') {
        const institution = institutions.find((entry) => entry.id === institutionId);
        if (!institution) throw new Error('Select a registered institution');
        const generated = await generateLoginProof(institutionSecret);
        const authPayload = await requestJson('/api/auth/zkp', {
          method: 'POST',
          body: JSON.stringify({ institutionId, ...generated }),
        });
        activeSessionToken = authPayload.token;
        activeRefreshToken = null;
        setInstitutionSecret('');
        onAuthenticated({ session: authPayload.session, token: authPayload.token });
      } else {
        const signupPayload = await requestJson('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify(signupForm),
        });

        setSuccessMessage(`Company ${signupPayload.company.id} registered. Sign in using the admin credentials.`);
        setCompanies((previous) => [...previous.filter((company) => company.id !== signupPayload.company.id), signupPayload.company]);
        setCompanyId(signupPayload.company.id);
        setEmail(signupPayload.user.email);
        setPassword('');
        setAuthMode('company-login');
      }
    } catch (requestError) {
      setError(requestError.message || 'Credential authentication failed');
    } finally {
      setLoading(false);
    }
  }

  const noCompaniesAvailable = authMode === 'company-login' && companies.length === 0;
  const submitDisabled =
    loading ||
    (authMode === 'company-login' && (noCompaniesAvailable || !companyId || !email || !password)) ||
    (authMode === 'institution-zkp' && (!institutionId || !institutionSecret));

  async function requestPasswordResetAction() {
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const payload = await requestJson('/api/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail || email }),
      });
      setSuccessMessage(payload.message || 'Password reset email queued.');
    } catch (requestError) {
      setError(requestError.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  }

  async function confirmPasswordResetAction() {
    setLoading(true);
    setError('');
    setSuccessMessage('');
    try {
      const payload = await requestJson('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: resetPassword }),
      });
      setSuccessMessage(payload.message || 'Password reset complete.');
      setResetToken('');
      setResetPassword('');
    } catch (requestError) {
      setError(requestError.message || 'Failed to complete password reset');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="verification-login-panel premium-login-panel">
      <div className="premium-login-grid">
        <div className="premium-hero">
          <p className="eyebrow">Academic Credential</p>
          <h1>Verification Portal</h1>
          <p className="portal-subtitle hero-copy">
            Professional employer-grade verification for decentralized academic records with role-based access,
            anchored dataset validation, and grade requirement checks.
          </p>

          <div className="portal-highlight-strip">
            <div className="highlight-pill">Company Role-Based Access</div>
            <div className="highlight-pill">Blockchain Anchored Merkle Root</div>
            <div className="highlight-pill">IPFS Finalized Dataset Retrieval</div>
          </div>

          <div className="hero-stat-grid">
            <div className="hero-stat-card">
              <span>Security Layer</span>
              <strong>Component 4</strong>
            </div>
            <div className="hero-stat-card">
              <span>Verification Model</span>
              <strong>ZKP + Merkle + Hash</strong>
            </div>
            <div className="hero-stat-card">
              <span>Users</span>
              <strong>Company Verifiers</strong>
            </div>
          </div>
        </div>

        <div className="premium-auth-card">
          <div className="auth-card-topline">
            <span>Restricted Verification Access</span>
            <strong>
              {authMode === 'company-login'
                ? 'Company User Login'
                : authMode === 'institution-zkp'
                  ? 'Institution ZKP Login'
                  : 'Company Admin Sign Up'}
            </strong>
          </div>

          <div className="mode-toggle-group auth-mode-toggle">
            <button
              type="button"
              className={authMode === 'institution-zkp' ? 'mode-toggle active' : 'mode-toggle'}
              onClick={() => {
                setAuthMode('institution-zkp');
                setError('');
                setSuccessMessage('');
                setRecoveryExpanded(false);
              }}
            >
              Institution ZKP
            </button>
            <button
              type="button"
              className={authMode === 'company-login' ? 'mode-toggle active' : 'mode-toggle'}
              onClick={() => {
                setAuthMode('company-login');
                setError('');
                setSuccessMessage('');
                setRecoveryExpanded(false);
              }}
            >
              Company Login
            </button>
            <button
              type="button"
              className={authMode === 'signup' ? 'mode-toggle active' : 'mode-toggle'}
              onClick={() => {
                setAuthMode('signup');
                setError('');
                setSuccessMessage('');
                setRecoveryExpanded(false);
              }}
            >
              Company Sign Up
            </button>
          </div>

          <form className="portal-form portal-form-stacked" onSubmit={handleAuthenticate}>
            {authMode === 'company-login' ? (
              <>
                <label>
                  Company ID
                  <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} disabled={noCompaniesAvailable}>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.id} - {company.name}
                      </option>
                    ))}
                  </select>
                </label>

                {noCompaniesAvailable ? (
                  <div className="portal-error">
                    No companies found. Create a company first using Company Sign Up.
                  </div>
                ) : null}

                <label>
                  Work Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your work email"
                    type="email"
                  />
                </label>

                <label>
                  Password
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    type="password"
                  />
                </label>
              </>
            ) : null}

            {authMode === 'signup' ? (
              <>
                <label>
                  Company ID
                  <input
                    value={signupForm.companyId}
                    onChange={(event) => setSignupForm((previous) => ({ ...previous, companyId: event.target.value }))}
                    placeholder="ACME"
                  />
                </label>
                <label>
                  Company Name
                  <input
                    value={signupForm.companyName}
                    onChange={(event) => setSignupForm((previous) => ({ ...previous, companyName: event.target.value }))}
                    placeholder="Acme Talent Labs"
                  />
                </label>
                <label>
                  Admin Name
                  <input
                    value={signupForm.adminName}
                    onChange={(event) => setSignupForm((previous) => ({ ...previous, adminName: event.target.value }))}
                    placeholder="Jane Doe"
                  />
                </label>
                <label>
                  Admin Email
                  <input
                    value={signupForm.adminEmail}
                    onChange={(event) => setSignupForm((previous) => ({ ...previous, adminEmail: event.target.value }))}
                    placeholder="admin@company.com"
                    type="email"
                  />
                </label>
                <label>
                  Admin Password
                  <input
                    value={signupForm.adminPassword}
                    onChange={(event) => setSignupForm((previous) => ({ ...previous, adminPassword: event.target.value }))}
                    placeholder="Min 10 chars with upper/lower/number/symbol"
                    type="password"
                  />
                </label>
              </>
            ) : null}

            {authMode === 'institution-zkp' ? (
              <>
                <label>
                  Institution
                  <select value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} disabled={institutions.length === 0}>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.id} - {institution.name}
                      </option>
                    ))}
                  </select>
                </label>
                {institutions.length === 0 ? <div className="portal-error">No ZKP institutions are registered.</div> : null}
                <label>
                  Private Institution Secret
                  <input
                    type="password"
                    value={institutionSecret}
                    onChange={(event) => setInstitutionSecret(event.target.value)}
                    autoComplete="off"
                    placeholder="Enter the private proof secret"
                  />
                </label>
              </>
            ) : null}

            {error ? <div className="portal-error">{error}</div> : null}
            {successMessage ? <div className="portal-success">{successMessage}</div> : null}

            <button type="submit" disabled={submitDisabled} className="primary-button auth-submit-button">
              {loading
                ? authMode === 'signup'
                  ? 'Creating Company...'
                  : authMode === 'institution-zkp'
                    ? 'Generating Proof...'
                    : 'Signing In...'
                : authMode === 'signup'
                  ? 'Create Company Admin Account'
                  : authMode === 'institution-zkp'
                    ? 'Generate Proof and Sign In'
                    : 'Sign In to Verification Workspace'}
            </button>
          </form>

          <p className="privacy-note">
            Registered company users and ZKP-authenticated institutions can access verification APIs.
          </p>

          {authMode === 'company-login' ? (
            <section className="recovery-block">
              <button
                type="button"
                className="recovery-toggle"
                onClick={() => setRecoveryExpanded((previous) => !previous)}
                aria-expanded={recoveryExpanded}
              >
                <span>Need help signing in?</span>
                <strong>{recoveryExpanded ? 'Hide recovery tools' : 'Open recovery tools'}</strong>
              </button>

              {recoveryExpanded ? (
                <div className="recovery-panel">
                  <div className="recovery-grid">
                      <label>
                        Password Reset Email
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(event) => setResetEmail(event.target.value)}
                          placeholder="admin@company.com"
                        />
                      </label>
                      <button type="button" className="secondary-button" disabled={loading} onClick={requestPasswordResetAction}>
                        Request Password Reset
                      </button>

                      <label>
                        Reset Token
                        <input
                          value={resetToken}
                          onChange={(event) => setResetToken(event.target.value)}
                          placeholder="Paste reset token"
                        />
                      </label>
                      <label>
                        New Password
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(event) => setResetPassword(event.target.value)}
                          placeholder="Set a new strong password"
                        />
                      </label>
                      <button type="button" className="secondary-button" disabled={loading} onClick={confirmPasswordResetAction}>
                        Confirm Password Reset
                      </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="portal-footnote-grid compact-footnotes">
            <div className="footnote-card">
              <span>Authentication</span>
              <strong>Role-based company account access</strong>
            </div>
            <div className="footnote-card">
              <span>Verification</span>
              <strong>Hash, Merkle root, and grade requirement checks</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatEvidenceLabel(value) {
  return String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

function EvidenceStatus({ label, passed, value }) {
  return (
    <div className={passed ? 'evidence-status is-pass' : 'evidence-status is-fail'}>
      <span>{label}</span>
      <strong>{value || 'UNKNOWN'}</strong>
    </div>
  );
}

function RequirementDecision({ result, onCheckAnother, onRetry, loading }) {
  const messages = {
    MEETS_REQUIREMENT: {
      tone: 'success', label: 'REQUIREMENT MET', symbol: '\u2713',
      title: 'Congratulations! Requirement met.',
      description: "The candidate's verified academic result meets your company's minimum grade requirement.",
    },
    DOES_NOT_MEET: {
      tone: 'below', label: 'BELOW REQUIREMENT', symbol: '-',
      title: 'Minimum requirement not met.',
      description: "The candidate's verified academic result is below your company's minimum grade requirement.",
    },
    UNABLE_TO_VERIFY: {
      tone: 'pending', label: 'VERIFICATION INCOMPLETE', symbol: '?',
      title: 'We could not verify this result.',
      description: 'Please check the student\'s Candidate ID and Module Code, and confirm that their grade has been finalized. Required evidence may be missing or temporarily unavailable.',
    },
  };
  const message = messages[result?.result] || messages.UNABLE_TO_VERIFY;
  const authenticated = message.tone !== 'pending' && result?.evidence?.officialRecordAuthenticated === true;
  return (
    <section className={`requirement-decision requirement-decision--${message.tone}`} role="status" aria-live="polite" aria-atomic="true">
      <div className="requirement-decision-heading">
        <span className="requirement-decision-symbol" aria-hidden="true">{message.symbol}</span>
        <span className="requirement-decision-label">{message.label}</span>
      </div>
      <h4>{message.title}</h4>
      <p className="requirement-decision-copy">{message.description}</p>
      <div className="requirement-evidence">
        <strong>{authenticated ? 'Official evidence authenticated' : 'No academic decision made'}</strong>
        <p>{authenticated ? 'Blockchain anchor, IPFS dataset, SHA-256 hash and Merkle proof verified.' : 'An incomplete verification does not mean the candidate failed the requirement.'}</p>
      </div>
      <p className="requirement-privacy">The official grade and marks remain private.</p>
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={onCheckAnother} disabled={loading}>
          {message.tone === 'below' ? 'Try Another Candidate' : message.tone === 'pending' ? 'Review Student Details' : 'Check Another Candidate'}
        </button>
        {message.tone === 'pending' ? <button type="button" className="primary-button" onClick={onRetry} disabled={loading}>{loading ? 'Verifying...' : 'Retry Verification'}</button> : null}
      </div>
    </section>
  );
}

function AuthenticatedView({ account, session, onLogout }) {
  const currentRole = (account?.user?.role || session?.role || 'verifier').toLowerCase();
  const isAdmin = currentRole === 'admin';
  const [portalMode, setPortalMode] = useState('grade');
  const [candidateId, setCandidateId] = useState('');
  const [moduleCode, setModuleCode] = useState('');
  const [claimedGrade, setClaimedGrade] = useState('');
  const [minimumGrade, setMinimumGrade] = useState('');
  const [gradeScale, setGradeScale] = useState([]);
  useEffect(() => {
    requestJson('/api/verify/grade-scale').then((payload) => setGradeScale(payload.grades || [])).catch(() => setError('Unable to load university grading scale'));
  }, []);
  const [verificationResult, setVerificationResult] = useState(null);
  const [loadingVerification, setLoadingVerification] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminAuditEvents, setAdminAuditEvents] = useState([]);
  const [adminInstitutions, setAdminInstitutions] = useState([]);
  const [passwordPolicy, setPasswordPolicy] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    role: 'verifier',
    password: '',
  });
  const [adminEdits, setAdminEdits] = useState({});
  const [institutionForm, setInstitutionForm] = useState({ id: '', name: '', label: 'External Institution', secret: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin || portalMode !== 'admin') {
      return;
    }

    let mounted = true;

    async function loadAdminState() {
      setAdminLoading(true);
      setError('');

      try {
        const [usersPayload, auditPayload, institutionPayload] = await Promise.all([
          requestJson('/api/admin/users'),
          requestJson('/api/admin/audit?limit=40'),
          requestJson('/api/auth/institutions'),
        ]);

        if (!mounted) {
          return;
        }

        setAdminUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
        setPasswordPolicy(usersPayload.passwordPolicy || null);
        setAdminAuditEvents(Array.isArray(auditPayload.events) ? auditPayload.events : []);
        setAdminInstitutions(Array.isArray(institutionPayload.institutions) ? institutionPayload.institutions : []);
      } catch (requestError) {
        if (mounted) {
          setError(requestError.message || 'Failed to load admin data');
        }
      } finally {
        if (mounted) {
          setAdminLoading(false);
        }
      }
    }

    loadAdminState();

    return () => {
      mounted = false;
    };
  }, [isAdmin, portalMode]);

  async function verifyGrade() {
    setLoadingVerification(true);
    setError('');
    setTranscriptResult(null);

    try {
      // The browser sends a claim only. Component 4 resolves the anchor and
      // interacts with Component 1; it never trusts a frontend dataset.
      const payload = await requestJson('/api/verify/claim', {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          moduleCode,
          claimedGrade,
        }),
      });

      setVerificationResult(payload);
    } catch (requestError) {
      setError(requestError.message);
      setVerificationResult(null);
    } finally {
      setLoadingVerification(false);
    }
  }

  async function verifyTranscript() {
    setLoadingTranscript(true);
    setError('');
    try {
      const payload = await requestJson('/api/verify/grade-requirement', {
        method: 'POST',
        body: JSON.stringify({ candidateId, moduleCode, minimumGrade }),
      });
      setTranscriptResult(payload);
    } catch (requestError) {
      setError(requestError.message);
      setTranscriptResult({ result: 'UNABLE_TO_VERIFY', evidence: { officialRecordAuthenticated: false } });
    } finally {
      setLoadingTranscript(false);
    }
  }

  async function runEvidenceConsole() {
    setLoadingEvidence(true);
    setError('');
    setEvidenceResult(null);
    try {
      const payload = await requestJson('/api/admin/evidence/run', {
        method: 'POST',
        body: JSON.stringify({ candidateId, moduleCode, claimedGrade }),
      });
      setEvidenceResult(payload);
    } catch (requestError) {
      setError(requestError.message || 'Evidence run failed');
    } finally {
      setLoadingEvidence(false);
    }
  }

  async function createVerifierUser() {
    setAdminSaving(true);
    setError('');

    try {
      await requestJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: adminForm.email,
          name: adminForm.name,
          role: adminForm.role,
          password: adminForm.password,
        }),
      });

      setAdminForm({ name: '', email: '', role: 'verifier', password: '' });

      const usersPayload = await requestJson('/api/admin/users');
      setAdminUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
    } catch (requestError) {
      setError(requestError.message || 'Failed to create user');
    } finally {
      setAdminSaving(false);
    }
  }

  async function saveUserChanges(userEmail) {
    const edit = adminEdits[userEmail] || {};
    const payload = {};

    if (edit.role) {
      payload.role = edit.role;
    }

    if (edit.password) {
      payload.password = edit.password;
    }

    if (!payload.role && !payload.password) {
      return;
    }

    setAdminSaving(true);
    setError('');

    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(userEmail)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      const [usersPayload, auditPayload] = await Promise.all([
        requestJson('/api/admin/users'),
        requestJson('/api/admin/audit?limit=40'),
      ]);

      setAdminUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
      setAdminAuditEvents(Array.isArray(auditPayload.events) ? auditPayload.events : []);
      setAdminEdits((previous) => ({
        ...previous,
        [userEmail]: { role: '', password: '' },
      }));
    } catch (requestError) {
      setError(requestError.message || 'Failed to update user');
    } finally {
      setAdminSaving(false);
    }
  }

  async function createInstitution() {
    setAdminSaving(true);
    setError('');
    try {
      const commitment = await deriveInstitutionCommitment(institutionForm.secret);
      await requestJson('/api/admin/institutions', {
        method: 'POST',
        body: JSON.stringify({
          id: institutionForm.id,
          name: institutionForm.name,
          label: institutionForm.label,
          commitment,
        }),
      });
      setInstitutionForm({ id: '', name: '', label: 'External Institution', secret: '' });
      const payload = await requestJson('/api/auth/institutions');
      setAdminInstitutions(Array.isArray(payload.institutions) ? payload.institutions : []);
    } catch (requestError) {
      setError(requestError.message || 'Failed to register institution');
    } finally {
      setAdminSaving(false);
    }
  }

  const displayedResult = portalMode === 'transcript' ? transcriptResult : verificationResult;

  return (
    <section className="verification-portal-panel">
      <header className="authenticated-banner">
        <div>
          <p className="eyebrow success">ROLE AUTHENTICATED</p>
          <h2>{account?.company?.name || session?.companyName || 'Company Workspace'}</h2>
          <p>
            {account?.user?.name || session?.userName || 'Verifier'}
            {' • '}
            {(account?.user?.role || session?.role || 'verifier').toUpperCase()}
          </p>
        </div>

        <div className="header-actions">
          <div className="session-chip">Secure verification session active</div>
          <button type="button" className="secondary-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-strip">
        <div className="dashboard-stat-card">
          <span>Authentication State</span>
          <strong>{session?.authType === 'zkp-institution' ? 'Institution ZKP Session Active' : 'Company Session Active'}</strong>
        </div>
        <div className="dashboard-stat-card">
          <span>Verification Channels</span>
          <strong>Hash, Merkle, Dataset Anchor</strong>
        </div>
        <div className="dashboard-stat-card">
          <span>Role Scope</span>
          <strong>{(account?.user?.role || session?.role || 'verifier').toUpperCase()}</strong>
        </div>
      </div>

      <div className="workspace-toolbar">
        <div className="workspace-copy">
          <span>Verification Workspace</span>
          <strong>
            {portalMode === 'grade' ? 'CV Claim Verification' : portalMode === 'transcript' ? 'Grade Requirement Check' : portalMode === 'evidence' ? 'Live Verification Evidence' : 'Admin User Governance'}
          </strong>
        </div>
        <div className="mode-toggle-group">
          <button
            type="button"
            className={portalMode === 'grade' ? 'mode-toggle active' : 'mode-toggle'}
            onClick={() => setPortalMode('grade')}
          >
            Single Grade
          </button>
          <button
            type="button"
            className={portalMode === 'transcript' ? 'mode-toggle active' : 'mode-toggle'}
            onClick={() => setPortalMode('transcript')}
          >
            Grade Requirement Check
          </button>
          {isAdmin ? (
            <button
              type="button"
              className={portalMode === 'evidence' ? 'mode-toggle active' : 'mode-toggle'}
              onClick={() => setPortalMode('evidence')}
            >
              Evidence Console
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className={portalMode === 'admin' ? 'mode-toggle active' : 'mode-toggle'}
              onClick={() => setPortalMode('admin')}
            >
              Admin Console
            </button>
          ) : null}
        </div>
      </div>

      <div className="portal-grid">
        <div className="portal-card">
          {portalMode === 'admin' && isAdmin ? (
            <>
              <h3>User and Role Management</h3>
              <p className="card-intro">Create and maintain verifier users for your company with role-scoped access.</p>
              <label>
                Full Name
                <input
                  value={adminForm.name}
                  onChange={(event) => setAdminForm((previous) => ({ ...previous, name: event.target.value }))}
                  placeholder="Jane Doe"
                />
              </label>
              <label>
                Work Email
                <input
                  value={adminForm.email}
                  onChange={(event) => setAdminForm((previous) => ({ ...previous, email: event.target.value }))}
                  placeholder="jane@company.com"
                />
              </label>
              <label>
                Role
                <select
                  value={adminForm.role}
                  onChange={(event) => setAdminForm((previous) => ({ ...previous, role: event.target.value }))}
                >
                  <option value="verifier">verifier</option>
                  <option value="auditor">auditor</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                Temporary Password
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(event) => setAdminForm((previous) => ({ ...previous, password: event.target.value }))}
                  placeholder="Minimum 12 chars with upper/lower/number/symbol"
                />
              </label>
              {passwordPolicy ? (
                <div className="input-helper-panel">
                  <span>Password Policy</span>
                  <p>
                    Minimum {passwordPolicy.minLength} chars, uppercase, lowercase, number, and symbol required.
                  </p>
                </div>
              ) : null}
              <div className="button-row">
                <button type="button" className="primary-button" onClick={createVerifierUser} disabled={adminSaving}>
                  {adminSaving ? 'Saving...' : 'Create User'}
                </button>
              </div>

              <h3>Institution ZKP Access</h3>
              <p className="card-intro">Register a public proof commitment. The private secret is transformed in this browser and is never submitted.</p>
              <label>
                Institution ID
                <input value={institutionForm.id} onChange={(event) => setInstitutionForm((previous) => ({ ...previous, id: event.target.value }))} placeholder="SLIIT" />
              </label>
              <label>
                Institution Name
                <input value={institutionForm.name} onChange={(event) => setInstitutionForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="Sri Lanka Institute of Information Technology" />
              </label>
              <label>
                Access Label
                <input value={institutionForm.label} onChange={(event) => setInstitutionForm((previous) => ({ ...previous, label: event.target.value }))} />
              </label>
              <label>
                Private Institution Secret
                <input type="password" autoComplete="new-password" value={institutionForm.secret} onChange={(event) => setInstitutionForm((previous) => ({ ...previous, secret: event.target.value }))} />
              </label>
              <div className="button-row">
                <button type="button" className="primary-button" onClick={createInstitution} disabled={adminSaving || !institutionForm.id.trim() || !institutionForm.name.trim() || !institutionForm.secret}>
                  Register ZKP Institution
                </button>
              </div>
            </>
          ) : portalMode === 'evidence' && isAdmin ? (
            <>
              <h3>Live Evidence Run</h3>
              <p className="card-intro">Run the complete Component 4 verification path against the current Component 1 anchor.</p>
              <label>
                Candidate ID
                <input value={candidateId} onChange={(event) => setCandidateId(event.target.value)} />
              </label>
              <label>
                Module Code
                <input value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} />
              </label>
              <label>
                Official Claimed Grade
                <input value={claimedGrade} onChange={(event) => setClaimedGrade(event.target.value)} />
              </label>
              <div className="input-helper-panel">
                <span>Privacy Boundary</span>
                <p>The evidence response contains decisions and check states only. Academic records, marks, roots, and CIDs are not returned.</p>
              </div>
              <div className="button-row">
                <button type="button" className="primary-button" onClick={runEvidenceConsole} disabled={loadingEvidence || !candidateId.trim() || !moduleCode.trim() || !claimedGrade.trim()}>
                  {loadingEvidence ? 'Running Evidence Checks...' : 'Run Live Evidence Check'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3>{portalMode === 'grade' ? 'CV Claim Verification' : 'Grade Requirement Check'}</h3>
              <p className="card-intro">
                {portalMode === 'grade'
                  ? 'Enter the Candidate ID, Module Code, and Grade supplied by the candidate. The portal returns only a validity decision.'
                  : 'Minimum academic requirement'}
              </p>
              <label>
                Candidate ID
                <input id="requirement-candidate-id" value={candidateId} onChange={(event) => { setCandidateId(event.target.value); setTranscriptResult(null); }} />
              </label>

              {portalMode === 'grade' ? (
                <>
                  <label>
                    Module Code
                    <input value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} />
                  </label>
                  <label>
                    Claimed Grade
                    <input value={claimedGrade} onChange={(event) => setClaimedGrade(event.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label>Module Code<input value={moduleCode} onChange={(event) => { setModuleCode(event.target.value); setTranscriptResult(null); }} /></label>
                  <label>Company Minimum Required Grade
                    <select value={minimumGrade} onChange={(event) => { setMinimumGrade(event.target.value); setTranscriptResult(null); }}>
                      <option value="">Select grade</option>
                      {gradeScale.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                    </select>
                  </label>
                </>
              )}

              <div className="input-helper-panel">
                <span>Verification Note</span>
                <p>
                  {portalMode === 'grade'
                    ? 'The submitted CV claim is checked against the Component 1 anchored academic record. Student details are not returned.'
                    : 'Official marks and grade remain private.'}
                </p>
              </div>

              <div className="button-row">
                {portalMode === 'grade' ? (
                  <button type="button" className="primary-button" onClick={verifyGrade} disabled={loadingVerification || !candidateId.trim() || !moduleCode.trim() || !claimedGrade.trim()}>
                    {loadingVerification ? 'Verifying...' : 'Verify CV Claim'}
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={verifyTranscript} disabled={loadingTranscript || !candidateId.trim() || !moduleCode.trim() || !minimumGrade}>
                    {loadingTranscript ? 'Verifying...' : 'Verify Requirement'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="portal-card">
          {portalMode === 'admin' && isAdmin ? (
            <>
              <h3>Admin Governance Console</h3>
              {adminLoading ? <p className="muted-copy">Loading admin data...</p> : null}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Password Reset</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.email}>
                        <td>
                          <strong>{user.name}</strong>
                          <div className="muted-copy">{user.email}</div>
                        </td>
                        <td>
                          <select
                            value={adminEdits[user.email]?.role || user.role}
                            onChange={(event) =>
                              setAdminEdits((previous) => ({
                                ...previous,
                                [user.email]: {
                                  role: event.target.value,
                                  password: previous[user.email]?.password || '',
                                },
                              }))
                            }
                          >
                            <option value="verifier">verifier</option>
                            <option value="auditor">auditor</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="password"
                            placeholder="Optional new password"
                            value={adminEdits[user.email]?.password || ''}
                            onChange={(event) =>
                              setAdminEdits((previous) => ({
                                ...previous,
                                [user.email]: {
                                  role: previous[user.email]?.role || user.role,
                                  password: event.target.value,
                                },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={adminSaving}
                            onClick={() => saveUserChanges(user.email)}
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>Recent Audit Events</h3>
              <p className="muted-copy">{adminInstitutions.length} ZKP institution(s) registered</p>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAuditEvents.map((event) => (
                      <tr key={event._id || event.id}>
                        <td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '-'}</td>
                        <td>{event.eventType}</td>
                        <td>{event.details?.email || event.details?.reason || event.actorEmail || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </>
          ) : portalMode === 'evidence' && isAdmin ? (
            <>
              <h3>Evidence Summary</h3>
              {evidenceResult ? (
                <div className="evidence-console">
                  <div className="evidence-headline">
                    <div>
                      <span>Live run</span>
                      <strong>{evidenceResult.subject?.candidateId} / {evidenceResult.subject?.moduleCode}</strong>
                    </div>
                    <time>{new Date(evidenceResult.runAt).toLocaleString()}</time>
                  </div>
                  <div className="evidence-status-grid">
                    <EvidenceStatus label="Official claim" passed={evidenceResult.validClaim?.result === 'VALID'} value={evidenceResult.validClaim?.result} />
                    <EvidenceStatus label="Altered claim rejected" passed={evidenceResult.tamperedClaim?.result === 'INVALID'} value={evidenceResult.tamperedClaim?.result === 'INVALID' ? 'REJECTED' : 'FAILED'} />
                    <EvidenceStatus label="Grade requirement" passed={evidenceResult.requirement?.result === 'MEETS_REQUIREMENT'} value={evidenceResult.requirement?.result} />
                    <EvidenceStatus label="MongoDB audit store" passed={evidenceResult.operational?.mongodb === true} value={evidenceResult.operational?.mongodb ? 'CONNECTED' : 'UNAVAILABLE'} />
                  </div>
                  <div className="evidence-check-list">
                    {Object.entries(evidenceResult.validClaim?.checks || {}).map(([name, passed]) => (
                      <div className="evidence-check" key={name}>
                        <span>{formatEvidenceLabel(name)}</span>
                        <strong className={passed ? 'success-text' : 'error-text'}>{passed ? 'PASS' : 'FAIL'}</strong>
                      </div>
                    ))}
                  </div>
                  <a className="formal-report-link" href={evidenceResult.formalVerification?.reportUrl} target="_blank" rel="noreferrer">
                    Open Published Certora Report
                  </a>
                </div>
              ) : (
                <div className="empty-state-card">
                  <strong>No Evidence Run Yet</strong>
                  <p className="muted-copy">Submit a known valid claim to run live positive, tamper-rejection, requirement, persistence, and formal-evidence checks.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <h3>{portalMode === 'transcript' ? 'Requirement Decision' : 'Verification Decision'}</h3>
              {portalMode === 'transcript' && displayedResult ? (
                <RequirementDecision result={displayedResult} loading={loadingTranscript} onRetry={verifyTranscript} onCheckAnother={() => { setTranscriptResult(null); document.getElementById('requirement-candidate-id')?.focus(); }} />
              ) : displayedResult ? (
                <div className={`verification-result ${displayedResult.valid ? 'is-valid' : 'is-invalid'}`}>
                  <div className="result-banner">
                    <p className={displayedResult.valid ? 'success-text' : 'error-text'}>
                      {displayedResult.valid ? '✓ ACADEMIC RESULT VERIFIED' : '✕ ACADEMIC RESULT VERIFICATION FAILED'}
                    </p>
                    <p className="status-caption">No student record, grade, marks, transcript, CID, or Merkle root is disclosed.</p>
                  </div>
                  <p className="result-summary">
                    {displayedResult.valid ? 'VALID' : 'INVALID'}
                  </p>
                </div>
              ) : (
                <div className="empty-state-card">
                  <strong>Awaiting Verification Request</strong>
                  <p className="muted-copy">{portalMode === 'transcript' ? 'Awaiting requirement check.' : 'Submit the three CV claim values to obtain a VALID or INVALID decision.'}</p>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {error ? <div className="portal-error">{error}</div> : null}

    </section>
  );
}

export default function VerificationPortal() {
  const [session, setSession] = useState(null);

  async function handleLogout() {
    try {
      await requestJson('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ token: session?.token, refreshToken: session?.refreshToken || activeRefreshToken }),
      });
    } catch (_error) {
      // Ignore logout transport failures and clear the local session.
    }

    activeSessionToken = null;
    activeRefreshToken = null;
    setSession(null);
  }

  return (
    <div className="vp-shell">
      <div className="vp-grid-bg" />
      {session ? (
        <AuthenticatedView account={session.account} session={session.session} onLogout={handleLogout} />
      ) : (
        <LoginView onAuthenticated={setSession} />
      )}
    </div>
  );
}
