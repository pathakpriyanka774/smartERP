const express = require('express');
const cors = require('cors');
const { connectDB, getPool, sql } = require('../../shared/database');
const { protectService } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, int, id, oneOf, date, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');

const app = express();
const PORT = 5009;

app.use(cors());
app.use(express.json());

// Every route needs a valid token and the Production permission, enforced here
// as well as at the gateway.
protectService(app, { permissions: AREA_PERMISSIONS.production });

const PRIORITIES = ['High', 'Medium', 'Low'];
const SHIFTS = ['Morning', 'Evening', 'Night', 'General'];

/**
 * Formerly sp_GetPlanningDashboard. A PostgreSQL function cannot return several
 * result sets, but a parameterless multi-statement query can — so the business
 * date is embedded as a literal. It comes from zonedToday() and is checked to
 * be exactly YYYY-MM-DD before use, so nothing from a request reaches the text.
 */
const dashboardSql = (today) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('invalid business date');
  const d = `'${today}'::date`;
  return `
    SELECT 'ProductionOverview' AS DataType, * FROM vw_ProductionOverview;

    SELECT 'MachineStatus' AS DataType, * FROM vw_MachineStatus;

    SELECT 'TodayProduction' AS DataType, * FROM vw_DailyProductionSummary
    WHERE ProductionDate = ${d};

    SELECT 'QualitySummary' AS DataType, * FROM vw_QualityInspectionSummary
    WHERE InspectionDate = ${d};

    SELECT 'Metrics' AS DataType,
      (SELECT COUNT(*) FROM Machines WHERE Status = 'Available') AS AvailableMachines,
      (SELECT COUNT(*) FROM Machines WHERE Status = 'Occupied') AS OccupiedMachines,
      (SELECT COUNT(*) FROM DailyProduction WHERE QualityStatus = 'ReadyForInspection') AS ReadyForInspection,
      (SELECT COUNT(*) FROM DailyProduction WHERE QualityStatus = 'UnderInspection') AS PendingInspection,
      (SELECT COALESCE(SUM(PiecesCompleted), 0) FROM DailyProduction WHERE ProductionDate = ${d}) AS TodayProduction;
  `;
};

let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Production Planning Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

const requireDB = (req, res, next) => {
  if (!dbConnected) return res.status(503).json({ success: false, message: 'Database not connected' });
  next();
};
app.use(['/planning', '/machines', '/orders', '/tasks', '/production', '/quality', '/employees', '/styles', '/sales-orders', '/allocations'], requireDB);

/** A procedure that reports business failure as a row answers 409, not 200. */
const procResult = (res, row, okStatus = 200) => {
  if (!row) return res.status(500).json({ success: false, message: 'No result from database' });
  if (row.Result === 'Error') return res.status(409).json({ success: false, message: row.Message, data: row });
  return res.status(okStatus).json({ success: true, data: row });
};

// --- Planning dashboard ---------------------------------------------------------

