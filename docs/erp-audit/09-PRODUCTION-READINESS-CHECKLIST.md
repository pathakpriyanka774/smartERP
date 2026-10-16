# 09 — Production Readiness Checklist

*For release managers, leadership and security / compliance (Kavach360: ISO 27001, SOC 2 Type I, DPDP Act).*

## Decision

**NOT READY for production use with real customers.**

Eight P0 blockers are open. Four of them corrupt or expose data:
- payroll amounts changed by "Mark Paid";
- invalid financial and stock values accepted;
- salary and attendance data readable through two permission bypasses;
- third-party identifiers embedded in source code.

In addition, the user interface for most business modules does not save data, and the dashboard is fabricated.

No numeric readiness score is given. A weighted score would hide the fact that one failed gate (for example, data exposure) is enough to block release on its own. The gate tally below is the transparent alternative.

| Result | Gates |
|---|---:|
| Pass | 10 |
| Fail | 34 |
| Not Verified | 6 |
| Not Applicable | 2 |
| **Total** | **52** |

## Release gates

| # | Area | Gate | Result | Evidence |
|---|---|---|---|---|
| 1 | Functionality | Every menu screen reads and writes real data | **Fail** | F-002, F-009 |
| 2 | Functionality | Dashboard shows real, reconciled figures | **Fail** | F-001 |
| 3 | Functionality | Order-to-cash can be completed | **Fail** | Story C |
| 4 | Functionality | Procure-to-pay can be completed | **Fail** | Story B |
| 5 | Functionality | Production with material consumption can be completed | **Fail** | Story D, RT-030 |
| 6 | Functionality | Payroll can be computed and paid correctly | **Fail** | RT-038, RT-066 |
| 7 | Functionality | Attendance recording | **Pass** | RT-035, RT-036 |
| 8 | Functionality | User and permission administration | **Pass** (with security gates below failing) | RT-003, RT-004 |
| 9 | Financial correctness | Invoices compute GST correctly with unique numbers | **Fail** | F-007 |
| 10 | Financial correctness | Totals exclude cancelled documents | **Fail** | RT-046 |
| 11 | Financial correctness | Negative or invalid amounts rejected | **Fail** | RT-020, RT-040 |
| 12 | Inventory consistency | Stock changes only through traceable movements | **Fail** | F-015 |
| 13 | Inventory consistency | Negative stock prevented | **Fail** | RT-015 |
| 14 | Inventory consistency | Stock valuation available | **Fail** | RT-014 |
| 15 | Security | Authentication rejects expired, forged and unsigned tokens | **Pass** | RT-053..055 |
| 16 | Security | Area permissions enforced on every path | **Fail** | RT-052, RT-065 |
| 17 | Security | Deactivation revokes access immediately | **Fail** | RT-056 |
| 18 | Security | Login brute-force protection | **Fail** | RT-058 |
| 19 | Security | SQL injection defences | **Pass** | RT-062; code review |
| 20 | Security | XSS defences | **Pass** (React escaping, no raw HTML) / Not Verified (CSP absent) | RT-064; F-037 |
| 21 | Security | CORS restricted; security headers | **Fail** | F-037 |
| 22 | Security | Secrets not in the repository | **Pass** | `.env` git-ignored; `.env.example` placeholders only |
| 23 | Privacy (DPDP) | No third-party or real personal data in source | **Fail** | F-008 |
| 24 | Privacy (DPDP) | No personal data in logs | **Fail** | F-038 |
| 25 | Privacy (DPDP) | Personal-data access limited to authorised roles | **Fail** | F-003, F-004 |
| 26 | Cross-organisation exposure | Tenant isolation | **N/A** | Single-organisation product (F-050) |
| 27 | Database integrity | Business CHECK / UNIQUE constraints | **Fail** | F-040 |
| 28 | Database integrity | Transactions on multi-step writes | **Pass** for key flows / Fail for permission save | Code; RT-025 |
| 29 | Database integrity | Concurrency safety | **Fail** (employee codes, double submit); Pass for allocation and check-in | RT-022, RT-025, RT-036 |
| 30 | Database | Versioned, non-destructive migrations | **Fail** | F-024 |
| 31 | Backups | Automated backup with tested restore | **Fail** | F-025 |
| 32 | Disaster recovery | Documented RPO/RTO and recovery runbook | **Fail** | — |
| 33 | Performance | Lists paginated; queries indexed | **Fail** | F-039, F-040 |
| 34 | Performance | Load test at expected concurrency | **Not Verified** | TC-PERF-01..04 not executed |
| 35 | Scalability | Stateless services | **Pass** | JWT; no session state |
| 36 | Error handling | Consistent status codes; no internal details leaked | **Fail** | F-036 |
| 37 | Error handling | Reports survive outlier data | **Fail** | RT-034 |
| 38 | Monitoring | Health checks | **Pass** (per service `/health`) | Service code |
| 39 | Monitoring | Metrics, alerting, uptime monitoring | **Fail** | F-046 |
| 40 | Logging | Structured logs with request IDs | **Fail** | F-046 |
| 41 | Audit | Who-changed-what audit trail | **Fail** | F-027 |
| 42 | Deployment | Repeatable deployment (container or process manager, TLS) | **Fail** | F-046 |
| 43 | Environment configuration | All settings via environment; documented | **Pass** | `.env.example` |
| 44 | CI/CD | Automated build and test on every change | **Fail** | F-026 |
| 45 | Automated testing | Backend integration tests | **Fail** (none in repo; the audit harness exists in `evidence/`) | F-026 |
| 46 | Automated testing | Frontend tests pass | **Fail** (`App.test.js` fails) | F-026 |
| 47 | Manual QA | Test suite executed with sign-off | **Not Verified** (81 of 127 executed; UI cases not run) | 06-Test cases |
| 48 | Documentation | Setup and architecture docs | **Not Verified** (READMEs updated, not reviewed by an operator) | READMEs |
| 49 | User onboarding | Help, training or first-run guide | **Not Verified** (none found in code) | 07-UI-UX |
| 50 | Support & maintenance | Support process, issue tracker, SLAs | **Not Verified** | Outside the repository |
| 51 | Third-party integrations | External services resilient to failure | **N/A** (none) | — |
| 52 | Data migration | SQL Server → PostgreSQL copy verified | **Not Verified** (no source credentials) | `migrate-from-mssql.js` |

