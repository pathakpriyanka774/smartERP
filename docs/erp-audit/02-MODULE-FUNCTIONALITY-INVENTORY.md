# 02 — Module Functionality Inventory

**Audit revision:** git `437eb36` (initial commit) plus 59 uncommitted working-tree changes, audited as found on 2026-10-09.
**Scope:** `smarterpfrontend/` (React 19, Create React App), `smarterpbackend/` (11 Node.js/Express services + gateway), `postgres/` (PostgreSQL 16 schema).

## How statuses were assigned

| Status | Meaning in this audit |
|---|---|
| **Verified working** | Exercised at runtime in the isolated test environment and behaved correctly end to end, user interface included unless stated. |
| **Implemented but not tested** | Code exists and appears complete, but nothing was executed. |
| **Partially implemented** | Some layers work (often the backend), but the user cannot complete the business process: UI not connected, data only in the browser, or key steps missing. |
| **Broken** | Code exists but does not do its job: fabricated data, calls that always fail, or a demo with no effect. |
| **Missing** | No code for the capability. |
| **Unable to verify** | Could not be exercised safely in this audit. |

"Runtime" evidence refers to [`evidence/runtime-results.json`](evidence/runtime-results.json) (68 checks, IDs `RT-001`…`RT-068`), produced by [`evidence/runtime-audit.js`](evidence/runtime-audit.js) against a throwaway PostgreSQL database. No real company data was used or touched.

## Summary

| Count | Status |
|---:|---|
| 6 | Verified working |
| 14 | Partially implemented |
| 6 | Broken (including the retired production service) |
| 1 | Mixed: verified, plus a part that could not be verified (tooling) |
| **27** | **Modules and components discovered** |
| 13 | Common ERP capabilities **missing** (listed at the end) |

**The single most important fact:** the backend services for orders, inventory, finance, clients, reports, costing, production planning and quality **work**. But the screens users see for orders, inventory, expenses, clients, production, reports and the dashboard run on hard-coded sample data and never call them. For most of the business, the working backend cannot be reached from the user interface.

## Inventory

