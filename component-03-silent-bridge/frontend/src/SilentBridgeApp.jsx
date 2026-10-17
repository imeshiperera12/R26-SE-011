import React, { useState } from 'react';
import Login from './components/Login';
import LecturerPortal from './components/LecturerPortal';
import AdminPortal from './components/AdminPortal';
import PublicResultsPortal from './components/PublicResultsPortal'; 
import './App.css';

export default function SilentBridgeApp({ onReturnToMasterHub }) {
  const [appMode, setAppMode] = useState('landing');
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (userData) => setUser(userData);
  const handleLogout = () => {
    setUser(null);
    setAppMode('landing');
  };

  if (appMode === 'landing') {
    return (
      <div className="landing-container">
        <button 
          onClick={onReturnToMasterHub} 
          style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
        >
          ← Master Ecosystem Hub
        </button>

        <div className="landing-logo">💠</div>
        <h1 className="landing-title">Silent Bridge</h1>
        <p className="landing-subtitle">
          Decentralized Academic Verification System (Component 3). <br />Select your gateway to continue.
        </p>

        <div className="gateway-grid">
          <button className="gateway-card" onClick={() => setAppMode('academic')}>
            <div className="gateway-icon">🎓</div>
            <h3>Academic Staff</h3>
            <p>Secure SSO login for data ingestion, audit trails, and private ledger sealing.</p>
          </button>

          <button className="gateway-card" onClick={() => setAppMode('admin')}>
            <div className="gateway-icon">⚙️</div>
            <h3>System Admin</h3>
            <p>Configure dynamic policy rules and time-gate routing windows.</p>
          </button>

          <button className="gateway-card" onClick={() => setAppMode('public-results')}>
            <div className="gateway-icon">📋</div>
            <h3>Published Results Sheets</h3>
            <p>Public bulk mark-sheets categorized by module code directly from the private ledger.</p>
          </button>
        </div>
      </div>
    );
  }

  if (appMode === 'public-results') {
    return <PublicResultsPortal onBack={() => setAppMode('landing')} />;
  }

  if (appMode === 'admin') {
    return (
      <div className="portal-wrapper">
        <nav className="top-nav">
          <div className="nav-logo"><span>💠</span> Institutional Policy Admin</div>
          <button onClick={() => setAppMode('landing')} className="logout-btn">← Return to Gateway</button>
        </nav>
        <AdminPortal />
      </div>
    );
  }

  if (appMode === 'academic') {
    if (!user) {
      return (
        <div className="auth-wrapper">
          <button onClick={() => setAppMode('landing')} className="logout-btn" style={{ margin: '2rem' }}>← Return to Gateway</button>
          <Login onLoginSuccess={handleLoginSuccess} />
        </div>
      );
    }

    return (
      <div className="portal-wrapper">
        <nav className="top-nav">
          <div className="nav-logo"><span>💠</span> Silent Bridge Ingestion Portal</div>
          <div className="nav-user">
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-role">{user.role}</span>
            </div>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </nav>
        <LecturerPortal user={user} />
      </div>
    );
  }
}