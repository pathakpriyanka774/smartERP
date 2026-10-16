// The database cannot be wiped by accident, and backups restore.
const path = require('path');
const { spawnSync } = require('child_process');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..', '..', '..');

module.exports = (env) => describe('Database safety', () => {
  const { query } = env;
  const dbEnv = () => ({
    ...process.env,
    DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
    DB_PORT: process.env.TEST_DB_PORT || '5432',
    DB_DATABASE: process.env.TEST_DB_NAME || 'smarterp_test',
    DB_USER: process.env.TEST_DB_USER || process.env.USER,
    DB_PASSWORD: process.env.TEST_DB_PASSWORD || ''
  });
  const run = (script, args = []) => spawnSync('node', [path.join(ROOT, script), ...args], { env: dbEnv(), encoding: 'utf8' });

  it('re-running setup on a database with data changes nothing', async () => {
    const before = (await query('SELECT COUNT(*)::int AS n FROM Orders'))[0].n;
    const r = run('setup-database.js');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /No pending migrations/);
    const after = (await query('SELECT COUNT(*)::int AS n FROM Orders'))[0].n;
    assert.equal(after, before);
  });

  it('refuses --fresh without --confirm-wipe', async () => {
    const r = run('setup-database.js', ['--fresh']);
    assert.equal(r.status, 1);
    const still = (await query('SELECT COUNT(*)::int AS n FROM Orders'))[0].n;
    assert.ok(still > 0);
  });

  it('records every migration once', async () => {
    const rows = await query("SELECT Name FROM SchemaMigrations WHERE Name NOT LIKE 'baseline/%' ORDER BY Name");
    assert.ok(rows.length >= 4);
    assert.equal(new Set(rows.map(r => r.name)).size, rows.length);
  });

  it('backs up and restores into an empty database', async (t) => {
    const dir = path.join(require('os').tmpdir(), `smarterp-test-backups-${process.pid}`);
    const backup = run('scripts/backup-database.js', ['--dir', dir]);
    assert.equal(backup.status, 0, backup.stderr);
    const file = backup.stdout.match(/Backup (\S+\.dump)/)[1];
    const target = `${dbEnv().DB_DATABASE}_restore`;
    const drop = async () => {
      const { Client } = require('pg');
      const c = new Client({ host: dbEnv().DB_HOST, port: dbEnv().DB_PORT, user: dbEnv().DB_USER, password: dbEnv().DB_PASSWORD, database: 'postgres' });
      await c.connect();
      try { await c.query(`DROP DATABASE IF EXISTS ${target}`); } finally { await c.end(); }
    };
    try {
      await drop();
    } catch (err) {
      t.skip(`cannot create or drop databases as this user (${err.message})`);
      return;
    }
    const restore = run('scripts/restore-database.js', [path.resolve(ROOT, file), '--into', target]);
    if (/may not create databases/.test(restore.stderr)) { t.skip('user may not create databases'); return; }
    assert.equal(restore.status, 0, restore.stderr);
    const { Client } = require('pg');
    const c = new Client({ host: dbEnv().DB_HOST, port: dbEnv().DB_PORT, user: dbEnv().DB_USER, password: dbEnv().DB_PASSWORD, database: target });
    await c.connect();
    const restored = (await c.query('SELECT COUNT(*)::int AS n FROM Orders')).rows[0].n;
    await c.end();
    const original = (await query('SELECT COUNT(*)::int AS n FROM Orders'))[0].n;
    assert.equal(restored, original);
    // Restoring over a database that has data needs --force.
    const again = run('scripts/restore-database.js', [path.resolve(ROOT, file), '--into', target]);
    assert.equal(again.status, 1);
    await drop();
    require('fs').rmSync(dir, { recursive: true, force: true });
  });
});
