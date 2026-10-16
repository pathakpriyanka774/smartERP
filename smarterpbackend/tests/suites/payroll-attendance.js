// Payroll computed from attendance, statutory deductions, payslip and ledger (F-018, F-028).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Payroll from attendance', () => {
  const { api, query } = env;
  const T = () => ctx.admin;

  before(async () => {
    const e = await api('POST', '/payroll/employees', { token: T(), body: {
      name: 'Attendance Tester', email: 'att-tester@test.example', position: 'Operator', department: 'Production',
      baseSalary: 30000, joiningDate: '2026-06-11'   // joins on the 11th: 10 days unpaid in June
    } });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    ctx.attEmp = e.body.data;
    // June 2026: 2 absences, 1 half-day, 1 paid leave, rest present or unmarked.
    for (const [day, status] of [['2026-06-15', 'absent'], ['2026-06-16', 'absent'], ['2026-06-17', 'half-day'], ['2026-06-18', 'leave'], ['2026-06-19', 'present']]) {
      await query(`INSERT INTO EmployeeAttendance (EmployeeID, AttendanceDate, Status) VALUES ($1, $2, $3)`, [ctx.attEmp.id, day, status]);
    }
  });

  it('deducts loss of pay for absences, half-days and days before joining', async () => {
    const r = await api('POST', '/payroll/payrolls', { token: T(), body: { employeeId: ctx.attEmp.id, month: '2026-06', allowances: 2000 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const p = r.body.data;
    assert.equal(p.attendance.calendarDays, 30);
    assert.equal(p.attendance.preJoiningDays, 10);
    assert.equal(p.attendance.absentDays, 2);
    assert.equal(p.attendance.halfDays, 1);
    assert.equal(p.attendance.leaveDays, 1);
    assert.equal(p.attendance.lopDays, 12.5);
    assert.equal(p.attendance.paidDays, 17.5);
    assert.equal(p.lopAmount, 12500);            // 30000 × 12.5 / 30
    assert.equal(p.earnedBasic, 17500);
    assert.equal(p.grossPay, 19500);
    assert.equal(p.netSalary, 19500);            // statutory deductions are off by default
    ctx.attPayroll = p;
  });

  it('applies PF, ESI and professional tax once enabled, on recalculation', async () => {
    await api('PUT', '/accounting/settings', { token: T(), body: { pfEnabled: true, esiEnabled: true, professionalTax: 200 } });
    const r = await api('PUT', `/payroll/payrolls/${ctx.attPayroll.id}`, { token: T(), body: { tds: 300 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.data;
    assert.equal(p.pf, 1800);                    // 12 % of min(17500, 15000)
    assert.equal(p.esi, 147);                    // ceil(0.75 % of 19500)
    assert.equal(p.professionalTax, 200);
    assert.equal(p.tds, 300);
    assert.equal(p.netSalary, 19500 - 1800 - 147 - 200 - 300);
  });

  it('refuses deductions larger than gross pay', async () => {
    const r = await api('PUT', `/payroll/payrolls/${ctx.attPayroll.id}`, { token: T(), body: { deductions: 999999 } });
    assert.equal(r.status, 409);
  });

  it('approval posts the salary accrual; an approved payroll is locked', async () => {
    const a = await api('PUT', `/payroll/payrolls/${ctx.attPayroll.id}`, { token: T(), body: { status: 'approved' } });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal((await api('PUT', `/payroll/payrolls/${ctx.attPayroll.id}`, { token: T(), body: { allowances: 1 } })).status, 409);
    const lines = await query(`SELECT a.Code, (jl.Debit - jl.Credit)::float AS amt FROM JournalLines jl
      JOIN Accounts a ON a.AccountID = jl.AccountID JOIN JournalEntries je ON je.EntryID = jl.EntryID
      WHERE je.SourceType = 'payroll' AND je.SourceID = $1`, [ctx.attPayroll.id]);
    const by = Object.fromEntries(lines.map(l => [l.code, l.amt]));
    assert.equal(by['5100'], 19500);
    assert.equal(by['2210'], -1800);
    assert.equal(by['2200'], -(19500 - 1800 - 147 - 200 - 300));
  });

  it('back to pending reverses the accrual and recomputes', async () => {
    await api('PUT', '/accounting/settings', { token: T(), body: { pfEnabled: false, esiEnabled: false, professionalTax: 0 } });
    const r = await api('PUT', `/payroll/payrolls/${ctx.attPayroll.id}`, { token: T(), body: { status: 'pending' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.pf, 0, 'recomputed with PF now off');
    const net = await query(`SELECT COALESCE(SUM(jl.Debit - jl.Credit), 0)::float AS n FROM JournalLines jl
      JOIN JournalEntries je ON je.EntryID = jl.EntryID JOIN Accounts a ON a.AccountID = jl.AccountID
      WHERE a.Code = '5100' AND (je.SourceID = $1 AND je.SourceType = 'payroll' OR je.SourceType = 'reversal'
        AND je.SourceID IN (SELECT EntryID FROM JournalEntries WHERE SourceType = 'payroll' AND SourceID = $1))`, [ctx.attPayroll.id]);
    assert.equal(net[0].n, 0);
  });

  it('paying posts the bank payment and a cash-book line', async () => {
    const r = await api('PUT', `/payroll/payrolls/${ctx.attPayroll.id}`, { token: T(), body: { status: 'paid', paymentMethod: 'bank' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const cash = await query("SELECT Amount::float AS a FROM FinanceTransactions WHERE SourceType = 'payroll' AND SourceID = $1", [ctx.attPayroll.id]);
    assert.equal(cash[0].a, r.body.data.netSalary);
    const payable = await query(`SELECT COALESCE(SUM(jl.Debit - jl.Credit), 0)::float AS n FROM JournalLines jl
      JOIN JournalEntries je ON je.EntryID = jl.EntryID JOIN Accounts a ON a.AccountID = jl.AccountID
      WHERE a.Code = '2200' AND (je.SourceID = $1 AND je.SourceType IN ('payroll', 'payroll-payment')
        OR je.SourceType = 'reversal' AND je.SourceID IN (SELECT EntryID FROM JournalEntries WHERE SourceType = 'payroll' AND SourceID = $1))`, [ctx.attPayroll.id]);
    assert.equal(payable[0].n, 0, 'salary payable is cleared by the payment');
    // The cash-book line belongs to the payroll and cannot be edited there.
    const id = (await query("SELECT TransactionID AS id FROM FinanceTransactions WHERE SourceType = 'payroll' AND SourceID = $1", [ctx.attPayroll.id]))[0].id;
    assert.equal((await api('PUT', `/finance/transactions/${id}`, { token: T(), body: { amount: 1 } })).status, 409);
  });

  it('builds a payslip with attendance, deductions and amount in words', async () => {
    const r = await api('GET', `/payroll/payrolls/${ctx.attPayroll.id}/payslip`, { token: T() });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.attendance.lopDays, 12.5);
    assert.match(r.body.data.netInWords, /^Rupees .* Only$/);
    assert.ok(r.body.data.policy.includes('loss of pay'));
  });

  it('auto-generate computes new payrolls from attendance', async () => {
    const g = await api('POST', '/payroll/payrolls/auto-generate', { token: T(), body: { month: '2026-07' } });
    assert.equal(g.status, 200);
    const row = await query("SELECT LOPDays::float AS lop, NetPay::float AS net FROM Payrolls WHERE EmployeeID = $1 AND Month = '2026-07'", [ctx.attEmp.id]);
    assert.equal(row[0].lop, 0);
    assert.equal(row[0].net, 30000);
  });
});
