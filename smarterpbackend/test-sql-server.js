const sql = require('mssql');

// Different configurations to try
const configs = [
  {
    name: "SQL Server Express (Default Instance)",
    server: 'localhost\\SQLEXPRESS',
    database: 'SmartERP',
    user: 'sa',
    password: 'YourSecurePassword123!',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  },
  {
    name: "SQL Server (Default Instance)",
    server: 'localhost',
    database: 'SmartERP',
    user: 'sa',
    password: 'YourSecurePassword123!',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  },
  {
    name: "SQL Server with Computer Name",
    server: 'LAPTOP-SFMOJVIQ\\SQLEXPRESS',
    database: 'SmartERP',
    user: 'sa',
    password: 'YourSecurePassword123!',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  },
  {
    name: "SQL Server with Computer Name (Default)",
    server: 'LAPTOP-SFMOJVIQ',
    database: 'SmartERP',
    user: 'sa',
    password: 'YourSecurePassword123!',
    options: {
      encrypt: false,
      trustServerCertificate: true
    }
  }
];

const testConnection = async (config) => {
  try {
    console.log(`\n🔄 Testing: ${config.name}`);
    console.log(`   Server: ${config.server}`);
    
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT DB_NAME() as DatabaseName, @@VERSION as Version');
    
    console.log('✅ SUCCESS!');
    console.log(`   Database: ${result.recordset[0].DatabaseName}`);
    console.log(`   Version: ${result.recordset[0].Version.split('\n')[0]}`);
    
    await pool.close();
    return config;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message.split('\n')[0]}`);
    return null;
  }
};

const findWorkingConnection = async () => {
  console.log('🔍 Testing different SQL Server connection configurations...\n');
  
  for (const config of configs) {
    const result = await testConnection(config);
    if (result) {
      console.log('\n🎉 Found working configuration!');
      console.log('Update your .env file with:');
      console.log(`DB_SERVER=${result.server}`);
      console.log(`DB_DATABASE=${result.database}`);
      console.log(`DB_USER=${result.user}`);
      console.log(`DB_PASSWORD=${result.password}`);
      console.log(`DB_ENCRYPT=${result.options.encrypt}`);
      console.log(`DB_TRUST_CERT=${result.options.trustServerCertificate}`);
      return;
    }
  }
  
  console.log('\n❌ No working configuration found.');
  console.log('Please check:');
  console.log('1. SQL Server is running');
  console.log('2. SQL Server Browser service is running');
  console.log('3. TCP/IP is enabled in SQL Server Configuration Manager');
  console.log('4. Windows Firewall allows SQL Server connections');
  console.log('5. The SmartERP database exists');
  console.log('6. The sa account is enabled with the correct password');
};

findWorkingConnection();