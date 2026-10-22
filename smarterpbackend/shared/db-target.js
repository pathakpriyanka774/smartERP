/**
 * Which PostgreSQL the backend uses: this machine's, or the hosted one.
 *
 * Run locally, the app uses the PostgreSQL configured by DB_HOST, DB_USER, ...
 * (smarterpbackend/.env). Deployed, it uses DATABASE_URL (Neon). The repo root
 * .env.local also holds the Neon URL, for running migrations against it, so
 * merely having that URL loaded must not pull a local run onto the hosted
 * database.
 *
 * DB_TARGET=local|remote overrides the choice. Otherwise the target is remote
 * on Render (which sets RENDER on every service) and local everywhere else.
 * NODE_ENV is deliberately not used: ecosystem.config.cjs sets it to
 * production for the gateway even under `npm run start:pm2:local`.
 *
 * Shared by shared/database.js and setup-database.js, so the services and the
 * migrations always agree on which database they mean.
 */

const dbTarget = () => {
  const explicit = (process.env.DB_TARGET || '').trim().toLowerCase();
  if (explicit === 'local' || explicit === 'remote') return explicit;
  if (explicit) throw new Error(`DB_TARGET must be "local" or "remote", not "${process.env.DB_TARGET}"`);
  return process.env.RENDER ? 'remote' : 'local';
};

/**
 * pg treats sslmode=require/prefer/verify-ca as verify-full today and warns that
 * v9 will weaken them to libpq's meaning. Saying verify-full keeps today's
 * (stricter) behaviour and silences the warning.
 */
const pinSslMode = (url) => url.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/, '$1verify-full');

const localConfig = () => ({
  host: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false
});

/**
 * Connection settings for pg (no pool or session options).
 *
 * `unpooled` prefers DATABASE_URL_UNPOOLED, which migrations need: Neon's
 * pooler runs in transaction mode and drops session state between statements.
 * A remote target without any URL falls back to the DB_* settings, so a host
 * configured that way keeps working.
 */
const connectionConfig = ({ unpooled = false } = {}) => {
  if (dbTarget() === 'local') return localConfig();
  const url = (unpooled && process.env.DATABASE_URL_UNPOOLED) || process.env.DATABASE_URL;
  return url ? { connectionString: pinSslMode(url) } : localConfig();
};

/** The database name a config points at. */
const databaseName = (config) => config.connectionString
  ? decodeURIComponent(new URL(config.connectionString).pathname.slice(1))
  : config.database;

/** host:port/database, without credentials, for log messages. */
const describeTarget = (config = connectionConfig()) => {
  const label = dbTarget();
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString);
      return `${label}: ${url.hostname}:${url.port || 5432}${url.pathname}`;
    } catch {
      return `${label}: DATABASE_URL (unparseable)`;
    }
  }
  return `${label}: ${config.host}:${config.port}/${config.database || ''}`;
};

module.exports = { dbTarget, connectionConfig, databaseName, describeTarget };
