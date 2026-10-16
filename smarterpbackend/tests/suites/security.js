// Authentication, permission enforcement and the two bypasses the audit found
// (direct service ports; page-builder data sources).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Security & permissions', () => {
  const { api, direct, token } = env;

  before(async () => {
    const admin = await api('POST', '/auth/signup', { body: { name: 'test-admin', email: 'admin@test.example', password: 'test-pass-123' } });
    assert.equal(admin.status, 200);
    ctx.admin = admin.body.token;
    ctx.adminUser = admin.body.user;

    const mkUser = async (name, permissions) => {
      const r = await api('POST', '/auth/users', { token: ctx.admin, body: { name, email: `${name}@test.example`, password: 'test-pass-123', role: 'Employee', permissions } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const login = await api('POST', '/auth/login', { body: { email: `${name}@test.example`, password: 'test-pass-123' } });
      return login.body.token;
    };
    ctx.sales = await mkUser('sales', ['orders']);
    ctx.viewer = await mkUser('viewer', ['dashboard']);
    ctx.menus = await mkUser('menus', ['menu-manager']);
  });

  it('makes the first account Admin and later ones Employee', async () => {
    assert.equal(ctx.adminUser.role, 'Admin');
    const second = await api('POST', '/auth/signup', { body: { name: 'second', email: 'second@test.example', password: 'test-pass-123', role: 'Admin' } });
    assert.equal(second.body.user.role, 'Employee');
  });

  it('rejects missing, expired, forged and unsigned tokens', async () => {
    assert.equal((await api('GET', '/orders/orders')).status, 401);
    assert.equal((await api('GET', '/orders/orders', { token: token({ id: 1, role: 'Admin' }, { expiresIn: -10 }) })).status, 401);
    const forged = require('jsonwebtoken').sign({ id: 1, role: 'Admin' }, 'wrong-secret');
    assert.equal((await api('GET', '/orders/orders', { token: forged })).status, 401);
    const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' +
      Buffer.from('{"id":1,"role":"Admin"}').toString('base64url') + '.';
    assert.equal((await api('GET', '/orders/orders', { token: none })).status, 401);
  });

  it('blocks an area the user lacks, at the gateway', async () => {
    assert.equal((await api('GET', '/orders/orders', { token: ctx.sales })).status, 200);
    assert.equal((await api('GET', '/payroll/employees', { token: ctx.sales })).status, 403);
  });

  it('blocks the same area on the service port itself (no gateway bypass)', async () => {
    const r = await direct('payroll', '/employees', ctx.sales);
    assert.equal(r.status, 403);
    assert.equal(r.body.data, undefined, 'no salary data may be returned');
    assert.equal((await direct('payroll', '/employees', ctx.admin)).status, 200);
  });

  it('page-builder data sources require the owning area permission', async () => {
    const emp = await api('GET', '/builder/datasources/employees/rows', { token: ctx.sales });
    const att = await api('GET', '/builder/datasources/attendance/rows', { token: ctx.sales });
    assert.equal(emp.status, 403);
    assert.equal(att.status, 403);
    assert.equal((await api('GET', '/builder/datasources/employees/aggregate?groupBy=Department', { token: ctx.sales })).status, 403);
    assert.equal((await api('GET', '/builder/datasources/orders/rows', { token: ctx.sales })).status, 200);
    const list = await api('GET', '/builder/datasources', { token: ctx.sales });
    assert.deepEqual(list.body.data.map(s => s.key), ['orders']);
  });

  it('dashboard permission opens the dashboard but not detailed reports', async () => {
    assert.equal((await api('GET', '/reports/dashboard', { token: ctx.viewer })).status, 200);
    assert.equal((await api('GET', '/reports/reports/sales', { token: ctx.viewer })).status, 403);
  });

  it('hides inactive pages from non-authors', async () => {
    const page = await api('POST', '/builder/pages', { token: ctx.admin, body: { pageKey: 'draft-page', title: 'Draft', layout: { rows: [] }, status: 'Inactive' } });
    assert.equal(page.status, 200);
    assert.equal((await api('GET', '/builder/pages/draft-page', { token: ctx.sales })).status, 404);
    assert.equal((await api('GET', '/builder/pages/draft-page', { token: ctx.admin })).status, 200);
  });

  it('lets a Menu Manager user save menus with their own permission', async () => {
    const r = await api('POST', '/builder/menus', { token: ctx.menus, body: { label: 'Test Menu' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  it('does not leak internals when a request is malformed', async () => {
    const r = await api('POST', '/orders/orders', { token: ctx.admin, raw: '{"clientName": "broken' });
    assert.equal(r.status, 400);
  });
});
