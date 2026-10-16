const express = require('express');
const cors = require('cors');
const { connectDB, getPool, sql } = require('../../shared/database');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, num, int, id, oneOf, date, month, email, bool, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');
const { pageParams, listPage } = require('../../shared/paginate');
const { withTransaction, conflict, notFound, loadSettings } = require('../../shared/ledger');
const { amountInWords } = require('../../shared/gst');

const app = express();
const PORT = 5008;

app.use(cors());
app.use(express.json());

// Every route needs a valid token and the Payroll permission. Enforced here as
// well as at the gateway: salary data must not be reachable on this port with
// just any login.
protectService(app, { permissions: AREA_PERMISSIONS.payroll });

let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Payroll Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

const requireDB = (req, res, next) => {
  if (!dbConnected) return res.status(503).json({ success: false, message: 'Database not connected' });
  next();
};

const EMPLOYEE_COLUMNS = `
  EmployeeID as id,
  EmployeeCode as employeeCode,
  Name as name,
  Email as email,
  Phone as phone,
  Position as position,
  Department as department,
  to_char(JoiningDate, 'YYYY-MM-DD') as joiningDate,
  BaseSalary as baseSalary,
  CTC as ctc,
  Tasks as tasks,
  Address as address,
  EmergencyContact as emergencyContact,
  Status as status,
  IsActive as isActive`;

const EMPLOYEE_RULES = (creating) => ({
  name: str({ required: creating, max: 100 }),
  email: email({ required: creating, max: 100 }),
  phone: str({ max: 20, pattern: /^[+0-9 ()-]{6,20}$/, message: 'phone may contain only digits, spaces, +, - and brackets' }),
  position: str({ required: creating, max: 100 }),
  department: str({ required: creating, max: 100 }),
  joiningDate: date(),
  baseSalary: num({ required: creating, min: 0.01, max: 1e9 }),
  ctc: num({ min: 0, max: 1e10 }),
  tasks: str({ max: 5000 }),
  address: str({ max: 500 }),
  emergencyContact: str({ max: 200 }),
  isActive: bool()
});

// Payroll lifecycle: pending → approved → paid; pending/approved → cancelled;
// approved → pending to correct it. Approving posts the salary expense and
// what is owed (net pay, PF, ESI, PT, TDS); paying posts the bank payment.
// See sp_PayrollTransition (migration 008).
const PAYROLL_NEXT = {
  pending: ['approved', 'paid', 'cancelled'],
  approved: ['paid', 'pending', 'cancelled'],
  paid: [],
  cancelled: []
};

// --- Employees ----------------------------------------------------------------

app.get('/employees', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { department: str({ max: 100 }), includeInactive: bool() });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Department', sql.NVarChar(100), value.department || null)
      .input('All', sql.Bit, value.includeInactive || false);
    const result = await listPage(request, `
      SELECT ${EMPLOYEE_COLUMNS} FROM Employees
      WHERE (@All OR IsActive = TRUE) AND (@Department IS NULL OR Department = @Department)
        AND (@Q IS NULL OR Name ILIKE @Q OR EmployeeCode ILIKE @Q OR Position ILIKE @Q OR Department ILIKE @Q)`, 'name', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch employees');
  }
});

app.post('/employees', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, EMPLOYEE_RULES(true));
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('Name', sql.NVarChar(100), v.name)
      .input('Email', sql.NVarChar(100), v.email)
      .input('Phone', sql.NVarChar(20), v.phone || null)
      .input('Position', sql.NVarChar(100), v.position)
      .input('Department', sql.NVarChar(100), v.department)
      .input('JoiningDate', sql.Date, v.joiningDate || zonedToday())
      .input('BaseSalary', sql.Decimal(12, 2), v.baseSalary)
      .input('CTC', sql.Decimal(15, 2), v.ctc ?? null)
      .input('Tasks', sql.NVarChar(sql.MAX), v.tasks || null)
      .input('Address', sql.NVarChar(500), v.address || null)
      .input('EmergencyContact', sql.NVarChar(200), v.emergencyContact || null)
      .execute('sp_CreateEmployee');
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to create employee');
  }
});

