const jwt = require('jsonwebtoken');
// The gateway does not touch the database, so it never loaded dotenv. Loading
// it here means anything that needs the signing key gets it, wherever it runs.
require('dotenv').config({ quiet: true });

/**
 * Shared authentication and authorisation.
 *
 * Enforced on the server because that is the only place it counts: hiding a
 * menu in the sidebar stops nobody from calling the endpoint behind it. Every
 * service applies `requireAuth`, so a request that skips the gateway and hits
 * a service port directly is rejected the same way.
 */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

/** Admins hold every permission implicitly, so a new menu is not invisible to them. */
const isAdmin = (user) => (user?.role || '').toLowerCase() === 'admin';

const readToken = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !token) return null;
  try {
    // Pinned so a token can never select a weaker algorithm for itself.
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;   // expired, tampered, or signed with a different key
  }
};

// --- Sessions: revocation that takes effect at once --------------------------
//
// A signature alone would keep a token valid for its whole 24 hours after the
// account was deactivated. So every request also checks the account itself:
// it must exist and be active, and the token's version (tv) must equal the
// account's TokenVersion — which goes up when the account is deactivated, its
// role changes, its password is reset or the user signs out (migration 009).
// Permissions are read here too, so granting or removing one applies within
// SESSION_CACHE_MS without signing in again.
const SESSION_CACHE_MS = parseInt(process.env.SESSION_CACHE_MS || '5000', 10);
const sessions = new Map();     // userId -> { at, session }

const loadSession = async (userId) => {
  const hit = sessions.get(userId);
  if (hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit.session;
  // Required lazily: the gateway loads this module too, and connects only when
  // it first needs to check a session.
  const { connectDB, sql } = require('./database');
  const pool = await connectDB();
  const r = await pool.request().input('UserID', sql.Int, userId).query(`
    SELECT u.Role, u.IsActive, u.TokenVersion,
           COALESCE((SELECT array_agg(p.MenuKey) FROM UserPermissions p WHERE p.UserID = u.UserID), '{}') AS Perms
    FROM Users u WHERE u.UserID = @UserID`);
  const row = r.recordset[0];
  const session = row
    ? { role: row.Role, isActive: row.IsActive !== false, tokenVersion: row.TokenVersion || 0, permissions: row.Perms || [] }
    : null;
  if (sessions.size > 10000) sessions.clear();
  sessions.set(userId, { at: Date.now(), session });
  return session;
};

/** Forget a cached session (this process only; others expire within SESSION_CACHE_MS). */
const forgetSession = (userId) => sessions.delete(userId);

/**
 * The current user for a request, checked against the database, or null.
 * Throws only when the database cannot be reached.
 */
const authenticate = async (req) => {
  const claims = readToken(req);
  if (!claims || !Number.isInteger(claims.id)) return null;
  const s = await loadSession(claims.id);
  if (!s || !s.isActive || (claims.tv || 0) !== s.tokenVersion) return null;
  return { ...claims, role: s.role, permissions: s.permissions };
};

const requireAuth = (req, res, next) => {
  authenticate(req).then(user => {
    if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
    req.user = user;
    // Everything this request writes is attributed to the user in the audit log.
    const { runAsActor } = require('./database');
    return runAsActor(user.id, next);
  }).catch(err => {
    console.error('Session check failed:', err.message);
    res.status(503).json({ success: false, message: 'Cannot verify your session right now. Try again shortly.' });
  });
};

/**
 * Require one of the given menu permissions.
 *
 * Checked against the permissions read from the database for this request
 * (see authenticate), so a removed permission stops working within seconds.
 */
const requirePermission = (...menuKeys) => (req, res, next) => {
  const user = req.user;
  if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (isAdmin(user)) return next();

  const held = new Set(user.permissions || []);
  if (menuKeys.some(k => held.has(k))) return next();

  return res.status(403).json({
    success: false,
    message: `You do not have access to this area (${menuKeys.join(' or ')})`
  });
};

/**
 * Apply authentication — and the area's permission — to a whole service,
 * leaving a few paths open.
 *
 *   protectService(app, { permissions: AREA_PERMISSIONS.payroll })
 *
 * `permissions` is checked here as well as in the gateway: the services must
 * not trust the network, because a request sent straight to a service port
 * never passes the gateway. `openPaths` are matched against the start of the
 * path so health checks stay reachable without credentials. The legacy form
 * protectService(app, ['/health']) still works.
 */
const protectService = (app, options = {}) => {
  const { openPaths = ['/health'], permissions = null } = Array.isArray(options) ? { openPaths: options } : options;
  const area = permissions && permissions.length ? requirePermission(...permissions) : null;
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();               // CORS preflight
    if (openPaths.some(p => req.path === p || req.path.startsWith(`${p}/`))) return next();
    return requireAuth(req, res, () => (area ? area(req, res, next) : next()));
  });
};

module.exports = { requireAuth, requirePermission, protectService, readToken, authenticate, forgetSession, isAdmin, JWT_SECRET };
