/**
 * Disposable test environment: a fresh database, every service and the
 * gateway, all on offset ports.
 *
 * Configure with TEST_DB_HOST, TEST_DB_PORT, TEST_DB_NAME, TEST_DB_USER and
 * TEST_DB_PASSWORD. The database is WIPED and rebuilt on every run, so the
 * name must contain "test" — a guard against pointing the suite at real data.
 */
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BACKEND = path.join(__dirname, '..', '..');
const ROOT = path.join(BACKEND, '..');
const OFFSET = parseInt(process.env.TEST_PORT_OFFSET || '20000', 10);
const SECRET = 'integration-test-secret-not-for-production';

const SERVICES = ['auth', 'order', 'inventory', 'finance', 'client', 'report', 'payroll',
  'production-planning', 'costing', 'attendance', 'page-builder', 'accounting', 'purchase'];
const PORTS = { auth: 5001, order: 5002, inventory: 5003, finance: 5005, client: 5006, report: 5007,
  payroll: 5008, 'production-planning': 5009, costing: 5010, attendance: 5011, 'page-builder': 5012,
  accounting: 5013, purchase: 5014 };

const db = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  database: process.env.TEST_DB_NAME || 'smarterp_test',
  user: process.env.TEST_DB_USER || process.env.USER,
  password: process.env.TEST_DB_PASSWORD || ''
};

const GATEWAY = `http://127.0.0.1:${8000 + OFFSET}/api`;
const procs = [];

const env = () => ({
  ...process.env,
  DB_HOST: db.host, DB_PORT: String(db.port), DB_DATABASE: db.database,
  DB_USER: db.user, DB_PASSWORD: db.password,
  JWT_SECRET: SECRET,
  SERVICE_HOST: '127.0.0.1',
  SERVICE_PORT_OFFSET: String(OFFSET),
  TEST_PORT_OFFSET: String(OFFSET),
  APP_TIMEZONE: 'Asia/Kolkata',
  // Short session cache, so revocation tests need not wait the default 5 s.
  SESSION_CACHE_MS: '1000'
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const waitFor = async (url, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) { const j = await r.json().catch(() => ({})); if (!j.database || j.database === 'connected') return; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const start = async () => {
  if (!/test/i.test(db.database)) {
    throw new Error(`Refusing to run: TEST_DB_NAME "${db.database}" must contain "test" (the database is wiped).`);
  }
  const setup = spawnSync('node', [path.join(ROOT, 'setup-database.js'), '--fresh', '--confirm-wipe'],
    { env: env(), encoding: 'utf8' });
  if (setup.status !== 0) throw new Error(`Database setup failed:\n${setup.stdout}\n${setup.stderr}`);

  const preload = path.join(__dirname, 'shift-port.js');
  for (const s of SERVICES) {
    const p = spawn('node', ['-r', preload, path.join(BACKEND, 'services', `${s}-service`, 'server.js')],
      { env: env(), cwd: BACKEND, stdio: ['ignore', 'ignore', 'pipe'] });
    p.stderr.on('data', d => { if (process.env.TEST_VERBOSE) process.stderr.write(`[${s}] ${d}`); });
    procs.push(p);
  }
  const gw = spawn('node', ['-r', preload, path.join(BACKEND, 'gateway', 'server.js')],
    { env: env(), cwd: BACKEND, stdio: ['ignore', 'ignore', 'pipe'] });
  procs.push(gw);

  await Promise.all(SERVICES.map(s => waitFor(`http://127.0.0.1:${PORTS[s] + OFFSET}/health`)));
  await waitFor(`${GATEWAY}/health`);
};

const stop = async () => {
  for (const p of procs) p.kill('SIGTERM');
  await sleep(200);
};

/** Direct database access for assertions and fixtures. */
const query = async (sql, params) => {
  const c = new Client(db);
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
};

/** Call the API through the gateway. */
const api = async (method, url, { token, body, raw } = {}) => {
  const res = await fetch(`${GATEWAY}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _text: text }; }
  return { status: res.status, body: json };
};

/** Call a service port directly, bypassing the gateway. */
const direct = async (service, url, token) => {
  const res = await fetch(`http://127.0.0.1:${PORTS[service] + OFFSET}${url}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

/** A token as the auth service would issue it. */
const token = (claims, options = { expiresIn: '10m' }) => jwt.sign(claims, SECRET, options);

module.exports = { start, stop, api, direct, query, token, SECRET, GATEWAY };
