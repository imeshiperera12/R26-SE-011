// frontend/src/components/AdminPortal.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AdminPortal.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function AdminPortal() {
    const [policy, setPolicy] = useState({
        timeUnit: 'days',
        standardUploadWindow: 7,
        boeReviewWindow: 14,
        specialConcernsWindow: 21
    });
    const [status, setStatus] = useState('');

    useEffect(() => {
        axios.get(`${API_BASE}/api/policy`)
            .then(res => setPolicy(res.data))
            .catch(err => console.error("Could not load policy", err));
    }, []);

    const handleChange = (e) => {
    const { name, value } = e.target;
    // Keep numbers as numeric types
    const parsedValue = ['standardUploadWindow', 'boeReviewWindow', 'specialConcernsWindow'].includes(name)
        ? parseInt(value) || 1
        : value;

    setPolicy({ ...policy, [name]: parsedValue });
};

    const handleSave = async (e) => {
        e.preventDefault();
        setStatus('saving');
        try {
            await axios.post(`${API_BASE}/api/policy`, policy);
            setStatus('success');
            setTimeout(() => setStatus(''), 3000);
        } catch (error) {
            setStatus('error');
        }
    };

    return (
        <div className="admin-container">
            <div className="admin-card">
                <div className="admin-header">
                    <h2>⚙️ Institutional Policy Engine</h2>
                    <p>Configure the decentralized time-gate locks for academic grading windows.</p>
                </div>

                <form onSubmit={handleSave} className="admin-form">
                    <div className="form-group">
                        <label>Time Unit Measurement</label>
                        <select name="timeUnit" value={policy.timeUnit} onChange={handleChange}>
                            <option value="days">Days (Production)</option>
                            <option value="minutes">Minutes (Demo Mode)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Standard Upload Window (Phase 1)</label>
                        <div className="input-with-suffix">
                            <input type="number" name="standardUploadWindow" value={policy.standardUploadWindow} onChange={handleChange} min="1" />
                            <span>{policy.timeUnit}</span>
                        </div>
                        <small>Time until standard uploads are locked and routed to BOE.</small>
                    </div>

                    <div className="form-group">
                        <label>BOE Review Window (Phase 2)</label>
                        <div className="input-with-suffix">
                            <input type="number" name="boeReviewWindow" value={policy.boeReviewWindow} onChange={handleChange} min="1" />
                            <span>{policy.timeUnit}</span>
                        </div>
                        <small>Time until BOE finalizes unofficial marks.</small>
                    </div>

                    <div className="form-group">
                        <label>Special Concerns Window (Phase 3)</label>
                        <div className="input-with-suffix">
                            <input type="number" name="specialConcernsWindow" value={policy.specialConcernsWindow} onChange={handleChange} min="1" />
                            <span>{policy.timeUnit}</span>
                        </div>
                        <small>Time until the entire system permanently locks for final blockchain anchoring.</small>
                    </div>

                    <button type="submit" className="save-btn" disabled={status === 'saving'}>
                        {status === 'saving' ? 'Deploying...' : 'Deploy Policy to Middleware'}
                    </button>
                    
                    {status === 'success' && <div className="admin-alert success">✅ Policy live! Middleware time-gates updated.</div>}
                    {status === 'error' && <div className="admin-alert error">❌ Failed to update policy.</div>}
                </form>
            </div>
        </div>
    );
}