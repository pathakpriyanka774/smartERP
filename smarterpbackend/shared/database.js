/**
 * PostgreSQL access for every service.
 *
 * The services were written against the `mssql` driver, so this module keeps
 * the part of its API they use — pool.request().input(...).query(...),
 * .execute(proc), result.recordset / recordsets / rowsAffected, and
 * sql.Transaction — on top of `pg`. Service code changes only in its SQL text.
 *
 * Three things differ between the drivers and are reconciled here:
 *
 * 1. Parameters. `@Name` in the SQL text becomes a positional `$n`, cast to the
 *    type given to .input(), so PostgreSQL never has to guess a parameter's type
 *    (it cannot, for example, in `@X IS NULL OR col = @X`).
 *
 * 2. Column-name case. The schema (repo root, postgres/*.sql) writes identifiers
 *    in PascalCase but leaves them unquoted, so PostgreSQL stores and returns
 *    them lower-case. Result keys are restored to the case the SQL was written
 *    in: first from the query's own `AS` aliases, then from any identifier in
 *    the query text, then from the schema files. `SELECT EmployeeID AS id`
 *    still yields `id`, and `SELECT * FROM vw_MachineStatus` still yields
 *    `MachineCode`, exactly as SQL Server returned them.
 *
 * 3. Values. BIGINT (every COUNT) and NUMERIC come back as JS numbers, and
 *    DATE / TIMESTAMP are read and written as UTC components, matching mssql.
 *    shared/app-time.js depends on that last point to store wall-clock times.
 */
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const pg = require('pg');
require('dotenv').config({
  path: [
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env')
  ],
  quiet: true
});

// --- Value conversion ---------------------------------------------------------

const { types } = pg;
types.setTypeParser(20, v => parseInt(v, 10));                          // int8
types.setTypeParser(1700, v => parseFloat(v));                          // numeric
types.setTypeParser(1082, v => new Date(`${v}T00:00:00Z`));             // date
types.setTypeParser(1114, v => new Date(`${v.replace(' ', 'T')}Z`));    // timestamp

// Serialise Date parameters from their UTC components, as mssql did.
pg.defaults.parseInputDatesAsUTC = true;

// --- Parameter types (the subset of mssql's `sql.*` the services use) ---------

const typeFactory = (pgType) => {
  // mssql accepts both sql.Int and sql.NVarChar(50); length and precision are
  // irrelevant to a cast, so both forms resolve to the same type.
  const factory = () => ({ pgType });
  factory.pgType = pgType;
  return factory;
};

const sql = {
  Int: typeFactory('int'),
  BigInt: typeFactory('bigint'),
  SmallInt: typeFactory('smallint'),
  TinyInt: typeFactory('smallint'),
  Bit: typeFactory('boolean'),
  Decimal: typeFactory('numeric'),
  Numeric: typeFactory('numeric'),
  Money: typeFactory('numeric'),
  Float: typeFactory('float8'),
  Real: typeFactory('float4'),
  NVarChar: typeFactory('text'),
  VarChar: typeFactory('text'),
  NChar: typeFactory('text'),
  Char: typeFactory('text'),
  NText: typeFactory('text'),
  Text: typeFactory('text'),
  Date: typeFactory('date'),
  DateTime: typeFactory('timestamp'),
  DateTime2: typeFactory('timestamp'),
  SmallDateTime: typeFactory('timestamp'),
  Time: typeFactory('time'),
  UniqueIdentifier: typeFactory('uuid'),
  MAX: Infinity
};

// --- Column-name case ---------------------------------------------------------

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g;

/** SQL text with comments, string literals and quoted identifiers blanked. */
const stripLiterals = (text) =>
  text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');

/**
 * lower-case name -> written name. Aliases (the identifier after AS) win over
 * any other mention; otherwise the first mention wins, except that an
 * all-caps spelling (a keyword, usually) gives way to any other.
 */
const isAllCaps = (s) => s === s.toUpperCase() && s !== s.toLowerCase();

const remember = (map, ident) => {
  const lower = ident.toLowerCase();
  const current = map.get(lower);
  if (!current || (isAllCaps(current) && !isAllCaps(ident))) map.set(lower, ident);
};

