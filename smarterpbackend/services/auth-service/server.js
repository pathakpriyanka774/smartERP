const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connectDB, getPool, isUniqueViolation, sql } = require('../../shared/database');
const { requireAuth, requirePermission, isAdmin, forgetSession } = require('../../shared/auth');
const { createLimiter } = require('../../shared/rate-limit');
const { pageParams, listPage } = require('../../shared/paginate');
const { check, str, int, oneOf, date, badRequest } = require('../../shared/validate');
const { SERVICE_HOST } = require('../../shared/permissions');
const { BUILT_IN_MENUS } = require('../../shared/app-menus');

/**
 * Every menu key that may be granted, read from the live catalogue rather than
 * the built-in list, so menus a client creates can be granted as well.
 * Falls back to the built-ins if the catalogue is unavailable.
 */
const grantableMenus = async () => {
  try {
    const r = await getPool().request()
      .query("SELECT MenuKey, Label, Section FROM AppMenus WHERE Status = 'Active' ORDER BY Section, SortOrder, Label");
    if (r.recordset.length) {
      return r.recordset.map(x => ({ key: x.MenuKey, label: x.Label, section: x.Section }));
    }
  } catch (err) {
    console.error('Could not read menu catalogue, falling back to built-ins:', err.message);
  }
  return BUILT_IN_MENUS.map(({ key, label, section }) => ({ key, label, section }));
};

const app = express();
const PORT = 5001;

// No fallback secret: a hard-coded default would let anyone who has read the
// source mint valid tokens.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Add it to .env (see .env.example).');
  process.exit(1);
}

app.use(cors());
app.use(express.json());
// Requests arrive through the gateway on loopback, which passes the browser's
// address in X-Forwarded-For; trust that header only from loopback.
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  // Path only: query strings and bodies here can carry e-mail addresses.
  console.log(`📨 Auth Service: ${req.method} ${req.path}`);
  next();
});

// --- Brute-force protection ---------------------------------------------------
// Failed logins are limited per account (5 in 15 minutes) and per client
// address (20 in 15 minutes); signups per address (10 an hour). Exceeding a
// limit answers 429 with Retry-After. A successful login clears the account's
// count. Limits can be tuned (or relaxed for tests) through the environment.
const LIMITS = {
  account: createLimiter({ windowMs: 15 * 60 * 1000, max: parseInt(process.env.LOGIN_MAX_PER_ACCOUNT || '5', 10) }),
  address: createLimiter({ windowMs: 15 * 60 * 1000, max: parseInt(process.env.LOGIN_MAX_PER_ADDRESS || '20', 10) }),
  signup: createLimiter({ windowMs: 60 * 60 * 1000, max: parseInt(process.env.SIGNUP_MAX_PER_ADDRESS || '10', 10) })
};

const tooMany = (res, seconds) => {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({
    success: false,
    message: `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.`
  });
};

/** Security events in the audit log (no e-mail or address stored: user id only). */
const auditEvent = async (action, userId, details = null) => {
  try {
    await getPool().request()
      .input('UserID', sql.Int, userId || null)
      .input('Action', sql.NVarChar(10), action)
      .input('Details', null, details ? JSON.stringify(details) : null)
      .query(`INSERT INTO AuditLog (UserID, Action, TableName, RecordID, NewData)
              VALUES (@UserID, @Action, 'session', @UserID::text, @Details::jsonb)`);
  } catch (err) {
    console.error('Could not write audit event:', err.message);
  }
};

let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Auth Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

const requireDB = (res) => {
  if (!dbConnected) {
    res.status(503).json({ success: false, message: 'Database not connected' });
    return false;
  }
  return true;
};

const toUser = (row, permissions = []) => ({
  id: row.UserID,
  name: row.Username,
  email: row.Email,
  role: row.Role,
  status: row.IsActive === false ? 'Inactive' : 'Active',
  permissions
});

/** Menu keys a user holds. Admins are granted everything implicitly. */
const loadPermissions = async (userId, role) => {
  if ((role || '').toLowerCase() === 'admin') return (await grantableMenus()).map(m => m.key);
  const r = await getPool().request()
    .input('UserID', sql.Int, userId)
    .query('SELECT MenuKey FROM UserPermissions WHERE UserID = @UserID');
  return r.recordset.map(x => x.MenuKey);
};

// The token names the user and their TokenVersion (tv). Every request checks
// both against the database (shared/auth.js), so deactivating an account,
// changing its role, resetting its password or signing out ends its sessions
// within seconds rather than at expiry. Permissions are included for the
// browser's convenience; the server always uses the current ones.
const issueToken = (user, tokenVersion = 0) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, permissions: user.permissions || [], tv: tokenVersion },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

