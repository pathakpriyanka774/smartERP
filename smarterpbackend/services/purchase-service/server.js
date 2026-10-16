/**
 * Purchasing: suppliers, purchase orders with approval, goods receipts into
 * stock, and supplier bills matched to what was received.
 *
 *   draft ──submit──▶ submitted ──approve──▶ approved ──receive──▶ partially-received ──▶ received
 *     ▲                  │ return                                   │ close (short)
 *     └──────────────────┘                                          ▼
 *   cancel: draft / submitted / approved with nothing received      closed
 *
 * Approval needs a Manager or Admin, and someone other than the person who
 * raised the order (an Admin may approve their own). Goods are received at
 * the PO price; bills can cover only accepted, not-yet-billed quantities, at
 * the PO price (three-way match). Paying a bill is in the accounting service.
 */
const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService, isAdmin } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, num, int, id, oneOf, date, email, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');
const { pageParams, listPage } = require('../../shared/paginate');
const gst = require('../../shared/gst');
const { withTransaction, conflict, notFound, postJournal, reverseJournal, nextNumber, loadSettings, money, addDays } = require('../../shared/ledger');

const app = express();
const PORT = 5014;

app.use(cors());
app.use(express.json());
protectService(app, { permissions: AREA_PERMISSIONS.purchases });

const { requireDB, health } = initService('Purchase Service');

const STATUSES = ['draft', 'submitted', 'approved', 'partially-received', 'received', 'closed', 'cancelled'];
const canApprove = (user) => isAdmin(user) || (user.role || '').toLowerCase() === 'manager';

// ============================================================= Suppliers ===

const SUPPLIER_COLUMNS = `
  c.ClientID AS id, c.Name AS name, c.Email AS email, c.Phone AS phone, c.GSTIN AS gstin, c.StateCode AS stateCode,
  c.Address AS address, c.City AS city, c.Pincode AS pincode, c.PaymentTermsDays AS paymentTermsDays, c.Status AS status`;

