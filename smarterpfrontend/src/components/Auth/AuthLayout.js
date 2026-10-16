import React from 'react';
import './Auth.css';

/**
 * Shared frame for the sign-in and sign-up screens: an animated brand panel
 * on the left, the form on the right. Purely presentational; the activity
 * cards are illustrative examples of what the system does, not live data.
 */
const ACTIVITY = [
  { tone: 'orange', icon: 'order', title: 'Order #1042 confirmed', meta: 'Retail client · 300 pcs' },
  { tone: 'navy', icon: 'stock', title: 'Stock reserved', meta: 'Cotton Tee · 300 of 300' },
  { tone: 'green', icon: 'invoice', title: 'GST invoice issued', meta: 'INV/26-27/00018 · ₹17,632' },
  { tone: 'navy', icon: 'payroll', title: 'Payroll approved', meta: 'October · from attendance' }
];

const FEATURES = [
  'Orders, stock and production in one flow',
  'GST invoicing with a double-entry ledger',
  'Purchasing, payroll and a full audit trail'
];

const Icon = ({ name }) => {
  const paths = {
    order: <path d="M4 7h16l-1.5 11a2 2 0 0 1-2 1.7h-9a2 2 0 0 1-2-1.7L4 7Zm4 0V5a4 4 0 0 1 8 0v2" />,
    stock: <path d="M3 8l9-5 9 5v8l-9 5-9-5V8Zm0 0l9 5 9-5M12 13v8" />,
    invoice: <path d="M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6" />,
    payroll: <path d="M3 7h18v10H3V7Zm9 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 10v4m12-4v4" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
  );
};

export const BrandMark = () => (
  <div className="auth-brand-mark">
    <span className="auth-logo" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="22" height="22">
        <path d="M6 22c4-1 6-4 7-8s4-7 9-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="24" cy="23" r="3" fill="#fff" />
      </svg>
    </span>
    <span className="auth-brand-name">StitchPro <strong>Optivise</strong></span>
  </div>
);

export default function AuthLayout({ children, variant = 'login' }) {
  return (
    <div className={`auth-shell auth-${variant}`}>
      <aside className="auth-brand" aria-hidden="true">
        <div className="auth-orb auth-orb-a" />
        <div className="auth-orb auth-orb-b" />
        <div className="auth-orb auth-orb-c" />
        <div className="auth-grid" />

        <div className="auth-brand-inner">
          <BrandMark />

          <div className="auth-pitch">
            <h1>Run the whole factory<br /><span>from one screen.</span></h1>
            <p>Garment ERP for Indian manufacturers — from the first order to the last rupee.</p>
          </div>

          <div className="auth-activity">
            {ACTIVITY.map((a, i) => (
              <div key={a.title} className={`auth-activity-card tone-${a.tone}`} style={{ '--i': i }}>
                <span className="auth-activity-icon"><Icon name={a.icon} /></span>
                <span className="auth-activity-text">
                  <strong>{a.title}</strong>
                  <small>{a.meta}</small>
                </span>
                <span className="auth-activity-dot" />
              </div>
            ))}
          </div>

          <ul className="auth-features">
            {FEATURES.map((f, i) => (
              <li key={f} style={{ '--i': i }}><Icon name="check" />{f}</li>
            ))}
          </ul>

          <p className="auth-brand-foot">Secured sign-in · Data held under the DPDP Act 2023</p>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand"><BrandMark /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** A labelled input with a leading icon and a floating label. */
export function Field({ id, label, icon, type = 'text', value, onChange, autoComplete, children, invalid, describedBy, onKeyUp, autoFocus, minLength }) {
  return (
    <div className={`auth-field ${value ? 'has-value' : ''} ${invalid ? 'is-invalid' : ''}`}>
      <span className="auth-field-icon" aria-hidden="true">{icon}</span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        onKeyUp={onKeyUp}
        autoComplete={autoComplete}
        placeholder=" "
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        minLength={minLength}
        required
      />
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

export const FieldIcons = {
  mail: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6 8.5-6" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20.5c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  )
};

/** Show / hide toggle for a password field. */
export function RevealButton({ shown, onToggle }) {
  return (
    <button type="button" className="auth-reveal" onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
      {shown ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7-0.4 1-1.3 2.4-2.6 3.7M6.1 6.1C4.3 7.4 2.9 9.3 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" /><circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export const Spinner = () => <span className="auth-spinner" aria-hidden="true" />;
