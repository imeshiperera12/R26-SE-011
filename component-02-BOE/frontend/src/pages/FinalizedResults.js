import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getFinalizedResults } from "../services/finalResultService";

import "./FinalizedResults.css";

const FinalizedResults = () => {
  const navigate = useNavigate();

  const [results, setResults] = useState([]);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================
  // LOAD FINALIZED RESULTS
  // ==========================================

  const loadResults = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getFinalizedResults();

      setResults(data.results || []);
    } catch (err) {
      console.error("Failed to load finalized results:", err);

      setError(
        err.response?.data?.message || "Failed to load finalized results.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  // ==========================================
  // GET UNIQUE MODULES
  // ==========================================

  const modules = useMemo(() => {
    return [...new Set(results.map((result) => result.moduleCode))].sort();
  }, [results]);

  // ==========================================
  // FILTER RESULTS
  // ==========================================

  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      const candidateId = result.candidateId?.toString().toLowerCase() || "";

      const moduleCode = result.moduleCode?.toString() || "";

      const searchValue = search.toLowerCase();

      const matchesStudent = candidateId.includes(searchValue);

      const matchesModule = !moduleFilter || moduleCode === moduleFilter;

      return matchesStudent && matchesModule;
    });
  }, [results, search, moduleFilter]);

  // ==========================================
  // FORMAT DATE
  // ==========================================

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleString();
  };

  // ==========================================
  // STATUS CLASS
  // ==========================================

  const getStatusClass = (status) => {
    switch (status) {
      case "STORED":
        return "status-stored";

      case "READY":
        return "status-ready";

      case "PENDING":
        return "status-pending";

      default:
        return "status-default";
    }
  };

  // ==========================================
  // DASHBOARD
  // ==========================================

  return (
    <div className="finalized-page">
      {/* ======================================
          HEADER
          ====================================== */}

      <header className="finalized-header">
        <div className="finalized-header__content">
          <div className="finalized-header__info">
            <button
              className="finalized-back-btn"
              onClick={() => navigate("/dashboard")}
              title="Back to Dashboard"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>

            <div className="finalized-title-block">
              <span className="finalized-eyebrow">BOE RECORDS</span>

              <h1>Finalized Results</h1>

              <p>View finalized student results and blockchain status.</p>
            </div>
          </div>

          <button
            className="refresh-btn"
            onClick={loadResults}
            disabled={loading}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
              <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
            </svg>

            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* ======================================
          MAIN CONTENT
          ====================================== */}

      <main className="finalized-content">
        {/* ==================================
            PAGE INTRO
            ================================== */}

        <section className="finalized-intro">
          <div>
            <span className="finalized-intro__eyebrow">FINALIZED RECORDS</span>

            <h2>Academic Results Archive</h2>

            <p>
              Browse results that have completed the BOE review and finalization
              process.
            </p>
          </div>

          <div className="result-count-card">
            <span>Total Finalized</span>

            <strong>{results.length}</strong>

            <small>RESULTS</small>
          </div>
        </section>

        {/* ==================================
            FILTERS
            ================================== */}

        <section className="results-controls">
          <div className="search-wrapper">
            <svg
              className="search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16" y1="16" x2="21" y2="21" />
            </svg>

            <input
              type="text"
              placeholder="Search Student ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-wrapper">
            <span className="filter-label">MODULE</span>

            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <option value="">All Modules</option>

              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </div>

          {(search || moduleFilter) && (
            <button
              className="clear-filter-btn"
              onClick={() => {
                setSearch("");
                setModuleFilter("");
              }}
            >
              Clear Filters
            </button>
          )}
        </section>

        {/* ==================================
            LOADING
            ================================== */}

        {loading && (
          <div className="results-state">
            <div className="results-spinner" />

            <p>Loading finalized results...</p>
          </div>
        )}

        {/* ==================================
            ERROR
            ================================== */}

        {!loading && error && (
          <div className="results-error">
            <div className="error-icon">!</div>

            <div>
              <h3>Unable to load results</h3>

              <p>{error}</p>

              <button onClick={loadResults}>Try Again</button>
            </div>
          </div>
        )}

        {/* ==================================
            RESULTS
            ================================== */}

        {!loading && !error && (
          <section className="results-section">
            <div className="results-section__header">
              <div>
                <h3>Finalized Student Results</h3>

                <p>
                  Showing <strong>{filteredResults.length}</strong> of{" "}
                  <strong>{results.length}</strong> finalized result(s)
                </p>
              </div>

              <div className="records-indicator">
                <span />
                FINALIZED RECORDS
              </div>
            </div>

            <div className="table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Module</th>
                    <th>Marks</th>
                    <th>Grade</th>
                    <th>Version</th>
                    <th>Finalized At</th>
                    <th>Blockchain Status</th>
                    <th>Blockchain Eligible At</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredResults.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="empty-results">
                        <div className="empty-icon">∅</div>

                        <strong>No finalized results found</strong>

                        <span>Try changing your search or module filter.</span>
                      </td>
                    </tr>
                  ) : (
                    filteredResults.map((result) => (
                      <tr key={`${result.candidateId}-${result.moduleCode}`}>
                        <td>
                          <span className="student-id">
                            {result.candidateId}
                          </span>
                        </td>

                        <td>
                          <span className="module-code">
                            {result.moduleCode}
                          </span>
                        </td>

                        <td>
                          <span className="marks">{result.marks}</span>
                        </td>

                        <td>
                          <span className="grade">{result.grade}</span>
                        </td>

                        <td>
                          <span className="version">v{result.version}</span>
                        </td>

                        <td>
                          <span className="date-value">
                            {formatDate(result.finalizedAt)}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`blockchain-status ${getStatusClass(
                              result.blockchainStatus,
                            )}`}
                          >
                            <span className="status-dot" />

                            {result.blockchainStatus || "UNKNOWN"}
                          </span>
                        </td>

                        <td>
                          <span className="date-value">
                            {formatDate(result.blockchainEligibleAt)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default FinalizedResults;
