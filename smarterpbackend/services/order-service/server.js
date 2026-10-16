const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, num, int, id, oneOf, date, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');
const { pageParams, listPage } = require('../../shared/paginate');

const app = express();
const PORT = 5002;

app.use(cors());
app.use(express.json());

// Every route needs a valid token and the Orders permission. Applied in the
// service itself, not only at the gateway, so a request sent straight to this
// port is refused too.
protectService(app, { permissions: AREA_PERMISSIONS.orders });

const { requireDB, health } = initService('Order Service');

const STATUSES = ['pending', 'confirmed', 'in-production', 'ready', 'dispatched', 'delivered', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// Allowed status changes. Stock moves at two of them: confirming reserves
// what is available, dispatching takes it out. Once goods have left, the
// order can no longer be cancelled (that would need a return).
const NEXT = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in-production', 'ready', 'dispatched', 'cancelled'],
  'in-production': ['ready', 'dispatched', 'cancelled'],
  ready: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'completed'],
  delivered: ['completed'],
  completed: [],
  cancelled: []
};

// Dates are returned as plain YYYY-MM-DD strings.
const SELECT_COLUMNS = `
  o.OrderID                             AS id,
  o.ClientID                            AS clientId,
  o.ClientName                          AS clientName,
  to_char(o.OrderDate, 'YYYY-MM-DD')    AS orderDate,
  to_char(o.DeliveryDate, 'YYYY-MM-DD') AS deliveryDate,
  o.Status                              AS status,
  o.Priority                            AS priority,
  o.TotalAmount                         AS totalAmount,
  (SELECT COUNT(*) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS itemCount`;

const ITEM_COLUMNS = `
  oi.OrderItemID      AS id,
  oi.ItemID           AS itemId,
  oi.Description      AS description,
  oi.Quantity         AS quantity,
  oi.UnitPrice        AS unitPrice,
  oi.LineTotal        AS lineTotal,
  oi.ReservedQuantity AS reservedQuantity,
  oi.IssuedQuantity   AS issuedQuantity,
  oi.InvoicedQuantity AS invoicedQuantity,
  COALESCE(oi.HSNCode, i.HSNCode) AS hsnCode,
  COALESCE(oi.GSTRate, i.GSTRate) AS gstRate,
  i.Unit              AS unit,
  i.SKU               AS sku`;

const LINE_RULES = {
  itemId: id(),
  description: str({ max: 200 }),
  quantity: int({ required: true, min: 1, max: 10000000 }),
  unitPrice: num({ required: true, min: 0, max: 1e10 }),
  hsnCode: str({ max: 8, pattern: /^\d{4,8}$/, message: 'HSN/SAC code must be 4–8 digits' }),
  gstRate: oneOf([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40])
};

/** Validate the lines of an order; returns { errors, lines }. */
const checkLines = (items) => {
  if (items === undefined) return { lines: undefined };
  if (!Array.isArray(items)) return { errors: ['items must be a list'] };
  if (items.length > 200) return { errors: ['an order can have at most 200 lines'] };
  const errors = [];
  const lines = items.map((raw, i) => {
    const r = check(raw, LINE_RULES);
    if (r.errors) errors.push(...r.errors.map(e => `line ${i + 1}: ${e}`));
    if (!r.value.itemId && !r.value.description) errors.push(`line ${i + 1}: choose a stock item or enter a description`);
    return r.value;
  });
  return { errors: errors.length ? errors : null, lines };
};

const ORDER_RULES = (creating) => ({
  clientId: id(),
  clientName: str({ required: false, max: 150 }),
  orderDate: date(),
  deliveryDate: date(),
  priority: oneOf(PRIORITIES),
  totalAmount: num({ min: 0, max: 1e12 }),
  ...(creating ? {} : { status: oneOf(STATUSES) })
});

