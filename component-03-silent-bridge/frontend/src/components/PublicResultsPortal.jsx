// frontend/src/components/PublicResultsPortal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://r26-se-011-production.up.railway.app';

export default function PublicResultsPortal({ onBack }) {
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        // Fetch all blocks to extract module mark-sheets
        axios.get(`${API_BASE}/api/ledger/audit-trail`)
            .then(res => {
                const chain = res.data.chain || [];
                // Group latest block records per module
                const moduleMap = {};
                chain.forEach(block => {
                    moduleMap[block.moduleCode] = {
                        moduleCode: block.moduleCode,
                        records: block.data,
                        sealedAt: block.timestamp,
                        provenanceHash: block.blockHash,
                        isRecorrection: block.isRecorrection
                    };
                });
                setModules(Object.values(moduleMap));
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch public mark-sheets", err);
                setLoading(false);
            });
    }, []);

    const filteredModules = modules.filter(m => 
        m.moduleCode.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="portal-wrapper">
            <nav className="top-nav">
                <div className="nav-logo"><span>💠</span> Unofficial Published Mark-Sheets</div>
                <button onClick={onBack} className="logout-btn">← Return to Gateway</button>
            </nav>

            <div className="portal-container" style={{ maxWidth: '900px' }}>
                <div className="portal-header">
                    <h2>Published Module Results</h2>
                    <p>Browse official bulk mark-sheets categorized by module code, securely anchored on the private ledger.</p>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <input
                        type="text"
                        placeholder="Filter by Module Code (e.g. SE4010)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="module-input"
                        style={{ width: '100%', padding: '0.9rem 1.2rem', fontSize: '1rem' }}
                    />
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading ledger mark-sheets...</div>
                ) : filteredModules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        No published mark-sheets found in the private ledger.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        {filteredModules.map((mod, idx) => (
                            <div key={idx} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.3rem' }}>
                                            Module: <span style={{ color: 'var(--accent-primary)' }}>{mod.moduleCode}</span>
                                        </h3>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Sealed: {new Date(mod.sealedAt).toLocaleString()} | Total Candidates: {mod.records.length}
                                        </span>
                                    </div>
                                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', background: mod.isRecorrection ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: mod.isRecorrection ? '#fcd34d' : '#34d399' }}>
                                        {mod.isRecorrection ? 'Re-correction / Appeal Batch' : 'Standard Mark-Sheet'}
                                    </span>
                                </div>

                                <div style={{ overflowX: 'auto', maxHeight: '350px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0 }}>
                                                <th style={{ padding: '0.75rem' }}>Candidate ID</th>
                                                <th style={{ padding: '0.75rem' }}>Marks</th>
                                                <th style={{ padding: '0.75rem' }}>Final Grade</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mod.records.map((row, rIdx) => (
                                                <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{row.candidateId}</td>
                                                    <td style={{ padding: '0.75rem' }}>{row.gradingData['Marks'] || row.gradingData['Final Marks'] || row.gradingData['New Marks'] || 'N/A'}</td>
                                                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{row.gradingData['Final Grade'] || row.gradingData['Overall Grade'] || row.gradingData['Appealed Grade'] || 'Pass'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div style={{ marginTop: '1rem', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '0.6rem', borderRadius: '6px', wordBreak: 'break-all' }}>
                                    Batch Provenance Hash: {mod.provenanceHash}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}