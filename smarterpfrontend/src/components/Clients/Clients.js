import React, { useState, useEffect, useCallback } from 'react';
import { clientsAPI, accountingAPI } from '../../services/api';
import { formatMoney, formatNumber, todayIST, errorMessage, downloadCsv } from '../../utils/format';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import './Clients.css';

const CUSTOMER_TYPES = [
  ['manufacturing-unit', 'Manufacturing unit'],
  ['wholesale', 'Wholesale'],
  ['retail', 'Retail'],
  ['designer', 'Designer'],
  ['other', 'Other']
];
const TYPE_LABELS = Object.fromEntries([...CUSTOMER_TYPES, ['supplier', 'Supplier']]);
const typeLabel = (t) => TYPE_LABELS[t] || t || '—';

// Only a sanity check so typos are caught before the round trip; the server
// remains the authority on what it accepts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GSTIN: 2-digit state, 10-char PAN, entity, 'Z', check character. The server
// verifies the check digit and the state code.
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const EMPTY_TAX = { gstin: '', stateCode: '', address: '', city: '', pincode: '', paymentTermsDays: '' };
const TAX_FIELDS = ['gstin', 'stateCode', 'address', 'city', 'pincode'];

const errorText = (e) => (typeof e === 'string' ? e : e?.message || e?.msg || JSON.stringify(e));

