# SmartERP — Application Audit, QA & Production Readiness

**Audited:** 2026-10-09 · **Revision:** git `437eb36` (initial commit) **plus 59 uncommitted working-tree changes**. The working tree was audited as found; commit it before acting on line numbers.
> **Update 2026-10-10:** the top 10 tasks and the backlog items F-007, F-016, F-017, F-018, F-022, F-027, F-028 and F-039 have been implemented and verified — see [12-REMEDIATION-STATUS.md](12-REMEDIATION-STATUS.md). The reports below describe the system as audited, before those changes.

**Verdict at audit time:** **Not ready for production.** A promising foundation: attendance, user and access management, the page, form and chart builders, and a largely working backend for orders, stock, production, quality and costing. But most business screens don't save, the dashboard is fabricated, and there are eight P0 blockers, including data exposure and payroll corruption.

## Reports

| # | File | Audience | What it answers |
|---|---|---|---|
| 01 | [Executive business report](01-EXECUTIVE-BUSINESS-REPORT.md) | Owners, directors | What the ERP can really do today, in plain language, with scenarios |
| 02 | [Module functionality inventory](02-MODULE-FUNCTIONALITY-INVENTORY.md) | Everyone | 27 modules: status, evidence, layers; 13 missing capabilities; coverage checklist |
| 03 | [Technical architecture audit](03-TECHNICAL-ARCHITECTURE-AUDIT.md) | Developers, architects | Stack, frontend, backend, database, scalability, detailed P0/P1 findings |
| 04 | [Dashboard & analytics validation](04-DASHBOARD-ANALYTICS-VALIDATION.md) | Product, finance, QA | Every KPI's source, formula and accuracy; reference inventory scenario; missing analytics |
| 05 | [Story-based E2E testing](05-STORY-BASED-E2E-TESTING.md) | QA, consultants | Stories A–G for a fictional garment manufacturer, step by step |
| 06 | [Manual & regression test cases](06-MANUAL-REGRESSION-TEST-CASES.md) · [CSV](test-cases.csv) | QA testers | 127 test cases (81 executed, 46 designed) |
| 07 | [UI/UX improvement report](07-UI-UX-IMPROVEMENT-REPORT.md) | Product, design | Persona journeys, checklist, duplicated screens, quick wins |
| 08 | [ERP market gap analysis](08-ERP-MARKET-GAP-ANALYSIS.md) | Product, leadership | Comparison with established ERPs (general knowledge, not verified research); suitability by segment |
| 09 | [Production readiness checklist](09-PRODUCTION-READINESS-CHECKLIST.md) | Release, security / compliance | 52 release gates, blockers, risks |
| 10 | [Prioritised development roadmap](10-PRIORITIZED-DEVELOPMENT-ROADMAP.md) · [CSV](issue-backlog.csv) | Engineering leads | 52 findings (P0 8 · P1 20 · P2 21 · P3 3); 5-stage plan |
| 11 | [Traceability matrix](11-TRACEABILITY-MATRIX.md) | QA, developers | 37 requirements traced UI → API → service → DB → tests → findings |
| 12 | [Remediation status](12-REMEDIATION-STATUS.md) | Engineering, QA, release | What the top-10 tasks changed, how each was verified, and what is still open |
| — | [evidence/](evidence/) | Developers, QA | `runtime-audit.js` (reproducible harness) and `runtime-results.json` (68 checks) |

## How the audit was done

1. **Static analysis.** Every frontend screen, the API client, the gateway, all 11 services, shared libraries and the PostgreSQL schema were read and traced (three parallel read-only reviews plus our own). All 80 API client methods were mapped to their routes.
2. **Runtime verification, isolated.** This used a throwaway PostgreSQL 16 instance and copies of all services on spare ports, with a gateway copy that could only reach those ports. The real `smarterp` database, `.env`, running services and data were **never touched**. All data was fictional (the `.example` domain). There were 68 scripted checks: 40 pass, 28 fail. The environment was shut down afterwards.
3. **Existing tests** were run: the frontend jest suite (the placeholder `App.test.js` fails; `PageRenderer.test.js` passes 5/5). The backend has no tests.
4. **Statuses distinguish** verified at runtime, static only, and not executed. No result was assumed.

**Limitations:**
- The UI was not driven in a browser.
- There was no load testing.
- The SQL Server → PostgreSQL data copy was not verified (no source credentials).
- The competitor comparison is general knowledge.
- Some evidence comes from earlier work in this engagement on the same isolated setup (101-endpoint smoke test, chart, embed and signup tests); it is labelled as such where used.

## Critical findings

| ID | Finding | Verified |
|---|---|---|
| F-001 | Dashboard KPIs are hard-coded literals | Static (backend KPIs reconcile: Runtime) |
| F-002 | Orders, Inventory, Expenses, Clients, Production and Reports screens never call the backend; nothing is saved | Static |
| F-003 | Any logged-in user reads employee and attendance rows through page-builder data sources | **Runtime** |
| F-004 | Service ports authorise nothing: any valid token reads payroll directly | **Runtime** |
| F-005 | Payroll "Mark Paid" zeroes allowances and deductions; no paid status | **Runtime** |
| F-006 | Negative stock, negative amounts and deductions, invalid statuses and months accepted | **Runtime** |
| F-007 | Invoice GST arithmetic wrong; duplicate numbers; invoices not stored | Static |
| F-008 | Real-looking third-party GSTIN, bank and contact details hard-coded in source (not reproduced in these reports) | Static |
| F-022 | Deactivated users keep access for 24 h; no login throttling; logout leaves the token | **Runtime** |
| F-024 / F-025 | Re-running setup wipes data; no backups | Static |

## Recommended next actions

1. **This week:** close F-003 and F-004 (per-service and per-data-source authorisation; bind service ports to localhost). Fix F-005 and F-019 (payroll corruption). Replace the F-008 identifiers.
2. **Before any pilot:** server-side validation and constraints (F-006), migrations with a guard (F-024), nightly backups with a restore test (F-025), access revocation and rate limiting (F-022).
3. **Then:** connect the existing screens to the existing APIs (F-001, F-002, F-009). This is the largest value-per-effort step, because the backend is already there.
4. **Make it a product:** follow Stages 2–5 in the [roadmap](10-PRIORITIZED-DEVELOPMENT-ROADMAP.md).

## Data-protection note

These reports contain no credentials, secrets or real personal data. Identifiers found in the source code (GSTIN, bank account, phone, e-mail) are cited only by file and line, never by value. Runtime evidence uses fictional names on the reserved `audit.example` domain.
