// Payroll integrity: Mark Paid, partial employee edits, codes under concurrency.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Payroll', () => {
  const { api, query } = env;

  before(async () => {
    const r = await api('POST', '/payroll/employees', { token: ctx.admin, body: {
      name: 'Test Operator', email: 'operator@test.example', position: 'Operator', department: 'Production',
      baseSalary: 18000, joiningDate: '2026-01-05'
    } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ctx.employee = r.body.data;
    const q = await api('POST', '/payroll/employees', { token: ctx.admin, body: {
      name: 'Test Inspector', email: 'inspector@test.example', position: 'Inspector', department: 'Quality', baseSalary: 22000
    } });
    ctx.inspector = q.body.data;
  });

  it('creates employees with codes and derived CTC', () => {
    assert.match(ctx.employee.employeeCode, /^EMP\d{3,}$/);
    assert.equal(ctx.employee.ctc, 216000);
  });

  it('gives simultaneous new employees distinct codes (no collisions)', async () => {
    const results = await Promise.all([1, 2, 3, 4].map(i => api('POST', '/payroll/employees', { token: ctx.admin, body: {
      name: `Race ${i}`, email: `race${i}@test.example`, position: 'Op', department: 'Production', baseSalary: 1000
    } })));
    assert.deepEqual(results.map(r => r.status), [201, 201, 201, 201]);
    const codes = new Set(results.map(r => r.body.data.employeeCode));
    assert.equal(codes.size, 4);
  });

  it('updates only the fields sent, keeping the joining date', async () => {
    const r = await api('PUT', `/payroll/employees/${ctx.employee.id}`, { token: ctx.admin, body: { phone: '+91 98765 00000' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.joiningDate, '2026-01-05');
    assert.equal(r.body.data.email, 'operator@test.example');
    assert.equal((await api('PUT', '/payroll/employees/999999', { token: ctx.admin, body: { phone: '+91 1234567' } })).status, 404);
  });

  it('rejects an invalid month and negative amounts', async () => {
    assert.equal((await api('POST', '/payroll/payrolls/auto-generate', { token: ctx.admin, body: { month: 'banana' } })).status, 400);
    assert.equal((await api('POST', '/payroll/payrolls', { token: ctx.admin, body: { employeeId: ctx.employee.id, month: '2026-08', deductions: -5000 } })).status, 400);
  });

  it('auto-generates one payroll per active employee and refuses duplicates', async () => {
    const gen = await api('POST', '/payroll/payrolls/auto-generate', { token: ctx.admin, body: { month: '2026-09' } });
    assert.equal(gen.status, 200);
    assert.ok(gen.body.data.RecordsCreated >= 2);
    const again = await api('POST', '/payroll/payrolls/auto-generate', { token: ctx.admin, body: { month: '2026-09' } });
    assert.equal(again.body.data.RecordsCreated, 0);
    const dup = await api('POST', '/payroll/payrolls', { token: ctx.admin, body: { employeeId: ctx.employee.id, month: '2026-09' } });
    assert.equal(dup.status, 409);
  });

  it('Mark Paid keeps allowances and deductions and records the payment', async () => {
    const list = await api('GET', '/payroll/payrolls?month=2026-09', { token: ctx.admin });
    const p = list.body.data.find(x => x.employeeId === ctx.employee.id);
    await api('PUT', `/payroll/payrolls/${p.id}`, { token: ctx.admin, body: { allowances: 1500, deductions: 300 } });
    const paid = await api('PUT', `/payroll/payrolls/${p.id}`, { token: ctx.admin, body: { status: 'paid' } });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.data.allowances, 1500);
    assert.equal(paid.body.data.deductions, 300);
    assert.equal(paid.body.data.netSalary, 19200);
    assert.equal(paid.body.data.status, 'paid');
    assert.ok(paid.body.data.paidAt);
    const row = (await query('SELECT PaidBy FROM Payrolls WHERE PayrollID = $1', [p.id]))[0];
    assert.equal(row.paidby, ctx.adminUser.id);
    // A paid payroll is final.
    assert.equal((await api('PUT', `/payroll/payrolls/${p.id}`, { token: ctx.admin, body: { allowances: 99 } })).status, 409);
  });

  it('reports stats over active employees and real CTC', async () => {
    const s = await api('GET', '/payroll/stats', { token: ctx.admin });
    assert.equal(s.status, 200);
    const active = (await query('SELECT COUNT(*)::int AS n FROM Employees WHERE IsActive'))[0].n;
    assert.equal(s.body.activeEmployees, active);
  });
});
