const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, num, int, oneOf, bool, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { pageParams, listPage } = require('../../shared/paginate');

const app = express();
const PORT = 5003;

app.use(cors());
app.use(express.json());

// Every route needs a valid token and the Inventory permission, enforced here
// as well as at the gateway.
protectService(app, { permissions: AREA_PERMISSIONS.inventory });

const { requireDB, health } = initService('Inventory Service');

// Status is derived by vw_InventoryStatus from Quantity vs ReorderLevel, so it
// can never disagree with the quantity actually on hand.
const SELECT_COLUMNS = `
  ItemID            AS id,
  ItemName          AS itemName,
  SKU               AS sku,
  Category          AS category,
  Quantity          AS quantity,
  ReservedQuantity  AS reservedQuantity,
  AvailableQuantity AS availableQuantity,
  Unit              AS unit,
  ReorderLevel      AS reorderLevel,
  UnitCost          AS unitCost,
  TotalValue        AS totalValue,
  HSNCode           AS hsnCode,
  GSTRate           AS gstRate,
  IsActive          AS isActive,
  to_char(LastMovementAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS lastMovementAt,
  Status            AS status`;

const MOVEMENT_COLUMNS = `
  m.MovementID   AS id,
  m.ItemID       AS itemId,
  i.ItemName     AS itemName,
  m.MovementType AS type,
  m.Quantity     AS quantity,
  m.UnitCost     AS unitCost,
  m.BalanceAfter AS balanceAfter,
  m.Reference    AS reference,
  m.SourceType   AS sourceType,
  m.SourceID     AS sourceId,
  m.Notes        AS notes,
  u.Username     AS createdBy,
  to_char(m.CreatedAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS createdAt`;

const ITEM_RULES = (creating) => ({
  itemName: str({ required: creating, max: 150 }),
  sku: str({ max: 40 }),
  category: str({ max: 50 }),
  unit: str({ max: 30 }),
  reorderLevel: int({ min: 0, max: 100000000 }),
  unitCost: num({ min: 0, max: 1e10 }),
  quantity: int({ min: 0, max: 100000000 }),
  hsnCode: str({ max: 8, pattern: /^\d{4,8}$/, message: 'HSN/SAC code must be 4–8 digits' }),
  gstRate: oneOf([0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40])
});

const fetchItem = (requester, id) => requester.request()
  .input('ItemID', sql.Int, id)
  .query(`SELECT ${SELECT_COLUMNS} FROM vw_InventoryStatus WHERE ItemID = @ItemID`);

/** Record a stock movement through sp_StockMove (atomic, ledgered). */
const move = (requester, { itemId, type, quantity, unitCost, reference, notes, userId, sourceType, sourceId }) =>
  requester.request()
    .input('ItemID', sql.Int, itemId)
    .input('Type', sql.NVarChar(20), type)
    .input('Quantity', sql.Int, quantity)
    .input('UnitCost', sql.Decimal(12, 2), unitCost ?? null)
    .input('Reference', sql.NVarChar(100), reference || null)
    .input('SourceType', sql.NVarChar(30), sourceType || null)
    .input('SourceID', sql.Int, sourceId || null)
    .input('Notes', sql.NVarChar(300), notes || null)
    .input('CreatedBy', sql.Int, userId || null)
    .execute('sp_StockMove');

// Sort keys the list accepts, mapped to the subquery's columns.
const SORTS = {
  name: 'itemName', quantity: 'quantity', available: 'availableQuantity', value: 'totalValue',
  cost: 'unitCost', reorder: 'reorderLevel', status: 'status', moved: 'lastMovementAt'
};

