const express = require('express');
const cors = require('cors');
const { connectDB, getPool, sql } = require('../../shared/database');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, num, id, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');

const app = express();
const PORT = 5010;

app.use(cors());
app.use(express.json());

// Every route needs a valid token and the Style Costing permission, enforced
// here as well as at the gateway.
protectService(app, { permissions: AREA_PERMISSIONS.costing });

// Formerly sp_GetCostingDashboard. A PostgreSQL function cannot return several
// result sets, but a parameterless multi-statement query can.
const DASHBOARD_SQL = `
  SELECT 'StyleCosts' AS DataType, * FROM vw_StyleTotalCost;

  SELECT 'MaterialUsage' AS DataType, * FROM vw_MaterialUsage;

  SELECT 'Metrics' AS DataType,
    (SELECT COUNT(*) FROM Styles) AS TotalStyles,
    (SELECT COUNT(*) FROM Materials WHERE IsActive = TRUE) AS TotalMaterials,
    (SELECT AVG(TotalMaterialCost) FROM vw_StyleTotalCost WHERE TotalMaterialCost > 0) AS AvgStyleCost,
    (SELECT MAX(TotalMaterialCost) FROM vw_StyleTotalCost) AS MaxStyleCost,
    (SELECT MIN(TotalMaterialCost) FROM vw_StyleTotalCost WHERE TotalMaterialCost > 0) AS MinStyleCost;
`;

let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Costing Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

app.use((req, res, next) => {
  if (req.path === '/health' || dbConnected) return next();
  res.status(503).json({ success: false, message: 'Database not connected' });
});

app.get('/dashboard', async (req, res) => {
  try {
    const result = await getPool().request().query(DASHBOARD_SQL);
    res.json({
      success: true,
      data: {
        styleCosts: result.recordsets[0] || [],
        materialUsage: result.recordsets[1] || [],
        metrics: (result.recordsets[2] || [])[0] || {}
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to fetch dashboard data');
  }
});

// The material breakdown of one style (its bill of materials).
const breakdown = (styleId, ordered) => getPool().request()
  .input('StyleID', sql.Int, styleId)
  .query(`
    SELECT * FROM vw_StyleCostBreakdown
    WHERE StyleCode = (SELECT StyleCode FROM Styles WHERE StyleID = @StyleID)
    ${ordered ? 'ORDER BY MaterialCategory, MaterialName' : ''}`);

app.get('/style/:styleId', async (req, res) => {
  const styleId = routeId(req.params.styleId);
  if (!styleId) return badRequest(res, ['Invalid style id']);
  try {
    res.json({ success: true, data: (await breakdown(styleId, false)).recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch style costing');
  }
});

app.get('/breakdown/:styleId', async (req, res) => {
  const styleId = routeId(req.params.styleId);
  if (!styleId) return badRequest(res, ['Invalid style id']);
  try {
    res.json({ success: true, data: (await breakdown(styleId, true)).recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch cost breakdown');
  }
});

app.get('/styles', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT s.StyleID, s.StyleCode, s.StyleName, s.Category, s.FinishedItemID, i.ItemName AS FinishedItemName
      FROM Styles s LEFT JOIN InventoryItems i ON i.ItemID = s.FinishedItemID
      ORDER BY s.StyleCode`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch styles');
  }
});

app.get('/materials', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT m.*, i.ItemName AS InventoryItemName, i.Quantity AS InventoryQuantity
      FROM Materials m LEFT JOIN InventoryItems i ON i.ItemID = m.InventoryItemID
      WHERE m.IsActive = TRUE ORDER BY m.MaterialCode`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch materials');
  }
});

// Stock items a material or a style can be linked to. Served here so costing
// staff do not need the Inventory permission to make the link.
app.get('/inventory-items', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT ItemID, ItemName, SKU, Unit, Category FROM InventoryItems ORDER BY ItemName`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch stock items');
  }
});

/**
 * Link a costing material to the stock item it is drawn from. Once linked,
 * recording production consumes it from stock (quantity per piece × pieces).
 * Send inventoryItemId: null to unlink.
 */
app.put('/materials/:id/stock-item', async (req, res) => {
  const materialId = routeId(req.params.id);
  if (!materialId) return badRequest(res, ['Invalid material id']);
  const linking = req.body?.inventoryItemId !== null;
  const { errors, value } = check(req.body, { inventoryItemId: id({ required: linking }) });
  if (errors) return badRequest(res, errors);
  try {
    const r = await getPool().request()
      .input('MaterialID', sql.Int, materialId)
      .input('ItemID', sql.Int, linking ? value.inventoryItemId : null)
      .query(`UPDATE Materials SET InventoryItemID = @ItemID WHERE MaterialID = @MaterialID RETURNING MaterialID, InventoryItemID`);
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'Material not found' });
    res.json({ success: true, data: r.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to link material');
  }
});

/**
 * Link a style to the stock item its finished garments are counted in. Once
 * linked, pieces approved by quality are added to that item at the style's
 * material cost. Send inventoryItemId: null to unlink.
 */
app.put('/styles/:id/finished-item', async (req, res) => {
  const styleId = routeId(req.params.id);
  if (!styleId) return badRequest(res, ['Invalid style id']);
  const linking = req.body?.inventoryItemId !== null;
  const { errors, value } = check(req.body, { inventoryItemId: id({ required: linking }) });
  if (errors) return badRequest(res, errors);
  try {
    const r = await getPool().request()
      .input('StyleID', sql.Int, styleId)
      .input('ItemID', sql.Int, linking ? value.inventoryItemId : null)
      .query(`UPDATE Styles SET FinishedItemID = @ItemID WHERE StyleID = @StyleID RETURNING StyleID, FinishedItemID`);
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'Style not found' });
    res.json({ success: true, data: r.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to link style');
  }
});

// Add or update one material line of a style's costing. The previous line is
// kept, deactivated, so costing history is preserved.
app.post('/update', async (req, res) => {
  const { errors, value: v } = check(req.body, {
    styleId: id({ required: true }),
    materialId: id({ required: true }),
    quantity: num({ required: true, min: 0.01, max: 999999 }),
    rate: num({ required: true, min: 0, max: 99999999 })
  });
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('StyleID', sql.Int, v.styleId)
      .input('MaterialID', sql.Int, v.materialId)
      .input('Quantity', sql.Decimal(8, 2), v.quantity)
      .input('Rate', sql.Decimal(10, 2), v.rate)
      // Who made the change comes from the token, never from the request body.
      .input('CreatedBy', sql.Int, req.user?.id || null)
      .execute('sp_UpdateStyleCosting');
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to update costing');
  }
});

app.get('/material-usage', async (req, res) => {
  try {
    const result = await getPool().request()
      .query('SELECT * FROM vw_MaterialUsage ORDER BY TotalQuantityUsed DESC NULLS LAST');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch material usage');
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    service: 'Costing Service',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`💰 Costing Service running on http://${SERVICE_HOST}:${PORT}`);
});