Gates 20, 28 and 29 have mixed outcomes and are counted once, by the first result shown: 20 and 28 as Pass, 29 as Fail. Not Verified: gates 34, 47, 48, 49, 50 and 52.

## Launch blockers (must be fixed)

| ID | Blocker |
|---|---|
| F-001 | Dashboard fabricated |
| F-002 | Core screens don't save |
| F-003 | Data exposure through page-builder data sources |
| F-004 | Permission bypass through service ports |
| F-005 | Mark Paid corrupts payroll |
| F-006 | No validation of business values |
| F-007 | Non-compliant invoices |
| F-008 | Third-party identifiers in source |

Also required for **any** go-live with real data, even a pilot:
- F-024 migrations (so the database cannot be wiped);
- F-025 backups;
- F-022 access revocation and rate limiting;
- F-019 employee data loss;
- F-012 report crashes.

## Post-launch improvements (can follow a controlled pilot)

These are the P2/P3 findings in the backlog: UI/UX consistency, pagination, indexes, notifications, export, multi-company, and dead-code removal.

## Key risk statements

| Risk | Likelihood (today) | Impact | Mitigation |
|---|---|---|---|
| Wrong salaries paid (Mark Paid, negative deductions, attendance ignored) | High once used | High: financial and employee relations | F-005, F-006, F-018 |
| Inventory figures inconsistent with reality (no movements, negatives, no consumption) | Certain | High | F-014, F-015, F-006 |
| Non-compliant GST invoices issued | High if the invoice tool is used | High: tax penalties | F-007; block use until fixed |
| Personal data exposure to unauthorised staff | Medium (needs a technically curious user) | High: DPDP Act | F-003, F-004 |
| Total data loss (setup re-run, disk failure) | Medium | Critical | F-024, F-025 |
| Management decisions based on fabricated dashboard | Certain if the dashboard is used | High | F-001 |
