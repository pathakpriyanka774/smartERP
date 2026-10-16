/**
 * Which menu permission opens which area of the API.
 *
 * One map, used by the gateway (per URL prefix) and by every service
 * (protectService), so the two can never disagree. Enforcing it in the
 * services as well matters: a service port reached directly, or a request
 * that slipped past the gateway, still needs the area's permission.
 *
 * A list means any one of the permissions is enough. Admins hold all of them.
 */
const AREA_PERMISSIONS = {
  orders: ['orders'],
  inventory: ['inventory'],
  production: ['production'],
  finance: ['expenses'],
  clients: ['clients'],
  // The dashboard reads the same rollups as Reports; report-service narrows
  // the detailed /reports/* routes to 'reports' itself.
  reports: ['reports', 'dashboard'],
  payroll: ['payroll'],
  costing: ['style-costing'],
  attendance: ['attendance'],
  // Invoicing staff need invoices and receipts; the ledger, reports and
  // supplier payments need 'accounting' (narrowed per route in the service).
  accounting: ['accounting', 'invoices'],
  purchases: ['purchases'],
  builder: null,   // authenticated only; page-builder authorises per route and per data source
  auth: null       // login and signup must be reachable without a token
};

/**
 * Where services listen. Loopback by default: only the gateway on the same
 * machine should reach them. Set SERVICE_HOST=0.0.0.0 only when the gateway
 * runs on another host and the ports are firewalled to it.
 */
const SERVICE_HOST = process.env.SERVICE_HOST || '127.0.0.1';

module.exports = { AREA_PERMISSIONS, SERVICE_HOST };
