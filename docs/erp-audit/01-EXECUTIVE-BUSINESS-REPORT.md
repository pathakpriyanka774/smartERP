# 01 — Executive Business Report

*For business owners, directors and operations managers. No technical knowledge needed.*

## The short answer

SmartERP is **not yet ready to run a company's daily operations.** Several parts work well and can be built on. But the screens your staff would use for orders, stock, expenses, clients, production and reports **do not save anything**. They show sample figures that never change.

The dashboard looks professional, but **every number on it is invented**: "$245,800 revenue, +12.5%", "47 active orders", "94.2% efficiency". They are typed into the page and are the same for every company, every day.

What already works well:
- **Logins and access control.** Each person can be given access to only the areas they need, and the menu shows only those areas.
- **Attendance.** Check-in and check-out, late arrivals and worked hours, recorded in the database.
- **Payroll basics.** An employee register and generating a monthly payroll (with the serious problems described below).
- **A self-service page and chart builder.** The company can design its own screens and charts.
- **A solid behind-the-scenes engine** for orders, stock, production planning, quality and costing. It is ready to be connected to the screens.

So this is a **promising foundation**. It is not a finished product.

## How we checked

We read the actual program code. We also ran the system in a separate, disposable test copy, using a fictional clothing manufacturer and **no real company data**. We performed 68 business actions there: creating users, orders and employees, recording production, generating payroll, and attempting things that should be refused. Where something is described below as working or failing, it was usually observed directly. Where we could only read the code, we say so.

## Module by module, in plain terms

For each area: what it is for, what staff can do today, what management gets, and what happens with wrong data.

### 1. Logins, users and access — *works*
- **Purpose:** make sure each employee sees only their areas. A salesperson shouldn't see salaries.
- **Today:** an administrator creates users and ticks which menus each may open. The menu adjusts automatically. The first person to register on a new system becomes the administrator; nobody can make themselves an administrator afterwards.
- **Limitations:**
  - **Data leaks:** a technically skilled employee can still read salary and attendance data they shouldn't see, by going around the normal screens. We demonstrated this (two separate weaknesses).
  - **Deactivated staff keep access:** when an employee is deactivated, they keep access for up to 24 hours.
  - **Unlimited password guessing:** nothing slows down repeated wrong passwords.
- **Needs a developer?** No, for day-to-day user management.

### 2. Dashboard — *does not work*
- **Purpose:** one screen showing revenue, orders, production and finances.
- **Today:** shows fixed sample numbers. Creating an order, recording income or finishing production changes nothing on it.
- **Positive:** the system already calculates the real figures behind the scenes, and our tests confirmed they reconcile with the records: revenue, number of orders, active production. They are simply not shown.
- **Risk:** a director could make decisions based on figures that are not the company's.

### 3. Orders (sales) — *screen does not save*
- **Purpose:** record what customers ordered, when it is due, and its value.
- **Today:** the Orders screen lets you type an order. It disappears when the page is refreshed, and editing an order can make the screen crash. Behind the scenes, orders *can* be stored, but the screen doesn't use that.
- **Missing:**
  - no products or quantities per order line;
  - no link to the client list or to stock;
  - no quotation, invoice, payment or delivery steps.
- **Wrong data:** the system accepts a negative order value, a delivery date in the past and a meaningless status ("banana"). Double-clicking Save creates two orders.

### 4. Inventory (stock) — *screen does not save; no stock value*
- **Purpose:** know what you have, what's running low, and what it's worth.
- **Today:** the screen shows sample items. The engine behind it does classify stock correctly. With our test items it reported 3 in stock, 1 low and 1 out of stock, exactly as expected.
- **Missing:**
  - **No stock value:** no item cost is stored, so the value of your stock cannot be shown.
  - no warehouses or locations;
  - no history of movements;
  - stock is never reduced by sales or production.
- **Wrong data:** a negative stock quantity is accepted.

### 5. Purchasing — *demonstration only*
- **Purpose:** reorder materials when stock runs low, approve purchases, record deliveries.
- **Today:** a "stock check → purchase order → goods receiving" sequence exists, but it saves only inside one person's web browser. Colleagues can't see it, and it is lost if the browser is cleared.
- **Its arithmetic is wrong:**
  - every item is priced at a fixed "$10";
  - entering 0 received units records the full order as received;
  - a partial delivery closes the purchase order.
