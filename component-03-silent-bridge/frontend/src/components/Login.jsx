import React, { useState } from 'react';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = (e) => {
        e.preventDefault();
        setIsLoading(true);

        setTimeout(() => {
            setIsLoading(false);
            onLoginSuccess({
                name: "Dr. Nithika Perera",
                faculty: "Faculty of Computing",
                role: "Senior Lecturer"
            });
        }, 1200);
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <div className="logo-placeholder">💠</div>
                    <h2>Institutional SSO</h2>
                    <p>Secure Academic Grading Enterprise</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    <div className="input-group">
                        <label>Staff Identifier</label>
                        <input
                            type="email"
                            placeholder="e.g., name@sliit.lk"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label>Security Key</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="sso-btn" disabled={isLoading}>
                        {isLoading ? 'Verifying Credentials...' : 'Sign In via SSO'}
                    </button>
                </form>

                <div className="login-footer">
                    <small>
                        Zero-Knowledge Verification Powered<br />
                        <strong>Silent Bridge Middleware</strong>
                    </small>
                </div>
            </div>
        </div>
    );
};

export default Login;