| ID | Module | Business purpose | Main features (as built) | Frontend | Backend | Database | Depends on | Status | Evidence | Impact |
|---|---|---|---|---|---|---|---|---|---|---|
| M01 | Authentication & sessions | Control who can use the system | Login, signup (first account becomes Admin), session refresh, 24 h JWT | `components/Auth/Login.js`, `Signup.js`, `App.js` | `auth-service` `/login` `/signup` `/session` `/verify` | `Users` | — | **Verified working** (defects F-021, F-022) | RT-001..004, RT-049, RT-053..058 | High |
| M02 | User management & permissions | Give each employee access to only their areas | Create, edit and delete users; tick menus; Admin implicit; enforced in gateway | `UserManagement/UserManagement.js` | `auth-service` `/users` `/permissions`; `shared/auth.js`; `gateway/server.js` | `Users`, `UserPermissions` | M01 | **Verified working**, with serious bypasses (F-003, F-004, F-043) | RT-003, RT-050..052, RT-065 | High |
| M03 | Navigation & Menu Manager | Shape the sidebar; bind menus to pages | Built-in and custom menus, sidebar filtered per user, bind a menu to a page or screen | `Sidebar/Sidebar.js`, `ApplicationSettings/MenuManager.js`, `config/menuConfig.js` | `page-builder-service` `/menus` `/navigation` | `AppMenus`, `vw_CustomPageMenus` | M02, M19 | **Verified working** (API level; F-042 write-permission mismatch) | `/navigation` filtering checked during this engagement | Medium |
| M04 | Dashboard | Show management the state of the business | KPI cards, revenue chart, production gauges, financial summary | `Dashboard/Dashboard.js` | Not used (`report-service /dashboard` exists) | — | M15 | **Broken**: every figure is a literal | Dashboard.js:33-58, 70-75, 124-148 (F-001) | High |
| M05 | Orders (sales) | Record customer orders | UI: create and edit orders in memory, invoice tab. API: order CRUD and stats | `Orders/Orders.js`, `OrderWorkflow/CreateOrder.js` (never rendered) | `order-service` | `Orders` | M14 | **Partially implemented**: API verified, UI not connected and not saved | RT-016..022; Orders.js:22-74 (F-002, F-013, F-023) | High |
| M06 | Inventory | Know what stock is on hand | UI: in-memory list with value cards. API: item CRUD, derived status, stats | `Inventory/Inventory.js` | `inventory-service` | `InventoryItems`, `vw_InventoryStatus` | — | **Partially implemented**: status logic verified; no valuation, UI not connected | RT-013..015 (F-002, F-015) | High |
| M07 | Procurement (stock check → PO → goods receipt) | Buy materials when stock is low | Browser-only: low-stock list, generate PO, approve or reject, receive goods | `InventoryWorkflow/StockChecker.js`, `PurchaseOrders.js`, `GoodsReceiving.js` | **None** | **None** (browser `localStorage`) | M06 | **Partially implemented**: demo only, with arithmetic bugs | RT-008, RT-009; GoodsReceiving.js:27, 41 (F-016) | High |
| M08 | Production (batch tracking and workflow tabs) | Track batches from order to schedule | In-memory batches; order review → material check → scheduler, all in the browser | `Production/Production.js`, `ProductionWorkflow/OrderReview.js`, `MaterialCheck.js`, `ProductionScheduler.js` | Not used | Browser only | M05, M06 | **Broken**: chain cannot start, material check always shows shortage | OrderReview.js:9-13; MaterialCheck.js:11, 34 (F-048) | High |
| M09 | Production planning | Allocate machines and workers, set daily targets, record output | Allocate machine, create task, record production, planning summary, employee performance, machine availability | `ProductionPlanning/PlanningDashboard.js` (routed); `ProductionPlanning.js` (not routed) | `production-planning-service` | `Machines`, `ProductionOrders`, `MachineAllocations`, `ProductionTasks`, `DailyProduction`, views | M16 (employees) | **Partially implemented**: backend verified; routed UI always fails (no token) | RT-024..031, RT-045 (F-009, F-010, F-011) | High |
| M10 | Quality management | Inspect output, approve or reject batches | Inspection queue, claim batch, complete inspection (transaction), quality dashboard and reports | `QualityManagement/QualityDashboard.js` (routed); `QualityManagement.js` (not routed) | `production-planning-service` `/quality/*` | `QualityInspections`, `DailyProduction` | M09 | **Partially implemented**: backend verified; routed UI always empty | RT-032, RT-033 (F-009, F-044) | Medium |
| M11 | Worker dashboard | Let operators see and record their tasks | Today's tasks, record pieces | `ProductionWorkflow/ProductionWorkerDashboard.js` | Calls port 5009 directly | — | M09 | **Broken**: no token, so always "No tasks"; hard-coded user "John Doe" | ProductionWorkerDashboard.js:12, 22, 36 (F-009) | Medium |
| M12 | Style costing | Know the material cost of each garment style | Costing dashboard, style breakdown, materials, update costing | `StyleCosting/StyleCosting.js` | `costing-service` | `Styles`, `Materials`, `MaterialCosts`, `StyleCostings`, views | — | **Partially implemented**: backend verified; UI calls wrong paths without a token | StyleCosting.js:31-86 (F-009) | Medium |
| M13 | Finance / expenses | Track income and spending | UI: static list and budgets, dead buttons. API: transactions and summary | `Expenses/Expenses.js` | `finance-service` (3 endpoints) | `FinanceTransactions` | — | **Partially implemented**: API minimal and verified; UI static; no accounting | Expenses.js:7-20, 104, 141 (F-002, F-017) | High |
| M14 | Clients & vendors | Keep customer and supplier details | UI: static tables, dead Add buttons. API: client CRUD and stats; no vendors | `Clients/Clients.js` | `client-service` | `Clients` | — | **Partially implemented** | RT-012; Clients.js:64, 124 (F-002, F-016) | Medium |
| M15 | Reports | Management reporting | UI: static sales, inventory, production and finance tables; dead Export. API: dashboard, sales, production reports | `Reports/Reports.js` | `report-service` | Reads other modules' tables | M05, M06, M09, M13 | **Partially implemented**: API verified with accuracy defects | RT-042..048, RT-034 (F-002, F-012, F-020) | High |
| M16 | Payroll | Pay employees correctly | Employee master (code and CTC), manual payroll, auto-generate month, stats | `Payroll/Payroll.js` | `payroll-service` | `Employees`, `Payrolls` | M17 (not linked) | **Partially implemented**: connected, but "Mark Paid" and edits corrupt data | RT-005, RT-037..041, RT-066 (F-005, F-018, F-019, F-035) | High |
| M17 | Attendance | Record who worked and when | Daily register, check-in/out (late cut-off), mark status, summary, stats | `Attendance/Attendance.js` | `attendance-service` | `EmployeeAttendance`, views | M16 (employees) | **Verified working** (UI date defects F-033) | RT-035, RT-036; earlier procedure tests (late, 8.52 h) | Medium |
| M18 | Invoicing & templates | Issue tax invoices | Invoice generator (3 layouts incl. GST), template builder, template list, templates; all in the browser | `OrderWorkflow/InvoiceGenerator.js`, `TemplateBuilder/`, `TemplateList/`, `ApplicationSettings/Templates.js` | **None** | Browser only | M05 | **Broken**: wrong GST arithmetic, duplicate numbers, not stored, hard-coded third-party identifiers | InvoiceGenerator.js:80, 285-288 (F-007, F-008, F-031) | High |
| M19 | Page builder & custom pages | Let the company build its own screens | Drag-and-drop pages; widgets for heading, text, stat, table, chart, saved chart and form; custom columns; publish to menu | `ApplicationSettings/PageBuilder.js`, `pagebuilder/*`, `CustomPage.js` | `page-builder-service` | `CustomPages`, `CustomColumns`, `CustomColumnValues` | M02, M03 | **Verified working**, with a data-exposure gap (F-003) | 101-endpoint smoke test; RT-062, RT-065; jest tests | Medium |
| M20 | Form builder | Design data-entry forms | Form definitions stored; placed on pages by reference | `ApplicationSettings/FormBuilder.js` | `page-builder-service` `/pages?kind=form` | `CustomPages` | M19 | **Partially implemented**: submissions never stored | PageRenderer.js FormFields (F-041) | Medium |
| M21 | Create charts | Build charts from entered values | 7 chart types, colours, legend, table view, saved charts, Saved chart widget | `ApplicationSettings/ChartBuilder.js`, `chartbuilder/ChartRenderer.js` | `page-builder-service` `/charts*` | `SavedCharts` | M19 | **Verified working** | 21 + 15 API checks; rendered screenshot; jest | Low |
| M22 | Workflows designer | Describe business workflows | Define named step lists | `Workflows/Workflows.js` | None | Browser only | — | **Partially implemented**: descriptive only; nothing executes them; route unguarded | Workflows.js:20-88 (F-030, F-029) | Low |
| M23 | API manager | List and manage APIs | Static, in-memory list including non-existent endpoints | `ApplicationSettings/ApiManager.js` | Not used (the real catalogue is `shared/api-catalog.js`) | — | — | **Broken**: shows fake data | ApiManager.js:16-53 (F-030) | Low |
| M24 | Form rules | Validation and business rules for forms | In-memory rule list | `ApplicationSettings/FormRules.js` | None | — | M20 | **Partially implemented**: rules never applied | FormRules.js:16-53 (F-030) | Low |
| M25 | Roles & permissions screens | Role-based access design | Roles and permission matrix in the browser | `ApplicationSettings/Roles.js`, `Permissions.js` | None | Browser only | — | **Partially implemented**: no effect, and conflicts with M02 | Roles.js, Permissions.js (F-030) | Medium (confusing) |
| M26 | Database tooling | Install and upgrade the database; move data from SQL Server | `setup-database.js` (applies `postgres/*.sql` in one transaction), `migrate-from-mssql.js` | — | — | All | — | Setup **verified**; SQL Server copy **unable to verify** (source credentials not provided) | Ran repeatedly in the isolated environment (F-024) | High |
| M27 | Retired production service (port 5004) | Superseded by M09 | — | — | `services/production-service` (empty `routes/`), `shared/production-schema.js`, `shared/init-db.js` | Conflicting legacy DDL | — | **Broken / retired** | README; F-049 | Low |

