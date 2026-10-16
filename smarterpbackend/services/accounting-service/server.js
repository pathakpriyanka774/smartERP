/**
 * Accounting service: GST tax invoices, customer receipts and supplier
 * payments, the general ledger, and financial reports.
 *
 *   /settings            organisation (seller) details, GST and payroll settings
 *   /invoices            issue from a sales order, list, view, cancel
 *   /payments            receipts against invoices, payments against supplier bills, void
 *   /accounts, /journal  chart of accounts and journal entries
 *   /reports/*           trial balance, profit & loss, balance sheet, ageing, GST summary
 *
 * Permissions: the area needs 'accounting' or 'invoices'. Invoices and
 * customer receipts are open to either; the ledger, reports and supplier
 * payments need 'accounting'; changing settings needs an Admin.
 */
const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('../../shared/database');
const { initService } = require('../../shared/db-service');
const { protectService, requirePermission, isAdmin } = require('../../shared/auth');
const { AREA_PERMISSIONS, SERVICE_HOST } = require('../../shared/permissions');
const { check, str, num, int, id, oneOf, date, email, bool, routeId, badRequest } = require('../../shared/validate');
const { sendError } = require('../../shared/http');
const { zonedToday } = require('../../shared/app-time');
const { pageParams, listPage } = require('../../shared/paginate');
const gst = require('../../shared/gst');
const { withTransaction, conflict, notFound, postJournal, reverseJournal, nextNumber, loadSettings, cashAccount, money, addDays } = require('../../shared/ledger');

const app = express();
const PORT = 5013;

app.use(cors());
app.use(express.json());
protectService(app, { permissions: AREA_PERMISSIONS.accounting });

const { requireDB, health } = initService('Accounting Service');

const invoicing = requirePermission('invoices', 'accounting');
const accounting = requirePermission('accounting');
const adminOnly = (req, res, next) => (isAdmin(req.user)
  ? next()
  : res.status(403).json({ success: false, message: 'Only an Admin can change organisation settings' }));

const METHODS = ['bank', 'cash', 'upi', 'cheque', 'card'];
const INVOICEABLE = ['confirmed', 'in-production', 'ready', 'dispatched', 'delivered', 'completed'];
// Control accounts are moved only by their documents, so the sub-ledgers
// (invoices, bills, stock) always agree with the ledger.
const CONTROL_ACCOUNTS = ['1100', '1200', '1250', '2000', '2050'];

const gstinRule = () => str({ max: 15, pattern: /^[0-9A-Za-z]{15}$/, message: 'GSTIN must be 15 characters' });
const stateRule = () => str({ max: 2, pattern: /^\d{2}$/, message: 'state code must be two digits, e.g. 09' });

// ============================================================== Settings ===

const SETTINGS_FIELDS = {
  companyName: ['CompanyName', str({ max: 150 })],
  gstin: ['GSTIN', gstinRule()],
  stateCode: ['StateCode', stateRule()],
  addressLine1: ['AddressLine1', str({ max: 200 })],
  addressLine2: ['AddressLine2', str({ max: 200 })],
  city: ['City', str({ max: 100 })],
  pincode: ['Pincode', str({ max: 10, pattern: /^\d{6}$/, message: 'pincode must be 6 digits' })],
  phone: ['Phone', str({ max: 30 })],
  email: ['Email', email({ max: 150 })],
  website: ['Website', str({ max: 150 })],
  bankName: ['BankName', str({ max: 100 })],
  bankAccount: ['BankAccount', str({ max: 40, pattern: /^[0-9]{6,20}$/, message: 'bank account must be 6–20 digits' })],
  bankIfsc: ['BankIFSC', str({ max: 11, pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/, message: 'IFSC must look like ABCD0123456' })],
  bankBranch: ['BankBranch', str({ max: 100 })],
  invoicePrefix: ['InvoicePrefix', str({ max: 4, min: 1, pattern: /^[A-Z]{1,4}$/, message: 'invoice prefix must be 1–4 capital letters' })],
  defaultGstRate: ['DefaultGSTRate', oneOf(gst.GST_RATES)],
  paymentTermsDays: ['PaymentTermsDays', int({ min: 0, max: 365 })],
  invoiceTerms: ['InvoiceTerms', str({ max: 2000 })],
  pfEnabled: ['PFEnabled', bool()],
  pfRate: ['PFRate', num({ min: 0, max: 100 })],
  pfWageCeiling: ['PFWageCeiling', num({ min: 0, max: 1e7 })],
  esiEnabled: ['ESIEnabled', bool()],
  esiRate: ['ESIRate', num({ min: 0, max: 100 })],
  esiWageLimit: ['ESIWageLimit', num({ min: 0, max: 1e7 })],
  professionalTax: ['ProfessionalTax', num({ min: 0, max: 100000 })]
};

const shapeSettings = (row) => {
  const out = {};
  for (const [key, [column]] of Object.entries(SETTINGS_FIELDS)) out[key] = row[column] ?? null;
  out.stateName = gst.STATES[row.StateCode] || null;
  out.readyToInvoice = Boolean(row.GSTIN && gst.isValidGSTIN(row.GSTIN) && row.StateCode && row.CompanyName);
  return out;
};

app.get('/settings', requireDB, async (req, res) => {
  try {
    res.json({ success: true, data: shapeSettings(await loadSettings()) });
  } catch (error) {
    sendError(res, error, 'Failed to load settings');
  }
});

app.put('/settings', requireDB, adminOnly, async (req, res) => {
  const schema = Object.fromEntries(Object.entries(SETTINGS_FIELDS).map(([k, [, rule]]) => [k, rule]));
  const { errors, value: v } = check(req.body, schema);
  if (errors) return badRequest(res, errors);
  if (v.gstin) {
    v.gstin = v.gstin.toUpperCase();
    if (!gst.isValidGSTIN(v.gstin)) return badRequest(res, ['GSTIN is not valid (format, state code or check digit)']);
    if (v.stateCode && v.stateCode !== v.gstin.slice(0, 2)) return badRequest(res, ['stateCode must match the first two digits of the GSTIN']);
    v.stateCode = v.gstin.slice(0, 2);
  }
  if (v.stateCode && !gst.isStateCode(v.stateCode)) return badRequest(res, ['stateCode is not a GST state code']);
  const keys = Object.keys(v);
  if (!keys.length) return badRequest(res, ['Nothing to update']);
  try {
    const request = getPool().request().input('UserID', sql.Int, req.user.id);
    const sets = keys.map(k => {
      request.input(k, null, v[k]);
      return `${SETTINGS_FIELDS[k][0]} = @${k}`;
    });
    await request.query(`UPDATE OrganizationSettings SET ${sets.join(', ')}, UpdatedAt = LOCALTIMESTAMP, UpdatedBy = @UserID WHERE SettingsID = 1`);
    res.json({ success: true, data: shapeSettings(await loadSettings()) });
  } catch (error) {
    sendError(res, error, 'Failed to save settings');
  }
});

/** GST state codes and rates, for forms. */
app.get('/gst/reference', (req, res) => {
  res.json({
    success: true,
    data: {
      states: Object.entries(gst.STATES).map(([code, name]) => ({ code, name })),
      rates: gst.GST_RATES
    }
  });
});

// ============================================================== Invoices ===

/** Sales orders with something left to invoice. */
app.get('/invoiceable-orders', requireDB, invoicing, async (req, res) => {
  const p = pageParams(req.query);
  try {
    const result = await listPage(getPool().request(), `
      SELECT o.OrderID AS id, o.ClientName AS clientName, o.ClientID AS clientId, o.Status AS status,
             to_char(o.OrderDate, 'YYYY-MM-DD') AS orderDate, o.TotalAmount AS totalAmount,
             SUM((oi.Quantity - oi.InvoicedQuantity) * oi.UnitPrice) AS uninvoicedValue
      FROM Orders o JOIN OrderItems oi ON oi.OrderID = o.OrderID
      WHERE o.Status IN (${INVOICEABLE.map(s => `'${s}'`).join(', ')})
        AND oi.Quantity > oi.InvoicedQuantity
        AND (@Q IS NULL OR o.ClientName ILIKE @Q OR o.OrderID::text = TRIM(BOTH '%' FROM @Q))
      GROUP BY o.OrderID`, 'id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to load orders');
  }
});

