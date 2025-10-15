const { getPool } = require('../../../shared/database');

// Get production dashboard data for planning manager
const getPlanningDashboard = async (req, res) => {
  try {
    const pool = getPool();
    
    // Get machine status summary
    const machineStatus = await pool.request().query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM Machines 
      GROUP BY status
    `);

    // Get daily production summary
    const dailyProduction = await pool.request().query(`
      SELECT 
        dp.plan_date,
        SUM(dp.target_pieces) as total_target,
        SUM(dp.completed_pieces) as total_completed,
        COUNT(DISTINCT dp.employee_id) as active_employees,
        COUNT(DISTINCT dp.machine_id) as machines_in_use
      FROM DailyProductionPlans dp
      WHERE dp.plan_date = CAST(GETDATE() AS DATE)
      GROUP BY dp.plan_date
    `);

    // Get quality inspection summary
    const qualitySummary = await pool.request().query(`
      SELECT 
        SUM(pieces_sent) as total_sent,
        SUM(pieces_inspected) as total_inspected,
        SUM(pieces_approved) as total_approved,
        SUM(pieces_rejected) as total_rejected,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_inspections
      FROM QualityInspections
      WHERE inspection_date = CAST(GETDATE() AS DATE)
    `);

    // Get active production orders
    const activeOrders = await pool.request().query(`
      SELECT 
        po.order_number,
        po.style_name,
        po.total_quantity,
        po.target_date,
        po.priority,
        SUM(dp.completed_pieces) as completed_pieces
      FROM ProductionOrders po
      LEFT JOIN DailyProductionPlans dp ON po.id = dp.production_order_id
      WHERE po.status = 'in_progress'
      GROUP BY po.id, po.order_number, po.style_name, po.total_quantity, po.target_date, po.priority
    `);

    res.json({
      success: true,
      data: {
        machineStatus: machineStatus.recordset,
        dailyProduction: dailyProduction.recordset[0] || {},
        qualitySummary: qualitySummary.recordset[0] || {},
        activeOrders: activeOrders.recordset
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get employee performance report
const getEmployeePerformance = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const pool = getPool();
    const result = await pool.request()
      .input('date', targetDate)
      .query(`
        SELECT 
          e.EmployeeCode as employee_code,
          e.Name as name,
          e.Department as department,
          dp.target_pieces,
          dp.completed_pieces,
          dp.status,
          m.machine_name,
          po.style_name,
          ea.status as attendance_status,
          CASE 
            WHEN dp.target_pieces > 0 
            THEN CAST(dp.completed_pieces AS FLOAT) / dp.target_pieces * 100 
            ELSE 0 
          END as efficiency_percentage
        FROM Employees e
        LEFT JOIN DailyProductionPlans dp ON e.EmployeeID = dp.employee_id AND dp.plan_date = @date
        LEFT JOIN Machines m ON dp.machine_id = m.id
        LEFT JOIN ProductionOrders po ON dp.production_order_id = po.id
        LEFT JOIN EmployeeAttendance ea ON e.EmployeeID = ea.employee_id AND ea.attendance_date = @date
        WHERE e.Department IN ('Production', 'Quality')
        ORDER BY e.Name
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create daily production plan
const createDailyPlan = async (req, res) => {
  try {
    const { production_order_id, employee_id, machine_id, plan_date, target_pieces } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('production_order_id', production_order_id)
      .input('employee_id', employee_id)
      .input('machine_id', machine_id)
      .input('plan_date', plan_date)
      .input('target_pieces', target_pieces)
      .query(`
        INSERT INTO DailyProductionPlans (production_order_id, employee_id, machine_id, plan_date, target_pieces)
        OUTPUT INSERTED.*
        VALUES (@production_order_id, @employee_id, @machine_id, @plan_date, @target_pieces)
      `);

    // Update machine status to occupied
    await pool.request()
      .input('machine_id', machine_id)
      .query(`UPDATE Machines SET status = 'occupied' WHERE id = @machine_id`);

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get machine availability
const getMachineAvailability = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const pool = getPool();
    const result = await pool.request()
      .input('date', targetDate)
      .query(`
        SELECT 
          m.id,
          m.machine_code,
          m.machine_name,
          m.machine_type,
          m.status,
          m.capacity_per_hour,
          e.Name as assigned_employee,
          po.style_name as current_style
        FROM Machines m
        LEFT JOIN DailyProductionPlans dp ON m.id = dp.machine_id AND dp.plan_date = @date
        LEFT JOIN Employees e ON dp.employee_id = e.EmployeeID
        LEFT JOIN ProductionOrders po ON dp.production_order_id = po.id
        ORDER BY m.machine_code
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getPlanningDashboard,
  getEmployeePerformance,
  createDailyPlan,
  getMachineAvailability
};