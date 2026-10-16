# 05 — Story-Based End-to-End Testing

*For QA, product and implementation consultants.* The fictional company is **"Saffron Threads Pvt Ltd"**, a garment manufacturer with 40 staff, one factory and B2B customers. All names, e-mail addresses and data are fictional; runtime steps used the reserved `audit.example` domain.

**Legend:**
- ✅ **Supported, verified at runtime:** observed working in the isolated environment.
- ⚠️ **Partially supported:** works only behind the scenes, only in a browser demo, or with defects.
- ❌ **Not supported:** missing, or verified failing.
- 🔍 **Unverified:** static reading only.

Each step names the screen (UI), the API and the table involved where they exist. Workflows that were only proposed are **not** treated as features.

---

## Story A — New company setup

| # | Step | Status | How / where | Evidence |
|---|---|---|---|---|
| A1 | Install database | ✅ | `node setup-database.js` creates 24 tables, 11 views and 9 functions in one transaction | Ran repeatedly in the isolated environment |
| A2 | Create the admin account | ✅ | Sign up screen → `POST /api/auth/signup`; first account becomes Admin | RT-001 |
| A3 | Prevent later self-promotion to Admin | ✅ | Role in the request is ignored | RT-002 |
| A4 | Create employees as users with permissions | ✅ | User Management → `POST /api/auth/users` → `Users`, `UserPermissions` | RT-003, RT-004 |
| A5 | Create the employee register | ✅ | Payroll → Add employee → `sp_CreateEmployee` (code EMP001, CTC = 12 × base) | RT-005 |
| A6 | Configure departments | ❌ | Free-text field on employees; no department master | RT-011 |
| A7 | Configure warehouses | ❌ | No feature | RT-006 |
| A8 | Tax (GST) and currency settings | ❌ | No feature; UI hard-codes `$` | RT-007, F-032 |
| A9 | Create suppliers | ⚠️ | Only as a "client" with free-text type via the API; the UI Add Vendor button does nothing | RT-012 |
| A10 | Create customers | ⚠️ | API works (`POST /api/clients/clients`); the UI Add Client button does nothing | Smoke test; Clients.js:64 |
| A11 | Import opening stock | ❌ | No import; items must be added one by one through the API (the UI does not save) | RT-010 |
| A12 | Dashboard initialises with company data | ❌ | Dashboard shows the same fabricated figures before any data exists | F-001 |

**Outcome:** users, permissions and employees can be set up without a developer. Master data for suppliers, customers, items, warehouses and tax cannot be set up from the UI.

## Story B — Purchase to inventory

*The purchase manager sees that polyester thread is low and orders 2,000 spools.*

| # | Step | Status | How / where | Evidence |
|---|---|---|---|---|
| B1 | Identify low stock | ⚠️ | Backend status correct (`vw_InventoryStatus`); the Inventory screen shows sample items | RT-013; F-002 |
| B2 | Purchase request | ❌ | No feature | — |
| B3 | Purchase order | ⚠️ | Stock Check tab → "Generate Purchase Order" saves to *this browser only*; quantity = 2 × min − current; price fixed at "$10" | StockChecker.js:33-49; PurchaseOrders.js:34-36; RT-008 |
| B4 | Approval workflow | ⚠️ | Approve/Reject in the browser; no approver, time or limits recorded | PurchaseOrders.js:13-32 |
| B5 | Supplier selection | ❌ | No supplier on the PO | — |
| B6 | Goods receipt | ⚠️ | Goods Receiving tab updates a browser-only stock list | GoodsReceiving.js:21-54 |
| B7 | Partial delivery | ❌ | Partial receipt marks the PO "Received" | GoodsReceiving.js:41 |
| B8 | Rejected or damaged items | ❌ | Entering 0 records the full quantity; negatives reduce stock | GoodsReceiving.js:27 |
| B9 | Inventory updated | ❌ | The real inventory (`InventoryItems`) is never touched | Code trace |
| B10 | Purchase invoice | ❌ | No feature | — |
| B11 | Payment status | ❌ | No payables | F-017 |
| B12 | Dashboard reconciliation | ❌ | Dashboard is fabricated | F-001 |

**Outcome:** procurement cannot be run in the ERP. External tools are needed for purchase orders, receipts and supplier bills.

## Story C — Sales to payment

*A retail customer orders 1,000 T-shirts at ₹50.*

