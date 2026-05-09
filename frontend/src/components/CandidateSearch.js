import React, { useState } from "react";
import axios from "axios";
import EditForm from "./EditForm";
import AuditHistory from "./AuditHistory";
import "./CandidateSearch.css";

function CandidateSearch({ boaUser, moduleCode }) {
  const [candidateId, setCandidateId] = useState("");
  const [candidateData, setCandidateData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!candidateId.trim()) return;
    try {
      setLoading(true);
      setError("");
      const response = await axios.get(
        `http://localhost:5000/api/candidate/${candidateId}`,
      );
      setCandidateData(response.data);
    } catch {
      setCandidateData(null);
      setError("No candidate record found for this ID.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="cs-root">
      {/* ── Search Panel ───────────────────── */}
      <section className="cs-search-panel">
        <div className="cs-search-panel__header">
          <span className="cs-section-eyebrow">Step 01</span>
          <h2 className="cs-section-title">Candidate Lookup</h2>
          <p className="cs-section-desc">
            Enter the candidate ID to retrieve their result record for review.
          </p>
        </div>

        <div className="cs-search-row">
          <div className="cs-input-wrap">
            <span className="cs-input-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <input
              className="cs-input"
              type="text"
              placeholder="e.g. 20220001"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </div>
          <button
            className={`cs-btn cs-btn--primary ${loading ? "cs-btn--loading" : ""}`}
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? (
              <span className="cs-spinner" />
            ) : (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                Search
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="cs-error">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            {error}
          </div>
        )}
      </section>

      {/* ── Results ────────────────────────── */}
      {candidateData && (
        <div className="cs-results">
          {/* Candidate Detail Card */}
          <section className="cs-card cs-candidate-card">
            <div className="cs-card__header">
              <span className="cs-section-eyebrow">Step 02</span>
              <h2 className="cs-section-title">Candidate Record</h2>
            </div>

            <div className="cs-detail-grid">
              <div className="cs-detail-item">
                <span className="cs-detail-label">Candidate ID</span>
                <span className="cs-detail-value cs-detail-value--mono cs-detail-value--accent">
                  {candidateData.candidateId}
                </span>
              </div>
              <div className="cs-detail-item">
                <span className="cs-detail-label">Module</span>
                <span className="cs-detail-value cs-detail-value--mono">
                  {candidateData.moduleCode}
                </span>
              </div>
              <div className="cs-detail-item">
                <span className="cs-detail-label">Current Marks</span>
                <span className="cs-detail-value cs-detail-value--large">
                  {candidateData.marks}
                  <span className="cs-detail-unit">/ 100</span>
                </span>
              </div>
              <div className="cs-detail-item">
                <span className="cs-detail-label">Current Grade</span>
                <span
                  className={`cs-grade-badge cs-grade-badge--${gradeClass(candidateData.grade)}`}
                >
                  {candidateData.grade}
                </span>
              </div>
              <div className="cs-detail-item">
                <span className="cs-detail-label">Record Version</span>
                <span className="cs-detail-value cs-detail-value--mono cs-detail-value--muted">
                  v{candidateData.version}
                </span>
              </div>
            </div>
          </section>

          {/* Edit Form */}
          <section className="cs-card">
            <div className="cs-card__header">
              <span className="cs-section-eyebrow">Step 03</span>
              <h2 className="cs-section-title">Submit Revision</h2>
            </div>
            <EditForm
              candidateData={candidateData}
              boaUser={boaUser}
              moduleCode={moduleCode}
            />
          </section>

          {/* Audit History */}
          <section className="cs-card">
            <div className="cs-card__header">
              <span className="cs-section-eyebrow">Audit Trail</span>
              <h2 className="cs-section-title">Revision History</h2>
            </div>
            <AuditHistory history={candidateData.history} />
          </section>
        </div>
      )}
    </div>
  );
}

function gradeClass(grade) {
  if (!grade) return "neutral";
  if (["A+", "A", "A-"].includes(grade)) return "high";
  if (["B+", "B", "B-"].includes(grade)) return "mid";
  if (["C+", "C", "C-"].includes(grade)) return "low";
  if (grade === "D") return "warn";
  if (grade === "F") return "fail";
  return "neutral";
}

export default CandidateSearch;