const Clients = () => {
  const [activeTab, setActiveTab] = useState('customers');

  const [stats, setStats] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  // GST state list; null until loaded, false when not available (no accounting access).
  const [gstStates, setGstStates] = useState(null);

  const [form, setForm] = useState(null);   // { id?, name, type, email, phone, gstin, stateCode, … }
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const isSuppliers = activeTab === 'suppliers';

  // The server filters by tab ('customer' = everything except suppliers), status and search.
  const list = usePagedList(params => clientsAPI.getAll(params), {
    pageSize: 50,
    filters: { type: isSuppliers ? 'supplier' : 'customer', status: statusFilter }
  });
  const rows = list.rows;
  const loading = list.loading;
  const loadError = list.error || null;
  const search = list.query;

  const loadStats = useCallback(async () => {
    try {
      const statsRes = await clientsAPI.getStats();
      setStats(statsRes.data || null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const { reload } = list;
  const load = useCallback(() => Promise.all([reload(), loadStats()]), [reload, loadStats]);

  // State list for the place-of-supply picker. Users without accounting access
  // get a 403; they type the two-digit code instead.
  useEffect(() => {
    let live = true;
    accountingAPI.gstReference()
      .then(res => { if (live) setGstStates(res.data?.data?.states || false); })
      .catch(() => { if (live) setGstStates(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (notice?.type !== 'success') return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Already filtered on the server; this is the current page.
  const visible = rows;

  const switchTab = (tab) => {
    setActiveTab(tab);
    setForm(null);
    setFormErrors([]);
  };

  const openCreate = () => {
    setFormErrors([]);
    setForm({ id: null, name: '', type: isSuppliers ? 'supplier' : 'manufacturing-unit', email: '', phone: '', ...EMPTY_TAX });
  };

  const openEdit = (row) => {
    setFormErrors([]);
    setForm({
      id: row.id, name: row.name || '', type: row.type || 'other', email: row.email || '', phone: row.phone || '',
      gstin: row.gstin || '', stateCode: row.stateCode || '', address: row.address || '', city: row.city || '',
      pincode: row.pincode || '', paymentTermsDays: row.paymentTermsDays ?? ''
    });
  };

  const closeForm = () => {
    setForm(null);
    setFormErrors([]);
  };

  const setField = (name, value) => setForm(f => ({ ...f, [name]: value }));

  // The state comes from the GSTIN's first two digits once one is entered.
  const setGstin = (value) => setForm(f => {
    const gstin = value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
    return { ...f, gstin, stateCode: /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : f.stateCode };
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errors = [];
    if (!form.name.trim()) errors.push('Name is required.');
    if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.push('Enter a valid email address.');
    if (form.gstin && !GSTIN_RE.test(form.gstin)) errors.push('GSTIN must be 15 characters, e.g. 27AAPFU0939F1ZV.');
    if (form.stateCode.trim() && !/^\d{2}$/.test(form.stateCode.trim())) errors.push('State code must be two digits.');
    if (form.pincode.trim() && !/^\d{6}$/.test(form.pincode.trim())) errors.push('PIN code must be 6 digits.');
    const terms = String(form.paymentTermsDays).trim();
    if (terms && (!/^\d+$/.test(terms) || Number(terms) > 365)) errors.push('Payment terms must be 0–365 days.');
    setFormErrors(errors);
    if (errors.length) return;

    const body = {
      name: form.name.trim(),
      // The Suppliers tab only ever creates suppliers.
      type: isSuppliers ? 'supplier' : form.type,
      email: form.email.trim(),
      phone: form.phone.trim(),
      gstin: form.gstin.trim(),
      stateCode: form.stateCode.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      pincode: form.pincode.trim(),
      paymentTermsDays: terms === '' ? '' : Number(terms)
    };
    // On create, leave out blanks; on edit, send null so a cleared field is cleared.
    ['email', 'phone', ...TAX_FIELDS, 'paymentTermsDays'].forEach(k => {
      if (body[k] === '' || body[k] === undefined) {
        if (form.id) body[k] = null;
        else delete body[k];
      }
    });

    setSaving(true);
    try {
      if (form.id) await clientsAPI.update(form.id, body);
      else await clientsAPI.create(body);
      setNotice({ type: 'success', text: `${body.name} ${form.id ? 'updated' : 'added'}.` });
      closeForm();
      await load();
    } catch (err) {
      const serverErrors = err?.response?.data?.errors;
      setFormErrors([
        errorMessage(err, 'Could not save'),
        ...(Array.isArray(serverErrors) ? serverErrors.map(errorText) : [])
      ]);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row) => {
    const next = row.status === 'active' ? 'inactive' : 'active';
    setBusyId(row.id);
    try {
      await clientsAPI.update(row.id, { status: next });
      setNotice({ type: 'success', text: `${row.name} is now ${next}.` });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: `${row.name}: ${errorMessage(err, 'Could not change status')}` });
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const cols = [['name', 'Name'], [r => typeLabel(r.type), 'Type'], ['gstin', 'GSTIN'], ['stateCode', 'State code'],
      ['city', 'City'], ['pincode', 'PIN code'], ['paymentTermsDays', 'Payment terms (days)'],
      ['email', 'Email'], ['phone', 'Phone'], ['status', 'Status']];
    if (!isSuppliers) cols.push(['orderCount', 'Orders'], ['orderValue', 'Order value (INR)']);
    downloadCsv(`${isSuppliers ? 'suppliers' : 'customers'}-${todayIST()}.csv`, visible, cols);
  };

  const noun = isSuppliers ? 'Supplier' : 'Client';

  const renderForm = () => (
    <form className="clients-form" onSubmit={handleSubmit} noValidate>
      <h3>{form.id ? `Edit ${noun.toLowerCase()}` : `Add ${noun.toLowerCase()}`}</h3>
      <div className="clients-form-grid">
        <div className="clients-field">
          <label htmlFor="client-name">Name *</label>
          <input id="client-name" type="text" value={form.name} onChange={e => setField('name', e.target.value)} autoFocus />
        </div>
        <div className="clients-field">
          <label htmlFor="client-type">Type</label>
          {isSuppliers ? (
            <input id="client-type" type="text" value="Supplier" readOnly />
          ) : (
            <select id="client-type" value={form.type} onChange={e => setField('type', e.target.value)}>
              {CUSTOMER_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
        </div>
        <div className="clients-field">
          <label htmlFor="client-email">Email</label>
          <input id="client-email" type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
        </div>
        <div className="clients-field">
          <label htmlFor="client-phone">Phone</label>
          <input id="client-phone" type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)} />
        </div>
      </div>
      <h4 className="clients-form-subhead">GST and billing</h4>
      <div className="clients-form-grid">
        <div className="clients-field">
          <label htmlFor="client-gstin">GSTIN</label>
          <input id="client-gstin" type="text" value={form.gstin} maxLength={15} autoComplete="off"
            onChange={e => setGstin(e.target.value)} placeholder="15 characters, e.g. 27AAPFU0939F1ZV"
            aria-describedby="client-gstin-help" />
          <small id="client-gstin-help" className="clients-help">
            Leave blank for unregistered parties. The state is taken from the first two digits.
          </small>
        </div>
        <div className="clients-field">
          <label htmlFor="client-state">State (GST code)</label>
          {gstStates ? (
            <select id="client-state" value={form.stateCode} disabled={/^\d{2}/.test(form.gstin)}
              onChange={e => setField('stateCode', e.target.value)}>
              <option value="">Not set</option>
              {form.stateCode && !gstStates.some(st => st.code === form.stateCode) && (
                <option value={form.stateCode}>{form.stateCode}</option>
              )}
              {gstStates.map(st => <option key={st.code} value={st.code}>{st.code} — {st.name}</option>)}
            </select>
          ) : (
            <input id="client-state" type="text" inputMode="numeric" maxLength={2} value={form.stateCode}
              disabled={/^\d{2}/.test(form.gstin)} placeholder="2 digits, e.g. 27"
              onChange={e => setField('stateCode', e.target.value.replace(/\D/g, ''))} />
          )}
        </div>
        <div className="clients-field clients-field-wide">
          <label htmlFor="client-address">Address</label>
          <input id="client-address" type="text" value={form.address} maxLength={300}
            onChange={e => setField('address', e.target.value)} />
        </div>
        <div className="clients-field">
          <label htmlFor="client-city">City</label>
          <input id="client-city" type="text" value={form.city} maxLength={100}
            onChange={e => setField('city', e.target.value)} />
        </div>
        <div className="clients-field">
          <label htmlFor="client-pincode">PIN code</label>
          <input id="client-pincode" type="text" inputMode="numeric" maxLength={6} value={form.pincode}
            onChange={e => setField('pincode', e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="clients-field">
          <label htmlFor="client-terms">Payment terms (days)</label>
          <input id="client-terms" type="number" min="0" max="365" step="1" value={form.paymentTermsDays}
            onChange={e => setField('paymentTermsDays', e.target.value)} placeholder="e.g. 30" />
        </div>
      </div>
      {formErrors.length > 0 && (
        <div className="clients-notice error" role="alert">
          <ul>{formErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      <div className="clients-form-actions">
        <button type="submit" className="add-btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" className="clients-btn-secondary" onClick={closeForm} disabled={saving}>Cancel</button>
      </div>
    </form>
  );

  const renderTable = () => {
    if (loading && !rows.length) return <div className="clients-state">Loading…</div>;
    if (loadError) {
      return (
        <div className="clients-state error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="clients-btn-secondary" onClick={() => load()}>Retry</button>
        </div>
      );
    }
    if (!visible.length) {
      return (
        <div className="clients-state">
          {search.trim() || statusFilter ? 'No matches for your search or filter.' : `No ${isSuppliers ? 'suppliers' : 'customers'} yet. Use “+ Add ${noun}” to add one.`}
        </div>
      );
    }
    return (
      <div className="clients-table-wrap">
        <table className={isSuppliers ? 'vendors-table' : 'clients-table'}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              {!isSuppliers && <th scope="col">Type</th>}
              <th scope="col">GSTIN</th>
              <th scope="col">Email</th>
              <th scope="col">Phone</th>
              {!isSuppliers && <th scope="col" className="num">Orders</th>}
              {!isSuppliers && <th scope="col" className="num">Order value</th>}
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                {!isSuppliers && <td>{typeLabel(r.type)}</td>}
                <td className="clients-gstin">{r.gstin || <span className="clients-muted">Unregistered</span>}</td>
                <td>{r.email || '—'}</td>
                <td>{r.phone || '—'}</td>
                {!isSuppliers && <td className="num">{formatNumber(r.orderCount ?? 0, { decimals: 0 })}</td>}
                {!isSuppliers && <td className="num">{formatMoney(r.orderValue ?? 0)}</td>}
                <td>
                  <span className={`client-status ${r.status === 'active' ? 'active' : 'inactive'}`}>
                    {r.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="clients-row-actions">
                    <button type="button" className="clients-btn-small" onClick={() => openEdit(r)} disabled={busyId === r.id}>
                      Edit
                    </button>
                    <button type="button" className="clients-btn-small" onClick={() => toggleStatus(r)} disabled={busyId === r.id}>
                      {r.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination pagination={list.pagination} onPage={list.setPage} disabled={loading}
          label={isSuppliers ? 'suppliers' : 'customers'} />
      </div>
    );
  };

  return (
    <div className="clients">
      <h1>Clients & Vendors</h1>

      <div className="clients-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
          onClick={() => switchTab('customers')}
        >
          Customers
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
          onClick={() => switchTab('suppliers')}
        >
          Suppliers
        </button>
      </div>

      {notice && (
        <div className={`clients-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" className="clients-notice-close" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      )}

      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><h3>Customers</h3><div className="stat-value">{formatNumber(stats.customers ?? 0, { decimals: 0 })}</div></div>
          <div className="stat-card"><h3>Suppliers</h3><div className="stat-value">{formatNumber(stats.suppliers ?? 0, { decimals: 0 })}</div></div>
          <div className="stat-card"><h3>Active</h3><div className="stat-value">{formatNumber(stats.active ?? 0, { decimals: 0 })}</div></div>
          <div className="stat-card"><h3>Inactive</h3><div className="stat-value">{formatNumber(stats.inactive ?? 0, { decimals: 0 })}</div></div>
        </div>
      )}

      <div className={isSuppliers ? 'vendors-section' : 'clients-section'}>
        <div className="section-header">
          <h2>{isSuppliers ? 'Supplier List' : 'Customer List'}</h2>
          <div className="clients-toolbar">
            <SearchBox value={list.query} onChange={list.setQuery}
              placeholder="Search name, email, phone, GSTIN…" label={`Search ${isSuppliers ? 'suppliers' : 'customers'}`} />
            <label htmlFor="clients-status-filter" className="clients-sr-only">Filter by status</label>
            <select id="clients-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="button" className="clients-btn-secondary" onClick={exportCsv} disabled={!visible.length}>
              Export CSV
            </button>
            {!form && <button type="button" className="add-btn" onClick={openCreate}>+ Add {noun}</button>}
          </div>
        </div>
        {form && renderForm()}
        {renderTable()}
      </div>
    </div>
  );
};

export default Clients;
