import React from "react";
import CandidateSearch from "../components/CandidateSearch";
import "./Dashboard.css";

function Dashboard() {
  const boaUser = "boaA";
  const assignedModule = "SE3040";

  return (
    <div className="dashboard">
      {/* ── Top Bar ───────────────────────── */}
      <header className="dashboard__header">
        <div className="dashboard__header-inner">
          <div className="dashboard__brand">
            <span className="dashboard__brand-mark">BOE</span>
            <div>
              <h1 className="dashboard__title">Result Revision Dashboard</h1>
              <p className="dashboard__subtitle">
                Board of Examiners · Academic Records System
              </p>
            </div>
          </div>

          <div className="dashboard__meta">
            <div className="dashboard__badge dashboard__badge--user">
              <span className="dashboard__badge-label">Logged in as</span>
              <span className="dashboard__badge-value">{boaUser}</span>
            </div>
            <div className="dashboard__badge dashboard__badge--module">
              <span className="dashboard__badge-label">Assigned Module</span>
              <span className="dashboard__badge-value">{assignedModule}</span>
            </div>
          </div>
        </div>

        <div className="dashboard__header-rule" />
      </header>

      {/* ── Body ──────────────────────────── */}
      <main className="dashboard__body">
        <CandidateSearch boaUser={boaUser} moduleCode={assignedModule} />
      </main>
    </div>
  );
}

export default Dashboard;
