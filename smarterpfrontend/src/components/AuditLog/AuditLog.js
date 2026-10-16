import React, { useEffect, useState } from 'react';
import { auditAPI } from '../../services/api';
import usePagedList from '../../hooks/usePagedList';
import Pagination from '../common/Pagination';
import { formatDateTime, errorMessage } from '../../utils/format';
import './AuditLog.css';

/**
 * Audit trail (Admins only). Every insert, update and delete on audited
 * tables, plus sign-in events. Rows can hold personal data (HR and user
 * records), so there is deliberately no export.
 */

const ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAIL', 'LOGOUT'];
// The server strips password hashes; this is a second line of defence.
const SECRET_KEY = /pass(word)?|hash|token|secret|otp/i;

const show = (v) => {
  if (v === undefined) return <span className="audit-none">—</span>;
  if (v === null) return <span className="audit-none">empty</span>;
  if (typeof v === 'object') return <code>{JSON.stringify(v)}</code>;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

function Changes({ entry }) {
  const before = entry.oldData && typeof entry.oldData === 'object' ? entry.oldData : null;
  const after = entry.newData && typeof entry.newData === 'object' ? entry.newData : null;
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  if (!keys.length) return <p className="audit-muted">No field data recorded for this event.</p>;
  return (
    <table className="audit-table audit-diff">
      <caption className="audit-sr-only">Changes in event {entry.id}</caption>
      <thead>
        <tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col"><span aria-hidden="true">→ </span>After</th></tr>
      </thead>
      <tbody>
        {keys.map(k => {
          const secret = SECRET_KEY.test(k);
          return (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className="audit-before">{secret ? '[redacted]' : show(before ? before[k] : undefined)}</td>
              <td className="audit-after">{secret ? '[redacted]' : show(after ? after[k] : undefined)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function AuditLog() {
  const [filters, setFilters] = useState({ table: '', action: '', userId: '', recordId: '', from: '', to: '' });
  const [tables, setTables] = useState([]);
  const [tablesError, setTablesError] = useState('');
  const [open, setOpen] = useState({});
  const userIdValid = filters.userId === '' || /^[1-9]\d{0,9}$/.test(filters.userId);
  // An invalid user id is not sent (the field shows the problem instead).
  const sent = { ...filters, userId: userIdValid ? filters.userId : '', recordId: filters.recordId.trim() };
  const list = usePagedList(p => auditAPI.list(p), { filters: sent, pageSize: 50 });

  useEffect(() => {
    let live = true;
    auditAPI.tables()
      .then(res => { if (live) setTables(res.data?.data || []); })
      .catch(err => { if (live) setTablesError(errorMessage(err, 'Could not load the table list')); });
    return () => { live = false; };
  }, []);

  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));
  const anyFilter = Object.values(filters).some(Boolean);

  return (
    <div className="audit">
      <header className="audit-header">
        <h1>Audit log</h1>
        <p className="audit-subtitle">Who changed what, and when. Times are shown in IST.</p>
      </header>

      <div className="audit-dpdp" role="note">
        <strong>Contains personal data. Admins only.</strong> Do not export or share outside the organisation without a lawful reason (DPDP Act 2023).
      </div>

      <div className="audit-filters">
        <label className="audit-field">
          <span>Table</span>
          <select value={filters.table} onChange={set('table')}>
            <option value="">All tables</option>
            {tables.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="audit-field">
          <span>Action</span>
          <select value={filters.action} onChange={set('action')}>
            <option value="">All actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="audit-field">
          <span>User ID</span>
          <input type="text" inputMode="numeric" value={filters.userId} onChange={set('userId')}
            aria-invalid={!userIdValid || undefined} aria-describedby={!userIdValid ? 'audit-uid-err' : undefined} />
          {!userIdValid && <small id="audit-uid-err" className="audit-field-error">Enter a whole number</small>}
        </label>
        <label className="audit-field">
          <span>Record ID</span>
          <input type="text" maxLength={60} value={filters.recordId} onChange={set('recordId')} />
        </label>
        <label className="audit-field">
          <span>From</span>
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="audit-field">
          <span>To</span>
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        <button type="button" className="audit-btn" disabled={!anyFilter}
          onClick={() => setFilters({ table: '', action: '', userId: '', recordId: '', from: '', to: '' })}>
          Clear filters
        </button>
      </div>
      {tablesError && <p className="audit-muted" role="alert">{tablesError}</p>}

      {list.error && (
        <div className="audit-state audit-error" role="alert">
          <span>{list.error}</span>
          <button type="button" className="audit-btn" onClick={list.reload}>Try again</button>
        </div>
      )}
      {!list.error && list.loading && !list.rows.length && <div className="audit-state" role="status">Loading audit log…</div>}
      {!list.error && !list.loading && !list.rows.length && (
        <div className="audit-state">{anyFilter ? 'No events match these filters.' : 'No events recorded yet.'}</div>
      )}

      {!list.error && list.rows.length > 0 && (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th scope="col"><span className="audit-sr-only">Expand</span></th>
                <th scope="col">Time (IST)</th>
                <th scope="col">User</th>
                <th scope="col">Action</th>
                <th scope="col">Table</th>
                <th scope="col">Record</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(e => {
                const expanded = Boolean(open[e.id]);
                const detailId = `audit-detail-${e.id}`;
                return (
                  <React.Fragment key={e.id}>
                    <tr>
                      <td>
                        <button type="button" className="audit-expander" aria-expanded={expanded} aria-controls={detailId}
                          aria-label={`${expanded ? 'Hide' : 'Show'} changes for event ${e.id}`}
                          onClick={() => setOpen(o => ({ ...o, [e.id]: !o[e.id] }))}>
                          {expanded ? '▾' : '▸'}
                        </button>
                      </td>
                      <td>{formatDateTime(e.occurredAt)}</td>
                      <td>{e.userName || (e.userId ? `User #${e.userId}` : 'system')}</td>
                      <td><span className={`audit-action audit-action-${String(e.action).toLowerCase()}`}>{e.action}</span></td>
                      <td>{e.tableName || '—'}</td>
                      <td>{e.recordId ?? '—'}</td>
                    </tr>
                    {expanded && (
                      <tr className="audit-detail-row" id={detailId}>
                        <td colSpan={6}>
                          {e.action === 'UPDATE' && <p className="audit-muted">Only the fields that changed are recorded.</p>}
                          <Changes entry={e} />
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
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="events" />
    </div>
  );
}