app.get('/suppliers', requireDB, async (req, res) => {
  const p = pageParams(req.query, { defaultSize: 100 });
  try {
    const result = await listPage(getPool().request(), `
      SELECT ${SUPPLIER_COLUMNS},
             (SELECT COALESCE(SUM(b.Total - b.AmountPaid), 0) FROM SupplierBills b
               WHERE b.SupplierID = c.ClientID AND b.Status IN ('open', 'partially-paid')) AS outstanding
      FROM Clients c WHERE c.Type = 'supplier' AND (@Q IS NULL OR c.Name ILIKE @Q OR c.GSTIN ILIKE @Q)`, 'name', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list suppliers');
  }
});

app.post('/suppliers', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, {
    name: str({ required: true, max: 150 }),
    email: email({ max: 150 }),
    phone: str({ max: 30, pattern: /^[+0-9 ()-]{6,30}$/, message: 'phone may contain only digits, spaces, +, - and brackets' }),
    gstin: str({ max: 15 }),
    stateCode: str({ max: 2, pattern: /^\d{2}$/, message: 'state code must be two digits' }),
    address: str({ max: 300 }), city: str({ max: 100 }), pincode: str({ max: 10, pattern: /^\d{6}$/, message: 'pincode must be 6 digits' }),
    paymentTermsDays: int({ min: 0, max: 365 })
  });
  if (errors) return badRequest(res, errors);
  if (v.gstin) {
    v.gstin = v.gstin.toUpperCase();
    if (!gst.isValidGSTIN(v.gstin)) return badRequest(res, ['GSTIN is not valid (format, state code or check digit)']);
    v.stateCode = v.gstin.slice(0, 2);
  }
  if (v.stateCode && !gst.isStateCode(v.stateCode)) return badRequest(res, ['stateCode is not a GST state code']);
  try {
    const r = await getPool().request()
      .input('Name', sql.NVarChar(150), v.name).input('Email', sql.NVarChar(150), v.email || null)
      .input('Phone', sql.NVarChar(30), v.phone || null).input('GSTIN', sql.NVarChar(15), v.gstin || null)
      .input('State', sql.NVarChar(2), v.stateCode || null).input('Address', sql.NVarChar(300), v.address || null)
      .input('City', sql.NVarChar(100), v.city || null).input('Pincode', sql.NVarChar(10), v.pincode || null)
      .input('Terms', sql.Int, v.paymentTermsDays ?? null)
      .query(`INSERT INTO Clients (Name, Type, Email, Phone, Status, GSTIN, StateCode, Address, City, Pincode, PaymentTermsDays)
              VALUES (@Name, 'supplier', @Email, @Phone, 'active', @GSTIN, @State, @Address, @City, @Pincode, @Terms)
              RETURNING ClientID`);
    const s = await getPool().request().input('ID', sql.Int, r.recordset[0].ClientID)
      .query(`SELECT ${SUPPLIER_COLUMNS} FROM Clients c WHERE c.ClientID = @ID`);
    res.status(201).json({ success: true, data: s.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to create supplier');
  }
});

/** Stock items for the PO form (purchasing staff may lack the Inventory permission). */
app.get('/items', requireDB, async (req, res) => {
  const p = pageParams(req.query, { defaultSize: 500 });
  try {
    const result = await listPage(getPool().request(), `
      SELECT ItemID AS id, ItemName AS name, SKU AS sku, Unit AS unit, UnitCost AS unitCost,
             GSTRate AS gstRate, HSNCode AS hsnCode, Quantity AS quantity, ReorderLevel AS reorderLevel
      FROM InventoryItems WHERE IsActive AND (@Q IS NULL OR ItemName ILIKE @Q OR SKU ILIKE @Q)`, 'name', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list items');
  }
});

// ======================================================= Purchase orders ===

const PO_COLUMNS = `
  po.POID AS id, po.PONumber AS poNumber, po.SupplierID AS supplierId, c.Name AS supplierName,
  to_char(po.OrderDate, 'YYYY-MM-DD') AS orderDate, to_char(po.ExpectedDate, 'YYYY-MM-DD') AS expectedDate,
  po.Status AS status, po.Notes AS notes, po.Subtotal AS subtotal, po.TaxAmount AS taxAmount, po.Total AS total,
  po.CreatedBy AS createdById, cu.Username AS createdBy, au.Username AS approvedBy,
  to_char(po.ApprovedAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS approvedAt`;
const PO_FROM = `
  FROM PurchaseOrders po JOIN Clients c ON c.ClientID = po.SupplierID
  LEFT JOIN Users cu ON cu.UserID = po.CreatedBy LEFT JOIN Users au ON au.UserID = po.ApprovedBy`;

const loadPO = async (poId, requester = getPool()) => {
  const r = await requester.request().input('ID', sql.Int, poId).query(`SELECT ${PO_COLUMNS} ${PO_FROM} WHERE po.POID = @ID`);
  const po = r.recordset[0];
  if (!po) return null;
  po.items = (await requester.request().input('ID', sql.Int, poId).query(`
    SELECT pi.POItemID AS id, pi.ItemID AS itemId, pi.Description AS description, pi.Quantity AS quantity,
           pi.UnitPrice AS unitPrice, pi.GSTRate AS gstRate, pi.LineTotal AS lineTotal,
           pi.ReceivedQuantity AS receivedQuantity, pi.RejectedQuantity AS rejectedQuantity, pi.BilledQuantity AS billedQuantity,
           pi.Quantity - pi.ReceivedQuantity AS pendingQuantity, pi.ReceivedQuantity - pi.BilledQuantity AS unbilledQuantity,
           i.Unit AS unit, i.SKU AS sku
    FROM PurchaseOrderItems pi JOIN InventoryItems i ON i.ItemID = pi.ItemID
    WHERE pi.POID = @ID ORDER BY pi.POItemID`)).recordset;
  po.receipts = (await requester.request().input('ID', sql.Int, poId).query(`
    SELECT g.GRNID AS id, g.GRNNumber AS grnNumber, to_char(g.ReceiptDate, 'YYYY-MM-DD') AS receiptDate,
           g.SupplierRef AS supplierRef, g.Notes AS notes,
           SUM(gi.AcceptedQuantity) AS accepted, SUM(gi.RejectedQuantity) AS rejected
    FROM GoodsReceipts g JOIN GoodsReceiptItems gi ON gi.GRNID = g.GRNID
    WHERE g.POID = @ID GROUP BY g.GRNID ORDER BY g.GRNID`)).recordset;
  po.bills = (await requester.request().input('ID', sql.Int, poId).query(`
    SELECT BillID AS id, BillRef AS billRef, SupplierBillNo AS supplierBillNo, to_char(BillDate, 'YYYY-MM-DD') AS billDate,
           Total AS total, AmountPaid AS amountPaid, Status AS status
    FROM SupplierBills WHERE POID = @ID ORDER BY BillID`)).recordset;
  return po;
};

const PO_RULES = (creating) => ({
  supplierId: id({ required: creating }),
  orderDate: date(),
  expectedDate: date(),
  notes: str({ max: 500 })
});
const PO_LINE_RULES = {
  itemId: id({ required: true }),
  description: str({ max: 200 }),
  quantity: int({ required: true, min: 1, max: 10000000 }),
  unitPrice: num({ required: true, min: 0, max: 1e10 }),
  gstRate: oneOf(gst.GST_RATES)
};

const checkPOLines = (items, required) => {
  if (items === undefined) return required ? { errors: ['items: add at least one line'] } : { lines: undefined };
  if (!Array.isArray(items) || !items.length) return { errors: ['items: add at least one line'] };
  if (items.length > 200) return { errors: ['a purchase order can have at most 200 lines'] };
  const errors = [];
  const lines = items.map((raw, i) => {
    const r = check(raw, PO_LINE_RULES);
    if (r.errors) errors.push(...r.errors.map(e => `line ${i + 1}: ${e}`));
    return r.value;
  });
  return { errors: errors.length ? errors : null, lines };
};

const assertSupplier = async (tx, supplierId) => {
  const r = await tx.request().input('ID', sql.Int, supplierId).query("SELECT Type, Status FROM Clients WHERE ClientID = @ID");
  const c = r.recordset[0];
  if (!c) throw Object.assign(new Error('supplierId does not match a supplier'), { status: 400 });
  if (c.Type !== 'supplier') throw Object.assign(new Error('That party is not a supplier (set its type to supplier in Clients & Vendors)'), { status: 400 });
  if (c.Status !== 'active') throw conflict('That supplier is inactive');
};

/** Replace a PO's lines and recompute its totals (tax at each line's GST rate, before intra/inter split). */
const writePOLines = async (tx, poId, lines) => {
  await tx.request().input('ID', sql.Int, poId).query('DELETE FROM PurchaseOrderItems WHERE POID = @ID');
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const it = await tx.request().input('ItemID', sql.Int, l.itemId).query('SELECT ItemName, GSTRate, IsActive FROM InventoryItems WHERE ItemID = @ItemID');
    if (!it.recordset.length) throw Object.assign(new Error(`Stock item ${l.itemId} does not exist`), { status: 400 });
    if (!it.recordset[0].IsActive) throw conflict(`${it.recordset[0].ItemName} is archived; restore it in Inventory to order it`);
    const rate = l.gstRate ?? it.recordset[0].GSTRate ?? 0;
    await tx.request()
      .input('POID', sql.Int, poId).input('ItemID', sql.Int, l.itemId)
      .input('Description', sql.NVarChar(200), l.description || it.recordset[0].ItemName)
      .input('Quantity', sql.Int, l.quantity).input('UnitPrice', sql.Decimal(12, 2), l.unitPrice)
      .input('Rate', sql.Decimal(5, 2), rate)
      .query(`INSERT INTO PurchaseOrderItems (POID, ItemID, Description, Quantity, UnitPrice, GSTRate)
              VALUES (@POID, @ItemID, @Description, @Quantity, @UnitPrice, @Rate)`);
    const taxable = Math.round(l.quantity * Math.round(l.unitPrice * 100));
    subtotal += taxable;
    tax += Math.round(taxable * rate / 100);
  }
  await tx.request().input('ID', sql.Int, poId)
    .input('Subtotal', sql.Decimal(16, 2), subtotal / 100).input('Tax', sql.Decimal(16, 2), tax / 100)
    .query('UPDATE PurchaseOrders SET Subtotal = @Subtotal, TaxAmount = @Tax, Total = @Subtotal + @Tax WHERE POID = @ID');
};

app.get('/purchase-orders', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { status: oneOf([...STATUSES, 'open', 'to-approve']), supplierId: id(), from: date(), to: date() });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Status', sql.NVarChar(20), value.status || null).input('SupplierID', sql.Int, value.supplierId || null)
      .input('From', sql.Date, value.from || null).input('To', sql.Date, value.to || null);
    const result = await listPage(request, `
      SELECT ${PO_COLUMNS},
             (SELECT COALESCE(SUM(Quantity - ReceivedQuantity), 0) FROM PurchaseOrderItems WHERE POID = po.POID) AS pendingQuantity
      ${PO_FROM}
      WHERE (@Status IS NULL OR po.Status = @Status
             OR (@Status = 'open' AND po.Status IN ('approved', 'partially-received'))
             OR (@Status = 'to-approve' AND po.Status = 'submitted'))
        AND (@SupplierID IS NULL OR po.SupplierID = @SupplierID)
        AND (@From IS NULL OR po.OrderDate >= @From) AND (@To IS NULL OR po.OrderDate <= @To)
        AND (@Q IS NULL OR po.PONumber ILIKE @Q OR c.Name ILIKE @Q)`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list purchase orders');
  }
});

