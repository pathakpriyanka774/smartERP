const { connectDB, getPool, closeDB } = require('./shared/database');

const testConnection = async () => {
  try {
    console.log('🔄 Testing database connection...');
    
    // Connect to database
    await connectDB();
    
    // Test a simple query
    const pool = getPool();
    const result = await pool.request().query('SELECT DB_NAME() as DatabaseName, GETDATE() as CurrentTime');
    
    console.log('✅ Connection successful!');
    console.log('Database:', result.recordset[0].DatabaseName);
    console.log('Server Time:', result.recordset[0].CurrentTime);
    
    // Close connection
    await closeDB();
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
};

testConnection();