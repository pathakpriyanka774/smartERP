const { connectDB, getPool } = require('./shared/database');
const { createProductionTables } = require('./shared/production-schema');
const { initTables } = require('./shared/init-db');

const insertSampleData = async () => {
  try {
    await connectDB();
    await initTables();
    await createProductionTables();
    
    const pool = getPool();
    
    // Insert sample employees
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM Employees WHERE EmployeeCode = 'EMP001')
      INSERT INTO Employees (EmployeeCode, Name, Email, Phone, Position, Department, BaseSalary)
      VALUES 
        ('EMP001', 'John Tailor', 'john@company.com', '1234567890', 'Senior Tailor', 'Production', 25000),
        ('EMP002', 'Mary Seamstress', 'mary@company.com', '1234567891', 'Seamstress', 'Production', 22000),
        ('EMP003', 'David Cutter', 'david@company.com', '1234567892', 'Fabric Cutter', 'Production', 20000),
        ('EMP004', 'Sarah Inspector', 'sarah@company.com', '1234567893', 'Quality Inspector', 'Quality', 24000),
        ('EMP005', 'Mike Supervisor', 'mike@company.com', '1234567894', 'Production Supervisor', 'Production', 30000)
    `);

    // Insert sample machines
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM Machines WHERE machine_code = 'M001')
      INSERT INTO Machines (machine_code, machine_name, machine_type, status, capacity_per_hour)
      VALUES 
        ('M001', 'Sewing Machine 1', 'Sewing', 'available', 15),
        ('M002', 'Sewing Machine 2', 'Sewing', 'occupied', 15),
        ('M003', 'Overlock Machine 1', 'Overlock', 'available', 20),
        ('M004', 'Cutting Machine 1', 'Cutting', 'maintenance', 25),
        ('M005', 'Pressing Machine 1', 'Pressing', 'available', 30)
    `);

    // Insert sample production orders
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM ProductionOrders WHERE order_number = 'PO001')
      INSERT INTO ProductionOrders (order_number, style_name, total_quantity, target_date, priority, status)
      VALUES 
        ('PO001', 'Formal Shirt', 500, '2024-02-15', 'high', 'in_progress'),
        ('PO002', 'Casual Pants', 300, '2024-02-20', 'medium', 'in_progress'),
        ('PO003', 'Summer Dress', 200, '2024-02-25', 'low', 'planned')
    `);

    // Insert sample daily production plans
    await pool.request().query(`
      INSERT INTO DailyProductionPlans (production_order_id, employee_id, machine_id, plan_date, target_pieces, completed_pieces, status)
      SELECT 
        po.id, 
        e.EmployeeID, 
        m.id, 
        CAST(GETDATE() AS DATE), 
        50, 
        35, 
        'in_progress'
      FROM ProductionOrders po, Employees e, Machines m
      WHERE po.order_number = 'PO001' 
        AND e.EmployeeCode = 'EMP001' 
        AND m.machine_code = 'M002'
        AND NOT EXISTS (
          SELECT * FROM DailyProductionPlans dp 
          WHERE dp.production_order_id = po.id 
            AND dp.employee_id = e.EmployeeID 
            AND dp.plan_date = CAST(GETDATE() AS DATE)
        )
      
      UNION ALL
      
      SELECT 
        po.id, 
        e.EmployeeID, 
        m.id, 
        CAST(GETDATE() AS DATE), 
        40, 
        25, 
        'in_progress'
      FROM ProductionOrders po, Employees e, Machines m
      WHERE po.order_number = 'PO002' 
        AND e.EmployeeCode = 'EMP002' 
        AND m.machine_code = 'M001'
        AND NOT EXISTS (
          SELECT * FROM DailyProductionPlans dp 
          WHERE dp.production_order_id = po.id 
            AND dp.employee_id = e.EmployeeID 
            AND dp.plan_date = CAST(GETDATE() AS DATE)
        )
    `);

    // Insert sample quality inspections
    await pool.request().query(`
      INSERT INTO QualityInspections (production_order_id, employee_id, pieces_sent, pieces_inspected, pieces_approved, pieces_rejected, inspection_date, status, inspector_id)
      SELECT 
        po.id, 
        e1.EmployeeID, 
        30, 
        30, 
        28, 
        2, 
        CAST(GETDATE() AS DATE), 
        'completed', 
        e2.EmployeeID
      FROM ProductionOrders po, Employees e1, Employees e2
      WHERE po.order_number = 'PO001' 
        AND e1.EmployeeCode = 'EMP001' 
        AND e2.EmployeeCode = 'EMP004'
        AND NOT EXISTS (
          SELECT * FROM QualityInspections qi 
          WHERE qi.production_order_id = po.id 
            AND qi.employee_id = e1.EmployeeID 
            AND qi.inspection_date = CAST(GETDATE() AS DATE)
        )
      
      UNION ALL
      
      SELECT 
        po.id, 
        e.EmployeeID, 
        20, 
        0, 
        0, 
        0, 
        CAST(GETDATE() AS DATE), 
        'pending', 
        NULL
      FROM ProductionOrders po, Employees e
      WHERE po.order_number = 'PO002' 
        AND e.EmployeeCode = 'EMP002'
        AND NOT EXISTS (
          SELECT * FROM QualityInspections qi 
          WHERE qi.production_order_id = po.id 
            AND qi.employee_id = e.EmployeeID 
            AND qi.inspection_date = CAST(GETDATE() AS DATE)
        )
    `);

    // Insert sample attendance
    await pool.request().query(`
      INSERT INTO EmployeeAttendance (employee_id, attendance_date, check_in_time, status, total_hours)
      SELECT 
        e.EmployeeID, 
        CAST(GETDATE() AS DATE), 
        DATEADD(hour, 9, CAST(GETDATE() AS DATE)), 
        'present', 
        8.0
      FROM Employees e
      WHERE e.EmployeeCode IN ('EMP001', 'EMP002', 'EMP003')
        AND NOT EXISTS (
          SELECT * FROM EmployeeAttendance ea 
          WHERE ea.employee_id = e.EmployeeID 
            AND ea.attendance_date = CAST(GETDATE() AS DATE)
        )
    `);

    console.log('✅ Sample data inserted successfully');
    
  } catch (error) {
    console.error('❌ Error inserting sample data:', error);
  }
};

insertSampleData();