const INVOICE_RULES = {
  orderId: id({ required: true }),
  invoiceDate: date(),
  placeOfSupply: stateRule(),
  buyerGstin: gstinRule(),
  buyerAddress: str({ max: 400 }),
  notes: str({ max: 500 })
};
const INVOICE_LINE_RULES = {
  orderItemId: id({ required: true }),
  quantity: int({ min: 1, max: 10000000 }),
  hsnCode: str({ max: 8, pattern: /^\d{4,8}$/, message: 'HSN/SAC code must be 4–8 digits' }),
  gstRate: oneOf(gst.GST_RATES)
};

/**
 * Work out an invoice for an order without saving it. Used by preview and by
 * create (inside its transaction, with the order locked), so what the user
 * saw is exactly what is issued.
 */
const buildInvoice = async (requester, body, { lock = false } = {}) => {
  const { errors, value: v } = check(body, INVOICE_RULES);
  const lineErrors = [];
  let wanted = null;
  if (body && body.lines !== undefined) {
    if (!Array.isArray(body.lines) || !body.lines.length) lineErrors.push('lines must be a non-empty list');
    else {
      wanted = body.lines.map((raw, i) => {
        const r = check(raw, INVOICE_LINE_RULES);
        if (r.errors) lineErrors.push(...r.errors.map(e => `line ${i + 1}: ${e}`));
        return r.value;
      });
    }
  }
  const all = [...(errors || []), ...lineErrors];
  if (all.length) return { errors: all };

  const settings = await loadSettings(requester);
  if (!settings.GSTIN || !gst.isValidGSTIN(settings.GSTIN) || !settings.StateCode) {
    throw conflict('Set your company GSTIN and state in Application Settings → Company Settings before issuing invoices');
  }

  const orderRows = await requester.request().input('OrderID', sql.Int, v.orderId).query(`
    SELECT o.OrderID, o.ClientID, o.ClientName, o.Status,
           c.GSTIN, c.StateCode, c.Address, c.City, c.Pincode, c.PaymentTermsDays, c.Phone, c.Email
    FROM Orders o LEFT JOIN Clients c ON c.ClientID = o.ClientID
    WHERE o.OrderID = @OrderID ${lock ? 'FOR UPDATE OF o' : ''}`);
  const order = orderRows.recordset[0];
  if (!order) throw notFound('Order not found');
  if (!INVOICEABLE.includes(order.Status)) throw conflict(`A ${order.Status} order cannot be invoiced; confirm it first`);

  const items = (await requester.request().input('OrderID', sql.Int, v.orderId).query(`
    SELECT oi.OrderItemID, oi.Description, oi.Quantity, oi.InvoicedQuantity, oi.UnitPrice,
           COALESCE(oi.HSNCode, i.HSNCode) AS HSNCode, COALESCE(oi.GSTRate, i.GSTRate) AS GSTRate, i.Unit
    FROM OrderItems oi LEFT JOIN InventoryItems i ON i.ItemID = oi.ItemID
    WHERE oi.OrderID = @OrderID ORDER BY oi.OrderItemID ${lock ? 'FOR UPDATE OF oi' : ''}`)).recordset;

  const byId = new Map(items.map(i => [i.OrderItemID, i]));
  const chosen = wanted || items.filter(i => i.Quantity > i.InvoicedQuantity).map(i => ({ orderItemId: i.OrderItemID }));
  if (!chosen.length) throw conflict('Everything on this order has already been invoiced');

  const seen = new Set();
  const lines = [];
  for (const w of chosen) {
    const item = byId.get(w.orderItemId);
    if (!item) return { errors: [`order line ${w.orderItemId} is not on order ${v.orderId}`] };
    if (seen.has(w.orderItemId)) return { errors: [`order line ${w.orderItemId} is listed twice`] };
    seen.add(w.orderItemId);
    const remaining = item.Quantity - item.InvoicedQuantity;
    const quantity = w.quantity ?? remaining;
    if (quantity > remaining) {
      throw conflict(`${item.Description}: only ${remaining} left to invoice, ${quantity} requested`);
    }
    if (quantity <= 0) continue;
    lines.push({
      orderItemId: item.OrderItemID,
      description: item.Description,
      hsnCode: w.hsnCode ?? item.HSNCode ?? null,
      quantity,
      unit: item.Unit || null,
      unitPrice: item.UnitPrice,
      gstRate: w.gstRate ?? item.GSTRate ?? settings.DefaultGSTRate
    });
  }
  if (!lines.length) throw conflict('Nothing to invoice');

  // Buyer: a registered buyer's GSTIN fixes the place of supply.
  const buyerGstin = (v.buyerGstin || order.GSTIN || '').toUpperCase() || null;
  if (buyerGstin && !gst.isValidGSTIN(buyerGstin)) return { errors: ['buyer GSTIN is not valid (format, state code or check digit)'] };
  const placeOfSupply = v.placeOfSupply || (buyerGstin ? buyerGstin.slice(0, 2) : null) || order.StateCode || settings.StateCode;
  if (!gst.isStateCode(placeOfSupply)) return { errors: ['placeOfSupply is not a GST state code'] };
  if (buyerGstin && v.placeOfSupply && v.placeOfSupply !== buyerGstin.slice(0, 2)) {
    return { errors: ["placeOfSupply must be the buyer's GSTIN state for a registered buyer"] };
  }

  const supplyType = gst.supplyTypeFor(settings.StateCode, placeOfSupply);
  const tax = gst.computeTax(lines, supplyType);
  const invoiceDate = v.invoiceDate || zonedToday();
  if (invoiceDate > zonedToday()) return { errors: ['invoiceDate cannot be in the future'] };
  const terms = order.PaymentTermsDays ?? settings.PaymentTermsDays;
  const address = v.buyerAddress || [order.Address, order.City, order.Pincode].filter(Boolean).join(', ') || null;

  return {
    invoice: {
      orderId: order.OrderID,
      clientId: order.ClientID,
      buyerName: order.ClientName,
      buyerGstin,
      buyerAddress: address,
      buyerPhone: order.Phone || null,
      buyerEmail: order.Email || null,
      buyerStateCode: buyerGstin ? buyerGstin.slice(0, 2) : (order.StateCode || null),
      buyerStateName: gst.STATES[buyerGstin ? buyerGstin.slice(0, 2) : order.StateCode] || null,
      placeOfSupply,
      placeOfSupplyName: gst.STATES[placeOfSupply],
      invoiceDate,
      dueDate: addDays(invoiceDate, terms),
      notes: v.notes || null,
      seller: sellerSnapshot(settings),
      ...tax,
      amountInWords: gst.amountInWords(tax.grandTotal)
    },
    settings
  };
};

const sellerSnapshot = (s) => ({
  name: s.CompanyName, gstin: s.GSTIN, stateCode: s.StateCode, stateName: gst.STATES[s.StateCode] || null,
  address: [s.AddressLine1, s.AddressLine2, s.City, s.Pincode].filter(Boolean).join(', '),
  city: s.City || null,
  // PAN is characters 3–12 of a GSTIN.
  pan: s.GSTIN ? s.GSTIN.slice(2, 12) : null,
  phone: s.Phone, email: s.Email, website: s.Website,
  bank: s.BankName ? { name: s.BankName, account: s.BankAccount, ifsc: s.BankIFSC, branch: s.BankBranch } : null,
  terms: s.InvoiceTerms
});

app.post('/invoices/preview', requireDB, invoicing, async (req, res) => {
  try {
    const built = await buildInvoice(getPool(), req.body);
    if (built.errors) return badRequest(res, built.errors);
    res.json({ success: true, data: { ...built.invoice, invoiceNumber: null } });
  } catch (error) {
    sendError(res, error, 'Failed to prepare invoice');
  }
});