app.get('/purchase-orders/:id', requireDB, async (req, res) => {
  const poId = routeId(req.params.id);
  if (!poId) return badRequest(res, ['Invalid purchase order id']);
  try {
    const po = await loadPO(poId);
    if (!po) return res.status(404).json({ success: false, message: 'Purchase order not found' });
    res.json({ success: true, data: { ...po, canApprove: po.status === 'submitted' && canApprove(req.user) && (isAdmin(req.user) || po.createdById !== req.user.id) } });
  } catch (error) {
    sendError(res, error, 'Failed to load purchase order');
  }
});

app.post('/purchase-orders', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, PO_RULES(true));
  const { errors: lineErrors, lines } = checkPOLines(req.body?.items, true);
  const all = [...(errors || []), ...(lineErrors || [])];
  const orderDate = v.orderDate || zonedToday();
  if (v.expectedDate && v.expectedDate < orderDate) all.push('expectedDate cannot be before orderDate');
  if (all.length) return badRequest(res, all);
  try {
    const poId = await withTransaction(async (tx) => {
      await assertSupplier(tx, v.supplierId);
      const { number } = await nextNumber(tx, 'PO', orderDate);
      const r = await tx.request()
        .input('Number', sql.NVarChar(16), number).input('SupplierID', sql.Int, v.supplierId)
        .input('OrderDate', sql.Date, orderDate).input('Expected', sql.Date, v.expectedDate || null)
        .input('Notes', sql.NVarChar(500), v.notes || null).input('UserID', sql.Int, req.user.id)
        .query(`INSERT INTO PurchaseOrders (PONumber, SupplierID, OrderDate, ExpectedDate, Notes, CreatedBy)
                VALUES (@Number, @SupplierID, @OrderDate, @Expected, @Notes, @UserID) RETURNING POID`);
      const newId = r.recordset[0].POID;
      await writePOLines(tx, newId, lines);
      return newId;
    });
    res.status(201).json({ success: true, data: await loadPO(poId) });
  } catch (error) {
    sendError(res, error, 'Failed to create purchase order');
  }
});

