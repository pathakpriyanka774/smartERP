// Dashboard and report figures reconcile with the database.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Dashboard & reports', () => {
  const { api, query } = env;

  it('dashboard KPIs equal what the database holds', async () => {
    await api('POST', '/finance/transactions', { token: ctx.admin, body: { type: 'income', amount: 12500, description: 'Test receipt' } });
    const r = await api('GET', '/reports/dashboard', { token: ctx.viewer });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const k = r.body.data.kpis;
    const stock = (await query('SELECT COALESCE(SUM(Quantity * UnitCost), 0)::float AS v FROM InventoryItems'))[0].v;
    assert.equal(k.stockValue, stock);
    const open = (await query("SELECT COUNT(*)::int AS n FROM Orders WHERE Status NOT IN ('cancelled','completed','delivered')"))[0].n;
    assert.equal(k.openOrders, open);
    assert.ok(k.incomeThisMonth >= 12500);
    assert.equal(r.body.data.charts.monthly.length, 6);
  });

  it('total sales excludes cancelled orders', async () => {
    const r = await api('GET', '/reports/reports/sales', { token: ctx.admin });
    const expected = (await query("SELECT COALESCE(SUM(TotalAmount), 0)::float AS v FROM Orders WHERE Status <> 'cancelled'"))[0].v;
    assert.equal(r.body.data.totalSales, expected);
    assert.ok(r.body.data.cancelledCount >= 1);
  });

  it('top products come from what was sold', async () => {
    const r = await api('GET', '/reports/reports/sales', { token: ctx.admin });
    const top = r.body.data.topProducts[0];
    assert.equal(top.name, 'Finished T-Shirts');
  });

  it('serves the inventory and finance reports', async () => {
    assert.equal((await api('GET', '/reports/reports/inventory', { token: ctx.admin })).status, 200);
    assert.equal((await api('GET', '/reports/reports/finance', { token: ctx.admin })).status, 200);
  });
});
