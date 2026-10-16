/**
 * Back up the SmartERP database with pg_dump.
 *
 *   node scripts/backup-database.js              # backups/smarterp-YYYYMMDD-HHMMSS.dump
 *   node scripts/backup-database.js --keep 30    # also keep only the newest 30 dumps
 *
 * Writes a custom-format dump (compressed; restore with restore-database.js or
 * pg_restore), then reads it back with `pg_restore --list` so a truncated or
 * corrupt file is reported as a failure instead of being kept as a "backup".
 *
 * Credentials come from smarterpbackend/.env and are passed to pg_dump through
 * its environment, never on the command line, so they do not appear in `ps`.
 * Dumps contain personal and business data: backups/ is git-ignored, and the
 * file is created readable by its owner only.
 *
 * Schedule nightly, e.g. with cron:
 *   15 2 * * *  cd /var/www/html/smartERP && node scripts/backup-database.js --keep 30 >> backups/backup.log 2>&1
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'smarterpbackend/node_modules/dotenv'))
  .config({ path: path.join(ROOT, 'smarterpbackend', '.env'), quiet: true });

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const dir = path.resolve(arg('--dir', process.env.BACKUP_DIR || path.join(ROOT, 'backups')));
const keep = parseInt(arg('--keep', process.env.BACKUP_KEEP || '0'), 10);
const db = process.env.DB_DATABASE || 'smarterp';

const pgEnv = {
  ...process.env,
  PGHOST: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
  PGPORT: String(parseInt(process.env.DB_PORT) || 5432),
  PGUSER: process.env.DB_USER || '',
  PGPASSWORD: process.env.DB_PASSWORD || '',
  PGDATABASE: db,
  ...(process.env.DB_SSL === 'true' ? { PGSSLMODE: 'require' } : {})
};

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, `${db}-${stamp}.dump`);

const run = (cmd, args) => spawnSync(cmd, args, { env: pgEnv, encoding: 'utf8' });

const dump = run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', file]);
if (dump.status !== 0) {
  fs.rmSync(file, { force: true });
  console.error(`❌ Backup failed: ${(dump.stderr || dump.error?.message || '').trim()}`);
  process.exit(1);
}
fs.chmodSync(file, 0o600);

// A dump that pg_restore cannot list is not a backup.
const check = run('pg_restore', ['--list', file]);
if (check.status !== 0) {
  console.error(`❌ Backup written but unreadable, keeping it for inspection: ${file}`);
  process.exit(1);
}
const objects = check.stdout.split('\n').filter(l => l && !l.startsWith(';')).length;
const kb = Math.round(fs.statSync(file).size / 1024);
console.log(`✅ Backup ${path.relative(ROOT, file)} (${kb} KB, ${objects} objects)`);

if (keep > 0) {
  const dumps = fs.readdirSync(dir)
    .filter(f => f.startsWith(`${db}-`) && f.endsWith('.dump'))
    .sort()
    .reverse();
  for (const old of dumps.slice(keep)) {
    fs.rmSync(path.join(dir, old));
    console.log(`🧹 Removed old backup ${old}`);
  }
}
