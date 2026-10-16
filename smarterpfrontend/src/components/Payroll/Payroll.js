import React, { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../services/api';
import {
  formatMoney, formatMoneyCompact, formatNumber, formatDate, formatDateTime, formatMonth, monthIST, todayIST, errorMessage
} from '../../utils/format';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import './Payroll.css';

const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', paid: 'Paid', cancelled: 'Cancelled' };
const PAYMENT_METHODS = [['bank', 'Bank transfer'], ['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque']];
const METHOD_LABELS = Object.fromEntries(PAYMENT_METHODS);
const DEPARTMENTS = [
  ['Production', 'Production'], ['Quality', 'Quality'], ['HR', 'Human Resources'],
  ['Finance', 'Finance'], ['IT', 'Information Technology'], ['Sales', 'Sales & Marketing']
];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const days = (n) => formatNumber(n ?? 0, { decimals: 1 });
const amountOrUndefined = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/** A modal dialog with a labelled heading. */
const Modal = ({ title, titleId, onClose, children, className = '' }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay">
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
};

/** Payslip for one payroll, printable on its own. */
const PayslipModal = ({ payrollId, onClose }) => {
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    payrollAPI.getPayslip(payrollId)
      .then(res => { if (live) setSlip(res.data.data); })
      .catch(err => { if (live) setError(errorMessage(err, 'Could not load the payslip')); });
    return () => { live = false; };
  }, [payrollId]);

  // Print styles apply only while a payslip is open, so other pages print normally.
  useEffect(() => {
    document.body.classList.add('printing-payslip');
    return () => document.body.classList.remove('printing-payslip');
  }, []);

  const a = slip?.attendance || {};
  return (
    <Modal title="Payslip" titleId="payslip-title" onClose={onClose} className="large-modal payslip-modal">
      {error && <div className="payroll-notice error" role="alert">{error}</div>}
      {!slip && !error && <p role="status">Loading payslip…</p>}
      {slip && (
        <article className="payslip" aria-label={`Payslip for ${slip.employee?.name}, ${formatMonth(slip.month)}`}>
          <header className="payslip-head">
            <div>
              <h4 className="payslip-company">{slip.company?.name || 'Company'}</h4>
              {slip.company?.address && <p className="payslip-muted">{slip.company.address}</p>}
            </div>
            <div className="payslip-title">
              <strong>Payslip</strong>
              <span>{formatMonth(slip.month)}</span>
              <span className={`status ${slip.status}`}>{STATUS_LABELS[slip.status] || slip.status}</span>
            </div>
          </header>

          <dl className="payslip-grid">
            <div><dt>Employee</dt><dd>{slip.employee?.name || '—'}</dd></div>
            <div><dt>Employee code</dt><dd>{slip.employee?.code || '—'}</dd></div>
            <div><dt>Position</dt><dd>{slip.employee?.position || '—'}</dd></div>
            <div><dt>Department</dt><dd>{slip.employee?.department || '—'}</dd></div>
            <div><dt>Date of joining</dt><dd>{formatDate(slip.employee?.joiningDate)}</dd></div>
            <div><dt>Paid on</dt><dd>{slip.paidAt ? `${formatDateTime(slip.paidAt)} (${METHOD_LABELS[slip.paymentMethod] || slip.paymentMethod || '—'})` : 'Not paid yet'}</dd></div>
          </dl>

          <h5>Attendance</h5>
          <table className="payslip-table">
            <thead>
              <tr>
                <th scope="col">Calendar days</th><th scope="col">Paid days</th><th scope="col">Present</th>
                <th scope="col">Half days</th><th scope="col">Paid leave</th><th scope="col">Absent</th>
                <th scope="col">Not marked</th><th scope="col">Before joining</th><th scope="col">Loss of pay</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{a.calendarDays ?? '—'}</td><td>{days(a.paidDays)}</td><td>{days(a.presentDays)}</td>
                <td>{a.halfDays ?? 0}</td><td>{a.leaveDays ?? 0}</td><td>{a.absentDays ?? 0}</td>
                <td>{a.unmarkedDays ?? 0}</td><td>{a.preJoiningDays ?? 0}</td><td>{days(a.lopDays)}</td>
              </tr>
            </tbody>
          </table>

          <div className="payslip-columns">
            <table className="payslip-table">
              <thead><tr><th scope="col">Earnings</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {(slip.earnings || []).map(l => (
                  <tr key={l.label}><td>{l.label}</td><td className="num">{formatMoney(l.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Gross pay</th><td className="num"><strong>{formatMoney(slip.grossPay)}</strong></td></tr></tfoot>
            </table>
            <table className="payslip-table">
              <thead><tr><th scope="col">Deductions</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {(slip.deductionLines || []).length === 0 && <tr><td colSpan="2">No deductions</td></tr>}
                {(slip.deductionLines || []).map(l => (
                  <tr key={l.label}><td>{l.label}</td><td className="num">{formatMoney(l.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Total deductions</th><td className="num"><strong>{formatMoney(slip.totalDeductions)}</strong></td></tr></tfoot>
            </table>
          </div>

          <div className="payslip-net">
            <span>Net pay</span>
            <strong>{formatMoney(slip.netSalary)}</strong>
          </div>
          {slip.netInWords && <p className="payslip-words">{slip.netInWords}</p>}
          {slip.policy && <p className="payslip-policy"><strong>Pay policy:</strong> {slip.policy}</p>}
          <p className="payslip-muted">This is a computer-generated payslip.</p>
        </article>
      )}
      <div className="form-actions no-print">
        <button type="button" className="btn-primary" onClick={() => window.print()} disabled={!slip}>Print</button>
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};

const Payroll = () => {
  const [activeTab, setActiveTab] = useState('employees');
  const [stats, setStats] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingEmployee, setEditingEmployee] = useState(null);
  // Errors are shown, not just logged: a failed save used to leave the form
  // open with no explanation.
  const [notice, setNotice] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [genMonth, setGenMonth] = useState(monthIST());

  // Employee list filters.
  const [department, setDepartment] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  // Payroll list filters.
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Active employees for the manual-entry picker (one large page).
  const [pickerEmployees, setPickerEmployees] = useState([]);

  // Row dialogs.
  const [amountsFor, setAmountsFor] = useState(null);   // payroll whose amounts are edited
  const [amounts, setAmounts] = useState({ allowances: '', deductions: '', tds: '' });
  const [payFor, setPayFor] = useState(null);           // payroll being marked paid
  const [payment, setPayment] = useState({ method: 'bank', date: '' });
  const [dialogError, setDialogError] = useState(null);
  const [payslipId, setPayslipId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const employeesList = usePagedList(params => payrollAPI.getEmployees(params), {
    pageSize: 50,
    filters: { department, includeInactive: includeInactive ? 'true' : '' }
  });
  const payrollsList = usePagedList(params => payrollAPI.getPayrolls(params), {
    pageSize: 50,
    filters: { month: MONTH_RE.test(monthFilter) ? monthFilter : '', status: statusFilter }
  });
  const employees = employeesList.rows;
  const payrolls = payrollsList.rows;

  const loadStats = useCallback(async () => {
    try {
      const statsRes = await payrollAPI.getStats();
      setStats(statsRes.data || {});
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not load payroll data') });
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const reloadEmployees = employeesList.reload;
  const reloadPayrolls = payrollsList.reload;
  const loadData = useCallback(
    () => Promise.all([reloadEmployees(), reloadPayrolls(), loadStats()]),
    [reloadEmployees, reloadPayrolls, loadStats]
  );

  const loadPicker = async () => {
    try {
      const res = await payrollAPI.getEmployees({ pageSize: 500 });
      setPickerEmployees(res.data.data || []);
    } catch (error) {
      setFormError(errorMessage(error, 'Could not load employees'));
    }
  };

  const openForm = () => {
    setFormError(null);
    setShowForm(true);
    if (activeTab === 'payroll') loadPicker();
  };

  const closeForm = useCallback(() => {
    setShowForm(false);
    setFormData({});
    setEditingEmployee(null);
    setFormError(null);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;   // no double submission
    setSaving(true);
    setFormError(null);
    try {
      if (activeTab === 'employees') {
        if (editingEmployee) {
          await payrollAPI.updateEmployee(editingEmployee.id, formData);
        } else {
          await payrollAPI.createEmployee(formData);
        }
        setNotice({ type: 'success', text: editingEmployee ? 'Employee updated' : 'Employee onboarded' });
      } else {
        await payrollAPI.createPayroll(formData);
        setNotice({ type: 'success', text: 'Payroll entry created and calculated from attendance' });
      }
      closeForm();
      loadData();
    } catch (error) {
      setFormError(errorMessage(error, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormError(null);
    setFormData({
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      position: employee.position,
      department: employee.department,
      // The API returns joiningDate (camelCase). Reading JoiningDate left this
      // blank, and saving then erased the employee's joining date.
      joiningDate: employee.joiningDate ? String(employee.joiningDate).slice(0, 10) : '',
      baseSalary: employee.baseSalary,
      ctc: employee.ctc,
      tasks: employee.tasks,
      address: employee.address,
      emergencyContact: employee.emergencyContact
    });
    setShowForm(true);
  };

  const autoGeneratePayroll = async () => {
    if (!MONTH_RE.test(genMonth)) {
      setNotice({ type: 'error', text: 'Choose the month to generate (YYYY-MM)' });
      return;
    }
    setSaving(true);
    try {
      const response = await payrollAPI.autoGeneratePayroll(genMonth);
      setNotice({ type: 'success', text: response.data.message });
      loadData();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not generate payroll') });
    } finally {
      setSaving(false);
    }
  };

  const recalculateMonth = async () => {
    if (!MONTH_RE.test(genMonth)) {
      setNotice({ type: 'error', text: 'Choose the month to recalculate (YYYY-MM)' });
      return;
    }
    setSaving(true);
    try {
      const response = await payrollAPI.recalculateMonth(genMonth);
      setNotice({ type: 'success', text: response.data.message || `Recalculated pending payrolls for ${formatMonth(genMonth)}` });
      loadData();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not recalculate payrolls') });
    } finally {
      setSaving(false);
    }
  };

  const recalculateOne = async (pay) => {
    setBusyId(pay.id);
    try {
      await payrollAPI.recalculate(pay.id);
      setNotice({ type: 'success', text: `${pay.employee?.name}'s ${formatMonth(pay.month)} payroll recalculated from attendance` });
      loadData();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not recalculate the payroll') });
    } finally {
      setBusyId(null);
    }
  };

  // Approve, or move an approved payroll back to pending. Only the status is
  // sent, so allowances and deductions are never touched.
  const updatePayrollStatus = async (pay, status) => {
    const question = status === 'approved'
      ? `Approve ${pay.employee?.name}'s ${formatMonth(pay.month)} payroll of ${formatMoney(pay.netSalary)}?\n\n`
        + 'This posts the salary expense and the amounts owed (net pay, PF, ESI, professional tax, TDS) to the ledger, '
        + 'and locks the amounts.'
      : `Move ${pay.employee?.name}'s ${formatMonth(pay.month)} payroll back to pending?\n\n`
        + 'Its ledger entry is reversed so the amounts can be corrected.';
    if (!window.confirm(question)) return;
    setBusyId(pay.id);
    try {
      await payrollAPI.updatePayroll(pay.id, { status });
      setNotice({ type: 'success', text: `Payroll marked ${STATUS_LABELS[status].toLowerCase()}` });
      loadData();
    } catch (error) {
      setNotice({ type: 'error', text: errorMessage(error, 'Could not update the payroll') });
    } finally {
      setBusyId(null);
    }
  };

  const openAmounts = (pay) => {
    setDialogError(null);
    setAmounts({ allowances: pay.allowances ?? '', deductions: pay.deductions ?? '', tds: pay.tds ?? '' });
    setAmountsFor(pay);
  };
  const closeAmounts = useCallback(() => setAmountsFor(null), []);

  const saveAmounts = async (e) => {
    e.preventDefault();
    if (saving) return;
    const body = {
      allowances: amountOrUndefined(amounts.allowances) ?? 0,
      deductions: amountOrUndefined(amounts.deductions) ?? 0,
      tds: amountOrUndefined(amounts.tds) ?? 0
    };
    if (Object.values(body).some(v => Number.isNaN(v) || v < 0)) {
      setDialogError('Amounts must be zero or more.');
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await payrollAPI.updatePayroll(amountsFor.id, body);
      setNotice({ type: 'success', text: `${amountsFor.employee?.name}'s payroll updated and recalculated` });
      setAmountsFor(null);
      loadData();
    } catch (error) {
      // 409: no longer pending (approved elsewhere); 400/500: e.g. deductions exceed gross pay.
      setDialogError(errorMessage(error, 'Could not save the amounts'));
    } finally {
      setSaving(false);
    }
  };

  const openPay = (pay) => {
    setDialogError(null);
    setPayment({ method: 'bank', date: todayIST() });
    setPayFor(pay);
  };
  const closePay = useCallback(() => setPayFor(null), []);

  const savePayment = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (payment.date && payment.date > todayIST()) {
      setDialogError('The payment date cannot be in the future.');
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      const body = { status: 'paid', paymentMethod: payment.method };
      if (payment.date) body.paymentDate = payment.date;
      await payrollAPI.updatePayroll(payFor.id, body);
      setNotice({ type: 'success', text: `${payFor.employee?.name}'s ${formatMonth(payFor.month)} salary of ${formatMoney(payFor.netSalary)} marked paid` });
      setPayFor(null);
      loadData();
    } catch (error) {
      setDialogError(errorMessage(error, 'Could not mark the payroll paid'));
    } finally {
      setSaving(false);
    }
  };

  const closePayslip = useCallback(() => setPayslipId(null), []);

  const field = (name, { number = false } = {}) => ({
    value: formData[name] ?? '',
    onChange: (e) => setFormData({
      ...formData,
      [name]: number ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value
    })
  });

  const renderEmployees = () => (
    <div className="employees-section">
      <div className="section-header">
        <h3>👤 Employee Directory</h3>
        <button type="button" className="btn-primary" onClick={openForm}>
          + Onboard Employee
        </button>
      </div>

      <div className="payroll-filter">
        <SearchBox value={employeesList.query} onChange={employeesList.setQuery}
          placeholder="Name, code, position, department" label="Search employees" />
        <label htmlFor="emp-dept-filter">Department</label>
        <select id="emp-dept-filter" value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {DEPARTMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="payroll-check">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Include inactive
        </label>
      </div>

      {employeesList.error && <div className="payroll-notice error" role="alert">{employeesList.error}</div>}
      <div className="table-container">
        <table className="payroll-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Position</th>
              <th scope="col">Department</th>
              <th scope="col">Joining Date</th>
              <th scope="col">Base Salary</th>
              <th scope="col">CTC</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan="9" className="payroll-empty">
                  {employeesList.loading ? 'Loading…'
                    : employeesList.query || department ? 'No employees match your search or filter.'
                      : 'No employees found. Add an employee to get started.'}
                </td>
              </tr>
            ) : (
              employees.map(emp => (
                <tr key={emp.id}>
                  <td>
                    <div className="employee-info">
                      <strong>{emp.name}</strong>
                      <small>{[emp.employeeCode, emp.phone].filter(Boolean).join(' · ')}</small>
                    </div>
                  </td>
                  <td>{emp.email}</td>
                  <td>{emp.position}</td>
                  <td>{emp.department}</td>
                  <td>{formatDate(emp.joiningDate)}</td>
                  <td>{formatMoney(emp.baseSalary)}</td>
                  <td>{formatMoney(emp.ctc)}</td>
                  <td><span className={`status ${emp.status}`}>{emp.status}</span></td>
                  <td>
                    <button type="button" className="btn-edit" onClick={() => handleEdit(emp)}
                      aria-label={`Edit ${emp.name}`}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination pagination={employeesList.pagination} onPage={employeesList.setPage}
        disabled={employeesList.loading} label="employees" />
    </div>
  );

  const renderPayrollActions = (pay) => {
    const busy = busyId === pay.id || saving;
    const who = `${pay.employee?.name || 'employee'} ${formatMonth(pay.month)}`;
    return (
      <td className="payroll-row-actions">
        <button type="button" className="btn-edit" onClick={() => setPayslipId(pay.id)} aria-label={`Payslip for ${who}`}>
          Payslip
        </button>
        {pay.status === 'pending' && (
          <>
            <button type="button" className="btn-edit" onClick={() => openAmounts(pay)} disabled={busy}
              aria-label={`Edit allowances, deductions and TDS for ${who}`}>
              Edit amounts
            </button>
            <button type="button" className="btn-edit" onClick={() => recalculateOne(pay)} disabled={busy}
              aria-label={`Recalculate ${who} from attendance`} title="Recalculate from attendance">
              Recalculate
            </button>
            <button type="button" className="btn-secondary" onClick={() => updatePayrollStatus(pay, 'approved')} disabled={busy}>
              Approve
            </button>
          </>
        )}
        {pay.status === 'approved' && (
          <button type="button" className="btn-secondary" onClick={() => updatePayrollStatus(pay, 'pending')} disabled={busy}
            title="Reverses the salary posting so the amounts can be corrected">
            Back to pending
          </button>
        )}
        {['pending', 'approved'].includes(pay.status) && (
          <button type="button" className="btn-success" onClick={() => openPay(pay)} disabled={busy}>
            Mark Paid
          </button>
        )}
      </td>
    );
  };

  const renderPayrolls = () => (
    <div className="payroll-section">
      <div className="section-header">
        <h3>💰 Payroll Processing</h3>
        <div className="payroll-actions">
          <label className="month-picker" htmlFor="gen-month">
            Month
            <input id="gen-month" type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
          </label>
          <button type="button" className="btn-auto-generate" onClick={autoGeneratePayroll} disabled={saving}>
            <span className="icon" aria-hidden="true">🔄</span>
            Generate for all active employees
          </button>
          <button type="button" className="btn-secondary" onClick={recalculateMonth} disabled={saving}
            title="Recompute every pending payroll of the month from attendance">
            Recalculate month from attendance
          </button>
          <button type="button" className="btn-primary" onClick={openForm}>
            <span className="icon" aria-hidden="true">+</span>
            Manual Entry
          </button>
        </div>
      </div>

      <div className="payroll-explainer" role="note">
        <p>
          Pay is worked out from attendance: absent days, half-days and days before joining are loss of pay (LOP).
          Amounts can be changed only while a payroll is <strong>pending</strong>; use “Recalculate” after correcting attendance.
        </p>
        <p>
          <strong>Approving</strong> posts the salary expense and what is owed (net pay, PF, ESI, professional tax, TDS)
          to the ledger and locks the payroll. <strong>Marking paid</strong> posts the bank (or cash) payment.
          “Back to pending” reverses the approval posting.
        </p>
      </div>

      <div className="payroll-filter">
        <SearchBox value={payrollsList.query} onChange={payrollsList.setQuery}
          placeholder="Employee name, code, department" label="Search payrolls" />
        <label htmlFor="month-filter">Show month</label>
        <input id="month-filter" type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        {monthFilter && (
          <button type="button" className="btn-edit" onClick={() => setMonthFilter('')}>All months</button>
        )}
        <label htmlFor="pay-status-filter">Status</label>
        <select id="pay-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      {payrollsList.error && <div className="payroll-notice error" role="alert">{payrollsList.error}</div>}
      <div className="table-container">
        <table className="payroll-table">
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Month</th>
              <th scope="col">Paid days / LOP</th>
              <th scope="col">Gross</th>
              <th scope="col">Deductions</th>
              <th scope="col">Net Salary</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payrolls.length === 0 && (
              <tr>
                <td colSpan="8" className="payroll-empty">
                  {payrollsList.loading ? 'Loading…'
                    : payrollsList.query || monthFilter || statusFilter ? 'No payrolls match your search or filter.'
                      : 'No payrolls yet. Choose a month and generate them for all active employees.'}
                </td>
              </tr>
            )}
            {payrolls.map(pay => {
              const a = pay.attendance || {};
              return (
                <tr key={pay.id}>
                  <td>
                    <div className="employee-info">
                      <strong>{pay.employee?.name}</strong>
                      <small>{[pay.employee?.code, pay.employee?.position].filter(Boolean).join(' · ')}</small>
                    </div>
                  </td>
                  <td>{formatMonth(pay.month)}</td>
                  <td>
                    {a.calendarDays ? (
                      <>
                        {days(a.paidDays)} / {a.calendarDays}
                        <small className="paid-at">
                          LOP {days(a.lopDays)}{Number(pay.lopAmount) ? ` (${formatMoney(pay.lopAmount)})` : ''}
                          {a.unmarkedDays ? ` · ${a.unmarkedDays} not marked` : ''}
                        </small>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    {formatMoney(pay.grossPay ?? pay.basicSalary)}
                    {Number(pay.allowances) > 0 && <small className="paid-at">incl. allowances {formatMoney(pay.allowances)}</small>}
                  </td>
                  <td>
                    {formatMoney(pay.totalDeductions ?? pay.deductions)}
                    {Number(pay.tds) > 0 && <small className="paid-at">incl. TDS {formatMoney(pay.tds)}</small>}
                  </td>
                  <td><strong>{formatMoney(pay.netSalary)}</strong></td>
                  <td>
                    <span className={`status ${pay.status}`}>{STATUS_LABELS[pay.status] || pay.status}</span>
                    {pay.status === 'approved' && pay.approvedAt && <small className="paid-at">Approved {formatDateTime(pay.approvedAt)}</small>}
                    {pay.paidAt && (
                      <small className="paid-at">
                        Paid {formatDateTime(pay.paidAt)}{pay.paymentMethod ? ` · ${METHOD_LABELS[pay.paymentMethod] || pay.paymentMethod}` : ''}
                      </small>
                    )}
                  </td>
                  {renderPayrollActions(pay)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination pagination={payrollsList.pagination} onPage={payrollsList.setPage}
        disabled={payrollsList.loading} label="payrolls" />
    </div>
  );

  const renderEmployeeFields = () => (
    <div className="form-grid">
      <div className="form-section">
        <h4>Personal Information</h4>
        <label className="payroll-field">Full name *
          <input type="text" {...field('name')} required />
        </label>
        <label className="payroll-field">Email address *
          <input type="email" {...field('email')} required />
        </label>
        <label className="payroll-field">Phone number
          <input type="tel" {...field('phone')} />
        </label>
        <label className="payroll-field">Address
          <textarea {...field('address')} rows="2" />
        </label>
        <label className="payroll-field">Emergency contact
          <input type="text" {...field('emergencyContact')} />
        </label>
      </div>

      <div className="form-section">
        <h4>Job Information</h4>
        <label className="payroll-field">Position / designation *
          <input type="text" {...field('position')} required />
        </label>
        <label className="payroll-field">Department *
          <select {...field('department')} required>
            <option value="">Select department</option>
            {DEPARTMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="payroll-field">Joining date
          <input type="date" {...field('joiningDate')} />
        </label>
        <label className="payroll-field">Tasks &amp; responsibilities (comma separated)
          <textarea {...field('tasks')} rows="2" />
        </label>
      </div>

      <div className="form-section">
        <h4>Compensation</h4>
        <label className="payroll-field">Monthly base salary (₹) *
          <input type="number" min="1" step="0.01" {...field('baseSalary', { number: true })} required />
        </label>
        <label className="payroll-field">Annual CTC (₹)
          <input type="number" min="0" step="0.01" {...field('ctc', { number: true })} />
        </label>
      </div>
    </div>
  );

  const renderPayrollFields = () => (
    <div className="form-grid">
      <label className="payroll-field">Employee *
        <select
          value={formData.employeeId || ''}
          onChange={(e) => setFormData({ ...formData, employeeId: e.target.value ? parseInt(e.target.value, 10) : undefined })}
          required
        >
          <option value="">Select employee</option>
          {pickerEmployees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name} - {emp.position}</option>
          ))}
        </select>
      </label>
      <label className="payroll-field">Month *
        <input type="month" {...field('month')} required />
      </label>
      <label className="payroll-field">Allowances / overtime (₹)
        <input type="number" min="0" step="0.01" {...field('allowances', { number: true })} />
      </label>
      <label className="payroll-field">Other deductions (₹)
        <input type="number" min="0" step="0.01" {...field('deductions', { number: true })} />
      </label>
      <label className="payroll-field">TDS (₹)
        <input type="number" min="0" step="0.01" {...field('tds', { number: true })} />
      </label>
      <p className="payroll-hint">Basic pay, loss of pay, PF, ESI and professional tax are calculated from attendance and settings.</p>
    </div>
  );

  return (
    <div className="payroll">
      <div className="payroll-header">
        <h1>👥 Employee & Payroll Management</h1>
        <div className="payroll-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            Employee Onboarding
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'payroll' ? 'active' : ''}`}
            onClick={() => setActiveTab('payroll')}
          >
            Payroll Management
          </button>
        </div>
      </div>

      {notice && (
        <div className={`payroll-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="payroll-stats">
        <div className="stat-card">
          <h3>Active Employees</h3>
          <div className="stat-value">{stats.activeEmployees || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Annual CTC (active)</h3>
          <div className="stat-value">{formatMoneyCompact(stats.totalCTC || 0)}</div>
        </div>
        <div className="stat-card">
          <h3>Payroll {stats.month ? formatMonth(stats.month) : 'this month'}</h3>
          <div className="stat-value">{formatMoneyCompact(stats.totalPayroll || 0)}</div>
        </div>
        <div className="stat-card">
          <h3>Awaiting Payment</h3>
          <div className="stat-value warning">{stats.pendingPayrolls || 0}</div>
        </div>
      </div>

      {activeTab === 'employees' && renderEmployees()}
      {activeTab === 'payroll' && renderPayrolls()}

      {showForm && (
        <Modal
          titleId="payroll-form-title"
          title={activeTab === 'employees' ? (editingEmployee ? 'Edit Employee' : 'Employee Onboarding') : 'Manual Payroll Entry'}
          onClose={closeForm}
          className="large-modal"
        >
          {formError && <div className="payroll-notice error" role="alert">{formError}</div>}
          <form onSubmit={handleSubmit}>
            {activeTab === 'employees' ? renderEmployeeFields() : renderPayrollFields()}
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editingEmployee ? 'Update Employee' : 'Save'}
              </button>
              <button type="button" className="btn-secondary" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {amountsFor && (
        <Modal titleId="amounts-title" onClose={closeAmounts}
          title={`Edit amounts — ${amountsFor.employee?.name}, ${formatMonth(amountsFor.month)}`}>
          {dialogError && <div className="payroll-notice error" role="alert">{dialogError}</div>}
          <form onSubmit={saveAmounts}>
            <div className="form-grid">
              {[['allowances', 'Allowances / overtime (₹)'], ['deductions', 'Other deductions (₹)'], ['tds', 'TDS (₹)']].map(([k, l]) => (
                <label key={k} className="payroll-field">{l}
                  <input type="number" min="0" step="0.01" value={amounts[k]}
                    onChange={(e) => setAmounts(x => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
            <p className="payroll-hint">Saving recalculates loss of pay, PF, ESI, professional tax and net pay from attendance.</p>
            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save and recalculate'}</button>
              <button type="button" className="btn-secondary" onClick={closeAmounts}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {payFor && (
        <Modal titleId="pay-title" onClose={closePay}
          title={`Mark paid — ${payFor.employee?.name}, ${formatMonth(payFor.month)}`}>
          {dialogError && <div className="payroll-notice error" role="alert">{dialogError}</div>}
          <form onSubmit={savePayment}>
            <p>
              Net pay <strong>{formatMoney(payFor.netSalary)}</strong>.
              {payFor.status === 'pending' && ' The payroll is approved first (salary posted to the ledger).'}
              {' '}The payment is posted from the bank or cash account. This cannot be undone.
            </p>
            <div className="form-grid">
              <label className="payroll-field">Payment method *
                <select value={payment.method} onChange={(e) => setPayment(p => ({ ...p, method: e.target.value }))} required>
                  {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="payroll-field">Payment date
                <input type="date" value={payment.date} max={todayIST()}
                  onChange={(e) => setPayment(p => ({ ...p, date: e.target.value }))} />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-success" disabled={saving}>{saving ? 'Saving…' : 'Mark paid'}</button>
              <button type="button" className="btn-secondary" onClick={closePay}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {payslipId && <PayslipModal payrollId={payslipId} onClose={closePayslip} />}
    </div>
  );
};

export default Payroll;
