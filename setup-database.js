/**
 * Install or upgrade the SmartERP PostgreSQL database.
 *
 *   node setup-database.js                         # install if empty, else apply pending migrations
 *   node setup-database.js --status                # list applied and pending migrations
 *   node setup-database.js --fresh --confirm-wipe  # DELETE EVERYTHING and reinstall
 *
 * Two kinds of SQL live in postgres/:
 *
 *  - Baseline files (postgres/0*.sql) build the schema from nothing. Several
 *    of them DROP and recreate their tables, so they are only ever applied to
 *    an empty database.
 *  - Migrations (postgres/migrations/NNN-*.sql) change an existing database
 *    without losing data. Each runs once, in order, inside a transaction, and
 *    is recorded in SchemaMigrations.
 *
 * So re-running this script on a database that holds data is safe: it applies
 * only the migrations that database has not had yet. Wiping needs both
 * --fresh and --confirm-wipe, so it cannot happen by accident.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('./smarterpbackend/node_modules/pg');

require('./smarterpbackend/node_modules/dotenv')
    .config({ path: path.join(__dirname, 'smarterpbackend', '.env'), quiet: true });

const SCHEMA_DIR = path.join(__dirname, 'postgres');
const MIGRATIONS_DIR = path.join(SCHEMA_DIR, 'migrations');

// Numbered so directory order is dependency order.
const BASELINE = fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.sql')).sort();
const MIGRATIONS = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d{3}-.*\.sql$/.test(f)).sort()
    : [];

const baseConfig = {
    host: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    // Matches shared/database.js, so column defaults seed the same values.
    options: '-c TimeZone=UTC'
};

const args = new Set(process.argv.slice(2));
const fresh = args.has('--fresh');
const confirmWipe = args.has('--confirm-wipe');
const statusOnly = args.has('--status');

/** Create the database from the maintenance database if it does not exist. */
const ensureDatabase = async (dbName) => {
    const admin = new Client({ ...baseConfig, database: process.env.DB_MAINTENANCE_DB || 'postgres' });
    await admin.connect();
    try {
        const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
        if (rowCount) return;
        // CREATE DATABASE cannot take a parameter; the name is validated instead.
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(dbName)) {
            throw new Error(`DB_DATABASE "${dbName}" must be letters, digits and underscores`);
        }
        await admin.query(`CREATE DATABASE ${dbName}`);
        console.log(`📦 Created database ${dbName}`);
    } catch (err) {
        if (err.code === '42501') {
            throw new Error(`${baseConfig.user} may not create databases. Create "${dbName}" as a superuser, owned by ${baseConfig.user}.`);
        }
        throw err;
    } finally {
        await admin.end();
    }
};

const ensureMigrationTable = (client) => client.query(`
    CREATE TABLE IF NOT EXISTS SchemaMigrations (
        Name      VARCHAR(200) PRIMARY KEY,
        AppliedAt TIMESTAMP NOT NULL DEFAULT LOCALTIMESTAMP
    )`);

const businessTableCount = async (client) => (await client.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> 'schemamigrations'`)).rows[0].n;

const applied = async (client) => new Set((await client.query('SELECT Name FROM SchemaMigrations')).rows.map(r => r.name));

/** Run one file and record it, atomically. */
const applyFile = async (client, dir, file, recordAs) => {
    process.stdout.write(`▶️  ${recordAs} `);
    await client.query('BEGIN');
    try {
        await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
        await client.query('INSERT INTO SchemaMigrations (Name) VALUES ($1)', [recordAs]);
        await client.query('COMMIT');
        console.log('ok');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('');
        throw new Error(`${recordAs}: ${err.message}`);
    }
};

(async () => {
    if (!process.env.DB_USER) {
        console.error('❌ DB_USER not set. Copy smarterpbackend/.env.example to .env first.');
        process.exit(1);
    }
    if (fresh && !confirmWipe) {
        console.error('❌ --fresh deletes every table and all data in the database.');
        console.error('   Take a backup first (node scripts/backup-database.js), then re-run with --fresh --confirm-wipe.');
        process.exit(1);
    }
    const dbName = process.env.DB_DATABASE || 'smarterp';
    await ensureDatabase(dbName);

    const client = new Client({ ...baseConfig, database: dbName });
    await client.connect();
    // CASCADE drops and IF NOT EXISTS notices are expected.
    await client.query('SET client_min_messages = warning');

    try {
        if (fresh) {
            // The public schema belongs to the database owner.
            await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
            console.log(`🗑️  Cleared all objects in ${dbName}`);
        }

        const existingTables = await businessTableCount(client);
        await ensureMigrationTable(client);
        let done = await applied(client);

        if (statusOnly) {
            console.log(`Database ${dbName}: ${existingTables} tables`);
            for (const f of BASELINE) console.log(`  ${done.has(`baseline/${f}`) ? '✔' : '·'} baseline/${f}`);
            for (const f of MIGRATIONS) console.log(`  ${done.has(f) ? '✔' : '·'} ${f}`);
            return;
        }

        if (existingTables === 0) {
            console.log(`📐 Empty database: installing baseline schema`);
            for (const f of BASELINE) await applyFile(client, SCHEMA_DIR, f, `baseline/${f}`);
        } else if (![...done].some(n => n.startsWith('baseline/'))) {
            // A database built before migrations existed: it already has the
            // baseline, so record it rather than re-run files that drop tables.
            console.log(`📋 Existing database without migration history: recording baseline as applied`);
            for (const f of BASELINE) {
                await client.query('INSERT INTO SchemaMigrations (Name) VALUES ($1) ON CONFLICT DO NOTHING', [`baseline/${f}`]);
            }
        }

        done = await applied(client);
        const pending = MIGRATIONS.filter(f => !done.has(f));
        if (!pending.length) console.log('✅ No pending migrations');
        for (const f of pending) await applyFile(client, MIGRATIONS_DIR, f, f);

        const { rows } = await client.query(
            `SELECT COUNT(*)::int AS n FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
        console.log(`\n✅ ${dbName} is up to date (${rows[0].n} tables, ${MIGRATIONS.length} migrations known)`);
    } finally {
        await client.end();
    }
})().catch(err => {
    console.error('\n❌ Setup failed:', err.message);
    process.exit(1);
});
