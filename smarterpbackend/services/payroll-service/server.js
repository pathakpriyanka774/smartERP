const express = require('express');
const cors = require('cors');
const { connectDB, getPool, sql } = require('../../shared/database');

const app = express();
const PORT = 5008;

app.use(cors());
app.use(express.json());

// Initialize database connection
let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Payroll Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

// Employee routes
app.get('/employees', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        EmployeeID as id,
        EmployeeCode as employeeCode,
        Name as name,
        Email as email,
        Phone as phone,
        Position as position,
        Department as department,
        JoiningDate as joiningDate,
        BaseSalary as baseSalary,
        CTC as ctc,
        Tasks as tasks,
        Address as address,
        EmergencyContact as emergencyContact,
        Status as status,
        IsActive as isActive
      FROM Employees 
      WHERE IsActive = 1 
      ORDER BY Name
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employees' });
  }
});

app.post('/employees', async (req, res) => {
  try {
    const { 
      name, email, phone, position, department, joiningDate, 
      baseSalary, ctc, tasks, address, emergencyContact 
    } = req.body;
    
    if (!name || !email || !position || !department || !baseSalary) {
      return res.status(400).json({ success: false, message: 'Required fields missing' });
    }
    
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request()
      .input('Name', sql.NVarChar(100), name)
      .input('Email', sql.NVarChar(100), email)
      .input('Phone', sql.NVarChar(20), phone || null)
      .input('Position', sql.NVarChar(100), position)
      .input('Department', sql.NVarChar(100), department)
      .input('JoiningDate', sql.Date, joiningDate ? new Date(joiningDate) : null)
      .input('BaseSalary', sql.Decimal(12,2), parseFloat(baseSalary))
      .input('CTC', sql.Decimal(15,2), ctc ? parseFloat(ctc) : null)
      .input('Tasks', sql.NVarChar(sql.MAX), tasks || null)
      .input('Address', sql.NVarChar(500), address || null)
      .input('EmergencyContact', sql.NVarChar(200), emergencyContact || null)
      .execute('sp_CreateEmployee');
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
});

app.put('/employees/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { 
      name, email, phone, position, department, joiningDate,
      baseSalary, ctc, tasks, address, emergencyContact, isActive 
    } = req.body;
    
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    await pool.request()
      .input('EmployeeID', sql.Int, id)
      .input('Name', sql.NVarChar(100), name)
      .input('Email', sql.NVarChar(100), email)
      .input('Phone', sql.NVarChar(20), phone)
      .input('Position', sql.NVarChar(100), position)
      .input('Department', sql.NVarChar(100), department)
      .input('JoiningDate', sql.Date, joiningDate ? new Date(joiningDate) : null)
      .input('BaseSalary', sql.Decimal(12,2), parseFloat(baseSalary))
      .input('CTC', sql.Decimal(15,2), ctc ? parseFloat(ctc) : null)
      .input('Tasks', sql.NVarChar(sql.MAX), tasks)
      .input('Address', sql.NVarChar(500), address)
      .input('EmergencyContact', sql.NVarChar(200), emergencyContact)
      .input('IsActive', sql.Bit, isActive !== undefined ? isActive : true)
      .query(`
        UPDATE Employees 
        SET Name = @Name, Email = @Email, Phone = @Phone, Position = @Position, 
            Department = @Department, JoiningDate = @JoiningDate, BaseSalary = @BaseSalary, 
            CTC = @CTC, Tasks = @Tasks, Address = @Address, 
            EmergencyContact = @EmergencyContact, IsActive = @IsActive
        WHERE EmployeeID = @EmployeeID
      `);
    
    const result = await pool.request()
      .input('EmployeeID', sql.Int, id)
      .query(`
        SELECT 
          EmployeeID as id,
          EmployeeCode as employeeCode,
          Name as name,
          Email as email,
          Phone as phone,
          Position as position,
          Department as department,
          JoiningDate as joiningDate,
          BaseSalary as baseSalary,
          CTC as ctc,
          Tasks as tasks,
          Address as address,
          EmergencyContact as emergencyContact,
          Status as status,
          IsActive as isActive
        FROM Employees 
        WHERE EmployeeID = @EmployeeID
      `);
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ success: false, message: 'Failed to update employee' });
  }
});

