import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { financeAPI } from '../../services/api';
import {
  formatMoney, formatNumber, formatDate, errorMessage, downloadCsv, todayIST
} from '../../utils/format';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import './Expenses.css';

const pad = (n) => String(n).padStart(2, '0');
// Last calendar day of a month; Date.UTC with day 0 rolls back to the end of
// the previous month, and UTC avoids any local time-zone shift.
const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const PERIODS = [
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['this-year', 'This year'],
  ['all', 'All time'],
  ['custom', 'Custom range']
];

/**
 * The { from, to } range (YYYY-MM-DD) for a period, based on today in IST —
 * the browser's own clock could be on a different day around midnight.
 * Ranges cover whole months/years so future-dated entries in the period show.
 */
const periodRange = (period, custom) => {
  const [y, m] = todayIST().split('-').map(Number);
  switch (period) {
    case 'this-month':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    case 'last-month': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
    }
    case 'this-year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'custom': {
      const r = {};
      if (custom.from) r.from = custom.from;
      if (custom.to) r.to = custom.to;
      return r;
    }
    default:
      return {};
  }
};

const TYPE_LABELS = { income: 'Income', expense: 'Expense' };
const METHOD_LABELS = { bank: 'Bank', cash: 'Cash' };

// Lines posted by other modules are changed where they were made.
const SYSTEM_SOURCE = {
  payment: 'a customer receipt or supplier payment. Change it in Sales Invoices or Purchases (void the payment).',
  payroll: 'payroll. Change it in Payroll.'
};
const systemTooltip = (t) =>
  `Created automatically from ${SYSTEM_SOURCE[t.sourceType] || `${t.sourceType || 'another module'}. Change it there.`}`;

const emptyForm = () => ({
  type: 'expense', amount: '', date: todayIST(), category: '', description: '', method: 'bank', accountCode: ''
});

