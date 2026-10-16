import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { productionAPI, qualityAPI } from '../../services/api';
import { formatNumber, formatPercent, formatDate, errorMessage, downloadCsv } from '../../utils/format';
import '../ProductionPlanning/ProductionBoard.css';

/**
 * Quality inspection queue and results.
 *
 * Uses qualityAPI (authenticated). The previous version called the service
 * port without a token, so the queue was always empty and read "All caught
 * up!" — an error that looked like good news. Report figures are computed
 * from recorded inspections instead of fixed percentages, and the inspector
 * is chosen rather than hard-coded.
 */

const badge = (s) => `prb-badge prb-badge-${String(s || '').toLowerCase().replace(/[^a-z]/g, '')}`;
const EMPTY_FORM = { inspectorId: '', inspected: '', approved: '', rejected: '', reasons: '' };

const QualityDashboard = ({ embedded = false }) => {
  const [tab, setTab] = useState('queue');
  const [dash, setDash] = useState(null);
  const [reports, setReports] = useState([]);
  const [inspectors, setInspectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(null);       // batch being recorded
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, r, people] = await Promise.all([
        qualityAPI.getDashboard(), qualityAPI.getReports(), productionAPI.getProductionEmployees()
      ]);
      setDash(d.data.data);
      setReports(r.data.data || []);
      setInspectors((people.data.data || []).filter(p => p.Department === 'Quality'));
    } catch (err) {
      setError(errorMessage(err, 'Could not load quality data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const sum = (k) => reports.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const inspected = sum('pieces_inspected');
    return {
      inspected,
      approvalRate: inspected ? (sum('pieces_approved') * 100) / inspected : null,
      rejectionRate: inspected ? (sum('pieces_rejected') * 100) / inspected : null,
      batches: reports.length
    };
  }, [reports]);

  const start = async (batch) => {
    setBusy(true);
    setNotice(null);
    try {
      await qualityAPI.startInspection({ inspection_id: batch.id });
      setNotice({ type: 'success', text: `Inspection of ${batch.order_number} started` });
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'Could not start the inspection') });
    } finally {
      setBusy(false);
      load();
    }
  };

  const openRecord = (batch) => {
    setRecording(batch);
    setForm({ ...EMPTY_FORM, inspected: String(batch.pieces_sent) });
  };

  const submit = async () => {
    const inspected = Number(form.inspected);
    const approved = Number(form.approved);
    const rejected = Number(form.rejected);
    const whole = (n) => Number.isInteger(n) && n >= 0;
    if (!whole(inspected) || inspected < 1 || !whole(approved) || !whole(rejected)) {
      setNotice({ type: 'error', text: 'Enter whole numbers of pieces' });
      return;
    }
    if (inspected > recording.pieces_sent) {
      setNotice({ type: 'error', text: `Only ${recording.pieces_sent} pieces were produced in this batch` });
      return;
    }
    // Mirrors the server rule, so the user hears it before saving.
    if (approved + rejected !== inspected) {
      setNotice({ type: 'error', text: `Approved (${approved}) plus rejected (${rejected}) must equal inspected (${inspected})` });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await qualityAPI.completeInspection({
        inspection_id: recording.id,
        inspector_id: form.inspectorId ? Number(form.inspectorId) : undefined,
        pieces_inspected: inspected,
        pieces_approved: approved,
        pieces_rejected: rejected,
        rejection_reasons: form.reasons || undefined
      });
      const added = res.data.finishedGoodsAdded;
      setNotice({
        type: 'success',
        text: `Inspection of ${recording.order_number} saved${added > 0 ? ` — ${added} pieces added to finished goods stock` : ''}`
      });
      setRecording(null);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'Could not save the inspection') });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className={`prb ${embedded ? 'prb-embedded' : ''}`}><div className="prb-state">Loading quality data…</div></div>;
  if (error && !dash) {
    return (
      <div className={`prb ${embedded ? 'prb-embedded' : ''}`}>
        <div className="prb-state prb-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="prb-btn" onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      </div>
    );
  }

  const today = dash.todayInspections || {};
  const queue = dash.pendingInspections || [];

  return (
    <div className={`prb ${embedded ? 'prb-embedded' : ''}`}>
      <div className="prb-header">
        <div>
          {embedded ? <h2>Quality control</h2> : <h1>Quality Control</h1>}
          <p className="prb-muted">Inspect production batches; approved pieces go into finished-goods stock.</p>
        </div>
        <button type="button" className="prb-btn" onClick={load} disabled={busy}>Refresh</button>
      </div>

      {error && <div className="prb-notice prb-notice-error" role="alert">{error} — showing the last data loaded.</div>}
      {notice && (
        <div className={`prb-notice prb-notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <div className="prb-cards">
        <div className="prb-card"><div className="prb-card-label">Waiting in queue</div><div className="prb-card-value">{queue.length}</div></div>
        <div className="prb-card"><div className="prb-card-label">Inspected today</div><div className="prb-card-value">{formatNumber(today.total_inspected || 0, { decimals: 0 })}</div></div>
        <div className="prb-card"><div className="prb-card-label">Approved today</div><div className="prb-card-value">{formatNumber(today.total_approved || 0, { decimals: 0 })}</div></div>
        <div className="prb-card"><div className="prb-card-label">Rejected today</div><div className="prb-card-value">{formatNumber(today.total_rejected || 0, { decimals: 0 })}</div></div>
      </div>

      <div className="prb-tabs" role="tablist">
        {[['queue', `Inspection queue (${queue.length})`], ['reports', 'Results'], ['guidelines', 'Guidelines']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
                  className={`prb-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="prb-panel">
          {queue.length === 0 ? (
            <p className="prb-empty">Nothing is waiting for inspection. New batches appear here as soon as production is recorded.</p>
          ) : (
            <div className="prb-table-wrap">
              <table className="prb-table">
                <thead>
                  <tr><th>Order</th><th>Style</th><th>Operator</th><th className="prb-num">Pieces</th><th>Produced</th><th>Waiting</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {queue.map(b => (
                    <React.Fragment key={b.id}>
                      <tr>
                        <td>{b.order_number}</td>
                        <td>{b.style_name}</td>
                        <td>{b.employee_name}</td>
                        <td className="prb-num">{formatNumber(b.pieces_sent, { decimals: 0 })}</td>
                        <td>{formatDate(b.inspection_date)}</td>
                        <td>{b.hours_pending ?? 0} h</td>
                        <td><span className={badge(b.status)}>{b.status === 'underinspection' ? 'Under inspection' : 'Ready'}</span></td>
                        <td>
                          <div className="prb-inline">
                            {b.status === 'readyforinspection' && (
                              <button type="button" className="prb-btn" disabled={busy} onClick={() => start(b)}>Start</button>
                            )}
                            <button type="button" className="prb-btn prb-btn-primary" disabled={busy} onClick={() => openRecord(b)}>Record result</button>
                          </div>
                        </td>
                      </tr>
                      {recording?.id === b.id && (
                        <tr>
                          <td colSpan="8">
                            <div className="prb-form">
                              <label className="prb-field" htmlFor="qc-inspector">Inspector
                                <select id="qc-inspector" value={form.inspectorId} onChange={e => setForm(f => ({ ...f, inspectorId: e.target.value }))}>
                                  <option value="">Not recorded</option>
                                  {inspectors.map(p => <option key={p.EmployeeID} value={p.EmployeeID}>{p.Name}</option>)}
                                </select>
                              </label>
                              <label className="prb-field" htmlFor="qc-inspected">Inspected (max {b.pieces_sent})
                                <input id="qc-inspected" type="number" min="1" max={b.pieces_sent} step="1" value={form.inspected}
                                       onChange={e => setForm(f => ({ ...f, inspected: e.target.value }))} />
                              </label>
                              <label className="prb-field" htmlFor="qc-approved">Approved
                                <input id="qc-approved" type="number" min="0" step="1" value={form.approved}
                                       onChange={e => setForm(f => ({ ...f, approved: e.target.value }))} />
                              </label>
                              <label className="prb-field" htmlFor="qc-rejected">Rejected
                                <input id="qc-rejected" type="number" min="0" step="1" value={form.rejected}
                                       onChange={e => setForm(f => ({ ...f, rejected: e.target.value }))} />
                              </label>
                              <label className="prb-field" htmlFor="qc-reasons">Defects / reasons
                                <input id="qc-reasons" type="text" maxLength="500" value={form.reasons}
                                       onChange={e => setForm(f => ({ ...f, reasons: e.target.value }))} />
                              </label>
                              <div className="prb-form-actions">
                                <button type="button" className="prb-btn prb-btn-primary" disabled={busy} onClick={submit}>Save result</button>
                                <button type="button" className="prb-btn" onClick={() => setRecording(null)}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'reports' && (
        <>
          <div className="prb-cards">
            <div className="prb-card"><div className="prb-card-label">Batches inspected</div><div className="prb-card-value">{totals.batches}</div></div>
            <div className="prb-card"><div className="prb-card-label">Approval rate</div><div className="prb-card-value">{formatPercent(totals.approvalRate)}</div></div>
            <div className="prb-card"><div className="prb-card-label">Rejection rate</div><div className="prb-card-value">{formatPercent(totals.rejectionRate)}</div></div>
          </div>
          <div className="prb-panel">
            <div className="prb-panel-head">
              <h3>Rejection rate by style</h3>
            </div>
            {(dash.rejectionByStyle || []).length === 0 ? <p className="prb-empty">No inspections recorded yet.</p> : (
              <table className="prb-table">
                <thead><tr><th>Style</th><th className="prb-num">Rejected</th></tr></thead>
                <tbody>{dash.rejectionByStyle.map(r => (
                  <tr key={r.style_name}><td>{r.style_name}</td><td className="prb-num">{formatPercent(r.rejection_rate)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="prb-panel">
            <div className="prb-panel-head">
              <h3>Completed inspections</h3>
              <button type="button" className="prb-btn" disabled={!reports.length}
                      onClick={() => downloadCsv('quality-inspections.csv', reports, [
                        ['inspection_date', 'Date'], ['order_number', 'Order'], ['style_name', 'Style'], ['employee_name', 'Operator'],
                        ['inspector_name', 'Inspector'], ['pieces_inspected', 'Inspected'], ['pieces_approved', 'Approved'],
                        ['pieces_rejected', 'Rejected'], ['rejection_rate', 'Rejection %'], ['rejection_reasons', 'Reasons']])}>
                Export CSV
              </button>
            </div>
            {reports.length === 0 ? <p className="prb-empty">No inspections recorded yet.</p> : (
              <div className="prb-table-wrap">
                <table className="prb-table">
                  <thead>
                    <tr><th>Date</th><th>Order</th><th>Style</th><th>Operator</th><th>Inspector</th><th className="prb-num">Inspected</th><th className="prb-num">Approved</th><th className="prb-num">Rejected</th><th>Reasons</th></tr>
                  </thead>
                  <tbody>
                    {reports.map((r, i) => (
                      <tr key={i}>
                        <td>{formatDate(r.inspection_date)}</td><td>{r.order_number}</td><td>{r.style_name}</td>
                        <td>{r.employee_name}</td><td>{r.inspector_name || '—'}</td>
                        <td className="prb-num">{r.pieces_inspected}</td><td className="prb-num">{r.pieces_approved}</td>
                        <td className="prb-num">{r.pieces_rejected} ({formatPercent(r.rejection_rate)})</td>
                        <td>{r.rejection_reasons || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'guidelines' && (
        <div className="prb-panel">
          <h3>Inspection guidelines</h3>
          <ul>
            <li>Claim a batch with <strong>Start</strong> so two inspectors do not inspect the same pieces.</li>
            <li>Count every inspected piece as either approved or rejected — the two must add up to the number inspected.</li>
            <li>Record the defect types for rejected pieces (stitching, measurement, fabric flaw, stains, finishing).</li>
            <li>Approved pieces are added to the style's finished-goods stock item automatically, at the style's material cost.</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default QualityDashboard;