// Partial update: fields absent from the body keep their current value.
// (The old version overwrote every column, so a save that omitted the joining
// date erased it, and a name-only update failed.)
app.put('/employees/:id', requireDB, async (req, res) => {
  const employeeId = routeId(req.params.id);
  if (!employeeId) return badRequest(res, ['Invalid employee id']);
  const { errors, value: v } = check(req.body, EMPLOYEE_RULES(false));
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('EmployeeID', sql.Int, employeeId)
      .input('Name', sql.NVarChar(100), v.name ?? null)
      .input('Email', sql.NVarChar(100), v.email ?? null)
      .input('Phone', sql.NVarChar(20), v.phone ?? null)
      .input('Position', sql.NVarChar(100), v.position ?? null)
      .input('Department', sql.NVarChar(100), v.department ?? null)
      .input('JoiningDate', sql.Date, v.joiningDate ?? null)
      .input('BaseSalary', sql.Decimal(12, 2), v.baseSalary ?? null)
      .input('CTC', sql.Decimal(15, 2), v.ctc ?? null)
      .input('Tasks', sql.NVarChar(sql.MAX), v.tasks ?? null)
      .input('Address', sql.NVarChar(500), v.address ?? null)
      .input('EmergencyContact', sql.NVarChar(200), v.emergencyContact ?? null)
      .input('IsActive', sql.Bit, v.isActive ?? null)
      .query(`
        UPDATE Employees SET
          Name             = COALESCE(@Name, Name),
          Email            = COALESCE(@Email, Email),
          Phone            = COALESCE(@Phone, Phone),
          Position         = COALESCE(@Position, Position),
          Department       = COALESCE(@Department, Department),
          JoiningDate      = COALESCE(@JoiningDate, JoiningDate),
          BaseSalary       = COALESCE(@BaseSalary, BaseSalary),
          CTC              = COALESCE(@CTC, CTC),
          Tasks            = COALESCE(@Tasks, Tasks),
          Address          = COALESCE(@Address, Address),
          EmergencyContact = COALESCE(@EmergencyContact, EmergencyContact),
          IsActive         = COALESCE(@IsActive, IsActive)
        WHERE EmployeeID = @EmployeeID
        RETURNING ${EMPLOYEE_COLUMNS}
      `);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to update employee');
  }
});

// --- Payrolls -----------------------------------------------------------------

const PAYROLL_SELECT = `
  SELECT
    p.PayrollID as id,
    p.EmployeeID as employeeId,
    p.Month as month,
    p.BaseSalary as basicSalary,
    p.Allowances as allowances,
    p.Deductions as deductions,
    p.CalendarDays as calendarDays,
    p.PaidDays as paidDays,
    p.PresentDays as presentDays,
    p.HalfDays as halfDays,
    p.LeaveDays as leaveDays,
    p.AbsentDays as absentDays,
    p.UnmarkedDays as unmarkedDays,
    p.PreJoiningDays as preJoiningDays,
    p.LOPDays as lopDays,
    p.LOPAmount as lopAmount,
    p.EarnedBasic as earnedBasic,
    p.GrossPay as grossPay,
    p.PF as pf,
    p.ESI as esi,
    p.ProfessionalTax as professionalTax,
    p.TDS as tds,
    COALESCE(p.NetPay, p.BaseSalary + p.Allowances - p.Deductions) as netSalary,
    p.Status as status,
    p.PaymentMethod as paymentMethod,
    to_char(p.ApprovedAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as approvedAt,
    to_char(p.PaidAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as paidAt,
    to_char(p.ComputedAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as computedAt,
    e.Name as employeeName,
    e.EmployeeCode as employeeCode,
    e.Position as employeePosition,
    e.Department as employeeDepartment
  FROM Payrolls p
  JOIN Employees e ON p.EmployeeID = e.EmployeeID`;

const shapePayroll = (row) => ({
  id: row.id,
  employeeId: row.employeeId,
  month: row.month,
  basicSalary: row.basicSalary,
  allowances: row.allowances,
  // The screen labels allowances "overtime"; kept for compatibility.
  overtime: row.allowances,
  deductions: row.deductions,
  attendance: {
    calendarDays: row.calendarDays, paidDays: row.paidDays, presentDays: row.presentDays, halfDays: row.halfDays,
    leaveDays: row.leaveDays, absentDays: row.absentDays, unmarkedDays: row.unmarkedDays,
    preJoiningDays: row.preJoiningDays, lopDays: row.lopDays
  },
  lopAmount: row.lopAmount,
  earnedBasic: row.earnedBasic,
  grossPay: row.grossPay,
  pf: row.pf,
  esi: row.esi,
  professionalTax: row.professionalTax,
  tds: row.tds,
  totalDeductions: Math.round(((row.pf || 0) + (row.esi || 0) + (row.professionalTax || 0) + (row.tds || 0) + (row.deductions || 0)) * 100) / 100,
  netSalary: row.netSalary,
  status: row.status,
  paymentMethod: row.paymentMethod,
  approvedAt: row.approvedAt,
  paidAt: row.paidAt,
  computedAt: row.computedAt,
  employee: {
    name: row.employeeName,
    code: row.employeeCode,
    position: row.employeePosition,
    department: row.employeeDepartment
  }
});

