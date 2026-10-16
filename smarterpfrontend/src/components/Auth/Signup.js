import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';
import { landingPath } from '../../config/menuConfig';
import AuthLayout, { Field, FieldIcons, RevealButton, Spinner } from './AuthLayout';

// Guidance only: the server enforces the 8-character minimum.
const RULES = [
  ['length', 'At least 8 characters', p => p.length >= 8],
  ['case', 'Upper and lower case letters', p => /[a-z]/.test(p) && /[A-Z]/.test(p)],
  ['digit', 'A number', p => /\d/.test(p)],
  ['symbol', 'A symbol', p => /[^A-Za-z0-9]/.test(p)]
];
const STRENGTH = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

const Signup = ({ onSignup }) => {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const passed = useMemo(() => RULES.map(([key, , test]) => [key, test(formData.password)]), [formData.password]);
  const score = formData.password.length < 8 ? 0 : passed.filter(([, ok]) => ok).length;
  const mismatch = formData.confirmPassword.length > 0 && formData.confirmPassword !== formData.password;
  const matches = formData.confirmPassword.length > 0 && !mismatch;

  const fail = (message) => {
    setError(message);
    setErrorKey(k => k + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) return fail('Please fill in all fields.');
    if (formData.password.length < 8) return fail('Password must be at least 8 characters.');
    if (mismatch) return fail('The passwords do not match.');

    setBusy(true);
    try {
      // Only what the server uses. There is no role field: the server decides
      // the role (the first account becomes Admin, later ones Employee), and
      // an admin changes it in User Management.
      const { name, email, password } = formData;
      const response = await authAPI.signup({ name, email, password });
      if (response.data.success) {
        localStorage.setItem('currentUser', JSON.stringify(response.data.user));
        localStorage.setItem('token', response.data.token);
        onSignup(response.data.user);
        navigate(landingPath(response.data.user) || '/dashboard');
        return;
      }
      fail('Sign-up failed. Please try again.');
    } catch (err) {
      // Never log the error object: it carries the request, password included.
      const status = err.response?.status;
      fail(err.response?.data?.message
        || (status === 429 ? 'Too many sign-ups from this network. Please try again later.' : 'Cannot reach the server. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout variant="signup">
      <div className="auth-heading">
        <span className="auth-eyebrow">Get started</span>
        <h2>Create Account</h2>
        <p>New accounts start with no access until an administrator grants it.</p>
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

        <Field id="name" label="Full name" icon={FieldIcons.user} autoComplete="name"
          value={formData.name} onChange={handleChange} autoFocus />
        <Field id="email" label="Work email" type="email" icon={FieldIcons.mail} autoComplete="email"
          value={formData.email} onChange={handleChange} />

        <Field id="password" label="Password" type={showPassword ? 'text' : 'password'} icon={FieldIcons.lock}
          autoComplete="new-password" value={formData.password} onChange={handleChange} describedBy="pw-strength">
          <RevealButton shown={showPassword} onToggle={() => setShowPassword(s => !s)} />
        </Field>

        <div id="pw-strength" className={`auth-strength level-${formData.password ? score : 'none'}`} aria-live="polite">
          <div className="auth-strength-bars" aria-hidden="true">
            {[1, 2, 3, 4].map(n => <span key={n} className={score >= n ? 'on' : ''} />)}
          </div>
          <span className="auth-strength-label">
            {formData.password ? `Password strength: ${STRENGTH[score]}` : 'Use 8 or more characters'}
          </span>
        </div>
        {formData.password && (
          <ul className="auth-rules">
            {RULES.map(([key, text], i) => (
              <li key={key} className={passed[i][1] ? 'ok' : ''}>
                <span aria-hidden="true">{passed[i][1] ? '✓' : '•'}</span>{text}
                <span className="sr-only">{passed[i][1] ? ' (met)' : ' (not met)'}</span>
              </li>
            ))}
          </ul>
        )}

        <Field id="confirmPassword" label="Confirm password" type={showPassword ? 'text' : 'password'} icon={FieldIcons.lock}
          autoComplete="new-password" value={formData.confirmPassword} onChange={handleChange}
          invalid={mismatch} describedBy="pw-match">
          {matches && <span className="auth-field-ok" aria-hidden="true">✓</span>}
        </Field>
        <p id="pw-match" className={`auth-hint ${mismatch ? 'error' : matches ? 'ok' : ''}`} aria-live="polite">
          {mismatch ? 'Passwords do not match' : matches ? 'Passwords match' : ''}
        </p>

        <button type="submit" className={`auth-btn ${busy ? 'is-busy' : ''}`} disabled={busy}>
          {busy ? <><Spinner /> Creating account…</> : <>Create Account <span className="auth-btn-arrow" aria-hidden="true">→</span></>}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?
        <button type="button" onClick={() => navigate('/')} className="link-btn">Sign in</button>
      </p>
    </AuthLayout>
  );
};

export default Signup;
