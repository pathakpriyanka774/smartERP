# 12 — Remediation Status (top 10 development tasks)

*For engineering leads, QA and release management.* Work done on 2026-10-09 against the findings in [10](10-PRIORITIZED-DEVELOPMENT-ROADMAP.md). Reports 01–11 describe the system **as audited**. This file records what has changed since, and how each change was verified.

## Verification

| Check | Result |
|---|---|
| Backend integration suite (`smarterpbackend/tests`, `npm test`) on a disposable database | **54 / 54 pass** |
| Frontend unit tests (`npm test` in `smarterpfrontend`) | **16 / 16 pass** (5 suites; the old placeholder test now runs and passes) |
| Frontend lint (`npx eslint src`) | 0 errors; 7 warnings, all in legacy files that are no longer routed or were untouched |
| Frontend production build | Succeeds |
| Browser smoke test: 13 routed screens in headless Chrome against the isolated backend, logged in, with seeded data | 13 / 13 load with **0 exceptions, 0 console errors, 0 failed API calls, 0 error banners, 0 "$" amounts** |
| Live database | Backed up first (`backups/`), then migrations 001–004 applied: additive, nothing dropped |

The browser check covers loading and display only. Form submissions in the browser were not driven; the same operations are covered at API level by the integration suite.

## Task by task

| # | Task | Findings | Status | What changed | Evidence |
|---|---|---|---|---|---|
| 1 | Close both permission bypasses | F-003, F-004 | ✅ Done | One permission map (`shared/permissions.js`) enforced by the gateway **and** by every service (`protectService(app, { permissions })`). Services listen on `127.0.0.1` (`SERVICE_HOST`) and the gateway targets `127.0.0.1`. Each page-builder data source requires the permission of the area owning its data, enforced on rows, aggregates, columns and custom values. Inactive custom pages are hidden from non-authors. JWT algorithm pinned to HS256. | `tests/suites/security.js`: direct payroll port → 403; builder employee/attendance rows → 403; datasource list filtered |
| 2 | Fix payroll corruption | F-005, F-019, F-034 (codes), F-035 | ✅ Done | Payroll status lifecycle (pending → approved → paid / cancelled) with `PaidAt` / `PaidBy`; updates change only the fields sent; paid payrolls are final; one payroll per employee per month. Employee update is partial, with a 404 for unknown ids. Employee codes come from a sequence. Payroll screen reads `joiningDate`, sends `allowances`, has Approve / Mark Paid with confirmation, a month picker instead of `prompt()`, visible errors and ₹. Payroll statistics corrected. | `tests/suites/payroll.js` (Mark Paid keeps 1,500 / 300 and records the payer; 4 simultaneous employees get 4 codes) |
| 3 | Validate business values on the server and in the database | F-006, F-011, F-012, F-036 (partial), F-040, F-044 | ✅ Done | `shared/validate.js` on every write endpoint (types, ranges, enums, dates, lengths); `shared/http.js` turns database errors into 400/409 with readable messages. Migration 002 adds `CHECK` constraints (`NOT VALID`, so old rows are untouched) and foreign-key indexes. Production cannot exceed the task or the order, and the order auto-completes. Percentages widened (no more overflow 500s). Inspections must balance and are recorded once. Business failures return 409, not 200. The gateway answers 503 with a generic message when a service is down. | `tests/suites/validation.js`, `production.js` |
| 4 | Non-destructive setup + tested backups | F-024, F-025 | ✅ Done (scheduling is your step) | `setup-database.js` installs only into an empty database and otherwise applies pending migrations (`postgres/migrations`, tracked in `SchemaMigrations`). Wiping needs `--fresh --confirm-wipe`. `scripts/backup-database.js` (verified dump, owner-only, retention) and `scripts/restore-database.js` (refuses non-empty targets without `--force`). `backups/` is git-ignored. | `tests/suites/database-safety.js` (re-run changes nothing; `--fresh` alone refused; backup → restore round trip) |
| 5 | Remove hard-coded third-party details | F-008 | ✅ Done in the working tree; ⚠️ still in git history | Seller details come from `src/config/companyProfile.js` (placeholders, overridable by `REACT_APP_COMPANY_*`). Buyer GSTIN and e-way bill are blanks to fill in. A repository-wide search finds no GSTIN, IFSC or e-mail values. | Pattern search over `smarterpfrontend/src`, `smarterpbackend` |
| 6 | Real figures on the dashboard | F-001, F-020, F-052 (reports) | ✅ Done | Dashboard renders `/api/reports/dashboard`: income vs last month, open orders and value, active and overdue production, stock value, low/out-of-stock, sales booked, expenses, inspection queue, attendance today, pending payrolls, 6-month income/expense chart, order-status chart, stock alerts and recent activity. Boundaries use the IST business date; cancelled orders are excluded; top products come from order lines. The `dashboard` permission opens it without full Reports. | `tests/suites/reports.js` (KPIs equal database sums); `Dashboard.test.js`; browser screenshot |
| 7 | Connect screens to their APIs | F-002, F-009, F-010, F-023, F-029 (production routes), F-032 (rewritten screens), F-047 (CSV), F-048 | ✅ Done | Orders, Clients & Vendors, Inventory, Expenses & Finance, Reports, Style Costing, Production, Planning board, Quality and the Worker screen all load and save through `services/api.js` with loading, error and empty states, disabled-while-saving buttons, ₹ formatting and CSV export. The browser-only workflow tabs are no longer used. Failed-login reload fixed; logout clears the token; production dashboards require the Production permission. | Browser smoke test (13 / 13) |
| 8 | Item cost, stock movement history, stock value | F-015 | ✅ Done | Items gain SKU, unit cost and reserved quantity. Every quantity change goes through `sp_StockMove` (atomic, no overselling, weighted-average cost) and is written to `StockMovements` (opening balances created for existing stock). Stock value = quantity × average cost. Inventory screen: receive, issue and adjust with reasons; history; movements log. | `tests/suites/inventory.js` (reference value 85,625; average cost; 10 concurrent issues → exactly 5) |
| 9 | Link orders to stock and production to materials | F-013 (stock part), F-014, F-045 | ✅ Done | Order lines; total computed server-side. Confirm reserves stock (shortages reported); dispatch issues it (all or nothing); cancel releases it; transitions enforced. Production orders can be raised from a sales order. Material requirement check. Recording output consumes linked materials (a shortage rolls back the whole recording). Approved inspections add finished goods at material cost. Machines can be released. Style Costing links materials and styles to stock items. | `tests/suites/orders.js`, `production.js` |
| 10 | Automated test suite + fix the placeholder test | F-026 | ✅ Done | `smarterpbackend/tests` (54 integration tests, built-in `node:test`, no new dependencies). Frontend: Jest mappings for react-router 7 and axios, plus tests for App, format helpers, menu permissions and the dashboard. `.github/workflows/ci.yml` runs both suites and the build. | Results above |

