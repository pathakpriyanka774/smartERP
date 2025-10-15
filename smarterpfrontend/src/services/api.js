import axios from 'axios';

// Direct service connections (bypassing gateway)
const SERVICE_URLS = {
  auth: 'http://localhost:5001',
  orders: 'http://localhost:5002', 
  inventory: 'http://localhost:5003',
  production: 'http://localhost:5004',
  finance: 'http://localhost:5005',
  clients: 'http://localhost:5006',
  reports: 'http://localhost:5007',
  payroll: 'http://localhost:5008'
};

const createServiceAPI = (baseURL) => axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 5000
});

// Service APIs
const authAPI_client = createServiceAPI(SERVICE_URLS.auth);
const ordersAPI_client = createServiceAPI(SERVICE_URLS.orders);
const inventoryAPI_client = createServiceAPI(SERVICE_URLS.inventory);
const productionAPI_client = createServiceAPI(SERVICE_URLS.production);
const financeAPI_client = createServiceAPI(SERVICE_URLS.finance);
const clientsAPI_client = createServiceAPI(SERVICE_URLS.clients);
const reportsAPI_client = createServiceAPI(SERVICE_URLS.reports);
const payrollAPI_client = createServiceAPI(SERVICE_URLS.payroll);

// Auth API
export const authAPI = {
  login: (credentials) => authAPI_client.post('/login', credentials),
  signup: (userData) => authAPI_client.post('/signup', userData),
  verify: (token) => authAPI_client.get('/verify', { headers: { Authorization: `Bearer ${token}` } }),
  test: () => authAPI_client.get('/test'),
};

// Orders API
export const ordersAPI = {
  getAll: () => ordersAPI_client.get('/orders'),
  create: (orderData) => ordersAPI_client.post('/orders', orderData),
  update: (id, orderData) => ordersAPI_client.put(`/orders/${id}`, orderData),
  getStats: () => ordersAPI_client.get('/orders/stats'),
};

// Inventory API
export const inventoryAPI = {
  getAll: () => inventoryAPI_client.get('/inventory'),
  create: (itemData) => inventoryAPI_client.post('/inventory', itemData),
  update: (id, itemData) => inventoryAPI_client.put(`/inventory/${id}`, itemData),
  getStats: () => inventoryAPI_client.get('/inventory/stats'),
};

// Production API
export const productionAPI = {
  getAll: () => productionAPI_client.get('/production'),
  create: (productionData) => productionAPI_client.post('/production', productionData),
  update: (id, productionData) => productionAPI_client.put(`/production/${id}`, productionData),
  getStats: () => productionAPI_client.get('/production/stats'),
};

// Finance API
export const financeAPI = {
  getTransactions: () => financeAPI_client.get('/transactions'),
  createTransaction: (transactionData) => financeAPI_client.post('/transactions', transactionData),
  getSummary: () => financeAPI_client.get('/finance/summary'),
};

// Clients API
export const clientsAPI = {
  getAll: () => clientsAPI_client.get('/clients'),
  create: (clientData) => clientsAPI_client.post('/clients', clientData),
  update: (id, clientData) => clientsAPI_client.put(`/clients/${id}`, clientData),
  getStats: () => clientsAPI_client.get('/clients/stats'),
};

// Reports API
export const reportsAPI = {
  getDashboard: () => reportsAPI_client.get('/dashboard'),
  getSalesReport: () => reportsAPI_client.get('/reports/sales'),
  getProductionReport: () => reportsAPI_client.get('/reports/production'),
};

// Payroll API
export const payrollAPI = {
  getEmployees: () => payrollAPI_client.get('/employees'),
  createEmployee: (employeeData) => payrollAPI_client.post('/employees', employeeData),
  updateEmployee: (id, employeeData) => payrollAPI_client.put(`/employees/${id}`, employeeData),
  getPayrolls: () => payrollAPI_client.get('/payrolls'),
  createPayroll: (payrollData) => payrollAPI_client.post('/payrolls', payrollData),
  updatePayroll: (id, payrollData) => payrollAPI_client.put(`/payrolls/${id}`, payrollData),
  autoGeneratePayroll: (month) => payrollAPI_client.post('/payrolls/auto-generate', { month }),
  getStats: () => payrollAPI_client.get('/stats'),
};

export default authAPI_client;