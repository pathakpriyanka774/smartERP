# 07 — UI/UX & User Journey Audit

*For product, design and business stakeholders.*

**Method and limits.** Findings come from reading every screen's code (layout, handlers, labels, states), plus behaviour observed through the APIs. The UI was **not** driven in a browser during this audit, so visual polish, responsiveness at real breakpoints and screen-reader behaviour are marked *not verified*. The Create Charts screens were rendered and inspected earlier in this engagement.

## 1. The biggest UX problem: screens that look finished but aren't

A new employee cannot tell which screens are real. Orders, Inventory, Production, Expenses, Clients, Reports and the Dashboard look complete and accept input, but nothing is kept (F-002). Several settings screens (Roles, Permissions, API Manager, Form Rules, Workflows) look like controls but change nothing (F-030).

That breaks user trust. It also produces wrong business decisions: a manager "adds" a stock item, sees it on the screen, and it is gone tomorrow.

**Fix before anything cosmetic:**
- connect each screen, or remove it;
- until then, label preview screens clearly ("Preview — data is not saved").

## 2. Journeys by persona

| Persona | Main journey | Can they complete it? | Friction observed (code evidence) |
|---|---|---|---|
| Business owner | Open the dashboard; judge the business | ❌ | Figures are fabricated; no date filter; no drill-down (Dashboard.js) |
| Administrator | Create users; give access | ✅ | Good: menu checkboxes per user. Confusing: separate Roles and Permissions screens do nothing, and permission names there (`orders_create`) differ from the real ones (F-030) |
| Inventory manager | Add stock; see low stock; reorder | ❌ | Two inventories on one screen (All Inventory list vs Stock Check tab) with different items; Low Stock card double-counts; PO prices fixed at "$10"; receiving 0 receives everything (F-002, F-016) |
| Sales employee | Enter an order; invoice it | ❌ | Order lost on refresh; crash after edit; no product lines; invoice dropdown shows sample orders, not mine (F-002, F-023, F-007) |
| Finance employee | Record expenses; view budgets | ❌ | "+ Add Transaction" and "+ Set Budget" do nothing; budgets don't match transactions (F-002) |
| HR employee | Onboard; attendance; payroll | ⚠️ | Attendance is clear, with loading and error states. Payroll: month typed into a browser `prompt()` with no format help; "Mark Paid" silently changes amounts; save errors invisible (only in the console); joining date shown as "N/A" (F-005, F-019) |
| Production planner | Allocate machines; follow orders | ❌ | Planning dashboard always empty and "allocated successfully" even on failure (F-009, F-010) |
| Machine operator (warehouse / shop floor) | See today's task; record pieces | ❌ | Worker screen always "No Tasks Assigned"; shows "John Doe" for everyone (F-009) |
| Quality inspector | Inspect the queue | ❌ | Queue always "All Caught Up!" (looks like success while failing); report KPIs fixed at 95.2% / 92.8% (F-009) |
| New employee, minimal IT knowledge | Log in and find their work | ⚠️ | A wrong password reloads the page with no message (F-021); no onboarding, help or tooltips; once access is granted, the sidebar shows only permitted menus (good) |

## 3. Checklist results

