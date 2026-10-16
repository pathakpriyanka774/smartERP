# 04 — Dashboard & Business Analytics Validation

*For product owners, finance and QA.* Every metric is traced from what the screen shows, through the API, to the SQL. Runtime checks (`RT-*`) were run on fictional data in the isolated environment ([evidence/runtime-results.json](evidence/runtime-results.json)).

## Headline

| Layer | Accuracy verdict |
|---|---|
| **What users see on the Dashboard, Reports, Expenses, Clients and Inventory screens** | **Not accurate: fabricated or sample data.** None of these numbers come from the database. |
| **Backend report and stats APIs** | Core counts and totals **reconcile with the database** (RT-042..044, RT-013). Several metrics have **definition errors**: cancelled orders counted in sales, mislabelled payroll KPIs, "top products" not based on sales, UTC day boundaries, and crashes on outlier data. |

So management currently has **no reliable dashboard**. The fastest win is to display the existing backend figures, after correcting the definitions below.

## 1. Main dashboard (`components/Dashboard/Dashboard.js`)

| Metric shown | Business meaning | Source | Calculation | Date range | Status |
|---|---|---|---|---|---|
| Monthly Revenue "$245,800", "+12.5%" | Income this month vs last | Literal in JSX (lines 33-34) | None | None | ❌ Fabricated |
| Active Orders "47", "+8" | Open customer orders | Literal (41-42) | None | None | ❌ Fabricated |
| Production Efficiency "94.2%", "+2.1%" | Output vs plan | Literal (49-50) | None | None | ❌ Fabricated |
| Inventory Turnover "6.8x", "-0.3x" | COGS ÷ average inventory | Literal (57-58) | None (no cost data exists to compute it) | None | ❌ Fabricated; not computable today |
| Revenue chart (6 bars) | Monthly revenue trend | CSS heights 60/75/45/85/95/70% (70-75) | None | None | ❌ Fabricated |
| Production gauges (75%, 3,750/5,000; 60%; 90%) | Progress of current orders | Fixed conic gradients (88-111) | None | None | ❌ Fabricated |
| Financial summary (18.5%, $45,200, $128,900, $89,400) | Margin, cash, receivables, payables | Literals (124-148) | None | None | ❌ Fabricated; receivables and payables do not exist in the data model |
| Notifications, upcoming tasks, recent activity, insights | Operational alerts | Hard-coded arrays (5-17, 158-243) | None | None | ❌ Fabricated |

There are no filters, no scope by user or organisation, and nothing updates. `reportsAPI.getDashboard` exists in `services/api.js` but is never called (F-001).

## 2. Backend analytics that already exist

### 2.1 `GET /api/reports/dashboard` (`report-service`)

| Metric | Business meaning | Source and calculation | Filters / date range | Expected vs actual (runtime) | Edge cases | Status |
|---|---|---|---|---|---|---|
| `kpis.totalOrders` | Orders taken | `COUNT(*) FROM Orders` | None: includes cancelled, all time | 7 = 7 (RT-043) | Cancelled orders counted | ⚠️ Correct count; definition should exclude cancelled |
| `kpis.revenue` | Revenue | `SUM(Amount) FROM FinanceTransactions WHERE Type='income'` | All time | 15000 = 15000 (RT-042) | Not linked to orders: an order without a manual income entry adds nothing; no refunds or credit notes | ✅ Reconciles; ⚠️ "revenue" is really "recorded income" |
| `kpis.activeProduction` | Production orders in progress | `COUNT(*) FROM ProductionOrders WHERE Status NOT IN ('Completed','Cancelled')` | None | 3 = 3 (RT-044) | Status never changes automatically (RT-045), so finished orders stay active | ⚠️ Count correct, input data stale |
| `kpis.inventoryItems` | Number of stock items | `COUNT(*) FROM InventoryItems` | None | Not separately checked | — | Implemented, not tested |
| `charts.monthlyRevenue` (+labels) | Income per month, last 4 months | Calendar months from `date_trunc('month', CURRENT_DATE)`; LEFT JOIN income by `TxnDate` | UTC calendar | 4 labels, oldest first (RT-048) | Months are UTC; entries made 00:00–05:30 IST on the 1st land in the previous month (F-052) | ⚠️ |
| `charts.orderStatus` | Pending / in progress / completed | `SUM(CASE Status …)` over Orders | None | Not separately checked | "confirmed" and "cancelled" are not shown at all | ⚠️ Incomplete breakdown |
| `recentActivity` (10) | Latest events | UNION of new orders, production records and low-stock items, ordered by timestamp | Last 10 | Correct ordering observed | Low-stock "events" use the item's creation time, not the moment stock fell | ⚠️ |

