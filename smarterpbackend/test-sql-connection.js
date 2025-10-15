const sql = require('mssql');

// Test configurations for different SQL Server setups
const configs = [
    {
        name: 'SQL Server with sa account',
        config: {
            server: 'localhost',
            database: 'ERP_System',
            user: 'sa',
            password: 'YourSecurePassword123!',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        }
    },
    {
        name: 'SQL Server Express with Windows Auth',
        config: {
            server: 'localhost\\SQLEXPRESS',
            database: 'ERP_System',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true
            }
        }
    },
    {
        name: 'Default instance with Windows Auth',
        config: {
            server: '.',
            database: 'ERP_System',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true
            }
        }
    }
];

async function testConnection(configObj) {
    console.log(`\n🔍 Testing: ${configObj.name}`);
    console.log('Config:', JSON.stringify(configObj.config, null, 2));
    
    try {
        const pool = await sql.connect(configObj.config);
        console.log('✅ Connection successful!');
        
        const result = await pool.request().query('SELECT @@VERSION as version, DB_NAME() as database');
        console.log('📊 Server Info:', result.recordset[0]);
        
        await pool.close();
        return true;
    } catch (error) {
        console.log('❌ Connection failed:', error.message);
        return false;
    }
}

async function runTests() {
    console.log('🚀 Testing SQL Server connections...\n');
    
    for (const config of configs) {
        const success = await testConnection(config);
        if (success) {
            console.log('\n✨ Found working configuration! Update your .env file with these settings.');
            break;
        }
    }
    
    console.log('\n📝 Instructions:');
    console.log('1. Make sure SQL Server is running');
    console.log('2. Create database "ERP_System" in SSMS if it doesn\'t exist');
    console.log('3. Enable SQL Server Authentication if using sa account');
    console.log('4. Update .env file with working configuration');
}

runTests();