| Area | Finding | Severity | Improvement | Business justification |
|---|---|---|---|---|
| Navigation clarity | The sidebar is driven by the server and filtered per user (good). Eight extra routes are reachable only by URL (F-029). Two production dashboards and a worker screen are not in the menu. | Medium | Add worker and quality screens to the menu under Production; remove orphan routes | People can find their daily screen without a link from IT |
| Form simplicity | Order and inventory forms are reasonable. Payroll uses `prompt()` for the month. The invoice form mixes order selection, items and template in one long page (707 lines). | Medium | Month picker; split the invoice flow into steps | Fewer mistakes in payroll and invoicing |
| Consistent design | Buttons, notices and cards differ per screen (`.pb-btn`, `.cb-btn`, ad-hoc classes); status badges built with `.replace(' ', '-')` break for multi-word statuses. | Low | Shared button, notice and badge components | Faster learning; less maintenance |
| Currency & locale | `$` everywhere, `en-US` dates on the dashboard; GST layout says "Indian Rupee". | High | Organisation setting (₹, en-IN grouping 12,34,567, DD-MM-YYYY, IST) used by one formatter | Documents and reports must match Indian practice |
| Empty states | Good in Attendance, Create Charts and Custom Page. Misleading in the Quality ("All Caught Up!") and Worker ("No Tasks") screens, which show these on errors. | High | Distinguish "nothing to do" from "could not load", and show a retry | Staff don't assume work is done when the system failed |
| Error messages | Many saves log to the console only (Payroll); the API returns generic "Failed to …" texts; failed login is not shown. | High | Show server messages inline; validation messages per field | Users can fix their own mistakes without calling IT |
| Confirmation messages | Present for chart and page deletes; missing for Workflows delete; Mark Paid has no confirmation | Medium | Confirm destructive or financial actions | Prevents accidental payroll and data changes |
| Search, filter, sort | None on Orders, Inventory, Clients, Payroll lists; Attendance has date and status filters | High | Search box + column filters + sort on every list; server-side once paginated (F-039) | Lists stay usable past a few dozen rows |
| Data tables | No pagination, export or column choice | Medium | Pagination + CSV export | Daily reporting without retyping |
| Keyboard navigation | Sidebar items are clickable `div`s with no `tabIndex` or key handlers; the Create Charts type picker uses buttons with ARIA radio roles (good) | Medium | Use `<button>` or `<a>` for navigation; visible focus styles | Accessibility (WCAG 2.1 AA) and power users |
| Accessibility | Charts have text legends, ARIA labels and a table view (good). Other screens use colour-only status and no form `label`/`for` associations in places. **Not verified** with a screen reader. | Medium | Labels on all inputs; text plus colour for status | Legal and inclusive |
| Mobile responsiveness | Some CSS grids collapse (Create Charts at 1100 px); most screens use fixed-width tables. **Not verified** on devices. | Medium | Responsive tables (cards on small screens) for worker and attendance screens | Shop-floor staff use phones |
| Dashboard readability | Clean layout, but meaningless content | High | Real KPIs with period comparison and a "last updated" time | Trust in the numbers |
| Workflow completion time | Purchase-to-receipt and order-to-invoice need re-typing across tabs, and data doesn't carry over | High | Carry the selected record through each step (order → production → invoice) | Hours saved per week; fewer typos |
| Unnecessary clicks | Template "Use this template" sets a URL hash, then the user must navigate manually (TemplateList.js:95) | Low | Navigate directly | — |
| Onboarding & help | None: no first-run guide, help links or glossary | Medium | First-login checklist (add users → employees → items → clients); inline help on each module | Lower implementation cost per customer |
| Terminology | "Expenses & Finance" holds income too; "Allowances" in the API but "Overtime" in the UI; "Template Builder", "Template List" and "Templates" are three overlapping menus; "Production" vs "Planning Dashboard" | Medium | One glossary; merge the template screens; rename to match what users do | Less confusion and training |

## 4. Duplicated or disconnected screens

| Duplicate set | Recommendation |
|---|---|
| User Management **vs** Roles **vs** Permissions | Keep User Management only (the enforced system). Remove the other two, or rebuild Roles as permission bundles that write to `UserPermissions`. |
| API Manager **vs** the real API catalogue in Menu Manager | Remove API Manager or make it read `GET /apis`. |
| Templates **vs** Template Builder **vs** Template List **vs** the invoice layouts in Invoice Generator | One "Document templates" screen, server-backed, after invoicing is rebuilt (F-007). |
| Production (batches) **vs** Planning Dashboard **vs** the unrouted ProductionPlanning.js | Use the backend production planning as the single source; route the working `ProductionPlanning.js` and `QualityManagement.js` (they already use the API correctly) instead of the broken duplicates. |
| Inventory list **vs** Stock Check tab inventory | One stock list from `inventory-service`. |

## 5. Quick wins (≤ 1 day each)

1. Route `ProductionPlanning.js` and `QualityManagement.js` instead of the broken dashboards (F-009).
2. Fix the failed-login message (F-021) and clear the token on logout (F-022).
3. Replace `$` with an INR formatter (F-032).
4. Show save errors in Payroll; replace `prompt()` with a month picker.
5. Hide or label the Roles, Permissions, API Manager, Form Rules and Workflows screens (F-030).
6. Make empty states say "Could not load — retry" on errors.
