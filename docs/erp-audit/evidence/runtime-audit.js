// Runtime audit against the ISOLATED test environment only:
//   gateway copy on :18000 -> services on :150xx -> throwaway PostgreSQL on :55432.
// Never points at the user's real services (:5001-5012) or database.
const fs = require('fs');
const B = '/var/www/html/smartERP/smarterpbackend/node_modules/';
const jwt = require(B + 'jsonwebtoken');
const { Client } = require(B + 'pg');

const GW = 'http://localhost:18000/api';
const SECRET = 'audit-isolated-secret-not-real';
const results = [];
let seq = 0;

const req = async (method, url, { token, body, raw, headers = {} } = {}) => {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });
  let json = null;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = { _text: text.slice(0, 200) }; }
  return { status: res.status, json };
};

const record = (story, name, expected, actual, pass, note = '') => {
  const id = `RT-${String(++seq).padStart(3, '0')}`;
  results.push({ id, story, name, expected, actual, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} [${story}] ${name} — expected: ${expected} | actual: ${actual}${note ? ' | ' + note : ''}`);
};

const db = new Client({ host: '127.0.0.1', port: 55432, user: 'smarterp', database: 'smarterp' });
const q = async (sql, p) => (await db.query(sql, p)).rows;

(async () => {
  await db.connect();

  // ---------------- Story A: new company setup ----------------
  const su = await req('POST', `${GW}/auth/signup`, { body: { name: 'audit-admin', email: 'admin@audit.example', password: 'audit-pass-123' } });
  record('A', 'First signup on empty system becomes Admin', 'role Admin', `${su.status} role ${su.json.user?.role}`, su.json.user?.role === 'Admin');
  const admin = su.json.token;

  const su2 = await req('POST', `${GW}/auth/signup`, { body: { name: 'audit-second', email: 'second@audit.example', password: 'audit-pass-123', role: 'Admin' } });
  record('A', 'Second signup requesting Admin gets Employee', 'role Employee', `${su2.status} role ${su2.json.user?.role}`, su2.json.user?.role === 'Employee');

  const lim = await req('POST', `${GW}/auth/users`, { token: admin, body: { name: 'audit-sales', email: 'sales@audit.example', password: 'audit-pass-123', role: 'Employee', permissions: ['orders'] } });
  record('A', 'Admin creates employee user with Orders permission', '200', String(lim.status), lim.status === 200);
  const salesLogin = await req('POST', `${GW}/auth/login`, { body: { email: 'sales@audit.example', password: 'audit-pass-123' } });
  const sales = salesLogin.json.token;
  record('A', 'Created user can log in; token carries only granted permissions', "permissions ['orders']", JSON.stringify(salesLogin.json.user?.permissions), JSON.stringify(salesLogin.json.user?.permissions) === '["orders"]');

  const emp = await req('POST', `${GW}/payroll/employees`, { token: admin, body: { name: 'Audit Operator', email: 'op@audit.example', position: 'Operator', department: 'Production', baseSalary: 18000 } });
  record('A', 'Create employee (payroll) generates code and CTC', 'EMP001, ctc 216000', `${emp.json.data?.employeeCode}, ctc ${emp.json.data?.ctc}`, emp.json.data?.employeeCode === 'EMP001' && emp.json.data?.ctc === 216000);
  const empId = emp.json.data?.id;
  const insp = await req('POST', `${GW}/payroll/employees`, { token: admin, body: { name: 'Audit Inspector', email: 'qc@audit.example', position: 'Inspector', department: 'Quality', baseSalary: 22000 } });
  const inspId = insp.json.data?.id;

  for (const [name, path] of [['Warehouse setup', '/inventory/warehouses'], ['Tax/currency settings', '/finance/settings'], ['Purchase orders', '/inventory/purchase-orders'], ['Suppliers', '/clients/suppliers'], ['Bulk inventory import', '/inventory/import'], ['Departments', '/payroll/departments']]) {
    const r = await req('GET', `${GW}${path}`, { token: admin });
    record('A', `${name} endpoint exists`, 'not supported (404)', String(r.status), r.status === 404, 'confirms feature is missing, not a failure of the test');
  }
  const sup = await req('POST', `${GW}/clients/clients`, { token: admin, body: { name: 'Audit Fabric Supplier', type: 'supplier' } });
  record('A', 'Supplier can only be stored as a client with free-text type', 'accepted as client', `${sup.status} type=${sup.json.data?.type}`, sup.status === 200, 'no supplier entity, no vendor fields');

  // ---------------- Phase 4 reference inventory ----------------
  await q('DELETE FROM InventoryItems');
  const ref = [
    ['Cotton Fabric', 5000, 8.50, 1000], ['Denim Fabric', 2500, 12.00, 500], ['Polyester Thread', 150, 2.50, 200],
    ['Metal Buttons', 0, 0.15, 100], ['Finished T-Shirts', 850, 15.00, 100]
  ];
  let unitPriceKept = true;
  for (const [itemName, quantity, unitPrice, reorderLevel] of ref) {
    const r = await req('POST', `${GW}/inventory/inventory`, { token: admin, body: { itemName, quantity, unitPrice, reorderLevel, unit: 'units' } });
    if ('unitPrice' in (r.json.data || {})) unitPriceKept = unitPriceKept && true; else unitPriceKept = false;
  }
  const st = await req('GET', `${GW}/inventory/inventory/stats`, { token: admin });
  record('P4', 'Reference status counts (In 3 / Low 1 / Out 1)', 'inStock 3, lowStock 1, outOfStock 1',
    `inStock ${st.json.inStock}, lowStock ${st.json.lowStock}, outOfStock ${st.json.outOfStock}`,
    st.json.inStock === 3 && st.json.lowStock === 1 && st.json.outOfStock === 1);
  record('P4', 'Inventory valuation ($85,625) can be computed', 'unit price stored', unitPriceKept ? 'unitPrice returned' : 'unitPrice silently discarded; no price column in InventoryItems', unitPriceKept, 'valuation unsupported by schema');
  const negInv = await req('POST', `${GW}/inventory/inventory`, { token: admin, body: { itemName: 'Negative stock probe', quantity: -50 } });
  record('P4', 'Negative quantity rejected', '400', `${negInv.status} quantity=${negInv.json.data?.quantity} status=${negInv.json.data?.status}`, negInv.status === 400);
  if (negInv.json.data?.id) await q('DELETE FROM InventoryItems WHERE ItemID=$1', [negInv.json.data.id]);

  // ---------------- Story C: sales to payment ----------------
  const invBefore = await q('SELECT SUM(Quantity)::int AS s FROM InventoryItems');
  const finBefore = await req('GET', `${GW}/finance/finance/summary`, { token: admin });
  const ord = await req('POST', `${GW}/orders/orders`, { token: sales, body: { clientName: 'Audit Retail Co', deliveryDate: '2026-11-30', totalAmount: 50000, priority: 'high' } });
  record('C', 'Sales user creates order through gateway', '200 status pending', `${ord.status} ${ord.json.data?.status}`, ord.status === 200 && ord.json.data?.status === 'pending');
  const invAfter = await q('SELECT SUM(Quantity)::int AS s FROM InventoryItems');
  record('C', 'Order reserves/deducts stock', 'stock changes', `before ${invBefore[0].s}, after ${invAfter[0].s}`, invBefore[0].s !== invAfter[0].s, 'no order lines, no item link');
  const finAfter = await req('GET', `${GW}/finance/finance/summary`, { token: admin });
  record('C', 'Order creates receivable / revenue entry', 'finance changes', `income before ${finBefore.json.totalIncome}, after ${finAfter.json.totalIncome}`, finBefore.json.totalIncome !== finAfter.json.totalIncome, 'orders and finance are not linked');
  const badStatus = await req('PUT', `${GW}/orders/orders/${ord.json.data?.id}`, { token: sales, body: { status: 'banana' } });
  record('C', 'Invalid order status rejected', '400', `${badStatus.status} status=${badStatus.json.data?.status}`, badStatus.status === 400);
  const negOrder = await req('POST', `${GW}/orders/orders`, { token: sales, body: { clientName: 'Negative probe', totalAmount: -999 } });
  record('C', 'Negative order amount rejected', '400', `${negOrder.status} total=${negOrder.json.data?.totalAmount}`, negOrder.status === 400);
  const pastOrder = await req('POST', `${GW}/orders/orders`, { token: sales, body: { clientName: 'Date probe', orderDate: '2026-10-09', deliveryDate: '2020-01-01' } });
  record('C', 'Delivery date before order date rejected', '400', `${pastOrder.status}`, pastOrder.status === 400);
  const d1 = req('POST', `${GW}/orders/orders`, { token: sales, body: { clientName: 'Double click probe', totalAmount: 100 } });
  const d2 = req('POST', `${GW}/orders/orders`, { token: sales, body: { clientName: 'Double click probe', totalAmount: 100 } });
  await Promise.all([d1, d2]);
  const dup = await q("SELECT COUNT(*)::int AS n FROM Orders WHERE ClientName='Double click probe'");
  record('G', 'Duplicate submission (double click) creates one order', '1 order', `${dup[0].n} orders`, dup[0].n === 1, 'no idempotency key');
  const lineItems = await req('GET', `${GW}/orders/orders/${ord.json.data?.id}/items`, { token: sales });
  record('C', 'Order line items / quotation / invoice / payment endpoints', 'not supported (404)', String(lineItems.status), lineItems.status === 404, 'confirms missing feature');

  // ---------------- Story D: manufacturing ----------------
  const alloc = await req('POST', `${GW}/production/machines/allocate`, { token: admin, body: { machineId: 2, employeeId: empId, orderId: 1, shiftTime: 'Morning' } });
  record('D', 'Allocate machine to employee for production order', 'Success', `${alloc.status} ${alloc.json.data?.Result}`, alloc.json.data?.Result === 'Success');
  const [a1, a2] = await Promise.all([
    req('POST', `${GW}/production/machines/allocate`, { token: admin, body: { machineId: 3, employeeId: empId, orderId: 1, shiftTime: 'Morning' } }),
    req('POST', `${GW}/production/machines/allocate`, { token: admin, body: { machineId: 3, employeeId: inspId, orderId: 1, shiftTime: 'Evening' } })
  ]);
  const wins = [a1, a2].filter(r => r.json.data?.Result === 'Success').length;
  record('G', 'Concurrent allocation of the same machine', 'exactly 1 succeeds', `${wins} succeeded`, wins === 1);
  const allocId = (await q('SELECT MIN(AllocationID) AS id FROM MachineAllocations'))[0].id;
  const task = await req('POST', `${GW}/production/tasks/create`, { token: admin, body: { allocationId: allocId, targetPieces: 120 } });
  record('D', 'Create daily production task', 'TaskID returned', `${task.status} TaskID ${task.json.data?.TaskID}`, !!task.json.data?.TaskID);
  const poBefore = (await q('SELECT CompletedQuantity FROM ProductionOrders WHERE OrderID=1'))[0].completedquantity;
  const invSnap = (await q('SELECT SUM(Quantity)::int AS s FROM InventoryItems'))[0].s;
  await req('POST', `${GW}/production/production/record`, { token: admin, body: { taskId: task.json.data?.TaskID, piecesCompleted: 80 } });
  const over = await req('POST', `${GW}/production/production/record`, { token: admin, body: { taskId: task.json.data?.TaskID, piecesCompleted: 5000 } });
  const tk = (await q('SELECT CompletedPieces, TargetPieces, Status FROM ProductionTasks WHERE TaskID=$1', [task.json.data?.TaskID]))[0];
  record('D', 'Recording production updates task progress', 'CompletedPieces 5080, Completed', `${tk.completedpieces}, ${tk.status}`, tk.completedpieces === 5080 && tk.status === 'Completed');
  record('D', 'Over-production beyond target rejected', 'reject 5000 on target 120', `${over.status} ${over.json.data?.Result}`, over.json.data?.Result !== 'Success', 'no upper bound check');
  const poAfter = (await q('SELECT CompletedQuantity, TotalQuantity FROM ProductionOrders WHERE OrderID=1'))[0];
  record('D', 'Production order completed quantity rolls up', `+5080 from ${poBefore}`, `${poAfter.completedquantity} of ${poAfter.totalquantity}`, poAfter.completedquantity === poBefore + 5080, poAfter.completedquantity > poAfter.totalquantity ? 'exceeds order total — not capped' : '');
  const invSnap2 = (await q('SELECT SUM(Quantity)::int AS s FROM InventoryItems'))[0].s;
  record('D', 'Raw material consumed / finished goods added to inventory', 'inventory changes', `before ${invSnap}, after ${invSnap2}`, invSnap !== invSnap2, 'production and inventory not linked');
  const neg = await req('POST', `${GW}/production/production/record`, { token: admin, body: { taskId: task.json.data?.TaskID, piecesCompleted: -100 } });
  record('D', 'Negative production quantity rejected', '400', `${neg.status} ${neg.json.data?.Result || neg.json.message}`, neg.status === 400);
  const pend = await req('GET', `${GW}/production/quality/pending`, { token: admin });
  const prodId = pend.json.data?.[0]?.ProductionID;
  record('D', 'Recorded batch appears in quality queue', '>=1 pending', `${pend.json.data?.length}`, (pend.json.data?.length || 0) >= 1);
  const ci = await req('POST', `${GW}/production/quality/complete-inspection`, { token: admin, body: { inspection_id: prodId, inspector_id: inspId, pieces_inspected: 10, pieces_approved: 50, pieces_rejected: 40 } });
  record('D', 'Inspection where approved+rejected ≠ inspected rejected', '400', `${ci.status}`, ci.status === 400, 'inspected 10, approved 50, rejected 40');
  const pr = await req('GET', `${GW}/reports/reports/production`, { token: admin });
  record('D', 'Production report efficiency = completed/target', '4233.33 (5080/120)', String(pr.json.data?.efficiency), Math.abs((pr.json.data?.efficiency || 0) - 4233.33) < 0.01, 'value above 100% exposes uncapped over-production; DECIMAL(5,2) holds max 999.99');

  // ---------------- Story E: HR & payroll ----------------
  const mk = await req('POST', `${GW}/attendance/attendance`, { token: admin, body: { employeeId: empId, date: '2026-09-15', status: 'absent' } });
  record('E', 'Mark employee absent', '200', String(mk.status), mk.status === 200);
  const [c1, c2] = await Promise.all([
    req('POST', `${GW}/attendance/attendance/check-in`, { token: admin, body: { employeeId: inspId, date: '2026-09-16' } }),
    req('POST', `${GW}/attendance/attendance/check-in`, { token: admin, body: { employeeId: inspId, date: '2026-09-16' } })
  ]);
  const rows = (await q("SELECT COUNT(*)::int AS n FROM EmployeeAttendance WHERE EmployeeID=$1 AND AttendanceDate='2026-09-16'", [inspId]))[0].n;
  record('G', 'Concurrent double check-in creates one record', '1 row, one 409/500', `rows ${rows}; statuses ${c1.status}/${c2.status}`, rows === 1, (c1.status === 500 || c2.status === 500) ? 'loser gets 500 (unique violation) instead of 409' : '');
  const gen = await req('POST', `${GW}/payroll/payrolls/auto-generate`, { token: admin, body: { month: '2026-09' } });
  record('E', 'Auto-generate payroll for month', 'records created', `${gen.status} ${JSON.stringify(gen.json.data)}`, (gen.json.data?.RecordsCreated || 0) >= 1);
  const pays = await req('GET', `${GW}/payroll/payrolls`, { token: admin });
  const p = pays.json.data?.find(x => x.employeeId === empId);
  record('E', 'Payroll reflects attendance (absent day deducted)', 'netSalary < 18000', `netSalary ${p?.netSalary}`, (p?.netSalary ?? 18000) < 18000, 'attendance not linked to payroll');
  const badMonth = await req('POST', `${GW}/payroll/payrolls/auto-generate`, { token: admin, body: { month: 'banana' } });
  record('E', 'Invalid payroll month rejected', '400', `${badMonth.status} ${JSON.stringify(badMonth.json.data || badMonth.json.message)}`, badMonth.status === 400);
  const negDed = await req('PUT', `${GW}/payroll/payrolls/${p?.id}`, { token: admin, body: { allowances: 0, deductions: -5000 } });
  const afterNeg = await req('GET', `${GW}/payroll/payrolls`, { token: admin });
  const p2 = afterNeg.json.data?.find(x => x.id === p?.id);
  record('E', 'Negative deduction (inflating pay) rejected', '400', `${negDed.status}, netSalary now ${p2?.netSalary}`, negDed.status === 400);
  const partial = await req('PUT', `${GW}/payroll/employees/${empId}`, { token: admin, body: { name: 'Audit Operator' } });
  const e2 = (await q('SELECT Email, BaseSalary, JoiningDate, IsActive FROM Employees WHERE EmployeeID=$1', [empId]))[0];
  record('E', 'Partial employee update keeps other fields', 'email/salary kept', `${partial.status}; email=${e2?.email}, salary=${e2?.basesalary}`, partial.status === 200 && e2?.email === 'op@audit.example', 'PUT overwrites all columns');

  // ---------------- Story F: management dashboard reconciliation ----------------
  const dash = await req('GET', `${GW}/reports/dashboard`, { token: admin });
  const dbRev = (await q("SELECT COALESCE(SUM(Amount),0)::float AS s FROM FinanceTransactions WHERE Type='income'"))[0].s;
  const dbOrders = (await q('SELECT COUNT(*)::int AS n FROM Orders'))[0].n;
  const dbActive = (await q("SELECT COUNT(*)::int AS n FROM ProductionOrders WHERE Status NOT IN ('Completed','Cancelled')"))[0].n;
  record('F', 'Report dashboard revenue = sum of income transactions', String(dbRev), String(dash.json.data?.kpis?.revenue), dash.json.data?.kpis?.revenue === dbRev);
  record('F', 'Report dashboard total orders = Orders rows', String(dbOrders), String(dash.json.data?.kpis?.totalOrders), dash.json.data?.kpis?.totalOrders === dbOrders);
  record('F', 'Active production excludes completed/cancelled', String(dbActive), String(dash.json.data?.kpis?.activeProduction), dash.json.data?.kpis?.activeProduction === dbActive);
  record('F', 'Orders produced to target leave production order status unchanged', 'auto-complete when completed >= total', (await q('SELECT Status FROM ProductionOrders WHERE OrderID=1'))[0].status, false, 'status never transitions automatically');
  const cancelled = await req('PUT', `${GW}/orders/orders/${ord.json.data?.id}`, { token: sales, body: { status: 'cancelled' } });
  const sales2 = await req('GET', `${GW}/reports/reports/sales`, { token: admin });
  const sumOrders = (await q('SELECT SUM(TotalAmount)::float AS s FROM Orders'))[0].s;
  record('F', 'Total sales excludes cancelled orders', `< ${sumOrders}`, `${cancelled.status}; totalSales ${sales2.json.data?.totalSales}`, sales2.json.data?.totalSales < sumOrders, 'cancelled orders still counted');
  record('F', 'Sales report top products is based on sales', 'sales value', JSON.stringify(sales2.json.data?.topProducts?.[0] || {}), false, 'computed as production quantity × material cost (report-service), not sales');
  const ws = await req('GET', `${GW}/reports/dashboard`, { token: admin });
  record('F', 'Monthly revenue chart has 4 months oldest first', '4 labels', JSON.stringify(ws.json.data?.charts?.monthlyRevenueLabels), (ws.json.data?.charts?.monthlyRevenueLabels || []).length === 4);

  // ---------------- Story G: security & failure ----------------
  const noTok = await req('GET', `${GW}/orders/orders`);
  record('G', 'No token → 401', '401', String(noTok.status), noTok.status === 401);
  const forb = await req('GET', `${GW}/payroll/employees`, { token: sales });
  record('G', 'Orders-only user blocked from payroll at gateway', '403', String(forb.status), forb.status === 403);
  const mixed = await req('GET', `${GW}/Payroll/employees`, { token: sales });
  record('G', 'Mixed-case prefix /api/Payroll does not bypass permission', '403/404', `${mixed.status} (records: ${Array.isArray(mixed.json.data) ? mixed.json.data.length : 'n/a'})`, mixed.status !== 200, mixed.status === 200 ? 'PERMISSION BYPASS: salary data returned' : '');
  const direct = await req('GET', 'http://localhost:15008/employees', { token: sales });
  record('G', 'Direct service port with orders-only token blocked', '403', `${direct.status} (records: ${Array.isArray(direct.json.data) ? direct.json.data.length : 'n/a'})`, direct.status === 403, direct.status === 200 ? 'services only authenticate; area permission enforced only at gateway' : '');
  const expired = jwt.sign({ id: 1, role: 'Admin', permissions: [] }, SECRET, { expiresIn: -10 });
  const exp = await req('GET', `${GW}/orders/orders`, { token: expired });
  record('G', 'Expired token rejected', '401', String(exp.status), exp.status === 401);
  const forged = jwt.sign({ id: 1, role: 'Admin', permissions: [] }, 'wrong-secret');
  const forg = await req('GET', `${GW}/orders/orders`, { token: forged });
  record('G', 'Token signed with wrong secret rejected', '401', String(forg.status), forg.status === 401);
  const noneAlg = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') + '.' + Buffer.from('{"id":1,"role":"Admin","permissions":[]}').toString('base64url') + '.';
  const na = await req('GET', `${GW}/orders/orders`, { token: noneAlg });
  record('G', 'alg:none token rejected', '401', String(na.status), na.status === 401);
  const salesUserId = lim.json.data?.id;
  await req('PUT', `${GW}/auth/users/${salesUserId}`, { token: admin, body: { status: 'Inactive' } });
  const deact = await req('GET', `${GW}/orders/orders`, { token: sales });
  record('G', 'Deactivated user token stops working immediately', '401', String(deact.status), deact.status === 401, deact.status === 200 ? 'token valid until 24h expiry; no revocation' : '');
  const deactLogin = await req('POST', `${GW}/auth/login`, { body: { email: 'sales@audit.example', password: 'audit-pass-123' } });
  record('G', 'Deactivated user cannot log in again', '401', String(deactLogin.status), deactLogin.status === 401);
  let lockout = false;
  for (let i = 0; i < 25; i++) {
    const r = await req('POST', `${GW}/auth/login`, { body: { email: 'admin@audit.example', password: `wrong-${i}` } });
    if (r.status === 429) { lockout = true; break; }
  }
  const good = await req('POST', `${GW}/auth/login`, { body: { email: 'admin@audit.example', password: 'audit-pass-123' } });
  record('G', 'Brute force: 25 wrong passwords trigger throttling', '429 / lockout', lockout ? '429 seen' : `no throttling; correct password still ${good.status}`, lockout);
  const mal = await req('POST', `${GW}/orders/orders`, { token: admin, raw: '{"clientName": "broken' });
  record('G', 'Malformed JSON returns 400', '400', String(mal.status), mal.status === 400);
  const big = await req('POST', `${GW}/orders/orders`, { token: admin, body: { clientName: 'x'.repeat(200000) } });
  record('G', 'Oversized payload rejected', '413', String(big.status), big.status === 413);
  const longName = await req('POST', `${GW}/orders/orders`, { token: admin, body: { clientName: 'y'.repeat(500) } });
  record('G', 'Over-length field returns 400 (not 500)', '400', String(longName.status), longName.status === 400);
  const inj = await req('GET', `${GW}/builder/datasources/employees/rows?orderBy=${encodeURIComponent('Name; DROP TABLE Users;--')}&columns=${encodeURIComponent('Name,1;DROP TABLE Users')}`, { token: admin });
  const usersStill = (await q('SELECT COUNT(*)::int AS n FROM Users'))[0].n;
  record('G', 'SQL injection via page-builder orderBy/columns', 'ignored; Users intact', `${inj.status}; users=${usersStill}`, usersStill > 0);
  const negLim = await req('GET', `${GW}/builder/datasources/employees/rows?limit=-5`, { token: admin });
  record('G', 'Negative limit handled', '200/400', String(negLim.status), negLim.status !== 500);
  const xss = await req('POST', `${GW}/clients/clients`, { token: admin, body: { name: '<img src=x onerror=alert(1)>' } });
  record('G', 'Script payload stored verbatim (relies on React escaping)', 'stored as text', `${xss.status} name=${JSON.stringify(xss.json.data?.name)}`, xss.status === 200, 'no server-side sanitising; safe only while every renderer escapes');
  // Data exposure through the page builder's data-source endpoints. A fresh
  // user with only 'orders' (the earlier sales user is deactivated by now).
  await req('POST', `${GW}/auth/users`, { token: admin, body: { name: 'audit-viewer', email: 'viewer@audit.example', password: 'audit-pass-123', role: 'Employee', permissions: ['orders'] } });
  const viewer = (await req('POST', `${GW}/auth/login`, { body: { email: 'viewer@audit.example', password: 'audit-pass-123' } })).json.token;
  const blocked = await req('GET', `${GW}/attendance/attendance`, { token: viewer });
  const leak = await req('GET', `${GW}/builder/datasources/employees/rows`, { token: viewer });
  const leak2 = await req('GET', `${GW}/builder/datasources/attendance/rows`, { token: viewer });
  record('G', 'Orders-only user cannot read employee/attendance data via page builder', '403',
    `attendance API ${blocked.status}; builder employees rows ${leak.status} (${leak.json.data?.rows?.length ?? 0} rows), attendance rows ${leak2.status} (${leak2.json.data?.rows?.length ?? 0} rows)`,
    leak.status === 403 && leak2.status === 403, leak.status === 200 ? 'DATA EXPOSURE: builder data sources ignore area permissions' : '');

  // Payroll "Mark Paid" as the frontend sends it (Payroll.js:92).
  const fresh = await req('GET', `${GW}/payroll/payrolls`, { token: admin });
  const target = fresh.json.data?.[0];
  await req('PUT', `${GW}/payroll/payrolls/${target?.id}`, { token: admin, body: { allowances: 1500, deductions: 300 } });
  await req('PUT', `${GW}/payroll/payrolls/${target?.id}`, { token: admin, body: { status: 'paid' } });
  const afterPaid = (await req('GET', `${GW}/payroll/payrolls`, { token: admin })).json.data?.find(x => x.id === target?.id);
  record('E', '"Mark Paid" (frontend payload) keeps allowances/deductions and sets paid', 'overtime 1500, deductions 300, status paid',
    `overtime ${afterPaid?.overtime}, deductions ${afterPaid?.deductions}, status ${afterPaid?.status}`,
    afterPaid?.overtime === 1500 && afterPaid?.status === 'paid', 'Mark Paid zeroes components; status not stored');

  const custom = await req('PUT', `${GW}/builder/datasources/employees/rows/${empId}/custom`, { token: sales, body: { columnKey: 'x', value: 'y' } });
  record('G', 'Custom value write requires an authoring permission', '401/403', `${custom.status} ${custom.json.message || ''}`, custom.status === 401 || custom.status === 403, 'note: sales token is deactivated by now; see static finding');

  // Service down: stop costing temporarily is avoided; instead target a port with no service.
  const down = await fetch('http://localhost:18000/api/costing/styles', { headers: { authorization: `Bearer ${admin}` } }).then(async r => ({ status: r.status, body: (await r.text()).slice(0, 160) }));
  record('G', 'Downstream service up: costing reachable', '200', String(down.status), down.status === 200);

  await db.end();
  fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
  const fails = results.filter(r => !r.pass).length;
  console.log(`\n${results.length} checks, ${results.length - fails} pass, ${fails} fail`);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
