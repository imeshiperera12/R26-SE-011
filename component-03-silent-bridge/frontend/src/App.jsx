import React, { useState } from 'react';
import SilentBridgeApp from './SilentBridgeApp';
import './App.css';

export default function App() {
  const [activeView, setActiveView] = useState('master-hub'); // 'master-hub' or 'component-3'

  if (activeView === 'component-3') {
    return <SilentBridgeApp onReturnToMasterHub={() => setActiveView('master-hub')} />;
  }

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      backgroundColor: "#060911",
      color: "#f8fafc",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "3rem 1.5rem",
      backgroundImage: `
        radial-gradient(circle at 15% 15%, rgba(59, 130, 246, 0.08) 0%, transparent 45%),
        radial-gradient(circle at 85% 85%, rgba(139, 92, 246, 0.06) 0%, transparent 45%)
      `
    }}>
      <div style={{ maxWidth: "1100px", width: "100%" }}>
        
        {/* Header */}
        <header style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            fontFamily: "monospace",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            padding: "0.35rem 0.85rem",
            background: "rgba(59, 130, 246, 0.1)",
            color: "#60a5fa",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            borderRadius: "20px",
            marginBottom: "1rem"
          }}>
            <span style={{
              width: "7px",
              height: "7px",
              backgroundColor: "#10b981",
              borderRadius: "50%",
              boxShadow: "0 0 8px #10b981"
            }}></span>
            System Operational • All Services Connected
          </div>
          <h1 style={{
            fontSize: "2.75rem",
            fontWeight: "800",
            letterSpacing: "-0.03em",
            marginBottom: "0.75rem",
            background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}>
            Decentralized Academic Grading Platform
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "1.1rem", maxWidth: "700px", margin: "0 auto", lineHeight: "1.5" }}>
            Comprehensive Design and Analysis Research Project — Central Demonstration Hub for End-to-End Workflow Validation
          </p>
        </header>

        {/* Components Grid */}
        <div style={{ fontSize: "1.1rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "1.25rem", fontWeight: "700" }}>
          ⚡ System Components & Portals
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem", marginBottom: "3.5rem" }}>
          
          {/* Component 3: Silent Bridge */}
          <div style={cardStyle}>
            <div>
              <div style={cardHeaderStyle}>
                <span style={iconStyle}>📥</span>
                <span style={tagStyle}>COMPONENT 3</span>
              </div>
              <h3>Silent Bridge & Lecturer Portal</h3>
              <p style={cardTextStyle}>Schema-agnostic Excel/CSV ingestion engine featuring automated PII masking, SHA-256 private ledger chaining, duplicate prevention, and dynamic institutional time-gates.</p>
              <div style={techTagsStyle}>
                <span style={techTagStyle}>Node.js</span>
                <span style={techTagStyle}>Express</span>
                <span style={techTagStyle}>SheetJS</span>
                <span style={techTagStyle}>React</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button onClick={() => setActiveView('component-3')} style={btnStyle}>Launch Portal →</button>
              <div style={portStyle}>Active</div>
            </div>
          </div>

          {/* Component 2: BOE Layer */}
          <div style={cardStyle}>
            <div>
              <div style={cardHeaderStyle}>
                <span style={iconStyle}>🏛️</span>
                <span style={tagStyle}>COMPONENT 2</span>
              </div>
              <h3>Board of Examiners (BOE)</h3>
              <p style={cardTextStyle}>Governs review windows, automated timeout finalization, context-aware grade appeal overrides, and versioned internal audit trails prior to blockchain proof batching.</p>
              <div style={techTagsStyle}>
                <span style={techTagStyle}>MongoDB</span>
                <span style={techTagStyle}>Mongoose</span>
                <span style={techTagStyle}>Cron Jobs</span>
                <span style={techTagStyle}>React</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <a href="https://component-2-boe-frontend.onrender.com" target="_blank" rel="noreferrer" style={btnStyle}>Launch Portal ↗</a>
              <div style={portStyle}>Active Hub</div>
            </div>
          </div>

          {/* Component 1: Core Ledger & IPFS */}
          <div style={cardStyle}>
            <div>
              <div style={cardHeaderStyle}>
                <span style={iconStyle}>🔗</span>
                <span style={tagStyle}>COMPONENT 1</span>
              </div>
              <h3>Core Ledger & Proof Layer</h3>
              <p style={cardTextStyle}>Compiles final institutional records into Merkle trees, stores immutable dataset bundles securely on IPFS via Pinata, and anchors the root cryptographic proofs on Ethereum.</p>
              <div style={techTagsStyle}>
                <span style={techTagStyle}>Solidity</span>
                <span style={techTagStyle}>IPFS / Pinata</span>
                <span style={techTagStyle}>Merkle Trees</span>
                <span style={techTagStyle}>Web3</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <a href="https://component-1-blockchain-production-28cc.up.railway.app/" target="_blank" rel="noreferrer" style={btnStyle}>Launch Ledger ↗</a>
              <div style={portStyle}>Active</div>
            </div>
          </div>

          {/* Component 4: Student/Employer Portal */}
          <div style={cardStyle}>
            <div>
              <div style={cardHeaderStyle}>
                <span style={iconStyle}>🎓</span>
                <span style={tagStyle}>COMPONENT 4</span>
              </div>
              <h3>Student & Corporate Verifier</h3>
              <p style={cardTextStyle}>Empowers students to inspect official transcripts with calculated verified GPAs and allows corporate employers to mathematically authenticate single grades without tampering risks[cite: 25].</p>
              <div style={techTagsStyle}>
                <span style={techTagStyle}>Zero-Knowledge</span>
                <span style={techTagStyle}>React</span>
                <span style={techTagStyle}>Axios</span>
                <span style={techTagStyle}>Tailwind</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <a href="https://component-4-security-layer-production.up.railway.app/" target="_blank" rel="noreferrer" style={btnStyle}>View Results ↗</a>
              <div style={portStyle}>Active</div>
            </div>
          </div>

        </div>

        {/* Research Highlights Section */}
        <div style={{
          background: "#0d1322",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "24px",
          padding: "2.5rem",
          boxShadow: "0 15px 35px rgba(0, 0, 0, 0.5)"
        }}>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", color: "#f8fafc" }}>
            💡 Architectural Breakthroughs & Research Highlights
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem" }}>
            <div style={archCardStyle}>
              <h4 style={{ color: "#38bdf8", marginBottom: "0.5rem" }}>⏱️ Autonomous Time-Gating</h4>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.6" }}>Eliminates human error by programmatically enforcing phase transitions (Standard Entry ➔ BOE Review ➔ Appeals ➔ Finalization).</p>
            </div>
            <div style={archCardStyle}>
              <h4 style={{ color: "#38bdf8", marginBottom: "0.5rem" }}>🔐 Cryptographic Provenance</h4>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.6" }}>Replaces vulnerable PDF transcripts with decentralized hash anchors and Merkle proofs, making forged results mathematically impossible.</p>
            </div>
            <div style={archCardStyle}>
              <h4 style={{ color: "#38bdf8", marginBottom: "0.5rem" }}>🛡️ Idempotency & PDPA</h4>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.6" }}>Prevents redundant database bloat through strict hash duplicate rejection while stripping private student identifiers to comply with privacy laws.</p>
            </div>
          </div>
        </div>

        <footer style={{
          marginTop: "3.5rem",
          textAlign: "center",
          color: "#64748b",
          fontSize: "0.85rem",
          fontFamily: "monospace",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingTop: "2rem",
          width: "100%"
        }}>
          SLIIT • Department of Software Engineering • Research Project R26-SE-011
        </footer>
      </div>
    </div>
  );
}