const loadPayroll = async (payrollId) => {
  const r = await getPool().request().input('PayrollID', sql.Int, payrollId)
    .query(`${PAYROLL_SELECT} WHERE p.PayrollID = @PayrollID`);
  return r.recordset[0] ? shapePayroll(r.recordset[0]) : null;
};

/** Recompute a pending payroll from attendance and settings (no-op for others). */
const compute = (tx, payrollId) => tx.request().input('PayrollID', sql.Int, payrollId).execute('sp_ComputePayroll');

app.get('/payrolls', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { month: month(), status: oneOf(Object.keys(PAYROLL_NEXT)), employeeId: id() });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Month', sql.NVarChar(7), value.month || null)
      .input('Status', sql.NVarChar(20), value.status || null)
      .input('EmployeeID', sql.Int, value.employeeId || null);
    const result = await listPage(request, `${PAYROLL_SELECT}
      WHERE (@Month IS NULL OR p.Month = @Month) AND (@Status IS NULL OR p.Status = @Status)
        AND (@EmployeeID IS NULL OR p.EmployeeID = @EmployeeID)
        AND (@Q IS NULL OR e.Name ILIKE @Q OR e.EmployeeCode ILIKE @Q OR e.Department ILIKE @Q)`,
      'month DESC, employeeName', p);
    res.json({ success: true, data: result.data.map(shapePayroll), pagination: result.pagination });
  } catch (error) {
    sendError(res, error, 'Failed to fetch payrolls');
  }
});

app.post('/payrolls', requireDB, async (req, res) => {
  const body = { ...req.body };
  // The screen has sent "overtime" for the allowances column.
  if (body.allowances === undefined && body.overtime !== undefined) body.allowances = body.overtime;
  const { errors, value: v } = check(body, {
    employeeId: id({ required: true }),
    month: month({ required: true }),
    allowances: num({ min: 0, max: 1e9 }),
    deductions: num({ min: 0, max: 1e9 }),
    tds: num({ min: 0, max: 1e9 })
  });
  if (errors) return badRequest(res, errors);

  try {
    const payrollId = await withTransaction(async (tx) => {
      const emp = await tx.request()
        .input('EmployeeID', sql.Int, v.employeeId)
        .query('SELECT BaseSalary FROM Employees WHERE EmployeeID = @EmployeeID AND IsActive = TRUE');
      if (!emp.recordset.length) throw notFound('Employee not found or inactive');
      const inserted = await tx.request()
        .input('EmployeeID', sql.Int, v.employeeId)
        .input('Month', sql.NVarChar(7), v.month)
        .input('BaseSalary', sql.Decimal(12, 2), emp.recordset[0].BaseSalary)
        .input('Allowances', sql.Decimal(10, 2), v.allowances || 0)
        .input('Deductions', sql.Decimal(10, 2), v.deductions || 0)
        .input('TDS', sql.Decimal(10, 2), v.tds || 0)
        .input('ProcessedBy', sql.Int, req.user?.id || null)
        .query(`
          INSERT INTO Payrolls (EmployeeID, Month, BaseSalary, Allowances, Deductions, TDS, ProcessedBy)
          VALUES (@EmployeeID, @Month, @BaseSalary, @Allowances, @Deductions, @TDS, @ProcessedBy)
          RETURNING PayrollID
        `);
      const newId = inserted.recordset[0].PayrollID;
      await compute(tx, newId);
      return newId;
    });
    res.status(201).json({ success: true, message: 'Payroll created successfully', data: await loadPayroll(payrollId) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'This employee already has a payroll for that month' });
    }
    sendError(res, error, 'Failed to create payroll');
  }
});

/**
 * Update allowances, deductions or TDS, and/or move the status.
 *
 * Only the fields sent are changed. Amounts can be changed only while a
 * payroll is pending (move an approved one back to pending first, which
 * reverses its accrual); every change recomputes pay from attendance.
 * "paid" records who paid it, when and how, and posts the payment.
 */
