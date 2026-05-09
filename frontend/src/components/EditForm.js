import React, { useState } from "react";
import axios from "axios";
import "./EditForm.css";

function EditForm({ candidateData, boaUser, moduleCode }) {
  const [marks, setMarks]     = useState("");
  const [grade, setGrade]     = useState("");
  const [reason, setReason]   = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState(""); // "success" | "error"
  const [loading, setLoading] = useState(false);

  // ── Deadline check ──────────────────────────────────
  const releaseDate = new Date(candidateData.releaseDate);
  releaseDate.setDate(releaseDate.getDate() + 14);
  const isLocked = new Date() > releaseDate;

  const daysLeft = Math.max(
    0,
    Math.ceil((releaseDate - new Date()) / (1000 * 60 * 60 * 24))
  );

  // ── Validation ──────────────────────────────────────
  const validateForm = () => {
    if (marks === "" || marks < 0 || marks > 100) {
      showMsg("Marks must be a value between 0 and 100.", "error");
      return false;
    }
    if (grade === "") {
      showMsg("Please select a grade before submitting.", "error");
      return false;
    }
    if (reason.trim() === "") {
      showMsg("A correction reason is required.", "error");
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
        newMarks: marks,
        newGrade: grade,
        editedBy: boaUser,
        reason,
      });
      showMsg(response.data.message, "success");
      setMarks("");
      setGrade("");
      setReason("");
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

        <div className="ef-field">
          <label className="ef-label" htmlFor="ef-grade">New Grade</label>
          <div className="ef-select-wrap">
            <select
              id="ef-grade"
              className="ef-select"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              disabled={isLocked}
            >
              <option value="">Select Grade</option>
              {["A+","A","A-","B+","B","B-","C+","C","C-","D","F"].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <span className="ef-select-arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>

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
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              Save Revision
            </>
          )}
        </button>

        {message && (
          <div className={`ef-message ef-message--${msgType}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {msgType === "success"
                ? <><polyline points="20 6 9 17 4 12"/></>
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