const caseMapFrom = (text, into = new Map()) => {
  const clean = stripLiterals(text);
  // `CAST(x AS DATE)` matches too; the all-caps rule lets a real `AS date`
  // alias win over it.
  const aliases = new Map();
  for (const m of clean.matchAll(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) remember(aliases, m[1]);
  for (const [ident] of clean.matchAll(IDENT)) {
    if (ident !== ident.toLowerCase()) remember(into, ident);
  }
  for (const [lower, alias] of aliases) {
    if (!isAllCaps(alias) || !into.has(lower)) into.set(lower, alias);
  }
  return into;
};

const SCHEMA_DIR = path.join(__dirname, '..', '..', 'postgres');
const MIGRATIONS_DIR = path.join(SCHEMA_DIR, 'migrations');

/**
 * Case maps from the schema files: one for tables and views, and one per
 * function built from its RETURNS TABLE list. Functions are kept apart because
 * sp_CreateEmployee returns camelCase names (employeeCode) that would
 * otherwise collide with the PascalCase columns (EmployeeCode).
 */
const loadSchemaCase = () => {
  const tables = new Map();
  const functions = new Map();
  // Baseline files, then migrations in order, so a later definition of a
  // function or view (CREATE OR REPLACE) wins over the earlier one.
  let files = [];
  for (const dir of [SCHEMA_DIR, MIGRATIONS_DIR]) {
    try {
      files.push(...fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => path.join(dir, f)));
    } catch {
      if (dir === SCHEMA_DIR) console.warn(`⚠️  ${SCHEMA_DIR} not found; SELECT * results will have lower-case keys`);
    }
  }
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    // Quoted identifiers are kept: a RETURNS TABLE list may need to quote a
    // name that is a keyword, such as "position".
    const withoutBodies = text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ')    // $$ … $$ and $tag$ … $tag$ bodies
      .replace(/'(?:[^']|'')*'/g, "''");
    for (const stmt of withoutBodies.split(';')) {
      const fn = stmt.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z_][A-Za-z0-9_]*)[\s\S]*?RETURNS\s+TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/i);
      if (fn) {
        const cols = new Map();
        for (const col of fn[2].split(',')) {
          const name = col.trim().split(/\s+/)[0].replace(/^"|"$/g, '');
          if (name) cols.set(name.toLowerCase(), name);
        }
        functions.set(fn[1].toLowerCase(), cols);
      } else if (/CREATE\s+(TABLE|VIEW)|ALTER\s+TABLE[\s\S]*ADD\s+COLUMN/i.test(stmt)) {
        caseMapFrom(stmt, tables);
      }
    }
  }
  return { tables, functions };
};

const schemaCase = loadSchemaCase();

// Most query texts are constant, so their maps are cached. Bounded, because a
// few are built per request (IN lists with one parameter per id).
const queryCaseCache = new Map();
const QUERY_CASE_CACHE_LIMIT = 1000;

const caseMapForQuery = (text) => {
  let map = queryCaseCache.get(text);
  if (!map) {
    map = caseMapFrom(text);
    if (queryCaseCache.size >= QUERY_CASE_CACHE_LIMIT) queryCaseCache.clear();
    queryCaseCache.set(text, map);
  }
  return map;
};

const toRecordset = (result, caseMap) => {
  const names = result.fields.map(f =>
    caseMap.get(f.name) || schemaCase.tables.get(f.name) || f.name);
  return result.rows.map(values => {
    const row = {};
    names.forEach((name, i) => { row[name] = values[i]; });
    return row;
  });
};

// --- @Name -> $n --------------------------------------------------------------

/**
 * Replace each @Name with a typed positional parameter. String literals,
 * quoted identifiers, comments and dollar-quoted bodies are copied through
 * untouched, so an '@' inside an e-mail literal is never mistaken for one.
 */
const bindParameters = (text, inputs) => {
  const values = [];
  const positions = new Map();
  const skip = /'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$\$[\s\S]*?\$\$|@([A-Za-z_][A-Za-z0-9_]*)/g;

  const out = text.replace(skip, (match, name) => {
    if (!name) return match;
    const input = inputs.get(name.toLowerCase());
    if (!input) throw new Error(`Must declare the scalar variable "@${name}".`);
    let n = positions.get(input.name);
    if (!n) {
      values.push(input.value);
      n = values.length;
      positions.set(input.name, n);
    }
    return input.pgType ? `$${n}::${input.pgType}` : `$${n}`;
  });
  return { text: out, values };
};

// --- Acting user (for the audit trail) ----------------------------------------

/**
 * The authenticated user a piece of work is done for. shared/auth.js runs each
 * request inside runAsActor(userId, …); every write made while handling it
 * then sets the PostgreSQL setting app.user_id, which the audit triggers
 * (migration 009) record. Work outside a request (startup, migrations) has no
 * actor and is logged with an empty user.
 */
const actorContext = new AsyncLocalStorage();
const runAsActor = (userId, fn) => actorContext.run({ userId }, fn);
const currentActor = () => actorContext.getStore()?.userId || null;

// Statements that may change data (functions included: sp_* write).
const WRITES = /\b(INSERT|UPDATE|DELETE|sp_\w+)\b/i;

// --- Request / Transaction ----------------------------------------------------

class Request {
  constructor(parent) {
    // A Request runs on the pool, or on a transaction's dedicated client.
    this._parent = parent || getPool();
    this._inputs = new Map();
  }

