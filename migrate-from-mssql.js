/**
 * One-time copy of every SmartERP table from the old SQL Server database into
 * PostgreSQL.
 *
 *   node setup-database.js        # first: create the PostgreSQL tables
 *   node migrate-from-mssql.js    # then: replace their contents with SQL Server's
 *
 * Reads the target from the usual DB_* settings in smarterpbackend/.env and the
 * source from MSSQL_* settings (MSSQL_HOST, MSSQL_PORT, MSSQL_DATABASE,
 * MSSQL_USER, MSSQL_PASSWORD, MSSQL_ENCRYPT, MSSQL_TRUST_CERT).
 *
 * The whole load is one PostgreSQL transaction: every target table is emptied
 * and refilled, or, on any error, left exactly as it was. SQL Server is only
 * read. Primary keys are copied as-is so foreign keys stay valid, and each
 * identity sequence is then moved past the highest copied id.
 *
 * Row data is never printed — only table names and counts — because these
 * tables hold employee and client personal data.
 */
const path = require('path');
const BACKEND = path.join(__dirname, 'smarterpbackend', 'node_modules');
const mssql = require(path.join(BACKEND, 'mssql'));
const pg = require(path.join(BACKEND, 'pg'));

require(path.join(BACKEND, 'dotenv'))
    .config({ path: path.join(__dirname, 'smarterpbackend', '.env'), quiet: true });

// SQL Server hands back DATETIME values as UTC components; writing them from
// the same components keeps every stored wall-clock time unchanged.
pg.defaults.parseInputDatesAsUTC = true;

// Parents before children, so the foreign keys hold at every insert.
const TABLES = [
    'Users', 'Employees', 'Payrolls',
    'Styles', 'Machines', 'ProductionOrders', 'MachineAllocations',
    'ProductionTasks', 'DailyProduction', 'QualityInspections',
    'Materials', 'MaterialCosts', 'StyleCostings',
    'Clients', 'Orders', 'InventoryItems', 'FinanceTransactions',
    'EmployeeAttendance',
    'CustomPages', 'AppMenus', 'CustomColumns', 'CustomColumnValues',
    'UserPermissions'
];

const BATCH_ROWS = 500;

const need = (name) => {
    if (!process.env[name]) {
        console.error(`❌ ${name} is not set in smarterpbackend/.env`);
        process.exit(1);
    }
    return process.env[name];
};

const sourceConfig = () => ({
    server: need('MSSQL_HOST'),
    port: parseInt(process.env.MSSQL_PORT) || 1433,
    database: need('MSSQL_DATABASE'),
    user: need('MSSQL_USER'),
    password: need('MSSQL_PASSWORD'),
    options: {
        encrypt: process.env.MSSQL_ENCRYPT !== 'false',
        trustServerCertificate: process.env.MSSQL_TRUST_CERT !== 'false'
    },
    requestTimeout: 120000
});

const targetConfig = () => ({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: need('DB_DATABASE'),
    user: need('DB_USER'),
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    options: '-c TimeZone=UTC'
});

/** lower-case column name -> SQL Server's spelling, for one source table. */
const sourceColumns = async (src, table) => {
    const r = await src.request()
        .input('t', mssql.NVarChar(128), table)
        .query(`SELECT c.name, c.is_computed
                FROM sys.columns c
                WHERE c.object_id = OBJECT_ID(QUOTENAME(SCHEMA_NAME()) + '.' + QUOTENAME(@t))`);
    return new Map(r.recordset.map(c => [c.name.toLowerCase(), c]));
};

/** Target columns that accept a value: generated ones are computed by PostgreSQL. */
const targetColumns = async (dst, table) => {
    const r = await dst.query(
        `SELECT column_name, is_generated, is_identity
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`, [table.toLowerCase()]);
    return r.rows;
};

const insertBatch = async (dst, table, columns, rows) => {
    const values = [];
    const tuples = rows.map(row => {
        const slots = columns.map(col => {
            values.push(row[col.source]);
            return `$${values.length}`;
        });
        return `(${slots.join(', ')})`;
    });
    await dst.query(
        `INSERT INTO ${table} (${columns.map(c => c.target).join(', ')})
         OVERRIDING SYSTEM VALUE
         VALUES ${tuples.join(', ')}`,
        values);
};

(async () => {
    const src = await new mssql.ConnectionPool(sourceConfig()).connect();
    const dst = new pg.Client(targetConfig());
    await dst.connect();
    console.log('🔌 Connected to SQL Server (read only) and PostgreSQL\n');

    const report = [];
    try {
        await dst.query('BEGIN');

        // Empty every target first: the schema seeds sample rows, and CASCADE
        // is safe because all dependent tables are refilled below.
        const present = [];
        for (const table of TABLES) {
            if ((await targetColumns(dst, table)).length) present.push(table);
        }
        if (present.length !== TABLES.length) {
            throw new Error('PostgreSQL schema is incomplete; run `node setup-database.js` first');
        }
        await dst.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

        for (const table of TABLES) {
            const srcCols = await sourceColumns(src, table);
            if (!srcCols.size) {
                report.push({ table, copied: 0, note: 'not in SQL Server — left empty' });
                continue;
            }
            const dstCols = await targetColumns(dst, table);

            const columns = dstCols
                .filter(c => c.is_generated !== 'ALWAYS')
                .filter(c => srcCols.has(c.column_name) && !srcCols.get(c.column_name).is_computed)
                .map(c => ({ target: c.column_name, source: srcCols.get(c.column_name).name }));
            const skipped = [...srcCols.values()]
                .filter(c => !c.is_computed && !columns.some(k => k.source === c.name))
                .map(c => c.name);

            const { recordset } = await src.request()
                .query(`SELECT ${columns.map(c => `[${c.source}]`).join(', ')} FROM [${table}]`);
            for (let i = 0; i < recordset.length; i += BATCH_ROWS) {
                await insertBatch(dst, table, columns, recordset.slice(i, i + BATCH_ROWS));
            }

            // Move the identity sequence past the copied ids, or the next
            // insert from the app would collide with a migrated row.
            const identity = dstCols.find(c => c.is_identity === 'YES');
            if (identity) {
                await dst.query(
                    `SELECT setval(pg_get_serial_sequence($1, $2),
                                   COALESCE((SELECT MAX(${identity.column_name}) FROM ${table}), 1),
                                   (SELECT COUNT(*) > 0 FROM ${table}))`,
                    [table.toLowerCase(), identity.column_name]);
            }

            const { rows: [{ n }] } = await dst.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
            if (n !== recordset.length) {
                throw new Error(`${table}: read ${recordset.length} rows but PostgreSQL holds ${n}`);
            }
            report.push({
                table,
                copied: n,
                note: skipped.length ? `SQL Server-only columns not copied: ${skipped.join(', ')}` : ''
            });
        }

        await dst.query('COMMIT');
    } catch (err) {
        await dst.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        await src.close();
        await dst.end();
    }

    const width = Math.max(...report.map(r => r.table.length));
    for (const r of report) {
        console.log(`   ${r.table.padEnd(width)}  ${String(r.copied).padStart(6)}  ${r.note}`);
    }
    const total = report.reduce((sum, r) => sum + r.copied, 0);
    console.log(`\n✅ Copied ${total} rows across ${report.length} tables; PostgreSQL row counts match SQL Server.`);
})().catch(err => {
    console.error('\n❌ Migration failed, PostgreSQL left unchanged:', err.message);
    process.exit(1);
});
