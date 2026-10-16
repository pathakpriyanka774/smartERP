import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { accountingAPI } from '../../services/api';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import { formatMoney, formatDate, formatNumber, todayIST, errorMessage, downloadCsv } from '../../utils/format';
import './Accounting.css';

/**
 * Accounting: the general ledger and its reports.
 *
 * Everything posted to the ledger is permanent. Document postings (invoices,
 * bills, stock, payroll) are corrected through their documents; a manual
 * entry is corrected by reversing it. Control accounts are moved only by
 * their documents, so they are not offered on the manual journal form.
 */

const TABS = [
  ['overview', 'Overview'],
  ['journal', 'Journal'],
  ['accounts', 'Chart of accounts'],
  ['trial', 'Trial balance'],
  ['pl', 'Profit & Loss'],
  ['bs', 'Balance sheet'],
  ['receivables', 'Receivables ageing'],
  ['payables', 'Payables ageing'],
  ['gst', 'GST summary'],
  ['payments', 'Supplier payments']
];

const SOURCE_TYPES = ['invoice', 'payment', 'bill', 'stock', 'payroll', 'payroll-payment', 'finance', 'manual', 'reversal', 'revaluation', 'opening-stock'];
const ACCOUNT_TYPES = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity'], ['income', 'Income'], ['expense', 'Expenses']];
const METHODS = [['bank', 'Bank transfer'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['cash', 'Cash'], ['card', 'Card']];
const BUCKETS = [['current', 'Current'], ['d1_30', '1–30 days'], ['d31_60', '31–60 days'], ['d61_90', '61–90 days'], ['d90_plus', '90+ days']];

const cents = (v) => Math.round((Number(v) || 0) * 100);
const serverErrors = (err, fallback) => {
  const list = err?.response?.data?.errors;
  return Array.isArray(list) && list.length ? list : [errorMessage(err, fallback)];
};
/** A debit-positive balance shown on its natural side: ₹1,000.00 Dr / ₹500.00 Cr. */
const drCr = (balance) => {
  const c = cents(balance);
  if (c === 0) return formatMoney(0);
  return `${formatMoney(Math.abs(c) / 100)} ${c > 0 ? 'Dr' : 'Cr'}`;
};

/** Load once per distinct set of params; ignores stale responses. */
function useReport(fetcher, params = {}) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const key = JSON.stringify(params);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const p = JSON.parse(key);
      Object.keys(p).forEach(k => (p[k] === '' || p[k] == null) && delete p[k]);
      const res = await fetcherRef.current(p);
      if (mine === seq.current) setState({ data: res.data?.data ?? null, loading: false, error: '' });
    } catch (err) {
      if (mine === seq.current) setState({ data: null, loading: false, error: errorMessage(err, 'Could not load this report') });
    }
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function LoadState({ loading, error, onRetry, what = 'report' }) {
  if (error) {
    return (
      <div className="acc-state acc-error" role="alert">
        <span>{error}</span>
        <button type="button" className="acc-btn acc-btn-secondary" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (loading) return <div className="acc-state" role="status">Loading {what}…</div>;
  return null;
}

function Modal({ title, onClose, children, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const first = ref.current?.querySelector('form input, form select, form textarea');
    if (first) first.focus();
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);
  return (
    <div className="acc-modal-backdrop">
      <div className="acc-modal" role="dialog" aria-modal="true" aria-labelledby="acc-modal-title" ref={ref}>
        <div className="acc-modal-head">
          <h2 id="acc-modal-title">{title}</h2>
          <button type="button" className="acc-icon-btn" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorList({ errors }) {
  if (!errors || !errors.length) return null;
  return (
    <div className="acc-notice error" role="alert">
      {errors.length === 1 ? errors[0] : <ul>{errors.map(e => <li key={e}>{e}</li>)}</ul>}
    </div>
  );
}

function Expander({ expanded, onToggle, label, controls }) {
  return (
    <button type="button" className="acc-expander" aria-expanded={expanded} aria-controls={controls}
      aria-label={`${expanded ? 'Hide' : 'Show'} ${label}`} onClick={onToggle}>
      {expanded ? '▾' : '▸'}
    </button>
  );
}

// ================================================================ Overview ===

function Overview() {
  const r = useReport(() => accountingAPI.summary());
  const d = r.data;
  const cards = d ? [
    ['Receivables', d.receivables, 'Unpaid customer invoices'],
    ['Overdue receivables', d.overdueReceivables, 'Past due date', cents(d.overdueReceivables) > 0],
    ['Payables', d.payables, 'Unpaid supplier bills'],
    ['Overdue payables', d.overduePayables, 'Past due date', cents(d.overduePayables) > 0],
    ['Cash & bank', d.cashAndBank, 'Accounts 1000 and 1010'],
    ['Inventory value', d.inventoryValue, 'Stock on hand at cost'],
    ['Goods received, not billed', d.goodsNotBilled, 'Awaiting supplier bills']
  ] : [];
  return (
    <section aria-labelledby="acc-overview-h">
      <h2 id="acc-overview-h" className="acc-section-title">Overview</h2>
      <LoadState loading={r.loading && !d} error={r.error} onRetry={r.reload} what="summary" />
      {d && (
        <div className="acc-kpis">
          {cards.map(([label, value, hint, warn]) => (
            <div className={`acc-kpi ${warn ? 'warn' : ''}`} key={label}>
              <span className="acc-kpi-label">{label}</span>
              <span className="acc-kpi-value">{formatMoney(value)}</span>
              <span className="acc-kpi-hint">{hint}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ================================================================= Journal ===

let lineKey = 0;
const blankLine = () => ({ key: ++lineKey, account: '', debit: '', credit: '', memo: '' });

function JournalForm({ accounts, onClose, onPosted }) {
  const [form, setForm] = useState({ entryDate: todayIST(), reference: '', narration: '', lines: [blankLine(), blankLine()] });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const postable = accounts.filter(a => !a.controlAccount);

  const setLine = (key, patch) => setForm(f => ({ ...f, lines: f.lines.map(l => (l.key === key ? { ...l, ...patch } : l)) }));
  const totals = form.lines.reduce((t, l) => ({ dr: t.dr + cents(l.debit), cr: t.cr + cents(l.credit) }), { dr: 0, cr: 0 });
  const linesValid = form.lines.every(l => l.account && ((cents(l.debit) > 0) !== (cents(l.credit) > 0))
    && cents(l.debit) >= 0 && cents(l.credit) >= 0);
  const balanced = totals.dr === totals.cr && totals.dr > 0;
  const canSubmit = !saving && form.lines.length >= 2 && linesValid && balanced && form.narration.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setErrors(null);
    try {
      await accountingAPI.postJournal({
        entryDate: form.entryDate || undefined,
        reference: form.reference.trim() || undefined,
        narration: form.narration.trim(),
        lines: form.lines.map(l => ({
          account: l.account,
          ...(cents(l.debit) > 0 ? { debit: Number(l.debit) } : { credit: Number(l.credit) }),
          ...(l.memo.trim() ? { memo: l.memo.trim() } : {})
        }))
      });
      onPosted();
    } catch (err) {
      setErrors(serverErrors(err, 'Could not post the journal entry'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New journal entry" onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate>
        <p className="acc-muted">
          Posted entries are permanent and cannot be edited or deleted. To correct a mistake, reverse the entry and post a new one.
          Control accounts (receivables, inventory, payables, goods received not billed) are moved only by their documents and are not listed.
        </p>
        <div className="acc-form-row">
          <label className="acc-field">
            <span>Date</span>
            <input type="date" value={form.entryDate} max={todayIST()} onChange={e => setForm({ ...form, entryDate: e.target.value })} />
          </label>
          <label className="acc-field">
            <span>Reference</span>
            <input type="text" maxLength={100} value={form.reference} placeholder="e.g. Accrual Sep-26" onChange={e => setForm({ ...form, reference: e.target.value })} />
          </label>
        </div>
        <label className="acc-field acc-field-wide">
          <span>Narration <abbr title="required">*</abbr></span>
          <input type="text" maxLength={300} required value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} />
        </label>

        <table className="acc-table acc-lines">
          <caption className="acc-sr-only">Journal lines</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col" className="num">Debit (₹)</th>
              <th scope="col" className="num">Credit (₹)</th>
              <th scope="col">Memo</th>
              <th scope="col"><span className="acc-sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={l.key}>
                <td>
                  <select aria-label={`Line ${i + 1} account`} value={l.account} onChange={e => setLine(l.key, { account: e.target.value })}>
                    <option value="">Choose account…</option>
                    {ACCOUNT_TYPES.map(([type, label]) => (
                      <optgroup label={label} key={type}>
                        {postable.filter(a => a.type === type).map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Line ${i + 1} debit`} value={l.debit}
                    onChange={e => setLine(l.key, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                </td>
                <td className="num">
                  <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Line ${i + 1} credit`} value={l.credit}
                    onChange={e => setLine(l.key, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                </td>
                <td>
                  <input type="text" maxLength={200} aria-label={`Line ${i + 1} memo`} value={l.memo} onChange={e => setLine(l.key, { memo: e.target.value })} />
                </td>
                <td>
                  <button type="button" className="acc-icon-btn" aria-label={`Remove line ${i + 1}`} disabled={form.lines.length <= 2}
                    onClick={() => setForm(f => ({ ...f, lines: f.lines.filter(x => x.key !== l.key) }))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Totals</th>
              <td className="num"><strong>{formatMoney(totals.dr / 100)}</strong></td>
              <td className="num"><strong>{formatMoney(totals.cr / 100)}</strong></td>
              <td colSpan={2}>
                <span className={`acc-badge ${balanced ? 'ok' : 'bad'}`} aria-live="polite">
                  {balanced ? 'Balanced' : `Difference ${formatMoney(Math.abs(totals.dr - totals.cr) / 100)}`}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
        <button type="button" className="acc-btn acc-btn-secondary" disabled={form.lines.length >= 50}
          onClick={() => setForm(f => ({ ...f, lines: [...f.lines, blankLine()] }))}>+ Add line</button>
        {!linesValid && <p className="acc-muted">Each line needs an account and either a debit or a credit.</p>}

        <ErrorList errors={errors} />
        <div className="acc-actions">
          <button type="submit" className="acc-btn acc-btn-primary" disabled={!canSubmit}>{saving ? 'Posting…' : 'Post entry'}</button>
          <button type="button" className="acc-btn acc-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Journal({ accounts, setNotice }) {
  const [filters, setFilters] = useState({ from: '', to: '', account: '', sourceType: '' });
  const list = usePagedList(p => accountingAPI.getJournal(p), { filters });
  const [open, setOpen] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const reverse = async (entry) => {
    if (!window.confirm(`Reverse entry #${entry.id} (${entry.reference || 'manual'})? A new entry with the opposite amounts will be posted today. This cannot be undone.`)) return;
    setBusyId(entry.id);
    try {
      const res = await accountingAPI.reverseJournal(entry.id);
      setNotice({ type: 'success', text: `Entry #${entry.id} reversed by entry #${res.data?.data?.id}` });
      list.reload();
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'Could not reverse the entry') });
    } finally {
      setBusyId(null);
    }
  };

  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));

  return (
    <section aria-labelledby="acc-journal-h">
      <div className="acc-section-head">
        <h2 id="acc-journal-h" className="acc-section-title">Journal</h2>
        <button type="button" className="acc-btn acc-btn-primary" onClick={() => setShowForm(true)}>+ New journal entry</button>
      </div>
      <p className="acc-muted">Posted entries are permanent. Document postings are corrected through their documents (cancel an invoice, void a payment); manual entries are corrected by reversal.</p>
      <div className="acc-filters">
        <label className="acc-field"><span>From</span><input type="date" value={filters.from} onChange={set('from')} /></label>
        <label className="acc-field"><span>To</span><input type="date" value={filters.to} onChange={set('to')} /></label>
        <label className="acc-field">
          <span>Account</span>
          <select value={filters.account} onChange={set('account')}>
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
          </select>
        </label>
        <label className="acc-field">
          <span>Source</span>
          <select value={filters.sourceType} onChange={set('sourceType')}>
            <option value="">All sources</option>
            {SOURCE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="acc-field acc-search">
          <span aria-hidden="true">Search</span>
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Reference or narration" label="Search journal" />
        </div>
      </div>

      <LoadState loading={list.loading && !list.rows.length} error={list.error} onRetry={list.reload} what="journal" />
      {!list.error && !list.loading && !list.rows.length && <div className="acc-state">No journal entries match these filters.</div>}
      {!list.error && list.rows.length > 0 && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th scope="col"><span className="acc-sr-only">Expand</span></th>
                <th scope="col">#</th>
                <th scope="col">Date</th>
                <th scope="col">Reference</th>
                <th scope="col">Narration</th>
                <th scope="col">Source</th>
                <th scope="col" className="num">Amount</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="acc-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(e => {
                const expanded = Boolean(open[e.id]);
                return (
                  <React.Fragment key={e.id}>
                    <tr>
                      <td><Expander expanded={expanded} label={`lines of entry ${e.id}`} controls={`acc-je-${e.id}`} onToggle={() => setOpen(o => ({ ...o, [e.id]: !o[e.id] }))} /></td>
                      <td>{e.id}</td>
                      <td>{formatDate(e.entryDate)}</td>
                      <td>{e.reference || '—'}</td>
                      <td>{e.narration || '—'}</td>
                      <td><span className="acc-tag">{e.sourceType}</span></td>
                      <td className="num">{formatMoney(e.amount)}</td>
                      <td>
                        {e.reversedBy ? <span className="acc-badge muted">Reversed by #{e.reversedBy}</span>
                          : e.reversalOf ? <span className="acc-badge muted">Reverses #{e.reversalOf}</span> : 'Posted'}
                      </td>
                      <td>
                        {e.sourceType === 'manual' && !e.reversedBy && (
                          <button type="button" className="acc-btn acc-btn-small" disabled={busyId === e.id} onClick={() => reverse(e)}>
                            {busyId === e.id ? 'Reversing…' : 'Reverse'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="acc-detail-row" id={`acc-je-${e.id}`}>
                        <td colSpan={9}>
                          <table className="acc-table acc-subtable">
                            <caption className="acc-sr-only">Lines of entry {e.id}</caption>
                            <thead>
                              <tr><th scope="col">Account</th><th scope="col">Memo</th><th scope="col" className="num">Debit</th><th scope="col" className="num">Credit</th></tr>
                            </thead>
                            <tbody>
                              {(e.lines || []).map((l, i) => (
                                <tr key={i}>
                                  <td>{l.account} · {l.accountName}</td>
                                  <td>{l.memo || ''}</td>
                                  <td className="num">{cents(l.debit) ? formatMoney(l.debit) : ''}</td>
                                  <td className="num">{cents(l.credit) ? formatMoney(l.credit) : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {e.createdBy && <p className="acc-muted">Posted by {e.createdBy}</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="entries" />

      {showForm && (
        <JournalForm accounts={accounts} onClose={() => setShowForm(false)}
          onPosted={() => { setShowForm(false); setNotice({ type: 'success', text: 'Journal entry posted' }); list.reload(); }} />
      )}
    </section>
  );
}

// ======================================================== Chart of accounts ===

function AccountForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'expense' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const valid = /^\d{4,6}$/.test(form.code) && form.name.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setErrors(null);
    try {
      await accountingAPI.createAccount({ code: form.code, name: form.name.trim(), type: form.type });
      onSaved(form.code);
    } catch (err) {
      setErrors(serverErrors(err, 'Could not add the account'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Add account" onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate>
        <label className="acc-field">
          <span>Code (4–6 digits)</span>
          <input type="text" inputMode="numeric" maxLength={6} pattern="\d{4,6}" value={form.code}
            onChange={e => setForm({ ...form, code: e.target.value.replace(/\D/g, '') })} aria-describedby="acc-code-hint" />
          <small id="acc-code-hint" className="acc-muted">1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx+ expenses</small>
        </label>
        <label className="acc-field acc-field-wide">
          <span>Name</span>
          <input type="text" maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="acc-field">
          <span>Type</span>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l.replace(/s$/, '')}</option>)}
          </select>
        </label>
        <ErrorList errors={errors} />
        <div className="acc-actions">
          <button type="submit" className="acc-btn acc-btn-primary" disabled={!valid || saving}>{saving ? 'Saving…' : 'Add account'}</button>
          <button type="button" className="acc-btn acc-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ChartOfAccounts({ onAccountsChanged, setNotice }) {
  const [asOf, setAsOf] = useState('');
  const r = useReport(p => accountingAPI.getAccounts(p), { asOf });
  const [showForm, setShowForm] = useState(false);
  const accounts = r.data || [];
  return (
    <section aria-labelledby="acc-coa-h">
      <div className="acc-section-head">
        <h2 id="acc-coa-h" className="acc-section-title">Chart of accounts</h2>
        <button type="button" className="acc-btn acc-btn-primary" onClick={() => setShowForm(true)}>+ Add account</button>
      </div>
      <div className="acc-filters">
        <label className="acc-field"><span>Balances as of</span><input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
        <p className="acc-muted">Leave blank for all postings to date. <span className="acc-badge muted">Control</span> accounts are moved only by their documents.</p>
      </div>
      <LoadState loading={r.loading && !r.data} error={r.error} onRetry={r.reload} what="accounts" />
      {r.data && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th scope="col">Code</th><th scope="col">Name</th>
                <th scope="col" className="num">Debits</th><th scope="col" className="num">Credits</th><th scope="col" className="num">Balance</th>
              </tr>
            </thead>
            {ACCOUNT_TYPES.map(([type, label]) => {
              const group = accounts.filter(a => a.type === type);
              if (!group.length) return null;
              const total = group.reduce((s, a) => s + cents(a.balance), 0) / 100;
              return (
                <tbody key={type}>
                  <tr className="acc-group-row"><th scope="rowgroup" colSpan={5}>{label}</th></tr>
                  {group.map(a => (
                    <tr key={a.code}>
                      <td>{a.code}</td>
                      <th scope="row" className="acc-row-head">
                        {a.name}
                        {a.controlAccount && <span className="acc-badge muted" title="Moved only by documents">Control</span>}
                        {a.isSystem && !a.controlAccount && <span className="acc-badge muted">System</span>}
                      </th>
                      <td className="num">{formatMoney(a.debit)}</td>
                      <td className="num">{formatMoney(a.credit)}</td>
                      <td className="num">{drCr(a.balance)}</td>
                    </tr>
                  ))}
                  <tr className="acc-total-row">
                    <th scope="row" colSpan={4}>Total {label.toLowerCase()}</th>
                    <td className="num">{drCr(total)}</td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}
      {showForm && (
        <AccountForm onClose={() => setShowForm(false)} onSaved={(code) => {
          setShowForm(false);
          setNotice({ type: 'success', text: `Account ${code} added` });
          r.reload();
          onAccountsChanged();
        }} />
      )}
    </section>
  );
}

// ============================================================ Trial balance ===

function TrialBalance() {
  const [asOf, setAsOf] = useState(todayIST());
  const r = useReport(p => accountingAPI.trialBalance(p), { asOf });
  const d = r.data;
  const exportCsv = () => downloadCsv(`trial-balance-${d.asOf}.csv`,
    [...d.accounts, { code: '', name: 'Total', type: '', debit: d.totalDebit, credit: d.totalCredit }],
    [['code', 'Code'], ['name', 'Account'], ['type', 'Type'], ['debit', 'Debit (INR)'], ['credit', 'Credit (INR)']]);
  return (
    <section aria-labelledby="acc-tb-h">
      <div className="acc-section-head">
        <h2 id="acc-tb-h" className="acc-section-title">Trial balance</h2>
        <button type="button" className="acc-btn acc-btn-secondary" onClick={exportCsv} disabled={!d}>Export CSV</button>
      </div>
      <div className="acc-filters">
        <label className="acc-field"><span>As of</span><input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
        {d && <BalancedBadge balanced={d.balanced} />}
      </div>
      <LoadState loading={r.loading && !d} error={r.error} onRetry={r.reload} />
      {d && !d.accounts.length && <div className="acc-state">Nothing posted up to {formatDate(d.asOf)}.</div>}
      {d && d.accounts.length > 0 && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <caption className="acc-caption">As of {formatDate(d.asOf)}</caption>
            <thead>
              <tr><th scope="col">Code</th><th scope="col">Account</th><th scope="col">Type</th><th scope="col" className="num">Debit</th><th scope="col" className="num">Credit</th></tr>
            </thead>
            <tbody>
              {d.accounts.map(a => (
                <tr key={a.code}>
                  <td>{a.code}</td><th scope="row" className="acc-row-head">{a.name}</th><td>{a.type}</td>
                  <td className="num">{a.debit ? formatMoney(a.debit) : ''}</td>
                  <td className="num">{a.credit ? formatMoney(a.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="acc-total-row">
                <th scope="row" colSpan={3}>Total</th>
                <td className="num">{formatMoney(d.totalDebit)}</td>
                <td className="num">{formatMoney(d.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function BalancedBadge({ balanced, okText = 'Balanced', badText = 'Not balanced' }) {
  return <span className={`acc-badge ${balanced ? 'ok' : 'bad'}`} role="status">{balanced ? `✓ ${okText}` : `✗ ${badText}`}</span>;
}

// ============================================================ Profit & Loss ===

function AmountTable({ caption, rows, totalLabel, total }) {
  return (
    <table className="acc-table">
      <caption className="acc-caption">{caption}</caption>
      <thead><tr><th scope="col">Code</th><th scope="col">Account</th><th scope="col" className="num">Amount</th></tr></thead>
      <tbody>
        {rows.length ? rows.map(a => (
          <tr key={a.code || a.name}><td>{a.code || '—'}</td><th scope="row" className="acc-row-head">{a.name}</th><td className="num">{formatMoney(a.amount)}</td></tr>
        )) : <tr><td colSpan={3} className="acc-muted">None</td></tr>}
      </tbody>
      <tfoot><tr className="acc-total-row"><th scope="row" colSpan={2}>{totalLabel}</th><td className="num">{formatMoney(total)}</td></tr></tfoot>
    </table>
  );
}

function ProfitLoss() {
  const [period, setPeriod] = useState({ from: '', to: '' });
  const r = useReport(p => accountingAPI.profitLoss(p), period);
  const d = r.data;
  const exportCsv = () => downloadCsv(`profit-loss-${d.from}-to-${d.to}.csv`, [
    ...d.income.map(a => ({ section: 'Income', ...a })),
    { section: 'Income', code: '', name: 'Total income', amount: d.totalIncome },
    ...d.expenses.map(a => ({ section: 'Expenses', ...a })),
    { section: 'Expenses', code: '', name: 'Total expenses', amount: d.totalExpenses },
    { section: '', code: '', name: d.netProfit >= 0 ? 'Net profit' : 'Net loss', amount: d.netProfit }
  ], [['section', 'Section'], ['code', 'Code'], ['name', 'Account'], ['amount', 'Amount (INR)']]);
  return (
    <section aria-labelledby="acc-pl-h">
      <div className="acc-section-head">
        <h2 id="acc-pl-h" className="acc-section-title">Profit &amp; Loss</h2>
        <button type="button" className="acc-btn acc-btn-secondary" onClick={exportCsv} disabled={!d}>Export CSV</button>
      </div>
      <div className="acc-filters">
        <label className="acc-field"><span>From</span><input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
        <label className="acc-field"><span>To</span><input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
        <p className="acc-muted">Blank dates mean this financial year (from 1 April) to date.</p>
      </div>
      <LoadState loading={r.loading && !d} error={r.error} onRetry={r.reload} />
      {d && (
        <>
          <p className="acc-period">Period: {formatDate(d.from)} – {formatDate(d.to)}</p>
          <div className="acc-two-col">
            <AmountTable caption="Income" rows={d.income} totalLabel="Total income" total={d.totalIncome} />
            <AmountTable caption="Expenses" rows={d.expenses} totalLabel="Total expenses" total={d.totalExpenses} />
          </div>
          <div className={`acc-result ${d.netProfit >= 0 ? 'ok' : 'bad'}`}>
            <span>{d.netProfit >= 0 ? 'Net profit' : 'Net loss'}</span>
            <strong>{formatMoney(Math.abs(d.netProfit))}</strong>
          </div>
        </>
      )}
    </section>
  );
}

// ============================================================ Balance sheet ===

function BalanceSheet() {
  const [asOf, setAsOf] = useState(todayIST());
  const r = useReport(p => accountingAPI.balanceSheet(p), { asOf });
  const d = r.data;
  return (
    <section aria-labelledby="acc-bs-h">
      <h2 id="acc-bs-h" className="acc-section-title">Balance sheet</h2>
      <div className="acc-filters">
        <label className="acc-field"><span>As of</span><input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
        {d && <BalancedBadge balanced={d.balanced} okText="Assets = Liabilities + Equity" />}
      </div>
      <LoadState loading={r.loading && !d} error={r.error} onRetry={r.reload} />
      {d && (
        <div className="acc-two-col">
          <div>
            <AmountTable caption="Assets" rows={d.assets} totalLabel="Total assets" total={d.totalAssets} />
          </div>
          <div>
            <AmountTable caption="Liabilities" rows={d.liabilities} totalLabel="Total liabilities" total={d.totalLiabilities} />
            <AmountTable caption="Equity" rows={d.equity} totalLabel="Total equity" total={d.totalEquity} />
            <div className="acc-result neutral">
              <span>Liabilities + Equity</span><strong>{formatMoney(d.totalLiabilitiesAndEquity)}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ================================================================== Ageing ===

function Ageing({ kind }) {
  const isRec = kind === 'receivables';
  const r = useReport(() => (isRec ? accountingAPI.receivables() : accountingAPI.payables()), { kind });
  const [open, setOpen] = useState({});
  const d = r.data;
  const partyLabel = isRec ? 'Customer' : 'Supplier';
  const exportCsv = () => downloadCsv(`${kind}-ageing-${d.asOf}.csv`,
    [...d.parties, { party: 'Total', ...d.totals }],
    [['party', partyLabel], ...BUCKETS.map(([k, l]) => [k, `${l} (INR)`]), ['total', 'Total (INR)']]);
  return (
    <section aria-labelledby={`acc-${kind}-h`}>
      <div className="acc-section-head">
        <h2 id={`acc-${kind}-h`} className="acc-section-title">{isRec ? 'Receivables' : 'Payables'} ageing</h2>
        <button type="button" className="acc-btn acc-btn-secondary" onClick={exportCsv} disabled={!d}>Export CSV</button>
      </div>
      <p className="acc-muted">Outstanding {isRec ? 'customer invoices' : 'supplier bills'} by days past the due date{d ? `, as of ${formatDate(d.asOf)}` : ''}.</p>
      <LoadState loading={r.loading && !d} error={r.error} onRetry={r.reload} />
      {d && !d.parties.length && <div className="acc-state">Nothing outstanding.</div>}
      {d && d.parties.length > 0 && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th scope="col"><span className="acc-sr-only">Expand</span></th>
                <th scope="col">{partyLabel}</th>
                {BUCKETS.map(([k, l]) => <th scope="col" className="num" key={k}>{l}</th>)}
                <th scope="col" className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.parties.map((p, idx) => {
                const key = p.partyId ?? `n${idx}`;
                const expanded = Boolean(open[key]);
                const rowId = `acc-${kind}-${key}`;
                return (
                  <React.Fragment key={key}>
                    <tr>
                      <td><Expander expanded={expanded} label={`documents for ${p.party}`} controls={rowId} onToggle={() => setOpen(o => ({ ...o, [key]: !o[key] }))} /></td>
                      <th scope="row" className="acc-row-head">{p.party}</th>
                      {BUCKETS.map(([k]) => <td className={`num ${k !== 'current' && cents(p[k]) ? 'acc-overdue' : ''}`} key={k}>{cents(p[k]) ? formatMoney(p[k]) : '—'}</td>)}
                      <td className="num"><strong>{formatMoney(p.total)}</strong></td>
                    </tr>
                    {expanded && (
                      <tr className="acc-detail-row" id={rowId}>
                        <td colSpan={BUCKETS.length + 3}>
                          <table className="acc-table acc-subtable">
                            <caption className="acc-sr-only">Documents for {p.party}</caption>
                            <thead>
                              <tr><th scope="col">{isRec ? 'Invoice' : 'Bill'}</th><th scope="col">Date</th><th scope="col">Due</th><th scope="col" className="num">Days overdue</th><th scope="col" className="num">Outstanding</th></tr>
                            </thead>
                            <tbody>
                              {p.documents.map(doc => (
                                <tr key={doc.id}>
                                  <td>{doc.number}</td><td>{formatDate(doc.docDate)}</td><td>{formatDate(doc.dueDate)}</td>
                                  <td className={`num ${doc.daysOverdue > 0 ? 'acc-overdue' : ''}`}>{doc.daysOverdue > 0 ? formatNumber(doc.daysOverdue, { decimals: 0 }) : '—'}</td>
                                  <td className="num">{formatMoney(doc.outstanding)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="acc-total-row">
                <th scope="row" colSpan={2}>Total</th>
                {BUCKETS.map(([k]) => <td className="num" key={k}>{formatMoney(d.totals[k])}</td>)}
                <td className="num">{formatMoney(d.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// ==================================================================== GST ===

function GstRateTable({ caption, rows, totals, docLabel }) {
  return (
    <table className="acc-table">
      <caption className="acc-caption">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">GST rate</th><th scope="col" className="num">{docLabel}</th><th scope="col" className="num">Taxable value</th>
          <th scope="col" className="num">CGST</th><th scope="col" className="num">SGST</th><th scope="col" className="num">IGST</th><th scope="col" className="num">Total tax</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? rows.map(x => (
          <tr key={x.gstRate}>
            <th scope="row" className="acc-row-head">{formatNumber(x.gstRate)}%</th>
            <td className="num">{formatNumber(x.documents, { decimals: 0 })}</td>
            <td className="num">{formatMoney(x.taxableValue)}</td>
            <td className="num">{formatMoney(x.cgst)}</td><td className="num">{formatMoney(x.sgst)}</td><td className="num">{formatMoney(x.igst)}</td>
            <td className="num">{formatMoney((cents(x.cgst) + cents(x.sgst) + cents(x.igst)) / 100)}</td>
          </tr>
        )) : <tr><td colSpan={7} className="acc-muted">None in this period</td></tr>}
      </tbody>
      <tfoot>
        <tr className="acc-total-row">
          <th scope="row" colSpan={2}>Total</th>
          <td className="num">{formatMoney(totals.taxableValue)}</td>
          <td className="num">{formatMoney(totals.cgst)}</td><td className="num">{formatMoney(totals.sgst)}</td><td className="num">{formatMoney(totals.igst)}</td>
          <td className="num">{formatMoney((cents(totals.cgst) + cents(totals.sgst) + cents(totals.igst)) / 100)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function GstSummary() {
  const [period, setPeriod] = useState(() => ({ from: `${todayIST().slice(0, 7)}-01`, to: todayIST() }));
  const r = useReport(p => accountingAPI.gstSummary(p), period);
  const d = r.data;
  const netCell = (v) => (cents(v) >= 0 ? formatMoney(v) : `${formatMoney(Math.abs(v))} (credit)`);
  return (
    <section aria-labelledby="acc-gst-h">
      <h2 id="acc-gst-h" className="acc-section-title">GST summary</h2>
      <p className="acc-note" role="note">
        This is a working summary to help prepare GSTR-1 and GSTR-3B. It is not a filing: input-tax eligibility, set-off order,
        reverse charge and amendments are applied by whoever files the return.
      </p>
      <div className="acc-filters">
        <label className="acc-field"><span>From</span><input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
        <label className="acc-field"><span>To</span><input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label>
      </div>
      <LoadState loading={r.loading && !d} error={r.error} onRetry={r.reload} />
      {d && (
        <>
          <p className="acc-period">Period: {formatDate(d.from)} – {formatDate(d.to)}</p>
          <div className="acc-kpis">
            <div className="acc-kpi"><span className="acc-kpi-label">B2B invoices</span><span className="acc-kpi-value">{formatNumber(d.invoiceCounts?.b2b ?? 0, { decimals: 0 })}</span><span className="acc-kpi-hint">Buyer has a GSTIN</span></div>
            <div className="acc-kpi"><span className="acc-kpi-label">B2C invoices</span><span className="acc-kpi-value">{formatNumber(d.invoiceCounts?.b2c ?? 0, { decimals: 0 })}</span><span className="acc-kpi-hint">Unregistered buyers</span></div>
            <div className="acc-kpi"><span className="acc-kpi-label">Cancelled</span><span className="acc-kpi-value">{formatNumber(d.invoiceCounts?.cancelled ?? 0, { decimals: 0 })}</span><span className="acc-kpi-hint">Excluded from tax totals</span></div>
          </div>
          <GstRateTable caption="Output tax (sales invoices)" rows={d.output} totals={d.outputTotals} docLabel="Invoices" />
          <GstRateTable caption="Input tax (supplier bills)" rows={d.input} totals={d.inputTotals} docLabel="Bills" />
          <table className="acc-table acc-net">
            <caption className="acc-caption">Net position (output − input)</caption>
            <thead><tr><th scope="col">Head</th><th scope="col" className="num">Output</th><th scope="col" className="num">Input</th><th scope="col" className="num">Net payable</th></tr></thead>
            <tbody>
              {[['cgst', 'CGST'], ['sgst', 'SGST / UTGST'], ['igst', 'IGST']].map(([k, l]) => (
                <tr key={k}>
                  <th scope="row" className="acc-row-head">{l}</th>
                  <td className="num">{formatMoney(d.outputTotals[k])}</td>
                  <td className="num">{formatMoney(d.inputTotals[k])}</td>
                  <td className="num">{netCell(d.net[k])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="acc-total-row"><th scope="row" colSpan={3}>Total net</th><td className="num">{netCell(d.net.total)}</td></tr></tfoot>
          </table>
        </>
      )}
    </section>
  );
}

// ======================================================== Supplier payments ===

function PaymentForm({ onClose, onSaved, initialBillId = '' }) {
  const [bills, setBills] = useState({ rows: [], loading: true, error: '' });
  const [form, setForm] = useState({ billId: initialBillId ? String(initialBillId) : '', amount: '', method: 'bank', paymentDate: todayIST(), reference: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);

  const loadBills = useCallback(async () => {
    setBills(b => ({ ...b, loading: true, error: '' }));
    try {
      const res = await accountingAPI.payableBills({ pageSize: 500 });
      const rows = res.data?.data || [];
      setBills({ rows, loading: false, error: '' });
      // Opened from a bill's "Pay" button: fill in its outstanding amount.
      if (initialBillId) {
        const b = rows.find(x => String(x.id) === String(initialBillId));
        if (b) setForm(f => ({ ...f, amount: f.amount || String(b.balanceDue) }));
      }
    } catch (err) {
      setBills({ rows: [], loading: false, error: errorMessage(err, 'Could not load open bills') });
    }
  }, [initialBillId]);
  useEffect(() => { loadBills(); }, [loadBills]);

  const bill = bills.rows.find(b => String(b.id) === String(form.billId));
  const amt = cents(form.amount);
  const tooMuch = bill && amt > cents(bill.balanceDue);
  const beforeBill = bill && form.paymentDate && form.paymentDate < bill.billDate;
  const valid = bill && amt > 0 && !tooMuch && form.paymentDate && form.paymentDate <= todayIST() && !beforeBill;

  const choose = (id) => {
    const b = bills.rows.find(x => String(x.id) === String(id));
    setForm(f => ({ ...f, billId: id, amount: b ? String(b.balanceDue) : '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setErrors(null);
    try {
      const res = await accountingAPI.createPayment({
        direction: 'out', billId: bill.id, amount: Number(form.amount), method: form.method, paymentDate: form.paymentDate,
        reference: form.reference.trim() || undefined, notes: form.notes.trim() || undefined
      });
      onSaved(res.data?.data);
    } catch (err) {
      setErrors(serverErrors(err, 'Could not record the payment'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Record supplier payment" onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate>
        {bills.error && (
          <div className="acc-notice error" role="alert">
            {bills.error} <button type="button" className="acc-link" onClick={loadBills}>Retry</button>
          </div>
        )}
        <label className="acc-field acc-field-wide">
          <span>Bill</span>
          <select value={form.billId} onChange={e => choose(e.target.value)} disabled={bills.loading}>
            <option value="">{bills.loading ? 'Loading open bills…' : bills.rows.length ? 'Choose a bill…' : 'No unpaid bills'}</option>
            {bills.rows.map(b => (
              <option key={b.id} value={b.id}>
                {b.billRef} ({b.supplierBillNo}) · {b.supplierName} · due {formatDate(b.dueDate)} · {formatMoney(b.balanceDue)} outstanding
              </option>
            ))}
          </select>
        </label>
        {bill && (
          <p className="acc-muted">
            Bill total {formatMoney(bill.total)}, paid {formatMoney(bill.amountPaid)}, outstanding <strong>{formatMoney(bill.balanceDue)}</strong>
            {bill.overdue ? <span className="acc-badge bad">Overdue</span> : null}
          </p>
        )}
        <div className="acc-form-row">
          <label className="acc-field">
            <span>Amount (₹)</span>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} aria-invalid={tooMuch || undefined}
              onChange={e => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label className="acc-field">
            <span>Method</span>
            <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="acc-field">
            <span>Payment date</span>
            <input type="date" value={form.paymentDate} max={todayIST()} min={bill?.billDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} />
          </label>
        </div>
        {tooMuch && <p className="acc-field-error" role="alert">The amount is more than the {formatMoney(bill.balanceDue)} outstanding.</p>}
        {beforeBill && <p className="acc-field-error" role="alert">The payment date is before the bill date ({formatDate(bill.billDate)}).</p>}
        <div className="acc-form-row">
          <label className="acc-field">
            <span>Reference (UTR / cheque no.)</span>
            <input type="text" maxLength={100} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
          </label>
          <label className="acc-field acc-field-wide">
            <span>Notes</span>
            <input type="text" maxLength={300} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </label>
        </div>
        <ErrorList errors={errors} />
        <div className="acc-actions">
          <button type="submit" className="acc-btn acc-btn-primary" disabled={!valid || saving}>{saving ? 'Recording…' : 'Record payment'}</button>
          <button type="button" className="acc-btn acc-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function VoidForm({ payment, onClose, onVoided }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState(null);
  const valid = reason.trim().length >= 3;
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setErrors(null);
    try {
      await accountingAPI.voidPayment(payment.id, reason.trim());
      onVoided();
    } catch (err) {
      setErrors(serverErrors(err, 'Could not void the payment'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Void ${payment.paymentNumber}`} onClose={onClose} busy={saving}>
      <form onSubmit={submit} noValidate>
        <p className="acc-muted">
          Voiding posts a reversing ledger entry dated today and reopens {payment.billRef || 'the bill'} for {formatMoney(payment.amount)}.
          The original payment stays on record. This cannot be undone.
        </p>
        <label className="acc-field acc-field-wide">
          <span>Reason (at least 3 characters)</span>
          <textarea rows={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
        </label>
        <ErrorList errors={errors} />
        <div className="acc-actions">
          <button type="submit" className="acc-btn acc-btn-danger" disabled={!valid || saving}>{saving ? 'Voiding…' : 'Void payment'}</button>
          <button type="button" className="acc-btn acc-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function BillsToPay({ reloadKey, onPay }) {
  const bills = usePagedList(p => accountingAPI.payableBills(p), { pageSize: 10, filters: { reloadKey } });
  const [totals, setTotals] = useState(null);
  useEffect(() => {
    accountingAPI.payableBills({ pageSize: 1 }).then(r => setTotals(r.data?.totals || null)).catch(() => setTotals(null));
  }, [reloadKey]);
  return (
    <div className="acc-bills-due">
      <div className="acc-section-head">
        <h3 className="acc-subtitle">
          Bills awaiting payment
          {totals && <span className="acc-muted"> · {formatMoney(totals.outstanding)} outstanding{Number(totals.overdue) > 0 ? `, ${formatMoney(totals.overdue)} overdue` : ''}</span>}
        </h3>
        <SearchBox value={bills.query} onChange={bills.setQuery} placeholder="Bill, supplier invoice no., supplier" label="Search bills awaiting payment" />
      </div>
      <LoadState loading={bills.loading && !bills.rows.length} error={bills.error} onRetry={bills.reload} what="bills" />
      {!bills.error && !bills.loading && !bills.rows.length && (
        <div className="acc-state">
          No bills are waiting for payment. Book a supplier bill in Purchases (purchase order → Book supplier bill) and it will appear here.
        </div>
      )}
      {!bills.error && bills.rows.length > 0 && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th scope="col">Bill</th><th scope="col">Supplier</th><th scope="col">Bill date</th><th scope="col">Due</th>
                <th scope="col" className="num">Total</th><th scope="col" className="num">Paid</th><th scope="col" className="num">Balance due</th>
                <th scope="col"><span className="acc-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {bills.rows.map(b => (
                <tr key={b.id}>
                  <th scope="row" className="acc-row-head">
                    {b.billRef}
                    <div className="acc-muted acc-small">Supplier no. {b.supplierBillNo}{b.poNumber ? ` · ${b.poNumber}` : ''}</div>
                  </th>
                  <td>{b.supplierName}</td>
                  <td>{formatDate(b.billDate)}</td>
                  <td>
                    {formatDate(b.dueDate)}
                    {b.overdue && <div><span className="acc-badge bad">{b.daysOverdue} day{b.daysOverdue === 1 ? '' : 's'} overdue</span></div>}
                  </td>
                  <td className="num">{formatMoney(b.total)}</td>
                  <td className="num">{formatMoney(b.amountPaid)}</td>
                  <td className="num"><strong>{formatMoney(b.balanceDue)}</strong></td>
                  <td>
                    <button type="button" className="acc-btn acc-btn-primary acc-btn-small" onClick={() => onPay(b.id)}
                      aria-label={`Pay ${b.billRef}`}>Pay</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={bills.pagination} onPage={bills.setPage} disabled={bills.loading} label="bills" />
    </div>
  );
}

function SupplierPayments({ setNotice }) {
  const [filters, setFilters] = useState({ status: '', from: '', to: '' });
  const filterParams = useMemo(() => ({ ...filters, direction: 'out' }), [filters]);
  const list = usePagedList(p => accountingAPI.getPayments(p), { filters: filterParams });
  const [showForm, setShowForm] = useState(null);   // null, or { billId } ('' = choose in the form)
  const [voiding, setVoiding] = useState(null);
  const [billsKey, setBillsKey] = useState(0);
  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));

  return (
    <section aria-labelledby="acc-pay-h">
      <div className="acc-section-head">
        <h2 id="acc-pay-h" className="acc-section-title">Supplier payments</h2>
        <button type="button" className="acc-btn acc-btn-primary" onClick={() => setShowForm({ billId: '' })}>+ Record payment</button>
      </div>

      <BillsToPay reloadKey={billsKey} onPay={(billId) => setShowForm({ billId })} />

      <h3 className="acc-subtitle acc-payments-title">Payments made</h3>
      <div className="acc-filters">
        <label className="acc-field">
          <span>Status</span>
          <select value={filters.status} onChange={set('status')}>
            <option value="">All</option><option value="posted">Posted</option><option value="void">Void</option>
          </select>
        </label>
        <label className="acc-field"><span>From</span><input type="date" value={filters.from} onChange={set('from')} /></label>
        <label className="acc-field"><span>To</span><input type="date" value={filters.to} onChange={set('to')} /></label>
        <div className="acc-field acc-search">
          <span aria-hidden="true">Search</span>
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Number, supplier, reference, bill" label="Search payments" />
        </div>
      </div>
      <LoadState loading={list.loading && !list.rows.length} error={list.error} onRetry={list.reload} what="payments" />
      {!list.error && !list.loading && !list.rows.length && <div className="acc-state">No supplier payments recorded yet. Use <strong>Pay</strong> on a bill above.</div>}
      {!list.error && list.rows.length > 0 && (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th scope="col">Payment</th><th scope="col">Date</th><th scope="col">Supplier</th><th scope="col">Bill</th>
                <th scope="col">Method</th><th scope="col">Reference</th><th scope="col" className="num">Amount</th>
                <th scope="col">Status</th><th scope="col"><span className="acc-sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(p => (
                <tr key={p.id} className={p.status === 'void' ? 'acc-void' : ''}>
                  <th scope="row" className="acc-row-head">{p.paymentNumber}</th>
                  <td>{formatDate(p.paymentDate)}</td>
                  <td>{p.partyName || '—'}</td>
                  <td>{p.billRef || '—'}{p.supplierBillNo ? ` (${p.supplierBillNo})` : ''}</td>
                  <td>{(METHODS.find(m => m[0] === p.method) || [null, p.method])[1]}</td>
                  <td>{p.reference || '—'}</td>
                  <td className="num">{formatMoney(p.amount)}</td>
                  <td>
                    {p.status === 'void'
                      ? <span className="acc-badge bad" title={p.voidReason || ''}>Void</span>
                      : <span className="acc-badge ok">Posted</span>}
                    {p.status === 'void' && p.voidReason && <div className="acc-muted acc-small">{p.voidReason}</div>}
                  </td>
                  <td>
                    {p.status !== 'void' && (
                      <button type="button" className="acc-btn acc-btn-small" onClick={() => setVoiding(p)}>Void</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="payments" />

      {showForm && (
        <PaymentForm initialBillId={showForm.billId} onClose={() => setShowForm(null)} onSaved={(pay) => {
          setShowForm(null);
          setNotice({ type: 'success', text: pay?.paymentNumber ? `Payment ${pay.paymentNumber} recorded` : 'Payment recorded' });
          list.reload();
          setBillsKey(k => k + 1);
        }} />
      )}
      {voiding && (
        <VoidForm payment={voiding} onClose={() => setVoiding(null)} onVoided={() => {
          setNotice({ type: 'success', text: `${voiding.paymentNumber} voided` });
          setVoiding(null);
          list.reload();
          setBillsKey(k => k + 1);
        }} />
      )}
    </section>
  );
}

// ==================================================================== Screen ===

export default function Accounting() {
  const [tab, setTab] = useState('overview');
  const [notice, setNotice] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountsError, setAccountsError] = useState('');

  const loadAccounts = useCallback(async () => {
    setAccountsError('');
    try {
      const res = await accountingAPI.getAccounts();
      setAccounts(res.data?.data || []);
    } catch (err) {
      setAccountsError(errorMessage(err, 'Could not load the chart of accounts'));
    }
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  const tabRefs = useRef({});
  const onTabKey = (e, idx) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next][0]);
    tabRefs.current[TABS[next][0]]?.focus();
  };

  return (
    <div className="acc">
      <header className="acc-header">
        <h1>Accounting</h1>
        <p className="acc-subtitle">General ledger, financial statements, ageing and GST · amounts in ₹ · dates in IST</p>
      </header>

      <div className="acc-tabs" role="tablist" aria-label="Accounting sections">
        {TABS.map(([key, label], idx) => (
          <button key={key} type="button" role="tab" id={`acc-tab-${key}`} aria-selected={tab === key} aria-controls={`acc-panel-${key}`}
            tabIndex={tab === key ? 0 : -1} className={`acc-tab ${tab === key ? 'active' : ''}`}
            ref={el => { tabRefs.current[key] = el; }} onKeyDown={e => onTabKey(e, idx)} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div className={`acc-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" className="acc-icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}
      {accountsError && (tab === 'journal') && (
        <div className="acc-notice error" role="alert">
          <span>{accountsError}</span>
          <button type="button" className="acc-link" onClick={loadAccounts}>Retry</button>
        </div>
      )}

      <div className="acc-panel" role="tabpanel" id={`acc-panel-${tab}`} aria-labelledby={`acc-tab-${tab}`}>
        {tab === 'overview' && <Overview />}
        {tab === 'journal' && <Journal accounts={accounts} setNotice={setNotice} />}
        {tab === 'accounts' && <ChartOfAccounts onAccountsChanged={loadAccounts} setNotice={setNotice} />}
        {tab === 'trial' && <TrialBalance />}
        {tab === 'pl' && <ProfitLoss />}
        {tab === 'bs' && <BalanceSheet />}
        {tab === 'receivables' && <Ageing kind="receivables" key="receivables" />}
        {tab === 'payables' && <Ageing kind="payables" key="payables" />}
        {tab === 'gst' && <GstSummary />}
        {tab === 'payments' && <SupplierPayments setNotice={setNotice} />}
      </div>
    </div>
  );
}