### 2.2 `GET /api/reports/reports/sales`

| Metric | Calculation | Runtime | Status |
|---|---|---|---|
| `totalSales` | `SUM(TotalAmount) FROM Orders`, all statuses | Cancelled order still counted (RT-046) | ❌ Overstated (F-020) |
| `monthlyGrowth` | Income this month vs last month, as % | Not separately checked; returns `null` when last month = 0 (honest) | ⚠️ Mixes "sales" (orders) with "income" (finance) in one report |
| `topProducts` | `ProductionOrders.TotalQuantity × vw_StyleTotalCost.TotalMaterialCost` per style | "Denim Jeans Regular 59,500" (RT-047) | ❌ Not sales: production volume × material cost (F-020) |

### 2.3 `GET /api/reports/reports/production`

| Metric | Calculation | Runtime | Status |
|---|---|---|---|
| `efficiency` | `SUM(CompletedPieces)×100 / SUM(TargetPieces)` as `DECIMAL(5,2)` | **HTTP 500** after one over-recorded task (RT-034) | ❌ Crashes on > 999.99%; over-production inflates it (F-011, F-012) |
| `completedOrders` | Production orders with Status 'Completed' | Always 0 in practice (status never set, RT-045) | ❌ |
| `avgProductionTime` | Average task duration in minutes | `StartTime` and `EndTime` are never written by any endpoint | ❌ Always null |
| `qualityScore` | Approved ÷ inspected, as % | Unvalidated inspection totals allowed (RT-033) | ⚠️ |

### 2.4 Module stats endpoints

| Endpoint | Metrics | Definition issues | Status |
|---|---|---|---|
| `GET /inventory/inventory/stats` | totalItems, inStock, lowStock, outOfStock | Derived in `vw_InventoryStatus`: `<=0` → out, `<= ReorderLevel` → low, else in. Categories are mutually exclusive (correct). Negative quantities are accepted and appear as "out of stock". | ✅ Verified with reference data (RT-013) |
| `GET /orders/orders/stats` | total, pending, inProduction, completed | "confirmed" and "cancelled" are missing from the breakdown, so the parts don't sum to the total | ⚠️ |
| `GET /clients/clients/stats` | total, active, inactive, byType | byType hard-codes three types; supplier or other types are not shown | ⚠️ |
| `GET /finance/finance/summary` | totalIncome, totalExpenses, netProfit, transactionCount | All-time, no date filter; no tax or currency handling | ⚠️ |
| `GET /payroll/stats` | totalEmployees, activeEmployees, totalPayroll, pendingPayrolls, totalCTC | totalEmployees includes inactive; pendingPayrolls = processed in last month; totalCTC = BaseSalary × 12, ignoring the CTC column; totalPayroll = all months ever | ❌ Mislabelled (F-035) |
| `GET /attendance/attendance/stats?date` | present, absent, half-day, leave, late, marked, unmarked, hours | Per IST day (derived in the app). "present" excludes "late", so present + late = arrived. | ✅ Verified earlier; definitions sound |
| `GET /production/planning/summary` | machine status, today's target and completed, quality today, active orders | "Today" = UTC day (F-052) | ⚠️ |
| `GET /production/quality/dashboard` | today's batches, inspected, approved, rejected, rejection by style, pending queue | UTC day; `hours_pending` counts hour boundaries | ⚠️ |
| `GET /costing/dashboard` | total styles, materials, average, max and min style cost | Average includes styles with zero cost; min excludes zero (asymmetric) | ⚠️ |

## 3. Reference inventory scenario

Loaded through the API exactly as specified. The reorder levels are ours (the prompt gave none), chosen so that thread is low and buttons are out.

| Item | Qty | Unit price | Reorder level | Expected status | API status |
|---|---:|---:|---:|---|---|
| Cotton Fabric | 5000 | 8.50 | 1000 | In Stock | in-stock |
| Denim Fabric | 2500 | 12.00 | 500 | In Stock | in-stock |
| Polyester Thread | 150 | 2.50 | 200 | Low Stock | low-stock |
| Metal Buttons | 0 | 0.15 | 100 | Out of Stock | out-of-stock |
| Finished T-Shirts | 850 | 15.00 | 100 | In Stock | in-stock |