## Backlog round 2 (2026-10-10)

| Check | Result |
|---|---|
| Backend integration suite | **96 / 96 pass** (42 new: `invoicing.js`, `purchasing.js`, `payroll-attendance.js`, `sessions-audit.js`) |
| Frontend unit tests | **33 / 33 pass** (10 suites) |
| Frontend lint | 0 errors; the same 7 legacy warnings |
| Frontend production build | Succeeds |
| Browser smoke test | 18 / 18 screens (13 earlier + Sales Invoices, Purchases, Accounting, Company Settings, Audit Log): 0 exceptions, 0 console errors, 0 failed API calls, 0 error banners |
| Live database | Backed up (`backups/`), then migrations 005–009 applied. Ledger balances; Inventory account equals stock value |

| Finding | Status | What changed | Evidence |
|---|---|---|---|
| F-007 GST invoices | ✅ Done | Invoices issued from a confirmed order and stored server-side (`Invoices`, `InvoiceItems`). Tax per line in integer paise: CGST + SGST intra-state, IGST inter-state (seller state from the company GSTIN vs place of supply, which a registered buyer's GSTIN fixes). Totals are sums of the line figures; round-off to the rupee; amount in Indian words. Numbers `PREFIX/YY-YY/NNNNN`, gapless per financial year (a failed save uses no number), in date order. GSTINs checked for format, state and check digit. Issued invoices are immutable (database trigger); cancellation keeps the number. Seller details are a frozen snapshot from Company Settings. The old browser-only generator is removed. | `invoicing.js` (17,632.00 with CGST = SGST = 516.00; IGST 1,032.00; consecutive numbers; SQL edit refused) |
| F-016 Purchasing | ✅ Done | Purchase-service: suppliers, PO with lines → submit → approve (Manager/Admin, not the requester unless Admin) → goods receipts (partial; rejections need a reason and do not count as received) → supplier bills only for received, unbilled quantity at PO price (three-way match; a supplier bill number once per supplier) → payment in Accounting. Short-close and cancel rules. | `purchasing.js` |
| F-017 / F-028 Accounting | ✅ Done | Chart of accounts and double-entry journal: unbalanced entries and edits/deletes of posted entries are refused by the database; corrections are reversals. Automatic postings: invoices, receipts, bills, supplier payments, payroll accrual and payment, every stock movement (including revaluation when a unit cost is edited, and exact average-cost rounding), cash-book lines. Manual journals cannot touch control accounts. Reports: trial balance, P&L, balance sheet, receivables and payables ageing, GST summary. | Tests assert Inventory = stock value, AR = open invoices, AP = open bills, trial balance and balance sheet balance |
| F-018 Payroll from attendance | ✅ Done | Loss of pay = absent days + ½ per half-day + days before joining, on calendar days; present, late and paid leave are paid; unmarked days are paid (weekly offs and holidays are not recorded). PF, ESI and professional tax are configurable and **off by default**. TDS is per payroll. Recalculate per payroll or month; approval locks amounts and posts the accrual; back to pending reverses it; paying posts the bank payment and a cash-book line. Payslip with the policy printed on it. | `payroll-attendance.js` (LOP 12.5 days → ₹12,500 on ₹30,000) |
| F-022 (rest) Revocation, throttling | ✅ Done | Tokens carry a `TokenVersion`. Every request (gateway and each service) re-checks the account (exists, active, version, current permissions), cached `SESSION_CACHE_MS` = 5 s. A trigger bumps the version on deactivation, role or password change. Sign-out bumps it too (all devices). Permission changes apply without signing in again. Login throttled per account (5 / 15 min) and per address (20 / 15 min), signup per address (10 / h): 429 with `Retry-After`. | `sessions-audit.js` |
| F-027 Audit trail | ✅ Done | `AuditLog` written by triggers on 25 business tables (actor from the request, before/after with only changed fields for updates, password hashes never copied), plus LOGIN, LOGIN_FAIL and LOGOUT events. Append-only (trigger). Admin-only viewer at `/audit-log` with no export. | `sessions-audit.js` |
| F-039 Pagination | ✅ Done | Orders, inventory, movements, clients, transactions, employees, payrolls, attendance and all new lists: `page`, `pageSize` (max 500), `q` (literal search), `{ data, pagination }`. Screens use a shared pager and server search. | `sessions-audit.js` |

**Your steps:**
1. Restart all services: `npm run start:all` now also starts accounting (5013) and purchases (5014).
2. As an Admin, open Company Settings: enter the company GSTIN, address, bank details and invoice prefix. Invoices are refused until a valid GSTIN is saved.
3. Grant the new permissions in User Management: `invoices`, `purchases`, `accounting`. Approvers of POs need the Manager role.
4. Add GSTIN, state and address for registered customers and suppliers, and HSN code and GST rate for stock items.
5. Enter unit costs for existing items. The first cost entered for an item is posted to Opening Balance Equity.
6. Enable PF, ESI and professional tax only if they apply to you, after checking current law and your state's slab.
7. Have your accountant review the chart of accounts and the GST summary before the first return. The summary is a working aid for GSTR-1/3B, not a filing.

**Data protection:** the audit log contains personal data (HR rows, salaries). It is readable by Admins only and is append-only by design. Set a retention period in your DPDP records of processing; deleting old rows needs a deliberate administrative step, because the trigger blocks application deletes.

**Known limits:** supplier bills are booked at the PO price, so price differences need a manual journal. Stock received directly in Inventory, without a PO, is credited to "Goods received not invoiced"; use Purchases for supplier goods. Some edit forms cannot clear an optional field once it is set. Login throttle counters live in memory and reset when the auth service restarts.

## Still open

| Finding | Note |
|---|---|
| F-037, F-038 (rest) | CORS still open; no security headers. (Auth-service now logs paths only, not query strings.) |
| Not built yet | E-invoicing (IRN / QR above the turnover threshold), e-way bills, TDS on supplier payments, GST return export files, bank reconciliation, period closing, multi-company. |
| F-033 | The Attendance records tab now uses IST dates; other attendance defaults were not re-checked. |
| Existing data | Items created before migration 003 have a unit cost of 0, so their value is ₹0 until a cost is entered. Run `ALTER TABLE … VALIDATE CONSTRAINT …` after checking old rows against the new rules. Order lines are new: older orders have a header only. |
| Git history | The initial commit still contains the third-party identifiers removed in task 5. Removing them requires a history rewrite (for example `git filter-repo`) and a force-push. This is a team decision. |
