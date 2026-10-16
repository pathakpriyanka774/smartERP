# 08 — ERP Completeness & Market Gap Analysis

*For product management and leadership.*

> **Basis of comparison.** No external research was performed for this audit. Competitor descriptions are **general product knowledge** of the broad capability areas these products are known for (Odoo, ERPNext, SAP Business One, Microsoft Dynamics 365 Business Central, Zoho's business apps). They are **not** a verified, current, feature-by-feature check. Editions, add-ons and pricing differ, so verify any specific capability with the vendor before using it in a sales or investment decision. SmartERP's column is evidence-based (see the other reports).

## 1. Capability comparison

Ratings for SmartERP: **●** usable, **◐** partial (backend only, demo, or defective), **○** absent.

| Capability | SmartERP today (evidence) | Typical established SMB ERPs (general knowledge) |
|---|---|---|
| Core coverage: sales, purchase, stock, accounting, HR | ◐ Sales header and stock status in the backend; purchase demo only; no accounting (02-Inventory) | Full order-to-cash, procure-to-pay and general ledger are standard core modules |
| Manufacturing (BOM, work orders, MRP) | ◐ Machine allocation, daily tasks and output recording work (RT-024..027); no BOM-to-stock, no MRP (RT-030) | BOM, routings and work orders are common; MRP is often included or available as an add-on |
| Quality control | ◐ Inspection queue and records in the backend (RT-032) | Usually available as a module or add-on |
| Module integration | ○ Modules don't post to each other: orders ↛ stock ↛ finance; production ↛ stock; attendance ↛ payroll (RT-017, 018, 030, 038) | Integration is the defining feature: documents post stock and accounting entries automatically |
| Business process automation | ○ No status transitions, approvals or notifications (F-011, F-051) | Configurable statuses, approvals, scheduled actions and notifications are common |
| Reporting & analytics | ◐ A few backend KPIs reconcile (RT-042..044); the UI dashboard is fabricated (F-001) | Standard reports (P&L, balance sheet, stock valuation, ageing) plus configurable dashboards |
| Customisation | ● Page builder, form builder, custom columns and charts (verified) — a genuine differentiator for a young product | Customisation via studio tools or developer frameworks; often powerful but needs specialists |
| Role-based access | ◐ Per-user menu permissions enforced in the gateway (RT-050), with two bypasses (F-003, F-004); no roles as permission bundles | Roles and groups with record-level rules are standard |
| Multi-company / branch | ○ (F-050) | Commonly supported, sometimes edition-dependent |
| Data import / export | ○ (RT-010, F-047) | CSV/Excel import and export are standard |
| Workflow approvals | ○ (Workflows screen is descriptive only) | Common, at least for purchases and expenses |
| Audit trail | ○ (F-027) | Change tracking or audit logs are typical |
| Security | ◐ Sound JWT handling (RT-053..055), parameterised SQL (RT-062); gaps in authorization, revocation and rate limiting (F-003, F-004, F-022) | Mature authentication, SSO options and permission models |
| Scalability | ◐ Stateless services; no pagination or indexes yet (F-039, F-040) | Proven at SMB to mid-market scale |
| Deployment & maintenance | ○ No CI, migrations, backups or monitoring (F-024..026, F-046) | Cloud (SaaS) and on-premise options with vendor-managed upgrades |
| Usability | ◐ Clean visual design; many screens don't save; INR/IST not localised (F-002, F-032) | Mature UX; localisation packs (including India GST) commonly available |
| Integration ecosystem | ○ None | App stores, connectors and APIs |
| India compliance (GST invoicing, e-way bill, payroll statutory) | ○ Invoice GST maths wrong (F-007); no statutory payroll (F-018) | India localisation exists for several of these products; depth varies |

## 2. Where SmartERP could compete

- **Garment-specific production floor:** machine allocation per operator, daily piece targets, inspection queue and style costing are modelled around how a cut-make-trim unit works. Generic ERPs often need configuration or add-ons for this.
- **Self-service customisation** (pages, forms, charts, menu mapping) without a developer.
- **Simplicity:** a small, readable codebase (React + Express + PostgreSQL), which is cheap to host and extend.

These advantages only matter once the core flows (stock, purchase, sales, invoicing) are complete and connected.

## 3. Suitability by segment, today

| Segment | Suitability | Reason |
|---|---|---|
| Small businesses (≤ 50 staff) | **Not yet**; possible pilot for attendance, user management and production-floor recording via an API-connected UI | The core order, stock and finance screens don't save; invoicing is non-compliant |
| Medium-sized businesses | Not suitable | No integration between modules, no accounting, no audit trail, no backups |
| Manufacturing organisations | **Closest fit** after Stage 1–2 of the roadmap | The production planning and quality backend is the most complete area; needs BOM-to-stock, UI wiring and validation |
| Retail / trading | Not suitable | Needs POS or order lines, stock valuation, purchasing, GST invoicing — all absent |
| Large enterprises | Not suitable | Multi-company, SSO, audit, scale, HA and compliance are all out of scope |

**Best-fit target after the roadmap's first three stages:** a small-to-medium Indian garment manufacturer (one factory, 20–200 staff) that needs production-floor control, attendance and payroll, and keeps its accounting in an existing package such as Tally, via export.

## 4. Essential vs optional

| Essential before selling to manufacturers (gaps) | Optional competitive enhancements |
|---|---|
| UI connected to every backend module (F-002, F-009) | Multi-company / branch (F-050) |
| Item master with cost, stock ledger, valuation (F-015) | Notifications: e-mail / WhatsApp (F-051) |
| Suppliers, purchase orders, goods receipt (F-016) | Mobile shop-floor app |
| Order lines, stock reservation, dispatch (F-013, F-028) | Forecasting and demand planning |
| GST-correct invoicing with sequential numbering (F-007) | Integrations: accounting export, payment gateway, GST portal |
| BOM-to-stock material consumption (F-014) | Marketplace of page and chart templates |
| Payroll from attendance + statutory deductions + payslips (F-018) | SSO (Microsoft 365 / Google) |
| Validation, audit trail, backups, migrations, tests (F-006, F-024..027) | Advanced analytics (§5 of the dashboard report) |
| Security fixes F-003, F-004, F-022 | — |
