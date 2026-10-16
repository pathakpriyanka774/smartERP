// Purchase orders, approval, goods receipt, supplier bills and payments (F-016, F-017).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { gstinCheckChar } = require('../../shared/gst');

const gstin = (state, pan) => { const b = `${state}${pan}1Z`; return b + gstinCheckChar(b); };

module.exports = (env, ctx) => describe('Purchasing', () => {
  const { api, query } = env;
  const T = () => ctx.admin;

  before(async () => {
    const mk = async (name, role, permissions) => {
      const r = await api('POST', '/auth/users', { token: T(), body: { name, email: `${name}@test.example`, password: 'test-pass-123', role, permissions } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      return (await api('POST', '/auth/login', { body: { email: `${name}@test.example`, password: 'test-pass-123' } })).body.token;
    };
    ctx.buyer = await mk('buyer', 'Employee', ['purchases']);
    ctx.manager = await mk('purchase-manager', 'Manager', ['purchases']);
    ctx.supplier = (await api('POST', '/purchases/suppliers', { token: ctx.buyer, body: { name: 'Test Yarn Mills', gstin: gstin('27', 'DDDDD3333D') } })).body.data;
    ctx.yarn = (await api('POST', '/inventory/inventory', { token: T(), body: { itemName: 'Test Yarn', quantity: 0, unitCost: 0, gstRate: 12 } })).body.data;
  });

  it('a buyer raises a PO with lines and computed totals', async () => {
    const r = await api('POST', '/purchases/purchase-orders', { token: ctx.buyer, body: {
      supplierId: ctx.supplier.id, expectedDate: '2099-01-01', items: [{ itemId: ctx.yarn.id, quantity: 100, unitPrice: 40 }]
    } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.data.poNumber, /^PO\/\d\d-\d\d\/00001$/);
    assert.equal(r.body.data.status, 'draft');
    assert.equal(r.body.data.subtotal, 4000);
    assert.equal(r.body.data.taxAmount, 480);
    assert.equal(r.body.data.total, 4480);
    ctx.po = r.body.data;
  });

  it('refuses a customer as supplier and a PO without lines', async () => {
    assert.equal((await api('POST', '/purchases/purchase-orders', { token: ctx.buyer, body: { supplierId: ctx.localBuyer.id, items: [{ itemId: ctx.yarn.id, quantity: 1, unitPrice: 1 }] } })).status, 400);
    assert.equal((await api('POST', '/purchases/purchase-orders', { token: ctx.buyer, body: { supplierId: ctx.supplier.id, items: [] } })).status, 400);
  });

  it('cannot receive goods before approval', async () => {
    const r = await api('POST', `/purchases/purchase-orders/${ctx.po.id}/receipts`, { token: ctx.buyer, body: { lines: [{ poItemId: ctx.po.items[0].id, acceptedQuantity: 1 }] } });
    assert.equal(r.status, 409);
  });

  it('approval needs a Manager who did not raise the order', async () => {
    assert.equal((await api('POST', `/purchases/purchase-orders/${ctx.po.id}/submit`, { token: ctx.buyer })).status, 200);
    assert.equal((await api('POST', `/purchases/purchase-orders/${ctx.po.id}/approve`, { token: ctx.buyer })).status, 403);
    const own = (await api('POST', '/purchases/purchase-orders', { token: ctx.manager, body: { supplierId: ctx.supplier.id, items: [{ itemId: ctx.yarn.id, quantity: 1, unitPrice: 1 }] } })).body.data;
    await api('POST', `/purchases/purchase-orders/${own.id}/submit`, { token: ctx.manager });
    assert.equal((await api('POST', `/purchases/purchase-orders/${own.id}/approve`, { token: ctx.manager })).status, 403, 'no self-approval');
    assert.equal((await api('POST', `/purchases/purchase-orders/${own.id}/cancel`, { token: ctx.manager })).status, 200);
    const ok = await api('POST', `/purchases/purchase-orders/${ctx.po.id}/approve`, { token: ctx.manager });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.status, 'approved');
    assert.equal(ok.body.data.approvedBy, 'purchase-manager');
  });

  it('a partial receipt with rejections puts only accepted goods into stock at PO cost', async () => {
    const lineId = ctx.po.items[0].id;
    assert.equal((await api('POST', `/purchases/purchase-orders/${ctx.po.id}/receipts`, { token: ctx.buyer, body: { lines: [{ poItemId: lineId, acceptedQuantity: 60, rejectedQuantity: 5 }] } })).status, 400, 'rejections need a reason');
    const r = await api('POST', `/purchases/purchase-orders/${ctx.po.id}/receipts`, { token: ctx.buyer, body: {
      supplierRef: 'DC-778', lines: [{ poItemId: lineId, acceptedQuantity: 60, rejectedQuantity: 5, rejectReason: 'Wet cones' }] } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.data.grnNumber, /^GRN\//);
    const item = (await api('GET', `/inventory/inventory/${ctx.yarn.id}`, { token: T() })).body.data;
    assert.equal(item.quantity, 60);
    assert.equal(item.unitCost, 40);
    const po = (await api('GET', `/purchases/purchase-orders/${ctx.po.id}`, { token: ctx.buyer })).body.data;
    assert.equal(po.status, 'partially-received');
    assert.equal(po.items[0].pendingQuantity, 40, 'rejected goods do not count as received');
    assert.equal(po.items[0].rejectedQuantity, 5);
  });

  it('cannot receive more than ordered', async () => {
    const r = await api('POST', `/purchases/purchase-orders/${ctx.po.id}/receipts`, { token: ctx.buyer, body: { lines: [{ poItemId: ctx.po.items[0].id, acceptedQuantity: 41 }] } });
    assert.equal(r.status, 409);
  });

  it('bills only what was received (three-way match), inter-state GST, once per supplier number', async () => {
    const over = await api('POST', '/purchases/bills', { token: ctx.buyer, body: { poId: ctx.po.id, supplierBillNo: 'TYM/101', billDate: '2026-10-05', lines: [{ poItemId: ctx.po.items[0].id, quantity: 61 }] } });
    assert.equal(over.status, 409);
    const b = await api('POST', '/purchases/bills', { token: ctx.buyer, body: { poId: ctx.po.id, supplierBillNo: 'TYM/101', billDate: '2026-10-05' } });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(b.body.data.supplyType, 'inter');
    assert.equal(b.body.data.taxableValue, 2400);
    assert.equal(b.body.data.igst, 288);
    assert.equal(b.body.data.total, 2688);
    ctx.bill = b.body.data;
    const dup = await api('POST', '/purchases/bills', { token: ctx.buyer, body: { poId: ctx.po.id, supplierBillNo: 'TYM/101', billDate: '2026-10-05' } });
    assert.equal(dup.status, 409);
  });

  it('goods received not invoiced clears when the bill is booked', async () => {
    const grni = await query(`SELECT COALESCE(SUM(jl.Credit - jl.Debit), 0)::float AS n FROM JournalLines jl
      JOIN JournalEntries je ON je.EntryID = jl.EntryID JOIN Accounts a ON a.AccountID = jl.AccountID
      WHERE a.Code = '2050' AND ((je.SourceType = 'stock' AND je.Reference LIKE 'GRN%') OR (je.SourceType = 'bill' AND je.SourceID = $1))`, [ctx.bill.id]);
    assert.equal(grni[0].n, 0);
  });

  it('lists bills awaiting payment in Accounting, for the accounting permission only', async () => {
    const r = await api('GET', '/accounting/payable-bills', { token: T() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = r.body.data.find(x => x.id === ctx.bill.id);
    assert.ok(b, 'the open bill is listed');
    assert.equal(b.balanceDue, 2688);
    assert.ok(r.body.totals.outstanding >= 2688);
    assert.equal((await api('GET', '/accounting/payable-bills', { token: ctx.buyer })).status, 403);
  });

  it('a supplier payment needs the accounting permission and settles the bill', async () => {
    assert.equal((await api('POST', '/accounting/payments', { token: ctx.buyer, body: { direction: 'out', billId: ctx.bill.id, amount: 100 } })).status, 403);
    const p = await api('POST', '/accounting/payments', { token: T(), body: { direction: 'out', billId: ctx.bill.id, amount: 2688, method: 'bank', reference: 'NEFT-1' } });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    const bill = (await api('GET', `/purchases/bills/${ctx.bill.id}`, { token: ctx.buyer })).body.data;
    assert.equal(bill.status, 'paid');
    assert.equal((await api('POST', `/purchases/bills/${ctx.bill.id}/cancel`, { token: ctx.buyer })).status, 409);
    const after = await api('GET', '/accounting/payable-bills', { token: T() });
    assert.ok(!after.body.data.some(x => x.id === ctx.bill.id), 'a paid bill leaves the list');
    const ap = await query("SELECT Balance::float AS b FROM vw_AccountBalances WHERE Code = '2000'");
    assert.equal(ap[0].b, 0, 'payables control account equals open bills (none)');
  });

  it('a partly received PO is short-closed, not cancelled', async () => {
    assert.equal((await api('POST', `/purchases/purchase-orders/${ctx.po.id}/cancel`, { token: ctx.buyer })).status, 409);
    const c = await api('POST', `/purchases/purchase-orders/${ctx.po.id}/close`, { token: ctx.buyer });
    assert.equal(c.status, 200);
    assert.equal(c.body.data.status, 'closed');
  });

  it('inventory in the ledger equals stock value', async () => {
    const r = await query(`SELECT (SELECT Balance FROM vw_AccountBalances WHERE Code = '1200')::float AS ledger,
                                  (SELECT SUM(Quantity * UnitCost) FROM InventoryItems)::float AS stock`);
    assert.equal(r[0].ledger, r[0].stock);
  });
});