app.get('/inventory', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, {
    category: str({ max: 50 }), status: str({ max: 30 }),
    missingCost: bool(), archived: oneOf(['active', 'archived', 'all']),
    sort: oneOf(Object.keys(SORTS)), dir: oneOf(['asc', 'desc'])
  });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  // Name breaks ties, so paging is stable whatever the sort.
  const dir = value.dir === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST';
  const orderBy = value.sort && value.sort !== 'name' ? `${SORTS[value.sort]} ${dir}, itemName` : `itemName ${value.dir === 'desc' ? 'DESC' : 'ASC'}`;
  try {
    const request = getPool().request()
      .input('Category', sql.NVarChar(50), value.category || null)
      .input('Status', sql.NVarChar(30), value.status || null)
      .input('MissingCost', sql.Bit, value.missingCost || false)
      .input('Archived', sql.NVarChar(10), value.archived || 'active');
    const result = await listPage(request, `
      SELECT ${SELECT_COLUMNS} FROM vw_InventoryStatus
      WHERE (@Category IS NULL OR Category = @Category) AND (@Status IS NULL OR Status = @Status)
        AND (NOT @MissingCost OR (UnitCost = 0 AND Quantity > 0))
        AND (@Archived = 'all' OR (@Archived = 'archived') = NOT IsActive)
        AND (@Q IS NULL OR ItemName ILIKE @Q OR SKU ILIKE @Q OR Category ILIKE @Q OR HSNCode ILIKE @Q)`, orderBy, p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch inventory');
  }
});

