import React, { useCallback, useEffect, useState } from 'react';
import { productionAPI } from '../../services/api';
import { formatNumber, formatDate, errorMessage } from '../../utils/format';
import './ProductionBoard.css';

/**
 * Planning board: machines, allocations, today's targets and output.
 *
 * Everything goes through productionAPI (the authenticated gateway client).
 * The previous version called the service port directly without a login
 * token, so every request failed and the board looked empty; it also read
 * MachineID/OrderID fields the API did not return, and announced "allocated"
 * even when the database refused.
 */

const SHIFTS = ['Morning', 'Evening', 'Night', 'General'];
const badge = (s) => `prb-badge prb-badge-${String(s || '').toLowerCase().replace(/[^a-z]/g, '')}`;

const PlanningDashboard = ({ embedded = false }) => {
  const [data, setData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  // Which machine has its allocate / target form open.
  const [allocating, setAllocating] = useState(null);
  const [allocForm, setAllocForm] = useState({ employeeId: '', orderId: '', shiftTime: 'Morning' });
  const [targeting, setTargeting] = useState(null);
  const [target, setTarget] = useState('');
  const [record, setRecord] = useState({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dash, today, emps] = await Promise.all([
        productionAPI.getDashboard(), productionAPI.getTodayTasks(), productionAPI.getProductionEmployees()
      ]);
      setData(dash.data.data);
      setTasks(today.data.data || []);
      setEmployees(emps.data.data || []);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the planning board'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Keep the board current on a shared screen; errors stay visible.
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn, success) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ type: 'success', text: success });
      await load();
      return true;
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'The request failed') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const allocate = async (machine) => {
    if (!allocForm.employeeId || !allocForm.orderId) {
      setNotice({ type: 'error', text: 'Choose an employee and a production order' });
      return;
    }
    const ok = await run(() => productionAPI.allocateMachine({
      machineId: machine.MachineID,
      employeeId: Number(allocForm.employeeId),
      orderId: Number(allocForm.orderId),
      shiftTime: allocForm.shiftTime
    }), `${machine.MachineName} allocated`);
    if (ok) { setAllocating(null); setAllocForm({ employeeId: '', orderId: '', shiftTime: 'Morning' }); }
  };

  const release = (machine) => {
    if (!window.confirm(`Release ${machine.MachineName}? It becomes available for another job.`)) return;
    run(() => productionAPI.releaseAllocation(machine.AllocationID), `${machine.MachineName} released`);
  };

  const setTodayTarget = async (machine) => {
    const n = Number(target);
    if (!Number.isInteger(n) || n < 1) { setNotice({ type: 'error', text: 'Target must be a whole number of pieces, at least 1' }); return; }
    const ok = await run(() => productionAPI.createTask({ allocationId: machine.AllocationID, targetPieces: n }),
      `Target of ${n} pieces set for ${machine.MachineName}`);
    if (ok) { setTargeting(null); setTarget(''); }
  };

  const recordOutput = async (task) => {
    const n = Number(record[task.TaskID]);
    const remaining = task.TargetPieces - task.CompletedPieces;
    if (!Number.isInteger(n) || n < 1 || n > remaining) {
      setNotice({ type: 'error', text: `Enter between 1 and ${remaining} pieces` });
      return;
    }
    const ok = await run(() => productionAPI.recordProduction({ taskId: task.TaskID, piecesCompleted: n }),
      `${n} pieces recorded for ${task.EmployeeName}`);
    if (ok) setRecord(r => ({ ...r, [task.TaskID]: '' }));
  };

  if (loading) return <div className={`prb ${embedded ? 'prb-embedded' : ''}`}><div className="prb-state">Loading planning board…</div></div>;
  if (error && !data) {
    return (
      <div className={`prb ${embedded ? 'prb-embedded' : ''}`}>
        <div className="prb-state prb-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="prb-btn" onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      </div>
    );
  }

  const m = data.metrics || {};
  const openOrders = (data.productionOverview || []).filter(o => o.OrderStatus !== 'Completed');

  return (
    <div className={`prb ${embedded ? 'prb-embedded' : ''}`}>
      <div className="prb-header">
        <div>
          {embedded ? <h2>Planning board</h2> : <h1>Production Planning Board</h1>}
          <p className="prb-muted">Machines, operator allocation and today's targets.</p>
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
        <div className="prb-card"><div className="prb-card-label">Available machines</div><div className="prb-card-value">{m.AvailableMachines ?? 0}</div></div>
        <div className="prb-card"><div className="prb-card-label">Occupied machines</div><div className="prb-card-value">{m.OccupiedMachines ?? 0}</div></div>
        <div className="prb-card"><div className="prb-card-label">Pieces made today</div><div className="prb-card-value">{formatNumber(m.TodayProduction ?? 0, { decimals: 0 })}</div></div>
        <div className="prb-card"><div className="prb-card-label">Waiting for inspection</div><div className="prb-card-value">{(m.ReadyForInspection ?? 0) + (m.PendingInspection ?? 0)}</div></div>
      </div>

      <div className="prb-panel">
        <h3>Machines</h3>
        {(data.machineStatus || []).length === 0 ? <p className="prb-empty">No machines set up.</p> : (
          <div className="prb-machines">
            {data.machineStatus.map(mc => (
              <div className="prb-machine" key={mc.MachineID}>
                <div className="prb-machine-head">
                  <strong>{mc.MachineCode} · {mc.MachineName}</strong>
                  <span className={badge(mc.Status)}>{mc.Status}</span>
                </div>
                <span className="prb-muted">{mc.MachineType} · {mc.Location || '—'}</span>
                {mc.AssignedEmployee && <span>{mc.AssignedEmployee} on {mc.CurrentOrder} ({mc.ShiftTime})</span>}

                <div className="prb-machine-actions">
                  {mc.Status === 'Available' && (
                    <button type="button" className="prb-btn prb-btn-primary" disabled={busy}
                            onClick={() => { setAllocating(allocating === mc.MachineID ? null : mc.MachineID); setTargeting(null); }}>
                      Allocate
                    </button>
                  )}
                  {mc.AllocationID && (
                    <>
                      <button type="button" className="prb-btn" disabled={busy}
                              onClick={() => { setTargeting(targeting === mc.MachineID ? null : mc.MachineID); setAllocating(null); }}>
                        Set today's target
                      </button>
                      <button type="button" className="prb-btn prb-btn-danger" disabled={busy} onClick={() => release(mc)}>Release</button>
                    </>
                  )}
                </div>

                {allocating === mc.MachineID && (
                  <div className="prb-form">
                    <label className="prb-field" htmlFor={`emp-${mc.MachineID}`}>Operator
                      <select id={`emp-${mc.MachineID}`} value={allocForm.employeeId}
                              onChange={e => setAllocForm(f => ({ ...f, employeeId: e.target.value }))}>
                        <option value="">Choose…</option>
                        {employees.map(e => (
                          <option key={e.EmployeeID} value={e.EmployeeID}>
                            {e.Name}{e.Status === 'Occupied' ? ` (on ${e.CurrentMachine})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="prb-field" htmlFor={`ord-${mc.MachineID}`}>Production order
                      <select id={`ord-${mc.MachineID}`} value={allocForm.orderId}
                              onChange={e => setAllocForm(f => ({ ...f, orderId: e.target.value }))}>
                        <option value="">Choose…</option>
                        {openOrders.map(o => <option key={o.OrderID} value={o.OrderID}>{o.OrderCode} · {o.StyleName}</option>)}
                      </select>
                    </label>
                    <label className="prb-field" htmlFor={`shift-${mc.MachineID}`}>Shift
                      <select id={`shift-${mc.MachineID}`} value={allocForm.shiftTime}
                              onChange={e => setAllocForm(f => ({ ...f, shiftTime: e.target.value }))}>
                        {SHIFTS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                    <div className="prb-form-actions">
                      <button type="button" className="prb-btn prb-btn-primary" disabled={busy} onClick={() => allocate(mc)}>Allocate</button>
                      <button type="button" className="prb-btn" onClick={() => setAllocating(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {targeting === mc.MachineID && (
                  <div className="prb-form">
                    <label className="prb-field" htmlFor={`target-${mc.MachineID}`}>Pieces to make today
                      <input id={`target-${mc.MachineID}`} type="number" min="1" step="1" value={target}
                             onChange={e => setTarget(e.target.value)} />
                    </label>
                    <div className="prb-form-actions">
                      <button type="button" className="prb-btn prb-btn-primary" disabled={busy} onClick={() => setTodayTarget(mc)}>Save target</button>
                      <button type="button" className="prb-btn" onClick={() => setTargeting(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="prb-panel">
        <h3>Today's tasks</h3>
        {tasks.length === 0 ? <p className="prb-empty">No targets set for today. Set one from an occupied machine above.</p> : (
          <div className="prb-table-wrap">
            <table className="prb-table">
              <thead>
                <tr><th>Operator</th><th>Machine</th><th>Order</th><th>Style</th><th className="prb-num">Target</th><th className="prb-num">Done</th><th>Status</th><th>Record output</th></tr>
              </thead>
              <tbody>
                {tasks.map(t => {
                  const remaining = t.TargetPieces - t.CompletedPieces;
                  return (
                    <tr key={t.TaskID}>
                      <td>{t.EmployeeName}</td>
                      <td>{t.MachineName}</td>
                      <td>{t.OrderCode}</td>
                      <td>{t.StyleName}</td>
                      <td className="prb-num">{formatNumber(t.TargetPieces, { decimals: 0 })}</td>
                      <td className="prb-num">{formatNumber(t.CompletedPieces, { decimals: 0 })}</td>
                      <td><span className={badge(t.Status)}>{t.Status}</span></td>
                      <td>
                        {remaining > 0 ? (
                          <div className="prb-inline">
                            <label htmlFor={`rec-${t.TaskID}`} className="sr-only">Pieces for {t.EmployeeName}</label>
                            <input id={`rec-${t.TaskID}`} type="number" min="1" max={remaining} step="1"
                                   placeholder={`≤ ${remaining}`} value={record[t.TaskID] || ''}
                                   onChange={e => setRecord(r => ({ ...r, [t.TaskID]: e.target.value }))} />
                            <button type="button" className="prb-btn" disabled={busy} onClick={() => recordOutput(t)}>Record</button>
                          </div>
                        ) : <span className="prb-muted">Target met</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="prb-panel">
        <h3>Today's production</h3>
        {(data.todayProduction || []).length === 0 ? <p className="prb-empty">Nothing recorded today yet.</p> : (
          <div className="prb-table-wrap">
            <table className="prb-table">
              <thead><tr><th>Operator</th><th>Machine</th><th>Order</th><th>Style</th><th className="prb-num">Pieces</th><th>Quality</th></tr></thead>
              <tbody>
                {data.todayProduction.map((r, i) => (
                  <tr key={i}>
                    <td>{r.EmployeeName}</td><td>{r.MachineName}</td><td>{r.OrderCode}</td><td>{r.StyleName}</td>
                    <td className="prb-num">{formatNumber(r.TotalPieces, { decimals: 0 })}</td>
                    <td><span className={badge(r.QualityStatus)}>{r.QualityStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="prb-panel">
        <h3>Production orders</h3>
        {openOrders.length === 0 ? <p className="prb-empty">No open production orders.</p> : (
          <div className="prb-table-wrap">
            <table className="prb-table">
              <thead><tr><th>Order</th><th>Client</th><th>Style</th><th className="prb-num">Done / total</th><th>Progress</th><th>Deadline</th><th>Priority</th></tr></thead>
              <tbody>
                {openOrders.map(o => {
                  const pct = Number(o.CompletionPercentage) || 0;
                  return (
                    <tr key={o.OrderID}>
                      <td>{o.OrderCode}</td><td>{o.ClientName}</td><td>{o.StyleName}</td>
                      <td className="prb-num">{formatNumber(o.CompletedQuantity, { decimals: 0 })} / {formatNumber(o.TotalQuantity, { decimals: 0 })}</td>
                      <td>
                        <div className="prb-progress" role="img" aria-label={`${pct.toFixed(0)}% complete`}>
                          <span style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </td>
                      <td>{o.DeadlineDate ? formatDate(String(o.DeadlineDate).slice(0, 10)) : '—'}
                        {o.DaysRemaining !== null && o.DaysRemaining !== undefined && (
                          <span className="prb-muted"> ({o.DaysRemaining < 0 ? `${-o.DaysRemaining} days late` : `${o.DaysRemaining} days left`})</span>
                        )}
                      </td>
                      <td>{o.Priority}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanningDashboard;
