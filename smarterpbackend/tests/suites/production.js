// Production linked to materials and finished goods; business rules enforced.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

module.exports = (env, ctx) => describe('Production ↔ materials', () => {
  const { api, query } = env;
  let prodOrder, task, cotton, tshirts;

  before(async () => {
    cotton = ctx.items['Cotton Fabric'];       // 5000 m
    tshirts = ctx.items['Finished T-Shirts'];  // 250 after the orders suite
    // Style ST001 (T-shirt) uses 1.2 m of Cotton Fabric (MAT001) per piece in the seed costing.
    const mat = (await query("SELECT MaterialID FROM Materials WHERE MaterialCode = 'MAT001'"))[0].materialid;
    const style = (await query("SELECT StyleID FROM Styles WHERE StyleCode = 'ST001'"))[0].styleid;
    ctx.styleId = style;
    const link = await api('PUT', `/costing/materials/${mat}/stock-item`, { token: ctx.admin, body: { inventoryItemId: cotton.id } });
    assert.equal(link.status, 200, JSON.stringify(link.body));
    const fin = await api('PUT', `/costing/styles/${style}/finished-item`, { token: ctx.admin, body: { inventoryItemId: tshirts.id } });
    assert.equal(fin.status, 200);
  });

  it('creates a production order from a sales order', async () => {
    const so = await api('POST', '/orders/orders', { token: ctx.admin, body: { clientName: 'Make-to-order Co', items: [{ itemId: tshirts.id, quantity: 100, unitPrice: 40 }] } });
    await api('POST', `/orders/orders/${so.body.data.id}/status`, { token: ctx.admin, body: { status: 'confirmed' } });
    const r = await api('POST', '/production/orders', { token: ctx.admin, body: { styleId: ctx.styleId, quantity: 100, salesOrderId: so.body.data.id, priority: 'High', deadlineDate: '2099-12-31' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.match(r.body.data.OrderCode, /^PRD-\d{5}$/);
    prodOrder = r.body.data;
    const status = (await query('SELECT Status FROM Orders WHERE OrderID = $1', [so.body.data.id]))[0].status;
    assert.equal(status, 'in-production');
  });

  it('shows the material requirement against stock', async () => {
    const r = await api('GET', `/production/orders/${prodOrder.OrderID}/materials`, { token: ctx.admin });
    assert.equal(r.status, 200);
    const fabric = r.body.data.materials.find(m => m.InventoryItemID === cotton.id);
    assert.equal(fabric.Required, 120);                  // 1.2 m × 100 pieces
    assert.equal(fabric.Shortage, 0);
  });

  it('allocates, sets a task, and rejects over-target or negative output', async () => {
    const machine = (await query("SELECT MachineID FROM Machines WHERE Status = 'Available' ORDER BY MachineID LIMIT 1"))[0].machineid;
    const alloc = await api('POST', '/production/machines/allocate', { token: ctx.admin, body: { machineId: machine, employeeId: ctx.employee.id, orderId: prodOrder.OrderID, shiftTime: 'Morning' } });
    assert.equal(alloc.status, 201, JSON.stringify(alloc.body));
    const again = await api('POST', '/production/machines/allocate', { token: ctx.admin, body: { machineId: machine, employeeId: ctx.inspector.id, orderId: prodOrder.OrderID, shiftTime: 'Evening' } });
    assert.equal(again.status, 409, 'an occupied machine is refused with 409, not "success"');
    ctx.allocationId = (await query('SELECT AllocationID FROM MachineAllocations WHERE MachineID = $1 AND Status = $2', [machine, 'Active']))[0].allocationid;

    const t = await api('POST', '/production/tasks/create', { token: ctx.admin, body: { allocationId: ctx.allocationId, targetPieces: 100 } });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    task = t.body.data;
    assert.equal((await api('POST', '/production/production/record', { token: ctx.admin, body: { taskId: task.TaskID, piecesCompleted: 5000 } })).status, 409);
    assert.equal((await api('POST', '/production/production/record', { token: ctx.admin, body: { taskId: task.TaskID, piecesCompleted: -100 } })).status, 400);
  });

  it('consumes materials from stock when output is recorded', async () => {
    const r = await api('POST', '/production/production/record', { token: ctx.admin, body: { taskId: task.TaskID, piecesCompleted: 60 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const fabric = (await query('SELECT Quantity FROM InventoryItems WHERE ItemID = $1', [cotton.id]))[0];
    assert.equal(fabric.quantity, 5000 - 72);           // 1.2 × 60
    const mv = await query("SELECT Quantity FROM StockMovements WHERE ItemID = $1 AND MovementType = 'consumption'", [cotton.id]);
    assert.equal(mv[0].quantity, -72);
  });

  it('rolls back the whole recording when a material is short', async () => {
    // Through the stock ledger, like any real issue, so stock value stays in the books.
    await query('UPDATE InventoryItems SET ReservedQuantity = 0 WHERE ItemID = $1', [cotton.id]);
    const onHand = (await query('SELECT Quantity FROM InventoryItems WHERE ItemID = $1', [cotton.id]))[0].quantity;
    await query("SELECT * FROM sp_StockMove($1, 'issue', $2)", [cotton.id, 10 - onHand]);
    const before = (await query('SELECT CompletedPieces FROM ProductionTasks WHERE TaskID = $1', [task.TaskID]))[0].completedpieces;
    const r = await api('POST', '/production/production/record', { token: ctx.admin, body: { taskId: task.TaskID, piecesCompleted: 40 } });
    assert.equal(r.status, 409);
    assert.match(r.body.message, /Not enough stock of "Cotton Fabric"/);
    const after = (await query('SELECT CompletedPieces FROM ProductionTasks WHERE TaskID = $1', [task.TaskID]))[0].completedpieces;
    assert.equal(after, before, 'no partial recording');
    await query("SELECT * FROM sp_StockMove($1, 'receipt', $2, 8.50)", [cotton.id, onHand - 10]);
  });

  it('completes the production order when the quantity is reached', async () => {
    const r = await api('POST', '/production/production/record', { token: ctx.admin, body: { taskId: task.TaskID, piecesCompleted: 40 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const po = (await query('SELECT Status, CompletedQuantity FROM ProductionOrders WHERE OrderID = $1', [prodOrder.OrderID]))[0];
    assert.equal(po.status, 'Completed');
    assert.equal(po.completedquantity, 100);
  });

  it('validates inspections and adds approved pieces to finished goods', async () => {
    const pending = await api('GET', '/production/quality/pending', { token: ctx.admin });
    const batch = pending.body.data.find(b => b.PiecesCompleted === 60);
    const badSum = await api('POST', '/production/quality/complete-inspection', { token: ctx.admin, body: { inspection_id: batch.ProductionID, pieces_inspected: 10, pieces_approved: 50, pieces_rejected: 40 } });
    assert.equal(badSum.status, 400);
    const before = (await query('SELECT Quantity FROM InventoryItems WHERE ItemID = $1', [tshirts.id]))[0].quantity;
    const ok = await api('POST', '/production/quality/complete-inspection', { token: ctx.admin, body: { inspection_id: batch.ProductionID, inspector_id: ctx.inspector.id, pieces_inspected: 60, pieces_approved: 58, pieces_rejected: 2 } });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.finishedGoodsAdded, 58);
    const after = (await query('SELECT Quantity FROM InventoryItems WHERE ItemID = $1', [tshirts.id]))[0].quantity;
    assert.equal(after, before + 58);
    // The same batch cannot be inspected twice.
    const twice = await api('POST', '/production/quality/complete-inspection', { token: ctx.admin, body: { inspection_id: batch.ProductionID, pieces_inspected: 1, pieces_approved: 1, pieces_rejected: 0 } });
    assert.equal(twice.status, 409);
  });

  it('keeps production reports available', async () => {
    const r = await api('GET', '/reports/reports/production', { token: ctx.admin });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.efficiency, 100);
    assert.equal((await api('GET', '/production/planning/employee-performance', { token: ctx.admin })).status, 200);
  });

  it('releases a machine allocation', async () => {
    const r = await api('POST', `/production/allocations/${ctx.allocationId}/release`, { token: ctx.admin });
    assert.equal(r.status, 200);
    assert.equal((await api('POST', `/production/allocations/${ctx.allocationId}/release`, { token: ctx.admin })).status, 409);
  });
});