app.post('/invoices', requireDB, invoicing, async (req, res) => {
  try {
    const invoiceId = await withTransaction(async (tx) => {
      const built = await buildInvoice(tx, req.body, { lock: true });
      if (built.errors) throw Object.assign(new Error(built.errors.join('; ')), { status: 400 });
      const inv = built.invoice;

      // Numbers run in date order within a financial year.
      const { number, financialYear, sequence } = await nextNumber(tx, 'INV', inv.invoiceDate, built.settings.InvoicePrefix);
      const last = await tx.request().input('FY', sql.NVarChar(5), financialYear).query(`
        SELECT InvoiceNumber, to_char(InvoiceDate, 'YYYY-MM-DD') AS d FROM Invoices
        WHERE FinancialYear = @FY ORDER BY SequenceNo DESC LIMIT 1`);
      if (last.recordset[0] && last.recordset[0].d > inv.invoiceDate) {
        throw conflict(`Invoice date cannot be earlier than the last invoice (${last.recordset[0].InvoiceNumber}, dated ${last.recordset[0].d})`);
      }

      const ins = await tx.request()
        .input('Number', sql.NVarChar(16), number)
        .input('FY', sql.NVarChar(5), financialYear)
        .input('Seq', sql.Int, sequence)
        .input('InvoiceDate', sql.Date, inv.invoiceDate)
        .input('DueDate', sql.Date, inv.dueDate)
        .input('OrderID', sql.Int, inv.orderId)
        .input('ClientID', sql.Int, inv.clientId || null)
        .input('BuyerName', sql.NVarChar(150), inv.buyerName)
        .input('BuyerGSTIN', sql.NVarChar(15), inv.buyerGstin)
        .input('BuyerAddress', sql.NVarChar(400), inv.buyerAddress)
        .input('POS', sql.NVarChar(2), inv.placeOfSupply)
        .input('SupplyType', sql.NVarChar(5), inv.supplyType)
        .input('Seller', null, JSON.stringify(inv.seller))
        .input('Taxable', sql.Decimal(16, 2), inv.taxableValue)
        .input('CGST', sql.Decimal(16, 2), inv.cgst)
        .input('SGST', sql.Decimal(16, 2), inv.sgst)
        .input('IGST', sql.Decimal(16, 2), inv.igst)
        .input('RoundOff', sql.Decimal(6, 2), inv.roundOff)
        .input('Grand', sql.Decimal(16, 2), inv.grandTotal)
        .input('Notes', sql.NVarChar(500), inv.notes)
        .input('UserID', sql.Int, req.user.id)
        .query(`
          INSERT INTO Invoices (InvoiceNumber, FinancialYear, SequenceNo, InvoiceDate, DueDate, OrderID, ClientID,
            BuyerName, BuyerGSTIN, BuyerAddress, PlaceOfSupply, SupplyType, Seller, TaxableValue, CGST, SGST, IGST,
            RoundOff, GrandTotal, Notes, CreatedBy)
          VALUES (@Number, @FY, @Seq, @InvoiceDate, @DueDate, @OrderID, @ClientID, @BuyerName, @BuyerGSTIN, @BuyerAddress,
            @POS, @SupplyType, @Seller::jsonb, @Taxable, @CGST, @SGST, @IGST, @RoundOff, @Grand, @Notes, @UserID)
          RETURNING InvoiceID`);
      const newId = ins.recordset[0].InvoiceID;

      for (const l of inv.lines) {
        await tx.request()
          .input('InvoiceID', sql.Int, newId)
          .input('OrderItemID', sql.Int, l.orderItemId)
          .input('Description', sql.NVarChar(200), l.description)
          .input('HSN', sql.NVarChar(8), l.hsnCode)
          .input('Quantity', sql.Int, l.quantity)
          .input('Unit', sql.NVarChar(30), l.unit)
          .input('UnitPrice', sql.Decimal(12, 2), l.unitPrice)
          .input('Taxable', sql.Decimal(16, 2), l.taxableValue)
          .input('Rate', sql.Decimal(5, 2), l.gstRate)
          .input('CGST', sql.Decimal(16, 2), l.cgst)
          .input('SGST', sql.Decimal(16, 2), l.sgst)
          .input('IGST', sql.Decimal(16, 2), l.igst)
          .input('Total', sql.Decimal(16, 2), l.lineTotal)
          .query(`INSERT INTO InvoiceItems (InvoiceID, OrderItemID, Description, HSNCode, Quantity, Unit, UnitPrice,
                    TaxableValue, GSTRate, CGST, SGST, IGST, LineTotal)
                  VALUES (@InvoiceID, @OrderItemID, @Description, @HSN, @Quantity, @Unit, @UnitPrice,
                    @Taxable, @Rate, @CGST, @SGST, @IGST, @Total)`);
        await tx.request().input('ID', sql.Int, l.orderItemId).input('Qty', sql.Int, l.quantity)
          .query('UPDATE OrderItems SET InvoicedQuantity = InvoicedQuantity + @Qty WHERE OrderItemID = @ID');
      }

      const entryId = await postJournal(tx, {
        date: inv.invoiceDate, reference: number, sourceType: 'invoice', sourceId: newId,
        narration: `Sales invoice to ${inv.buyerName}`, userId: req.user.id,
        lines: [
          { account: '1100', debit: inv.grandTotal, memo: inv.buyerName },
          { account: '4000', credit: inv.taxableValue },
          { account: '2100', credit: inv.cgst },
          { account: '2101', credit: inv.sgst },
          { account: '2102', credit: inv.igst },
          { account: '4900', credit: inv.roundOff }
        ]
      });
      await tx.request().input('ID', sql.Int, newId).input('EntryID', sql.Int, entryId)
        .query('UPDATE Invoices SET EntryID = @EntryID WHERE InvoiceID = @ID');
      return newId;
    });
    res.status(201).json({ success: true, data: await loadInvoice(invoiceId) });
  } catch (error) {
    sendError(res, error, 'Failed to issue invoice');
  }
});

const INVOICE_COLUMNS = `
  i.InvoiceID AS id, i.InvoiceNumber AS invoiceNumber, to_char(i.InvoiceDate, 'YYYY-MM-DD') AS invoiceDate,
  to_char(i.DueDate, 'YYYY-MM-DD') AS dueDate, i.OrderID AS orderId, i.ClientID AS clientId,
  i.BuyerName AS buyerName, i.BuyerGSTIN AS buyerGstin, i.BuyerAddress AS buyerAddress,
  i.PlaceOfSupply AS placeOfSupply, i.SupplyType AS supplyType,
  i.TaxableValue AS taxableValue, i.CGST AS cgst, i.SGST AS sgst, i.IGST AS igst, i.RoundOff AS roundOff,
  i.GrandTotal AS grandTotal, i.AmountPaid AS amountPaid, (i.GrandTotal - i.AmountPaid) AS balanceDue,
  i.Status AS status, i.Notes AS notes, i.CancelReason AS cancelReason,
  to_char(i.CancelledAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cancelledAt,
  CASE WHEN i.Status IN ('issued', 'partially-paid') AND i.DueDate < @Today THEN TRUE ELSE FALSE END AS overdue`;

