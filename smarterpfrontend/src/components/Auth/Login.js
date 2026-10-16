import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { landingPath } from '../../config/menuConfig';
import AuthLayout, { Field, FieldIcons, RevealButton, Spinner } from './AuthLayout';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const fail = (message) => {
    setError(message);
    setErrorKey(k => k + 1);   // replays the shake on a repeated error
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!formData.email || !formData.password) return fail('Please enter your email and password.');

    setBusy(true);
    try {
      const response = await authAPI.login(formData);
      if (response.data.success) {
        localStorage.setItem('currentUser', JSON.stringify(response.data.user));
        localStorage.setItem('token', response.data.token);
        onLogin(response.data.user);
        navigate(landingPath(response.data.user) || '/dashboard');
        return;
      }
      fail('Sign-in failed. Please try again.');
    } catch (err) {
      // Never log the error object: it carries the request, password included.
      const status = err.response?.status;
      fail(err.response?.data?.message
        || (status === 429 ? 'Too many attempts. Please wait a few minutes.' : 'Cannot reach the server. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const capsCheck = (e) => setCapsLock(Boolean(e.getModifierState && e.getModifierState('CapsLock')));

  return (
    <AuthLayout variant="login">
      <div className="auth-heading">
        <span className="auth-eyebrow">Welcome back</span>
        <h2>Sign in to your workspace</h2>
        <p>Pick up right where your team left off.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        {error && (
          <div key={errorKey} className="auth-alert" role="alert">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <Field id="email" label="Email address" type="email" icon={FieldIcons.mail} autoComplete="username"
          value={formData.email} onChange={handleChange} autoFocus />

        <Field id="password" label="Password" type={showPassword ? 'text' : 'password'} icon={FieldIcons.lock}
          autoComplete="current-password" value={formData.password} onChange={handleChange}
          onKeyUp={capsCheck} describedBy={capsLock ? 'caps-hint' : undefined}>
          <RevealButton shown={showPassword} onToggle={() => setShowPassword(s => !s)} />
        </Field>
        {capsLock && <p id="caps-hint" className="auth-hint warn">Caps Lock is on</p>}

        <button type="submit" className={`auth-btn ${busy ? 'is-busy' : ''}`} disabled={busy}>
          {busy ? <><Spinner /> Signing in…</> : <>Sign In <span className="auth-btn-arrow" aria-hidden="true">→</span></>}
        </button>
      </form>

      <p className="auth-switch">
        New to StitchPro?
        <button type="button" onClick={() => navigate('/signup')} className="link-btn">Create an account</button>
      </p>
      <p className="auth-fineprint">Forgot your password? Ask an administrator to reset it in User Management.</p>
    </AuthLayout>
  );
};

export default Login;