app.put('/payrolls/:id', requireDB, async (req, res) => {
  const payrollId = routeId(req.params.id);
  if (!payrollId) return badRequest(res, ['Invalid payroll id']);
  const body = { ...req.body };
  if (body.allowances === undefined && body.overtime !== undefined) body.allowances = body.overtime;
  const { errors, value: v } = check(body, {
    allowances: num({ min: 0, max: 1e9 }),
    deductions: num({ min: 0, max: 1e9 }),
    tds: num({ min: 0, max: 1e9 }),
    status: oneOf(Object.keys(PAYROLL_NEXT)),
    paymentMethod: oneOf(['bank', 'cash', 'upi', 'cheque']),
    paymentDate: date()
  });
  if (errors) return badRequest(res, errors);
  const amounts = v.allowances !== undefined || v.deductions !== undefined || v.tds !== undefined;
  if (!amounts && v.status === undefined) {
    return badRequest(res, ['Nothing to update: send allowances, deductions, tds or status']);
  }
  const today = zonedToday();
  if (v.paymentDate && v.paymentDate > today) return badRequest(res, ['paymentDate cannot be in the future']);

  try {
    await withTransaction(async (tx) => {
      const current = await tx.request().input('PayrollID', sql.Int, payrollId)
        .query('SELECT Status FROM Payrolls WHERE PayrollID = @PayrollID FOR UPDATE');
      if (!current.recordset.length) throw notFound('Payroll not found');
      const from = current.recordset[0].Status;

      if (amounts && from !== 'pending') {
        throw conflict(from === 'approved'
          ? 'An approved payroll cannot be changed; move it back to pending first'
          : `A ${from} payroll can no longer be changed`);
      }
      if (v.status && v.status !== from && !PAYROLL_NEXT[from].includes(v.status)) {
        throw conflict(`A ${from} payroll cannot become ${v.status}`);
      }
      if (amounts) {
        await tx.request()
          .input('PayrollID', sql.Int, payrollId)
          .input('Allowances', sql.Decimal(10, 2), v.allowances ?? null)
          .input('Deductions', sql.Decimal(10, 2), v.deductions ?? null)
          .input('TDS', sql.Decimal(10, 2), v.tds ?? null)
          .query(`UPDATE Payrolls SET Allowances = COALESCE(@Allowances, Allowances),
                    Deductions = COALESCE(@Deductions, Deductions), TDS = COALESCE(@TDS, TDS)
                  WHERE PayrollID = @PayrollID`);
        await compute(tx, payrollId);
      }
      if (v.status && v.status !== from) {
        await tx.request()
          .input('PayrollID', sql.Int, payrollId)
          .input('To', sql.NVarChar(20), v.status)
          .input('UserID', sql.Int, req.user.id)
          .input('Date', sql.Date, v.paymentDate || today)
          .input('Method', sql.NVarChar(10), v.paymentMethod || 'bank')
          .execute('sp_PayrollTransition');
      }
    });
    res.json({ success: true, message: 'Payroll updated successfully', data: await loadPayroll(payrollId) });
  } catch (error) {
    sendError(res, error, 'Failed to update payroll');
  }
});

/** Recompute pending payrolls from attendance — one, or a whole month. */
app.post('/payrolls/:id/recalculate', requireDB, async (req, res) => {
  const payrollId = routeId(req.params.id);
  if (!payrollId) return badRequest(res, ['Invalid payroll id']);
  try {
    await withTransaction(async (tx) => {
      const r = await tx.request().input('ID', sql.Int, payrollId).query('SELECT Status FROM Payrolls WHERE PayrollID = @ID');
      if (!r.recordset.length) throw notFound('Payroll not found');
      if (r.recordset[0].Status !== 'pending') throw conflict('Only a pending payroll is recalculated; move it back to pending first');
      await compute(tx, payrollId);
    });
    res.json({ success: true, data: await loadPayroll(payrollId) });
  } catch (error) {
    sendError(res, error, 'Failed to recalculate payroll');
  }
});

app.post('/payrolls/recalculate', requireDB, async (req, res) => {
  const { errors, value } = check(req.body, { month: month({ required: true }) });
  if (errors) return badRequest(res, errors);
  try {
    const count = await withTransaction(async (tx) => {
      const r = await tx.request().input('Month', sql.NVarChar(7), value.month)
        .query("SELECT PayrollID FROM Payrolls WHERE Month = @Month AND Status = 'pending' ORDER BY PayrollID");
      for (const row of r.recordset) await compute(tx, row.PayrollID);
      return r.recordset.length;
    });
    res.json({ success: true, data: { recalculated: count }, message: `Recalculated ${count} pending payroll${count === 1 ? '' : 's'} for ${value.month}` });
  } catch (error) {
    sendError(res, error, 'Failed to recalculate payrolls');
  }
});