const loadInvoice = async (invoiceId, requester = getPool()) => {
  const r = await requester.request().input('ID', sql.Int, invoiceId).input('Today', sql.Date, zonedToday())
    // Buyer contact details come from the client record (not part of the tax document).
    .query(`SELECT ${INVOICE_COLUMNS}, i.Seller AS seller, c.Phone AS buyerPhone, c.Email AS buyerEmail, c.StateCode AS clientState
            FROM Invoices i LEFT JOIN Clients c ON c.ClientID = i.ClientID WHERE i.InvoiceID = @ID`);
  const inv = r.recordset[0];
  if (!inv) return null;
  const lines = (await requester.request().input('ID', sql.Int, invoiceId).query(`
    SELECT InvoiceItemID AS id, OrderItemID AS orderItemId, Description AS description, HSNCode AS hsnCode,
           Quantity AS quantity, Unit AS unit, UnitPrice AS unitPrice, TaxableValue AS taxableValue,
           GSTRate AS gstRate, CGST AS cgst, SGST AS sgst, IGST AS igst, LineTotal AS lineTotal
    FROM InvoiceItems WHERE InvoiceID = @ID ORDER BY InvoiceItemID`)).recordset;
  const payments = (await requester.request().input('ID', sql.Int, invoiceId).query(`
    SELECT PaymentID AS id, PaymentNumber AS paymentNumber, to_char(PaymentDate, 'YYYY-MM-DD') AS paymentDate,
           Amount AS amount, Method AS method, Reference AS reference, Status AS status
    FROM Payments WHERE InvoiceID = @ID ORDER BY PaymentID`)).recordset;
  const tax = gst.computeTax(lines.map(l => ({ quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate, hsnCode: l.hsnCode })), inv.supplyType);
  return {
    ...inv,
    placeOfSupplyName: gst.STATES[inv.placeOfSupply] || null,
    buyerStateCode: inv.buyerGstin ? inv.buyerGstin.slice(0, 2) : (inv.clientState || null),
    buyerStateName: gst.STATES[inv.buyerGstin ? inv.buyerGstin.slice(0, 2) : inv.clientState] || null,
    seller: { ...inv.seller, pan: inv.seller?.pan || (inv.seller?.gstin ? inv.seller.gstin.slice(2, 12) : null) },
    totalTax: money(inv.cgst + inv.sgst + inv.igst),
    amountInWords: gst.amountInWords(inv.grandTotal),
    taxSummary: tax.taxSummary,
    lines,
    payments
  };
};

app.get('/invoices', requireDB, invoicing, async (req, res) => {
  const { errors, value } = check(req.query, {
    status: oneOf(['issued', 'partially-paid', 'paid', 'cancelled', 'unpaid', 'overdue']),
    clientId: id(), orderId: id(), from: date(), to: date()
  });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Status', sql.NVarChar(20), value.status || null)
      .input('ClientID', sql.Int, value.clientId || null)
      .input('OrderID', sql.Int, value.orderId || null)
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null)
      .input('Today', sql.Date, zonedToday());
    const result = await listPage(request, `
      SELECT ${INVOICE_COLUMNS}, i.SequenceNo AS seq, i.FinancialYear AS fy FROM Invoices i
      WHERE (@Status IS NULL
             OR (@Status = 'unpaid' AND i.Status IN ('issued', 'partially-paid'))
             OR (@Status = 'overdue' AND i.Status IN ('issued', 'partially-paid') AND i.DueDate < @Today)
             OR i.Status = @Status)
        AND (@ClientID IS NULL OR i.ClientID = @ClientID)
        AND (@OrderID IS NULL OR i.OrderID = @OrderID)
        AND (@From IS NULL OR i.InvoiceDate >= @From) AND (@To IS NULL OR i.InvoiceDate <= @To)
        AND (@Q IS NULL OR i.InvoiceNumber ILIKE @Q OR i.BuyerName ILIKE @Q)`, 'fy DESC, seq DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list invoices');
  }
});

app.get('/invoices/:id', requireDB, invoicing, async (req, res) => {
  const invoiceId = routeId(req.params.id);
  if (!invoiceId) return badRequest(res, ['Invalid invoice id']);
  try {
    const inv = await loadInvoice(invoiceId);
    if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
    res.json({ success: true, data: inv });
  } catch (error) {
    sendError(res, error, 'Failed to load invoice');
  }
});

/**
 * Cancel an invoice. The number stays on record as cancelled (GST requires
 * the series to be complete), the sale is reversed in the ledger and the
 * quantities become invoiceable again. Receipts must be voided first.
 */
app.post('/invoices/:id/cancel', requireDB, invoicing, async (req, res) => {
  const invoiceId = routeId(req.params.id);
  if (!invoiceId) return badRequest(res, ['Invalid invoice id']);
  const { errors, value } = check(req.body, { reason: str({ required: true, min: 3, max: 300 }) });
  if (errors) return badRequest(res, errors);
  try {
    await withTransaction(async (tx) => {
      const r = await tx.request().input('ID', sql.Int, invoiceId)
        .query('SELECT InvoiceNumber, Status, AmountPaid, EntryID FROM Invoices WHERE InvoiceID = @ID FOR UPDATE');
      const inv = r.recordset[0];
      if (!inv) throw notFound('Invoice not found');
      if (inv.Status === 'cancelled') throw conflict(`${inv.InvoiceNumber} is already cancelled`);
      if (inv.AmountPaid > 0) throw conflict(`${inv.InvoiceNumber} has receipts against it; void them first`);
      const reversal = await reverseJournal(tx, inv.EntryID, { date: zonedToday(), userId: req.user.id, narration: `Cancelled: ${value.reason}` });
      await tx.request().input('ID', sql.Int, invoiceId).query(`
        UPDATE OrderItems oi SET InvoicedQuantity = oi.InvoicedQuantity - ii.Quantity
        FROM InvoiceItems ii WHERE ii.InvoiceID = @ID AND ii.OrderItemID = oi.OrderItemID`);
      await tx.request().input('ID', sql.Int, invoiceId).input('UserID', sql.Int, req.user.id)
        .input('Reason', sql.NVarChar(300), value.reason).input('Rev', sql.Int, reversal)
        .query(`UPDATE Invoices SET Status = 'cancelled', CancelledAt = LOCALTIMESTAMP, CancelledBy = @UserID,
                  CancelReason = @Reason, CancelEntryID = @Rev WHERE InvoiceID = @ID`);
    });
    res.json({ success: true, data: await loadInvoice(invoiceId) });
  } catch (error) {
    sendError(res, error, 'Failed to cancel invoice');
  }
});

// ============================================================== Payments ===

const PAYMENT_RULES = {
  direction: oneOf(['in', 'out'], { required: true }),
  invoiceId: id(),
  billId: id(),
  amount: num({ required: true, min: 0.01, max: 1e12 }),
  method: oneOf(METHODS),
  paymentDate: date(),
  reference: str({ max: 100 }),
  notes: str({ max: 300 })
};

/** The document a payment settles, locked. */
const lockDocument = async (tx, direction, docId) => {
  const r = direction === 'in'
    ? await tx.request().input('ID', sql.Int, docId).query(`
        SELECT InvoiceID AS id, InvoiceNumber AS number, ClientID AS partyId, BuyerName AS party,
               GrandTotal AS total, AmountPaid AS paid, Status AS status, to_char(InvoiceDate, 'YYYY-MM-DD') AS docDate
        FROM Invoices WHERE InvoiceID = @ID FOR UPDATE`)
    : await tx.request().input('ID', sql.Int, docId).query(`
        SELECT b.BillID AS id, b.BillRef AS number, b.SupplierID AS partyId, c.Name AS party,
               b.Total AS total, b.AmountPaid AS paid, b.Status AS status, to_char(b.BillDate, 'YYYY-MM-DD') AS docDate
        FROM SupplierBills b JOIN Clients c ON c.ClientID = b.SupplierID WHERE b.BillID = @ID FOR UPDATE OF b`);
  return r.recordset[0];
};

const settleStatus = (direction, total, paid) => {
  if (paid <= 0) return direction === 'in' ? 'issued' : 'open';
  return paid >= total ? 'paid' : 'partially-paid';
};

const updateDocumentPaid = async (tx, direction, docId, paid, status) => {
  const table = direction === 'in' ? 'Invoices' : 'SupplierBills';
  const key = direction === 'in' ? 'InvoiceID' : 'BillID';
  await tx.request().input('ID', sql.Int, docId).input('Paid', sql.Decimal(16, 2), paid).input('Status', sql.NVarChar(15), status)
    .query(`UPDATE ${table} SET AmountPaid = @Paid, Status = @Status WHERE ${key} = @ID`);
};