/** Lock a PO and check its status is one of `allowed`. */
const lockPO = async (tx, poId, allowed, action) => {
  const r = await tx.request().input('ID', sql.Int, poId)
    .query('SELECT POID, PONumber, Status, CreatedBy, SupplierID FROM PurchaseOrders WHERE POID = @ID FOR UPDATE');
  const po = r.recordset[0];
  if (!po) throw notFound('Purchase order not found');
  if (allowed && !allowed.includes(po.Status)) throw conflict(`A ${po.Status} purchase order cannot be ${action}`);
  return po;
};

app.put('/purchase-orders/:id', requireDB, async (req, res) => {
  const poId = routeId(req.params.id);
  if (!poId) return badRequest(res, ['Invalid purchase order id']);
  const { errors, value: v } = check(req.body, PO_RULES(false));
  const { errors: lineErrors, lines } = checkPOLines(req.body?.items, false);
  const all = [...(errors || []), ...(lineErrors || [])];
  if (all.length) return badRequest(res, all);
  try {
    const has = (k) => Object.prototype.hasOwnProperty.call(req.body || {}, k);
    await withTransaction(async (tx) => {
      await lockPO(tx, poId, ['draft'], 'edited (only drafts can be edited; return it to draft first)');
      if (v.supplierId) await assertSupplier(tx, v.supplierId);
      await tx.request().input('ID', sql.Int, poId)
        .input('SupplierID', sql.Int, v.supplierId || null).input('OrderDate', sql.Date, v.orderDate || null)
        .input('Expected', sql.Date, v.expectedDate || null).input('Notes', sql.NVarChar(500), v.notes ?? null)
        // Sending expectedDate or notes as "" or null clears it; leaving it out keeps it.
        .input('ClearExpected', sql.Bit, has('expectedDate') && !v.expectedDate)
        .input('ClearNotes', sql.Bit, has('notes') && !v.notes)
        .query(`UPDATE PurchaseOrders SET SupplierID = COALESCE(@SupplierID, SupplierID), OrderDate = COALESCE(@OrderDate, OrderDate),
                  ExpectedDate = CASE WHEN @ClearExpected THEN NULL ELSE COALESCE(@Expected, ExpectedDate) END,
                  Notes = CASE WHEN @ClearNotes THEN NULL ELSE COALESCE(@Notes, Notes) END WHERE POID = @ID`);
      if (lines) await writePOLines(tx, poId, lines);
    });
    res.json({ success: true, data: await loadPO(poId) });
  } catch (error) {
    sendError(res, error, 'Failed to update purchase order');
  }
});

/** Status steps that need no extra input. */
const STEP = {
  submit:  { from: ['draft'], to: 'submitted', verb: 'submitted', set: 'SubmittedAt = LOCALTIMESTAMP' },
  return:  { from: ['submitted'], to: 'draft', verb: 'returned to draft', set: 'SubmittedAt = NULL' },
  approve: { from: ['submitted'], to: 'approved', verb: 'approved', set: 'ApprovedBy = @UserID, ApprovedAt = LOCALTIMESTAMP' },
  cancel:  { from: ['draft', 'submitted', 'approved'], to: 'cancelled', verb: 'cancelled', set: 'ClosedAt = LOCALTIMESTAMP' },
  close:   { from: ['partially-received'], to: 'closed', verb: 'closed (only a partly received order can be short-closed)', set: 'ClosedAt = LOCALTIMESTAMP' }
};

app.post('/purchase-orders/:id/:step(submit|return|approve|cancel|close)', requireDB, async (req, res) => {
  const poId = routeId(req.params.id);
  if (!poId) return badRequest(res, ['Invalid purchase order id']);
  const step = STEP[req.params.step];
  try {
    await withTransaction(async (tx) => {
      const po = await lockPO(tx, poId, step.from, step.verb);
      if (req.params.step === 'approve') {
        if (!canApprove(req.user)) throw Object.assign(new Error('Only a Manager or Admin can approve purchase orders'), { status: 403 });
        if (po.CreatedBy === req.user.id && !isAdmin(req.user)) {
          throw Object.assign(new Error('You cannot approve a purchase order you raised; ask another Manager or an Admin'), { status: 403 });
        }
      }
      if (req.params.step === 'return' && !canApprove(req.user) && po.CreatedBy !== req.user.id) {
        throw Object.assign(new Error('Only the requester, a Manager or an Admin can return this order to draft'), { status: 403 });
      }
      if (req.params.step === 'cancel') {
        const got = await tx.request().input('ID', sql.Int, poId)
          .query('SELECT COALESCE(SUM(ReceivedQuantity), 0) AS n FROM PurchaseOrderItems WHERE POID = @ID');
        if (got.recordset[0].n > 0) throw conflict('Goods have been received against this order; close it instead of cancelling');
      }
      await tx.request().input('ID', sql.Int, poId).input('To', sql.NVarChar(20), step.to).input('UserID', sql.Int, req.user.id)
        .query(`UPDATE PurchaseOrders SET Status = @To, ${step.set} WHERE POID = @ID`);
    });
    res.json({ success: true, data: await loadPO(poId) });
  } catch (error) {
    sendError(res, error, 'Failed to update purchase order');
  }
});

// ========================================================= Goods receipt ===