/** Every category and unit in use, for filters and the item form. */
app.get('/inventory/categories', requireDB, async (req, res) => {
  try {
    const r = await getPool().request().query(`
      SELECT
        COALESCE((SELECT array_agg(c ORDER BY c) FROM (SELECT DISTINCT Category AS c FROM InventoryItems WHERE Category IS NOT NULL AND Category <> '') x), '{}') AS categories,
        COALESCE((SELECT array_agg(u ORDER BY u) FROM (SELECT DISTINCT Unit AS u FROM InventoryItems WHERE Unit IS NOT NULL AND Unit <> '') y), '{}') AS units`);
    res.json({ success: true, data: r.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to fetch categories');
  }
});

app.get('/inventory/stats', requireDB, async (req, res) => {
  try {
    // Active items only; archived ones hold no stock by definition.
    const result = await getPool().request().query(`
      SELECT
        COUNT(*)                                              AS "totalItems",
        COUNT(*) FILTER (WHERE Status = 'in-stock')           AS "inStock",
        COUNT(*) FILTER (WHERE Status = 'low-stock')          AS "lowStock",
        COUNT(*) FILTER (WHERE Status = 'out-of-stock')       AS "outOfStock",
        COUNT(*) FILTER (WHERE UnitCost = 0 AND Quantity > 0) AS "missingCost",
        COALESCE(SUM(TotalValue), 0)                          AS "totalValue",
        COALESCE(SUM(ReservedQuantity * UnitCost), 0)         AS "reservedValue",
        (SELECT COUNT(*) FROM InventoryItems WHERE NOT IsActive) AS "archived",
        (SELECT COUNT(*) FROM StockMovements WHERE CreatedAt >= LOCALTIMESTAMP - INTERVAL '30 days') AS "movements30d"
      FROM vw_InventoryStatus WHERE IsActive
    `);
    res.json(result.recordset[0]);
  } catch (error) {
    sendError(res, error, 'Failed to fetch inventory stats');
  }
});

/**
 * Archive or restore an item. Archiving needs nothing on hand or reserved
 * (issue or adjust the stock out first), so no stock value is hidden.
 */
app.post('/inventory/:id/:action(archive|restore)', requireDB, async (req, res) => {
  const itemId = routeId(req.params.id);
  if (!itemId) return badRequest(res, ['Invalid item id']);
  const archive = req.params.action === 'archive';
  try {
    const cur = await getPool().request().input('ItemID', sql.Int, itemId)
      .query('SELECT ItemName, Quantity, ReservedQuantity, IsActive FROM InventoryItems WHERE ItemID = @ItemID');
    const item = cur.recordset[0];
    if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
    if (archive && (item.Quantity !== 0 || item.ReservedQuantity !== 0)) {
      return res.status(409).json({ success: false,
        message: `${item.ItemName} still has ${item.Quantity} on hand and ${item.ReservedQuantity} reserved. Issue or adjust it to zero before archiving.` });
    }
    await getPool().request().input('ItemID', sql.Int, itemId).input('Active', sql.Bit, !archive)
      .query('UPDATE InventoryItems SET IsActive = @Active WHERE ItemID = @ItemID');
    const result = await fetchItem(getPool(), itemId);
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to update item');
  }
});

// Movements across all items, newest first, a page at a time.
app.get('/inventory/movements', requireDB, async (req, res) => {
  const { errors, value } = check(req.query, { type: str({ max: 20 }) });
  if (errors) return badRequest(res, errors);
  // ?limit= is the older form of ?pageSize=.
  const p = pageParams({ pageSize: req.query.limit, ...req.query });
  try {
    const request = getPool().request().input('Type', sql.NVarChar(20), value.type || null);
    const result = await listPage(request, `
      SELECT ${MOVEMENT_COLUMNS}
      FROM StockMovements m
      JOIN InventoryItems i ON i.ItemID = m.ItemID
      LEFT JOIN Users u ON u.UserID = m.CreatedBy
      WHERE (@Type IS NULL OR m.MovementType = @Type)
        AND (@Q IS NULL OR i.ItemName ILIKE @Q OR m.Reference ILIKE @Q OR m.Notes ILIKE @Q)`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch stock movements');
  }
});

app.get('/inventory/:id', requireDB, async (req, res) => {
  const itemId = routeId(req.params.id);
  if (!itemId) return badRequest(res, ['Invalid item id']);
  try {
    const result = await fetchItem(getPool(), itemId);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Item not found' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to fetch item');
  }
});

app.get('/inventory/:id/movements', requireDB, async (req, res) => {
  const itemId = routeId(req.params.id);
  if (!itemId) return badRequest(res, ['Invalid item id']);
  try {
    const result = await listPage(getPool().request().input('ItemID', sql.Int, itemId), `
      SELECT ${MOVEMENT_COLUMNS}
      FROM StockMovements m
      JOIN InventoryItems i ON i.ItemID = m.ItemID
      LEFT JOIN Users u ON u.UserID = m.CreatedBy
      WHERE m.ItemID = @ItemID`, 'id DESC', pageParams(req.query));
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to fetch stock movements');
  }
});

app.post('/inventory', requireDB, async (req, res) => {
  const { errors, value: v } = check(req.body, ITEM_RULES(true));
  if (errors) return badRequest(res, errors);

  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const inserted = await tx.request()
      .input('ItemName', sql.NVarChar(150), v.itemName)
      .input('SKU', sql.NVarChar(40), v.sku || null)
      .input('Category', sql.NVarChar(50), v.category || null)
      .input('Unit', sql.NVarChar(30), v.unit || null)
      .input('ReorderLevel', sql.Int, v.reorderLevel || 0)
      .input('UnitCost', sql.Decimal(12, 2), v.unitCost || 0)
      .input('HSN', sql.NVarChar(8), v.hsnCode || null)
      .input('Rate', sql.Decimal(5, 2), v.gstRate ?? null)
      .query(`
        INSERT INTO InventoryItems (ItemName, SKU, Category, Quantity, Unit, ReorderLevel, UnitCost, HSNCode, GSTRate)
        VALUES (@ItemName, @SKU, @Category, 0, @Unit, @ReorderLevel, @UnitCost, @HSN, @Rate)
        RETURNING ItemID`);
    const itemId = inserted.recordset[0].ItemID;
    // Starting stock is a ledger entry like any other, so history adds up.
    if (v.quantity > 0) {
      await move(tx, { itemId, type: 'opening', quantity: v.quantity, unitCost: v.unitCost || 0,
                       reference: 'Opening stock', userId: req.user?.id });
    }
    await tx.commit();
    const result = await fetchItem(getPool(), itemId);
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to create item');
  }
});

// Partial update of item details. A changed quantity is recorded as a stock
// adjustment rather than overwritten, so the history still explains it.
app.put('/inventory/:id', requireDB, async (req, res) => {
  const itemId = routeId(req.params.id);
  if (!itemId) return badRequest(res, ['Invalid item id']);
  const { errors, value: v } = check(req.body, ITEM_RULES(false));
  if (errors) return badRequest(res, errors);

  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const current = await tx.request().input('ItemID', sql.Int, itemId)
      .query('SELECT Quantity FROM InventoryItems WHERE ItemID = @ItemID FOR UPDATE');
    if (!current.recordset.length) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    await tx.request()
      .input('ItemID', sql.Int, itemId)
      .input('ItemName', sql.NVarChar(150), v.itemName ?? null)
      .input('SKU', sql.NVarChar(40), v.sku ?? null)
      .input('Category', sql.NVarChar(50), v.category ?? null)
      .input('Unit', sql.NVarChar(30), v.unit ?? null)
      .input('ReorderLevel', sql.Int, v.reorderLevel ?? null)
      .input('UnitCost', sql.Decimal(12, 2), v.unitCost ?? null)
      .input('HSN', sql.NVarChar(8), v.hsnCode ?? null)
      .input('Rate', sql.Decimal(5, 2), v.gstRate ?? null)
      .query(`
        UPDATE InventoryItems SET
          ItemName     = COALESCE(@ItemName, ItemName),
          SKU          = COALESCE(@SKU, SKU),
          Category     = COALESCE(@Category, Category),
          Unit         = COALESCE(@Unit, Unit),
          ReorderLevel = COALESCE(@ReorderLevel, ReorderLevel),
          UnitCost     = COALESCE(@UnitCost, UnitCost),
          HSNCode      = COALESCE(@HSN, HSNCode),
          GSTRate      = COALESCE(@Rate, GSTRate)
        WHERE ItemID = @ItemID`);
    const delta = v.quantity === undefined ? 0 : v.quantity - current.recordset[0].Quantity;
    if (delta !== 0) {
      await move(tx, { itemId, type: 'adjustment', quantity: delta, reference: 'Quantity edited',
                       notes: req.body?.notes ? String(req.body.notes).slice(0, 300) : null, userId: req.user?.id });
    }
    await tx.commit();
    const result = await fetchItem(getPool(), itemId);
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to update item');
  }
});

