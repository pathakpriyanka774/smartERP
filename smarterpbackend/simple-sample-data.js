const { connectDB, getPool } = require('./shared/database');

const insertSimpleData = async () => {
  try {
    await connectDB();
    const pool = getPool();
    
    console.log('🔄 Inserting sample employees...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM Employees WHERE EmployeeCode = 'EMP001')
      BEGIN
        INSERT INTO Employees (EmployeeCode, Name, Email, Phone, Position, Department, BaseSalary)
        VALUES 
          ('EMP001', 'John Tailor', 'john@company.com', '1234567890', 'Senior Tailor', 'Production', 25000),
          ('EMP002', 'Mary Seamstress', 'mary@company.com', '1234567891', 'Seamstress', 'Production', 22000),
          ('EMP003', 'David Cutter', 'david@company.com', '1234567892', 'Fabric Cutter', 'Production', 20000),
          ('EMP004', 'Sarah Inspector', 'sarah@company.com', '1234567893', 'Quality Inspector', 'Quality', 24000)
        PRINT '✅ Employees inserted'
      END
      ELSE
        PRINT '⚠️ Employees already exist'
    `);

    console.log('🔄 Inserting sample machines...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM Machines WHERE machine_code = 'M001')
      BEGIN
        INSERT INTO Machines (machine_code, machine_name, machine_type, status, capacity_per_hour)
        VALUES 
          ('M001', 'Sewing Machine 1', 'Sewing', 'available', 15),
          ('M002', 'Sewing Machine 2', 'Sewing', 'occupied', 15),
          ('M003', 'Overlock Machine 1', 'Overlock', 'available', 20)
        PRINT '✅ Machines inserted'
      END
      ELSE
        PRINT '⚠️ Machines already exist'
    `);

    console.log('🔄 Inserting sample production orders...');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM ProductionOrders WHERE order_number = 'PO001')
      BEGIN
        INSERT INTO ProductionOrders (order_number, style_name, total_quantity, target_date, priority, status)
        VALUES 
          ('PO001', 'Formal Shirt', 500, '2024-02-15', 'high', 'in_progress'),
          ('PO002', 'Casual Pants', 300, '2024-02-20', 'medium', 'in_progress')
        PRINT '✅ Production orders inserted'
      END
      ELSE
        PRINT '⚠️ Production orders already exist'
    `);

    console.log('🔄 Inserting daily production plan...');
    const result = await pool.request().query(`
      DECLARE @EmployeeID INT, @MachineID INT, @OrderID INT
      
      SELECT @EmployeeID = EmployeeID FROM Employees WHERE EmployeeCode = 'EMP001'
      SELECT @MachineID = id FROM Machines WHERE machine_code = 'M002'  
      SELECT @OrderID = id FROM ProductionOrders WHERE order_number = 'PO001'
      
      IF @EmployeeID IS NOT NULL AND @MachineID IS NOT NULL AND @OrderID IS NOT NULL
      BEGIN
        IF NOT EXISTS (SELECT * FROM DailyProductionPlans WHERE production_order_id = @OrderID AND employee_id = @EmployeeID AND plan_date = CAST(GETDATE() AS DATE))
        BEGIN
          INSERT INTO DailyProductionPlans (production_order_id, employee_id, machine_id, plan_date, target_pieces, completed_pieces, status)
          VALUES (@OrderID, @EmployeeID, @MachineID, CAST(GETDATE() AS DATE), 50, 35, 'in_progress')
          PRINT '✅ Daily production plan inserted'
        END
        ELSE
          PRINT '⚠️ Daily production plan already exists'
      END
      ELSE
        PRINT '❌ Could not find required records for daily production plan'
    `);

    console.log('✅ Simple sample data inserted successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

insertSimpleData();