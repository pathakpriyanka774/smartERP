/**
 * Restore a SmartERP backup made by backup-database.js.
 *
 *   node scripts/restore-database.js backups/smarterp-20261009-021500.dump --into smarterp_restore_test
 *   node scripts/restore-database.js <file> --into smarterp --force      # overwrite the live database
 *
 * The target defaults to nothing: --into is required, so a restore never lands
 * on the live database by accident. If the target already contains tables the
 * restore stops unless --force is given, in which case existing objects are
 * dropped and replaced (pg_restore --clean).
 *
 * Use a separate --into database for the monthly restore test: restore, point
 * a copy of the services at it, run the test suite, then drop it.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'smarterpbackend/node_modules/dotenv'))
  .config({ path: path.join(ROOT, 'smarterpbackend', '.env'), quiet: true });
const { Client } = require(path.join(ROOT, 'smarterpbackend/node_modules/pg'));

const file = process.argv[2];
const into = (() => { const i = process.argv.indexOf('--into'); return i > -1 ? process.argv[i + 1] : null; })();
const force = process.argv.includes('--force');

if (!file || !into) {
  console.error('Usage: node scripts/restore-database.js <backup.dump> --into <database> [--force]');
  process.exit(1);
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(into)) {
  console.error('❌ --into must be letters, digits and underscores');
  process.exit(1);
}

const conn = {
  host: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

(async () => {
  // Create the target if needed (requires CREATEDB, or create it as a superuser first).
  const admin = new Client({ ...conn, database: process.env.DB_MAINTENANCE_DB || 'postgres' });
  await admin.connect();
  const exists = (await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [into])).rowCount > 0;
  if (!exists) {
    try {
      await admin.query(`CREATE DATABASE ${into}`);
      console.log(`📦 Created database ${into}`);
    } catch (err) {
      await admin.end();
      throw new Error(err.code === '42501'
        ? `${conn.user} may not create databases. Create "${into}" as a superuser, owned by ${conn.user}, then re-run.`
        : err.message);
    }
  }
  await admin.end();

  const target = new Client({ ...conn, database: into });
  await target.connect();
  const tables = (await target.query(
    "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n;
  await target.end();
  if (tables > 0 && !force) {
    throw new Error(`${into} already has ${tables} tables. Restore into an empty database, or add --force to replace them.`);
  }

  const env = { ...process.env, PGHOST: conn.host, PGPORT: String(conn.port), PGUSER: conn.user || '', PGPASSWORD: conn.password || '' };
  const args = ['--dbname', into, '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction'];
  if (force) args.push('--clean', '--if-exists');
  const r = spawnSync('pg_restore', [...args, file], { env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || r.error?.message || 'pg_restore failed').trim());
  console.log(`✅ Restored ${path.basename(file)} into ${into}`);
})().catch(err => {
  console.error(`❌ Restore failed: ${err.message}`);
  process.exit(1);
});