const loadOrder = async (requester, orderId) => {
  const r = await requester.request().input('OrderID', sql.Int, orderId)
    .query(`SELECT ${SELECT_COLUMNS} FROM Orders o WHERE o.OrderID = @OrderID`);
  if (!r.recordset.length) return null;
  const items = await requester.request().input('OrderID', sql.Int, orderId)
    .query(`SELECT ${ITEM_COLUMNS} FROM OrderItems oi LEFT JOIN InventoryItems i ON i.ItemID = oi.ItemID
            WHERE oi.OrderID = @OrderID ORDER BY oi.OrderItemID`);
  return { ...r.recordset[0], items: items.recordset };
};

/** Resolve client name from the client record when an id is given. */
const resolveClient = async (requester, v) => {
  if (!v.clientId) return { name: v.clientName };
  const c = await requester.request().input('ClientID', sql.Int, v.clientId)
    .query('SELECT Name FROM Clients WHERE ClientID = @ClientID');
  if (!c.recordset.length) return { error: 'clientId does not match a client' };
  return { name: c.recordset[0].Name };
};

/** Replace an order's lines and return the new total. Item descriptions default to the stock item name. */
const writeLines = async (tx, orderId, lines) => {
  await tx.request().input('OrderID', sql.Int, orderId).query('DELETE FROM OrderItems WHERE OrderID = @OrderID');
  let total = 0;
  for (const l of lines) {
    let description = l.description;
    if (l.itemId) {
      const it = await tx.request().input('ItemID', sql.Int, l.itemId)
        .query('SELECT ItemName, IsActive FROM InventoryItems WHERE ItemID = @ItemID');
      if (it.recordset.length && !it.recordset[0].IsActive) {
        const e = new Error(`${it.recordset[0].ItemName} is archived; restore it in Inventory to sell it`);
        e.code = 'P0001';
        throw e;
      }
      if (!it.recordset.length) {
        const e = new Error(`Stock item ${l.itemId} does not exist`);
        e.code = 'P0001';
        throw e;
      }
      description = description || it.recordset[0].ItemName;
    }
    await tx.request()
      .input('OrderID', sql.Int, orderId)
      .input('ItemID', sql.Int, l.itemId || null)
      .input('Description', sql.NVarChar(200), description)
      .input('Quantity', sql.Int, l.quantity)
      .input('UnitPrice', sql.Decimal(12, 2), l.unitPrice)
      .input('HSN', sql.NVarChar(8), l.hsnCode || null)
      .input('Rate', sql.Decimal(5, 2), l.gstRate ?? null)
      .query(`INSERT INTO OrderItems (OrderID, ItemID, Description, Quantity, UnitPrice, HSNCode, GSTRate)
              VALUES (@OrderID, @ItemID, @Description, @Quantity, @UnitPrice, @HSN, @Rate)`);
    total += l.quantity * l.unitPrice;
  }
  return Math.round(total * 100) / 100;
};

// --- Pickers for the order form ------------------------------------------
// Order staff need item and client names without holding the Inventory or
// Clients permission, so this service serves the narrow lists itself.