app.get('/planning/dashboard', async (req, res) => {
  try {
    const result = await getPool().request().query(dashboardSql(zonedToday()));
    res.json({
      success: true,
      data: {
        productionOverview: result.recordsets[0] || [],
        machineStatus: result.recordsets[1] || [],
        todayProduction: result.recordsets[2] || [],
        qualitySummary: result.recordsets[3] || [],
        metrics: (result.recordsets[4] || [])[0] || {}
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to fetch dashboard data');
  }
});

// --- Machines -------------------------------------------------------------------

app.get('/machines', async (req, res) => {
  try {
    const result = await getPool().request().query('SELECT * FROM vw_MachineStatus ORDER BY MachineCode');
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch machines');
  }
});

app.post('/machines/allocate', async (req, res) => {
  const { errors, value: v } = check(req.body, {
    machineId: id({ required: true }),
    employeeId: id({ required: true }),
    orderId: id({ required: true }),
    shiftTime: oneOf(SHIFTS, { required: true })
  });
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('MachineID', sql.Int, v.machineId)
      .input('EmployeeID', sql.Int, v.employeeId)
      .input('OrderID', sql.Int, v.orderId)
      .input('ShiftTime', sql.NVarChar(20), v.shiftTime)
      .execute('sp_AllocateMachineToEmployee');
    procResult(res, result.recordset[0], 201);
  } catch (error) {
    sendError(res, error, 'Failed to allocate machine');
  }
});

// End an allocation and free the machine (previously a machine stayed
// "Occupied" forever once allocated).
app.post('/allocations/:id/release', async (req, res) => {
  const allocationId = routeId(req.params.id);
  if (!allocationId) return badRequest(res, ['Invalid allocation id']);
  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const a = await tx.request().input('ID', sql.Int, allocationId)
      .query(`UPDATE MachineAllocations SET Status = 'Completed'
              WHERE AllocationID = @ID AND Status = 'Active' RETURNING MachineID`);
    if (!a.recordset.length) {
      await tx.rollback();
      return res.status(409).json({ success: false, message: 'Allocation not found or already released' });
    }
    await tx.request().input('MachineID', sql.Int, a.recordset[0].MachineID)
      .query(`UPDATE Machines SET Status = 'Available' WHERE MachineID = @MachineID AND Status = 'Occupied'`);
    await tx.commit();
    res.json({ success: true, message: 'Machine released' });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to release allocation');
  }
});

// --- Production orders ------------------------------------------------------------

app.get('/orders', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT * FROM vw_ProductionOverview
      ORDER BY CASE Priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, DeadlineDate ASC NULLS LAST`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch orders');
  }
});

// Styles to produce, for the "new production order" form.
app.get('/styles', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT s.StyleID, s.StyleCode, s.StyleName, s.Category, s.FinishedItemID,
             COALESCE(t.TotalMaterialCost, 0) AS MaterialCostPerPiece
      FROM Styles s LEFT JOIN vw_StyleTotalCost t ON t.StyleID = s.StyleID
      ORDER BY s.StyleCode`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch styles');
  }
});

