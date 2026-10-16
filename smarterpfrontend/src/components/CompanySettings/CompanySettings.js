import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { accountingAPI } from '../../services/api';
import { errorMessage } from '../../utils/format';
import './CompanySettings.css';

/**
 * Organisation settings (Admins): the seller details printed on GST invoices,
 * bank details, invoicing defaults and payroll statutory settings.
 *
 * Only the fields that changed are sent. The server validates everything,
 * including the GSTIN check digit, and derives the state from the GSTIN.
 */

const SECTIONS = [
  {
    id: 'company', title: 'Company', fields: [
      { key: 'companyName', label: 'Company name', max: 150, wide: true },
      { key: 'gstin', label: 'GSTIN', max: 15, upper: true, hint: '15 characters, e.g. 29ABCDE1234F1Z5. The state is taken from its first two digits.' },
      { key: 'addressLine1', label: 'Address line 1', max: 200, wide: true },
      { key: 'addressLine2', label: 'Address line 2', max: 200, wide: true },
      { key: 'city', label: 'City', max: 100 },
      { key: 'pincode', label: 'PIN code', max: 6, inputMode: 'numeric', hint: '6 digits' },
      { key: 'phone', label: 'Phone', max: 30, type: 'tel' },
      { key: 'email', label: 'Email', max: 150, type: 'email' },
      { key: 'website', label: 'Website', max: 150 }
    ]
  },
  {
    id: 'bank', title: 'Bank (printed on invoices)', fields: [
      { key: 'bankName', label: 'Bank name', max: 100 },
      { key: 'bankAccount', label: 'Account number', max: 20, inputMode: 'numeric', hint: '6–20 digits' },
      { key: 'bankIfsc', label: 'IFSC', max: 11, upper: true, hint: 'e.g. HDFC0001234' },
      { key: 'bankBranch', label: 'Branch', max: 100 }
    ]
  },
  {
    id: 'invoicing', title: 'Invoicing', fields: [
      { key: 'invoicePrefix', label: 'Invoice prefix', max: 4, upper: true, hint: '1–4 capital letters, e.g. INV' },
      { key: 'defaultGstRate', label: 'Default GST rate', type: 'gstRate', hint: 'Used when an item has no rate of its own' },
      { key: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number', min: 0, max: 365, step: 1 },
      { key: 'invoiceTerms', label: 'Terms printed on invoices', type: 'textarea', max: 2000, wide: true }
    ]
  },
  {
    id: 'payroll', title: 'Payroll statutory', fields: [
      { key: 'pfEnabled', label: 'Deduct Provident Fund (PF)', type: 'bool' },
      { key: 'pfRate', label: 'PF employee rate (%)', type: 'number', min: 0, max: 100, step: 0.01 },
      { key: 'pfWageCeiling', label: 'PF wage ceiling (₹ / month)', type: 'number', min: 0, step: 1 },
      { key: 'esiEnabled', label: 'Deduct ESI', type: 'bool' },
      { key: 'esiRate', label: 'ESI employee rate (%)', type: 'number', min: 0, max: 100, step: 0.01 },
      { key: 'esiWageLimit', label: 'ESI wage limit (₹ / month)', type: 'number', min: 0, step: 1 },
      { key: 'professionalTax', label: 'Professional tax (₹ / month)', type: 'number', min: 0, step: 1 }
    ]
  }
];
const FIELDS = SECTIONS.flatMap(s => s.fields);

const toForm = (settings) => Object.fromEntries(FIELDS.map(f => {
  const v = settings ? settings[f.key] : null;
  if (f.type === 'bool') return [f.key, Boolean(v)];
  return [f.key, v === null || v === undefined ? '' : String(v)];
}));

/** The value to send for a field, or undefined for "empty". */
const normalise = (f, raw) => {
  if (f.type === 'bool') return Boolean(raw);
  const s = String(raw ?? '').trim();
  if (s === '') return undefined;
  if (f.type === 'number' || f.type === 'gstRate') return Number(s);
  return f.upper ? s.toUpperCase() : s;
};

export default function CompanySettings() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [reference, setReference] = useState({ states: [], rates: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [s, ref] = await Promise.all([
        accountingAPI.getSettings(),
        accountingAPI.gstReference().catch(() => null)
      ]);
      const data = s.data?.data || {};
      setSaved(data);
      setForm(toForm(data));
      if (ref?.data?.data) setReference({ states: ref.data.data.states || [], rates: ref.data.data.rates || [] });
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load the settings'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const { changes, cleared } = useMemo(() => {
    const out = {};
    const emptied = [];
    if (!form || !saved) return { changes: out, cleared: emptied };
    for (const f of FIELDS) {
      const now = normalise(f, form[f.key]);
      const before = normalise(f, f.type === 'bool' ? saved[f.key] : (saved[f.key] ?? ''));
      if (now === before) continue;
      if (now === undefined) emptied.push(f.label);
      else out[f.key] = now;
    }
    return { changes: out, cleared: emptied };
  }, [form, saved]);
  const changedCount = Object.keys(changes).length;

  const gstinState = useMemo(() => {
    const g = (form?.gstin || '').trim().toUpperCase();
    if (g.length >= 2 && g !== (saved?.gstin || '')) {
      const st = reference.states.find(x => x.code === g.slice(0, 2));
      return st ? `${st.name} (${st.code}) — from the GSTIN entered, confirmed on save` : 'Unknown state code';
    }
    return saved?.stateName ? `${saved.stateName}${saved.stateCode ? ` (${saved.stateCode})` : ''}` : 'Not set';
  }, [form, saved, reference.states]);

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setNotice('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving || !changedCount) return;
    setSaving(true);
    setErrors(null);
    setNotice('');
    try {
      const res = await accountingAPI.updateSettings(changes);
      const data = res.data?.data || {};
      setSaved(data);
      setForm(toForm(data));
      setNotice(`Saved ${changedCount} change${changedCount === 1 ? '' : 's'}`);
    } catch (err) {
      const list = err?.response?.data?.errors;
      setErrors(Array.isArray(list) && list.length ? list : [errorMessage(err, 'Could not save the settings')]);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f) => {
    const id = `cs-${f.key}`;
    const hintId = f.hint ? `${id}-hint` : undefined;
    const value = form[f.key];
    let control;
    if (f.type === 'bool') {
      return (
        <div className="cs-field cs-check" key={f.key}>
          <input id={id} type="checkbox" checked={Boolean(value)} onChange={e => set(f.key, e.target.checked)} disabled={saving} />
          <label htmlFor={id}>{f.label}</label>
        </div>
      );
    }
    if (f.type === 'textarea') {
      control = <textarea id={id} rows={4} maxLength={f.max} value={value} onChange={e => set(f.key, e.target.value)} disabled={saving} aria-describedby={hintId} />;
    } else if (f.type === 'gstRate') {
      const rates = reference.rates.length ? reference.rates : (value !== '' ? [Number(value)] : []);
      control = (
        <select id={id} value={value} onChange={e => set(f.key, e.target.value)} disabled={saving} aria-describedby={hintId}>
          {value === '' && <option value="">Choose…</option>}
          {rates.map(r => <option key={r} value={String(r)}>{r}%</option>)}
        </select>
      );
    } else {
      control = (
        <input id={id} type={f.type === 'number' ? 'number' : (f.type || 'text')} value={value}
          maxLength={f.type === 'number' ? undefined : f.max} min={f.min} max={f.type === 'number' ? f.max : undefined} step={f.step}
          inputMode={f.inputMode} disabled={saving} aria-describedby={hintId}
          className={f.upper ? 'cs-upper' : undefined}
          onChange={e => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)} />
      );
    }
    return (
      <div className={`cs-field ${f.wide ? 'cs-wide' : ''}`} key={f.key}>
        <label htmlFor={id}>{f.label}</label>
        {control}
        {f.hint && <small id={hintId} className="cs-hint">{f.hint}</small>}
      </div>
    );
  };

  if (loading && !form) return <div className="cs"><div className="cs-state" role="status">Loading settings…</div></div>;
  if (loadError && !form) {
    return (
      <div className="cs">
        <div className="cs-state cs-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="cs-btn cs-btn-secondary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cs">
      <header className="cs-header">
        <h1>Company settings</h1>
        <p className="cs-subtitle">Seller details on GST invoices, bank details, invoicing defaults and payroll statutory settings. Admins only.</p>
      </header>

      {saved && !saved.readyToInvoice && (
        <div className="cs-banner" role="alert">
          <strong>Invoices cannot be issued until a valid GSTIN is saved.</strong>
          <span> Enter the company name and GSTIN below. The GSTIN format, state code and check digit are validated when you save.</span>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        {SECTIONS.map(section => (
          <fieldset className="cs-section" key={section.id}>
            <legend>{section.title}</legend>
            {section.id === 'payroll' && (
              <p className="cs-note" role="note">
                PF applies from 20 employees and ESI from 10 in most states; check current law and your state's professional-tax slab before enabling.
              </p>
            )}
            <div className="cs-grid">
              {section.fields.map(renderField)}
              {section.id === 'company' && (
                <div className="cs-field">
                  <label htmlFor="cs-stateName">State (from GSTIN)</label>
                  <input id="cs-stateName" type="text" value={gstinState} readOnly aria-readonly="true" className="cs-readonly" />
                </div>
              )}
            </div>
          </fieldset>
        ))}

        {cleared.length > 0 && (
          <p className="cs-hint" role="status">
            Emptied fields are not sent and keep their saved value: {cleared.join(', ')}.
          </p>
        )}
        {errors && (
          <div className="cs-notice error" role="alert">
            <strong>The settings were not saved.</strong>
            <ul>{errors.map(e => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        {notice && <div className="cs-notice success" role="status">{notice}</div>}

        <div className="cs-actions">
          <button type="submit" className="cs-btn cs-btn-primary" disabled={saving || !changedCount}>
            {saving ? 'Saving…' : changedCount ? `Save ${changedCount} change${changedCount === 1 ? '' : 's'}` : 'No changes'}
          </button>
          <button type="button" className="cs-btn cs-btn-secondary" disabled={saving || (!changedCount && !cleared.length)}
            onClick={() => { setForm(toForm(saved)); setErrors(null); }}>
            Discard changes
          </button>
        </div>
      </form>
    </div>
  );
}
