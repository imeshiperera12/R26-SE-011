import React from "react";
import "./AuditHistory.css";

function AuditHistory({ history }) {
  if (history.length === 0) {
    return (
      <div className="ah-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <p>No revisions have been recorded yet.</p>
        <span>Edits submitted above will appear here.</span>
      </div>
    );
  }

  return (
    <div className="ah-root">
      <div className="ah-timeline">
        {[...history].reverse().map((item, index) => (
          <div key={index} className="ah-entry" style={{ animationDelay: `${index * 0.05}s` }}>

            {/* Timeline dot + line */}
            <div className="ah-entry__track">
              <div className="ah-entry__dot" />
              {index < history.length - 1 && <div className="ah-entry__line" />}
            </div>

            {/* Content */}
            <div className="ah-entry__card">
              <div className="ah-entry__header">
                <span className="ah-version">Version {item.version}</span>
                <span className="ah-time">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {new Date(item.editedAt).toLocaleString()}
                </span>
              </div>

              <div className="ah-changes">
                <div className="ah-change ah-change--old">
                  <span className="ah-change__label">Before</span>
                  <span className="ah-change__marks">{item.oldMarks}</span>
                  <span className="ah-change__grade">{item.oldGrade}</span>
                </div>
                <div className="ah-change__arrow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>
                  </svg>
                </div>
                <div className="ah-change ah-change--new">
                  <span className="ah-change__label">After</span>
                  <span className="ah-change__marks">{item.newMarks}</span>
                  <span className="ah-change__grade">{item.newGrade}</span>
                </div>
              </div>

              <div className="ah-meta">
                <div className="ah-meta__item">
                  <span className="ah-meta__key">Reason</span>
                  <span className="ah-meta__val">{item.reason}</span>
                </div>
                <div className="ah-meta__item">
                  <span className="ah-meta__key">Edited by</span>
                  <span className="ah-meta__val ah-meta__val--mono">{item.editedBy}</span>
                </div>
              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}

export default AuditHistory;