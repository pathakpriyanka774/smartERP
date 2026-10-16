/**
 * SmartERP API integration tests.
 *
 *   TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5432 TEST_DB_NAME=smarterp_test \
 *   TEST_DB_USER=… TEST_DB_PASSWORD=… npm test
 *
 * Builds a fresh database (the name must contain "test"), starts every
 * service and the gateway on offset ports, and exercises them the way the
 * browser does. Suites share one environment and run in order, because later
 * stories build on records earlier ones create.
 */
const { describe, before, after } = require('node:test');
const env = require('./helpers/environment');

const ctx = {};

describe('SmartERP API', { concurrency: false }, () => {
  before(async () => { await env.start(); }, { timeout: 120000 });
  after(async () => { await env.stop(); });

  require('./suites/security')(env, ctx);
  require('./suites/validation')(env, ctx);
  require('./suites/payroll')(env, ctx);
  require('./suites/inventory')(env, ctx);
  require('./suites/inventory-management')(env, ctx);
  require('./suites/orders')(env, ctx);
  require('./suites/production')(env, ctx);
  require('./suites/reports')(env, ctx);
  require('./suites/invoicing')(env, ctx);
  require('./suites/purchasing')(env, ctx);
  require('./suites/payroll-attendance')(env, ctx);
  require('./suites/sessions-audit')(env, ctx);
  require('./suites/database-safety')(env, ctx);
});
