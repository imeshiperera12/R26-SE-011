import React, { useEffect, useMemo, useState } from "react";
import { getFinalizedResults } from "../services/finalResultService";

const FinalizedResults = () => {
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // Get unique modules
  const modules = useMemo(() => {
    return [...new Set(results.map((result) => result.moduleCode))].sort();
  }, [results]);

  // Search + module filtering
  const filteredResults = useMemo(() => {
    return results.filter((result) => {
      const matchesStudent = result.candidateId
        ?.toLowerCase()
        .includes(search.toLowerCase());

      const matchesModule = !moduleFilter || result.moduleCode === moduleFilter;

      return matchesStudent && matchesModule;
    });
  }, [results, search, moduleFilter]);

  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleString();
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "STORED":
        return "status-stored";

      case "READY":
        return "status-ready";

      case "PENDING":
        return "status-pending";

      default:
        return "";
    }
  };

  return (
    <div style={{ padding: "30px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "25px",
        }}
      >
        <div>
          <h1>Finalized Results</h1>

          <p>View finalized student results and blockchain status.</p>
        </div>

        <button onClick={loadResults}>Refresh</button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "15px",
          marginBottom: "25px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search Student ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "10px",
            minWidth: "250px",
          }}
        />

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          style={{
            padding: "10px",
          }}
        >
          <option value="">All Modules</option>

          {modules.map((module) => (
            <option key={module} value={module}>
              {module}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && <p>Loading finalized results...</p>}

      {/* Error */}
      {!loading && error && (
        <div>
          <p>{error}</p>

          <button onClick={loadResults}>Try Again</button>
        </div>
      )}

      {/* Results */}
      {!loading && !error && (
        <>
          <p>Showing {filteredResults.length} finalized result(s)</p>

          <div
            style={{
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: "15px",
              }}
            >
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
                    <td
                      colSpan="8"
                      style={{
                        textAlign: "center",
                        padding: "30px",
                      }}
                    >
                      No finalized results found.
                    </td>
                  </tr>
                ) : (
                  filteredResults.map((result) => (
                    <tr key={`${result.candidateId}-${result.moduleCode}`}>
                      <td>{result.candidateId}</td>

                      <td>{result.moduleCode}</td>

                      <td>{result.marks}</td>

                      <td>
                        <strong>{result.grade}</strong>
                      </td>

                      <td>v{result.version}</td>

                      <td>{formatDate(result.finalizedAt)}</td>

                      <td>
                        <span
                          className={getStatusClass(result.blockchainStatus)}
                        >
                          {result.blockchainStatus}
                        </span>
                      </td>

                      <td>{formatDate(result.blockchainEligibleAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default FinalizedResults;
