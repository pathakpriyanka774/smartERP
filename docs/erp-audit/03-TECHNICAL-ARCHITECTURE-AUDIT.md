# 03 — Technical Architecture Audit

*For developers and architects.* Revision `437eb36` + working tree (2026-10-09). Every issue below has an ID in the central backlog ([10-PRIORITIZED-DEVELOPMENT-ROADMAP.md](10-PRIORITIZED-DEVELOPMENT-ROADMAP.md), [issue-backlog.csv](issue-backlog.csv)). "Runtime" means observed in the isolated environment ([evidence/](evidence/)); "Static" means code reading only.

## 1. Actual technology stack

| Layer | Technology (verified in the repository) |
|---|---|
| Frontend | React 19.1, react-router-dom 7.9, axios 1.12, Create React App 5 (react-scripts), plain CSS. No state library, no UI kit, no chart library: charts are hand-written SVG. |
| API gateway | Express 4 + http-proxy-middleware 2.0.9 (`smarterpbackend/gateway/server.js`, port 8000). JWT check and per-area permission map. |
| Services | 11 Express 4 services, one process each: auth 5001, order 5002, inventory 5003, finance 5005, client 5006, report 5007, payroll 5008, production-planning 5009, costing 5010, attendance 5011, page-builder 5012. Started together with `concurrently` (`npm run start:all`). |
| Data access | `pg` 8 through `shared/database.js`, which emulates the old `mssql` API (`request().input().query()`, `.execute()`), rewrites `@name`→`$n` and restores PascalCase keys. |
| Database | PostgreSQL 16; schema in `postgres/01…08-*.sql`: 24 tables, 11 views and 9 PL/pgSQL functions (former stored procedures). One shared database for all services. |
| Auth | bcryptjs password hashes; HS256 JWT, 24 h, permissions embedded; `shared/auth.js`. |
| Tests | 1 failing CRA placeholder (`App.test.js`) and 5 jest tests (`pagebuilder/PageRenderer.test.js`). No backend tests. |
| Build / deploy | npm scripts only. No Docker, CI, process manager, reverse proxy, TLS, migrations or backup tooling. |
| Jobs / queues / integrations | None. |

```
Browser (React SPA, token in localStorage)
   │  axios (services/api.js)          ← used by Payroll, Attendance, Users, builder screens
   │  fetch(':5009' / ':5010') no token ← StyleCosting, Planning/Quality/Worker dashboards (always 401)
   │  (no calls)                        ← Dashboard, Orders, Inventory, Expenses, Clients, Production, Reports
   ▼
Gateway :8000  ── JWT verify + area permission ──►  11 services :5001-5012 (bind 0.0.0.0, authenticate only)
                                                         │
                                                         ▼
                                              one PostgreSQL database (shared schema)
```

## 2. Frontend audit