app.post('/payments', requireDB, async (req, res, next) => {
  // Receipts are part of invoicing; paying suppliers is an accounting task.
  (req.body?.direction === 'out' ? accounting : invoicing)(req, res, next);
}, async (req, res) => {
  const { errors, value: v } = check(req.body, PAYMENT_RULES);
  if (errors) return badRequest(res, errors);
  const docId = v.direction === 'in' ? v.invoiceId : v.billId;
  if (!docId) return badRequest(res, [v.direction === 'in' ? 'invoiceId is required for a receipt' : 'billId is required for a supplier payment']);
  if ((v.direction === 'in' && v.billId) || (v.direction === 'out' && v.invoiceId)) {
    return badRequest(res, ['A receipt settles an invoice; a supplier payment settles a bill']);
  }
  const paymentDate = v.paymentDate || zonedToday();
  if (paymentDate > zonedToday()) return badRequest(res, ['paymentDate cannot be in the future']);
  const method = v.method || 'bank';

  try {
    const paymentId = await withTransaction(async (tx) => {
      const doc = await lockDocument(tx, v.direction, docId);
      if (!doc) throw notFound(v.direction === 'in' ? 'Invoice not found' : 'Bill not found');
      if (['cancelled', 'paid'].includes(doc.status)) throw conflict(`${doc.number} is ${doc.status}`);
      if (paymentDate < doc.docDate) throw conflict(`The payment date is before ${doc.number} (${doc.docDate})`);
      const outstanding = money(doc.total - doc.paid);
      if (v.amount > outstanding) throw conflict(`${doc.number} has ₹${outstanding.toFixed(2)} outstanding; ₹${v.amount.toFixed(2)} is more than that`);

      const { number } = await nextNumber(tx, v.direction === 'in' ? 'RCPT' : 'PAY', paymentDate);
      const lines = v.direction === 'in'
        ? [{ account: cashAccount(method), debit: v.amount }, { account: '1100', credit: v.amount, memo: doc.party }]
        : [{ account: '2000', debit: v.amount, memo: doc.party }, { account: cashAccount(method), credit: v.amount }];

      const ins = await tx.request()
        .input('Number', sql.NVarChar(16), number)
        .input('Direction', sql.NVarChar(3), v.direction)
        .input('PartyID', sql.Int, doc.partyId || null)
        .input('InvoiceID', sql.Int, v.direction === 'in' ? docId : null)
        .input('BillID', sql.Int, v.direction === 'out' ? docId : null)
        .input('Date', sql.Date, paymentDate)
        .input('Amount', sql.Decimal(16, 2), v.amount)
        .input('Method', sql.NVarChar(10), method)
        .input('Reference', sql.NVarChar(100), v.reference || null)
        .input('Notes', sql.NVarChar(300), v.notes || null)
        .input('UserID', sql.Int, req.user.id)
        .query(`INSERT INTO Payments (PaymentNumber, Direction, PartyID, InvoiceID, BillID, PaymentDate, Amount, Method, Reference, Notes, CreatedBy)
                VALUES (@Number, @Direction, @PartyID, @InvoiceID, @BillID, @Date, @Amount, @Method, @Reference, @Notes, @UserID)
                RETURNING PaymentID`);
      const newId = ins.recordset[0].PaymentID;
      const entryId = await postJournal(tx, {
        date: paymentDate, reference: number, sourceType: 'payment', sourceId: newId,
        narration: `${v.direction === 'in' ? 'Receipt from' : 'Payment to'} ${doc.party} against ${doc.number}`,
        userId: req.user.id, lines
      });
      await tx.request().input('ID', sql.Int, newId).input('EntryID', sql.Int, entryId)
        .query('UPDATE Payments SET EntryID = @EntryID WHERE PaymentID = @ID');
      // The cash book (Expenses & Finance) shows the money movement too; it
      // shares this journal entry rather than posting its own.
      await tx.request()
        .input('Type', sql.NVarChar(20), v.direction === 'in' ? 'income' : 'expense')
        .input('Amount', sql.Decimal(14, 2), v.amount)
        .input('Description', sql.NVarChar(300), `${number} – ${doc.party} (${doc.number})`)
        .input('Date', sql.Date, paymentDate)
        .input('Category', sql.NVarChar(50), v.direction === 'in' ? 'Customer receipts' : 'Supplier payments')
        .input('Method', sql.NVarChar(10), method === 'cash' ? 'cash' : 'bank')
        .input('Account', sql.NVarChar(10), v.direction === 'in' ? '1100' : '2000')
        .input('SourceID', sql.Int, newId)
        .input('EntryID', sql.Int, entryId)
        .query(`INSERT INTO FinanceTransactions (Type, Amount, Description, TxnDate, Category, Method, AccountCode, SourceType, SourceID, EntryID)
                VALUES (@Type, @Amount, @Description, @Date, @Category, @Method, @Account, 'payment', @SourceID, @EntryID)`);
      const paid = money(doc.paid + v.amount);
      await updateDocumentPaid(tx, v.direction, docId, paid, settleStatus(v.direction, doc.total, paid));
      return newId;
    });
    res.status(201).json({ success: true, data: await loadPayment(paymentId) });
  } catch (error) {
    sendError(res, error, 'Failed to record payment');
  }
});

const PAYMENT_COLUMNS = `
  p.PaymentID AS id, p.PaymentNumber AS paymentNumber, p.Direction AS direction, p.PartyID AS partyId,
  c.Name AS partyName, p.InvoiceID AS invoiceId, i.InvoiceNumber AS invoiceNumber, p.BillID AS billId,
  b.BillRef AS billRef, b.SupplierBillNo AS supplierBillNo, to_char(p.PaymentDate, 'YYYY-MM-DD') AS paymentDate,
  p.Amount AS amount, p.Method AS method, p.Reference AS reference, p.Notes AS notes, p.Status AS status,
  p.VoidReason AS voidReason`;
const PAYMENT_FROM = `
  FROM Payments p LEFT JOIN Clients c ON c.ClientID = p.PartyID
  LEFT JOIN Invoices i ON i.InvoiceID = p.InvoiceID LEFT JOIN SupplierBills b ON b.BillID = p.BillID`;

const loadPayment = async (paymentId) => {
  const r = await getPool().request().input('ID', sql.Int, paymentId)
    .query(`SELECT ${PAYMENT_COLUMNS} ${PAYMENT_FROM} WHERE p.PaymentID = @ID`);
  return r.recordset[0] || null;
};

app.get('/payments', requireDB, invoicing, async (req, res) => {
  const { errors, value } = check(req.query, {
    direction: oneOf(['in', 'out']), status: oneOf(['posted', 'void']), from: date(), to: date(), invoiceId: id(), billId: id()
  });
  if (errors) return badRequest(res, errors);
  // Supplier payments are accounting data.
  const canSeeOut = isAdmin(req.user) || (req.user.permissions || []).includes('accounting');
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('Direction', sql.NVarChar(3), canSeeOut ? (value.direction || null) : 'in')
      .input('Status', sql.NVarChar(10), value.status || null)
      .input('From', sql.Date, value.from || null)
      .input('To', sql.Date, value.to || null)
      .input('InvoiceID', sql.Int, value.invoiceId || null)
      .input('BillID', sql.Int, value.billId || null);
    const result = await listPage(request, `
      SELECT ${PAYMENT_COLUMNS} ${PAYMENT_FROM}
      WHERE (@Direction IS NULL OR p.Direction = @Direction) AND (@Status IS NULL OR p.Status = @Status)
        AND (@From IS NULL OR p.PaymentDate >= @From) AND (@To IS NULL OR p.PaymentDate <= @To)
        AND (@InvoiceID IS NULL OR p.InvoiceID = @InvoiceID) AND (@BillID IS NULL OR p.BillID = @BillID)
        AND (@Q IS NULL OR p.PaymentNumber ILIKE @Q OR c.Name ILIKE @Q OR p.Reference ILIKE @Q
             OR i.InvoiceNumber ILIKE @Q OR b.BillRef ILIKE @Q)`, 'paymentDate DESC, id DESC', p);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to list payments');
  }
});

