// Immediate revocation and login throttling (F-022), audit trail (F-027), pagination (F-039).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = (env, ctx) => describe('Sessions, audit trail, pagination', () => {
  const { api, direct, query } = env;
  const T = () => ctx.admin;

  before(async () => {
    const r = await api('POST', '/auth/users', { token: T(), body: { name: 'temp-staff', email: 'temp-staff@test.example', password: 'test-pass-123', role: 'Employee', permissions: ['orders'] } });
    ctx.tempId = r.body.data.id;
    ctx.temp = (await api('POST', '/auth/login', { body: { email: 'temp-staff@test.example', password: 'test-pass-123' } })).body.token;
  });

  it('removing a permission takes effect without signing in again', async () => {
    assert.equal((await api('GET', '/orders/orders', { token: ctx.temp })).status, 200);
    await api('PUT', `/auth/users/${ctx.tempId}`, { token: T(), body: { permissions: ['inventory'] } });
    await sleep(1200);
    assert.equal((await api('GET', '/orders/orders', { token: ctx.temp })).status, 403);
    assert.equal((await api('GET', '/inventory/inventory', { token: ctx.temp })).status, 200, 'a granted permission works at once too');
  });

  it('a deactivated user loses access within seconds, at the gateway and the service port', async () => {
    await api('PUT', `/auth/users/${ctx.tempId}`, { token: T(), body: { status: 'Inactive' } });
    await sleep(1200);
    assert.equal((await api('GET', '/inventory/inventory', { token: ctx.temp })).status, 401);
    assert.equal((await direct('inventory', '/inventory', ctx.temp)).status, 401);
    // Reactivating does not revive the old token: its version is stale.
    await api('PUT', `/auth/users/${ctx.tempId}`, { token: T(), body: { status: 'Active' } });
    await sleep(1200);
    assert.equal((await api('GET', '/inventory/inventory', { token: ctx.temp })).status, 401);
  });

  it('signing out ends the session', async () => {
    const t = (await api('POST', '/auth/login', { body: { email: 'temp-staff@test.example', password: 'test-pass-123' } })).body.token;
    assert.equal((await api('GET', '/inventory/inventory', { token: t })).status, 200);
    assert.equal((await api('POST', '/auth/logout', { token: t })).status, 200);
    await sleep(1200);
    assert.equal((await api('GET', '/inventory/inventory', { token: t })).status, 401);
  });

  it('throttles repeated failed logins for an account (429)', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await api('POST', '/auth/login', { body: { email: 'throttle@test.example', password: 'wrong-password' } })).status);
    }
    assert.deepEqual(statuses.slice(0, 5), [401, 401, 401, 401, 401]);
    assert.equal(statuses[5], 429);
  });

  it('records who changed what, with before and after, and never the password hash', async () => {
    const item = (await api('POST', '/inventory/inventory', { token: T(), body: { itemName: 'Audited Item', quantity: 5, unitCost: 2 } })).body.data;
    await api('PUT', `/inventory/inventory/${item.id}`, { token: T(), body: { reorderLevel: 3 } });
    const log = await api('GET', `/auth/audit?table=inventoryitems&recordId=${item.id}`, { token: T() });
    assert.equal(log.status, 200, JSON.stringify(log.body));
    const update = log.body.data.find(e => e.action === 'UPDATE' && e.newData.reorderlevel === 3);
    assert.ok(update, JSON.stringify(log.body.data));
    assert.equal(update.oldData.reorderlevel, 0);
    assert.equal(update.userId, ctx.adminUser.id);
    const users = await query("SELECT COUNT(*)::int AS n FROM AuditLog WHERE TableName = 'users' AND (OldData ? 'passwordhash' OR NewData ? 'passwordhash')");
    assert.equal(users[0].n, 0);
    const logins = await query("SELECT COUNT(*)::int AS n FROM AuditLog WHERE Action IN ('LOGIN', 'LOGIN_FAIL')");
    assert.ok(logins[0].n > 0);
  });

  it('the audit log is append-only and Admin-only', async () => {
    await assert.rejects(query('DELETE FROM AuditLog'), /append-only/);
    assert.equal((await api('GET', '/auth/audit', { token: ctx.sales })).status, 403);
  });

  it('lists come a page at a time with a total', async () => {
    for (let i = 0; i < 3; i++) await api('POST', '/clients/clients', { token: T(), body: { name: `Paged Client ${i}`, type: 'retail' } });
    const p1 = await api('GET', '/clients/clients?page=1&pageSize=2&q=Paged', { token: T() });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.data.length, 2);
    assert.deepEqual({ ...p1.body.pagination }, { page: 1, pageSize: 2, total: 3, totalPages: 2 });
    const p2 = await api('GET', '/clients/clients?page=2&pageSize=2&q=Paged', { token: T() });
    assert.equal(p2.body.data.length, 1);
    const p9 = await api('GET', '/clients/clients?page=9&pageSize=2&q=Paged', { token: T() });
    assert.equal(p9.body.data.length, 0);
    assert.equal(p9.body.pagination.total, 3);
    const huge = await api('GET', '/orders/orders?pageSize=100000', { token: T() });
    assert.equal(huge.body.pagination.pageSize, 500, 'page size is capped');
    // A search pattern is literal: % and _ do not act as wildcards.
    assert.equal((await api('GET', '/clients/clients?q=%25%25', { token: T() })).body.pagination.total, 0);
  });
});