app.post('/purchase-orders/:id/receipts', requireDB, async (req, res) => {
  const poId = routeId(req.params.id);
  if (!poId) return badRequest(res, ['Invalid purchase order id']);
  const { errors, value: v } = check(req.body, {
    receiptDate: date(), supplierRef: str({ max: 60 }), notes: str({ max: 300 })
  });
  const all = [...(errors || [])];
  const raw = req.body?.lines;
  if (!Array.isArray(raw) || !raw.length) all.push('lines: enter what was received');
  const lines = (Array.isArray(raw) ? raw : []).map((l, i) => {
    const r = check(l, {
      poItemId: id({ required: true }),
      acceptedQuantity: int({ min: 0, max: 10000000 }),
      rejectedQuantity: int({ min: 0, max: 10000000 }),
      rejectReason: str({ max: 200 })
    });
    if (r.errors) all.push(...r.errors.map(e => `line ${i + 1}: ${e}`));
    r.value.acceptedQuantity = r.value.acceptedQuantity || 0;
    r.value.rejectedQuantity = r.value.rejectedQuantity || 0;
    if (r.value.rejectedQuantity > 0 && !r.value.rejectReason) all.push(`line ${i + 1}: give a reason for the rejected quantity`);
    return r.value;
  }).filter(l => l.acceptedQuantity + l.rejectedQuantity > 0);
  if (!all.length && !lines.length) all.push('lines: nothing was received');
  const receiptDate = v.receiptDate || zonedToday();
  if (receiptDate > zonedToday()) all.push('receiptDate cannot be in the future');
  if (all.length) return badRequest(res, all);

  try {
    const grnId = await withTransaction(async (tx) => {
      const po = await lockPO(tx, poId, ['approved', 'partially-received'], 'received against (it must be approved)');
      const items = new Map((await tx.request().input('ID', sql.Int, poId)
        .query('SELECT * FROM PurchaseOrderItems WHERE POID = @ID FOR UPDATE')).recordset.map(i => [i.POItemID, i]));
      const { number } = await nextNumber(tx, 'GRN', receiptDate);
      const g = await tx.request()
        .input('Number', sql.NVarChar(16), number).input('POID', sql.Int, poId).input('Date', sql.Date, receiptDate)
        .input('Ref', sql.NVarChar(60), v.supplierRef || null).input('Notes', sql.NVarChar(300), v.notes || null)
        .input('UserID', sql.Int, req.user.id)
        .query(`INSERT INTO GoodsReceipts (GRNNumber, POID, ReceiptDate, SupplierRef, Notes, CreatedBy)
                VALUES (@Number, @POID, @Date, @Ref, @Notes, @UserID) RETURNING GRNID`);
      const newId = g.recordset[0].GRNID;

      for (const l of lines) {
        const item = items.get(l.poItemId);
        if (!item) throw Object.assign(new Error(`line ${l.poItemId} is not on ${po.PONumber}`), { status: 400 });
        const pending = item.Quantity - item.ReceivedQuantity;
        if (l.acceptedQuantity > pending) {
          throw conflict(`${item.Description}: ${pending} still to receive; ${l.acceptedQuantity} accepted is more than ordered`);
        }
        let movementId = null;
        if (l.acceptedQuantity > 0) {
          const m = await tx.request()
            .input('ItemID', sql.Int, item.ItemID).input('Type', sql.NVarChar(20), 'receipt')
            .input('Quantity', sql.Int, l.acceptedQuantity).input('UnitCost', sql.Decimal(12, 2), item.UnitPrice)
            .input('Reference', sql.NVarChar(100), `${number} / ${po.PONumber}`)
            .input('SourceType', sql.NVarChar(30), 'grn').input('SourceID', sql.Int, newId)
            .input('Notes', sql.NVarChar(300), v.supplierRef ? `Challan ${v.supplierRef}` : null)
            .input('CreatedBy', sql.Int, req.user.id).input('Date', sql.Date, receiptDate)
            .execute('sp_StockMove');
          movementId = m.recordset[0].MovementID;
        }
        await tx.request()
          .input('GRNID', sql.Int, newId).input('POItemID', sql.Int, l.poItemId)
          .input('Accepted', sql.Int, l.acceptedQuantity).input('Rejected', sql.Int, l.rejectedQuantity)
          .input('Reason', sql.NVarChar(200), l.rejectReason || null).input('MovementID', sql.Int, movementId)
          .query(`INSERT INTO GoodsReceiptItems (GRNID, POItemID, AcceptedQuantity, RejectedQuantity, RejectReason, MovementID)
                  VALUES (@GRNID, @POItemID, @Accepted, @Rejected, @Reason, @MovementID)`);
        await tx.request().input('ID', sql.Int, l.poItemId)
          .input('Accepted', sql.Int, l.acceptedQuantity).input('Rejected', sql.Int, l.rejectedQuantity)
          .query(`UPDATE PurchaseOrderItems SET ReceivedQuantity = ReceivedQuantity + @Accepted,
                    RejectedQuantity = RejectedQuantity + @Rejected WHERE POItemID = @ID`);
      }
      await tx.request().input('ID', sql.Int, poId).query(`
        UPDATE PurchaseOrders SET Status = CASE
          WHEN (SELECT bool_and(ReceivedQuantity >= Quantity) FROM PurchaseOrderItems WHERE POID = @ID) THEN 'received'
          WHEN (SELECT SUM(ReceivedQuantity) FROM PurchaseOrderItems WHERE POID = @ID) > 0 THEN 'partially-received'
          ELSE Status END
        WHERE POID = @ID`);
      return newId;
    });
    const grn = await loadGRN(grnId);
    res.status(201).json({ success: true, data: grn });
  } catch (error) {
    sendError(res, error, 'Failed to record goods receipt');
  }
});