const Expenses = () => {
  const [period, setPeriod] = useState('this-month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [activeTab, setActiveTab] = useState('transactions');

  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Income and expense accounts; [] when they could not be loaded (the server then uses its defaults).
  const [accounts, setAccounts] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

  const [typeFilter, setTypeFilter] = useState('');

  // Form: null (closed), or { id } where id is null for a new transaction.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => periodRange(period, custom), [period, custom]);
  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);

  // The transaction list is paged on the server, with search and type filter there too.
  // (A from-after-to range simply matches nothing; the page explains why.)
  const list = usePagedList(params => financeAPI.getTransactions(params), {
    pageSize: 50,
    filters: { ...range, type: typeFilter }
  });
  const transactions = list.rows;
  const search = list.query;

  useEffect(() => {
    let live = true;
    financeAPI.getAccounts()
      .then(res => { if (live) setAccounts(res.data?.data || []); })
      .catch(() => { if (live) setAccounts([]); });
    return () => { live = false; };
  }, []);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 5000);
  };

  // The summary and breakdown use the same range as the list so the cards,
  // table and breakdown always describe the same period.
  const loadSummary = useCallback(async () => {
    if (rangeInvalid) return;
    setLoading(true);
    setLoadError(null);
    const params = Object.keys(range).length ? range : undefined;
    try {
      const [sumRes, catRes] = await Promise.all([
        financeAPI.getSummary(params),
        financeAPI.getCategories(params)
      ]);
      setSummary(sumRes.data || null);
      setCategories(catRes.data.data || []);
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load finance data'));
    } finally {
      setLoading(false);
    }
  }, [range, rangeInvalid]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const { reload } = list;
  const load = useCallback(() => Promise.all([reload(), loadSummary()]), [reload, loadSummary]);

  // Search and type filter run on the server; this is the current page.
  const visible = transactions;

  const categorySuggestions = useMemo(() => {
    const set = new Set([...categories.map(c => c.category), ...transactions.map(t => t.category)].filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categories, transactions]);

  // ---- Form ------------------------------------------------------------

  const openAdd = () => {
    setForm(emptyForm());
    setFormError(null);
    setEditing({ id: null });
  };

  const openEdit = (t) => {
    setForm({
      type: t.type,
      amount: t.amount ?? '',
      date: t.date || todayIST(),
      category: t.category || '',
      description: t.description || '',
      method: t.method || 'bank',
      accountCode: t.accountCode || ''
    });
    setFormError(null);
    setEditing({ id: t.id });
  };

  const closeForm = () => {
    setEditing(null);
    setFormError(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // An income account cannot hold an expense (and vice versa): reset it with the type.
    setForm(f => ({ ...f, [name]: value, ...(name === 'type' && value !== f.type ? { accountCode: '' } : {}) }));
  };

  const accountChoices = accounts.filter(a => a.type === form.type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    const amount = Number(form.amount);
    if (form.amount === '' || Number.isNaN(amount) || amount <= 0) {
      setFormError('Amount must be more than zero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setFormError('Enter a valid date.');
      return;
    }

    const body = {
      type: form.type,
      amount,
      date: form.date,
      category: form.category.trim() || undefined,
      description: form.description.trim() || undefined,
      method: form.method,
      // Blank: the server posts to Other Income (4100) or General Expenses (5200).
      accountCode: form.accountCode || undefined
    };

    setSaving(true);
    try {
      if (editing.id) {
        await financeAPI.updateTransaction(editing.id, body);
      } else {
        await financeAPI.createTransaction(body);
      }
      // A transaction dated outside the selected period is saved but would
      // silently vanish from the list; say so instead.
      const outside = (range.from && body.date < range.from) || (range.to && body.date > range.to);
      flash('success', `${editing.id ? 'Updated' : 'Added'} ${TYPE_LABELS[body.type].toLowerCase()} of ${formatMoney(amount)}`
        + (outside ? ` dated ${formatDate(body.date)} — outside the selected period, so it is not listed.` : ''));
      closeForm();
      await load();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the transaction'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    const what = `${TYPE_LABELS[t.type] || 'Transaction'} of ${formatMoney(t.amount)} on ${formatDate(t.date)}`;
    if (!window.confirm(`Delete this ${what.toLowerCase()}?\n\nIts ledger entry will be reversed (a reversing journal entry is posted today), so the accounts stay balanced.`)) return;
    setDeletingId(t.id);
    try {
      await financeAPI.deleteTransaction(t.id);
      flash('success', `Deleted ${what}; its ledger entry was reversed.`);
      if (editing?.id === t.id) closeForm();
      await load();
    } catch (err) {
      flash('error', errorMessage(err, 'Could not delete the transaction'));
    } finally {
      setDeletingId(null);
    }
  };

  // ---- CSV -------------------------------------------------------------

  const exportTransactions = () => {
    const suffix = range.from || range.to ? `${range.from || 'start'}_to_${range.to || 'today'}` : 'all-time';
    downloadCsv(`transactions-${suffix}.csv`, visible, [
      ['date', 'Date'], [r => TYPE_LABELS[r.type] || r.type, 'Type'], ['category', 'Category'],
      ['description', 'Description'], [r => METHOD_LABELS[r.method] || r.method || '', 'Method'],
      [r => (r.accountCode ? `${r.accountCode} ${r.accountName || ''}`.trim() : ''), 'Account'],
      ['amount', 'Amount (INR)'], [r => (r.editable === false ? `System (${r.sourceType || ''})` : 'Manual'), 'Source']
    ]);
  };

  // ---- Render ----------------------------------------------------------

  const net = Number(summary?.netProfit ?? 0);

  const renderForm = () => (
    <section className="fin-form-section" aria-labelledby="fin-form-title">
      <h2 id="fin-form-title">{editing.id ? 'Edit transaction' : 'Add transaction'}</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div className="fin-form-grid">
          <div className="fin-field">
            <label htmlFor="fin-type">Type *</label>
            <select id="fin-type" name="type" value={form.type} onChange={handleChange}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="fin-field">
            <label htmlFor="fin-amount">Amount (₹) *</label>
            <input id="fin-amount" name="amount" type="number" min="0.01" step="0.01" required
              value={form.amount} onChange={handleChange} placeholder="0.00" />
          </div>
          <div className="fin-field">
            <label htmlFor="fin-date">Date *</label>
            <input id="fin-date" name="date" type="date" required value={form.date} onChange={handleChange} />
          </div>
          <div className="fin-field">
            <label htmlFor="fin-category">Category</label>
            <input id="fin-category" name="category" type="text" list="fin-category-list"
              value={form.category} onChange={handleChange} placeholder="e.g. Raw Materials, Utilities, Sales" />
            <datalist id="fin-category-list">
              {categorySuggestions.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="fin-field">
            <label htmlFor="fin-method">Paid / received by</label>
            <select id="fin-method" name="method" value={form.method} onChange={handleChange}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div className="fin-field">
            <label htmlFor="fin-account">{form.type === 'income' ? 'Income account' : 'Expense account'}</label>
            <select id="fin-account" name="accountCode" value={form.accountCode} onChange={handleChange}
              aria-describedby="fin-account-help">
              <option value="">{form.type === 'income' ? 'Default — 4100 Other Income' : 'Default — 5200 General Expenses'}</option>
              {form.accountCode && !accountChoices.some(a => a.code === form.accountCode) && (
                <option value={form.accountCode}>{form.accountCode}</option>
              )}
              {accountChoices.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
            <small id="fin-account-help" className="fin-help">The ledger account this line is posted to.</small>
          </div>
          <div className="fin-field fin-field-wide">
            <label htmlFor="fin-description">Description</label>
            <input id="fin-description" name="description" type="text" value={form.description}
              onChange={handleChange} placeholder="e.g. Electricity bill — September" />
          </div>
        </div>

        {formError && <div className="fin-notice error" role="alert">{formError}</div>}

        <div className="fin-form-actions">
          <button type="submit" className="add-btn" disabled={saving}>
            {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add transaction'}
          </button>
          <button type="button" className="fin-secondary-btn" onClick={closeForm} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );

  const renderTransactions = () => (
    <div className="transactions-section">
      <div className="section-header">
        <h2>Transactions</h2>
        <div className="fin-toolbar">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Search description or category"
            label="Search transactions" />
          <label htmlFor="fin-type-filter" className="fin-sr-only">Filter by type</label>
          <select id="fin-type-filter" className="fin-input" value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Income and expenses</option>
            <option value="income">Income only</option>
            <option value="expense">Expenses only</option>
          </select>
          <button type="button" className="fin-secondary-btn" onClick={exportTransactions} disabled={visible.length === 0}
            title="Exports the rows on this page">
            Export CSV
          </button>
        </div>
      </div>

      {list.error ? (
        <div className="fin-notice error" role="alert">
          {list.error}{' '}
          <button type="button" className="fin-link-btn" onClick={list.reload}>Retry</button>
        </div>
      ) : list.loading && transactions.length === 0 ? (
        <p className="fin-state" role="status">Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <p className="fin-state">
          {search.trim() || typeFilter
            ? 'No transactions match your search or filter.'
            : 'No transactions in this period. Use “+ Add Transaction” to record one.'}
        </p>
      ) : (
        <div className="fin-table-wrap">
          <table className="transactions-table">
            <thead>
              <tr>
                <th scope="col">Date</th><th scope="col">Type</th><th scope="col">Category</th>
                <th scope="col">Description</th><th scope="col">Account</th><th scope="col">Method</th>
                <th scope="col" className="fin-num">Amount</th><th scope="col"><span className="fin-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(t => (
                <tr key={t.id}>
                  <td>{formatDate(t.date)}</td>
                  <td><span className={`type-badge ${t.type === 'income' ? 'income' : 'expense'}`}>{TYPE_LABELS[t.type] || t.type}</span></td>
                  <td>{t.category || '—'}</td>
                  <td>{t.description || '—'}</td>
                  <td>{t.accountCode ? `${t.accountCode} ${t.accountName || ''}` : '—'}</td>
                  <td>{METHOD_LABELS[t.method] || t.method || '—'}</td>
                  {/* Sign plus the type badge carry the meaning; colour is only a cue. */}
                  <td className={`fin-num ${t.type === 'income' ? 'income' : 'expense'}`}>
                    {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount)}
                  </td>
                  <td className="fin-row-actions">
                    {t.editable === false ? (
                      <span className="fin-system-badge" title={systemTooltip(t)} tabIndex={0}
                        aria-label={`System entry. ${systemTooltip(t)}`}>
                        System
                      </span>
                    ) : (
                      <>
                        <button type="button" className="fin-link-btn" onClick={() => openEdit(t)}
                          disabled={saving || deletingId === t.id} aria-label={`Edit ${TYPE_LABELS[t.type] || ''} of ${formatMoney(t.amount)} on ${formatDate(t.date)}`}>
                          Edit
                        </button>
                        <button type="button" className="fin-link-btn danger" onClick={() => handleDelete(t)}
                          disabled={saving || deletingId === t.id} aria-label={`Delete ${TYPE_LABELS[t.type] || ''} of ${formatMoney(t.amount)} on ${formatDate(t.date)}`}>
                          {deletingId === t.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="transactions" />
      <p className="fin-help">
        Lines marked “System” were posted by customer receipts, supplier payments or payroll and are changed there.
        Editing or deleting a manual line reverses its ledger entry and posts the correction.
      </p>
    </div>
  );

  const renderCategories = () => (
    <div className="transactions-section">
      <div className="section-header"><h2>Category breakdown</h2></div>
      {categories.length === 0 ? (
        <p className="fin-state">No transactions in this period.</p>
      ) : (
        <div className="fin-table-wrap">
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Category</th><th>Type</th><th className="fin-num">Total</th><th className="fin-num">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={`${c.type}-${c.category}`}>
                  <td>{c.category || 'Uncategorised'}</td>
                  <td><span className={`type-badge ${c.type === 'income' ? 'income' : 'expense'}`}>{TYPE_LABELS[c.type] || c.type}</span></td>
                  <td className={`fin-num ${c.type === 'income' ? 'income' : 'expense'}`}>{formatMoney(c.total)}</td>
                  <td className="fin-num">{formatNumber(c.count, { decimals: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="expenses">
      <div className="fin-title-row">
        <h1>Expenses &amp; Finance</h1>
        <button type="button" className="add-btn" onClick={openAdd} disabled={editing !== null}>
          + Add Transaction
        </button>
      </div>

      <div className="fin-period" role="group" aria-label="Period">
        <label htmlFor="fin-period">Period</label>
        <select id="fin-period" className="fin-input" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {period === 'custom' && (
          <>
            <label htmlFor="fin-from">From</label>
            <input id="fin-from" type="date" className="fin-input" value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => setCustom(c => ({ ...c, from: e.target.value }))} />
            <label htmlFor="fin-to">To</label>
            <input id="fin-to" type="date" className="fin-input" value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => setCustom(c => ({ ...c, to: e.target.value }))} />
          </>
        )}
        {loading && summary !== null && <span className="fin-range-hint" role="status">Refreshing…</span>}
        <span className="fin-range-hint">
          {range.from || range.to
            ? `${range.from ? formatDate(range.from) : 'Beginning'} – ${range.to ? formatDate(range.to) : 'today'}`
            : 'All dates'}
        </span>
      </div>

      {rangeInvalid && (
        <div className="fin-notice error" role="alert">The “from” date must be on or before the “to” date.</div>
      )}
      {notice && <div className={`fin-notice ${notice.type}`} role="status">{notice.text}</div>}

      {editing && renderForm()}

      {/* Only blank the page on the first load; later reloads (period change,
          save) keep the old figures visible until the new ones arrive. */}
      {loading && summary === null ? (
        <p className="fin-state" role="status">Loading finance data…</p>
      ) : loadError ? (
        <div className="fin-notice error" role="alert">
          {loadError}{' '}
          <button type="button" className="fin-link-btn" onClick={() => load()}>Retry</button>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card income">
              <h3>Income</h3>
              <div className="stat-value">{formatMoney(summary?.totalIncome ?? 0)}</div>
            </div>
            <div className="stat-card expense">
              <h3>Expenses</h3>
              <div className="stat-value">{formatMoney(summary?.totalExpenses ?? 0)}</div>
            </div>
            <div className={`stat-card ${net >= 0 ? 'profit' : 'loss'}`}>
              <h3>{net >= 0 ? 'Net profit' : 'Net loss'}</h3>
              <div className="stat-value">{formatMoney(net)}</div>
            </div>
            <div className="stat-card">
              <h3>Transactions</h3>
              <div className="stat-value">{formatNumber(summary?.transactionCount ?? 0, { decimals: 0 })}</div>
            </div>
          </div>

          <div className="finance-tabs" role="tablist" aria-label="Finance views">
            {[['transactions', 'Transactions'], ['categories', 'Category breakdown']].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={activeTab === key}
                className={`tab-btn ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'transactions' ? renderTransactions() : renderCategories()}
        </>
      )}
    </div>
  );
};

export default Expenses;
