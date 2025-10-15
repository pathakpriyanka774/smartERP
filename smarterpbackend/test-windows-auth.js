const sql = require('mssql');

// Windows Authentication configurations
const configs = [
  {
    name: "Windows Auth - localhost\\SQLEXPRESS",
    server: 'localhost\\SQLEXPRESS',
    database: 'SmartERP',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      trustedConnection: true
    }
  },
  {
    name: "Windows Auth - .\\SQLEXPRESS",
    server: '.\\SQLEXPRESS',
    database: 'SmartERP',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      trustedConnection: true
    }
  },
  {
    name: "Windows Auth - (local)\\SQLEXPRESS",
    server: '(local)\\SQLEXPRESS',
    database: 'SmartERP',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      trustedConnection: true
    }
  },
  {
    name: "Windows Auth - localhost",
    server: 'localhost',
    database: 'SmartERP',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      trustedConnection: true
    }
  }
];

const testConnection = async (config) => {
  try {
    console.log(`\n🔄 Testing: ${config.name}`);
    console.log(`   Server: ${config.server}`);
    
    const pool = await sql.connect(config);
    const result = await pool.request().query('SELECT DB_NAME() as DatabaseName, SYSTEM_USER as CurrentUser, @@VERSION as Version');
    
    console.log('✅ SUCCESS!');
    console.log(`   Database: ${result.recordset[0].DatabaseName}`);
    console.log(`   User: ${result.recordset[0].CurrentUser}`);
    console.log(`   Version: ${result.recordset[0].Version.split('\\n')[0]}`);
    
    await pool.close();
    return config;
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message.split('\\n')[0]}`);
    return null;
  }
};

const findWorkingConnection = async () => {
  console.log('🔍 Testing Windows Authentication connections...\n');
  
  for (const config of configs) {
    const result = await testConnection(config);
    if (result) {
      console.log('\n🎉 Found working configuration!');
      console.log('Update your .env file with:');
      console.log(`DB_SERVER=${result.server}`);
      console.log(`DB_DATABASE=${result.database}`);
      console.log('# Remove DB_USER and DB_PASSWORD for Windows Auth');
      console.log('# DB_USER=');
      console.log('# DB_PASSWORD=');
      console.log(`DB_ENCRYPT=${result.options.encrypt}`);
      console.log(`DB_TRUST_CERT=${result.options.trustServerCertificate}`);
      return;
    }
  }
  
  console.log('\n❌ No working configuration found.');
  console.log('Troubleshooting steps:');
  console.log('1. Open SQL Server Configuration Manager');
  console.log('2. Enable SQL Server Browser service');
  console.log('3. Enable TCP/IP protocol');
  console.log('4. Check if SQL Server service is running');
  console.log('5. Verify SmartERP database exists in SSMS');
};

findWorkingConnection();