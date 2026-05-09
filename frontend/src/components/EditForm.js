import React, { useState } from "react";
import axios from "axios";
import "./EditForm.css";

// ── Mirror the backend grade logic on the frontend ──────
function calculateGrade(marks) {
  const m = Number(marks);
  if (isNaN(m)) return null;
  if (m >= 90) return "A+";
  if (m >= 80) return "A";
  if (m >= 75) return "A-";
  if (m >= 70) return "B+";
  if (m >= 65) return "B";
  if (m >= 60) return "B-";
  if (m >= 55) return "C+";
  if (m >= 50) return "C";
  if (m >= 40) return "C-";
  if (m >= 35) return "D+";
  if (m >= 30) return "D";
  return "E";
}

function gradeClass(grade) {
  if (!grade) return "neutral";
  if (["A+", "A", "A-"].includes(grade)) return "high";
  if (["B+", "B", "B-"].includes(grade)) return "mid";
  if (["C+", "C", "C-"].includes(grade)) return "low";
  if (["D+", "D"].includes(grade)) return "warn";
  if (grade === "E") return "fail";
  return "neutral";
}

function EditForm({ candidateData, boaUser, moduleCode, onSaveSuccess }) {
  const [marks, setMarks]     = useState("");
  const [reason, setReason]   = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Deadline check ──────────────────────────────────
  const releaseDate = new Date(candidateData.releaseDate);
  releaseDate.setDate(releaseDate.getDate() + 14);
  const isLocked = new Date() > releaseDate;

  const daysLeft = Math.max(
    0,
    Math.ceil((releaseDate - new Date()) / (1000 * 60 * 60 * 24))
  );

  // ── Live grade preview ──────────────────────────────
  const previewGrade = marks !== "" ? calculateGrade(marks) : null;

  // ── Validation ──────────────────────────────────────
  const validateForm = () => {
    if (marks === "" || Number(marks) < 0 || Number(marks) > 100) {
      showMsg("Marks must be a value between 0 and 100.", "error");
      return false;
    }
    if (reason.trim().length < 5) {
      showMsg("Reason must be at least 5 characters.", "error");
      return false;
    }
    return true;
  };

  const showMsg = (text, type) => {
    setMessage(text);
    setMsgType(type);
  };

  // ── Submit ──────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateForm()) return;
    try {
      setLoading(true);
      const response = await axios.post("http://localhost:5000/api/edit", {
        boaUser,
        moduleCode,
        candidateId: candidateData.candidateId,
        newMarks: Number(marks),
        editedBy: boaUser,
        reason,
      });
      showMsg(response.data.message, "success");
      setMarks("");
      setReason("");

      // ── Re-fetch the candidate to refresh all UI data ──
      onSaveSuccess();

    } catch (error) {
      showMsg(error.response?.data?.message || "An error occurred.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ef-root">

      {/* ── Current Values ──────────────────────────── */}
      <div className="ef-current">
        <div className="ef-current__item">
          <span className="ef-label">Current Marks</span>
          <span className="ef-current__val">{candidateData.marks}</span>
        </div>
        <div className="ef-current__divider" />
        <div className="ef-current__item">
          <span className="ef-label">Current Grade</span>
          <span className="ef-current__val">{candidateData.grade}</span>
        </div>
        {!isLocked && (
          <>
            <div className="ef-current__divider" />
            <div className="ef-current__item">
              <span className="ef-label">Review Window</span>
              <span className="ef-current__val ef-current__val--accent">
                {daysLeft}d remaining
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Lock Notice ─────────────────────────────── */}
      {isLocked && (
        <div className="ef-lock-notice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Editing is locked — the 14-day review period has expired.
        </div>
      )}

      {/* ── Form Fields ─────────────────────────────── */}
      <div className="ef-form">

        {/* New Marks */}
        <div className="ef-field">
          <label className="ef-label" htmlFor="ef-marks">New Marks</label>
          <input
            id="ef-marks"
            className="ef-input"
            type="number"
            min="0"
            max="100"
            placeholder="0 – 100"
            value={marks}
            onChange={(e) => setMarks(e.target.value)}
            disabled={isLocked}
          />
        </div>

        {/* Auto Grade Preview */}
        <div className="ef-field">
          <label className="ef-label">Calculated Grade</label>
          <div className={`ef-grade-preview ef-grade-preview--${gradeClass(previewGrade)}`}>
            {previewGrade ? (
              <>
                <span className="ef-grade-preview__value">{previewGrade}</span>
                <span className="ef-grade-preview__hint">auto‑calculated</span>
              </>
            ) : (
              <span className="ef-grade-preview__placeholder">
                Enter marks to preview
              </span>
            )}
          </div>
        </div>

        {/* Reason — full width */}
        <div className="ef-field ef-field--full">
          <label className="ef-label" htmlFor="ef-reason">Correction Reason</label>
          <input
            id="ef-reason"
            className="ef-input"
            type="text"
            placeholder="Briefly describe the reason for this revision…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLocked}
          />
        </div>

      </div>

      {/* ── Submit ──────────────────────────────────── */}
      <div className="ef-footer">
        <button
          className={`ef-btn ef-btn--submit ${loading ? "ef-btn--loading" : ""}`}
          onClick={handleSubmit}
          disabled={isLocked || loading}
        >
          {loading ? (
            <span className="ef-spinner" />
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Revision
            </>
          )}
        </button>

        {message && (
          <div className={`ef-message ef-message--${msgType}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {msgType === "success"
                ? <polyline points="20 6 9 17 4 12"/>
                : <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>
              }
            </svg>
            {message}
          </div>
        )}
      </div>

    </div>
  );
}

export default EditForm;