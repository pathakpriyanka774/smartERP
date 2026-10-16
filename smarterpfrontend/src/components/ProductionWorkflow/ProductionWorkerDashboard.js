import React, { useCallback, useEffect, useState } from 'react';
import { productionAPI } from '../../services/api';
import { formatNumber, formatDate, todayIST, errorMessage } from '../../utils/format';
import '../ProductionPlanning/ProductionBoard.css';

/**
 * Shop-floor screen: today's targets and recording finished pieces.
 *
 * Built for phones and tablets on the factory floor (large buttons). Uses
 * productionAPI with the logged-in user's token; it previously called the
 * service port without one, so it always showed "No tasks", and it greeted
 * everyone as a hard-coded "John Doe".
 */

const currentUser = () => {
  try { return JSON.parse(localStorage.getItem('currentUser')) || null; } catch { return null; }
};

const ProductionWorkerDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);           // task id being saved
  const [pieces, setPieces] = useState({});
  const user = currentUser();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await productionAPI.getTodayTasks();
      setTasks(res.data.data || []);
    } catch (err) {
      setError(errorMessage(err, "Could not load today's tasks"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const record = async (task) => {
    const n = Number(pieces[task.TaskID]);
    const remaining = task.TargetPieces - task.CompletedPieces;
    if (!Number.isInteger(n) || n < 1 || n > remaining) {
      setNotice({ type: 'error', text: `Enter between 1 and ${remaining} pieces` });
      return;
    }
    setBusy(task.TaskID);
    setNotice(null);
    try {
      await productionAPI.recordProduction({ taskId: task.TaskID, piecesCompleted: n });
      setNotice({ type: 'success', text: `${n} pieces recorded on ${task.MachineName}` });
      setPieces(p => ({ ...p, [task.TaskID]: '' }));
      load();
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err, 'Could not record the pieces') });
    } finally {
      setBusy(null);
    }
  };

  const totalTarget = tasks.reduce((a, t) => a + t.TargetPieces, 0);
  const totalDone = tasks.reduce((a, t) => a + t.CompletedPieces, 0);
  const sorted = [...tasks].sort((a, b) => String(a.MachineName).localeCompare(String(b.MachineName)));

  return (
    <div className="prb">
      <div className="prb-header">
        <div>
          <h1>Today on the floor</h1>
          <p className="prb-muted">
            {user?.name ? `Signed in as ${user.name}. ` : ''}{formatDate(todayIST())} · Tasks for the whole floor are shown,
            because user accounts are not yet linked to employee records.
          </p>
        </div>
        <button type="button" className="prb-btn" onClick={load}>Refresh</button>
      </div>

      {notice && (
        <div className={`prb-notice prb-notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="prb-state">Loading today's tasks…</div>
      ) : error ? (
        <div className="prb-state prb-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="prb-btn" onClick={load}>Try again</button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="prb-state">No targets have been set for today yet. Your supervisor sets them on the planning board.</div>
      ) : (
        <>
          <div className="prb-cards">
            <div className="prb-card"><div className="prb-card-label">Tasks</div><div className="prb-card-value">{tasks.length}</div></div>
            <div className="prb-card"><div className="prb-card-label">Target</div><div className="prb-card-value">{formatNumber(totalTarget, { decimals: 0 })}</div></div>
            <div className="prb-card"><div className="prb-card-label">Done</div><div className="prb-card-value">{formatNumber(totalDone, { decimals: 0 })}</div></div>
            <div className="prb-card"><div className="prb-card-label">Progress</div><div className="prb-card-value">{totalTarget ? Math.round((totalDone / totalTarget) * 100) : 0}%</div></div>
          </div>

          <div className="prb-worker-tasks">
            {sorted.map(t => {
              const remaining = t.TargetPieces - t.CompletedPieces;
              const pct = t.TargetPieces ? Math.min((t.CompletedPieces / t.TargetPieces) * 100, 100) : 0;
              return (
                <div className="prb-worker-task" key={t.TaskID}>
                  <h3>{t.MachineName}</h3>
                  <span className="prb-muted">{t.EmployeeName} · {t.OrderCode} · {t.StyleName} · {t.ShiftTime}</span>
                  <div className="prb-worker-figures">
                    <span>Done <strong>{formatNumber(t.CompletedPieces, { decimals: 0 })}</strong></span>
                    <span>Target <strong>{formatNumber(t.TargetPieces, { decimals: 0 })}</strong></span>
                  </div>
                  <div className="prb-progress" role="img" aria-label={`${Math.round(pct)}% of target`}>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  {remaining > 0 ? (
                    <div className="prb-worker-record">
                      <label htmlFor={`pcs-${t.TaskID}`} className="sr-only">Pieces finished on {t.MachineName}</label>
                      <input id={`pcs-${t.TaskID}`} type="number" inputMode="numeric" min="1" max={remaining} step="1"
                             placeholder={`Pieces (≤ ${remaining})`} value={pieces[t.TaskID] || ''}
                             onChange={e => setPieces(p => ({ ...p, [t.TaskID]: e.target.value }))} />
                      <button type="button" className="prb-btn prb-btn-primary" disabled={busy === t.TaskID} onClick={() => record(t)}>
                        {busy === t.TaskID ? 'Saving…' : 'Record'}
                      </button>
                    </div>
                  ) : (
                    <strong style={{ color: '#146B3A' }}>Target met ✓</strong>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ProductionWorkerDashboard;