| Check | Expected | Actual | Result |
|---|---|---|---|
| Status counts | 3 / 1 / 1 | 3 / 1 / 1 | ✅ RT-013 |
| Total value | 85,625 | Unit price is silently discarded on save; no value field exists | ❌ RT-014: valuation unsupported |
| Low-stock threshold | per item (configured) | `<= ReorderLevel`, per item | ✅ |
| Negative quantity | rejected | accepted and shown as out-of-stock | ❌ RT-015 |

The **Inventory screen** cannot be used for this scenario: it shows its own hard-coded items, and its "Low Stock" card also counts out-of-stock items.

## 4. Answers to the validation questions

| Question | Answer | Evidence |
|---|---|---|
| Is total revenue calculated correctly? | Correct as a *sum of recorded income*; there is no revenue from orders or invoices. The dashboard screen shows a fabricated figure. | RT-042; F-001, F-013 |
| Are cancelled or refunded transactions excluded? | No. Cancelled orders are counted in total sales and order totals; refunds don't exist. | RT-046 |
| Are stock values based on a consistent valuation method? | There is no stock valuation at all. | RT-014 |
| Does low-stock follow configured thresholds? | Yes, per item `ReorderLevel` (backend). The UI screen double-counts. | RT-013 |
| Do category totals match item totals? | Status categories are mutually exclusive and sum to the total (backend). The order-status breakdown does not sum. | §2.4 |
| Are dashboard charts consistent with reports? | The dashboard UI is fabricated, so no. Backend dashboard and reports share sources but use different definitions of "sales". | §1, §2.2 |
| Does date filtering change every metric? | No date filters exist on any dashboard or report. | Code review |
| Are inactive, deleted or duplicate records handled? | Payroll counts inactive employees in totals; duplicate orders from double submit are counted twice (RT-022). | F-034, F-035 |
| Currencies, taxes, discounts, units? | No currency or tax in the data model; `$` shown in the UI for an INR business. | F-017, F-032 |
| Scoped to organisation and permissions? | Single organisation. Report endpoints require the `reports` permission at the gateway, but the page-builder data sources expose raw rows to everyone (F-003). | RT-065 |
| Do summary cards reconcile with backend records? | Backend: yes for orders, revenue, active production and inventory status. UI: no. | RT-042..044 |

## 5. Decision analytics: present vs missing

| Analytic | Today | Required data | Formula | Depends on | Business value |
|---|---|---|---|---|---|
| Revenue & profitability trend | Income-only monthly series | Invoices, COGS, expenses by month | Gross margin = (Revenue − COGS) ÷ Revenue | F-013, F-014, F-017 | High |
| Inventory turnover | Not computable | Item cost, COGS, opening and closing stock value | COGS ÷ ((Opening + Closing) ÷ 2) | F-015 | High |
| Stock ageing | Missing | Receipt date per lot | Quantity by age bucket (0–30, 31–60, …) | F-015 stock ledger | Medium |
| Procurement performance | Missing | PO date, promised and received dates | On-time % = POs received by promised date ÷ POs | F-016 | Medium |
| Supplier performance | Missing | Receipts, rejects and prices per supplier | Reject rate, price variance, lead time | F-016 | Medium |
| Order fulfilment | Missing | Order lines, dispatch dates | OTIF = lines delivered on time and in full ÷ lines | F-013, F-028 | High |
| Production efficiency | Exists but crashes on outliers | Tasks (target, completed) | Completed ÷ Target, capped and outlier-flagged | F-011, F-012 | High |
| Operational costs | Flat expenses list | Categorised expenses + payroll postings | Cost per piece = (material + labour + overhead) ÷ pieces | F-014, F-017, F-018 | High |
| Receivables & payables ageing | Missing | Invoices, bills, payments | Outstanding by due-date bucket | F-017, F-028 | High |
| Employee productivity | Partial (employee-performance endpoint; 500 on outliers) | Tasks per employee, attendance | Pieces per present hour | F-012, F-018 | Medium |
| Forecasting | Missing | 12+ months of history | Moving average or seasonal forecast of demand and material needs | All of the above | Medium |

## 6. Recommended corrections, in order

1. Render the backend dashboard on the Dashboard screen and delete the literals (F-001).
2. Exclude cancelled orders; relabel "revenue" as "income received" until invoicing exists; fix payroll KPI definitions (F-020, F-035).
3. Widen the percentage columns and cap or flag outliers so one bad entry cannot take reports down (F-011, F-012).
4. Use the IST business date for "today" and for months (F-052).
5. Add date-range filters (from/to) to every report endpoint and pass them from one dashboard filter bar.
6. Add item cost and a stock ledger, then turnover and ageing (F-015).
