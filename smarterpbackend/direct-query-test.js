const { connectDB, getPool } = require('./shared/database');

const testQueries = async () => {
  try {
    await connectDB();
    const pool = getPool();
    
    console.log('🧪 Testing Employee Performance Query...');
    const result = await pool.request()
      .input('date', new Date().toISOString().split('T')[0])
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
    
    console.log('✅ Employee Performance Query Success');
    console.log('Records found:', result.recordset.length);
    
    console.log('\n🧪 Testing Machine Availability Query...');
    const result2 = await pool.request()
      .input('date', new Date().toISOString().split('T')[0])
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
    
    console.log('✅ Machine Availability Query Success');
    console.log('Records found:', result2.recordset.length);
    
  } catch (error) {
    console.error('❌ Query Error:', error.message);
  }
};

testQueries();