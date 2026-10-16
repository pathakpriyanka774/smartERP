# ERP Microservices Backend

## Architecture Overview
- **API Gateway**: Routes requests to appropriate services (Port 8000)
- **Auth Service**: Authentication & authorization (Port 5001)
- **Order Service**: Order management (Port 5002)
- **Inventory Service**: Stock management (Port 5003)
- **Finance Service**: Financial operations (Port 5005)
- **Client Service**: Customer/vendor management (Port 5006)
- **Report Service**: Cross-module analytics (Port 5007)
- **Payroll Service**: Employee payroll (Port 5008)
- **Production Planning Service**: Machines, orders, tasks, quality (Port 5009)
- **Costing Service**: Style costing & materials (Port 5010)
- **Attendance Service**: Employee attendance & timesheets (Port 5011)
- **Page Builder Service**: Client-built pages, custom columns, menu mapping (Port 5012)
- **Accounting Service**: GST invoices, receipts and supplier payments, double-entry ledger, trial balance / P&L / balance sheet / ageing / GST summary, organisation settings (Port 5013)
- **Purchase Service**: Suppliers, purchase orders with approval, goods receipts, supplier bills (Port 5014)

All eleven services read and write PostgreSQL; none of them keep state in memory.
The report service owns no tables — it aggregates over the others'.

The gateway maps `/api/<name>` to a service and strips that prefix, so
`/api/orders/orders/stats` reaches the order service as `/orders/stats`.
It deliberately does **not** install `express.json()`: parsing the body there
would consume the request stream and proxied POST/PUT bodies would arrive
empty.

### Retired: Production Service (Port 5004)
`services/production-service` is **not started by `npm run start:all`** and the
gateway routes `/api/production` to port 5009 instead.

It defines `Machines`, `ProductionOrders` and `QualityInspections` in
`shared/production-schema.js` with snake_case columns (`id`, `order_number`),
but the schema files in `postgres/` create those same tables with PascalCase
columns (`MachineID`, `OrderCode`). Its `IF NOT EXISTS` guards therefore skip
table creation, and the foreign keys in `DailyProductionPlans` then fail with
`Could not create constraint or index` because `ProductionOrders(id)` does not
exist. `production-planning-service` (5009) covers the same domain against the
schema that is actually installed.

## Authentication and authorisation

Every endpoint requires a valid bearer token. This is enforced in three places,
and the first two are what actually protect the data:

1. **Each service** applies `protectService` from `shared/auth.js`, so a request
   sent straight to a service port is rejected exactly like one through the
   gateway. Only `/health` is open, so monitoring can still see a service that
   is up.
2. **The gateway** authenticates, then authorises by area: one menu permission
   per service (`orders` → orders, `payroll` → payroll, and so on). The
   page-builder service is the exception — it serves the navigation and page
   content a permitted user needs, so it authorises per route itself: reading
   is open to any authenticated user, authoring requires `page-builder`.
3. **The browser** hides menus and guards routes. This is presentation only. A
   hidden menu stops nobody from calling the endpoint behind it, which is why
   it is the least important of the three.

Permissions live in `UserPermissions (UserID, MenuKey)` and travel inside the
JWT, so a service can authorise without a round trip. They are granted from the
live menu catalogue, so a menu a client creates can be granted like any other.
Admins hold every permission implicitly, including menus added later.

`GET /api/auth/session` re-reads the account and returns a fresh token; the app
calls it on load so a permission change lands without waiting out the 24h
expiry. A self-registered account starts with **no** permissions — defaulting
to a set would hand every signup whatever that set contained.

Only `/api/health`, `/api/auth/login`, `/api/auth/signup` and `/api/auth/test`
are reachable without a token.

## Prerequisites

PostgreSQL 16 or later must be reachable (the schema uses the `IS JSON`
predicate, added in 16). Create a login role and a database it owns, once:

```bash
sudo -u postgres psql -c "CREATE ROLE smarterp WITH LOGIN PASSWORD '<your password>';"
sudo -u postgres psql -c "CREATE DATABASE smarterp OWNER smarterp;"
```

The app connects as that role, never as the `postgres` superuser.

## Quick Start

