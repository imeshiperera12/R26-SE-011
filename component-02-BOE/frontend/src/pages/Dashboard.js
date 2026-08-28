import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import CandidateSearch from "../components/CandidateSearch";

import { getDashboard } from "../services/dashboardService";
import { logout } from "../utils/auth";
import { downloadModuleExcel } from "../services/exportService";

import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // ==========================================
  // LOAD DASHBOARD
  // ==========================================

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await getDashboard();

      setDashboard(data);
    } catch (error) {
      console.error("Failed to load dashboard:", error);

      logout();
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // LOGOUT
  // ==========================================

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ==========================================
  // OPEN MODULE
  // ==========================================

  const handleModuleClick = (module) => {
    // Locked modules cannot be opened
    if (module.status === "LOCKED") {
      return;
    }

    // Empty modules cannot be opened
    if (module.status === "EMPTY") {
      return;
    }

    setSelectedModule(module);
  };

  // ==========================================
  // DOWNLOAD EXCEL
  // ==========================================

  const handleDownloadExcel = async () => {
    if (!selectedModule) return;

    // Frontend protection
    if (selectedModule.status !== "OPEN") {
      alert("Excel export is unavailable because the review period is closed.");
      return;
    }

    try {
      setExporting(true);

      await downloadModuleExcel(selectedModule.moduleCode);
    } catch (error) {
      console.error("Excel download failed:", error);

      /*
       * Axios normally provides the backend error here.
       * However, because the responseType is "blob", the
       * backend JSON error may also arrive as a Blob.
       */
      let errorMessage = "Failed to download Excel file.";

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      alert(errorMessage);
    } finally {
      setExporting(false);
    }
  };

  // ==========================================
  // FORMAT DATE
  // ==========================================

  const formatDate = (date) => {
    if (!date) return "N/A";

    return new Date(date).toLocaleString();
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-loading__spinner" />
        <span>Loading Dashboard...</span>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD
  // ==========================================

  return (
    <div className="dashboard">
      {/* ======================================
          HEADER
          ====================================== */}

      <header className="dashboard-header">
        <div className="dashboard-header__content">
          <div className="dashboard-header__info">
            <div className="dashboard-header__mark">BOE</div>

            <div>
              <h1>Board of Examiners Dashboard</h1>

              <p>
                Welcome,
                <strong> {dashboard.username}</strong>
              </p>
            </div>
          </div>

          <button
            className="finalized-results-btn"
            onClick={() => navigate("/finalized-results")}
          >
            Finalized Results
          </button>

          <button className="logout-btn" onClick={handleLogout}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      {/* ======================================
          MAIN CONTENT
          ====================================== */}

      <main className="dashboard-content">
        {!selectedModule ? (
          <>
            {/* ==================================
                MODULE INTRO
                ================================== */}

            <section className="dashboard-intro">
              <span className="dashboard-intro__eyebrow">BOE WORKSPACE</span>

              <h2>Your Assigned Modules</h2>

              <p>
                Select an open module to begin reviewing and revising candidate
                results.
              </p>
            </section>

            {/* ==================================
                MODULE CARDS
                ================================== */}

            <div className="module-grid">
              {dashboard.assignedModules.map((module) => {
                const isLocked = module.status === "LOCKED";
                const isEmpty = module.status === "EMPTY";
                const isOpen = module.status === "OPEN";

                return (
                  <div
                    key={module.moduleCode}
                    className={`module-card ${
                      isLocked || isEmpty ? "module-card--locked" : ""
                    }`}
                    onClick={() => handleModuleClick(module)}
                  >
                    {/* ==========================
                        CARD TOP
                        ========================== */}

                    <div className="module-card__top">
                      <div className="module-card__icon">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4 4h16v16H4z" />
                          <path d="M8 8h8" />
                          <path d="M8 12h8" />
                          <path d="M8 16h5" />
                        </svg>
                      </div>

                      {isOpen && <span className="module-card__arrow">→</span>}
                    </div>

                    {/* ==========================
                        MODULE CODE
                        ========================== */}

                    <h3>{module.moduleCode}</h3>

                    {/* ==========================
                        DESCRIPTION
                        ========================== */}

                    <p>
                      {isOpen
                        ? "Review and manage candidate results"
                        : isLocked
                          ? "BOE review period has ended"
                          : "No results available for this module"}
                    </p>

                    {/* ==========================
                        STATUS
                        ========================== */}

                    <div
                      className={`module-status ${
                        isOpen ? "module-status--open" : "module-status--locked"
                      }`}
                    >
                      {isOpen ? (
                        <>
                          <span className="module-status__dot" />
                          <span>REVIEW OPEN</span>
                        </>
                      ) : (
                        <>
                          <span className="module-status__lock">🔒</span>

                          <span>
                            {isEmpty ? "NO RESULTS" : "REVIEW LOCKED"}
                          </span>
                        </>
                      )}
                    </div>

                    {/* ==========================
                        DEADLINE
                        ========================== */}

                    {module.reviewDeadline && (
                      <div className="module-deadline">
                        <span className="module-deadline__label">
                          REVIEW DEADLINE
                        </span>

                        <span className="module-deadline__value">
                          {formatDate(module.reviewDeadline)}
                        </span>
                      </div>
                    )}

                    {/* ==========================
                        FOOTER
                        ========================== */}

                    <div className="module-card__footer">
                      <span>{isOpen ? "Open Module" : "Module Locked"}</span>

                      {isOpen && <span>→</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* ==================================
                MODULE TOOLBAR
                ================================== */}

            <div className="dashboard-toolbar">
              <button
                className="back-btn"
                onClick={() => setSelectedModule(null)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />

                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Modules
              </button>

              {/* ==================================
                  CURRENT MODULE
                  ================================== */}

              <div className="current-module">
                <span className="current-module__label">MODULE</span>

                <strong>{selectedModule.moduleCode}</strong>
              </div>

              {/* ==================================
                  MODULE STATUS
                  ================================== */}

              <div
                className={`toolbar-status ${
                  selectedModule.status === "OPEN"
                    ? "toolbar-status--open"
                    : "toolbar-status--locked"
                }`}
              >
                {selectedModule.status === "OPEN" ? (
                  <>
                    <span className="toolbar-status__dot" />
                    REVIEW OPEN
                  </>
                ) : (
                  <>🔒 REVIEW LOCKED</>
                )}
              </div>

              {/* ==================================
                  DOWNLOAD EXCEL
                  ================================== */}

              <button
                className="download-excel-btn"
                onClick={handleDownloadExcel}
                disabled={exporting || selectedModule.status !== "OPEN"}
              >
                {exporting ? (
                  <>
                    <span className="download-spinner" />
                    Generating...
                  </>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />

                      <polyline points="7 10 12 15 17 10" />

                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download Excel
                  </>
                )}
              </button>
            </div>

            {/* ==================================
                REVIEW INFORMATION
                ================================== */}

            <div className="selected-module-info">
              <div>
                <span className="selected-module-info__label">
                  REVIEW DEADLINE
                </span>

                <strong>{formatDate(selectedModule.reviewDeadline)}</strong>
              </div>

              <div>
                <span className="selected-module-info__label">
                  RELEASE DATE
                </span>

                <strong>{formatDate(selectedModule.releaseDate)}</strong>
              </div>

              <div>
                <span className="selected-module-info__label">STATUS</span>

                <strong>
                  {selectedModule.status === "OPEN"
                    ? "REVIEW OPEN"
                    : "REVIEW LOCKED"}
                </strong>
              </div>
            </div>

            {/* ==================================
                CANDIDATE SEARCH
                ================================== */}

            <CandidateSearch module={selectedModule} />
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