// Reusable inline styles matching your HTML theme
const cardStyle = {
  background: "rgba(17, 24, 39, 0.7)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "20px",
  padding: "2rem",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)"
};

const cardHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  marginBottom: "1.25rem"
};

const iconStyle = {
  fontSize: "2rem",
  padding: "0.75rem",
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "14px"
};

const tagStyle = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  padding: "0.3rem 0.65rem",
  borderRadius: "6px",
  background: "rgba(255, 255, 255, 0.05)",
  color: "#94a3b8",
  border: "1px solid rgba(255, 255, 255, 0.08)"
};

const cardTextStyle = {
  color: "#94a3b8",
  fontSize: "0.925rem",
  lineHeight: "1.6",
  marginBottom: "1.75rem"
};

const techTagsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
  marginBottom: "1.75rem"
};

const techTagStyle = {
  fontSize: "0.75rem",
  fontFamily: "monospace",
  padding: "0.2rem 0.5rem",
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: "4px",
  color: "#64748b"
};

const btnStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  background: "#f8fafc",
  color: "#060911",
  textDecoration: "none",
  fontWeight: "600",
  fontSize: "0.9rem",
  padding: "0.75rem 1.5rem",
  borderRadius: "10px",
  cursor: "pointer",
  border: "none",
  flex: 1
};

const portStyle = {
  fontFamily: "monospace",
  fontSize: "0.8rem",
  color: "#64748b",
  background: "rgba(0, 0, 0, 0.3)",
  padding: "0.75rem 1rem",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.08)"
};

const archCardStyle = {
  background: "rgba(17, 24, 39, 0.7)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "16px",
  padding: "1.5rem"
};