app.get('/orders/catalog/items', requireDB, async (req, res) => {
  try {
    const r = await getPool().request().query(`
      SELECT ItemID AS id, ItemName AS name, SKU AS sku, Unit AS unit,
             Quantity - ReservedQuantity AS available
      FROM InventoryItems WHERE IsActive ORDER BY ItemName`);
    res.json({ success: true, data: r.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to load items');
  }
});

app.get('/orders/catalog/clients', requireDB, async (req, res) => {
  try {
    const r = await getPool().request().query(`
      SELECT ClientID AS id, Name AS name, Type AS type FROM Clients
      WHERE Status = 'active' ORDER BY Name`);
    res.json({ success: true, data: r.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to load clients');
  }
});

// --- Orders ----------------------------------------------------------------

app.get('/orders', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { status: oneOf([...STATUSES, 'open']), clientId: id(), from: date(), to: date() });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Status', sql.NVarChar(30), value.status || null)
      .input('ClientID', sql.Int, value.clientId || null)
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null);
    const result = await listPage(request, `
      SELECT ${SELECT_COLUMNS},
             (SELECT COALESCE(SUM(oi.InvoicedQuantity * oi.UnitPrice), 0) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS "invoicedValue"
      FROM Orders o
      WHERE (@Status IS NULL OR o.Status = @Status
             OR (@Status = 'open' AND o.Status NOT IN ('completed', 'delivered', 'cancelled')))
        AND (@ClientID IS NULL OR o.ClientID = @ClientID)
        AND (@From IS NULL OR o.OrderDate >= @From) AND (@To IS NULL OR o.OrderDate <= @To)
        AND (@Q IS NULL OR o.ClientName ILIKE @Q OR o.OrderID::text = TRIM(BOTH '%' FROM @Q))`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch orders');
  }
});

app.get('/orders/stats', requireDB, async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        COUNT(*) FILTER (WHERE Status <> 'cancelled')                         AS total,
        COUNT(*) FILTER (WHERE Status = 'pending')                            AS pending,
        COUNT(*) FILTER (WHERE Status = 'confirmed')                          AS confirmed,
        COUNT(*) FILTER (WHERE Status = 'in-production')                      AS "inProduction",
        COUNT(*) FILTER (WHERE Status = 'ready')                              AS ready,
        COUNT(*) FILTER (WHERE Status IN ('dispatched','delivered'))          AS dispatched,
        COUNT(*) FILTER (WHERE Status = 'completed')                          AS completed,
        COUNT(*) FILTER (WHERE Status = 'cancelled')                          AS cancelled,
        COALESCE(SUM(TotalAmount) FILTER (WHERE Status NOT IN ('cancelled','completed','delivered')), 0) AS "openValue"
      FROM Orders`);
    res.json(result.recordset[0]);
  } catch (error) {
    sendError(res, error, 'Failed to fetch order stats');
  }
});

app.get('/orders/:id', requireDB, async (req, res) => {
  const orderId = routeId(req.params.id);
  if (!orderId) return badRequest(res, ['Invalid order id']);
  try {
    const order = await loadOrder(getPool(), orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (error) {
    sendError(res, error, 'Failed to fetch order');
  }
});

app.post('/orders', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, ORDER_RULES(true));
  const { errors: lineErrors, lines } = checkLines(req.body?.items);
  const all = [...(errors || []), ...(lineErrors || [])];
  if (!v.clientId && !v.clientName) all.push('clientName or clientId is required');
  const orderDate = v.orderDate || zonedToday();
  if (v.deliveryDate && v.deliveryDate < orderDate) all.push('deliveryDate cannot be before orderDate');
  if (all.length) return badRequest(res, all);

  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const client = await resolveClient(tx, v);
    if (client.error) { await tx.rollback(); return badRequest(res, [client.error]); }

    const inserted = await tx.request()
      .input('ClientID', sql.Int, v.clientId || null)
      .input('ClientName', sql.NVarChar(150), client.name)
      .input('OrderDate', sql.Date, orderDate)
      .input('DeliveryDate', sql.Date, v.deliveryDate || null)
      .input('Priority', sql.NVarChar(20), v.priority || 'medium')
      .input('TotalAmount', sql.Decimal(14, 2), v.totalAmount || 0)
      .query(`INSERT INTO Orders (ClientID, ClientName, OrderDate, DeliveryDate, Status, Priority, TotalAmount)
              VALUES (@ClientID, @ClientName, @OrderDate, @DeliveryDate, 'pending', @Priority, @TotalAmount)
              RETURNING OrderID`);
    const orderId = inserted.recordset[0].OrderID;

    // With lines, the total is always computed here, never taken from the client.
    if (lines && lines.length) {
      const total = await writeLines(tx, orderId, lines);
      await tx.request().input('OrderID', sql.Int, orderId).input('Total', sql.Decimal(14, 2), total)
        .query('UPDATE Orders SET TotalAmount = @Total WHERE OrderID = @OrderID');
    }
    await tx.commit();
    res.status(201).json({ success: true, data: await loadOrder(getPool(), orderId) });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to create order');
  }
});

/**
 * Change an order's status, moving stock where the step requires it.
 * Runs inside the caller's transaction; returns { error, warnings }.
 */
const transition = async (tx, order, to, userId) => {
  if (order.status === to) return { warnings: [] };
  if (!(NEXT[order.status] || []).includes(to)) {
    return { error: `An order that is ${order.status} cannot become ${to}. Allowed next: ${(NEXT[order.status] || []).join(', ') || 'none'}` };
  }
  const warnings = [];
  const stockLines = order.items.filter(l => l.itemId);

  if (to === 'confirmed') {
    // Reserve what is free now; a shortage is reported, not fatal — the rest
    // may be made by production before dispatch.
    for (const l of stockLines) {
      const want = l.quantity - l.reservedQuantity;
      if (want <= 0) continue;
      // Lock the stock row so a concurrent confirmation sees our reservation.
      const stock = await tx.request().input('ItemID', sql.Int, l.itemId)
        .query('SELECT Quantity, ReservedQuantity FROM InventoryItems WHERE ItemID = @ItemID FOR UPDATE');
      const s = stock.recordset[0];
      const taken = s ? Math.min(want, Math.max(s.Quantity - s.ReservedQuantity, 0)) : 0;
      if (taken > 0) {
        await tx.request().input('ItemID', sql.Int, l.itemId).input('Taken', sql.Int, taken)
          .query('UPDATE InventoryItems SET ReservedQuantity = ReservedQuantity + @Taken WHERE ItemID = @ItemID');
        await tx.request().input('ID', sql.Int, l.id).input('Taken', sql.Int, taken)
          .query('UPDATE OrderItems SET ReservedQuantity = ReservedQuantity + @Taken WHERE OrderItemID = @ID');
      }
      if (taken < want) warnings.push(`${l.description}: ${taken} of ${want} reserved; ${want - taken} short`);
    }
  }

  if (to === 'dispatched') {
    for (const l of stockLines) {
      const toIssue = l.quantity - l.issuedQuantity;
      if (toIssue <= 0) continue;
      // Release this line's own reservation first, so the issue below can
      // never dig into stock another order has reserved.
      if (l.reservedQuantity > 0) {
        await tx.request().input('ItemID', sql.Int, l.itemId).input('Qty', sql.Int, l.reservedQuantity)
          .query('UPDATE InventoryItems SET ReservedQuantity = ReservedQuantity - @Qty WHERE ItemID = @ItemID');
      }
      await tx.request()
        .input('ItemID', sql.Int, l.itemId)
        .input('Type', sql.NVarChar(20), 'sale')
        .input('Quantity', sql.Int, -toIssue)
        .input('Reference', sql.NVarChar(100), `Sales order #${order.id}`)
        .input('SourceType', sql.NVarChar(30), 'order')
        .input('SourceID', sql.Int, order.id)
        .input('CreatedBy', sql.Int, userId || null)
        .execute('sp_StockMove');
      await tx.request().input('ID', sql.Int, l.id).input('Qty', sql.Int, toIssue)
        .query('UPDATE OrderItems SET IssuedQuantity = IssuedQuantity + @Qty, ReservedQuantity = 0 WHERE OrderItemID = @ID');
    }
  }

  if (to === 'cancelled') {
    for (const l of stockLines.filter(x => x.reservedQuantity > 0)) {
      await tx.request().input('ItemID', sql.Int, l.itemId).input('Qty', sql.Int, l.reservedQuantity)
        .query('UPDATE InventoryItems SET ReservedQuantity = GREATEST(ReservedQuantity - @Qty, 0) WHERE ItemID = @ItemID');
      await tx.request().input('ID', sql.Int, l.id)
        .query('UPDATE OrderItems SET ReservedQuantity = 0 WHERE OrderItemID = @ID');
    }
  }

  await tx.request().input('OrderID', sql.Int, order.id).input('Status', sql.NVarChar(30), to)
    .query('UPDATE Orders SET Status = @Status WHERE OrderID = @OrderID');
  return { warnings };
};