/**
 * Supplier bills waiting to be paid, oldest due first. Served here (not only
 * by the purchase service) so paying needs only the Accounting permission.
 */
app.get('/payable-bills', requireDB, accounting, async (req, res) => {
  const p = pageParams(req.query, { defaultSize: 100 });
  try {
    const request = getPool().request().input('Today', sql.Date, zonedToday());
    const result = await listPage(request, `
      SELECT b.BillID AS id, b.BillRef AS billRef, b.SupplierBillNo AS supplierBillNo, c.Name AS supplierName,
             po.PONumber AS poNumber, to_char(b.BillDate, 'YYYY-MM-DD') AS billDate, to_char(b.DueDate, 'YYYY-MM-DD') AS dueDate,
             b.Total AS total, b.AmountPaid AS amountPaid, (b.Total - b.AmountPaid) AS balanceDue, b.Status AS status,
             (b.DueDate < @Today) AS overdue, GREATEST(@Today - b.DueDate, 0) AS daysOverdue
      FROM SupplierBills b JOIN Clients c ON c.ClientID = b.SupplierID LEFT JOIN PurchaseOrders po ON po.POID = b.POID
      WHERE b.Status IN ('open', 'partially-paid')
        AND (@Q IS NULL OR b.BillRef ILIKE @Q OR b.SupplierBillNo ILIKE @Q OR c.Name ILIKE @Q)`, 'dueDate, id', p);
    const totals = await getPool().request().input('Today', sql.Date, zonedToday()).query(`
      SELECT COALESCE(SUM(Total - AmountPaid), 0) AS outstanding,
             COALESCE(SUM(Total - AmountPaid) FILTER (WHERE DueDate < @Today), 0) AS overdue
      FROM SupplierBills WHERE Status IN ('open', 'partially-paid')`);
    res.json({ success: true, ...result, totals: totals.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to list bills awaiting payment');
  }
});

/** Void a payment: the ledger entry is reversed and the document reopened. */
app.post('/payments/:id/void', requireDB, async (req, res) => {
  const paymentId = routeId(req.params.id);
  if (!paymentId) return badRequest(res, ['Invalid payment id']);
  const { errors, value } = check(req.body, { reason: str({ required: true, min: 3, max: 300 }) });
  if (errors) return badRequest(res, errors);
  try {
    await withTransaction(async (tx) => {
      const r = await tx.request().input('ID', sql.Int, paymentId)
        .query('SELECT * FROM Payments WHERE PaymentID = @ID FOR UPDATE');
      const pay = r.recordset[0];
      if (!pay) throw notFound('Payment not found');
      const allowed = isAdmin(req.user) || (req.user.permissions || []).includes('accounting') ||
        (pay.Direction === 'in' && (req.user.permissions || []).includes('invoices'));
      if (!allowed) throw Object.assign(new Error('You do not have access to void this payment'), { status: 403 });
      if (pay.Status === 'void') throw conflict(`${pay.PaymentNumber} is already void`);
      const docId = pay.Direction === 'in' ? pay.InvoiceID : pay.BillID;
      const doc = await lockDocument(tx, pay.Direction, docId);
      const today = zonedToday();
      const reversal = await reverseJournal(tx, pay.EntryID, { date: today, userId: req.user.id, narration: `Void ${pay.PaymentNumber}: ${value.reason}` });
      await tx.request().input('ID', sql.Int, paymentId).input('Rev', sql.Int, reversal).input('UserID', sql.Int, req.user.id)
        .input('Reason', sql.NVarChar(300), value.reason)
        .query(`UPDATE Payments SET Status = 'void', VoidEntryID = @Rev, VoidedAt = LOCALTIMESTAMP, VoidedBy = @UserID,
                  VoidReason = @Reason WHERE PaymentID = @ID`);
      // The cash-book line is removed; the ledger keeps both the payment and its reversal.
      await tx.request().input('ID', sql.Int, paymentId)
        .query("DELETE FROM FinanceTransactions WHERE SourceType = 'payment' AND SourceID = @ID");
      const paid = money(doc.paid - pay.Amount);
      await updateDocumentPaid(tx, pay.Direction, docId, paid, settleStatus(pay.Direction, doc.total, paid));
    });
    res.json({ success: true, data: await loadPayment(paymentId) });
  } catch (error) {
    sendError(res, error, 'Failed to void payment');
  }
});

// ================================================================ Ledger ===

app.get('/accounts', requireDB, accounting, async (req, res) => {
  const { errors, value } = check(req.query, { asOf: date() });
  if (errors) return badRequest(res, errors);
  try {
    const r = await getPool().request().input('AsOf', sql.Date, value.asOf || null).query(`
      SELECT a.AccountID AS id, a.Code AS code, a.Name AS name, a.Type AS type, a.IsSystem AS isSystem,
             COALESCE(SUM(jl.Debit), 0) AS debit, COALESCE(SUM(jl.Credit), 0) AS credit,
             COALESCE(SUM(jl.Debit), 0) - COALESCE(SUM(jl.Credit), 0) AS balance
      FROM Accounts a
      LEFT JOIN JournalLines jl ON jl.AccountID = a.AccountID
        AND (@AsOf IS NULL OR jl.EntryID IN (SELECT EntryID FROM JournalEntries WHERE EntryDate <= @AsOf))
      GROUP BY a.AccountID ORDER BY a.Code`);
    res.json({ success: true, data: r.recordset.map(a => ({ ...a, controlAccount: CONTROL_ACCOUNTS.includes(a.code) })) });
  } catch (error) {
    sendError(res, error, 'Failed to load accounts');
  }
});

app.post('/accounts', requireDB, accounting, async (req, res) => {
  const { errors, value: v } = check(req.body, {
    code: str({ required: true, max: 10, pattern: /^\d{4,6}$/, message: 'code must be 4–6 digits' }),
    name: str({ required: true, max: 100 }),
    type: oneOf(['asset', 'liability', 'equity', 'income', 'expense'], { required: true })
  });
  if (errors) return badRequest(res, errors);
  try {
    const r = await getPool().request()
      .input('Code', sql.NVarChar(10), v.code).input('Name', sql.NVarChar(100), v.name).input('Type', sql.NVarChar(10), v.type)
      .query(`INSERT INTO Accounts (Code, Name, Type, IsSystem) VALUES (@Code, @Name, @Type, FALSE)
              RETURNING AccountID AS id, Code AS code, Name AS name, Type AS type`);
    res.status(201).json({ success: true, data: r.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to create account');
  }
});

const loadEntryLines = async (entryIds) => {
  if (!entryIds.length) return new Map();
  const r = await getPool().request().input('IDs', null, entryIds).query(`
    SELECT jl.EntryID AS entryId, a.Code AS account, a.Name AS accountName, jl.Debit AS debit, jl.Credit AS credit, jl.Memo AS memo
    FROM JournalLines jl JOIN Accounts a ON a.AccountID = jl.AccountID
    WHERE jl.EntryID = ANY(@IDs::int[]) ORDER BY jl.LineID`);
  const map = new Map();
  for (const l of r.recordset) {
    if (!map.has(l.entryId)) map.set(l.entryId, []);
    map.get(l.entryId).push(l);
  }
  return map;
};

app.get('/journal', requireDB, accounting, async (req, res) => {
  const { errors, value } = check(req.query, {
    from: date(), to: date(), account: str({ max: 10 }), sourceType: str({ max: 30 })
  });
  if (errors) return badRequest(res, errors);
  const p = pageParams(req.query);
  try {
    const request = getPool().request()
      .input('From', sql.Date, value.from || null).input('To', sql.Date, value.to || null)
      .input('Account', sql.NVarChar(10), value.account || null).input('Source', sql.NVarChar(30), value.sourceType || null);
    const result = await listPage(request, `
      SELECT je.EntryID AS id, to_char(je.EntryDate, 'YYYY-MM-DD') AS entryDate, je.Reference AS reference,
             je.SourceType AS sourceType, je.SourceID AS sourceId, je.Narration AS narration, je.ReversalOf AS reversalOf,
             (SELECT r.EntryID FROM JournalEntries r WHERE r.ReversalOf = je.EntryID LIMIT 1) AS reversedBy,
             (SELECT SUM(Debit) FROM JournalLines WHERE EntryID = je.EntryID) AS amount,
             u.Username AS createdBy, to_char(je.CreatedAt, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS createdAt
      FROM JournalEntries je LEFT JOIN Users u ON u.UserID = je.CreatedBy
      WHERE (@From IS NULL OR je.EntryDate >= @From) AND (@To IS NULL OR je.EntryDate <= @To)
        AND (@Source IS NULL OR je.SourceType = @Source)
        AND (@Account IS NULL OR EXISTS (SELECT 1 FROM JournalLines jl JOIN Accounts a ON a.AccountID = jl.AccountID
                                         WHERE jl.EntryID = je.EntryID AND a.Code = @Account))
        AND (@Q IS NULL OR je.Reference ILIKE @Q OR je.Narration ILIKE @Q)`, 'entryDate DESC, id DESC', p);
    const lines = await loadEntryLines(result.data.map(e => e.id));
    result.data = result.data.map(e => ({ ...e, lines: lines.get(e.id) || [] }));
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, 'Failed to load journal');
  }
});

/** A manual journal entry (accruals, corrections). Control accounts are refused. */
app.post('/journal', requireDB, accounting, async (req, res) => {
  const { errors, value: v } = check(req.body, {
    entryDate: date(), reference: str({ max: 100 }), narration: str({ required: true, max: 300 })
  });
  const all = [...(errors || [])];
  const raw = req.body?.lines;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 50) all.push('lines must list 2 to 50 accounts');
  const lines = (Array.isArray(raw) ? raw : []).map((l, i) => {
    const r = check(l, { account: str({ required: true, max: 10 }), debit: num({ min: 0, max: 1e12 }), credit: num({ min: 0, max: 1e12 }), memo: str({ max: 200 }) });
    if (r.errors) all.push(...r.errors.map(e => `line ${i + 1}: ${e}`));
    if (!r.errors && Boolean(r.value.debit) === Boolean(r.value.credit)) all.push(`line ${i + 1}: enter a debit or a credit`);
    if (CONTROL_ACCOUNTS.includes(r.value.account)) all.push(`line ${i + 1}: account ${r.value.account} is a control account, moved only by its documents`);
    return r.value;
  });
  if (!all.length) {
    const dr = lines.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0);
    const cr = lines.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0);
    if (dr !== cr) all.push(`debits (${(dr / 100).toFixed(2)}) must equal credits (${(cr / 100).toFixed(2)})`);
  }
  if (all.length) return badRequest(res, all);
  try {
    const entryId = await withTransaction(tx => postJournal(tx, {
      date: v.entryDate || zonedToday(), reference: v.reference || 'Manual journal', sourceType: 'manual',
      narration: v.narration, userId: req.user.id, lines
    }));
    res.status(201).json({ success: true, data: { id: entryId } });
  } catch (error) {
    sendError(res, error, 'Failed to post journal entry');
  }
});

