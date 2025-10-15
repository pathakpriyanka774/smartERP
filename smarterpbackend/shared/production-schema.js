const { getPool, sql } = require('./database');

const createProductionTables = async () => {
  const pool = getPool();
  
  try {
    // Machines table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Machines')
      CREATE TABLE Machines (
        id INT IDENTITY(1,1) PRIMARY KEY,
        machine_code NVARCHAR(20) UNIQUE NOT NULL,
        machine_name NVARCHAR(100) NOT NULL,
        machine_type NVARCHAR(50) NOT NULL,
        status NVARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance', 'breakdown')),
        location NVARCHAR(100),
        capacity_per_hour INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Production Orders table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ProductionOrders')
      CREATE TABLE ProductionOrders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_number NVARCHAR(50) UNIQUE NOT NULL,
        style_name NVARCHAR(100) NOT NULL,
        total_quantity INT NOT NULL,
        target_date DATE NOT NULL,
        priority NVARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        status NVARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
        created_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Daily Production Plans table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DailyProductionPlans')
      CREATE TABLE DailyProductionPlans (
        id INT IDENTITY(1,1) PRIMARY KEY,
        production_order_id INT NOT NULL,
        employee_id INT NOT NULL,
        machine_id INT NOT NULL,
        plan_date DATE NOT NULL,
        target_pieces INT NOT NULL,
        completed_pieces INT DEFAULT 0,
        status NVARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'paused')),
        start_time DATETIME2,
        end_time DATETIME2,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_DailyPlan_Order FOREIGN KEY (production_order_id) REFERENCES ProductionOrders(id),
        CONSTRAINT FK_DailyPlan_Employee FOREIGN KEY (employee_id) REFERENCES Employees(EmployeeID),
        CONSTRAINT FK_DailyPlan_Machine FOREIGN KEY (machine_id) REFERENCES Machines(id)
      )
    `);

    // Quality Inspection table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'QualityInspections')
      CREATE TABLE QualityInspections (
        id INT IDENTITY(1,1) PRIMARY KEY,
        production_order_id INT NOT NULL,
        employee_id INT NOT NULL,
        pieces_sent INT NOT NULL,
        pieces_inspected INT DEFAULT 0,
        pieces_approved INT DEFAULT 0,
        pieces_rejected INT DEFAULT 0,
        inspection_date DATE NOT NULL,
        inspector_id INT,
        status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
        rejection_reasons NVARCHAR(500),
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_Quality_Order FOREIGN KEY (production_order_id) REFERENCES ProductionOrders(id),
        CONSTRAINT FK_Quality_Employee FOREIGN KEY (employee_id) REFERENCES Employees(EmployeeID),
        CONSTRAINT FK_Quality_Inspector FOREIGN KEY (inspector_id) REFERENCES Employees(EmployeeID)
      )
    `);

    // Employee Attendance table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeAttendance')
      CREATE TABLE EmployeeAttendance (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employee_id INT NOT NULL,
        attendance_date DATE NOT NULL,
        check_in_time DATETIME2,
        check_out_time DATETIME2,
        status NVARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'leave')),
        total_hours DECIMAL(4,2) DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_Attendance_Employee FOREIGN KEY (employee_id) REFERENCES Employees(EmployeeID),
        CONSTRAINT UQ_Employee_Date UNIQUE (employee_id, attendance_date)
      )
    `);

    console.log('✅ Production tables created successfully');
  } catch (error) {
    console.error('❌ Error creating production tables:', error);
    throw error;
  }
};

module.exports = { createProductionTables };