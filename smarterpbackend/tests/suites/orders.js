// Orders linked to stock: lines, reservation on confirm, issue on dispatch.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Orders ↔ stock', () => {
  const { api, query } = env;
  let tshirts;

  before(async () => {
    tshirts = ctx.items['Finished T-Shirts'];      // 850 on hand
    const c = await api('POST', '/clients/clients', { token: ctx.admin, body: { name: 'Test Retail Co', type: 'retail' } });
    ctx.client = c.body.data;
  });

  it('lets an Orders user pick items and clients without other permissions', async () => {
    assert.equal((await api('GET', '/orders/orders/catalog/items', { token: ctx.sales })).status, 200);
    assert.equal((await api('GET', '/orders/orders/catalog/clients', { token: ctx.sales })).status, 200);
    assert.equal((await api('GET', '/inventory/inventory', { token: ctx.sales })).status, 403);
  });

  it('computes the order total from its lines, ignoring a client-sent total', async () => {
    const r = await api('POST', '/orders/orders', { token: ctx.sales, body: {
      clientId: ctx.client.id, totalAmount: 1, deliveryDate: '2099-01-31',
      items: [{ itemId: tshirts.id, quantity: 600, unitPrice: 50 }, { description: 'Printing', quantity: 600, unitPrice: 5 }]
    } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.totalAmount, 33000);
    assert.equal(r.body.data.clientName, 'Test Retail Co');
    assert.equal(r.body.data.items.length, 2);
    ctx.order = r.body.data;
  });

  it('reserves stock on confirm and reports a shortage without failing', async () => {
    const c = await api('POST', `/orders/orders/${ctx.order.id}/status`, { token: ctx.sales, body: { status: 'confirmed' } });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const line = c.body.data.items.find(l => l.itemId === tshirts.id);
    assert.equal(line.reservedQuantity, 600);
    const item = (await query('SELECT Quantity, ReservedQuantity FROM InventoryItems WHERE ItemID = $1', [tshirts.id]))[0];
    assert.equal(item.reservedquantity, 600);

    // A second order can only reserve what is left (250) and is told so.
    const o2 = await api('POST', '/orders/orders', { token: ctx.sales, body: { clientName: 'Second Co', items: [{ itemId: tshirts.id, quantity: 400, unitPrice: 50 }] } });
    const c2 = await api('POST', `/orders/orders/${o2.body.data.id}/status`, { token: ctx.sales, body: { status: 'confirmed' } });
    assert.equal(c2.body.data.items[0].reservedQuantity, 250);
    assert.ok(c2.body.warnings.some(w => /150 short/.test(w)));
    ctx.order2 = c2.body.data;
  });

  it('refuses status jumps that skip the flow', async () => {
    const r = await api('POST', `/orders/orders/${ctx.order.id}/status`, { token: ctx.sales, body: { status: 'completed' } });
    assert.equal(r.status, 409);
  });

  it('cancelling releases the reservation', async () => {
    const r = await api('POST', `/orders/orders/${ctx.order2.id}/status`, { token: ctx.sales, body: { status: 'cancelled' } });
    assert.equal(r.status, 200);
    const item = (await query('SELECT ReservedQuantity FROM InventoryItems WHERE ItemID = $1', [tshirts.id]))[0];
    assert.equal(item.reservedquantity, 600);
  });

  it('dispatch issues the stock and records a sale movement', async () => {
    const r = await api('POST', `/orders/orders/${ctx.order.id}/status`, { token: ctx.sales, body: { status: 'dispatched' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const item = (await query('SELECT Quantity, ReservedQuantity FROM InventoryItems WHERE ItemID = $1', [tshirts.id]))[0];
    assert.equal(item.quantity, 250);
    assert.equal(item.reservedquantity, 0);
    const sale = await query("SELECT Quantity FROM StockMovements WHERE MovementType = 'sale' AND SourceID = $1", [ctx.order.id]);
    assert.equal(sale[0].quantity, -600);
    // Goods have left: the order can no longer be cancelled.
    assert.equal((await api('POST', `/orders/orders/${ctx.order.id}/status`, { token: ctx.sales, body: { status: 'cancelled' } })).status, 409);
  });

  it('cannot dispatch more than is on hand', async () => {
    const o = await api('POST', '/orders/orders', { token: ctx.sales, body: { clientName: 'Big Co', items: [{ itemId: tshirts.id, quantity: 1000, unitPrice: 50 }] } });
    await api('POST', `/orders/orders/${o.body.data.id}/status`, { token: ctx.sales, body: { status: 'confirmed' } });
    const r = await api('POST', `/orders/orders/${o.body.data.id}/status`, { token: ctx.sales, body: { status: 'dispatched' } });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Not enough stock/);
    // Nothing moved: the failed dispatch rolled back completely.
    const item = (await query('SELECT Quantity FROM InventoryItems WHERE ItemID = $1', [tshirts.id]))[0];
    assert.equal(item.quantity, 250);
    await api('POST', `/orders/orders/${o.body.data.id}/status`, { token: ctx.sales, body: { status: 'cancelled' } });
  });

  it('only lets lines change while the order is pending', async () => {
    const r = await api('PUT', `/orders/orders/${ctx.order.id}`, { token: ctx.sales, body: { items: [{ description: 'X', quantity: 1, unitPrice: 1 }] } });
    assert.equal(r.status, 409);
  });
});