```bash
cp -n .env.example .env     # -n: never clobber an existing .env
                            # then fill in DB_PASSWORD and JWT_SECRET
npm run db:migrate          # install an empty database, or apply pending migrations
npm run start:all
```

`JWT_SECRET` has no default — auth-service exits at startup if it is unset,
rather than falling back to a value that is public in the source.

There are no seeded credentials. The first account created on an empty system
becomes Admin; create it through the signup screen or endpoint:

```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"admin","email":"you@example.com","password":"<at least 8 chars>"}'
```

After that, signup always assigns the `Employee` role; a `role` in the request
body is ignored, so nobody can grant themselves elevated access by editing the
payload. Admins change roles and menu permissions in User Management.

### Database: migrations, backups, restore

| Command (from `smarterpbackend/`) | What it does |
|---|---|
| `npm run db:migrate` | Empty database: installs the baseline (`postgres/0*.sql`) and every migration. Existing database: applies only the migrations it has not had yet (`postgres/migrations/NNN-*.sql`, recorded in `SchemaMigrations`). **Never drops data.** |
| `npm run db:status` | Lists applied and pending migrations. |
| `node ../setup-database.js --fresh --confirm-wipe` | Deletes everything and reinstalls. Both flags are required; take a backup first. |
| `npm run db:backup` | `pg_dump` to `../backups/<db>-<timestamp>.dump` (owner-only permissions, verified with `pg_restore --list`), keeping the newest 30. |
| `npm run db:restore -- <file> --into <database>` | Restores into an **empty** database (add `--force` to replace one that has tables). Use a scratch database for the monthly restore test. |

To change the schema, add a new numbered file in `postgres/migrations/`; never
edit a migration that has already been applied. Baseline files only ever run
on an empty database.

Schedule backups nightly (cron example):

```
15 2 * * *  cd /var/www/html/smartERP && node scripts/backup-database.js --keep 30 >> backups/backup.log 2>&1
```

`backups/` is git-ignored: dumps contain personal and payroll data.

### Tests

```bash
TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5432 TEST_DB_NAME=smarterp_test \
TEST_DB_USER=<user> TEST_DB_PASSWORD=<password> npm test
```