## Common ERP capabilities that are missing

Checked against the application's evident scope (a garment manufacturer: orders, stock, production, quality, HR and payroll, finance):

| # | Capability | Evidence of absence |
|---|---|---|
| 1 | Purchase orders, goods receipt and suppliers **in the backend** | No tables or endpoints (RT-008, RT-009); only the browser demo M07 |
| 2 | Order lines, products and stock reservation | `Orders` has no items (RT-017, RT-023) |
| 3 | Quotations, server-side sales invoices, payments, receivables | RT-023; no tables |
| 4 | Payables, chart of accounts, general ledger, bank reconciliation | `FinanceTransactions` is a flat list (F-017) |
| 5 | GST / tax engine, currency and organisation settings | RT-007 |
| 6 | Warehouses, locations, SKU master, stock movement ledger, valuation | RT-006, RT-014 |
| 7 | Bill of materials linked to stock; material consumption; finished goods receipt | RT-030 (style costing exists but is unlinked) |
| 8 | Dispatch / shipment, returns, refunds | No code |
| 9 | Leave management, payslips, statutory deductions (PF, ESI, PT, TDS) | No code (F-018) |
| 10 | Approval workflows (purchase, payroll, discounts) | Workflows screen is descriptive only (M22) |
| 11 | Audit trail of changes | No audit tables (F-027) |
| 12 | Import / export (CSV, Excel, PDF) | RT-010; dead Export buttons (F-047) |
| 13 | Notifications (e-mail, in-app, WhatsApp) | No code (F-051) |

