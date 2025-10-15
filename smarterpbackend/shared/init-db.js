const { connectDB, getPool, sql } = require('./database');

const initTables = async () => {
  await connectDB();
  const pool = getPool();
  
  try {
    // Create Users table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users')
      CREATE TABLE Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        email NVARCHAR(100) UNIQUE NOT NULL,
        password NVARCHAR(255) NOT NULL,
        role NVARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
        is_active BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Create Employees table with employee_code
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Employees')
      CREATE TABLE Employees (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employee_code NVARCHAR(20) UNIQUE NOT NULL,
        name NVARCHAR(100) NOT NULL,
        email NVARCHAR(100) UNIQUE NOT NULL,
        phone NVARCHAR(20),
        position NVARCHAR(100) NOT NULL,
        department NVARCHAR(100) NOT NULL,
        joining_date DATE NOT NULL DEFAULT GETDATE(),
        base_salary DECIMAL(12,2) NOT NULL CHECK (base_salary > 0),
        ctc DECIMAL(15,2),
        tasks NVARCHAR(MAX),
        address NVARCHAR(500),
        emergency_contact NVARCHAR(200),
        status NVARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);

    // Create Payrolls table with computed net_salary
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Payrolls')
      CREATE TABLE Payrolls (
        id INT IDENTITY(1,1) PRIMARY KEY,
        employee_id INT NOT NULL,
        month NVARCHAR(7) NOT NULL,
        basic_salary DECIMAL(12,2) NOT NULL CHECK (basic_salary >= 0),
        overtime DECIMAL(10,2) DEFAULT 0 CHECK (overtime >= 0),
        deductions DECIMAL(10,2) DEFAULT 0 CHECK (deductions >= 0),
        bonus DECIMAL(10,2) DEFAULT 0 CHECK (bonus >= 0),
        net_salary AS (basic_salary + overtime + bonus - deductions) PERSISTED,
        status NVARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
        processed_by INT,
        processed_at DATETIME2,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_Payrolls_Employee FOREIGN KEY (employee_id) REFERENCES Employees(id),
        CONSTRAINT UQ_Payrolls_Employee_Month UNIQUE (employee_id, month)
      )
    `);

    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('❌ Error initializing tables:', error);
    throw error;
  }
};

module.exports = { initTables };