| Topic | Finding | Evidence | Backlog |
|---|---|---|---|
| API integration | 7 primary screens never call the backend; 47 of 80 `api.js` methods are unused. | Component imports; agent trace of every method | F-002 |
| API integration | 4 routed screens bypass `api.js`, call service ports directly without a token, and use wrong costing paths. Result: silent empty states. | `StyleCosting.js:31-86`, `PlanningDashboard.js:26-51`, `QualityDashboard.js:25,38`, `ProductionWorkerDashboard.js:22,36` | F-009 |
| Field contract | `Payroll.js` reads `JoiningDate`, but the API returns `joiningDate`; it sends `overtime` and `{status:'paid'}`, which the API ignores. `PlanningDashboard` reads `MachineID` and `OrderID`, which the views don't return. | `Payroll.js:66,92,183,384`; `PlanningDashboard.js:238,355` | F-005, F-010, F-019 |
| State | Six screens hold business data in component state seeded from literals. Workflow tabs use `localStorage` with three different shapes for "inventory" and "templates". | `Inventory.js:20-91` vs `StockChecker.js:16-21`; `Templates.js`/`TemplateBuilder.js`/`TemplateList.js` | F-002, F-031 |
| Error handling | No error boundary anywhere; unguarded `JSON.parse(localStorage…)` in about 12 places; save errors go to `console.error` only (Payroll). The Orders screen crashes after an edit. | `Orders.js:101,428`; `Payroll.js:54` | F-023, F-036 |
| Loading states | Present in Attendance, User Management, Page Builder, Create Charts and Custom Page; absent everywhere else (nothing is loaded). | Agent review | F-002 |
| Validation | HTML `required`/`min` only. No date ordering checks, NaN propagation (CreateOrder), negative prices allowed. | `CreateOrder.js:102-111`; `GoodsReceiving.js:14-27` | F-006 |
| Auth UX | The 401 interceptor reloads the page on a failed login (login mounted at `*`, check expects `/login`). Logout leaves the token behind. | `services/api.js:40-51`; `App.js:63-66,78` | F-021, F-022 |
| Route protection | 8 routes lack `RequirePermission`. Presentation only, but it exposes demo screens and inactive pages. | `App.js:104,111-113,117-119,123` | F-029 |
| Localisation | `$` hard-coded across screens for an INR business; `toISOString()` used for local dates (UTC shift in IST). | `Payroll.js:131…`; `Attendance.js:6,9` | F-032, F-033 |
| Security | No `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src` (good). Token in `localStorage` makes any future XSS a token theft. Real-looking third-party GSTIN, bank and contact data are hard-coded. | grep; `InvoiceGenerator.js:179-191`; `TemplateBuilder.js:7-62` | F-037, F-008 |
| Duplication / dead code | `ProductionPlanning.js` and `QualityManagement.js` are correct but unrouted, while broken duplicates are routed. `CreateOrder` is never rendered. Three role/permission concepts exist. | `App.js:21,23,117-119` | F-009, F-030, F-049 |
| Component size | `InvoiceGenerator.js` 707 lines, `PageBuilder.js` 605, `ProductionPlanning/PlanningDashboard.js` 385; large render functions mixing data and markup. | `wc -l` | — (P3, refactor with F-002) |
| Accessibility | Create Charts and the chart renderer have ARIA labels, text legends and a data-table view. Most other screens use clickable `div`s for navigation (`Sidebar.js` nav items) with no keyboard handlers, and colour-only status badges. | `Sidebar.js` `.nav-item onClick` | See 07-UI-UX |

## 3. Backend audit

| Topic | Finding | Evidence | Backlog |
|---|---|---|---|
| Authentication | JWT verify is correct: expired, forged and `alg:none` tokens are rejected. Algorithm not pinned. No revocation: a deactivated user keeps access for 24 h. No login throttling. | RT-053..058; `shared/auth.js:23-32` | F-022, F-037 |
| Authorization | Area permission is enforced **only in the gateway**. Services authenticate but don't authorize, and listen on all interfaces, so any valid token reads payroll directly on :5008. | RT-052; `shared/auth.js:70-76` | **F-004** |
| Authorization | The page-builder data sources (`/datasources/:key/rows`, `/aggregate`) have no per-source permission. The gateway marks `builder` as login-only, so any user reads employee and attendance rows. | RT-065; `page-builder-service/server.js` | **F-003** |
| Authorization | Menu Manager and Form Builder writes require `page-builder`, not their own permission. The custom-value write has no permission check. | `page-builder-service` `canAuthor` | F-042 |
| Input validation | Only names are required on most POSTs. Negative quantities and amounts, unknown statuses, bad months and inverted dates are all accepted. `parseInt` without NaN checks; `createdBy` taken from the request body (costing). | RT-015, 019-021, 031, 039, 040 | **F-006** |
| Update semantics | `PUT /payroll/employees/:id` overwrites every column, so a partial body gives 500 or NULLs. `PUT /payrolls/:id` writes `allowances||0`. | RT-041, RT-066 | F-005, F-019 |
| Business rules | No bounds on recorded production; no status transitions; allocation errors returned as HTTP 200 with `Result:'Error'`. | RT-028, 029, 045; `production-planning-service` `/machines/allocate` | F-010, F-011 |
| Transactions | Used where it matters most: complete-inspection, the signup bootstrap with advisory lock, machine claim in one `UPDATE`. Missing in `savePermissions` (DELETE then INSERTs) and `/quality/inspect`. | Code; RT-025 | F-043, F-044 |
| Concurrency | Machine allocation and check-in are race-safe (RT-025, RT-036). Employee codes are `COUNT(*)+1`, so concurrent creates fail with 500. No idempotency keys, so double-submit duplicates records. | Runtime: 1/4 creates succeeded; RT-022 | F-034 |
| Error handling | Inconsistent: 500 for over-length strings and negative limits; the gateway turns upstream failure into 500 with the raw `err.message`; no proxy or statement timeouts; `complete-inspection` calls `getPool()` outside `try`. | RT-061, RT-063; `gateway/server.js:107-111` | F-036 |
| Response consistency | Mostly `{success, data}`, but stats endpoints return bare objects (`/inventory/stats`, `/orders/stats`, `/payroll/stats`, `/finance/summary`). | Service code | (part of F-036) |
| Pagination | None, except page-builder rows (max 500, no offset). | Agent endpoint review | F-039 |
| SQL injection | No user input is interpolated into SQL; dynamic identifiers come from a whitelist (`shared/data-sources.js`). The injection probe was harmless (RT-062). | Code; RT-062 | — (good) |
| Logging | `console.log` of request URLs (auth), and user e-mail on 403 (gateway). No structured logs, request IDs or log levels. | `gateway/server.js:92`; `auth-service/server.js:41-44` | F-038, F-046 |
| Audit trail | None. | `postgres/*.sql` | F-027 |
| Background processing / retries | None needed today; none present. | — | — |

