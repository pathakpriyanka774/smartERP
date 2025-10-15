const sql = require('mssql');
require('dotenv').config();

const config = {
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
        enableArithAbort: true
    }
};

// Add SQL Server authentication if credentials provided, otherwise use Windows Auth
if (process.env.DB_USER && process.env.DB_PASSWORD) {
    config.user = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;
} else {
    // Use Windows Authentication
    config.options.trustedConnection = true;
}

// Add port if specified and not using named pipes
if (process.env.DB_PORT && process.env.DB_SERVER !== '.' && process.env.DB_PORT.trim() !== '') {
    const port = parseInt(process.env.DB_PORT);
    if (port > 0 && port < 14335010) {
        config.port = port;
    }
}

let pool;

const connectDB = async() => {
    try {
        pool = await sql.connect(config);
        console.log('✅ Connected to MS SQL Server');
        return pool;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
};

const getPool = () => {
    if (!pool) {
        throw new Error('Database not connected. Call connectDB() first.');
    }
    return pool;
};

const closeDB = async() => {
    if (pool) {
        await pool.close();
        console.log('🔒 Database connection closed');
    }
};

module.exports = {
    connectDB,
    getPool,
    closeDB,
    sql
};