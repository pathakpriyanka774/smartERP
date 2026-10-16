import axios from 'axios';

/**
 * All traffic goes through the API gateway.
 *
 * The gateway authenticates every request and authorises it by area, so
 * calling services directly would bypass the check that matters. Service ports
 * are no longer referenced from the browser at all.
 */
const GATEWAY = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

export const getToken = () => localStorage.getItem('token');

export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
};

/** Authorization header for the components that still use fetch directly. */
export const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const createServiceAPI = (path) => {
  const client = axios.create({
    baseURL: `${GATEWAY}${path}`,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000
  });

  // Read the token per request rather than at construction: it does not exist
  // yet when these clients are created at module load.
  client.interceptors.request.use(config => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  client.interceptors.response.use(
    response => response,
    error => {
      // An expired or revoked token should return the user to the login
      // screen rather than leaving the app in a half-broken state.
      // A 401 from login or signup itself is "wrong credentials": let the form
      // show it instead of reloading the page.
      const url = error?.config?.url || '';
      const isAuthAttempt = /\/(login|signup)$/.test(url);
      if (error?.response?.status === 401 && !isAuthAttempt) {
        clearSession();
        window.location.reload();
      }
      return Promise.reject(error);
    }
  );
  return client;
};

const authAPI_client = createServiceAPI('/auth');
const ordersAPI_client = createServiceAPI('/orders');
const inventoryAPI_client = createServiceAPI('/inventory');
const productionAPI_client = createServiceAPI('/production');
const financeAPI_client = createServiceAPI('/finance');
const clientsAPI_client = createServiceAPI('/clients');
const reportsAPI_client = createServiceAPI('/reports');
const payrollAPI_client = createServiceAPI('/payroll');
const costingAPI_client = createServiceAPI('/costing');
const attendanceAPI_client = createServiceAPI('/attendance');
const builderAPI_client = createServiceAPI('/builder');
const accountingAPI_client = createServiceAPI('/accounting');
const purchasesAPI_client = createServiceAPI('/purchases');

// Auth API
export const authAPI = {
  login: (credentials) => authAPI_client.post('/login', credentials),
  signup: (userData) => authAPI_client.post('/signup', userData),
  verify: (token) => authAPI_client.get('/verify', { headers: { Authorization: `Bearer ${token}` } }),
  test: () => authAPI_client.get('/test'),
  // Re-reads permissions from the database and returns a fresh token, so a
  // permission change lands without waiting for the old token to expire.
  session: () => authAPI_client.get('/session'),
  // Ends this and every other session of the account (all devices).
  logout: () => authAPI_client.post('/logout'),
};

// Audit trail (Admins only). params: { table, recordId, userId, action, from, to, page, pageSize }
export const auditAPI = {
  list: (params) => authAPI_client.get('/audit', { params }),
  tables: () => authAPI_client.get('/audit/tables'),
};

// User administration
export const usersAPI = {
  list: () => authAPI_client.get('/users'),
  permissions: () => authAPI_client.get('/permissions'),
  create: (data) => authAPI_client.post('/users', data),
  update: (id, data) => authAPI_client.put(`/users/${id}`, data),
  remove: (id) => authAPI_client.delete(`/users/${id}`),
};

// Orders API
export const ordersAPI = {
  getAll: (params) => ordersAPI_client.get('/orders', { params }),
  get: (id) => ordersAPI_client.get(`/orders/${id}`),
  create: (orderData) => ordersAPI_client.post('/orders', orderData),
  update: (id, orderData) => ordersAPI_client.put(`/orders/${id}`, orderData),
  // Status changes move stock: confirm reserves, dispatch issues, cancel releases.
  setStatus: (id, status) => ordersAPI_client.post(`/orders/${id}/status`, { status }),
  getStats: () => ordersAPI_client.get('/orders/stats'),
  // Pickers for the order form (no Inventory/Clients permission needed).
  catalogItems: () => ordersAPI_client.get('/orders/catalog/items'),
  catalogClients: () => ordersAPI_client.get('/orders/catalog/clients'),
};

// Inventory API
export const inventoryAPI = {
  // List endpoints are paginated: params { page, pageSize, q, ... } → { data, pagination }
  getAll: (params) => inventoryAPI_client.get('/inventory', { params }),
  get: (id) => inventoryAPI_client.get(`/inventory/${id}`),
  create: (itemData) => inventoryAPI_client.post('/inventory', itemData),
  update: (id, itemData) => inventoryAPI_client.put(`/inventory/${id}`, itemData),
  getStats: () => inventoryAPI_client.get('/inventory/stats'),
  // Every category and unit in use: { categories: [], units: [] }
  getCategories: () => inventoryAPI_client.get('/inventory/categories'),
  // Archive needs nothing on hand or reserved; restore brings it back.
  archive: (id) => inventoryAPI_client.post(`/inventory/${id}/archive`),
  restore: (id) => inventoryAPI_client.post(`/inventory/${id}/restore`),
  // type: 'receipt' | 'issue' | 'adjustment'
  addMovement: (id, data) => inventoryAPI_client.post(`/inventory/${id}/movements`, data),
  getMovements: (id, params) => inventoryAPI_client.get(`/inventory/${id}/movements`, { params }),
  getRecentMovements: (params = { pageSize: 100 }) => inventoryAPI_client.get('/inventory/movements', { params: typeof params === 'number' ? { pageSize: params } : params }),
};

// Production API (production-planning service)
export const productionAPI = {
  getSummary: () => productionAPI_client.get('/planning/summary'),
  getDashboard: () => productionAPI_client.get('/planning/dashboard'),
  getEmployeePerformance: (date) => productionAPI_client.get('/planning/employee-performance', { params: { date } }),
  getMachineAvailability: (date) => productionAPI_client.get('/planning/machine-availability', { params: { date } }),
  getMachines: () => productionAPI_client.get('/machines'),
  allocateMachine: (data) => productionAPI_client.post('/machines/allocate', data),
  getOrders: () => productionAPI_client.get('/orders'),
  createOrder: (data) => productionAPI_client.post('/orders', data),
  getOrderMaterials: (id) => productionAPI_client.get(`/orders/${id}/materials`),
  getStyles: () => productionAPI_client.get('/styles'),
  getSalesOrders: () => productionAPI_client.get('/sales-orders'),
  getProductionEmployees: () => productionAPI_client.get('/employees/production'),
  releaseAllocation: (id) => productionAPI_client.post(`/allocations/${id}/release`),
  createTask: (data) => productionAPI_client.post('/tasks/create', data),
  getTodayTasks: (date) => productionAPI_client.get('/tasks/today', { params: date ? { date } : undefined }),
  recordProduction: (data) => productionAPI_client.post('/production/record', data),
};

// Quality API (production-planning service)
export const qualityAPI = {
  getDashboard: () => productionAPI_client.get('/quality/dashboard'),
  getReports: () => productionAPI_client.get('/quality/reports'),
  getPending: () => productionAPI_client.get('/quality/pending'),
  startInspection: (data) => productionAPI_client.post('/quality/start-inspection', data),
  completeInspection: (data) => productionAPI_client.post('/quality/complete-inspection', data),
  inspect: (data) => productionAPI_client.post('/quality/inspect', data),
};

// Costing API
export const costingAPI = {
  getDashboard: () => costingAPI_client.get('/dashboard'),
  getStyles: () => costingAPI_client.get('/styles'),
  getStyle: (styleId) => costingAPI_client.get(`/style/${styleId}`),
  getMaterials: () => costingAPI_client.get('/materials'),
  getBreakdown: (styleId) => costingAPI_client.get(`/breakdown/${styleId}`),
  getMaterialUsage: () => costingAPI_client.get('/material-usage'),
  updateCosting: (data) => costingAPI_client.post('/update', data),
  // Link costing to stock so production consumes materials and adds finished goods.
  getInventoryItems: () => costingAPI_client.get('/inventory-items'),
  linkMaterial: (materialId, inventoryItemId) => costingAPI_client.put(`/materials/${materialId}/stock-item`, { inventoryItemId }),
  linkFinishedItem: (styleId, inventoryItemId) => costingAPI_client.put(`/styles/${styleId}/finished-item`, { inventoryItemId }),
};

// Attendance API
export const attendanceAPI = {
  getEmployees: () => attendanceAPI_client.get('/employees'),
  getPolicy: () => attendanceAPI_client.get('/policy'),
  getDaily: (date) => attendanceAPI_client.get('/attendance/today', { params: { date } }),
  getStats: (date) => attendanceAPI_client.get('/attendance/stats', { params: { date } }),
  getSummary: (from, to) => attendanceAPI_client.get('/attendance/summary', { params: { from, to } }),
  getRecords: (params) => attendanceAPI_client.get('/attendance', { params }),
  checkIn: (data) => attendanceAPI_client.post('/attendance/check-in', data),
  checkOut: (data) => attendanceAPI_client.post('/attendance/check-out', data),
  mark: (data) => attendanceAPI_client.post('/attendance', data),
  update: (id, data) => attendanceAPI_client.put(`/attendance/${id}`, data),
  remove: (id) => attendanceAPI_client.delete(`/attendance/${id}`),
};

// Page Builder API
export const builderAPI = {
  dataSources: () => builderAPI_client.get('/datasources'),
  columns: (source) => builderAPI_client.get(`/datasources/${source}/columns`),
  addColumn: (source, data) => builderAPI_client.post(`/datasources/${source}/columns`, data),
  deleteColumn: (id) => builderAPI_client.delete(`/columns/${id}`),
  rows: (source, params) => builderAPI_client.get(`/datasources/${source}/rows`, { params }),
  aggregate: (source, params) => builderAPI_client.get(`/datasources/${source}/aggregate`, { params }),
  setCustomValue: (source, recordId, data) =>
    builderAPI_client.put(`/datasources/${source}/rows/${recordId}/custom`, data),

  // kind: 'page' | 'form' | undefined for both
  pages: (kind) => builderAPI_client.get('/pages', { params: kind ? { kind } : undefined }),
  page: (pageKey) => builderAPI_client.get(`/pages/${pageKey}`),
  createPage: (data) => builderAPI_client.post('/pages', data),
  updatePage: (id, data) => builderAPI_client.put(`/pages/${id}`, data),
  deletePage: (id) => builderAPI_client.delete(`/pages/${id}`),

  menus: () => builderAPI_client.get('/menus'),
  apis: () => builderAPI_client.get('/apis'),
  appPages: () => builderAPI_client.get('/app-pages'),
  createMenu: (data) => builderAPI_client.post('/menus', data),
  updateMenu: (id, data) => builderAPI_client.put(`/menus/${id}`, data),
  deleteMenu: (id) => builderAPI_client.delete(`/menus/${id}`),
  navigation: () => builderAPI_client.get('/navigation'),

  // Create Charts
  charts: () => builderAPI_client.get('/charts'),
  chart: (id) => builderAPI_client.get(`/charts/${id}`),
  createChart: (data) => builderAPI_client.post('/charts', data),
  updateChart: (id, data) => builderAPI_client.put(`/charts/${id}`, data),
  // force: delete even though the chart is still placed on pages.
  deleteChart: (id, force = false) =>
    builderAPI_client.delete(`/charts/${id}`, { params: force ? { force: true } : undefined }),
  // Read path for published pages: works for any viewer while the chart is on an active page.
  embedChart: (id) => builderAPI_client.get(`/charts/${id}/embed`),
};

// Finance API
export const financeAPI = {
  // params: { from, to } (YYYY-MM-DD), both optional
  getTransactions: (params) => financeAPI_client.get('/transactions', { params }),
  createTransaction: (transactionData) => financeAPI_client.post('/transactions', transactionData),
  updateTransaction: (id, data) => financeAPI_client.put(`/transactions/${id}`, data),
  deleteTransaction: (id) => financeAPI_client.delete(`/transactions/${id}`),
  // Income and expense accounts a cash-book line can be posted to.
  getAccounts: () => financeAPI_client.get('/finance/accounts'),
  getSummary: (params) => financeAPI_client.get('/finance/summary', { params }),
  getCategories: (params) => financeAPI_client.get('/finance/categories', { params }),
};

// Clients API
export const clientsAPI = {
  // getAll('supplier') or getAll({ type, status, q, page, pageSize })
  getAll: (params) => clientsAPI_client.get('/clients', { params: typeof params === 'string' ? { type: params } : params }),
  create: (clientData) => clientsAPI_client.post('/clients', clientData),
  update: (id, clientData) => clientsAPI_client.put(`/clients/${id}`, clientData),
  getStats: () => clientsAPI_client.get('/clients/stats'),
};

// Reports API
export const reportsAPI = {
  getDashboard: () => reportsAPI_client.get('/dashboard'),
  getSalesReport: () => reportsAPI_client.get('/reports/sales'),
  getProductionReport: () => reportsAPI_client.get('/reports/production'),
  getInventoryReport: () => reportsAPI_client.get('/reports/inventory'),
  getFinanceReport: () => reportsAPI_client.get('/reports/finance'),
};

// Payroll API
export const payrollAPI = {
  getEmployees: (params) => payrollAPI_client.get('/employees', { params }),
  createEmployee: (employeeData) => payrollAPI_client.post('/employees', employeeData),
  updateEmployee: (id, employeeData) => payrollAPI_client.put(`/employees/${id}`, employeeData),
  getPayrolls: (params) => payrollAPI_client.get('/payrolls', { params }),
  createPayroll: (payrollData) => payrollAPI_client.post('/payrolls', payrollData),
  updatePayroll: (id, payrollData) => payrollAPI_client.put(`/payrolls/${id}`, payrollData),
  autoGeneratePayroll: (month) => payrollAPI_client.post('/payrolls/auto-generate', { month }),
  // Recompute pending payrolls from attendance (one, or a whole month).
  recalculate: (id) => payrollAPI_client.post(`/payrolls/${id}/recalculate`),
  recalculateMonth: (month) => payrollAPI_client.post('/payrolls/recalculate', { month }),
  getPayslip: (id) => payrollAPI_client.get(`/payrolls/${id}/payslip`),
  getStats: () => payrollAPI_client.get('/stats'),
};

export default authAPI_client;

// Accounting: settings, GST invoices, payments, ledger and reports
export const accountingAPI = {
  getSettings: () => accountingAPI_client.get('/settings'),
  updateSettings: (data) => accountingAPI_client.put('/settings', data),       // Admin only
  gstReference: () => accountingAPI_client.get('/gst/reference'),             // { states: [{code,name}], rates: [] }
  summary: () => accountingAPI_client.get('/summary'),

  invoiceableOrders: (params) => accountingAPI_client.get('/invoiceable-orders', { params }),
  // body: { orderId, invoiceDate?, placeOfSupply?, buyerGstin?, buyerAddress?, notes?, lines?: [{ orderItemId, quantity?, hsnCode?, gstRate? }] }
  previewInvoice: (body) => accountingAPI_client.post('/invoices/preview', body),
  createInvoice: (body) => accountingAPI_client.post('/invoices', body),
  getInvoices: (params) => accountingAPI_client.get('/invoices', { params }),  // status: issued|partially-paid|paid|cancelled|unpaid|overdue
  getInvoice: (id) => accountingAPI_client.get(`/invoices/${id}`),
  cancelInvoice: (id, reason) => accountingAPI_client.post(`/invoices/${id}/cancel`, { reason }),

  // body: { direction: 'in', invoiceId, amount, method, paymentDate?, reference?, notes? } or { direction: 'out', billId, ... }
  createPayment: (body) => accountingAPI_client.post('/payments', body),
  getPayments: (params) => accountingAPI_client.get('/payments', { params }),
  voidPayment: (id, reason) => accountingAPI_client.post(`/payments/${id}/void`, { reason }),
  // Supplier bills open or part-paid, oldest due first: { data, pagination, totals: { outstanding, overdue } }
  payableBills: (params) => accountingAPI_client.get('/payable-bills', { params }),

  getAccounts: (params) => accountingAPI_client.get('/accounts', { params }),
  createAccount: (data) => accountingAPI_client.post('/accounts', data),
  getJournal: (params) => accountingAPI_client.get('/journal', { params }),
  postJournal: (data) => accountingAPI_client.post('/journal', data),
  reverseJournal: (id) => accountingAPI_client.post(`/journal/${id}/reverse`),

  trialBalance: (params) => accountingAPI_client.get('/reports/trial-balance', { params }),
  profitLoss: (params) => accountingAPI_client.get('/reports/profit-loss', { params }),
  balanceSheet: (params) => accountingAPI_client.get('/reports/balance-sheet', { params }),
  receivables: () => accountingAPI_client.get('/reports/receivables'),
  payables: () => accountingAPI_client.get('/reports/payables'),
  gstSummary: (params) => accountingAPI_client.get('/reports/gst', { params }),
};

// Purchasing: suppliers, purchase orders, goods receipts, supplier bills
export const purchasesAPI = {
  getSuppliers: (params) => purchasesAPI_client.get('/suppliers', { params }),
  createSupplier: (data) => purchasesAPI_client.post('/suppliers', data),
  getItems: (params) => purchasesAPI_client.get('/items', { params }),

  getOrders: (params) => purchasesAPI_client.get('/purchase-orders', { params }),   // status: … | open | to-approve
  getOrder: (id) => purchasesAPI_client.get(`/purchase-orders/${id}`),
  createOrder: (data) => purchasesAPI_client.post('/purchase-orders', data),
  updateOrder: (id, data) => purchasesAPI_client.put(`/purchase-orders/${id}`, data),
  // step: submit | return | approve | cancel | close
  step: (id, step) => purchasesAPI_client.post(`/purchase-orders/${id}/${step}`),
  // body: { receiptDate?, supplierRef?, notes?, lines: [{ poItemId, acceptedQuantity, rejectedQuantity?, rejectReason? }] }
  receive: (id, body) => purchasesAPI_client.post(`/purchase-orders/${id}/receipts`, body),
  getReceipts: (params) => purchasesAPI_client.get('/receipts', { params }),
  getReceipt: (id) => purchasesAPI_client.get(`/receipts/${id}`),

  // body: { poId, supplierBillNo, billDate, dueDate?, notes?, lines?: [{ poItemId, quantity }] }
  createBill: (body) => purchasesAPI_client.post('/bills', body),
  getBills: (params) => purchasesAPI_client.get('/bills', { params }),
  getBill: (id) => purchasesAPI_client.get(`/bills/${id}`),
  cancelBill: (id) => purchasesAPI_client.post(`/bills/${id}/cancel`),
};
