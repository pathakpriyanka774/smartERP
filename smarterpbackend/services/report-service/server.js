const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService, requirePermission } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');

const app = express();
const PORT = 5007;

app.use(cors());
app.use(express.json());

// The dashboard and Reports share this service: either permission opens it,
// and the detailed /reports/* routes additionally require 'reports'.
protectService(app, { permissions: AREA_PERMISSIONS.reports });
const reportsOnly = requirePermission('reports');

const { requireDB, health } = initService('Report Service');

/**
 * Calendar boundaries in the business time zone (APP_TIMEZONE, India by
 * default). The database session runs in UTC, so "this month" computed there
 * would start at 05:30 IST on the 1st; computing it here keeps a payment made
 * just after midnight in the right month.
 */
const calendar = () => {
  const today = zonedToday();                         // YYYY-MM-DD
  const [y, m] = today.split('-').map(Number);
  const iso = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}-01`;
  const shift = (k) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1); };
  return { today, monthStart: shift(0), lastMonthStart: shift(-1), nextMonthStart: shift(1), sixMonthsAgo: shift(-5) };
};

const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

// Order statuses that count as real sales: everything except cancelled.
const SOLD = `Status <> 'cancelled'`;
const OPEN = `Status NOT IN ('cancelled', 'completed', 'delivered')`;

app.get('/dashboard', requireDB, async (req, res) => {
  const c = calendar();
  try {
    const pool = getPool();
    const k = await pool.request()
      .input('Today', sql.Date, c.today)
      .input('MonthStart', sql.Date, c.monthStart)
      .input('LastMonthStart', sql.Date, c.lastMonthStart)
      .input('NextMonthStart', sql.Date, c.nextMonthStart)
      .query(`
        SELECT
          (SELECT COALESCE(SUM(Amount), 0) FROM FinanceTransactions
            WHERE Type = 'income' AND TxnDate >= @MonthStart AND TxnDate < @NextMonthStart)      AS "incomeThisMonth",
          (SELECT COALESCE(SUM(Amount), 0) FROM FinanceTransactions
            WHERE Type = 'income' AND TxnDate >= @LastMonthStart AND TxnDate < @MonthStart)      AS "incomeLastMonth",
          (SELECT COALESCE(SUM(Amount), 0) FROM FinanceTransactions
            WHERE Type = 'expense' AND TxnDate >= @MonthStart AND TxnDate < @NextMonthStart)     AS "expensesThisMonth",
          (SELECT COUNT(*) FROM Orders WHERE ${OPEN})                                            AS "openOrders",
          (SELECT COALESCE(SUM(TotalAmount), 0) FROM Orders WHERE ${OPEN})                       AS "openOrdersValue",
          (SELECT COUNT(*) FROM Orders WHERE ${SOLD} AND OrderDate >= @MonthStart AND OrderDate < @NextMonthStart) AS "ordersThisMonth",
          (SELECT COALESCE(SUM(TotalAmount), 0) FROM Orders
            WHERE ${SOLD} AND OrderDate >= @MonthStart AND OrderDate < @NextMonthStart)          AS "salesThisMonth",
          (SELECT COUNT(*) FROM ProductionOrders WHERE Status NOT IN ('Completed','Cancelled'))  AS "activeProduction",
          (SELECT COUNT(*) FROM ProductionOrders
            WHERE Status NOT IN ('Completed','Cancelled') AND DeadlineDate < @Today)             AS "overdueProduction",
          (SELECT COALESCE(SUM(PiecesCompleted), 0) FROM DailyProduction WHERE ProductionDate = @Today) AS "piecesToday",
          (SELECT COUNT(*) FROM DailyProduction
            WHERE QualityStatus IN ('ReadyForInspection','UnderInspection'))                     AS "pendingInspections",
          (SELECT COALESCE(SUM(TotalValue), 0) FROM vw_InventoryStatus)                          AS "stockValue",
          (SELECT COUNT(*) FROM vw_InventoryStatus WHERE Status = 'low-stock')                   AS "lowStock",
          (SELECT COUNT(*) FROM vw_InventoryStatus WHERE Status = 'out-of-stock')                AS "outOfStock",
          (SELECT COUNT(*) FROM InventoryItems)                                                  AS "inventoryItems",
          (SELECT COUNT(*) FROM Employees WHERE IsActive = TRUE)                                 AS "activeEmployees",
          (SELECT COUNT(*) FROM EmployeeAttendance
            WHERE AttendanceDate = @Today AND Status IN ('present','late','half-day'))           AS "presentToday",
          (SELECT COUNT(*) FROM Payrolls WHERE Status = 'pending')                               AS "pendingPayrolls"
      `);
    const kpis = k.recordset[0];
    kpis.incomeChangePct = pct(kpis.incomeThisMonth, kpis.incomeLastMonth);

    const orderStatus = await pool.request().query(`
      SELECT Status AS status, COUNT(*) AS count, COALESCE(SUM(TotalAmount), 0) AS value
      FROM Orders GROUP BY Status ORDER BY COUNT(*) DESC`);

    // Income and expenses for the last six business months, oldest first, gaps as zero.
    const monthly = await pool.request().input('From', sql.Date, c.sixMonthsAgo).query(`
      WITH Months AS (
        SELECT (@From::date + make_interval(months => n))::date AS MonthStart
        FROM generate_series(0, 5) AS n
      )
      SELECT to_char(m.MonthStart, 'YYYY-MM') AS month,
             COALESCE(SUM(ft.Amount) FILTER (WHERE ft.Type = 'income'), 0)  AS income,
             COALESCE(SUM(ft.Amount) FILTER (WHERE ft.Type = 'expense'), 0) AS expenses
      FROM Months m
      LEFT JOIN FinanceTransactions ft
             ON ft.TxnDate >= m.MonthStart AND ft.TxnDate < m.MonthStart + INTERVAL '1 month'
      GROUP BY m.MonthStart
      ORDER BY m.MonthStart`);

    const lowStockItems = await pool.request().query(`
      SELECT ItemID AS id, ItemName AS "itemName", Quantity AS quantity, ReorderLevel AS "reorderLevel",
             Unit AS unit, Status AS status
      FROM vw_InventoryStatus WHERE Status <> 'in-stock'
      ORDER BY Quantity - ReorderLevel LIMIT 8`);

    const recentActivity = await pool.request().query(`
      SELECT type, message, "occurredAt" FROM (
        SELECT 'order' AS type, 'Order #' || OrderID || ' from ' || ClientName || ' (' || Status || ')' AS message,
               CreatedAt AS "occurredAt"
        FROM Orders
        UNION ALL
        SELECT 'production', 'Production recorded: ' || PiecesCompleted || ' pieces', RecordedAt
        FROM DailyProduction
        UNION ALL
        SELECT 'inventory', initcap(m.MovementType) || ': ' || abs(m.Quantity) || ' × ' || i.ItemName, m.CreatedAt
        FROM StockMovements m JOIN InventoryItems i ON i.ItemID = m.ItemID
        WHERE m.MovementType <> 'opening'
      ) a
      ORDER BY "occurredAt" DESC NULLS LAST
      LIMIT 10`);

    res.json({
      success: true,
      data: {
        asOf: c.today,
        kpis,
        lowStockItems: lowStockItems.recordset,
        recentActivity: recentActivity.recordset,
        charts: {
          monthly: monthly.recordset,
          orderStatus: orderStatus.recordset
        }
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to build dashboard');
  }
});

app.get('/reports/sales', requireDB, reportsOnly, async (req, res) => {
  const c = calendar();
  try {
    const pool = getPool();
    const totals = await pool.request()
      .input('MonthStart', sql.Date, c.monthStart)
      .input('LastMonthStart', sql.Date, c.lastMonthStart)
      .input('NextMonthStart', sql.Date, c.nextMonthStart)
      .query(`
        SELECT
          COALESCE(SUM(TotalAmount) FILTER (WHERE ${SOLD}), 0) AS "totalSales",
          COUNT(*) FILTER (WHERE ${SOLD})                      AS "orderCount",
          COUNT(*) FILTER (WHERE Status = 'cancelled')         AS "cancelledCount",
          COALESCE(SUM(TotalAmount) FILTER (WHERE ${SOLD} AND OrderDate >= @MonthStart AND OrderDate < @NextMonthStart), 0) AS "thisMonth",
          COALESCE(SUM(TotalAmount) FILTER (WHERE ${SOLD} AND OrderDate >= @LastMonthStart AND OrderDate < @MonthStart), 0) AS "lastMonth"
        FROM Orders`);
    const t = totals.recordset[0];

    const byMonth = await pool.request().input('From', sql.Date, c.sixMonthsAgo).query(`
      WITH Months AS (
        SELECT (@From::date + make_interval(months => n))::date AS MonthStart FROM generate_series(0, 5) AS n
      )
      SELECT to_char(m.MonthStart, 'YYYY-MM') AS month,
             COUNT(o.OrderID) AS orders, COALESCE(SUM(o.TotalAmount), 0) AS value
      FROM Months m
      LEFT JOIN Orders o ON o.${SOLD} AND o.OrderDate >= m.MonthStart AND o.OrderDate < m.MonthStart + INTERVAL '1 month'
      GROUP BY m.MonthStart ORDER BY m.MonthStart`);

    // Ranked by what was actually sold: order lines, excluding cancelled orders.
    const topProducts = await pool.request().query(`
      SELECT oi.Description AS name, SUM(oi.Quantity) AS quantity, SUM(oi.LineTotal) AS sales
      FROM OrderItems oi JOIN Orders o ON o.OrderID = oi.OrderID
      WHERE o.Status <> 'cancelled'
      GROUP BY oi.Description ORDER BY sales DESC LIMIT 5`);

    const topClients = await pool.request().query(`
      SELECT ClientName AS name, COUNT(*) AS orders, SUM(TotalAmount) AS sales
      FROM Orders WHERE ${SOLD}
      GROUP BY ClientName ORDER BY sales DESC LIMIT 5`);

    res.json({
      success: true,
      data: {
        totalSales: t.totalSales,
        orderCount: t.orderCount,
        cancelledCount: t.cancelledCount,
        averageOrderValue: t.orderCount ? Math.round((t.totalSales / t.orderCount) * 100) / 100 : 0,
        thisMonth: t.thisMonth,
        lastMonth: t.lastMonth,
        // null rather than 0: no prior month means growth is undefined.
        monthlyGrowth: pct(t.thisMonth, t.lastMonth),
        byMonth: byMonth.recordset,
        topProducts: topProducts.recordset,
        topClients: topClients.recordset
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to build sales report');
  }
});

app.get('/reports/production', requireDB, reportsOnly, async (req, res) => {
  try {
    const result = await getPool().request().query(`
      SELECT
        (SELECT CAST(SUM(CompletedPieces) * 100.0 / NULLIF(SUM(TargetPieces), 0) AS DECIMAL(9,2))
           FROM ProductionTasks) AS efficiency,
        (SELECT COUNT(*) FROM ProductionOrders WHERE Status = 'Completed') AS "completedOrders",
        (SELECT COUNT(*) FROM ProductionOrders WHERE Status NOT IN ('Completed','Cancelled')) AS "activeOrders",
        (SELECT CAST(AVG(minutes_between(StartTime, EndTime)::float8) AS DECIMAL(10,2))
           FROM ProductionTasks
          WHERE StartTime IS NOT NULL AND EndTime IS NOT NULL) AS "avgProductionTime",
        (SELECT CAST(SUM(PiecesApproved) * 100.0 / NULLIF(SUM(PiecesInspected), 0) AS DECIMAL(9,2))
           FROM QualityInspections) AS "qualityScore"
    `);
    const byStyle = await getPool().request().query(`
      SELECT s.StyleName AS style, SUM(po.TotalQuantity) AS planned, SUM(po.CompletedQuantity) AS completed,
             CAST(SUM(po.CompletedQuantity) * 100.0 / NULLIF(SUM(po.TotalQuantity), 0) AS DECIMAL(9,2)) AS progress
      FROM ProductionOrders po JOIN Styles s ON s.StyleID = po.StyleID
      WHERE po.Status <> 'Cancelled'
      GROUP BY s.StyleName ORDER BY planned DESC`);
    // Nulls mean "nothing recorded yet" and are passed through as such.
    res.json({ success: true, data: { ...result.recordset[0], byStyle: byStyle.recordset } });
  } catch (error) {
    sendError(res, error, 'Failed to build production report');
  }
});

app.get('/reports/inventory', requireDB, reportsOnly, async (req, res) => {
  try {
    const pool = getPool();
    const byCategory = await pool.request().query(`
      SELECT COALESCE(Category, 'Uncategorised') AS category, COUNT(*) AS items,
             SUM(Quantity) AS quantity, COALESCE(SUM(TotalValue), 0) AS value,
             COUNT(*) FILTER (WHERE Status <> 'in-stock') AS "needsReorder"
      FROM vw_InventoryStatus GROUP BY 1 ORDER BY value DESC`);
    const items = await pool.request().query(`
      SELECT ItemName AS "itemName", Category AS category, Quantity AS quantity, Unit AS unit,
             ReorderLevel AS "reorderLevel", UnitCost AS "unitCost", TotalValue AS "totalValue", Status AS status
      FROM vw_InventoryStatus ORDER BY TotalValue DESC`);
    const movements = await pool.request().query(`
      SELECT MovementType AS type, COUNT(*) AS count, SUM(Quantity) AS quantity
      FROM StockMovements WHERE CreatedAt >= LOCALTIMESTAMP - INTERVAL '30 days'
      GROUP BY MovementType ORDER BY MovementType`);
    res.json({ success: true, data: { byCategory: byCategory.recordset, items: items.recordset, last30Days: movements.recordset } });
  } catch (error) {
    sendError(res, error, 'Failed to build inventory report');
  }
});

app.get('/reports/finance', requireDB, reportsOnly, async (req, res) => {
  const c = calendar();
  try {
    const pool = getPool();
    const monthly = await pool.request().input('From', sql.Date, c.sixMonthsAgo).query(`
      WITH Months AS (
        SELECT (@From::date + make_interval(months => n))::date AS MonthStart FROM generate_series(0, 5) AS n
      )
      SELECT to_char(m.MonthStart, 'YYYY-MM') AS month,
             COALESCE(SUM(ft.Amount) FILTER (WHERE ft.Type = 'income'), 0)  AS income,
             COALESCE(SUM(ft.Amount) FILTER (WHERE ft.Type = 'expense'), 0) AS expenses
      FROM Months m
      LEFT JOIN FinanceTransactions ft ON ft.TxnDate >= m.MonthStart AND ft.TxnDate < m.MonthStart + INTERVAL '1 month'
      GROUP BY m.MonthStart ORDER BY m.MonthStart`);
    const byCategory = await pool.request().query(`
      SELECT COALESCE(Category, 'Uncategorised') AS category, Type AS type, SUM(Amount) AS total
      FROM FinanceTransactions GROUP BY 1, 2 ORDER BY total DESC`);
    res.json({ success: true, data: { monthly: monthly.recordset, byCategory: byCategory.recordset } });
  } catch (error) {
    sendError(res, error, 'Failed to build finance report');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`📊 Report Service running on http://${SERVICE_HOST}:${PORT}`);
});
