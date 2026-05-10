import React, { useState } from 'react';
import axios from 'axios';
import './LecturerPortal.css'; 

const VerificationPortal = () => {
  const [studentId, setStudentId] = useState('');
  const [searchStatus, setSearchStatus] = useState('idle'); 
  const [results, setResults] = useState([]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;

    setSearchStatus('searching');
    try {
      const response = await axios.get(`http://localhost:5000/api/verify/${studentId}`);
      setResults(response.data.records);
      setSearchStatus('found');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        setSearchStatus('not-found');
      } else {
        console.error("Search failed:", error);
        setSearchStatus('error');
      }
    }
  };

  return (
    <div className="portal-container">
      <div className="portal-header">
        <h2>Corporate Verification</h2>
        <p>Instantly cryptographically verify student transcripts against the Private Ledger.</p>
      </div>

      <form onSubmit={handleSearch} className="search-form">
        <input 
          type="text" 
          placeholder="Enter Candidate ID (e.g., IT22061348)" 
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="search-input"
          required
        />
        <button type="submit" className="upload-btn" style={{ minWidth: '180px' }}>
          {searchStatus === 'searching' ? 'Querying...' : 'Verify Candidate'}
        </button>
      </form>

      {searchStatus === 'not-found' && (
        <div className="alert error" style={{ justifyContent: 'center' }}>
          ⚠️ No immutable records found for Candidate ID: <strong>{studentId}</strong>
        </div>
      )}

      {searchStatus === 'found' && (
        <div className="verification-results">
          <h3 style={{ color: 'var(--success)', marginBottom: '1.5rem', textAlign: 'center' }}>
            ✅ Authenticity Cryptographically Verified
          </h3>
          
          {results.map((record, index) => (
            <div key={index} className="receipt-card" style={{ marginBottom: '1.5rem' }}>
              
              <h4 style={{ color: 'var(--accent-primary)', margin: '0 0 15px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                Module: {record.moduleCode}
              </h4>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
                {Object.entries(record.gradingData).map(([assignment, grade]) => (
                  <div key={assignment} className="grade-box">
                    <small>{assignment}</small>
                    <strong>{grade}</strong>
                  </div>
                ))}
              </div>
              <div className="hash-box">
                <small>Linked to Provenance Hash:</small>
                <code>{record.provenanceHash}</code>
              </div>
              <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Sealed on: {new Date(record.sealedAt).toLocaleString()}</span>
                <span>Verified Uploader: <strong style={{ color: 'var(--text-primary)' }}>{record.uploader}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VerificationPortal;