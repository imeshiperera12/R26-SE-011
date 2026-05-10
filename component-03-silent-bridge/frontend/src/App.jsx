import React, { useState } from 'react';
import Login from './components/Login';
import LecturerPortal from './components/LecturerPortal';
import VerificationPortal from './components/VerificationPortal';

function App() {
  // Application State: 'landing', 'employer', or 'academic'
  const [appMode, setAppMode] = useState('landing');
  
  // Authentication State for Academics
  const [user, setUser] = useState(null);

  const handleLoginSuccess = (userData) => setUser(userData);
  const handleLogout = () => {
    setUser(null);
    setAppMode('landing'); // Send them back to home on logout
  };

  // ---------------------------------------------------------
  // VIEW 1: The Public Landing Page
  // ---------------------------------------------------------
  if (appMode === 'landing') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-primary)', textAlign: 'center', padding: '20px' }}>
        <div style={{ fontSize: '4.5rem', marginBottom: '20px', filter: 'drop-shadow(0 0 15px var(--accent-glow))' }}>💠</div>
        <h1 style={{ fontSize: '3.5rem', fontFamily: 'Outfit', color: 'var(--text-primary)', margin: '0 0 15px 0', letterSpacing: '-0.02em' }}>Silent Bridge</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '60px', maxWidth: '600px', lineHeight: '1.6' }}>
          Decentralized Academic Verification System. <br/>Select your gateway to continue.
        </p>
        
        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
          
          {/* Corporate / Employer Gateway */}
          <button
            onClick={() => setAppMode('employer')}
            style={{ padding: '35px 40px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s ease', minWidth: '280px', maxWidth: '320px', textAlign: 'center' }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-main)'; e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 25px var(--accent-glow)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ fontSize: '2.5rem', color: 'var(--accent-main)', marginBottom: '15px' }}>🏢</div>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', color: 'var(--text-primary)', margin: '0 0 10px 0' }}>Corporate Verifier</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>Public portal for employers to instantly query and verify transcripts.</p>
          </button>

          {/* Academic / Lecturer Gateway */}
          <button
            onClick={() => setAppMode('academic')}
            style={{ padding: '35px 40px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.3s ease', minWidth: '280px', maxWidth: '320px', textAlign: 'center' }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-main)'; e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 10px 25px var(--accent-glow)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <div style={{ fontSize: '2.5rem', color: 'var(--accent-main)', marginBottom: '15px' }}>🎓</div>
            <h3 style={{ fontFamily: 'Outfit', fontSize: '1.5rem', color: 'var(--text-primary)', margin: '0 0 10px 0' }}>Academic Staff</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>Secure SSO login for data ingestion and private ledger sealing.</p>
          </button>

        </div>
      </div>
    );
  }

  // ---------------------------------------------------------
  // VIEW 2: The Public Employer Route (No Login Required)
  // ---------------------------------------------------------
  if (appMode === 'employer') {
    return (
      <div className="portal-wrapper">
         <nav className="top-nav">
            <div className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.5rem' }}>💠</span> Corporate Verification Access
            </div>
            {/* Button to go back to the landing page */}
            <button onClick={() => setAppMode('landing')} className="logout-btn" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              ← Return to Gateway
            </button>
         </nav>
         
         {/* Render the Verification Portal Directly */}
         <VerificationPortal />
      </div>
    );
  }

  // ---------------------------------------------------------
  // VIEW 3: The Protected Academic Route (Login Required)
  // ---------------------------------------------------------
  if (appMode === 'academic') {
    
    // If they chose Academic but haven't logged in, show the Login wall
    if (!user) {
      return (
         <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setAppMode('landing')} 
              style={{ position: 'absolute', top: '30px', left: '30px', zIndex: 10, background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', fontWeight: '500' }}
            >
               ← Return to Gateway
            </button>
            <Login onLoginSuccess={handleLoginSuccess} />
         </div>
      );
    }

    // If they are logged in, show the secure Lecturer Portal
    return (
      <div className="portal-wrapper">
        <nav className="top-nav">
            <div className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.5rem' }}>💠</span> Silent Bridge Ingestion
            </div>
            <div className="nav-user">
                <div className="user-info">
                    <span className="user-name">{user.name}</span>
                    <span className="user-role">{user.role}</span>
                </div>
                <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
        </nav>
        
        {/* Render the Lecturer Portal */}
        <LecturerPortal user={user} />
      </div>
    );
  }
}

export default App;