## 4. Database audit

| Topic | Finding | Evidence | Backlog |
|---|---|---|---|
| Schema design | Modules are islands. `Orders.ClientName` is free text with no foreign key to `Clients`; `ProductionOrders` is unrelated to `Orders`; `Materials` (costing) is unrelated to `InventoryItems`; `FinanceTransactions` has no source reference. | `postgres/02,03,04` | F-013, F-014, F-017 |
| Missing master data | No item cost, SKU, unit of measure master, warehouse, supplier, tax code or HSN. | `04-erp-core.sql` | F-015, F-016 |
| Constraints | Good CHECKs on attendance, page builder and charts. None on business quantities, amounts or statuses (orders, inventory, finance, payroll, production). No `UNIQUE(EmployeeID, Month)` on `Payrolls`. | Grep of CHECK/UNIQUE | F-006, F-040 |
| Indexes | 6 explicit indexes in the whole schema; foreign-key columns unindexed (`Payrolls.EmployeeID`, every column of `MachineAllocations`, `ProductionTasks.AllocationID`, `DailyProduction.*`, `QualityInspections.*`, `StyleCostings.*`). | `postgres/*.sql` | F-040 |
| Numeric precision | Percentages cast to `DECIMAL(5,2)` overflow above 999.99%, which crashes 2 endpoints. | RT-034 | F-012 |
| Status / lifecycle | `Payrolls` has no status; `ProductionOrders.Status` never changes; machine allocations never end. | `01`, `02` | F-005, F-011, F-045 |
| Soft delete / history | `IsActive` on users, employees, materials and style costings (costing keeps history by deactivating old rows; good). No history elsewhere; orders and payrolls are overwritten in place. | Schema | F-027 |
| Time zones | Session `TimeZone=UTC`; `CURRENT_DATE` defaults and "today" filters use the UTC day; attendance alone derives the IST day in the application. | `shared/database.js` `options`; `postgres/02,04` | F-052 |
| Migrations | Each schema file starts with `DROP TABLE … CASCADE`, and `setup-database.js` re-applies all of them, so a re-run wipes data. Only `08-charts.sql` is additive. | `postgres/01-07` | **F-024** |
| Backup / recovery | None. | — | F-025 |
| Multi-tenancy | None (single organisation). Acceptable if that is the product scope. | — | F-050 |
| Name casing | Identifiers are unquoted PascalCase (stored lowercase); `shared/database.js` restores the casing. It works (verified across 101 endpoints), but it is unusual and must be documented for every future developer. | `shared/database.js` header | — (documented) |

## 5. Architecture and scalability

**Microservices suitability.** These are 11 services sharing one database, one schema, one shared library and one deploy command. That is a distributed monolith: it has the operational cost of many processes (12 ports, 12 health checks, cross-service network hops through the gateway) without the benefits (independent data or independent deploys). For a small team and a single customer database, **consolidating into one modular Express application** (one process, routers per module, one connection pool) would remove the per-service permission duplication (F-004) and simplify deployment.

This is not a mandatory change. Keep services separate only if you plan independent scaling or teams per module. Nothing in the repository indicates either today.

