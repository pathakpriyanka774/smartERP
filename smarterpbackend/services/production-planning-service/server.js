const express = require('express');
const cors = require('cors');
const { connectDB, getPool, sql } = require('../../shared/database');

const app = express();
const PORT = 5009;

app.use(cors());
app.use(express.json());

let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Production Planning Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

// Planning Manager Dashboard
app.get('/planning/dashboard', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request().execute('sp_GetPlanningDashboard');
    
    // Parse multiple result sets
    const dashboard = {
      productionOverview: result.recordsets[0] || [],
      machineStatus: result.recordsets[1] || [],
      todayProduction: result.recordsets[2] || [],
      qualitySummary: result.recordsets[3] || [],
      metrics: result.recordsets[4][0] || {}
    };
    
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Error fetching planning dashboard:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
});

// Machine Management
app.get('/machines', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM vw_MachineStatus ORDER BY MachineCode
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching machines:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch machines' });
  }
});

app.post('/machines/allocate', async (req, res) => {
  try {
    const { machineId, employeeId, orderId, shiftTime } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('MachineID', sql.Int, machineId)
      .input('EmployeeID', sql.Int, employeeId)
      .input('OrderID', sql.Int, orderId)
      .input('ShiftTime', sql.NVarChar(20), shiftTime)
      .execute('sp_AllocateMachineToEmployee');
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error allocating machine:', error);
    res.status(500).json({ success: false, message: 'Failed to allocate machine' });
  }
});

// Production Orders
app.get('/orders', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM vw_ProductionOverview ORDER BY Priority DESC, DeadlineDate ASC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// Daily Tasks
app.post('/tasks/create', async (req, res) => {
  try {
    const { allocationId, targetPieces, taskDate } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('AllocationID', sql.Int, allocationId)
      .input('TargetPieces', sql.Int, targetPieces)
      .input('TaskDate', sql.Date, taskDate ? new Date(taskDate) : null)
      .execute('sp_CreateDailyTask');
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ success: false, message: 'Failed to create task' });
  }
});

app.get('/tasks/today', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        pt.TaskID,
        pt.TargetPieces,
        pt.CompletedPieces,
        pt.Status,
        e.Name as EmployeeName,
        m.MachineName,
        po.OrderCode,
        s.StyleName,
        ma.ShiftTime
      FROM ProductionTasks pt
      JOIN MachineAllocations ma ON pt.AllocationID = ma.AllocationID
      JOIN Employees e ON ma.EmployeeID = e.EmployeeID
      JOIN Machines m ON ma.MachineID = m.MachineID
      JOIN ProductionOrders po ON ma.OrderID = po.OrderID
      JOIN Styles s ON po.StyleID = s.StyleID
      WHERE pt.TaskDate = CAST(GETDATE() AS DATE)
      ORDER BY pt.Status, e.Name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching today tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
  }
});

// Production Recording
app.post('/production/record', async (req, res) => {
  try {
    const { taskId, piecesCompleted, notes } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('TaskID', sql.Int, taskId)
      .input('PiecesCompleted', sql.Int, piecesCompleted)
      .input('Notes', sql.NVarChar(500), notes || null)
      .execute('sp_RecordProduction');
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error recording production:', error);
    res.status(500).json({ success: false, message: 'Failed to record production' });
  }
});

// Quality Management
app.get('/quality/pending', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        dp.ProductionID,
        dp.ProductionDate,
        dp.PiecesCompleted,
        e.Name as EmployeeName,
        po.OrderCode,
        s.StyleName,
        m.MachineName
      FROM DailyProduction dp
      JOIN Employees e ON dp.EmployeeID = e.EmployeeID
      JOIN ProductionOrders po ON dp.OrderID = po.OrderID
      JOIN Styles s ON po.StyleID = s.StyleID
      JOIN Machines m ON dp.MachineID = m.MachineID
      WHERE dp.QualityStatus = 'ReadyForInspection'
      ORDER BY dp.ProductionDate DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching pending quality items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending items' });
  }
});

app.post('/quality/inspect', async (req, res) => {
  try {
    const { productionId, inspectorId, piecesInspected, piecesApproved, piecesRejected, defectTypes, notes } = req.body;
    
    const pool = getPool();
    
    // Create inspection record
    await pool.request()
      .input('ProductionID', sql.Int, productionId)
      .input('InspectorID', sql.Int, inspectorId)
      .input('PiecesInspected', sql.Int, piecesInspected)
      .input('PiecesApproved', sql.Int, piecesApproved)
      .input('PiecesRejected', sql.Int, piecesRejected)
      .input('DefectTypes', sql.NVarChar(500), defectTypes || null)
      .input('InspectionNotes', sql.NVarChar(1000), notes || null)
      .query(`
        INSERT INTO QualityInspections 
        (ProductionID, InspectorID, PiecesInspected, PiecesApproved, PiecesRejected, DefectTypes, InspectionNotes)
        VALUES (@ProductionID, @InspectorID, @PiecesInspected, @PiecesApproved, @PiecesRejected, @DefectTypes, @InspectionNotes)
      `);
    
    // Update production status
    const qualityStatus = piecesRejected > 0 ? 'Rejected' : 'Approved';
    await pool.request()
      .input('ProductionID', sql.Int, productionId)
      .input('QualityStatus', sql.NVarChar(20), qualityStatus)
      .query(`
        UPDATE DailyProduction 
        SET QualityStatus = @QualityStatus 
        WHERE ProductionID = @ProductionID
      `);
    
    res.json({ success: true, message: 'Quality inspection recorded successfully' });
  } catch (error) {
    console.error('Error recording quality inspection:', error);
    res.status(500).json({ success: false, message: 'Failed to record inspection' });
  }
});

// Employee availability for production
app.get('/employees/production', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        e.EmployeeID,
        e.Name,
        e.Position,
        e.Department,
        CASE 
          WHEN ma.AllocationID IS NOT NULL THEN 'Occupied'
          ELSE 'Available'
        END as Status,
        m.MachineName as CurrentMachine
      FROM Employees e
      LEFT JOIN MachineAllocations ma ON e.EmployeeID = ma.EmployeeID AND ma.Status = 'Active'
      LEFT JOIN Machines m ON ma.MachineID = m.MachineID
      WHERE e.Department IN ('Production', 'Quality') AND e.IsActive = 1
      ORDER BY e.Name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching production employees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employees' });
  }
});

app.listen(PORT, () => {
  console.log(`🏭 Production Planning Service running on http://localhost:${PORT}`);
});