// Sales orders that can be produced against (not yet dispatched or closed).
app.get('/sales-orders', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT o.OrderID, o.ClientName, to_char(o.DeliveryDate, 'YYYY-MM-DD') AS DeliveryDate, o.Status, o.TotalAmount,
             (SELECT string_agg(oi.Description || ' × ' || oi.Quantity, ', ') FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS Items
      FROM Orders o
      WHERE o.Status IN ('pending', 'confirmed', 'in-production')
      ORDER BY o.DeliveryDate NULLS LAST, o.OrderID`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch sales orders');
  }
});

app.post('/orders', async (req, res) => {
  const { errors, value: v } = check(req.body, {
    styleId: id({ required: true }),
    quantity: int({ required: true, min: 1, max: 10000000 }),
    deadlineDate: date(),
    startDate: date(),
    priority: oneOf(PRIORITIES),
    salesOrderId: id(),
    clientName: str({ max: 100 })
  });
  if (errors) return badRequest(res, errors);
  if (!v.salesOrderId && !v.clientName) return badRequest(res, ['salesOrderId or clientName is required']);
  if (v.startDate && v.deadlineDate && v.deadlineDate < v.startDate) return badRequest(res, ['deadlineDate cannot be before startDate']);

  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    let clientName = v.clientName;
    if (v.salesOrderId) {
      const so = await tx.request().input('ID', sql.Int, v.salesOrderId)
        .query(`SELECT ClientName, Status FROM Orders WHERE OrderID = @ID FOR UPDATE`);
      if (!so.recordset.length) { await tx.rollback(); return badRequest(res, ['salesOrderId does not match an order']); }
      if (!['pending', 'confirmed', 'in-production'].includes(so.recordset[0].Status)) {
        await tx.rollback();
        return res.status(409).json({ success: false, message: `Sales order is ${so.recordset[0].Status}; it cannot be produced against` });
      }
      clientName = clientName || so.recordset[0].ClientName;
      // A confirmed order being made moves to in-production.
      await tx.request().input('ID', sql.Int, v.salesOrderId)
        .query(`UPDATE Orders SET Status = 'in-production' WHERE OrderID = @ID AND Status = 'confirmed'`);
    }
    const style = await tx.request().input('ID', sql.Int, v.styleId).query('SELECT 1 FROM Styles WHERE StyleID = @ID');
    if (!style.recordset.length) { await tx.rollback(); return badRequest(res, ['styleId does not match a style']); }

    const r = await tx.request()
      .input('StyleID', sql.Int, v.styleId)
      .input('ClientName', sql.NVarChar(100), clientName)
      .input('Quantity', sql.Int, v.quantity)
      .input('StartDate', sql.Date, v.startDate || null)
      .input('DeadlineDate', sql.Date, v.deadlineDate || null)
      .input('Priority', sql.NVarChar(10), v.priority || 'Medium')
      .input('SalesOrderID', sql.Int, v.salesOrderId || null)
      .query(`
        INSERT INTO ProductionOrders (OrderCode, StyleID, ClientName, TotalQuantity, StartDate, DeadlineDate, Priority, SalesOrderID)
        VALUES ('PRD-' || LPAD(nextval('ProductionOrderCodeSeq')::TEXT, 5, '0'),
                @StyleID, @ClientName, @Quantity, @StartDate, @DeadlineDate, @Priority, @SalesOrderID)
        RETURNING OrderID, OrderCode`);
    await tx.commit();
    res.status(201).json({ success: true, data: r.recordset[0] });
  } catch (error) {
    await tx.rollback().catch(() => {});
    sendError(res, error, 'Failed to create production order');
  }
});

/**
 * Materials needed to finish a production order, from the style's active
 * costing (its bill of materials), against what is free in stock.
 */
app.get('/orders/:id/materials', async (req, res) => {
  const orderId = routeId(req.params.id);
  if (!orderId) return badRequest(res, ['Invalid production order id']);
  try {
    const po = await getPool().request().input('ID', sql.Int, orderId)
      .query(`SELECT OrderID, OrderCode, StyleID, TotalQuantity - CompletedQuantity AS Remaining
              FROM ProductionOrders WHERE OrderID = @ID`);
    if (!po.recordset.length) return res.status(404).json({ success: false, message: 'Production order not found' });
    const { Remaining, StyleID } = po.recordset[0];
    const mats = await getPool().request()
      .input('StyleID', sql.Int, StyleID)
      .input('Remaining', sql.Int, Remaining)
      .query(`
        SELECT m.MaterialID, m.MaterialName, m.Unit, sc.Quantity AS PerPiece,
               CEIL(sc.Quantity * @Remaining)::int AS Required,
               m.InventoryItemID, i.ItemName AS StockItem,
               (i.Quantity - i.ReservedQuantity) AS Available,
               CASE WHEN m.InventoryItemID IS NULL THEN NULL
                    ELSE GREATEST(CEIL(sc.Quantity * @Remaining)::int - (i.Quantity - i.ReservedQuantity), 0) END AS Shortage
        FROM StyleCostings sc
        JOIN Materials m ON m.MaterialID = sc.MaterialID
        LEFT JOIN InventoryItems i ON i.ItemID = m.InventoryItemID
        WHERE sc.StyleID = @StyleID AND sc.IsActive = TRUE
        ORDER BY m.MaterialName`);
    const rows = mats.recordset;
    res.json({
      success: true,
      data: {
        order: po.recordset[0],
        materials: rows,
        allAvailable: rows.every(r => r.InventoryItemID == null || r.Shortage === 0),
        untracked: rows.filter(r => r.InventoryItemID == null).map(r => r.MaterialName)
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to check materials');
  }
});

// --- Daily tasks and recording ------------------------------------------------------

app.post('/tasks/create', async (req, res) => {
  const { errors, value: v } = check(req.body, {
    allocationId: id({ required: true }),
    targetPieces: int({ required: true, min: 1, max: 1000000 }),
    taskDate: date()
  });
  if (errors) return badRequest(res, errors);
  try {
    const alloc = await getPool().request().input('ID', sql.Int, v.allocationId)
      .query(`SELECT 1 FROM MachineAllocations WHERE AllocationID = @ID AND Status = 'Active'`);
    if (!alloc.recordset.length) return res.status(409).json({ success: false, message: 'Allocation not found or no longer active' });
    const result = await getPool().request()
      .input('AllocationID', sql.Int, v.allocationId)
      .input('TargetPieces', sql.Int, v.targetPieces)
      .input('TaskDate', sql.Date, v.taskDate || zonedToday())
      .execute('sp_CreateDailyTask');
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to create task');
  }
});

app.get('/tasks/today', async (req, res) => {
  const { errors, value } = check(req.query, { date: date() });
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('TaskDate', sql.Date, value.date || zonedToday())
      .query(`
        SELECT
          pt.TaskID,
          pt.TargetPieces,
          pt.CompletedPieces,
          pt.Status,
          e.Name as EmployeeName,
          m.MachineName,
          po.OrderCode,
          s.StyleName,
          ma.ShiftTime,
          ma.AllocationID
        FROM ProductionTasks pt
        JOIN MachineAllocations ma ON pt.AllocationID = ma.AllocationID
        JOIN Employees e ON ma.EmployeeID = e.EmployeeID
        JOIN Machines m ON ma.MachineID = m.MachineID
        JOIN ProductionOrders po ON ma.OrderID = po.OrderID
        JOIN Styles s ON po.StyleID = s.StyleID
        WHERE pt.TaskDate = @TaskDate
        ORDER BY pt.Status, e.Name
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch tasks');
  }
});

