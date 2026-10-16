const { connectDB } = require('./database');

/**
 * Shared startup for the database-backed services.
 *
 * Connects in the background so the HTTP server can bind immediately, and
 * returns a guard that answers 503 while the pool is not up yet — otherwise
 * every route has to repeat the same check, or worse, throws from getPool().
 */
const initService = (serviceName) => {
  const state = { connected: false };

  connectDB()
    .then(() => {
      state.connected = true;
      console.log(`✅ ${serviceName} connected to SmartERP database`);
    })
    .catch(err => {
      console.error(`❌ ${serviceName} database connection failed:`, err.message);
    });

  const requireDB = (req, res, next) => {
    if (!state.connected) {
      return res.status(503).json({ success: false, message: 'Database not connected' });
    }
    next();
  };

  const health = (req, res) => {
    res.json({
      status: state.connected ? 'OK' : 'DEGRADED',
      service: serviceName,
      database: state.connected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  };

  return { state, requireDB, health };
};

module.exports = { initService };
