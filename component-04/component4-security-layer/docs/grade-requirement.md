# Grade Requirement Check

Implemented on `feature/component4-grade-requirement`, based on `comp-1-2-3-4-merge`.

## API

`POST /api/verify/grade-requirement` requires the existing bearer session and an admin, verifier, auditor or institution role.

```json
{"candidateId":"TEST001","moduleCode":"SE3040","minimumGrade":"B+"}
```

Authenticated decision (HTTP 200):

```json
{
  "success": true,
  "result": "MEETS_REQUIREMENT",
  "evidence": {
    "officialRecordAuthenticated": true,
    "blockchainAnchor": "VERIFIED",
    "ipfsDataset": "VERIFIED",
    "recordHash": "VALID",
    "merkleProof": "VALID"
  }
}
```

The other academic decision is `DOES_NOT_MEET`. Missing records, unsupported official grades, invalid evidence and upstream failures return HTTP 200 with `result: "UNABLE_TO_VERIFY"` and `evidence: {"officialRecordAuthenticated": false}`. This is never an academic failure decision. Invalid input returns HTTP 400; missing authentication returns 401 and insufficient roles return 403. Unexpected handler failures return HTTP 503 with `UNABLE_TO_VERIFY`.

No actual grade, marks, raw record, hashes, CID, roots or proof signals are returned by this endpoint. Client-supplied official grades and evidence are ignored.

`GET /api/verify/grade-scale` uses the same authentication and roles and returns `{"success":true,"grades":["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","E","F"]}` by default.

## Configuration and Verification

`GRADE_REQUIREMENT_ORDER` is a JSON array ordered lowest to highest. Default: `["F","E","D","D+","C-","C","C+","B-","B","B+","A-","A","A+"]`. Configure this to the university's approved scale before deployment; omitted grades are rejected. Equal grades satisfy the requirement. Array positions determine comparison, never alphabetical ordering or GPA equivalence.

Component 4 resolves candidate and module through the existing Component 1 lookup and finalized dataset API. It checks the dataset record hash and version, then reuses Single Grade verification with a server-selected official grade to authenticate the anchor, CID, roots, record hash and Merkle membership. Comparison occurs only after that succeeds. Existing optional claim-bound ZKP policy remains enforced. This feature does not implement a zero-knowledge range proof. If the configured existing ZKP circuit cannot support an official grade, verification remains unavailable.

The implementation performs an initial official record retrieval followed by the existing verification chain, so it makes additional upstream requests. Concurrent grade revisions that disagree between these reads fail closed. Live verification requires a configured `ACADEMIC_DATA_BASE_URL` and functioning Component 1/blockchain/IPFS services. Existing internal verification audit storage and access policies remain in use.

The Full Transcript POST endpoint and active full-transcript service implementation were removed. The admin evidence console now runs a grade requirement check using its entered grade as the threshold. Historical inactive backend/frontend files are retained; production starts `api-server-clean.js` and imports `VerificationPortal-clean.jsx`. Components 1, 2, 3, blockchain contracts, ZKP artifacts and Certora files are unchanged.

## Validation

Run `npm.cmd test` in `backend` and `npm.cmd run build` in `frontend`. Automated tests use deterministic Component 1 API fixtures and real local SHA-256/Merkle verification. They do not establish live chain/IPFS availability.

## Deployment Check, 2026-10-15

The employer enters the company's minimum **letter grade**, not numeric marks or the student's claimed grade. The form labels this as Company Minimum Required Grade. Single Grade verification remains independent.

The local `.env` points to `https://component-1-blockchain-production-28cc.up.railway.app/proof`. Its latest-anchor and finalized dataset endpoints responded successfully. `render.yaml` was corrected to use the same URL; its previous Component 1 URL returned HTTP 404. This local configuration edit does not change running remote deployment settings.

Run `node scripts/check-grade-requirement-live.js` from `backend` for a read-only live integration check. It uses the real Component 1 service and the configured ZKP policy, injects a verifier session only inside the local test harness, and disables audit persistence. It prints decisions without official grades, marks or candidate identifiers. Both the exact-grade requirement (`MEETS_REQUIREMENT`) and a higher-grade requirement (`DOES_NOT_MEET`) passed with all evidence authenticated. This does not test an employer's live login or the deployed Component 4 authenticated endpoint.

Final local validation: 26 automated tests passed; frontend production build passed.

`https://r26-se-011.vercel.app/` responded HTTP 200 and served an app titled `grading-dapp`. The linked Component 4 deployment at `https://component-4-security-layer-production.up.railway.app/` responded successfully, but its published JavaScript still contained Full Transcript and lacked `grade-requirement`. The new Component 4 feature needs deployment before employers can use it on that public site. No remote deployment was performed during this check.
