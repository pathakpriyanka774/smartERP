const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { authenticate, isAdmin } = require('../shared/auth');
const { AREA_PERMISSIONS } = require('../shared/permissions');

const app = express();
const PORT = 8000;

// Only the SmartERP frontend may call the API from a browser. CORS_ORIGINS is a
// comma-separated list; requests with no Origin (curl, server-to-server) are
// unaffected, since CORS is enforced by browsers only.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'https://smarterpfrontend.vercel.app,http://localhost:3000')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({ origin: ALLOWED_ORIGINS }));

// Deliberately no express.json() here. The gateway only forwards requests, and
// parsing the body would consume the request stream, so proxied POST/PUT bodies
// would arrive at the downstream service empty.

console.log('🚀 Starting API Gateway...');

/**
 * The menu permissions a service sits behind (any one is enough).
 *
 * Shared with the services, which enforce the same map themselves, so the
 * gateway is not the only line of defence. The page-builder service also
 * serves navigation and page content, so it authorises per route itself and
 * only authentication is required here.
 */
const SERVICE_PERMISSION = AREA_PERMISSIONS;

// Reachable with no token at all. Everything else needs one.
const PUBLIC_PATHS = ['/api/health', '/api/auth/login', '/api/auth/signup', '/api/auth/test'];

// Service targets. 127.0.0.1 rather than localhost: services listen on IPv4
// loopback only, and "localhost" may resolve to ::1 first.
// SERVICE_PORT_OFFSET lets an isolated copy (e.g. the test suite) run beside
// the normal one without either reaching the other's services.
const TARGET_HOST = process.env.SERVICE_TARGET_HOST || '127.0.0.1';
const OFFSET = parseInt(process.env.SERVICE_PORT_OFFSET || '0', 10);
const target = (port) => `http://${TARGET_HOST}:${port + OFFSET}`;
const services = {
  auth: target(5001),
  orders: target(5002),
  inventory: target(5003),
  // production-service (5004) is retired; production-planning-service (5009)
  // covers the same domain against the live schema.
  production: target(5009),
  finance: target(5005),
  clients: target(5006),
  reports: target(5007),
  payroll: target(5008),
  costing: target(5010),
  attendance: target(5011),
  builder: target(5012),
  accounting: target(5013),
  purchases: target(5014)
};

// Health check first
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    message: 'API Gateway is running',
    services: Object.keys(services),
    timestamp: new Date().toISOString()
  });
});

/**
 * Authenticate, then authorise by area.
 *
 * The gateway is where a browser's requests arrive, so refusing here is what
 * the user actually experiences; the services repeat the authentication check
 * for anything that reaches them another way.
 */
app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const full = `/api${req.path}`;
  if (PUBLIC_PATHS.some(p => full === p || full.startsWith(`${p}/`))) return next();

  // Signature, expiry, and the account itself: active, token not revoked,
  // current permissions (shared/auth.js).
  let user;
  try {
    user = await authenticate(req);
  } catch (err) {
    console.error('Session check failed:', err.message);
    return res.status(503).json({ success: false, error: 'Service unavailable', message: 'Cannot verify your session right now. Try again shortly.' });
  }
  if (!user) {
    console.log(`🔒 Unauthenticated: ${req.method} ${req.path}`);
    return res.status(401).json({ success: false, error: 'Authentication required', message: 'Authentication required' });
  }

  const serviceName = req.path.split('/')[1];
  // Unknown or differently-cased prefixes have no proxy and fall through to 404.
  const needed = Object.prototype.hasOwnProperty.call(SERVICE_PERMISSION, serviceName)
    ? SERVICE_PERMISSION[serviceName] : null;
  const held = new Set(user.permissions || []);
  if (needed && !isAdmin(user) && !needed.some(p => held.has(p))) {
    // User id, not e-mail: logs must not carry personal data.
    console.log(`⛔ user ${user.id} lacks ${needed.join('/')} for ${req.method} ${req.path}`);
    return res.status(403).json({ success: false, error: 'Forbidden', message: `You do not have access to ${serviceName}` });
  }
  next();
});

// Setup proxies for all services
Object.keys(services).forEach(serviceName => {
  const serviceUrl = services[serviceName];
  console.log(`Setting up proxy: /api/${serviceName} -> ${serviceUrl}`);
  
  app.use(`/api/${serviceName}`, createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    // Pass the browser's address on (X-Forwarded-For), so the auth service
    // can rate-limit logins per client rather than per gateway.
    xfwd: true,
    pathRewrite: { [`^/api/${serviceName}`]: '' },
    // A hung service must not hold the browser's request open indefinitely.
    proxyTimeout: 30000,
    timeout: 30000,
    onError: (err, req, res) => {
      console.error(`❌ Proxy error for ${serviceName}:`, err.message);
      if (!res.headersSent) {
        // 503 and a generic message: the raw error names internal addresses.
        res.status(503).json({ success: false, error: 'Service unavailable', message: `The ${serviceName} service is not available right now. Try again shortly.` });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      // Path only: query strings can carry personal data.
      console.log(`📡 Proxying: ${req.method} /api/${serviceName}${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      // The services send their own permissive CORS headers; the gateway's
      // policy above is the one the browser should see.
      Object.keys(proxyRes.headers)
        .filter(h => h.startsWith('access-control-'))
        .forEach(h => delete proxyRes.headers[h]);
      console.log(`✅ Response from ${serviceName}: ${proxyRes.statusCode}`);
    }
  }));
});

// Catch-all for debugging
app.use('/api/*', (req, res) => {
  console.log(`❓ Unmatched API route: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'API route not found', path: req.url });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
  console.log('📋 Available services:', Object.keys(services).join(', '));
  console.log('🔗 Test URLs:');
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Auth: http://localhost:${PORT}/api/auth/test`);
});