const loadGRN = async (grnId) => {
  const r = await getPool().request().input('ID', sql.Int, grnId).query(`
    SELECT g.GRNID AS id, g.GRNNumber AS grnNumber, g.POID AS poId, po.PONumber AS poNumber, c.Name AS supplierName,
           to_char(g.ReceiptDate, 'YYYY-MM-DD') AS receiptDate, g.SupplierRef AS supplierRef, g.Notes AS notes
    FROM GoodsReceipts g JOIN PurchaseOrders po ON po.POID = g.POID JOIN Clients c ON c.ClientID = po.SupplierID
    WHERE g.GRNID = @ID`);
  const grn = r.recordset[0];
  if (!grn) return null;
  grn.lines = (await getPool().request().input('ID', sql.Int, grnId).query(`
    SELECT gi.POItemID AS poItemId, pi.Description AS description, gi.AcceptedQuantity AS acceptedQuantity,
           gi.RejectedQuantity AS rejectedQuantity, gi.RejectReason AS rejectReason, pi.UnitPrice AS unitPrice
    FROM GoodsReceiptItems gi JOIN PurchaseOrderItems pi ON pi.POItemID = gi.POItemID
    WHERE gi.GRNID = @ID ORDER BY gi.GRNItemID`)).recordset;
  return grn;
};

app.get('/receipts', requireDB, async (req, res) => {
  const p = pageParams(req.query);
  try {
    const result = await listPage(getPool().request(), `
      SELECT g.GRNID AS id, g.GRNNumber AS grnNumber, g.POID AS poId, po.PONumber AS poNumber, c.Name AS supplierName,
             to_char(g.ReceiptDate, 'YYYY-MM-DD') AS receiptDate, g.SupplierRef AS supplierRef,
             (SELECT SUM(AcceptedQuantity) FROM GoodsReceiptItems WHERE GRNID = g.GRNID) AS accepted,
             (SELECT SUM(RejectedQuantity) FROM GoodsReceiptItems WHERE GRNID = g.GRNID) AS rejected
      FROM GoodsReceipts g JOIN PurchaseOrders po ON po.POID = g.POID JOIN Clients c ON c.ClientID = po.SupplierID
      WHERE (@Q IS NULL OR g.GRNNumber ILIKE @Q OR po.PONumber ILIKE @Q OR c.Name ILIKE @Q)`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list receipts');
  }
});

app.get('/receipts/:id', requireDB, async (req, res) => {
  const grnId = routeId(req.params.id);
  if (!grnId) return badRequest(res, ['Invalid receipt id']);
  try {
    const grn = await loadGRN(grnId);
    if (!grn) return res.status(404).json({ success: false, message: 'Receipt not found' });
    res.json({ success: true, data: grn });
  } catch (error) {
    sendError(res, error, 'Failed to load receipt');
  }
});

// ======================================================== Supplier bills ===

const BILL_COLUMNS = `
  b.BillID AS id, b.BillRef AS billRef, b.SupplierBillNo AS supplierBillNo, b.SupplierID AS supplierId, c.Name AS supplierName,
  b.POID AS poId, po.PONumber AS poNumber, to_char(b.BillDate, 'YYYY-MM-DD') AS billDate, to_char(b.DueDate, 'YYYY-MM-DD') AS dueDate,
  b.SupplyType AS supplyType, b.TaxableValue AS taxableValue, b.CGST AS cgst, b.SGST AS sgst, b.IGST AS igst,
  b.RoundOff AS roundOff, b.Total AS total, b.AmountPaid AS amountPaid, (b.Total - b.AmountPaid) AS balanceDue,
  b.Status AS status, b.Notes AS notes,
  CASE WHEN b.Status IN ('open', 'partially-paid') AND b.DueDate < @Today THEN TRUE ELSE FALSE END AS overdue`;
const BILL_FROM = `FROM SupplierBills b JOIN Clients c ON c.ClientID = b.SupplierID LEFT JOIN PurchaseOrders po ON po.POID = b.POID`;

const loadBill = async (billId) => {
  const r = await getPool().request().input('ID', sql.Int, billId).input('Today', sql.Date, zonedToday())
    .query(`SELECT ${BILL_COLUMNS} ${BILL_FROM} WHERE b.BillID = @ID`);
  const bill = r.recordset[0];
  if (!bill) return null;
  bill.lines = (await getPool().request().input('ID', sql.Int, billId).query(`
    SELECT BillItemID AS id, POItemID AS poItemId, Description AS description, Quantity AS quantity, UnitPrice AS unitPrice,
           TaxableValue AS taxableValue, GSTRate AS gstRate, CGST AS cgst, SGST AS sgst, IGST AS igst
    FROM SupplierBillItems WHERE BillID = @ID ORDER BY BillItemID`)).recordset;
  bill.payments = (await getPool().request().input('ID', sql.Int, billId).query(`
    SELECT PaymentID AS id, PaymentNumber AS paymentNumber, to_char(PaymentDate, 'YYYY-MM-DD') AS paymentDate,
           Amount AS amount, Method AS method, Reference AS reference, Status AS status
    FROM Payments WHERE BillID = @ID ORDER BY PaymentID`)).recordset;
  return bill;
};

app.get('/bills', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { status: oneOf(['open', 'partially-paid', 'paid', 'cancelled', 'unpaid', 'overdue']), supplierId: id(), poId: id() });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Status', sql.NVarChar(20), value.status || null).input('SupplierID', sql.Int, value.supplierId || null)
      .input('POID', sql.Int, value.poId || null).input('Today', sql.Date, zonedToday());
    const result = await listPage(request, `
      SELECT ${BILL_COLUMNS} ${BILL_FROM}
      WHERE (@Status IS NULL OR b.Status = @Status
             OR (@Status = 'unpaid' AND b.Status IN ('open', 'partially-paid'))
             OR (@Status = 'overdue' AND b.Status IN ('open', 'partially-paid') AND b.DueDate < @Today))
        AND (@SupplierID IS NULL OR b.SupplierID = @SupplierID) AND (@POID IS NULL OR b.POID = @POID)
        AND (@Q IS NULL OR b.BillRef ILIKE @Q OR b.SupplierBillNo ILIKE @Q OR c.Name ILIKE @Q)`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list bills');
  }
});

