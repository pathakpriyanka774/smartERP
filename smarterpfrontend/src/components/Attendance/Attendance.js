import React, { useState, useEffect, useCallback } from 'react';
import { attendanceAPI } from '../../services/api';
import { formatDate, todayIST, monthIST } from '../../utils/format';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import './Attendance.css';

const STATUSES = ['present', 'late', 'half-day', 'leave', 'absent'];
// Dates in IST: the UTC date is yesterday's for the first 5½ hours of the day.
const today = () => todayIST();
const firstOfMonth = () => `${monthIST()}-01`;

/** Attendance records for a period, paged and searched on the server. */
const RecordsList = ({ range }) => {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(params => attendanceAPI.getRecords(params), {
    pageSize: 100,
    filters: { from: range.from, to: range.to, employeeId, status }
  });
  const records = list.rows;

  useEffect(() => {
    let live = true;
    attendanceAPI.getEmployees()
      .then(res => { if (live) setEmployees(res.data.data || []); })
      .catch(() => { if (live) setEmployees([]); });   // the filter is optional
    return () => { live = false; };
  }, []);

  return (
    <div className="attendance-section">
      <div className="section-header">
        <h2>Attendance Records</h2>
        <div className="attendance-filters">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Name, code, department"
            label="Search attendance records" />
          <label htmlFor="att-employee-filter" className="att-sr-only">Employee</label>
          <select id="att-employee-filter" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">All employees</option>
            {employees.map(e => (
              <option key={e.id} value={String(e.id)}>{e.name}{e.code ? ` (${e.code})` : ''}</option>
            ))}
          </select>
          <label htmlFor="att-status-filter" className="att-sr-only">Status</label>
          <select id="att-status-filter" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>
      </div>
      {list.error ? (
        <div className="notice error" role="alert">
          {list.error}{' '}
          <button type="button" className="refresh-btn" onClick={list.reload}>Retry</button>
        </div>
      ) : list.loading && records.length === 0 ? (
        <p className="empty-state" role="status">Loading records…</p>
      ) : records.length === 0 ? (
        <p className="empty-state">
          {list.query.trim() || employeeId || status ? 'No records match your search or filter.' : 'No attendance recorded in this period.'}
        </p>
      ) : (
        <table className="attendance-table">
          <thead>
            <tr>
              <th scope="col">Date</th><th scope="col">Code</th><th scope="col">Employee</th><th scope="col">Department</th>
              <th scope="col">In</th><th scope="col">Out</th><th scope="col">Hours</th><th scope="col">Status</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                <td>{formatDate(r.date)}</td>
                <td>{r.employeeCode}</td>
                <td>{r.employeeName}</td>
                <td>{r.department}</td>
                <td>{r.checkIn || '—'}</td>
                <td>{r.checkOut || '—'}</td>
                <td>{r.totalHours ? Number(r.totalHours).toFixed(2) : '—'}</td>
                <td><span className={`status ${r.status}`}>{r.status}</span></td>
                <td>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="records" />
    </div>
  );
};

const Attendance = () => {
  const [activeTab, setActiveTab] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(today());
  const [range, setRange] = useState({ from: firstOfMonth(), to: today() });
  // The records list follows the range only when "Apply" is pressed.
  const [recordsRange, setRecordsRange] = useState(() => ({ from: firstOfMonth(), to: today() }));

  const [roster, setRoster] = useState([]);
  const [stats, setStats] = useState({});
  const [summary, setSummary] = useState([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);   // employeeId whose action is in flight
  const [notice, setNotice] = useState(null);
  const [policy, setPolicy] = useState(null);

  // Server-side failures must surface in the UI; a silent catch here would let
  // the screen show a stale roster as if the save had worked.
  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };
  const errText = (err, fallback) =>
    err?.response?.data?.message || err?.message || fallback;
  const res_data = (res) => res.data.data;

  const loadDaily = useCallback(async () => {
    setLoading(true);
    try {
      const [dailyRes, statsRes] = await Promise.all([
        attendanceAPI.getDaily(selectedDate),
        attendanceAPI.getStats(selectedDate)
      ]);
      setRoster(dailyRes.data.data || []);
      setStats(statsRes.data.data || {});
    } catch (err) {
      flash('error', errText(err, 'Could not load attendance'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getSummary(range.from, range.to);
      setSummary(res.data.data || []);
    } catch (err) {
      flash('error', errText(err, 'Could not load summary'));
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    attendanceAPI.getPolicy()
      .then(res => setPolicy(res.data.data))
      .catch(() => setPolicy(null));   // a missing policy just hides the hint
  }, []);

  useEffect(() => {
    if (activeTab === 'daily') loadDaily();
    if (activeTab === 'summary') loadSummary();
  }, [activeTab, loadDaily, loadSummary]);

  const handleCheckIn = async (employeeId) => {
    setBusy(employeeId);
    try {
      const { checkIn, status } = res_data(await attendanceAPI.checkIn({ employeeId, date: selectedDate }));
      flash(status === 'late' ? 'warn' : 'success',
            `Checked in at ${checkIn} — marked ${status}`);
      await loadDaily();
    } catch (err) {
      flash('error', errText(err, 'Check-in failed'));
    } finally {
      setBusy(null);
    }
  };

  const handleCheckOut = async (employeeId) => {
    setBusy(employeeId);
    try {
      const { checkOut, totalHours, status } = res_data(await attendanceAPI.checkOut({ employeeId, date: selectedDate }));
      flash('success', `Checked out at ${checkOut} — ${totalHours} h, ${status}`);
      await loadDaily();
    } catch (err) {
      flash('error', errText(err, 'Check-out failed'));
    } finally {
      setBusy(null);
    }
  };

  const handleMark = async (employeeId, status) => {
    setBusy(employeeId);
    try {
      await attendanceAPI.mark({ employeeId, date: selectedDate, status });
      flash('success', `Marked ${status}`);
      await loadDaily();
    } catch (err) {
      flash('error', errText(err, 'Could not mark attendance'));
    } finally {
      setBusy(null);
    }
  };

  const renderDaily = () => (
    <>
      <div className="attendance-toolbar">
        <label>
          Date
          <input
            type="date"
            value={selectedDate}
            max={today()}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
        <button className="refresh-btn" onClick={loadDaily} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {policy && (
          <span className="policy-hint">Check-in after {policy.lateAfter} counts as late</span>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card"><h3>Employees</h3><div className="stat-value">{stats.totalEmployees ?? 0}</div></div>
        <div className="stat-card"><h3>Present</h3><div className="stat-value present">{stats.present ?? 0}</div></div>
        <div className="stat-card"><h3>Late</h3><div className="stat-value late">{stats.late ?? 0}</div></div>
        <div className="stat-card"><h3>Absent</h3><div className="stat-value absent">{stats.absent ?? 0}</div></div>
        <div className="stat-card"><h3>On Leave</h3><div className="stat-value leave">{stats.onLeave ?? 0}</div></div>
        <div className="stat-card"><h3>Unmarked</h3><div className="stat-value unmarked">{stats.unmarked ?? 0}</div></div>
      </div>

      <div className="attendance-section">
        <div className="section-header">
          <h2>Daily Register</h2>
          <span className="hours-total">{Number(stats.totalHours ?? 0).toFixed(2)} hours logged</span>
        </div>

        {roster.length === 0 ? (
          <p className="empty-state">
            No active employees yet. Add employees in the Payroll module and they will appear here.
          </p>
        ) : (
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Code</th><th>Employee</th><th>Department</th>
                <th>In</th><th>Out</th><th>Hours</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(r => (
                <tr key={r.employeeId}>
                  <td>{r.employeeCode}</td>
                  <td>{r.employeeName}</td>
                  <td>{r.department}</td>
                  <td>{r.checkIn || '—'}</td>
                  <td>{r.checkOut || '—'}</td>
                  <td>{r.totalHours ? Number(r.totalHours).toFixed(2) : '—'}</td>
                  <td>
                    <span className={`status ${r.status || 'unmarked'}`}>
                      {r.status || 'unmarked'}
                    </span>
                  </td>
                  <td className="actions">
                    {/* Driven by the recorded times, not by whether a row exists:
                        a day marked absent has a row but no check-in, and must
                        still offer Check in. */}
                    {!r.checkIn && (
                      <button
                        className="btn primary"
                        disabled={busy === r.employeeId}
                        onClick={() => handleCheckIn(r.employeeId)}
                      >
                        Check in
                      </button>
                    )}
                    {r.checkIn && !r.checkOut && (
                      <button
                        className="btn accent"
                        disabled={busy === r.employeeId}
                        onClick={() => handleCheckOut(r.employeeId)}
                      >
                        Check out
                      </button>
                    )}
                    {r.checkIn && r.checkOut && (
                      <span className="done">✓ {Number(r.totalHours || 0).toFixed(2)} h</span>
                    )}
                    <select
                      className="status-select"
                      value=""
                      disabled={busy === r.employeeId}
                      onChange={(e) => e.target.value && handleMark(r.employeeId, e.target.value)}
                    >
                      <option value="">Mark…</option>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  const renderRangePicker = (onApply) => (
    <div className="attendance-toolbar">
      <label>From
        <input type="date" value={range.from} max={range.to}
               onChange={(e) => setRange({ ...range, from: e.target.value })} />
      </label>
      <label>To
        <input type="date" value={range.to} min={range.from} max={today()}
               onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </label>
      <button className="refresh-btn" onClick={onApply} disabled={loading}>
        {loading ? 'Loading…' : 'Apply'}
      </button>
    </div>
  );

  const renderSummary = () => (
    <>
      {renderRangePicker(loadSummary)}
      <div className="attendance-section">
        <div className="section-header"><h2>Per-Employee Summary</h2></div>
        {summary.length === 0 ? (
          <p className="empty-state">No employees to summarise for this period.</p>
        ) : (
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Code</th><th>Employee</th><th>Department</th><th>Recorded</th>
                <th>Present</th><th>Late</th><th>Half</th><th>Leave</th><th>Absent</th>
                <th>Hours</th><th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.employeeId}>
                  <td>{s.employeeCode}</td>
                  <td>{s.employeeName}</td>
                  <td>{s.department}</td>
                  <td>{s.daysRecorded}</td>
                  <td>{s.daysPresent}</td>
                  <td>{s.daysLate}</td>
                  <td>{s.daysHalf}</td>
                  <td>{s.daysLeave}</td>
                  <td>{s.daysAbsent}</td>
                  <td>{Number(s.totalHours ?? 0).toFixed(2)}</td>
                  <td className={
                    s.attendanceRate == null ? ''
                      : s.attendanceRate >= 90 ? 'rate-high'
                      : s.attendanceRate >= 75 ? 'rate-mid' : 'rate-low'
                  }>
                    {/* null means nothing recorded, which is not the same as 0% */}
                    {s.attendanceRate == null ? '—' : `${Number(s.attendanceRate).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );

  const renderRecords = () => (
    <>
      {renderRangePicker(() => setRecordsRange({ ...range }))}
      <RecordsList range={recordsRange} />
    </>
  );

  return (
    <div className="attendance">
      <h1>Employee Attendance</h1>

      {notice && <div className={`notice ${notice.type}`}>{notice.text}</div>}

      <div className="attendance-tabs">
        {[['daily', 'Daily Register'], ['summary', 'Summary'], ['records', 'Records']].map(([id, label]) => (
          <button
            key={id}
            className={`tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'daily' && renderDaily()}
      {activeTab === 'summary' && renderSummary()}
      {activeTab === 'records' && renderRecords()}
    </div>
  );
};

export default Attendance;
