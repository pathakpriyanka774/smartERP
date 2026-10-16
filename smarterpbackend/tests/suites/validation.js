// Server-side validation of business values: every probe the audit found
// accepted (negative stock, negative amounts, nonsense statuses...) is refused.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Validation', () => {
  const { api, query } = env;
  const bad = async (method, url, body) => {
    const r = await api(method, url, { token: ctx.admin, body });
    assert.equal(r.status, 400, `${method} ${url} ${JSON.stringify(body)} → ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(r.body.message, 'a 400 carries a message the user can act on');
    return r;
  };

  it('rejects negative stock and invalid item values', async () => {
    await bad('POST', '/inventory/inventory', { itemName: 'Neg', quantity: -50 });
    await bad('POST', '/inventory/inventory', { itemName: 'x'.repeat(151) });
    await bad('POST', '/inventory/inventory', { itemName: 'Cost', unitCost: -1 });
    await bad('POST', '/inventory/inventory', { quantity: 5 });
  });

  it('rejects invalid orders', async () => {
    await bad('POST', '/orders/orders', { clientName: 'Neg', totalAmount: -999 });
    await bad('POST', '/orders/orders', { clientName: 'Dates', orderDate: '2026-10-09', deliveryDate: '2020-01-01' });
    await bad('POST', '/orders/orders', { clientName: 'y'.repeat(500) });
    await bad('POST', '/orders/orders', { clientName: 'Prio', priority: 'whenever' });
    await bad('POST', '/orders/orders', { clientName: 'Lines', items: [{ description: 'A', quantity: 0, unitPrice: 5 }] });
    await bad('POST', '/orders/orders', {});
    const ok = await api('POST', '/orders/orders', { token: ctx.admin, body: { clientName: 'Valid Co' } });
    assert.equal(ok.status, 201);
    await bad('PUT', `/orders/orders/${ok.body.data.id}`, { status: 'banana' });
  });

  it('rejects invalid finance entries', async () => {
    await bad('POST', '/finance/transactions', { type: 'income', amount: -5 });
    await bad('POST', '/finance/transactions', { type: 'gift', amount: 5 });
    await bad('POST', '/finance/transactions', { type: 'income', amount: 5, date: '2026-02-30' });
  });

  it('rejects invalid clients', async () => {
    await bad('POST', '/clients/clients', { name: 'Mail', email: 'not-an-email' });
    await bad('POST', '/clients/clients', { name: 'Type', type: 'alien' });
  });

  it('keeps the database from accepting what the API refuses (CHECK constraints)', async () => {
    await assert.rejects(query('INSERT INTO InventoryItems (ItemName, Quantity) VALUES ($1, -1)', ['direct']), /ck_inventory_quantity/i);
    await assert.rejects(query("INSERT INTO FinanceTransactions (Type, Amount) VALUES ('income', -1)"), /ck_finance_amount/i);
  });

  it('answers a bad route id with 400, not 500', async () => {
    assert.equal((await api('GET', '/orders/orders/abc', { token: ctx.admin })).status, 400);
    assert.equal((await api('GET', '/builder/datasources/orders/rows?limit=-5', { token: ctx.admin })).status !== 500, true);
  });
});