app.get('/bills/:id', requireDB, async (req, res) => {
  const billId = routeId(req.params.id);
  if (!billId) return badRequest(res, ['Invalid bill id']);
  try {
    const bill = await loadBill(billId);
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    res.json({ success: true, data: bill });
  } catch (error) {
    sendError(res, error, 'Failed to load bill');
  }
});

/**
 * Book a supplier's invoice against a PO. Only accepted, not-yet-billed
 * quantities can be billed, at the PO price (three-way match: PO, receipt,
 * bill). Posts Dr Goods Received Not Invoiced + Input GST, Cr Accounts Payable.
 */
app.post('/bills', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, {
    poId: id({ required: true }),
    supplierBillNo: str({ required: true, max: 30 }),
    billDate: date({ required: true }),
    dueDate: date(),
    notes: str({ max: 300 })
  });
  const all = [...(errors || [])];
  let wanted = null;
  if (req.body?.lines !== undefined) {
    if (!Array.isArray(req.body.lines) || !req.body.lines.length) all.push('lines must be a non-empty list');
    else wanted = req.body.lines.map((l, i) => {
      const r = check(l, { poItemId: id({ required: true }), quantity: int({ required: true, min: 1, max: 10000000 }) });
      if (r.errors) all.push(...r.errors.map(e => `line ${i + 1}: ${e}`));
      return r.value;
    });
  }
  if (v.billDate && v.billDate > zonedToday()) all.push('billDate cannot be in the future');
  if (v.dueDate && v.billDate && v.dueDate < v.billDate) all.push('dueDate cannot be before billDate');
  if (all.length) return badRequest(res, all);

  try {
    const billId = await withTransaction(async (tx) => {
      const po = await lockPO(tx, v.poId, ['approved', 'partially-received', 'received', 'closed'], 'billed');
      const supplier = (await tx.request().input('ID', sql.Int, po.SupplierID)
        .query('SELECT Name, GSTIN, StateCode, PaymentTermsDays FROM Clients WHERE ClientID = @ID')).recordset[0];
      const settings = await loadSettings(tx);
      const items = (await tx.request().input('ID', sql.Int, v.poId)
        .query('SELECT * FROM PurchaseOrderItems WHERE POID = @ID ORDER BY POItemID FOR UPDATE')).recordset;
      const byId = new Map(items.map(i => [i.POItemID, i]));
      const chosen = wanted || items.filter(i => i.ReceivedQuantity > i.BilledQuantity)
        .map(i => ({ poItemId: i.POItemID, quantity: i.ReceivedQuantity - i.BilledQuantity }));
      if (!chosen.length) throw conflict(`Nothing received on ${po.PONumber} is waiting to be billed`);

      const lines = chosen.map(w => {
        const item = byId.get(w.poItemId);
        if (!item) throw Object.assign(new Error(`line ${w.poItemId} is not on ${po.PONumber}`), { status: 400 });
        const unbilled = item.ReceivedQuantity - item.BilledQuantity;
        if (w.quantity > unbilled) throw conflict(`${item.Description}: ${unbilled} received and not yet billed; ${w.quantity} is more than that`);
        return { poItemId: item.POItemID, description: item.Description, quantity: w.quantity, unitPrice: item.UnitPrice, gstRate: item.GSTRate };
      });

      // Place of supply for a purchase is our state; the supplier's state decides the tax heads.
      const supplierState = (supplier.GSTIN && supplier.GSTIN.slice(0, 2)) || supplier.StateCode || settings.StateCode;
      const supplyType = settings.StateCode ? gst.supplyTypeFor(settings.StateCode, supplierState) : 'intra';
      const tax = gst.computeTax(lines, supplyType);
      const { number } = await nextNumber(tx, 'BILL', v.billDate);
      const dueDate = v.dueDate || addDays(v.billDate, supplier.PaymentTermsDays ?? settings.PaymentTermsDays);

      const ins = await tx.request()
        .input('Ref', sql.NVarChar(16), number).input('No', sql.NVarChar(30), v.supplierBillNo)
        .input('SupplierID', sql.Int, po.SupplierID).input('POID', sql.Int, v.poId)
        .input('BillDate', sql.Date, v.billDate).input('DueDate', sql.Date, dueDate)
        .input('SupplyType', sql.NVarChar(5), supplyType)
        .input('Taxable', sql.Decimal(16, 2), tax.taxableValue).input('CGST', sql.Decimal(16, 2), tax.cgst)
        .input('SGST', sql.Decimal(16, 2), tax.sgst).input('IGST', sql.Decimal(16, 2), tax.igst)
        .input('RoundOff', sql.Decimal(6, 2), tax.roundOff).input('Total', sql.Decimal(16, 2), tax.grandTotal)
        .input('Notes', sql.NVarChar(300), v.notes || null).input('UserID', sql.Int, req.user.id)
        .query(`INSERT INTO SupplierBills (BillRef, SupplierBillNo, SupplierID, POID, BillDate, DueDate, SupplyType,
                  TaxableValue, CGST, SGST, IGST, RoundOff, Total, Notes, CreatedBy)
                VALUES (@Ref, @No, @SupplierID, @POID, @BillDate, @DueDate, @SupplyType, @Taxable, @CGST, @SGST, @IGST,
                  @RoundOff, @Total, @Notes, @UserID) RETURNING BillID`);
      const newId = ins.recordset[0].BillID;
      for (const l of tax.lines) {
        await tx.request()
          .input('BillID', sql.Int, newId).input('POItemID', sql.Int, l.poItemId).input('Description', sql.NVarChar(200), l.description)
          .input('Quantity', sql.Int, l.quantity).input('UnitPrice', sql.Decimal(12, 2), l.unitPrice)
          .input('Taxable', sql.Decimal(16, 2), l.taxableValue).input('Rate', sql.Decimal(5, 2), l.gstRate)
          .input('CGST', sql.Decimal(16, 2), l.cgst).input('SGST', sql.Decimal(16, 2), l.sgst).input('IGST', sql.Decimal(16, 2), l.igst)
          .query(`INSERT INTO SupplierBillItems (BillID, POItemID, Description, Quantity, UnitPrice, TaxableValue, GSTRate, CGST, SGST, IGST)
                  VALUES (@BillID, @POItemID, @Description, @Quantity, @UnitPrice, @Taxable, @Rate, @CGST, @SGST, @IGST)`);
        await tx.request().input('ID', sql.Int, l.poItemId).input('Qty', sql.Int, l.quantity)
          .query('UPDATE PurchaseOrderItems SET BilledQuantity = BilledQuantity + @Qty WHERE POItemID = @ID');
      }
      const entryId = await postJournal(tx, {
        date: v.billDate, reference: `${number} (${v.supplierBillNo})`, sourceType: 'bill', sourceId: newId,
        narration: `Supplier bill from ${supplier.Name} against ${po.PONumber}`, userId: req.user.id,
        lines: [
          { account: '2050', debit: tax.taxableValue },
          { account: '1300', debit: tax.cgst },
          { account: '1301', debit: tax.sgst },
          { account: '1302', debit: tax.igst },
          { account: '4900', debit: tax.roundOff },
          { account: '2000', credit: tax.grandTotal, memo: supplier.Name }
        ]
      });
      await tx.request().input('ID', sql.Int, newId).input('EntryID', sql.Int, entryId)
        .query('UPDATE SupplierBills SET EntryID = @EntryID WHERE BillID = @ID');
      return newId;
    });
    res.status(201).json({ success: true, data: await loadBill(billId) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'This supplier bill number has already been booked for this supplier' });
    sendError(res, error, 'Failed to book bill');
  }
});