| # | Step | Status | How / where | Evidence |
|---|---|---|---|---|
| C1 | Customer registration | ⚠️ | API only (UI button dead) | Smoke test |
| C2 | Quotation | ❌ | No feature | RT-023 |
| C3 | Sales order | ⚠️ | API `POST /api/orders/orders` stores header only (client name, dates, total); the Orders screen saves to memory | RT-016; Orders.js:94-130 |
| C4 | Order validation | ❌ | Negative total, past delivery date and unknown status accepted | RT-019..021 |
| C5 | Duplicate protection | ❌ | Double submit → 2 orders | RT-022 |
| C6 | Stock availability / reservation | ❌ | No order lines; stock unchanged | RT-017 |
| C7 | Production order from sales order | ❌ | `ProductionOrders` unrelated to `Orders` | Schema |
| C8 | Invoice | ❌ | Invoice tool: wrong GST maths, duplicate numbers, browser-only | F-007 |
| C9 | Payment | ❌ | Finance not linked; income unchanged after the order | RT-018 |
| C10 | Shipment | ❌ | No feature | — |
| C11 | Return / cancellation | ⚠️ | Status can be set to "cancelled"; nothing else changes | RT-046 |
| C12 | Refund | ❌ | No feature | — |
| C13 | Revenue reporting | ❌ | Total sales still includes the cancelled order | RT-046 |

**Outcome:** only the order header can be recorded (via the API). Order-to-cash cannot be completed.

## Story D — Manufacturing

*Produce the 1,000 T-shirts (production order ORD001).*

| # | Step | Status | How / where | Evidence |
|---|---|---|---|---|
| D1 | Production order | ⚠️ | Seeded rows only; no API to create a production order | Schema seed; endpoint list |
| D2 | Bill of materials | ⚠️ | Style costing holds materials per style (BOM-like) but is not linked to stock | `StyleCostings` |
| D3 | Raw material availability | ❌ | Material Check tab: hard-coded requirements; always reports shortage (stale-state bug) | MaterialCheck.js:11-34 |
| D4 | Material allocation | ❌ | No feature | — |
| D5 | Allocate machine and operator | ✅ | `POST /api/production/machines/allocate`; refuses an occupied machine, race-safe | RT-024, RT-025 |
| D6 | Production scheduling (daily task) | ✅ | `POST /api/production/tasks/create` | RT-026 |
| D7 | Record work progress | ✅ ⚠️ | `POST /api/production/production/record`; ⚠️ 5,080 pieces accepted on a 120 target; negative accepted | RT-027, RT-028, RT-031 |
| D8 | Quality check | ✅ ⚠️ | Batch enters the queue; claim is exclusive; ⚠️ totals unvalidated | RT-032, RT-033 |
| D9 | Material consumption | ❌ | Inventory unchanged | RT-030 |
| D10 | Finished goods creation | ❌ | Inventory unchanged | RT-030 |
| D11 | Order completion | ❌ | Completed 5,080 of 1,000; status stays Pending | RT-029, RT-045 |
| D12 | Production cost | ⚠️ | Material cost per style exists (costing); no labour or overhead, no actuals | Costing smoke test |
| D13 | Do this from the screens | ❌ | Planning, worker and quality dashboards cannot connect (no token) | F-009 |

**Outcome:** the production engine supports allocation, tasks, recording and quality, but only through the API. Materials and finished goods are not reconciled, and operators cannot use it from the UI.

## Story E — HR and payroll

| # | Step | Status | How / where | Evidence |
|---|---|---|---|---|
| E1 | Onboarding (employee record) | ✅ | Payroll → Add employee | RT-005 |
| E2 | Department assignment | ⚠️ | Free text | — |
| E3 | Attendance | ✅ | Attendance screen: check-in/out, late after 10:30, mark absent or leave; one record per day even with simultaneous clicks | RT-035, RT-036 |
| E4 | Leave request and approval | ❌ | Only a "leave" status; no requests or balances | — |
| E5 | Salary calculation | ⚠️ | Auto-generate copies base salary per active employee | RT-037 |
| E6 | Attendance-based pay | ❌ | Absence ignored | RT-038 |
| E7 | Deductions | ⚠️ | Manual allowance and deduction fields; negative deduction inflates pay | RT-040 |
| E8 | Statutory (PF/ESI/PT/TDS) | ❌ | No feature | — |
| E9 | Payroll approval | ❌ | No status column | F-005 |
| E10 | Mark paid | ❌ | Zeroes allowances and deductions; stays pending | RT-066 |
| E11 | Payslip | ❌ | No feature | — |
| E12 | Employee update | ❌ | Partial update → 500; UI edit erases the joining date | RT-041, F-019 |
| E13 | Employee exit | ⚠️ | `IsActive=false` via edit; no exit date, settlement or access revocation (user accounts are separate) | Schema |
| E14 | Validation | ❌ | Month "banana" accepted | RT-039 |