- **There is no supplier register.**

### 6. Production and planning — *engine works, screens don't*
- **Purpose:** allocate machines and operators, set daily targets, record output, track orders to completion.
- **Today:** the engine works. It allocates a machine, refusing a machine that's already taken, even when two planners click at once. It creates daily targets and records output.
- **The screens fail.** The planning dashboard and the worker screen can't connect, so they show empty lists ("No tasks", "All caught up"). The main Production screen uses sample data only.
- **Wrong data:**
  - the system accepted 5,080 pieces on a 120-piece target, and an order showing 5,080 of 1,000 pieces done;
  - that one entry then made two production reports stop working;
  - a negative output was also accepted.
- **Missing:** materials are not deducted from stock when garments are made, and finished garments are not added to stock.

### 7. Quality control — *engine works, screens don't*
- **Purpose:** inspect each batch, approve or reject, record defects.
- **Today:** recorded batches appear in the inspection queue, and a batch can't be claimed by two inspectors. The quality screen cannot connect, so it always says "All caught up".
- **Wrong data:** an inspection of 10 pieces with 50 approved and 40 rejected was accepted.

### 8. Style costing — *engine works, screen doesn't*
- **Purpose:** know the material cost of each garment design.
- **Today:** costs per style are calculated correctly behind the scenes. The screen cannot connect to them, so it shows zeros.

### 9. Attendance — *works*
- **Purpose:** daily attendance, late arrivals, worked hours.
- **Today:** staff check in and out; arrivals after the cut-off (10:30 by default) are marked late; hours are calculated; days can be marked absent or leave. Only one record per person per day is possible, even with simultaneous clicks.
- **Limitations:** between midnight and 05:30 the screen may default to yesterday's date. Attendance is **not used by payroll**.

### 10. Payroll — *partly works, with serious errors*
- **Purpose:** pay people correctly and on time.
- **What works:**
  - an employee register with automatic employee codes and annual CTC;
  - generating a month's payroll for all active staff.
- **Serious problems we observed:**
  - **"Mark Paid" changes salaries.** It sets the employee's allowances and deductions to zero, and the payroll still shows "pending".
  - **Editing an employee erases their joining date.**
  - **Payroll ignores attendance.** An absent employee still receives full pay.
  - **Invalid entries are accepted.** A negative deduction raised one employee's pay from 18,000 to 23,000. A payroll for the month "banana" was accepted.
  - **No statutory deductions or payslips:** no PF, ESI, professional tax or TDS, and no payslips.

### 11. Finance and expenses — *screen does not work*
- **Purpose:** income, expenses, budgets, cash flow.
- **Today:** the screen shows fixed sample figures, and its "Add Transaction" and "Set Budget" buttons do nothing. Behind the scenes, a simple income and expense list can be stored.
- **Missing:** accounts, receivables, payables, bank and GST. Orders, purchases and payroll do not create finance entries.

### 12. Clients and vendors — *screen does not work*
- **Purpose:** customer and supplier contact details and history.
- **Today:** sample tables only; the "Add Client" and "Add Vendor" buttons do nothing. Customers can be stored behind the scenes, but there is no supplier record.

### 13. Invoicing — *must not be used with customers*
- **Purpose:** issue GST-compliant tax invoices.
- **Today:** the invoice designer produces printable invoices, but they are wrong:
  - **Tax doesn't add up:** the GST layout shows 2.5% + 2.5% tax and then charges 8% in the total.
  - **Invoice numbers repeat.**
  - **Invoices aren't kept:** they are saved only in the browser, and nowhere else reads them.
  - **The amount in words shows digits.**
- **Another company's details are in the program itself:** what look like a real company's tax number, bank account and contact details are built into the program. This is a data-protection concern under the DPDP Act.

### 14. Reports — *screen does not work*
- **Purpose:** sales, stock, production and financial reports.
- **Today:** fixed sample tables; the Export PDF buttons do nothing. Behind the scenes, real reports exist, but:
  - **cancelled orders are still counted in total sales**;
  - "top products" is really production quantity × material cost, not sales.

