// Inventory management gaps: archive, sorting, missing-cost filter, categories.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Inventory management', () => {
  const { api } = env;
  const T = () => ctx.admin;

  before(async () => {
    ctx.oldItem = (await api('POST', '/inventory/inventory', { token: T(), body: { itemName: 'Zz Obsolete Label', quantity: 0, unitCost: 1, category: 'Packaging', unit: 'pcs' } })).body.data;
    ctx.noCost = (await api('POST', '/inventory/inventory', { token: T(), body: { itemName: 'Zz Uncosted Zip', quantity: 40, category: 'Trims', unit: 'pcs' } })).body.data;
  });

  it('archives an empty item and hides it from the list, stats and pickers', async () => {
    const r = await api('POST', `/inventory/inventory/${ctx.oldItem.id}/archive`, { token: T() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.isActive, false);
    const list = await api('GET', '/inventory/inventory?q=Obsolete', { token: T() });
    assert.equal(list.body.pagination.total, 0);
    const archived = await api('GET', '/inventory/inventory?q=Obsolete&archived=archived', { token: T() });
    assert.equal(archived.body.pagination.total, 1);
    const catalog = await api('GET', '/orders/orders/catalog/items', { token: T() });
    assert.ok(!catalog.body.data.some(i => i.id === ctx.oldItem.id));
    const stats = await api('GET', '/inventory/inventory/stats', { token: T() });
    assert.ok(stats.body.archived >= 1);
    // Cannot be sold while archived; restore brings it back.
    const order = await api('POST', '/orders/orders', { token: T(), body: { clientName: 'X', items: [{ itemId: ctx.oldItem.id, quantity: 1, unitPrice: 1 }] } });
    assert.equal(order.status, 409);
    assert.equal((await api('POST', `/inventory/inventory/${ctx.oldItem.id}/restore`, { token: T() })).body.data.isActive, true);
  });

  it('refuses to archive an item that still holds stock', async () => {
    const r = await api('POST', `/inventory/inventory/${ctx.noCost.id}/archive`, { token: T() });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /on hand/);
  });

  it('finds items with stock but no unit cost', async () => {
    const r = await api('GET', '/inventory/inventory?missingCost=true&pageSize=500', { token: T() });
    assert.ok(r.body.data.some(i => i.id === ctx.noCost.id));
    assert.ok(r.body.data.every(i => i.unitCost === 0 && i.quantity > 0));
    const stats = await api('GET', '/inventory/inventory/stats', { token: T() });
    assert.ok(stats.body.missingCost >= 1);
  });

  it('sorts on the server by value and quantity', async () => {
    const byValue = (await api('GET', '/inventory/inventory?sort=value&dir=desc&pageSize=500', { token: T() })).body.data;
    const values = byValue.map(i => i.totalValue);
    assert.deepEqual(values, [...values].sort((a, b) => b - a));
    const byQty = (await api('GET', '/inventory/inventory?sort=quantity&dir=asc&pageSize=500', { token: T() })).body.data;
    const qty = byQty.map(i => i.quantity);
    assert.deepEqual(qty, [...qty].sort((a, b) => a - b));
    assert.equal((await api('GET', '/inventory/inventory?sort=password', { token: T() })).status, 400);
  });

  it('lists every category and unit in use', async () => {
    const r = await api('GET', '/inventory/inventory/categories', { token: T() });
    assert.equal(r.status, 200);
    assert.ok(r.body.data.categories.includes('Packaging'));
    assert.ok(r.body.data.units.includes('pcs'));
  });
});