  input(name, type, value) {
    if (arguments.length === 2) { value = type; type = undefined; }
    const pgType = type ? (type.pgType || (typeof type === 'function' ? type().pgType : undefined)) : undefined;
    this._inputs.set(name.toLowerCase(), { name, pgType, value: value === undefined ? null : value });
    return this;
  }

  async _run(text, values, caseMap) {
    const actor = currentActor();
    let raw;
    if (actor && !(this._parent instanceof Transaction) && WRITES.test(text)) {
      // A write outside a transaction: run it on one connection with the
      // acting user set, so the audit triggers can record who made it.
      const conn = await this._parent._pg.connect();
      try {
        await conn.query("SELECT set_config('app.user_id', $1, false)", [String(actor)]);
        raw = await conn.query({ text, values, rowMode: 'array' });
      } finally {
        await conn.query("SELECT set_config('app.user_id', '', false)").catch(() => {});
        conn.release();
      }
    } else {
      raw = await this._parent._client().query({ text, values, rowMode: 'array' });
    }
    // A parameterless text with several statements returns one result each.
    const results = Array.isArray(raw) ? raw : [raw];
    const recordsets = results
      .filter(r => r.fields && r.fields.length)
      .map(r => toRecordset(r, caseMap));
    return {
      recordsets,
      recordset: recordsets[0] || [],
      rowsAffected: results.map(r => r.rowCount || 0),
      output: {}
    };
  }

  async query(text) {
    const bound = bindParameters(text, this._inputs);
    return this._run(bound.text, bound.values, caseMapForQuery(text));
  }

  /** Call a function created from a former stored procedure, by named arguments. */
  async execute(procedure) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(procedure)) {
      throw new Error(`Invalid procedure name: ${procedure}`);
    }
    const values = [];
    const args = [...this._inputs.values()].map(input => {
      values.push(input.value);
      const cast = input.pgType ? `::${input.pgType}` : '';
      return `p_${input.name.toLowerCase()} => $${values.length}${cast}`;
    });
    const text = `SELECT * FROM ${procedure}(${args.join(', ')})`;
    return this._run(text, values, schemaCase.functions.get(procedure.toLowerCase()) || new Map());
  }
}

class Transaction {
  constructor(pool) {
    this._pool = pool || getPool();
    this._conn = null;
  }

  _client() {
    if (!this._conn) throw new Error('Transaction has not begun');
    return this._conn;
  }

  async begin() {
    this._conn = await this._pool._pg.connect();
    try {
      await this._conn.query('BEGIN');
      const actor = currentActor();
      // Transaction-local, so it ends with the transaction.
      if (actor) await this._conn.query("SELECT set_config('app.user_id', $1, true)", [String(actor)]);
    } catch (err) {
      this._release(err);
      throw err;
    }
    return this;
  }

  async commit() {
    try {
      await this._client().query('COMMIT');
    } finally {
      this._release();
    }
  }

  async rollback() {
    const conn = this._client();
    try {
      await conn.query('ROLLBACK');
    } finally {
      this._release();
    }
  }

  _release(err) {
    if (this._conn) {
      this._conn.release(err);
      this._conn = null;
    }
  }

  request() {
    return new Request(this);
  }
}

sql.Request = Request;
sql.Transaction = Transaction;

// --- Pool ---------------------------------------------------------------------

const buildConfig = () => ({
  ...(process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false
      }),
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  // CURRENT_DATE and LOCALTIMESTAMP (the column defaults) are evaluated in UTC,
  // as GETDATE() was in the SQL Server container. Local wall-clock values are
  // derived in the application: see shared/app-time.js.
  options: '-c TimeZone=UTC'
});

let pool;
let connecting = null;

/** Connect once; concurrent callers share the same attempt, and a failed attempt can be retried. */
const connectDB = async () => {
  if (pool) return pool;
  if (!connecting) connecting = openPool().finally(() => { connecting = null; });
  return connecting;
};

const openPool = async () => {
  const pgPool = new pg.Pool(buildConfig());
  // An idle client losing its connection must not crash the process.
  pgPool.on('error', err => console.error('❌ PostgreSQL idle client error:', err.message));
  try {
    const client = await pgPool.connect();
    client.release();
  } catch (error) {
    await pgPool.end().catch(() => {});
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
  pool = {
    _pg: pgPool,
    _client: () => pgPool,
    request: () => new Request(pool),
    transaction: () => new Transaction(pool),
    close: () => pgPool.end()
  };
  console.log('✅ Connected to PostgreSQL');
  return pool;
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database not connected. Call connectDB() first.');
  }
  return pool;
};

const closeDB = async () => {
  if (pool) {
    await pool.close();
    pool = undefined;
    console.log('🔒 Database connection closed');
  }
};

/** PostgreSQL's code for a unique or primary-key violation. */
const isUniqueViolation = (error) => error && error.code === '23505';

module.exports = {
  connectDB,
  getPool,
  closeDB,
  isUniqueViolation,
  runAsActor,
  currentActor,
  sql
};