### 15. Page builder, form builder and charts — *works*
- **Purpose:** let the company create its own screens, forms and charts without a developer.
- **Today:** pages, forms and charts can be designed, saved and added to the menu. Charts support 7 types and your own colours.
- **Limitations:**
  - **Form submissions are not saved.**
  - **Page-builder data shows to anyone:** data placed on a builder page (employees, attendance, orders) can be read by any logged-in user, whatever their permissions.

### 16. Settings screens that look functional but are not
- **Roles and Permissions:** these screens save only in one browser. They have **no effect on who can access what**; the real control is User Management.
- **API Manager, Form Rules, Workflows:** API Manager lists services that don't exist; Form Rules and Workflows are never applied.
- **Risk:** administrators may believe they changed security settings when they did not.

## Example: a clothing company's typical week

**A. Buying 5,000 metres of cotton fabric**

| Step | Supported? |
|---|---|
| Register the purchase | ⚠️ Demo only, saved in one browser |
| Link the supplier | ❌ No supplier register |
| Receive the fabric | ⚠️ Demo only; partial deliveries handled wrongly |
| Stock updates automatically | ❌ Only inside the demo; the real stock list isn't updated |
| Track stock by warehouse | ❌ No warehouses |
| Allocate fabric to production | ❌ Not linked |
| Deduct fabric used in production | ❌ Not supported (verified) |
| Handle damaged or returned material | ❌ Not supported |
| Low-stock alert | ⚠️ Status is calculated correctly (verified); no alerts are sent |
| Show the stock value | ❌ No item cost is stored (verified) |
| Management stock report | ⚠️ The report screen shows sample data only |

**B. A retailer orders 1,000 T-shirts**

| Step | Supported? |
|---|---|
| Customer record | ⚠️ Possible behind the scenes; the screen's Add button does nothing |
| Quotation | ❌ |
| Sales order | ⚠️ Stored behind the scenes; the screen doesn't save |
| Check and reserve stock | ❌ (verified) |
| Production order, machine and operator allocation | ✅ Engine works (verified); planning screen can't connect |
| Record daily output | ✅ Engine works; ⚠️ over-production accepted |
| Quality inspection | ✅ Engine works; ⚠️ totals not checked; screen can't connect |
| Invoice | ❌ Invoice tool is incorrect and not stored |
| Payment and receivable | ❌ (verified) |
| Delivery and returns | ❌ |

**C. Month-end payroll for 40 workers**

| Step | Supported? |
|---|---|
| Employee register | ✅ (editing erases the joining date) |
| Attendance for the month | ✅ |
| Salary from attendance | ❌ Ignores absences (verified) |
| Statutory deductions | ❌ |
| Approve and mark paid | ❌ "Mark Paid" corrupts the amounts (verified) |
| Payslips | ❌ |

## What the ERP can support today, and what still needs other tools

**It can support today**, with care:
- user accounts and menu-level access;
- daily attendance;
- an employee register;
- a first draft of monthly payroll, to be checked by hand;
- custom screens and charts built by the company.

**Still needs manual work or other software:**
- sales orders, invoices and payments;
- purchasing and suppliers;
- stock levels and stock value;
- production tracking from the screens;
- quality records from the screens;
- accounting, GST and statutory payroll;
- management reporting.

## What we recommend, in order

1. **Stop the data problems first.**
   - Fix "Mark Paid", the joining-date loss, and the acceptance of negative or nonsensical values.
   - Close the two ways employees can read data they shouldn't.
   - Remove the third-party company details from the program.
2. **Connect the existing screens to the working engine:** orders, stock, expenses, clients, production, quality, costing, reports and the dashboard. This unlocks most of the value already paid for, and the dashboard becomes real.
3. **Complete the missing core processes:**
   - stock with cost and movements;
   - purchasing with suppliers;
   - sales with order lines and invoices;
   - payroll linked to attendance;
   - GST.
4. **Then add accounting links, approvals, an audit trail of changes, exports, backups and monitoring** before giving the system to customers.

Details, evidence and effort estimates are in the other reports in this folder (see [README](README.md)).