Multi-company support is also absent (F-050). It is listed as an enhancement, not a gap, because nothing in the repository suggests the product is meant for groups of companies.

## Repository coverage checklist

| Area | Files | Covered by |
|---|---|---|
| Frontend screens | 41 component files under `smarterpfrontend/src/components` | Read in full by 2 review agents + own reading; all listed above |
| Frontend shared | `App.js`, `services/api.js`, `config/menuConfig.js`, `pagebuilder/*`, `chartbuilder/*`, `RequirePermission.js` | Read |
| API client ↔ gateway ↔ services | 80 `api.js` methods traced to routes | Agent mapping (all exist; 47 unused) |
| Backend services | 11 active services + gateway; 1 retired | Read; runtime-tested through the isolated gateway |
| Shared backend | `database.js`, `auth.js`, `app-time.js`, `app-menus.js`, `api-catalog.js`, `data-sources.js`, `db-service.js` | Read |
| Database | `postgres/01…08-*.sql` (24 tables, 11 views, 9 functions) | Read; applied and queried at runtime |
| Legacy | Root `*.sql` (SQL Server), `smarterpbackend/test-*.js`, `shared/init-db.js`, `production-schema.js` | Read; marked legacy |
| Tests | `App.test.js` (fails), `pagebuilder/PageRenderer.test.js` (5 pass) | Executed |
| Build / deploy / CI | `package.json` scripts only; no Docker, CI, process manager or TLS configuration | Checked: none present |
| Background jobs | None (no schedulers or queues) | Checked |
| Third-party integrations | None (no payment, e-mail, GST portal or accounting integration) | Checked |
