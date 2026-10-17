import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function AuditTrailViewer() {
    const [chain, setChain] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_BASE}/api/ledger/audit-trail`)
            .then(res => {
                setChain(res.data.chain);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching audit trail", err);
                setLoading(false);
            });
    }, []);

    return (
        <div style={{ padding: '2rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
            <h2>🔗 Real-Time Cryptographic Audit Trail</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Immutable append-only private ledger blocks securely anchored in MongoDB Atlas.</p>
            
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading decentralized block records...</div>
            ) : chain.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No blocks anchored in the ledger yet. Upload a grading sheet to initialize the chain.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {chain.map((block, idx) => (
                        <div key={idx} style={{ background: 'var(--bg-primary)', padding: '1.2rem', borderRadius: '12px', borderLeft: '4px solid var(--accent-primary)', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                                <span>BLOCK #{block.index}</span>
                                <span>{new Date(block.timestamp).toLocaleString()}</span>
                            </div>
                            <div style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>
                                <strong>Module:</strong> {block.moduleCode} | <strong>Records:</strong> {block.recordCount} | <strong>Type:</strong> {block.isRecorrection ? <span style={{ color: 'var(--warning)' }}>Appealed / Re-correction</span> : <span style={{ color: 'var(--success)' }}>Standard Entry</span>}
                            </div>
                            <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '6px', wordBreak: 'break-all', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div><strong>Block Hash:</strong> {block.blockHash}</div>
                                <div><strong>Previous Hash:</strong> {block.previousHash}</div>
                                <div><strong>Payload Hash:</strong> {block.payloadHash}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}