/** Lock and load an order inside a transaction. */
const lockOrder = async (tx, orderId) => {
  const locked = await tx.request().input('OrderID', sql.Int, orderId)
    .query('SELECT OrderID FROM Orders WHERE OrderID = @OrderID FOR UPDATE');
  if (!locked.recordset.length) return null;
  return loadOrder(tx, orderId);
};

app.post('/orders/:id/status', requireDB, async (req, res) => {
  const orderId = routeId(req.params.id);
  if (!orderId) return badRequest(res, ['Invalid order id']);
  const { errors, value } = check(req.body, { status: oneOf(STATUSES, { required: true }) });
  if (errors) return badRequest(res, errors);

  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const order = await lockOrder(tx, orderId);
    if (!order) { await tx.rollback(); return res.status(404).json({ success: false, message: 'Order not found' }); }
    const r = await transition(tx, order, value.status, req.user?.id);
    if (r.error) { await tx.rollback(); return res.status(409).json({ success: false, message: r.error }); }
    await tx.commit();
    res.json({ success: true, data: await loadOrder(getPool(), orderId), warnings: r.warnings });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to change order status');
  }
});

// Partial update: fields absent from the body are left as they are. Lines can
// be replaced only while the order is pending; a status in the body goes
// through the same transition rules as POST /orders/:id/status.
app.put('/orders/:id', requireDB, async (req, res) => {
  const orderId = routeId(req.params.id);
  if (!orderId) return badRequest(res, ['Invalid order id']);
  const { errors, value: v } = check(req.body, ORDER_RULES(false));
  const { errors: lineErrors, lines } = checkLines(req.body?.items);
  const all = [...(errors || []), ...(lineErrors || [])];
  if (all.length) return badRequest(res, all);

  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const order = await lockOrder(tx, orderId);
    if (!order) { await tx.rollback(); return res.status(404).json({ success: false, message: 'Order not found' }); }

    const orderDate = v.orderDate || order.orderDate;
    const deliveryDate = v.deliveryDate || order.deliveryDate;
    if (deliveryDate && orderDate && deliveryDate < orderDate) {
      await tx.rollback();
      return badRequest(res, ['deliveryDate cannot be before orderDate']);
    }
    if (lines && order.status !== 'pending') {
      await tx.rollback();
      return res.status(409).json({ success: false, message: 'Order lines can only be changed while the order is pending' });
    }
    let clientName;
    if (v.clientId || v.clientName) {
      const client = await resolveClient(tx, v);
      if (client.error) { await tx.rollback(); return badRequest(res, [client.error]); }
      clientName = client.name;
    }

    let total = v.totalAmount;
    if (lines) total = await writeLines(tx, orderId, lines);
    else if (order.itemCount > 0) total = undefined;   // a total with lines is always computed

    await tx.request()
      .input('OrderID', sql.Int, orderId)
      .input('ClientID', sql.Int, v.clientId || null)
      .input('ClientName', sql.NVarChar(150), clientName || null)
      .input('OrderDate', sql.Date, v.orderDate || null)
      .input('DeliveryDate', sql.Date, v.deliveryDate || null)
      .input('Priority', sql.NVarChar(20), v.priority || null)
      .input('TotalAmount', sql.Decimal(14, 2), total ?? null)
      .query(`
        UPDATE Orders SET
          ClientID     = COALESCE(@ClientID, ClientID),
          ClientName   = COALESCE(@ClientName, ClientName),
          OrderDate    = COALESCE(@OrderDate, OrderDate),
          DeliveryDate = COALESCE(@DeliveryDate, DeliveryDate),
          Priority     = COALESCE(@Priority, Priority),
          TotalAmount  = COALESCE(@TotalAmount, TotalAmount)
        WHERE OrderID = @OrderID`);

    let warnings = [];
    if (v.status && v.status !== order.status) {
      const fresh = await loadOrder(tx, orderId);
      const r = await transition(tx, fresh, v.status, req.user?.id);
      if (r.error) { await tx.rollback(); return res.status(409).json({ success: false, message: r.error }); }
      warnings = r.warnings;
    }
    await tx.commit();
    res.json({ success: true, data: await loadOrder(getPool(), orderId), warnings });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to update order');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`📦 Order Service running on http://${SERVICE_HOST}:${PORT}`);
});