**Scaling.** No caching, queues or file storage are needed for the current feature set, and none are recommended yet. The first bottlenecks will be:
- unpaginated list endpoints (F-039);
- unindexed joins in the production and quality views (F-040).

Both are cheap to fix. The report queries are aggregate SQL over whole tables and will need date filters, and later summary tables, once transaction volume grows.

**Horizontal scaling.** Services are stateless (JWT), so they can run multiple instances behind a load balancer. The connection pool defaults to 10 per process, which means 110 connections across 11 services; watch PostgreSQL `max_connections`.

**Observability and deployment.** There are no structured logs, metrics, alerting, process supervision or TLS termination (F-046). CI/CD is absent (F-026). Configuration comes from a `.env` file, which is correctly git-ignored. `.env.example` documents every variable without real values.

## 6. Detailed technical findings (P0/P1)

| Issue | Severity | Business impact | Technical impact | Location | Evidence | Reproduction | Recommended solution | Complexity | Priority |
|---|---|---|---|---|---|---|---|---|---|
| F-003 | Critical | Personal data visible to every account | Authorization bypass | `page-builder-service/server.js` `/datasources/:key/rows`, `/aggregate` | RT-065 | Log in as a user with only `orders`; `GET /api/builder/datasources/employees/rows` returns 200 with employee rows | Per-source permission map enforced on rows, aggregate and columns | S | P0 |
| F-004 | Critical | Salaries readable by any employee | Services trust the network | `shared/auth.js` `protectService`; every `app.listen(PORT)` | RT-052 | Orders-only token → `GET http://host:5008/employees` returns 200 | `requirePermission` per service and bind to 127.0.0.1 (or consolidate, §5) | S | P0 |
| F-005 | Critical | Pay amounts silently changed | Contract mismatch; no lifecycle | `Payroll.js:92`; `payroll-service` `PUT /payrolls/:id` | RT-066 | Set allowances 1500, deductions 300 → "Mark Paid" → both 0, status pending | Add Status/PaidAt; partial updates; explicit pay action | S | P0 |
| F-006 | Critical | Corrupted stock and financial figures | No validation layer | All write endpoints in order, inventory, production-planning and payroll | RT-015, 019-021, 031, 039, 040 | e.g. `POST /api/inventory/inventory {quantity:-50}` → 200 | Schema validation middleware + DB CHECKs | M | P0 |
| F-024 | High | One command deletes all data | Bootstrap scripts used as migrations | `postgres/01-07`, `setup-database.js` | Static | Run `node setup-database.js` on a database with data | Versioned migrations; guard against non-empty databases | M | P1 |
| F-012 | High | Reports go down after one bad entry | `DECIMAL(5,2)` overflow | `report-service` `/reports/production`; `production-planning-service` `/planning/employee-performance` | RT-034 | Record 5,000 pieces on a 120 target, then GET either report → 500 | Wider numeric type + F-011 | S | P1 |
| F-011 | High | Inflated output; orders never close | Missing business rules | `sp_RecordProduction` (`postgres/02`) | RT-028, 029, 045 | As above | Bound checks + status transition | S | P1 |
| F-009 | High | 4 modules unusable from the UI | Bypassed API client | See §2 | Static | Open `/style-costing` → empty; network tab shows 401 or 404 | Use `costingAPI`/`productionAPI`/`qualityAPI` | S | P1 |
| F-022 | High | Dismissed staff keep access; brute force possible | Stateless JWT, no rate limit | `App.js:63-66`; gateway | RT-056, RT-058 | Deactivate a user → their token still returns 200 | Token version check; rate limit; clear token on logout | S | P1 |
| F-019 | High | Employee data loss on edit | Field-name mismatch; full overwrite | `Payroll.js:66,183`; `payroll-service` `PUT /employees/:id` | RT-041 | Edit employee → joining date blank; PUT `{name}` → 500 | camelCase field; COALESCE updates | S | P1 |
| F-026 | High | Regressions ship unnoticed | No tests or CI | `App.test.js` | `npm test`: 1 suite fails | `CI=true npx react-scripts test` | Integration test suite (start from `evidence/runtime-audit.js`) in CI | M | P1 |

All remaining findings, with evidence and fixes, are in the backlog.