app.post('/production/record', async (req, res) => {
  const { errors, value: v } = check(req.body, {
    taskId: id({ required: true }),
    piecesCompleted: int({ required: true, min: 1, max: 1000000 }),
    notes: str({ max: 500 })
  });
  if (errors) return badRequest(res, errors);
  try {
    // One statement, so a material shortage inside rolls the whole recording back.
    const result = await getPool().request()
      .input('TaskID', sql.Int, v.taskId)
      .input('PiecesCompleted', sql.Int, v.piecesCompleted)
      .input('Notes', sql.NVarChar(500), v.notes || null)
      .input('RecordedBy', sql.Int, req.user?.id || null)
      .input('BusinessDate', sql.Date, zonedToday())
      .execute('sp_RecordProduction');
    procResult(res, result.recordset[0], 201);
  } catch (error) {
    sendError(res, error, 'Failed to record production');
  }
});

// --- Quality --------------------------------------------------------------------------

app.get('/quality/pending', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        dp.ProductionID,
        to_char(dp.ProductionDate, 'YYYY-MM-DD') AS ProductionDate,
        dp.PiecesCompleted,
        dp.QualityStatus,
        e.Name as EmployeeName,
        po.OrderCode,
        s.StyleName,
        m.MachineName
      FROM DailyProduction dp
      JOIN Employees e ON dp.EmployeeID = e.EmployeeID
      JOIN ProductionOrders po ON dp.OrderID = po.OrderID
      JOIN Styles s ON po.StyleID = s.StyleID
      JOIN Machines m ON dp.MachineID = m.MachineID
      WHERE dp.QualityStatus IN ('ReadyForInspection', 'UnderInspection')
      ORDER BY dp.ProductionDate DESC, dp.ProductionID DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch pending items');
  }
});

const INSPECTION_RULES = {
  productionId: id({ required: true }),
  inspectorId: id(),
  piecesInspected: int({ required: true, min: 1, max: 1000000 }),
  piecesApproved: int({ required: true, min: 0, max: 1000000 }),
  piecesRejected: int({ required: true, min: 0, max: 1000000 }),
  defectTypes: str({ max: 500 }),
  notes: str({ max: 1000 })
};

/**
 * Record an inspection result in one transaction: the inspection row, the
 * batch's new quality status, and approved pieces received into the style's
 * finished-goods stock item (if one is linked), at the style's material cost.
 */
