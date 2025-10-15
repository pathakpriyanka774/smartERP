const { getPool } = require('../../../shared/database');

// Get quality dashboard data
const getQualityDashboard = async (req, res) => {
  try {
    const pool = getPool();
    
    // Today's inspection summary
    const todayInspections = await pool.request().query(`
      SELECT 
        COUNT(*) as total_batches,
        SUM(pieces_sent) as total_pieces_sent,
        SUM(pieces_inspected) as total_inspected,
        SUM(pieces_approved) as total_approved,
        SUM(pieces_rejected) as total_rejected,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_batches,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_batches
      FROM QualityInspections
      WHERE inspection_date = CAST(GETDATE() AS DATE)
    `);

    // Rejection rate by style
    const rejectionByStyle = await pool.request().query(`
      SELECT 
        po.style_name,
        SUM(qi.pieces_inspected) as total_inspected,
        SUM(qi.pieces_rejected) as total_rejected,
        CASE 
          WHEN SUM(qi.pieces_inspected) > 0 
          THEN CAST(SUM(qi.pieces_rejected) AS FLOAT) / SUM(qi.pieces_inspected) * 100 
          ELSE 0 
        END as rejection_rate
      FROM QualityInspections qi
      JOIN ProductionOrders po ON qi.production_order_id = po.id
      WHERE qi.inspection_date >= DATEADD(day, -7, GETDATE())
      GROUP BY po.style_name
      ORDER BY rejection_rate DESC
    `);

    // Pending inspections
    const pendingInspections = await pool.request().query(`
      SELECT 
        qi.id,
        po.order_number,
        po.style_name,
        e.Name as employee_name,
        qi.pieces_sent,
        qi.inspection_date,
        DATEDIFF(hour, qi.created_at, GETDATE()) as hours_pending
      FROM QualityInspections qi
      JOIN ProductionOrders po ON qi.production_order_id = po.id
      JOIN Employees e ON qi.employee_id = e.EmployeeID
      WHERE qi.status = 'pending'
      ORDER BY qi.created_at
    `);

    res.json({
      success: true,
      data: {
        todayInspections: todayInspections.recordset[0] || {},
        rejectionByStyle: rejectionByStyle.recordset,
        pendingInspections: pendingInspections.recordset
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Start inspection process
const startInspection = async (req, res) => {
  try {
    const { inspection_id, inspector_id } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('inspection_id', inspection_id)
      .input('inspector_id', inspector_id)
      .query(`
        UPDATE QualityInspections 
        SET status = 'in_progress', inspector_id = @inspector_id
        OUTPUT INSERTED.*
        WHERE id = @inspection_id
      `);

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Complete inspection
const completeInspection = async (req, res) => {
  try {
    const { inspection_id, pieces_inspected, pieces_approved, pieces_rejected, rejection_reasons } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('inspection_id', inspection_id)
      .input('pieces_inspected', pieces_inspected)
      .input('pieces_approved', pieces_approved)
      .input('pieces_rejected', pieces_rejected)
      .input('rejection_reasons', rejection_reasons || '')
      .query(`
        UPDATE QualityInspections 
        SET 
          pieces_inspected = @pieces_inspected,
          pieces_approved = @pieces_approved,
          pieces_rejected = @pieces_rejected,
          rejection_reasons = @rejection_reasons,
          status = 'completed'
        OUTPUT INSERTED.*
        WHERE id = @inspection_id
      `);

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Send pieces for inspection
const sendForInspection = async (req, res) => {
  try {
    const { production_order_id, employee_id, pieces_sent } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('production_order_id', production_order_id)
      .input('employee_id', employee_id)
      .input('pieces_sent', pieces_sent)
      .input('inspection_date', new Date().toISOString().split('T')[0])
      .query(`
        INSERT INTO QualityInspections (production_order_id, employee_id, pieces_sent, inspection_date)
        OUTPUT INSERTED.*
        VALUES (@production_order_id, @employee_id, @pieces_sent, @inspection_date)
      `);

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get quality reports
const getQualityReports = async (req, res) => {
  try {
    const { start_date, end_date, style_name } = req.query;
    
    const pool = getPool();
    let query = `
      SELECT 
        po.order_number,
        po.style_name,
        e.Name as employee_name,
        qi.inspection_date,
        qi.pieces_sent,
        qi.pieces_inspected,
        qi.pieces_approved,
        qi.pieces_rejected,
        qi.rejection_reasons,
        i.Name as inspector_name,
        CASE 
          WHEN qi.pieces_inspected > 0 
          THEN CAST(qi.pieces_rejected AS FLOAT) / qi.pieces_inspected * 100 
          ELSE 0 
        END as rejection_rate
      FROM QualityInspections qi
      JOIN ProductionOrders po ON qi.production_order_id = po.id
      JOIN Employees e ON qi.employee_id = e.EmployeeID
      LEFT JOIN Employees i ON qi.inspector_id = i.EmployeeID
      WHERE qi.status = 'completed'
    `;
    
    const request = pool.request();
    
    if (start_date) {
      query += ` AND qi.inspection_date >= @start_date`;
      request.input('start_date', start_date);
    }
    
    if (end_date) {
      query += ` AND qi.inspection_date <= @end_date`;
      request.input('end_date', end_date);
    }
    
    if (style_name) {
      query += ` AND po.style_name LIKE @style_name`;
      request.input('style_name', `%${style_name}%`);
    }
    
    query += ` ORDER BY qi.inspection_date DESC`;
    
    const result = await request.query(query);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getQualityDashboard,
  startInspection,
  completeInspection,
  sendForInspection,
  getQualityReports
};