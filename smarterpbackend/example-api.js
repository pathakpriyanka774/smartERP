const express = require('express');
const { connectDB, getPool, closeDB } = require('./shared/database');
const { initTables } = require('./shared/init-db');

const app = express();
app.use(express.json());

// Initialize database connection
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected');
    
    // Initialize tables
    await initTables();
    console.log('✅ Tables initialized');
    
    // Start server
    const PORT = process.env.API_PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// API Routes
app.get('/api/test', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query('SELECT DB_NAME() as database, GETDATE() as timestamp');
    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all employees
app.get('/api/employees', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query('SELECT * FROM Employees ORDER BY created_at DESC');
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create new employee
app.post('/api/employees', async (req, res) => {
  try {
    const { employee_code, name, email, phone, position, department, base_salary } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('employee_code', employee_code)
      .input('name', name)
      .input('email', email)
      .input('phone', phone)
      .input('position', position)
      .input('department', department)
      .input('base_salary', base_salary)
      .query(`
        INSERT INTO Employees (employee_code, name, email, phone, position, department, base_salary)
        OUTPUT INSERTED.*
        VALUES (@employee_code, @name, @email, @phone, @position, @department, @base_salary)
      `);
    
    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n🔄 Shutting down gracefully...');
  await closeDB();
  process.exit(0);
});

// Start the server
startServer();