const recordInspection = async (v, userId) => {
  if (v.piecesApproved + v.piecesRejected !== v.piecesInspected) {
    return { status: 400, message: 'Approved plus rejected pieces must equal pieces inspected' };
  }
  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    const batch = await tx.request().input('ID', sql.Int, v.productionId).query(`
      SELECT dp.PiecesCompleted, dp.QualityStatus, po.OrderCode, s.FinishedItemID,
             COALESCE(t.TotalMaterialCost, 0) AS UnitCost
      FROM DailyProduction dp
      JOIN ProductionOrders po ON po.OrderID = dp.OrderID
      JOIN Styles s ON s.StyleID = po.StyleID
      LEFT JOIN vw_StyleTotalCost t ON t.StyleID = s.StyleID
      WHERE dp.ProductionID = @ID
      FOR UPDATE OF dp`);
    const b = batch.recordset[0];
    if (!b) { await tx.rollback(); return { status: 404, message: 'Production batch not found' }; }
    if (!['ReadyForInspection', 'UnderInspection'].includes(b.QualityStatus)) {
      await tx.rollback();
      return { status: 409, message: `Batch is ${b.QualityStatus}; it has already been inspected` };
    }
    if (v.piecesInspected > b.PiecesCompleted) {
      await tx.rollback();
      return { status: 400, message: `Only ${b.PiecesCompleted} pieces were produced in this batch` };
    }

    await tx.request()
      .input('ProductionID', sql.Int, v.productionId)
      .input('InspectorID', sql.Int, v.inspectorId || null)
      .input('InspectionDate', sql.Date, zonedToday())
      .input('PiecesInspected', sql.Int, v.piecesInspected)
      .input('PiecesApproved', sql.Int, v.piecesApproved)
      .input('PiecesRejected', sql.Int, v.piecesRejected)
      .input('DefectTypes', sql.NVarChar(500), v.defectTypes || null)
      .input('InspectionNotes', sql.NVarChar(1000), v.notes || null)
      .query(`
        INSERT INTO QualityInspections
          (ProductionID, InspectorID, InspectionDate, PiecesInspected, PiecesApproved, PiecesRejected, DefectTypes, InspectionNotes)
        VALUES (@ProductionID, @InspectorID, @InspectionDate, @PiecesInspected, @PiecesApproved, @PiecesRejected, @DefectTypes, @InspectionNotes)`);

    await tx.request()
      .input('ProductionID', sql.Int, v.productionId)
      .input('QualityStatus', sql.NVarChar(20), v.piecesRejected > 0 ? 'Rejected' : 'Approved')
      .query('UPDATE DailyProduction SET QualityStatus = @QualityStatus WHERE ProductionID = @ProductionID');

    if (b.FinishedItemID && v.piecesApproved > 0) {
      await tx.request()
        .input('ItemID', sql.Int, b.FinishedItemID)
        .input('Type', sql.NVarChar(20), 'production')
        .input('Quantity', sql.Int, v.piecesApproved)
        .input('UnitCost', sql.Decimal(12, 2), b.UnitCost)
        .input('Reference', sql.NVarChar(100), `${b.OrderCode}: approved by quality`)
        .input('SourceType', sql.NVarChar(30), 'inspection')
        .input('SourceID', sql.Int, v.productionId)
        .input('CreatedBy', sql.Int, userId || null)
        .execute('sp_StockMove');
    }
    await tx.commit();
    return { status: 201, message: 'Inspection completed', finishedGoodsAdded: b.FinishedItemID ? v.piecesApproved : 0 };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
};

const answerInspection = async (res, v, userId) => {
  try {
    const r = await recordInspection(v, userId);
    res.status(r.status).json({ success: r.status < 300, message: r.message, finishedGoodsAdded: r.finishedGoodsAdded });
  } catch (error) {
    sendError(res, error, 'Failed to record inspection');
  }
};

app.post('/quality/inspect', async (req, res) => {
  const { errors, value } = check(req.body, INSPECTION_RULES);
  if (errors) return badRequest(res, errors);
  answerInspection(res, value, req.user?.id);
});