app.get('/test', (req, res) => {
  res.json({ message: 'Auth service is working!' });
});

app.post('/login', async (req, res) => {
  if (!requireDB(res)) return;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }

  const accountKey = String(email).trim().toLowerCase();
  const addressKey = req.ip || 'unknown';
  const wait = Math.max(LIMITS.account.retryAfter(accountKey), LIMITS.address.retryAfter(addressKey));
  if (wait) return tooMany(res, wait);

  try {
    const pool = getPool();
    const result = await pool.request()
      .input('Email', sql.NVarChar(100), email)
      .query('SELECT UserID, Username, Email, PasswordHash, Role, IsActive, TokenVersion FROM Users WHERE Email = @Email');

    const row = result.recordset[0];

    // Same response for unknown account, wrong password and disabled account,
    // so the endpoint cannot be used to enumerate registered addresses.
    if (!row || !row.IsActive || !(await bcrypt.compare(password, row.PasswordHash))) {
      LIMITS.account.hit(accountKey);
      LIMITS.address.hit(addressKey);
      console.log('Failed login attempt');
      await auditEvent('LOGIN_FAIL', row ? row.UserID : null);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    LIMITS.account.reset(accountKey);
    const user = toUser(row, await loadPermissions(row.UserID, row.Role));
    await auditEvent('LOGIN', row.UserID);
    res.json({ success: true, user, token: issueToken(user, row.TokenVersion) });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

app.post('/signup', async (req, res) => {
  if (!requireDB(res)) return;
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  const signupWait = LIMITS.signup.retryAfter(req.ip || 'unknown');
  if (signupWait) return tooMany(res, signupWait);
  LIMITS.signup.hit(req.ip || 'unknown');

  const passwordHash = await bcrypt.hash(password, 10);
  const tx = new sql.Transaction(getPool());
  try {
    await tx.begin();
    // Serialises signups, so two people registering on an empty system cannot
    // both see "no admin yet" and both become Admin.
    await tx.request().query("SELECT pg_advisory_xact_lock(hashtext('smarterp.signup'))");

    const existing = await tx.request()
      .input('Email', sql.NVarChar(100), email)
      .input('Username', sql.NVarChar(50), name)
      .query('SELECT 1 FROM Users WHERE Email = @Email OR Username = @Username');
    if (existing.recordset.length) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Role is never taken from the request body: signup is open to anyone, so
    // that would let any caller make themselves an administrator. The one
    // exception is bootstrap — the first account on a system with no Admin
    // becomes Admin, so a fresh install can be administered at all. Any Admin
    // row counts, active or not, so deactivating the last admin does not
    // reopen the bootstrap.
    const admins = await tx.request()
      .query("SELECT 1 FROM Users WHERE LOWER(Role) = 'admin' LIMIT 1");
    const assignedRole = admins.recordset.length ? 'Employee' : 'Admin';

    const inserted = await tx.request()
      .input('Username', sql.NVarChar(50), name)
      .input('Email', sql.NVarChar(100), email)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .input('Role', sql.NVarChar(20), assignedRole)
      .query(`
        INSERT INTO Users (Username, Email, PasswordHash, Role)
        VALUES (@Username, @Email, @PasswordHash, @Role)
        RETURNING UserID, Username, Email, Role, TokenVersion
      `);
    await tx.commit();

    const row = inserted.recordset[0];
    if (assignedRole === 'Admin') {
      console.log(`Bootstrap: first account (UserID ${row.UserID}) created as Admin`);
    }

    // An Admin holds every permission implicitly. Any other self-registered
    // account starts with none; an admin grants them. Defaulting to a set of
    // menus would hand every signup access to whatever that set contained.
    const user = toUser(row, await loadPermissions(row.UserID, row.Role));
    res.json({ success: true, user, token: issueToken(user, row.TokenVersion) });
  } catch (error) {
    await tx.rollback().catch(() => {});
    if (isUniqueViolation(error)) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    console.error('Signup error:', error.message);
    res.status(500).json({ success: false, message: 'Signup failed' });
  }
});

// Signature and expiry are not enough: the session must not have been revoked.
app.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

/**
 * Sign out. Bumping the token version ends this session and every other
 * session of the account (all devices), because tokens are stateless.
 */
app.post('/logout', requireAuth, async (req, res) => {
  if (!requireDB(res)) return;
  try {
    await getPool().request().input('UserID', sql.Int, req.user.id)
      .query('UPDATE Users SET TokenVersion = TokenVersion + 1 WHERE UserID = @UserID');
    forgetSession(req.user.id);
    await auditEvent('LOGOUT', req.user.id);
    res.json({ success: true, message: 'Signed out' });
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to sign out' });
  }
});

/**
 * Re-read the caller's permissions from the database and hand back a fresh
 * token. Without this, a permission change would not take effect until the
 * existing token expired.
 */
app.get('/session', requireAuth, async (req, res) => {
  if (!requireDB(res)) return;
  try {
    const r = await getPool().request()
      .input('UserID', sql.Int, req.user.id)
      .query('SELECT UserID, Username, Email, Role, IsActive, TokenVersion FROM Users WHERE UserID = @UserID');
    const row = r.recordset[0];
    if (!row || !row.IsActive) return res.status(401).json({ success: false, message: 'Account is not active' });
    const user = toUser(row, await loadPermissions(row.UserID, row.Role));
    res.json({ success: true, user, token: issueToken(user, row.TokenVersion) });
  } catch (error) {
    console.error('Session error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to refresh session' });
  }
});

// --- User administration (requires the user-management permission) ----------

const ROLES = ['Admin', 'Manager', 'Employee'];
const canManageUsers = [requireAuth, requirePermission('user-management')];

app.get('/users', canManageUsers, async (req, res) => {
  if (!requireDB(res)) return;
  try {
    const r = await getPool().request().query(`
      SELECT u.UserID, u.Username, u.Email, u.Role, u.IsActive,
             to_char(u.CreatedAt, 'YYYY-MM-DD') AS created,
             (SELECT STRING_AGG(MenuKey, ',') FROM UserPermissions WHERE UserID = u.UserID) AS Perms
      FROM Users u ORDER BY u.Username
    `);
    const allKeys = (await grantableMenus()).map(m => m.key);
    res.json({
      success: true,
      data: r.recordset.map(x => ({
        id: x.UserID, name: x.Username, email: x.Email, role: x.Role,
        status: x.IsActive ? 'Active' : 'Inactive', created: x.created,
        // An admin's effective permissions are everything, whatever is stored.
        permissions: (x.Role || '').toLowerCase() === 'admin'
          ? allKeys
          : (x.Perms ? x.Perms.split(',') : [])
      }))
    });
  } catch (error) {
    console.error('Error listing users:', error.message);
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
});

/** Menu keys that may be granted — the application's real menus, nothing else. */
app.get('/permissions', canManageUsers, async (req, res) => {
  if (!requireDB(res)) return;
  res.json({ success: true, data: await grantableMenus() });
});

const savePermissions = async (userId, permissions) => {
  const valid = new Set((await grantableMenus()).map(m => m.key));
  const keys = [...new Set((permissions || []).filter(k => valid.has(k)))];
  await getPool().request().input('UserID', sql.Int, userId)
    .query('DELETE FROM UserPermissions WHERE UserID = @UserID');
  for (const key of keys) {
    await getPool().request()
      .input('UserID', sql.Int, userId)
      .input('MenuKey', sql.NVarChar(60), key)
      .query('INSERT INTO UserPermissions (UserID, MenuKey) VALUES (@UserID, @MenuKey)');
  }
  return keys;
};

app.post('/users', canManageUsers, async (req, res) => {
  if (!requireDB(res)) return;
  const { name, email, password, role, permissions, status } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: `role must be one of ${ROLES.join(', ')}` });
  }
  try {
    const pool = getPool();
    const existing = await pool.request()
      .input('Email', sql.NVarChar(100), email)
      .input('Username', sql.NVarChar(50), name)
      .query('SELECT 1 FROM Users WHERE Email = @Email OR Username = @Username');
    if (existing.recordset.length) {
      return res.status(409).json({ success: false, message: 'A user with that name or email already exists' });
    }
    const inserted = await pool.request()
      .input('Username', sql.NVarChar(50), name)
      .input('Email', sql.NVarChar(100), email)
      .input('PasswordHash', sql.NVarChar(255), await bcrypt.hash(password, 10))
      .input('Role', sql.NVarChar(20), role || 'Employee')
      .input('IsActive', sql.Bit, status === 'Inactive' ? 0 : 1)
      .query(`
        INSERT INTO Users (Username, Email, PasswordHash, Role, IsActive)
        VALUES (@Username, @Email, @PasswordHash, @Role, @IsActive)
        RETURNING UserID
      `);
    const id = inserted.recordset[0].UserID;
    const saved = await savePermissions(id, permissions);
    res.json({ success: true, data: { id, permissions: saved } });
  } catch (error) {
    console.error('Error creating user:', error.message);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

app.put('/users/:id', canManageUsers, async (req, res) => {
  if (!requireDB(res)) return;
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
  const { name, email, role, permissions, status, password } = req.body;
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: `role must be one of ${ROLES.join(', ')}` });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  // Locking yourself out is a support ticket, so refuse it outright.
  if (id === req.user.id && status === 'Inactive') {
    return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
  }
  try {
    const r = await getPool().request()
      .input('UserID', sql.Int, id)
      .input('Username', sql.NVarChar(50), name ?? null)
      .input('Email', sql.NVarChar(100), email ?? null)
      .input('Role', sql.NVarChar(20), role ?? null)
      .input('IsActive', sql.Bit, status === undefined ? null : (status === 'Inactive' ? 0 : 1))
      .input('PasswordHash', sql.NVarChar(255), password ? await bcrypt.hash(password, 10) : null)
      .query(`
        UPDATE Users SET
          Username     = COALESCE(@Username, Username),
          Email        = COALESCE(@Email, Email),
          Role         = COALESCE(@Role, Role),
          IsActive     = COALESCE(@IsActive, IsActive),
          PasswordHash = COALESCE(@PasswordHash, PasswordHash)
        WHERE UserID = @UserID
        RETURNING UserID AS id
      `);
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'User not found' });
    const saved = permissions ? await savePermissions(id, permissions) : undefined;
    // Takes effect now in this service; others re-check within seconds.
    forgetSession(id);
    res.json({ success: true, data: { id, permissions: saved } });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ success: false, message: 'That name or email is already taken' });
    }
    console.error('Error updating user:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

app.delete('/users/:id', canManageUsers, async (req, res) => {
  if (!requireDB(res)) return;
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
  if (id === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
  }
  try {
    const r = await getPool().request().input('UserID', sql.Int, id)
      .query('DELETE FROM Users WHERE UserID = @UserID RETURNING UserID AS id');
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'User not found' });
    forgetSession(id);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

// --- Audit trail (Admins only) -------------------------------------------------
// The log holds personal data (HR and user rows), so it is not grantable as a
// menu: only Admins read it.

const adminOnly = [requireAuth, (req, res, next) => (isAdmin(req.user)
  ? next() : res.status(403).json({ success: false, message: 'Only an Admin can view the audit log' }))];

app.get('/audit', adminOnly, async (req, res) => {
  if (!requireDB(res)) return;
  const { errors, value } = check(req.query, {
    table: str({ max: 60, pattern: /^[a-z_]+$/, message: 'table must be a table name' }),
    recordId: str({ max: 60 }),
    userId: int({ min: 1 }),
    action: oneOf(['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAIL', 'LOGOUT']),
    from: date(), to: date()
  });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Table', sql.NVarChar(60), value.table || null)
      .input('RecordID', sql.NVarChar(60), value.recordId || null)
      .input('UserID', sql.Int, value.userId || null)
      .input('Action', sql.NVarChar(10), value.action || null)
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null);
    const result = await listPage(request, `
      SELECT a.AuditID AS id, to_char(a.OccurredAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS occurredAt, a.UserID AS userId,
             u.Username AS userName, a.Action AS action, a.TableName AS tableName, a.RecordID AS recordId,
             a.OldData AS oldData, a.NewData AS newData
      FROM AuditLog a LEFT JOIN Users u ON u.UserID = a.UserID
      WHERE (@Table IS NULL OR a.TableName = @Table) AND (@RecordID IS NULL OR a.RecordID = @RecordID)
        AND (@UserID IS NULL OR a.UserID = @UserID) AND (@Action IS NULL OR a.Action = @Action)
        AND (@From IS NULL OR a.OccurredAt >= @From) AND (@To IS NULL OR a.OccurredAt < @To + 1)`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Audit log error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load the audit log' });
  }
});

app.get('/audit/tables', adminOnly, async (req, res) => {
  if (!requireDB(res)) return;
  try {
    const r = await getPool().request().query('SELECT DISTINCT TableName AS name FROM AuditLog ORDER BY 1');
    res.json({ success: true, data: r.recordset.map(x => x.name) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load tables' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: dbConnected ? 'OK' : 'DEGRADED',
    service: 'Auth Service',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`🔐 Auth Service running on http://localhost:${PORT}`);
  console.log('🔗 Available endpoints:');
  console.log(`   POST http://localhost:${PORT}/login`);
  console.log(`   POST http://localhost:${PORT}/signup`);
  console.log(`   GET  http://localhost:${PORT}/test`);
});