/** Reverse a manual entry. Document postings are undone through their documents. */
app.post('/journal/:id/reverse', requireDB, accounting, async (req, res) => {
  const entryId = routeId(req.params.id);
  if (!entryId) return badRequest(res, ['Invalid entry id']);
  try {
    const r = await getPool().request().input('ID', sql.Int, entryId).query('SELECT SourceType FROM JournalEntries WHERE EntryID = @ID');
    if (!r.recordset.length) return res.status(404).json({ success: false, message: 'Entry not found' });
    if (r.recordset[0].SourceType !== 'manual') {
      return res.status(409).json({ success: false, message: 'Only manual entries are reversed here; cancel or void the document that posted this entry' });
    }
    const reversal = await withTransaction(tx => reverseJournal(tx, entryId, { date: zonedToday(), userId: req.user.id }));
    res.json({ success: true, data: { id: reversal } });
  } catch (error) {
    sendError(res, error, 'Failed to reverse entry');
  }
});

// =============================================================== Reports ===

const balancesSql = (dateFilter) => `
  SELECT a.Code AS code, a.Name AS name, a.Type AS type,
         COALESCE(SUM(jl.Debit), 0) AS debit, COALESCE(SUM(jl.Credit), 0) AS credit
  FROM Accounts a
  LEFT JOIN (JournalLines jl JOIN JournalEntries je ON je.EntryID = jl.EntryID AND ${dateFilter})
         ON jl.AccountID = a.AccountID
  GROUP BY a.AccountID ORDER BY a.Code`;

