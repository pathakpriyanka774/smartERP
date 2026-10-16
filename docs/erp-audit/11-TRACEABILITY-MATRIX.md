# 11 — Traceability Matrix

*For QA, developers and product.* Each business requirement is traced through every layer, from screen to database. A **break** in the chain is marked ✗ (the layer is missing, or the screen does not call the layer below). The test IDs are from [06](06-MANUAL-REGRESSION-TEST-CASES.md) and the finding IDs from [10](10-PRIORITIZED-DEVELOPMENT-ROADMAP.md).

Legend for the chain column: ● connected and verified · ◐ connected with defects · ✗ broken link.

| # | Business requirement | UI screen (route) | API client (`services/api.js`) | Service route | Database | Chain | Tests | Findings |
|---|---|---|---|---|---|---|---|---|
| R01 | Users sign in securely | `Auth/Login.js` (`*` logged out) | `authAPI.login` | auth `POST /login` | `Users` | ◐ (error not shown) | TC-AUTH-01, 02, 11–14 | F-021 |
| R02 | First account becomes Admin; no self-promotion | `Auth/Signup.js` | `authAPI.signup` | auth `POST /signup` (advisory lock) | `Users` | ● | TC-AUTH-03, 04, 06 | — |
| R03 | Access ends when an employee leaves | `UserManagement` | `usersAPI.update` | auth `PUT /users/:id`; gateway token check | `Users.IsActive` | ◐ (token stays valid 24 h) | TC-AUTH-07, 08 | F-022 |
| R04 | Each user sees only permitted areas | `Sidebar.js`, `RequirePermission.js` | `builderAPI.navigation` | page-builder `GET /navigation` | `AppMenus`, `UserPermissions` | ● | TC-USR-02 | F-029 |
| R05 | Area data protected server-side | (all) | (all) | gateway `SERVICE_PERMISSION`; `shared/auth.js protectService` | `UserPermissions` (in JWT) | ◐ (service ports and builder bypass) | TC-USR-03, 04, 05; TC-PB-01 | F-003, F-004 |
| R06 | Admin manages users and permissions | `UserManagement` (`/user-management`) | `usersAPI.*` | auth `/users`, `/permissions` | `Users`, `UserPermissions` | ● | TC-USR-01, 06, 07 | F-043 |
| R07 | Management sees accurate KPIs | `Dashboard` (`/dashboard`) | ✗ `reportsAPI.getDashboard` unused | report `GET /dashboard` | Orders, FinanceTransactions, ProductionOrders, InventoryItems | ✗ UI → API | TC-DSH-01..05, 10 | F-001 |
| R08 | Sales reports exclude cancellations | `Reports` (`/reports`) | ✗ `reportsAPI.getSalesReport` unused | report `GET /reports/sales` | Orders, FinanceTransactions | ✗ UI → API; ◐ API | TC-DSH-06, 07 | F-002, F-020 |
| R09 | Record a customer order | `Orders` (`/orders`) | ✗ `ordersAPI.create` unused | order `POST /orders` | `Orders` | ✗ UI → API; ◐ API (no validation) | TC-ORD-01..07, 11, 12 | F-002, F-006, F-034 |
| R10 | Order reserves stock and creates receivable | — | — | — | No order lines or receivables | ✗ missing | TC-ORD-08, 09, 13 | F-013, F-028 |
| R11 | Issue a GST-correct invoice | `InvoiceGenerator` (Orders tab) | — (browser `localStorage`) | — | — | ✗ no backend | TC-INVC-01, 02 | F-007, F-008 |
| R12 | Know stock on hand and status | `Inventory` (`/inventory`) | ✗ `inventoryAPI.getAll` unused | inventory `GET /inventory`, `/stats` | `InventoryItems`, `vw_InventoryStatus` | ✗ UI → API; ● API | TC-INV-01, 04, 05, 06 | F-002 |
| R13 | Know stock value | — | — | — | No cost column | ✗ missing | TC-INV-02 | F-015 |
| R14 | Reject invalid stock quantities | `Inventory` | `inventoryAPI.create/update` | inventory `POST`, `PUT` | `InventoryItems` (no CHECK) | ◐ | TC-INV-03 | F-006, F-040 |
| R15 | Raise and approve purchase orders | Stock Check / Purchase Orders tabs | — (`localStorage`) | — | — | ✗ no backend | TC-PUR-01 | F-016 |
| R16 | Receive goods into stock | Goods Receiving tab | — (`localStorage`) | — | — | ✗ no backend | TC-PUR-02..04 | F-016 |
| R17 | Maintain suppliers | `Clients` (Add Vendor dead) | ✗ | client `POST /clients` (type only) | `Clients` | ✗ | TC-PUR-05 | F-016 |
| R18 | Maintain customers | `Clients` (`/clients`) | ✗ `clientsAPI.create` unused | client `POST/PUT /clients` | `Clients` | ✗ UI → API; ● API | TC-CLI-01, 02, 03 | F-002 |
| R19 | Allocate machines and operators | `PlanningDashboard` (`/planning-dashboard`) | ✗ raw fetch :5009, no token | production-planning `POST /machines/allocate` → `sp_AllocateMachineToEmployee` | `Machines`, `MachineAllocations` | ✗ UI → API; ● API | TC-PRD-01, 02, 10 | F-009, F-010 |
| R20 | Set daily targets and record output | `ProductionWorkerDashboard` (`/worker-dashboard`) | ✗ raw fetch :5009, no token | `POST /tasks/create`, `POST /production/record` | `ProductionTasks`, `DailyProduction`, `ProductionOrders` | ✗ UI → API; ◐ API (no bounds) | TC-PRD-03..07, 09, 11 | F-009, F-011 |
| R21 | Production consumes materials and adds finished goods | — | — | — | Materials ⟂ InventoryItems | ✗ missing | TC-PRD-08 | F-014 |
| R22 | Release machines after the job | — | — | — | `MachineAllocations.Status` never updated | ✗ missing | TC-PRD-12 | F-045 |
| R23 | Inspect batches and record results | `QualityDashboard` (`/quality-dashboard`) | ✗ raw fetch :5009, no token | `/quality/pending`, `/start-inspection`, `/complete-inspection` | `QualityInspections`, `DailyProduction` | ✗ UI → API; ◐ API | TC-QC-01..04 | F-009, F-044 |
| R24 | Production reports stay available | — (no UI) | `productionAPI` unused | report `/reports/production`; `/planning/employee-performance` | `ProductionTasks`, `QualityInspections` | ◐ (500 on outliers) | TC-DSH-08 | F-012 |
| R25 | Know the material cost per style | `StyleCosting` (`/style-costing`) | ✗ raw fetch :5010, wrong paths | costing `/dashboard`, `/style/:id`, `/update` | `Styles`, `Materials`, `StyleCostings`, views | ✗ UI → API; ● API | TC-CST-01, 02 | F-009 |
| R26 | Maintain the employee register | `Payroll` (`/payroll`) | `payrollAPI.createEmployee/updateEmployee` | payroll `POST/PUT /employees` → `sp_CreateEmployee` | `Employees` | ◐ (edit erases date; concurrent codes) | TC-PAY-01, 02, 08, 09 | F-019, F-034 |
| R27 | Record daily attendance | `Attendance` (`/attendance`) | `attendanceAPI.*` | attendance `/attendance*` → `sp_AttendanceCheckIn/Out` | `EmployeeAttendance` | ● (UI date defect) | TC-ATT-01..06 | F-033 |
| R28 | Compute monthly payroll from attendance | `Payroll` | `payrollAPI.autoGeneratePayroll` | payroll `POST /payrolls/auto-generate` → `sp_AutoGeneratePayroll` | `Payrolls` ⟂ `EmployeeAttendance` | ◐ (attendance ignored) | TC-PAY-03, 04, 07 | F-018 |
| R29 | Mark payroll paid without changing amounts | `Payroll` | `payrollAPI.updatePayroll` | payroll `PUT /payrolls/:id` | `Payrolls` (no Status) | ✗ (corrupts data) | TC-PAY-05, 06 | F-005, F-006 |
| R30 | Record income and expenses | `Expenses` (`/expenses`) | ✗ `financeAPI.*` unused | finance `/transactions`, `/summary` | `FinanceTransactions` | ✗ UI → API; ● API | TC-FIN-01, 02 | F-002, F-017 |
| R31 | GST and currency configured | — | — | — | — | ✗ missing | TC-FIN-03 | F-017, F-032 |
| R32 | Build custom pages from ERP data | `PageBuilder`, `CustomPage` (`/p/:key`) | `builderAPI.pages/rows/aggregate` | page-builder `/pages`, `/datasources/*` | `CustomPages`, `CustomColumns*` | ◐ (data permission gap) | TC-PB-01..03, 10 | F-003, F-029 |
| R33 | Design forms and collect submissions | `FormBuilder`, Form widget | `builderAPI.pages('form')` | page-builder `/pages?kind=form` | `CustomPages` (no submissions) | ◐ | TC-PB-07, 08 | F-041 |
| R34 | Create charts and place them on pages | `ChartBuilder`, Saved chart widget | `builderAPI.charts*`, `embedChart` | page-builder `/charts*` | `SavedCharts` | ● | TC-PB-04..06, 11 | — |
| R35 | Install and upgrade the database safely | — | — | `setup-database.js` | all | ◐ (destructive re-run) | TC-REG-02 | F-024 |
| R36 | Recover from data loss | — | — | — | — | ✗ missing | TC-REG-06 | F-025 |
| R37 | Trace who changed what | — | — | — | — | ✗ missing | — | F-027 |

## Chain summary

| Chain | Count | Requirements |
|---|---:|---|
| ● fully connected | 5 | R02, R04, R06, R27, R34 |
| ◐ connected with defects | 10 | R01, R03, R05, R14, R24, R26, R28, R32, R33, R35 |
| ✗ broken or missing | 22 | R07, R08, R09, R10, R11, R12, R13, R15, R16, R17, R18, R19, R20, R21, R22, R23, R25, R29, R30, R31, R36, R37 |

The chain is classified by its weakest link. The dominant break is **UI → API** (R07, R08, R09, R12, R18, R19, R20, R23, R25, R30): the backend layer exists and was verified, so connecting the screen restores the chain. Missing layers are listed in [02](02-MODULE-FUNCTIONALITY-INVENTORY.md#common-erp-capabilities-that-are-missing).
