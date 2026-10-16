// Item cost, stock movement history and stock value.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Inventory ledger & valuation', () => {
  const { api, query } = env;

  // The audit's reference scenario.
  const REFERENCE = [
    ['Cotton Fabric', 5000, 8.50, 1000], ['Denim Fabric', 2500, 12.00, 500],
    ['Polyester Thread', 150, 2.50, 200], ['Metal Buttons', 0, 0.15, 100], ['Finished T-Shirts', 850, 15.00, 100]
  ];

  before(async () => {
    await query('DELETE FROM StockMovements');
    await query('DELETE FROM OrderItems');
    await query('UPDATE Materials SET InventoryItemID = NULL');
    await query('UPDATE Styles SET FinishedItemID = NULL');
    await query('DELETE FROM InventoryItems');
    ctx.items = {};
    for (const [itemName, quantity, unitCost, reorderLevel] of REFERENCE) {
      const r = await api('POST', '/inventory/inventory', { token: ctx.admin, body: { itemName, quantity, unitCost, reorderLevel, unit: 'units' } });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      ctx.items[itemName] = r.body.data;
    }
  });

  it('values the reference stock at 85,625 with 3 in / 1 low / 1 out', async () => {
    const s = await api('GET', '/inventory/inventory/stats', { token: ctx.admin });
    assert.equal(s.body.totalValue, 85625);
    assert.deepEqual([s.body.inStock, s.body.lowStock, s.body.outOfStock], [3, 1, 1]);
  });

  it('records opening stock as a movement', async () => {
    const m = await api('GET', `/inventory/inventory/${ctx.items['Cotton Fabric'].id}/movements`, { token: ctx.admin });
    assert.equal(m.body.data.length, 1);
    assert.equal(m.body.data[0].type, 'opening');
    assert.equal(m.body.data[0].balanceAfter, 5000);
  });

  it('updates the weighted-average cost on a receipt', async () => {
    const id = ctx.items['Polyester Thread'].id;           // 150 @ 2.50
    const r = await api('POST', `/inventory/inventory/${id}/movements`, { token: ctx.admin, body: { type: 'receipt', quantity: 50, unitCost: 4.50, reference: 'PO-1' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.item.quantity, 200);
    assert.equal(r.body.data.item.unitCost, 3);              // (150×2.5 + 50×4.5) ÷ 200
  });

  it('refuses to issue more than is on hand', async () => {
    const r = await api('POST', `/inventory/inventory/${ctx.items['Metal Buttons'].id}/movements`, { token: ctx.admin, body: { type: 'issue', quantity: 1 } });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Not enough stock/);
  });

  it('never oversells under concurrent issues', async () => {
    const created = await api('POST', '/inventory/inventory', { token: ctx.admin, body: { itemName: 'Race Fabric', quantity: 50, unitCost: 1 } });
    const id = created.body.data.id;
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      api('POST', `/inventory/inventory/${id}/movements`, { token: ctx.admin, body: { type: 'issue', quantity: 10 } })));
    assert.equal(results.filter(r => r.status === 201).length, 5);
    const item = await api('GET', `/inventory/inventory/${id}`, { token: ctx.admin });
    assert.equal(item.body.data.quantity, 0);
  });

  it('turns a quantity edit into an adjustment, so history always adds up', async () => {
    const id = ctx.items['Denim Fabric'].id;
    await api('PUT', `/inventory/inventory/${id}`, { token: ctx.admin, body: { quantity: 2400, notes: 'Stock count' } });
    const sum = (await query('SELECT SUM(Quantity)::int AS s FROM StockMovements WHERE ItemID = $1', [id]))[0].s;
    assert.equal(sum, 2400);
    const last = (await api('GET', `/inventory/inventory/${id}/movements`, { token: ctx.admin })).body.data[0];
    assert.equal(last.type, 'adjustment');
    assert.equal(last.quantity, -100);
  });

  it('requires a note for adjustments', async () => {
    const r = await api('POST', `/inventory/inventory/${ctx.items['Denim Fabric'].id}/movements`, { token: ctx.admin, body: { type: 'adjustment', quantity: -1 } });
    assert.equal(r.status, 400);
  });
});