## Story F — Management decision making

*The director opens the ERP on Monday morning.*

| Question | Can it be answered reliably? | Why |
|---|---|---|
| Current inventory value | ❌ | No cost data (RT-014); dashboard figure fabricated |
| Low-stock items | ⚠️ | Correct in the backend (RT-013); not shown on the dashboard; no alert |
| Pending purchase orders | ❌ | Exist only in one browser |
| Outstanding customer payments | ❌ | No receivables |
| Sales performance | ❌ | Dashboard fabricated; backend sales includes cancellations (RT-046) |
| Production delays | ⚠️ | Backend has deadline and days remaining (`vw_ProductionOverview`); planning dashboard cannot connect; statuses never close |
| Financial exposure | ❌ | No payables, receivables or bank |
| Operational bottlenecks | ⚠️ | Machine status and employee performance exist in the backend; the performance endpoint crashes after an outlier (RT-034 class) |

## Story G — Failure and recovery

| # | Scenario | Result | Evidence |
|---|---|---|---|
| G1 | Network interruption / API timeout | 🔍 axios timeout 15 s; Attendance and builder screens show errors; most screens make no calls. The gateway has no proxy timeout. | `services/api.js`; F-036 |
| G2 | Duplicate form submission | ❌ Two orders created | RT-022 |
| G3 | Browser refresh during saving | 🔍 For API-backed screens the request completes server-side; for mock screens all unsaved data is lost by design | F-002 |
| G4 | Unauthorised user access | ✅ Gateway: no token → 401; wrong area → 403 (RT-049, RT-050). ❌ Service ports and page-builder data sources bypass permissions (RT-052, RT-065) | — |
| G5 | Invalid data entry | ❌ Negative, out-of-range and nonsense values accepted across modules | RT-015, 019-021, 031, 039, 040 |
| G6 | Partial database operation | ✅ Quality completion, signup bootstrap and schema setup are transactional. ⚠️ Permission save and `/quality/inspect` are not. | Code; RT-025 |
| G7 | Concurrent inventory updates | 🔍 `PUT /inventory/:id` sets an absolute quantity, so two clerks adjusting stock overwrite each other (lost update). No stock-movement model exists. | inventory-service; F-015 |
| G8 | Concurrent machine allocation / check-in | ✅ Exactly one wins | RT-025, RT-036 |
| G9 | Concurrent employee creation | ❌ 3 of 4 fail with 500 (duplicate code) | Runtime extra check |
| G10 | Failed external integration | Not applicable: there are no integrations | — |
| G11 | Expired session | ✅ 401 (RT-053); the UI clears the session and reloads. ❌ A deactivated user's live session keeps working (RT-056). | — |
| G12 | Downstream service unavailable | 🔍 The gateway returns 500 with the raw proxy error text instead of a 503 | gateway/server.js:107-111 |
| G13 | Brute-force login | ❌ No throttling after 25 attempts | RT-058 |
| G14 | Oversized / malformed requests | ✅ 413 / 400 (RT-059, RT-060). ❌ Over-length field → 500 (RT-061) | — |

## Story coverage summary

| Story | Steps | ✅ | ⚠️ | ❌ | 🔍 |
|---|---:|---:|---:|---:|---:|
| A Setup | 12 | 5 | 2 | 5 | 0 |
| B Purchase → inventory | 12 | 0 | 4 | 8 | 0 |
| C Sales → payment | 13 | 0 | 3 | 10 | 0 |
| D Manufacturing | 13 | 4 (2 with defects) | 3 | 6 | 0 |
| E HR & payroll | 14 | 2 | 4 | 8 | 0 |
| G Failure & recovery | 14 | 5 (each with a failing exception) | — | 4 | 4 (+1 not applicable) |

D7 and D8 are counted as ✅ with defects. In story G, G4, G11 and G14 pass their main case but each has a failing sub-case, which is described in the row.