/** Everything a payslip shows, including the pay policy that produced it. */
app.get('/payrolls/:id/payslip', requireDB, async (req, res) => {
  const payrollId = routeId(req.params.id);
  if (!payrollId) return badRequest(res, ['Invalid payroll id']);
  try {
    const payroll = await loadPayroll(payrollId);
    if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
    const s = await loadSettings();
    const e = (await getPool().request().input('ID', sql.Int, payroll.employeeId)
      .query("SELECT to_char(JoiningDate, 'YYYY-MM-DD') AS joiningDate FROM Employees WHERE EmployeeID = @ID")).recordset[0];
    res.json({ success: true, data: {
      ...payroll,
      employee: { ...payroll.employee, joiningDate: e?.joiningDate || null },
      company: { name: s.CompanyName, address: [s.AddressLine1, s.AddressLine2, s.City, s.Pincode].filter(Boolean).join(', ') },
      earnings: [
        { label: 'Basic salary (monthly)', amount: payroll.basicSalary },
        { label: `Loss of pay (${payroll.attendance.lopDays || 0} day${payroll.attendance.lopDays === 1 ? '' : 's'})`, amount: -(payroll.lopAmount || 0) },
        { label: 'Allowances', amount: payroll.allowances }
      ],
      deductionLines: [
        { label: 'Provident Fund (employee)', amount: payroll.pf },
        { label: 'ESI (employee)', amount: payroll.esi },
        { label: 'Professional tax', amount: payroll.professionalTax },
        { label: 'TDS', amount: payroll.tds },
        { label: 'Other deductions', amount: payroll.deductions }
      ].filter(d => d.amount),
      netInWords: amountInWords(payroll.netSalary || 0),
      policy: 'Pay is for calendar days. Absent days and half-days (½ day) are loss of pay, as are days before joining. ' +
              'Present, late and paid-leave days are paid; days without an attendance record are treated as weekly offs or holidays and paid.'
    } });
  } catch (error) {
    sendError(res, error, 'Failed to build payslip');
  }
});

// Create a payroll for every active employee who has none for the month.
app.post('/payrolls/auto-generate', requireDB, async (req, res) => {
  const { errors, value } = check(req.body, { month: month({ required: true }) });
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('Month', sql.NVarChar(7), value.month)
      .input('ProcessedBy', sql.Int, req.user?.id || null)
      .execute('sp_AutoGeneratePayroll');
    const created = result.recordset[0]?.RecordsCreated || 0;
    res.json({
      success: true,
      data: result.recordset[0],
      message: created
        ? `Generated ${created} payroll${created === 1 ? '' : 's'} for ${value.month}`
        : `Every active employee already has a payroll for ${value.month}`
    });
  } catch (error) {
    sendError(res, error, 'Failed to generate payroll');
  }
});

app.get('/stats', requireDB, async (req, res) => {
  const today = zonedToday();
  try {
    const result = await getPool().request()
      .input('Month', sql.NVarChar(7), today.slice(0, 7))
      .query(`
        SELECT
          (SELECT COUNT(*) FROM Employees WHERE IsActive = TRUE) as activeEmployees,
          (SELECT COUNT(*) FROM Employees) as totalEmployees,
          (SELECT COALESCE(SUM(COALESCE(NetPay, BaseSalary + Allowances - Deductions)), 0) FROM Payrolls
            WHERE Month = @Month AND Status <> 'cancelled') as totalPayroll,
          (SELECT COUNT(*) FROM Payrolls WHERE Status IN ('pending', 'approved')) as pendingPayrolls,
          (SELECT COUNT(*) FROM Payrolls WHERE Status = 'paid' AND Month = @Month) as paidThisMonth,
          (SELECT COALESCE(SUM(COALESCE(CTC, BaseSalary * 12)), 0) FROM Employees WHERE IsActive = TRUE) as totalCTC
      `);
    res.json({ ...result.recordset[0], month: today.slice(0, 7) });
  } catch (error) {
    sendError(res, error, 'Failed to fetch stats');
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    service: 'Payroll Service',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`💼 Payroll Service running on http://${SERVICE_HOST}:${PORT}`);
});