app.get('/reports/trial-balance', requireDB, accounting, async (req, res) => {
  const { errors, value } = check(req.query, { asOf: date() });
  if (errors) return badRequest(res, errors);
  const asOf = value.asOf || zonedToday();
  try {
    const r = await getPool().request().input('AsOf', sql.Date, asOf).query(balancesSql('je.EntryDate <= @AsOf'));
    const rows = r.recordset
      .map(a => {
        const net = money(a.debit - a.credit);
        return { code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
      })
      .filter(a => a.debit || a.credit);
    const totalDebit = money(rows.reduce((s, a) => s + a.debit, 0));
    const totalCredit = money(rows.reduce((s, a) => s + a.credit, 0));
    res.json({ success: true, data: { asOf, accounts: rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit } });
  } catch (error) {
    sendError(res, error, 'Failed to build trial balance');
  }
});

/** Default period: this financial year to date. */
const fyStart = (ymd) => {
  const [y, m] = ymd.split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
};

app.get('/reports/profit-loss', requireDB, accounting, async (req, res) => {
  const { errors, value } = check(req.query, { from: date(), to: date() });
  if (errors) return badRequest(res, errors);
  const to = value.to || zonedToday();
  const from = value.from || fyStart(to);
  try {
    const r = await getPool().request().input('From', sql.Date, from).input('To', sql.Date, to)
      .query(balancesSql('je.EntryDate BETWEEN @From AND @To'));
    const income = r.recordset.filter(a => a.type === 'income').map(a => ({ code: a.code, name: a.name, amount: money(a.credit - a.debit) })).filter(a => a.amount);
    const expenses = r.recordset.filter(a => a.type === 'expense').map(a => ({ code: a.code, name: a.name, amount: money(a.debit - a.credit) })).filter(a => a.amount);
    const totalIncome = money(income.reduce((s, a) => s + a.amount, 0));
    const totalExpenses = money(expenses.reduce((s, a) => s + a.amount, 0));
    res.json({ success: true, data: { from, to, income, expenses, totalIncome, totalExpenses, netProfit: money(totalIncome - totalExpenses) } });
  } catch (error) {
    sendError(res, error, 'Failed to build profit and loss');
  }
});

app.get('/reports/balance-sheet', requireDB, accounting, async (req, res) => {
  const { errors, value } = check(req.query, { asOf: date() });
  if (errors) return badRequest(res, errors);
  const asOf = value.asOf || zonedToday();
  try {
    const r = await getPool().request().input('AsOf', sql.Date, asOf).query(balancesSql('je.EntryDate <= @AsOf'));
    const side = (type, sign) => r.recordset.filter(a => a.type === type)
      .map(a => ({ code: a.code, name: a.name, amount: money(sign * (a.debit - a.credit)) })).filter(a => a.amount);
    const assets = side('asset', 1);
    const liabilities = side('liability', -1);
    const equity = side('equity', -1);
    // Profit not yet closed to capital is part of equity.
    const earnings = money(r.recordset.filter(a => a.type === 'income' || a.type === 'expense')
      .reduce((s, a) => s + (a.credit - a.debit), 0));
    if (earnings) equity.push({ code: null, name: 'Retained earnings (unclosed profit)', amount: earnings });
    const total = (list) => money(list.reduce((s, a) => s + a.amount, 0));
    const totalAssets = total(assets);
    const totalLiabilitiesAndEquity = money(total(liabilities) + total(equity));
    res.json({ success: true, data: {
      asOf, assets, liabilities, equity, totalAssets, totalLiabilities: total(liabilities), totalEquity: total(equity),
      totalLiabilitiesAndEquity, balanced: totalAssets === totalLiabilitiesAndEquity
    } });
  } catch (error) {
    sendError(res, error, 'Failed to build balance sheet');
  }
});

const AGEING = `
  CASE WHEN @AsOf <= d.due THEN 'current'
       WHEN @AsOf - d.due <= 30 THEN 'd1_30'
       WHEN @AsOf - d.due <= 60 THEN 'd31_60'
       WHEN @AsOf - d.due <= 90 THEN 'd61_90'
       ELSE 'd90_plus' END`;

const ageing = async (res, docsSql, label) => {
  const asOf = zonedToday();
  const r = await getPool().request().input('AsOf', sql.Date, asOf).query(`
    SELECT d.partyId, d.party, d.number, d.id, to_char(d.docDate, 'YYYY-MM-DD') AS docDate,
           to_char(d.due, 'YYYY-MM-DD') AS dueDate, d.outstanding, GREATEST(@AsOf - d.due, 0) AS daysOverdue,
           ${AGEING} AS bucket
    FROM (${docsSql}) d WHERE d.outstanding > 0 ORDER BY d.party, d.due`);
  const parties = new Map();
  const totals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
  for (const row of r.recordset) {
    const key = row.partyId || row.party;
    if (!parties.has(key)) parties.set(key, { partyId: row.partyId, party: row.party, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0, documents: [] });
    const p = parties.get(key);
    p[row.bucket] = money(p[row.bucket] + row.outstanding);
    p.total = money(p.total + row.outstanding);
    totals[row.bucket] = money(totals[row.bucket] + row.outstanding);
    totals.total = money(totals.total + row.outstanding);
    p.documents.push({ id: row.id, number: row.number, docDate: row.docDate, dueDate: row.dueDate, outstanding: row.outstanding, daysOverdue: row.daysOverdue });
  }
  res.json({ success: true, data: { asOf, kind: label, parties: [...parties.values()], totals } });
};

app.get('/reports/receivables', requireDB, accounting, async (req, res) => {
  try {
    await ageing(res, `SELECT InvoiceID AS id, ClientID AS partyId, BuyerName AS party, InvoiceNumber AS number,
                              InvoiceDate AS docDate, DueDate AS due, GrandTotal - AmountPaid AS outstanding
                       FROM Invoices WHERE Status IN ('issued', 'partially-paid')`, 'receivables');
  } catch (error) {
    sendError(res, error, 'Failed to build receivables ageing');
  }
});

app.get('/reports/payables', requireDB, accounting, async (req, res) => {
  try {
    await ageing(res, `SELECT b.BillID AS id, b.SupplierID AS partyId, c.Name AS party, b.BillRef || ' (' || b.SupplierBillNo || ')' AS number,
                              b.BillDate AS docDate, b.DueDate AS due, b.Total - b.AmountPaid AS outstanding
                       FROM SupplierBills b JOIN Clients c ON c.ClientID = b.SupplierID
                       WHERE b.Status IN ('open', 'partially-paid')`, 'payables');
  } catch (error) {
    sendError(res, error, 'Failed to build payables ageing');
  }
});

/**
 * Output tax on invoices and input tax on supplier bills for a period, by
 * rate, and the net position. A working summary for GSTR-1 / GSTR-3B
 * preparation, not a filing: set-off order and eligibility rules are applied
 * by whoever files the return.
 */
app.get('/reports/gst', requireDB, accounting, async (req, res) => {
  const { errors, value } = check(req.query, { from: date(), to: date() });
  if (errors) return badRequest(res, errors);
  const today = zonedToday();
  const from = value.from || `${today.slice(0, 7)}-01`;
  const to = value.to || today;
  try {
    const request = () => getPool().request().input('From', sql.Date, from).input('To', sql.Date, to);
    const output = (await request().query(`
      SELECT ii.GSTRate AS gstRate, COUNT(DISTINCT i.InvoiceID) AS documents, SUM(ii.TaxableValue) AS taxableValue,
             SUM(ii.CGST) AS cgst, SUM(ii.SGST) AS sgst, SUM(ii.IGST) AS igst
      FROM Invoices i JOIN InvoiceItems ii ON ii.InvoiceID = i.InvoiceID
      WHERE i.Status <> 'cancelled' AND i.InvoiceDate BETWEEN @From AND @To
      GROUP BY ii.GSTRate ORDER BY ii.GSTRate`)).recordset;
    const b2b = (await request().query(`
      SELECT COUNT(*) FILTER (WHERE BuyerGSTIN IS NOT NULL) AS b2b, COUNT(*) FILTER (WHERE BuyerGSTIN IS NULL) AS b2c,
             COUNT(*) FILTER (WHERE Status = 'cancelled') AS cancelled
      FROM Invoices WHERE InvoiceDate BETWEEN @From AND @To`)).recordset[0];
    const input = (await request().query(`
      SELECT bi.GSTRate AS gstRate, COUNT(DISTINCT b.BillID) AS documents, SUM(bi.TaxableValue) AS taxableValue,
             SUM(bi.CGST) AS cgst, SUM(bi.SGST) AS sgst, SUM(bi.IGST) AS igst
      FROM SupplierBills b JOIN SupplierBillItems bi ON bi.BillID = b.BillID
      WHERE b.Status <> 'cancelled' AND b.BillDate BETWEEN @From AND @To
      GROUP BY bi.GSTRate ORDER BY bi.GSTRate`)).recordset;
    const sum = (rows, k) => money(rows.reduce((s, r) => s + r[k], 0));
    const totals = (rows) => ({ taxableValue: sum(rows, 'taxableValue'), cgst: sum(rows, 'cgst'), sgst: sum(rows, 'sgst'), igst: sum(rows, 'igst') });
    const out = totals(output);
    const inp = totals(input);
    res.json({ success: true, data: {
      from, to, output, input, outputTotals: out, inputTotals: inp, invoiceCounts: b2b,
      net: { cgst: money(out.cgst - inp.cgst), sgst: money(out.sgst - inp.sgst), igst: money(out.igst - inp.igst),
             total: money(out.cgst + out.sgst + out.igst - inp.cgst - inp.sgst - inp.igst) }
    } });
  } catch (error) {
    sendError(res, error, 'Failed to build GST summary');
  }
});

/** Headline figures for the accounting screen. */
app.get('/summary', requireDB, accounting, async (req, res) => {
  const today = zonedToday();
  try {
    const r = await getPool().request().input('Today', sql.Date, today).query(`
      SELECT
        (SELECT COALESCE(SUM(GrandTotal - AmountPaid), 0) FROM Invoices WHERE Status IN ('issued','partially-paid')) AS receivables,
        (SELECT COALESCE(SUM(GrandTotal - AmountPaid), 0) FROM Invoices WHERE Status IN ('issued','partially-paid') AND DueDate < @Today) AS overdueReceivables,
        (SELECT COALESCE(SUM(Total - AmountPaid), 0) FROM SupplierBills WHERE Status IN ('open','partially-paid')) AS payables,
        (SELECT COALESCE(SUM(Total - AmountPaid), 0) FROM SupplierBills WHERE Status IN ('open','partially-paid') AND DueDate < @Today) AS overduePayables,
        (SELECT COALESCE(SUM(Balance), 0) FROM vw_AccountBalances WHERE Code IN ('1000','1010')) AS cashAndBank,
        (SELECT COALESCE(SUM(Balance), 0) FROM vw_AccountBalances WHERE Code = '1200') AS inventoryValue,
        (SELECT -COALESCE(SUM(Balance), 0) FROM vw_AccountBalances WHERE Code = '2050') AS goodsNotBilled`);
    res.json({ success: true, data: r.recordset[0] });
  } catch (error) {
    sendError(res, error, 'Failed to load summary');
  }
});

app.get('/health', health);

app.listen(PORT, SERVICE_HOST, () => {
  console.log(`📒 Accounting Service running on http://${SERVICE_HOST}:${PORT}`);
});