app.post('/bills/:id/cancel', requireDB, async (req, res) => {
  const billId = routeId(req.params.id);
  if (!billId) return badRequest(res, ['Invalid bill id']);
  try {
    await withTransaction(async (tx) => {
      const r = await tx.request().input('ID', sql.Int, billId)
        .query('SELECT BillRef, Status, AmountPaid, EntryID FROM SupplierBills WHERE BillID = @ID FOR UPDATE');
      const bill = r.recordset[0];
      if (!bill) throw notFound('Bill not found');
      if (bill.Status === 'cancelled') throw conflict(`${bill.BillRef} is already cancelled`);
      if (bill.AmountPaid > 0) throw conflict(`${bill.BillRef} has payments against it; void them first`);
      const reversal = await reverseJournal(tx, bill.EntryID, { date: zonedToday(), userId: req.user.id, narration: `Bill ${bill.BillRef} cancelled` });
      await tx.request().input('ID', sql.Int, billId).query(`
        UPDATE PurchaseOrderItems pi SET BilledQuantity = pi.BilledQuantity - bi.Quantity
        FROM SupplierBillItems bi WHERE bi.BillID = @ID AND bi.POItemID = pi.POItemID`);
      await tx.request().input('ID', sql.Int, billId).input('Rev', sql.Int, reversal).input('UserID', sql.Int, req.user.id)
        .query(`UPDATE SupplierBills SET Status = 'cancelled', CancelEntryID = @Rev, CancelledAt = LOCALTIMESTAMP, CancelledBy = @UserID
                WHERE BillID = @ID`);
    });
    res.json({ success: true, data: await loadBill(billId) });
  } catch (error) {
    sendError(res, error, 'Failed to cancel bill');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`🧾 Purchase Service running on http://${SERVICE_HOST}:${PORT}`);
});
