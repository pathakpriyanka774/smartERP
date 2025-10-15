const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    trustedConnection: !process.env.DB_USER
  }
};

if (process.env.DB_USER && process.env.DB_PASSWORD) {
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;
}

if (process.env.DB_PORT && process.env.DB_PORT.trim() !== '') {
  const port = parseInt(process.env.DB_PORT);
  if (port > 0 && port < 65536) {
    config.port = port;
  }
}

console.log('Testing database connection with config:', {
  server: config.server,
  database: config.database,
  port: config.port,
  trustedConnection: config.options.trustedConnection,
  encrypt: config.options.encrypt
});

async function testConnection() {
  try {
    const pool = await sql.connect(config);
    console.log('✅ Database connection successful!');
    
    const result = await pool.request().query('SELECT @@VERSION as version');
    console.log('SQL Server Version:', result.recordset[0].version);
    
    await pool.close();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Open SQL Server Configuration Manager');
    console.log('2. Go to SQL Server Network Configuration > Protocols for MSSQLSERVER');
    console.log('3. Enable TCP/IP protocol');
    console.log('4. Restart SQL Server service');
    console.log('5. Or try using named pipes by setting DB_SERVER=localhost\\pipe\\sql\\query');
  }
}

testConnection();