/**
 * Receive, issue or adjust stock.
 *   receipt:    quantity > 0 comes in, optionally at a unit cost (updates the average cost)
 *   issue:      quantity > 0 goes out
 *   adjustment: signed quantity (stock count correction)
 */
app.post('/inventory/:id/movements', requireDB, async (req, res) => {
  const itemId = routeId(req.params.id);
  if (!itemId) return badRequest(res, ['Invalid item id']);
  const { errors, value: v } = check(req.body, {
    type: oneOf(['receipt', 'issue', 'adjustment'], { required: true }),
    quantity: int({ required: true, min: -100000000, max: 100000000 }),
    unitCost: num({ min: 0, max: 1e10 }),
    reference: str({ max: 100 }),
    notes: str({ max: 300 })
  });
  if (errors) return badRequest(res, errors);
  if (v.quantity === 0) return badRequest(res, ['quantity must not be zero']);
  if (v.type !== 'adjustment' && v.quantity < 0) {
    return badRequest(res, ['quantity must be positive for receipts and issues']);
  }
  if (v.type === 'adjustment' && !v.notes) return badRequest(res, ['an adjustment needs a note explaining it']);

  try {
    const signed = v.type === 'issue' ? -v.quantity : v.quantity;
    const r = await move(getPool(), {
      itemId, type: v.type, quantity: signed,
      unitCost: v.type === 'receipt' ? v.unitCost : undefined,
      reference: v.reference, notes: v.notes, userId: req.user?.id
    });
    const item = await fetchItem(getPool(), itemId);
    res.status(201).json({ success: true, data: { movement: r.recordset[0], item: item.recordset[0] } });
  } catch (error) {
    sendError(res, error, 'Failed to record stock movement');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`📋 Inventory Service running on http://${SERVICE_HOST}:${PORT}`);
});