// Payroll routes
app.get('/payrolls', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        p.PayrollID as id,
        p.EmployeeID as employeeId,
        p.Month as month,
        p.BaseSalary as basicSalary,
        p.Allowances as overtime,
        p.Deductions as deductions,
        (p.BaseSalary + p.Allowances - p.Deductions) as netSalary,
        'pending' as status,
        e.Name as employeeName,
        e.Position as employeePosition,
        e.Department as employeeDepartment
      FROM Payrolls p
      JOIN Employees e ON p.EmployeeID = e.EmployeeID
      ORDER BY p.ProcessedAt DESC
    `);
    
    // Transform the data to match frontend expectations
    const transformedData = result.recordset.map(row => ({
      id: row.id,
      employeeId: row.employeeId,
      month: row.month,
      basicSalary: row.basicSalary,
      overtime: row.overtime,
      deductions: row.deductions,
      netSalary: row.netSalary,
      status: row.status,
      employee: {
        name: row.employeeName,
        position: row.employeePosition,
        department: row.employeeDepartment
      }
    }));
    
    res.json({ success: true, data: transformedData });
  } catch (error) {
    console.error('Error fetching payrolls:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payrolls' });
  }
});

app.post('/payrolls', async (req, res) => {
  try {
    const { employeeId, month, allowances = 0, deductions = 0 } = req.body;
    
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    
    // Get employee base salary
    const empResult = await pool.request()
      .input('EmployeeID', sql.Int, employeeId)
      .query('SELECT BaseSalary FROM Employees WHERE EmployeeID = @EmployeeID AND IsActive = 1');
    
    if (empResult.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    
    const baseSalary = empResult.recordset[0].BaseSalary;
    
    // Insert payroll
    await pool.request()
      .input('EmployeeID', sql.Int, employeeId)
      .input('Month', sql.NVarChar(7), month)
      .input('BaseSalary', sql.Decimal(10,2), baseSalary)
      .input('Allowances', sql.Decimal(10,2), allowances)
      .input('Deductions', sql.Decimal(10,2), deductions)
      .input('ProcessedBy', sql.Int, 1)
      .query(`
        INSERT INTO Payrolls (EmployeeID, Month, BaseSalary, Allowances, Deductions, ProcessedBy)
        VALUES (@EmployeeID, @Month, @BaseSalary, @Allowances, @Deductions, @ProcessedBy)
      `);
    
    res.json({ success: true, message: 'Payroll created successfully' });
  } catch (error) {
    console.error('Error creating payroll:', error);
    res.status(500).json({ success: false, message: 'Failed to create payroll' });
  }
});

app.put('/payrolls/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { allowances, deductions } = req.body;
    
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    await pool.request()
      .input('PayrollID', sql.Int, id)
      .input('Allowances', sql.Decimal(10,2), allowances || 0)
      .input('Deductions', sql.Decimal(10,2), deductions || 0)
      .query(`
        UPDATE Payrolls 
        SET Allowances = @Allowances, Deductions = @Deductions
        WHERE PayrollID = @PayrollID
      `);
    
    res.json({ success: true, message: 'Payroll updated successfully' });
  } catch (error) {
    console.error('Error updating payroll:', error);
    res.status(500).json({ success: false, message: 'Failed to update payroll' });
  }
});

// Auto-generate payroll
app.post('/payrolls/auto-generate', async (req, res) => {
  try {
    const { month } = req.body;
    
    if (!month) {
      return res.status(400).json({ success: false, message: 'Month is required' });
    }
    
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request()
      .input('Month', sql.NVarChar(7), month)
      .input('ProcessedBy', sql.Int, 1)
      .execute('sp_AutoGeneratePayroll');
    
    res.json({ 
      success: true, 
      data: result.recordset[0], 
      message: `Generated payroll for ${month}` 
    });
  } catch (error) {
    console.error('Error generating payroll:', error);
    res.status(500).json({ success: false, message: 'Failed to generate payroll' });
  }
});

// Stats
app.get('/stats', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Employees) as totalEmployees,
        (SELECT COUNT(*) FROM Employees WHERE IsActive = 1) as activeEmployees,
        (SELECT ISNULL(SUM(BaseSalary + Allowances - Deductions), 0) FROM Payrolls) as totalPayroll,
        (SELECT COUNT(*) FROM Payrolls WHERE ProcessedAt >= DATEADD(month, -1, GETDATE())) as pendingPayrolls,
        (SELECT ISNULL(SUM(BaseSalary * 12), 0) FROM Employees WHERE IsActive = 1) as totalCTC
    `);
    
    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Payroll Service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`💼 Payroll Service running on http://localhost:${PORT}`);
});