// Same as /quality/inspect, with the snake_case body the Quality Management
// screen submits.
app.post('/quality/complete-inspection', async (req, res) => {
  const b = req.body || {};
  const { errors, value } = check({
    productionId: b.inspection_id,
    inspectorId: b.inspector_id,
    piecesInspected: b.pieces_inspected,
    piecesApproved: b.pieces_approved,
    piecesRejected: b.pieces_rejected,
    defectTypes: b.rejection_reasons
  }, INSPECTION_RULES);
  if (errors) return badRequest(res, errors);
  answerInspection(res, value, req.user?.id);
});

// Claim a batch from the queue. inspection_id is a DailyProduction.ProductionID.
app.post('/quality/start-inspection', async (req, res) => {
  const { errors, value } = check({ productionId: req.body?.inspection_id }, { productionId: id({ required: true }) });
  if (errors) return badRequest(res, ['inspection_id is required']);
  try {
    const result = await getPool().request()
      .input('ProductionID', sql.Int, value.productionId)
      .query(`
        UPDATE DailyProduction
        SET QualityStatus = 'UnderInspection'
        WHERE ProductionID = @ProductionID AND QualityStatus = 'ReadyForInspection'
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(409).json({ success: false, message: 'Batch is not awaiting inspection (already claimed or completed)' });
    }
    res.json({ success: true, message: 'Inspection started' });
  } catch (error) {
    sendError(res, error, 'Failed to start inspection');
  }
});

// --- People -------------------------------------------------------------------------

app.get('/employees/production', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        e.EmployeeID,
        e.Name,
        e.Position,
        e.Department,
        CASE WHEN ma.AllocationID IS NOT NULL THEN 'Occupied' ELSE 'Available' END as Status,
        m.MachineName as CurrentMachine
      FROM Employees e
      LEFT JOIN MachineAllocations ma ON e.EmployeeID = ma.EmployeeID AND ma.Status = 'Active'
      LEFT JOIN Machines m ON ma.MachineID = m.MachineID
      WHERE e.Department IN ('Production', 'Quality') AND e.IsActive = TRUE
      ORDER BY e.Name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch employees');
  }
});

// ---------------------------------------------------------------------------
// Dashboard-facing endpoints.
//
// These return snake_case keys and lower-cased status values because that is
// what the React components (and their CSS class names) consume.
// ---------------------------------------------------------------------------

app.get('/planning/summary', async (req, res) => {
  const today = zonedToday();
  try {
    const pool = getPool();
    const machineStatus = await pool.request().query(`
      SELECT LOWER(Status) AS status, COUNT(*) AS count
      FROM Machines WHERE IsActive = TRUE GROUP BY Status`);

    const dailyProduction = await pool.request().input('Today', sql.Date, today).query(`
      SELECT
        COALESCE(SUM(pt.TargetPieces), 0)    AS total_target,
        COALESCE(SUM(pt.CompletedPieces), 0) AS total_completed,
        COUNT(DISTINCT ma.EmployeeID)        AS active_employees,
        COUNT(DISTINCT ma.MachineID)         AS machines_in_use
      FROM ProductionTasks pt
      JOIN MachineAllocations ma ON pt.AllocationID = ma.AllocationID
      WHERE pt.TaskDate = @Today`);

    const qualitySummary = await pool.request().input('Today', sql.Date, today).query(`
      SELECT
        (SELECT COALESCE(SUM(PiecesCompleted), 0) FROM DailyProduction
          WHERE ProductionDate = @Today
            AND QualityStatus IN ('ReadyForInspection','UnderInspection','Approved','Rejected')) AS total_sent,
        (SELECT COALESCE(SUM(PiecesApproved), 0) FROM QualityInspections WHERE InspectionDate = @Today) AS total_approved,
        (SELECT COALESCE(SUM(PiecesRejected), 0) FROM QualityInspections WHERE InspectionDate = @Today) AS total_rejected`);

    const activeOrders = await pool.request().query(`
      SELECT
        po.OrderID            AS id,
        po.OrderCode          AS order_number,
        s.StyleName           AS style_name,
        po.TotalQuantity      AS total_quantity,
        po.CompletedQuantity  AS completed_pieces,
        LOWER(po.Priority)    AS priority,
        to_char(po.DeadlineDate, 'YYYY-MM-DD') AS deadline
      FROM ProductionOrders po
      JOIN Styles s ON po.StyleID = s.StyleID
      WHERE po.Status NOT IN ('Completed', 'Cancelled')
      ORDER BY po.DeadlineDate ASC NULLS LAST`);

    res.json({
      success: true,
      data: {
        date: today,
        machineStatus: machineStatus.recordset,
        dailyProduction: dailyProduction.recordset[0] || {},
        qualitySummary: qualitySummary.recordset[0] || {},
        activeOrders: activeOrders.recordset
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to fetch planning summary');
  }
});

app.get('/planning/employee-performance', async (req, res) => {
  const { errors, value } = check(req.query, { date: date() });
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('TaskDate', sql.Date, value.date || zonedToday())
      .query(`
        SELECT
          e.EmployeeCode      AS employee_code,
          e.Name              AS name,
          e.Department        AS department,
          m.MachineName       AS machine_name,
          s.StyleName         AS style_name,
          pt.TargetPieces     AS target_pieces,
          pt.CompletedPieces  AS completed_pieces,
          CAST(COALESCE(pt.CompletedPieces, 0) * 100.0
               / NULLIF(pt.TargetPieces, 0) AS DECIMAL(9,2)) AS efficiency_percentage,
          COALESCE(att.Status, 'not-marked') AS attendance_status
        FROM Employees e
        LEFT JOIN MachineAllocations ma
               ON e.EmployeeID = ma.EmployeeID AND ma.Status = 'Active'
        LEFT JOIN ProductionTasks pt
               ON pt.AllocationID = ma.AllocationID AND pt.TaskDate = @TaskDate
        LEFT JOIN Machines m         ON ma.MachineID = m.MachineID
        LEFT JOIN ProductionOrders po ON ma.OrderID = po.OrderID
        LEFT JOIN Styles s            ON po.StyleID = s.StyleID
        LEFT JOIN EmployeeAttendance att
               ON att.EmployeeID = e.EmployeeID AND att.AttendanceDate = @TaskDate
        WHERE e.IsActive = TRUE AND e.Department IN ('Production', 'Quality')
        ORDER BY e.Name
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch employee performance');
  }
});

app.get('/planning/machine-availability', async (req, res) => {
  const { errors, value } = check(req.query, { date: date() });
  if (errors) return badRequest(res, errors);
  try {
    const result = await getPool().request()
      .input('OnDate', sql.Date, value.date || zonedToday())
      .query(`
        SELECT
          m.MachineID        AS id,
          m.MachineCode      AS machine_code,
          m.MachineName      AS machine_name,
          m.MachineType      AS machine_type,
          LOWER(m.Status)    AS status,
          m.CapacityPerHour  AS capacity_per_hour,
          e.Name             AS assigned_employee,
          s.StyleName        AS current_style,
          ma.AllocationID    AS allocation_id
        FROM Machines m
        LEFT JOIN MachineAllocations ma
               ON m.MachineID = ma.MachineID AND ma.Status = 'Active' AND ma.AllocatedDate <= @OnDate
        LEFT JOIN Employees e         ON ma.EmployeeID = e.EmployeeID
        LEFT JOIN ProductionOrders po ON ma.OrderID = po.OrderID
        LEFT JOIN Styles s            ON po.StyleID = s.StyleID
        WHERE m.IsActive = TRUE
        ORDER BY m.MachineCode
      `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch machine availability');
  }
});

app.get('/quality/dashboard', async (req, res) => {
  const today = zonedToday();
  try {
    const pool = getPool();
    const todayInspections = await pool.request().input('Today', sql.Date, today).query(`
      SELECT
        COUNT(*)                             AS total_batches,
        COALESCE(SUM(dp.PiecesCompleted), 0) AS total_pieces_sent,
        COALESCE(SUM(qi.PiecesInspected), 0) AS total_inspected,
        COALESCE(SUM(qi.PiecesApproved), 0)  AS total_approved,
        COALESCE(SUM(qi.PiecesRejected), 0)  AS total_rejected
      FROM DailyProduction dp
      LEFT JOIN QualityInspections qi ON qi.ProductionID = dp.ProductionID
      WHERE dp.ProductionDate = @Today`);

    const rejectionByStyle = await pool.request().query(`
      SELECT
        s.StyleName AS style_name,
        CAST(SUM(qi.PiecesRejected) * 100.0 / NULLIF(SUM(qi.PiecesInspected), 0) AS DECIMAL(9,2)) AS rejection_rate
      FROM QualityInspections qi
      JOIN DailyProduction dp  ON qi.ProductionID = dp.ProductionID
      JOIN ProductionOrders po ON dp.OrderID = po.OrderID
      JOIN Styles s            ON po.StyleID = s.StyleID
      GROUP BY s.StyleName
      HAVING SUM(qi.PiecesInspected) > 0
      ORDER BY rejection_rate DESC`);

    const pendingInspections = await pool.request().query(`
      SELECT
        dp.ProductionID              AS id,
        po.OrderCode                 AS order_number,
        s.StyleName                  AS style_name,
        e.Name                       AS employee_name,
        dp.PiecesCompleted           AS pieces_sent,
        to_char(dp.ProductionDate, 'YYYY-MM-DD') AS inspection_date,
        LOWER(dp.QualityStatus)      AS status,
        (EXTRACT(EPOCH FROM date_trunc('hour', LOCALTIMESTAMP)
                          - date_trunc('hour', dp.RecordedAt)) / 3600)::int AS hours_pending
      FROM DailyProduction dp
      JOIN Employees e         ON dp.EmployeeID = e.EmployeeID
      JOIN ProductionOrders po ON dp.OrderID = po.OrderID
      JOIN Styles s            ON po.StyleID = s.StyleID
      WHERE dp.QualityStatus IN ('ReadyForInspection', 'UnderInspection')
      ORDER BY dp.RecordedAt ASC`);

    res.json({
      success: true,
      data: {
        date: today,
        todayInspections: todayInspections.recordset[0] || {},
        rejectionByStyle: rejectionByStyle.recordset,
        pendingInspections: pendingInspections.recordset
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to fetch quality dashboard');
  }
});

app.get('/quality/reports', async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        po.OrderCode          AS order_number,
        s.StyleName           AS style_name,
        worker.Name           AS employee_name,
        inspector.Name        AS inspector_name,
        to_char(qi.InspectionDate, 'YYYY-MM-DD') AS inspection_date,
        dp.PiecesCompleted    AS pieces_sent,
        qi.PiecesInspected    AS pieces_inspected,
        qi.PiecesApproved     AS pieces_approved,
        qi.PiecesRejected     AS pieces_rejected,
        CAST(qi.PiecesRejected * 100.0 / NULLIF(qi.PiecesInspected, 0) AS DECIMAL(9,2)) AS rejection_rate,
        qi.DefectTypes        AS rejection_reasons
      FROM QualityInspections qi
      JOIN DailyProduction dp       ON qi.ProductionID = dp.ProductionID
      JOIN ProductionOrders po      ON dp.OrderID = po.OrderID
      JOIN Styles s                 ON po.StyleID = s.StyleID
      JOIN Employees worker         ON dp.EmployeeID = worker.EmployeeID
      LEFT JOIN Employees inspector ON qi.InspectorID = inspector.EmployeeID
      ORDER BY qi.InspectionDate DESC, qi.InspectionID DESC`);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    sendError(res, error, 'Failed to fetch quality reports');
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    service: 'Production Planning Service',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`🏭 Production Planning Service running on http://${SERVICE_HOST}:${PORT}`);
});