The integration suite (`tests/`, Node's built-in test runner) wipes and
rebuilds the test database — the name must contain `test` — starts every
service and the gateway on ports offset by 20000, and exercises them through
the gateway: permissions, validation, payroll, the stock ledger, orders ↔ stock,
production ↔ materials, report reconciliation and backup/restore. CI runs it
on every push (`.github/workflows/ci.yml`).

### Permissions are enforced twice

`shared/permissions.js` maps each API area to the menu permission that opens
it. The gateway checks it, and every service checks it again
(`protectService(app, { permissions })`), so a request sent straight to a
service port with someone else's login is refused too. Services listen on
`127.0.0.1` (`SERVICE_HOST`) so only the gateway can reach them. Page-builder
data sources each require the permission of the area that owns the data.

#### How the SQL Server-era code runs on PostgreSQL

The services still call `pool.request().input(...).query(...)` and
`.execute('sp_...')`. [`shared/database.js`](shared/database.js) implements that
API on `pg`: `@Name` parameters become typed `$n` placeholders, the former
stored procedures are PostgreSQL functions called with named arguments
(`p_<name>`), and result keys keep the PascalCase they are written in — the
schema's identifiers are unquoted, so PostgreSQL itself returns them lower-case.
Write new SQL the same way: PascalCase, unquoted.

## API Endpoints
- Gateway: http://localhost:8000
- Auth: http://localhost:5001
- Orders: http://localhost:5002
- Inventory: http://localhost:5003
- Finance: http://localhost:5005
- Clients: http://localhost:5006
- Reports: http://localhost:5007
- Payroll: http://localhost:5008
- Production Planning: http://localhost:5009
- Costing: http://localhost:5010
- Attendance: http://localhost:5011
- Page Builder: http://localhost:5012
- Accounting: http://localhost:5013
- Purchases: http://localhost:5014

### Production planning endpoints

`/planning/dashboard` returns the raw multi-recordset feed from
`sp_GetPlanningDashboard`. `/planning/summary` returns the same underlying data
rolled up into the counters the dashboard UI renders, with snake_case keys and
lower-cased status values so they match the React components' CSS classes.
`/planning/employee-performance` and `/planning/machine-availability` both take
an optional `?date=YYYY-MM-DD` and default to today.

### Page Builder

Lets a client compose a page from live ERP data and publish it to the sidebar,
without a deployment.

**Data sources are whitelisted.** `shared/data-sources.js` is the only place a
table, view or column name may come from. A widget references a source by key
and columns by key; every request is resolved against that registry before any
SQL is built. A page definition therefore cannot reach a table it was not
granted, and an identifier is never interpolated from a request. Requesting an
unknown source is a 404 and an unknown column is dropped rather than passed
through. Salary is deliberately excluded from the `employees` source: pages are
shareable, and compensation should not be surfacable by accident.

| Method | Path | Purpose |
|---|---|---|
| GET | `/datasources` | Whitelisted entities and their main columns |
| GET | `/datasources/:key/columns` | Main columns plus the client's custom ones |
| POST | `/datasources/:key/columns` | Add a custom column to an entity |
| GET | `/datasources/:key/rows` | Rows, with custom values merged in |
| PUT | `/datasources/:key/rows/:id/custom` | Set a custom value on one record |
| GET | `/datasources/:key/aggregate` | Grouped count/sum/avg, for charts |
| GET/POST/PUT/DELETE | `/pages` | Page and form definitions; `?kind=page\|form` filters |
| GET | `/pages/:pageKey` | One page or form, by URL slug |
| GET | `/menus` | Every menu the application has, with its page and API bindings |
| GET | `/apis` | Catalogue of endpoints a menu or page can be bound to |
| POST/PUT/DELETE | `/menus` | Create, map or remove a menu |
| GET | `/navigation` | Active menus, bindings applied — what the sidebar reads |

**Main vs custom columns.** Main columns come from the registry and are
read-only. Custom columns are stored in `CustomColumns` with their values in
`CustomColumnValues`, keyed by `(ColumnID, RecordID)` — the ERP tables are never
altered, so adding a field cannot reshape a system table. The table widget
flags which is which.

**Pages and forms share one store.** `CustomPages.Kind` is `'page'` or `'form'`;
a form is a page whose content is a single form widget. One layout engine, one
renderer, one publishing path — so a form maps to a menu and opens at
`/p/<key>` exactly like a page. Page Builder lists `kind=page`, Form Builder
lists `kind=form`, and Menu Manager shows both, grouped.

**Layout is JSON**, validated by an `ISJSON` check constraint. The widget set
will keep growing and a table-per-widget shape would need a migration each time.

**Publishing.** A page is reachable at `/p/<pageKey>` as soon as it is saved. It
appears in the sidebar once a menu points at it and both are Active — so
deactivating either withdraws it from navigation while leaving the URL working.

#### Menu Manager

Menu Manager is the single screen for menus: it lists every menu the
application has and maps each to the page or form it opens and the API it
uses. The former separate Menu Mapping screen was folded into it — two screens
editing the same menus meant two places to look and two chances to disagree.

Creating and mapping are two steps, and the form shows only what each needs:

- **Create a new menu** — label, icon, section, sort order, status. That is the
  menu itself; nothing about what it opens.
- **Map an existing menu** — the same fields plus the "Opens" and API pickers,
  for any menu including the built-ins.

The **Opens** picker lists three groups: the application's own screens
(`GET /app-pages`, derived from the built-in menu catalogue so there is no
second list to drift), custom pages, and forms. A menu therefore points at
either an existing screen or something built in Page/Form Builder.

`AppMenus.Path` is therefore nullable. A custom menu created but not yet mapped
genuinely opens nothing, and the navigation query keeps it out of the sidebar
until something is bound — better than inventing a route that would 404.

A binding is one of two columns, and setting either clears the other because a
menu opens one thing:

| Column | Binding |
|---|---|
| `PageID` | A custom page or form; the route comes from its key |
| `TargetPath` | One of the application's own screens, validated against the catalogue so a crafted request cannot point a menu at an arbitrary or external URL |

`TargetPath` is deliberately separate from `Path`: a built-in menu keeps its
canonical route in `Path` throughout, so unbinding restores it rather than
leaving the menu with nothing to open. `EffectivePath` resolves
`COALESCE(bound page, TargetPath, Path)`.

#### Menus live in the database

`AppMenus` holds **every** menu the application has. The built-ins are seeded
from `shared/app-menus.js` on service start; client-created ones are inserted
alongside them. Before this, the built-ins existed only in the React bundle
(`src/config/menuConfig.js`), so the backend had no idea they existed and Menu
Mapping could not offer them — it could only list the handful of custom pages.

Seeding is idempotent and deliberately does **not** overwrite `Label`, `Icon`,
`Section` or `SortOrder`: those are editable in Menu Manager, and re-seeding
them every restart would discard the user's edits. Only `Path` is kept in step
with the code.

It does **prune** built-ins whose key has left the catalogue. Without that, a
screen removed from the application leaves its row behind and the sidebar keeps
rendering a link to a route that no longer resolves. A consequence of not
rewriting `SortOrder` is that removing a menu leaves a gap in the numbering of
the survivors; the rendered order is unaffected, and the gap can be closed by
editing the orders in Menu Manager.

A menu row carries its own bindings, so one save maps all of them:

| Column | Meaning |
|---|---|
| `PageID` | Optional page this menu opens. On a built-in menu this **overrides** the screen it normally opens; clearing it restores the original route. `ON DELETE SET NULL`, so deleting a page unbinds rather than orphans. |
| `ApiKey` | Optional endpoint from `shared/api-catalog.js`, validated on save |
| `IsBuiltIn` | Built-ins can be re-labelled, reordered, hidden or bound to a page, but not deleted — their routes exist in the app either way, so deleting one would only make it reappear on the next restart |

`vw_CustomPageMenus` computes `EffectivePath`: the bound page's URL when there
is an active one, otherwise the menu's own route. The sidebar renders this view
and falls back to `menuConfig.js` if the service is unavailable, so navigation
never disappears because one service is down.

The API catalogue is written from the services' real routes. The old API screen
listed endpoints such as `/api/customers` that do not exist, which is worse than
listing none.

### Attendance

One row per employee per day, enforced by a `UNIQUE (EmployeeID, AttendanceDate)`
constraint rather than by application logic, so a duplicate check-in fails at the
database rather than creating a second row for the day.

| Method | Path | Purpose |
|---|---|---|
| GET | `/attendance` | Records, filtered by `from`/`to`/`date`/`employeeId`/`status` |
| GET | `/attendance/today` | Every active employee with their record for `?date=` (default today), including those not yet marked |
| GET | `/attendance/stats` | Counters for one day, including how many employees are unmarked |
| GET | `/attendance/summary` | Per-employee totals and attendance rate over `?from=`&`?to=` |
| GET | `/employees` | Active employees, for the check-in picker |
| POST | `/attendance/check-in` | Records arrival time and sets `present`, or `late` past the cutoff |
| POST | `/attendance/check-out` | Records departure time and computes `TotalHours`; leaves the status alone |
| GET | `/policy` | The cutoff and valid statuses currently in force |
| POST | `/attendance` | Marks a status directly (absent, leave, corrected times). Upserts via `INSERT … ON CONFLICT` |
| PUT | `/attendance/:id` | Corrects status or notes |
| DELETE | `/attendance/:id` | Removes a record |

Statuses are `present`, `late`, `half-day`, `leave`, `absent`, constrained by a
`CHECK` on the table so an invalid value cannot be stored even by direct SQL.
`half-day` is applied by marking it explicitly. `late` is applied automatically
at check-in: an arrival strictly after `ATTENDANCE_LATE_AFTER` (default `10:30`,
in `APP_TIMEZONE`) is recorded as `late`, and exactly 10:30 still counts as on
time. Change the cutoff in `.env` — no code change, and `GET /policy` reports
what is in force so the UI can show it.

Check-out deliberately does **not** touch the status. It only stamps the time
and computes hours, because forcing `present` there would silently erase a
`late` arrival recorded hours earlier.

#### Timezone

Database sessions run in **UTC** (`shared/database.js` sets it on connect,
whatever the server's own `timezone` setting), so `CURRENT_DATE` and
`LOCALTIMESTAMP` are not the local wall clock. Attendance times and the calendar date a record
belongs to are therefore derived in the application by
[`shared/app-time.js`](shared/app-time.js) and passed explicitly, never left to
a database default. The zone comes from `APP_TIMEZONE` in `.env`
(default `Asia/Kolkata`).

This matters for more than display: `CURRENT_DATE` is still the
previous day between 00:00 and 05:30 IST, so relying on it would file early
-morning attendance under the wrong date.

Audit columns elsewhere in the schema (`CreatedAt`, `RecordedAt`, `ProcessedAt`)
default to `LOCALTIMESTAMP` and so hold UTC. They are not user-facing.

#### Check-in / check-out lifecycle

The two buttons are driven by the recorded **times**, never by whether a row
exists — a day marked `absent` has a row but no `CheckInTime`, and must still
offer a check-in:

| State | Action available |
|---|---|
| No `CheckInTime` | **Check in** — stamps the time, sets `present` |
| `CheckInTime`, no `CheckOutTime` | **Check out** — stamps the time, computes hours, stays `present` |
| Both times | Complete; shows total hours |

Checking in on a day already marked `absent` or `leave` corrects it to
`present` rather than being refused; only a second *real* arrival is rejected
with 409. Marking a status never clears times already recorded — the upsert
`COALESCE`s onto the stored values and recomputes hours from the resulting
pair, so using the Mark dropdown after a check-in cannot strand the row.

Attendance is the system of record for presence:
`/planning/employee-performance` reads `EmployeeAttendance` rather than inferring
presence from whether an employee has a task assigned.

The module has no seed data — attendance is real operational data about real
people. Employees come from the Payroll module; until one exists, the daily
register renders an empty state pointing there.

### Quality workflow

Recording production puts a batch on the inspection queue
(`sp_RecordProduction` writes `QualityStatus = 'ReadyForInspection'`). From
there `/quality/start-inspection` claims it — a second claim gets 409 — and
`/quality/complete-inspection` writes the result. The insert into
`QualityInspections` and the `DailyProduction` status update run in one
transaction so they cannot land separately.

## Troubleshooting

**`ECONNREFUSED 127.0.0.1:5432`** — PostgreSQL is not running
(`systemctl status postgresql`), or `DB_HOST`/`DB_PORT` point elsewhere.

**`password authentication failed for user "…"`** — `DB_USER`/`DB_PASSWORD` in
`.env` do not match the role. Reset it with
`sudo -u postgres psql -c "ALTER ROLE smarterp PASSWORD '<new password>';"`.

**`role "…" does not exist`** — no `.env` was found (dotenv falls back to your OS
user name), or the role was never created; see Prerequisites.

**`permission denied for schema public`** — the database is not owned by
`DB_USER`. Fix with `sudo -u postgres psql -c "ALTER DATABASE smarterp OWNER TO smarterp;"`.

## Accounting, purchasing, payroll and sessions (migrations 005–009)

- **Ledger.** Every document posts a balanced journal entry (`sp_PostJournal`); the database refuses unbalanced entries and any edit or delete of posted ones — corrections are reversals. Stock movements, invoices, receipts, supplier bills and payments, payroll accruals and payments, and cash-book lines all post automatically, so Inventory, Accounts Receivable and Accounts Payable always equal stock value, open invoices and open bills.
- **GST invoices.** Issued from a confirmed sales order (`POST /api/accounting/invoices`). Tax is per line: CGST + SGST for intra-state supply, IGST for inter-state (seller state from the company GSTIN vs place of supply). Numbers are `PREFIX/YY-YY/NNNNN`, gapless per financial year; invoices are immutable once issued and are cancelled, never deleted. Set the company GSTIN in Company Settings first.
- **Purchasing.** PO → approval (a Manager or Admin other than the requester) → goods receipt (accepted quantity into stock at PO price) → supplier bill (only received, unbilled quantity) → payment in Accounting.
- **Payroll** is computed from attendance (loss of pay for absences, half-days and days before joining) with optional PF, ESI and professional tax (off by default; enable in Company Settings).
- **Sessions.** Each request re-checks the account; deactivation, role or password change and sign-out end sessions within `SESSION_CACHE_MS` (5 s). Logins are throttled (429).
- **Audit trail.** Database triggers write `AuditLog` (who, what, before/after, never password hashes); `GET /api/auth/audit`, Admins only.
- **Pagination.** List endpoints take `page`, `pageSize` (max 500) and `q` and return `{ data, pagination }`.
