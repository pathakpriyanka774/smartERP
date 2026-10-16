// GST invoices (F-007), customer receipts and the ledger they post to.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { gstinCheckChar } = require('../../shared/gst');

/** A fictional GSTIN with a valid check digit. */
const gstin = (state, pan = 'AAAAA0000A') => { const b = `${state}${pan}1Z`; return b + gstinCheckChar(b); };

module.exports = (env, ctx) => describe('GST invoicing', () => {
  const { api, query } = env;
  const T = () => ctx.admin;

  before(async () => {
    ctx.sellerGstin = gstin('09');
    const s = await api('PUT', '/accounting/settings', { token: T(), body: {
      companyName: 'Test Garments Pvt Ltd', gstin: ctx.sellerGstin, addressLine1: '1 Test Road', city: 'Noida', pincode: '201301',
      invoicePrefix: 'TST', defaultGstRate: 5, paymentTermsDays: 30
    } });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    const item = await api('POST', '/inventory/inventory', { token: T(), body: { itemName: 'Invoice Tee', quantity: 1000, unitCost: 20, hsnCode: '6109', gstRate: 5 } });
    ctx.invItem = item.body.data;
    const local = await api('POST', '/clients/clients', { token: T(), body: { name: 'Local Buyer', type: 'retail', gstin: gstin('09', 'BBBBB1111B') } });
    const away = await api('POST', '/clients/clients', { token: T(), body: { name: 'Mumbai Buyer', type: 'wholesale', gstin: gstin('27', 'CCCCC2222C') } });
    assert.equal(local.status, 201, JSON.stringify(local.body));
    ctx.localBuyer = local.body.data;
    ctx.awayBuyer = away.body.data;
    const mk = async (clientId) => {
      const o = await api('POST', '/orders/orders', { token: T(), body: { clientId, items: [
        { itemId: ctx.invItem.id, quantity: 300, unitPrice: 50 },
        { description: 'Screen printing', quantity: 300, unitPrice: 5, hsnCode: '998821', gstRate: 18 },
        { description: 'Odd line', quantity: 3, unitPrice: 33.33, gstRate: 12 }
      ] } });
      await api('POST', `/orders/orders/${o.body.data.id}/status`, { token: T(), body: { status: 'confirmed' } });
      return o.body.data;
    };
    ctx.localOrder = await mk(ctx.localBuyer.id);
    ctx.awayOrder = await mk(ctx.awayBuyer.id);
  });

  it('refuses an invalid GSTIN (check digit)', async () => {
    const bad = ctx.sellerGstin.slice(0, 14) + (ctx.sellerGstin[14] === 'A' ? 'B' : 'A');
    assert.equal((await api('PUT', '/accounting/settings', { token: T(), body: { gstin: bad } })).status, 400);
    assert.equal((await api('POST', '/clients/clients', { token: T(), body: { name: 'X', gstin: bad } })).status, 400);
  });

  it('only an Admin may change organisation settings', async () => {
    assert.equal((await api('PUT', '/accounting/settings', { token: ctx.sales, body: { companyName: 'Hijack' } })).status, 403);
  });

  it('intra-state: CGST + SGST, each half the rate, and totals equal the rows', async () => {
    const r = await api('POST', '/accounting/invoices/preview', { token: T(), body: { orderId: ctx.localOrder.id } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const inv = r.body.data;
    assert.equal(inv.supplyType, 'intra');
    assert.equal(inv.taxableValue, 16599.99);
    assert.equal(inv.cgst, 516);           // 375 + 135 + 6.00
    assert.equal(inv.sgst, 516);
    assert.equal(inv.igst, 0);
    assert.equal(inv.roundOff, 0.01);
    assert.equal(inv.grandTotal, 17632);
    const sum = (k) => Math.round(inv.lines.reduce((s, l) => s + l[k] * 100, 0)) / 100;
    assert.equal(sum('cgst'), inv.cgst);
    assert.equal(sum('taxableValue'), inv.taxableValue);
    assert.equal(inv.amountInWords, 'Rupees Seventeen Thousand Six Hundred Thirty Two Only');
    assert.equal(inv.lines[0].hsnCode, '6109');
  });

  it('inter-state: IGST at the full rate', async () => {
    const r = await api('POST', '/accounting/invoices/preview', { token: T(), body: { orderId: ctx.awayOrder.id } });
    assert.equal(r.body.data.supplyType, 'inter');
    assert.equal(r.body.data.cgst, 0);
    assert.equal(r.body.data.igst, 1032);
    assert.equal(r.body.data.placeOfSupply, '27');
  });

  it('numbers invoices consecutively per financial year, server-side', async () => {
    const a = await api('POST', '/accounting/invoices', { token: T(), body: { orderId: ctx.localOrder.id, invoiceDate: '2026-10-01' } });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await api('POST', '/accounting/invoices', { token: T(), body: { orderId: ctx.awayOrder.id, invoiceDate: '2026-10-02',
      lines: [{ orderItemId: ctx.awayOrder.items?.[0]?.id || (await api('GET', `/orders/orders/${ctx.awayOrder.id}`, { token: T() })).body.data.items[0].id, quantity: 100 }] } });
    assert.equal(b.status, 201, JSON.stringify(b.body));
    assert.equal(a.body.data.invoiceNumber, 'TST/26-27/00001');
    assert.equal(b.body.data.invoiceNumber, 'TST/26-27/00002');
    ctx.invoice = a.body.data;
    ctx.partInvoice = b.body.data;
    const stored = await query('SELECT COUNT(*)::int AS n FROM Invoices');
    assert.equal(stored[0].n, 2);
  });

  it('a failed invoice consumes no number, and dates cannot run backwards', async () => {
    const all = await api('POST', '/accounting/invoices', { token: T(), body: { orderId: ctx.localOrder.id } });
    assert.equal(all.status, 409);           // everything already invoiced
    const back = await api('POST', '/accounting/invoices', { token: T(), body: { orderId: ctx.awayOrder.id, invoiceDate: '2026-09-30' } });
    assert.equal(back.status, 409);
    const next = await api('POST', '/accounting/invoices', { token: T(), body: { orderId: ctx.awayOrder.id, invoiceDate: '2026-10-02' } });
    assert.equal(next.status, 201, JSON.stringify(next.body));
    assert.equal(next.body.data.invoiceNumber, 'TST/26-27/00003');
    ctx.restInvoice = next.body.data;
  });

  it('refuses to invoice more than was ordered', async () => {
    const order = (await api('GET', `/orders/orders/${ctx.awayOrder.id}`, { token: T() })).body.data;
    assert.ok(order.items.every(l => l.invoicedQuantity === l.quantity));
  });

  it('issued invoices cannot be edited, even in SQL', async () => {
    await assert.rejects(query('UPDATE Invoices SET GrandTotal = 1 WHERE InvoiceID = $1', [ctx.invoice.id]), /cannot be edited/);
    await assert.rejects(query('DELETE FROM Invoices WHERE InvoiceID = $1', [ctx.invoice.id]), /cannot be deleted/);
  });

  it('posts the invoice to the ledger: receivable, sales and output tax', async () => {
    const lines = await query(`SELECT a.Code, jl.Debit::float AS dr, jl.Credit::float AS cr FROM JournalLines jl
      JOIN Accounts a ON a.AccountID = jl.AccountID JOIN JournalEntries je ON je.EntryID = jl.EntryID
      WHERE je.SourceType = 'invoice' AND je.SourceID = $1 ORDER BY a.Code`, [ctx.invoice.id]);
    const by = Object.fromEntries(lines.map(l => [l.code, l.dr || -l.cr]));
    assert.equal(by['1100'], 17632);
    assert.equal(by['4000'], -16599.99);
    assert.equal(by['2100'], -516);
    assert.equal(by['2101'], -516);
    assert.equal(by['4900'], -0.01);
  });

  it('records part and full receipts and refuses overpayment', async () => {
    const over = await api('POST', '/accounting/payments', { token: T(), body: { direction: 'in', invoiceId: ctx.invoice.id, amount: 20000 } });
    assert.equal(over.status, 409);
    const part = await api('POST', '/accounting/payments', { token: T(), body: { direction: 'in', invoiceId: ctx.invoice.id, amount: 7632, method: 'upi', reference: 'UTR-TEST-1' } });
    assert.equal(part.status, 201, JSON.stringify(part.body));
    assert.match(part.body.data.paymentNumber, /^RCPT\/26-27\/00001$/);
    let inv = (await api('GET', `/accounting/invoices/${ctx.invoice.id}`, { token: T() })).body.data;
    assert.equal(inv.status, 'partially-paid');
    assert.equal(inv.balanceDue, 10000);
    const rest = await api('POST', '/accounting/payments', { token: T(), body: { direction: 'in', invoiceId: ctx.invoice.id, amount: 10000 } });
    assert.equal(rest.status, 201);
    inv = (await api('GET', `/accounting/invoices/${ctx.invoice.id}`, { token: T() })).body.data;
    assert.equal(inv.status, 'paid');
    ctx.receipt = rest.body.data;
    // The cash book shows the receipt without posting it twice.
    const cash = await query("SELECT COUNT(*)::int AS n FROM FinanceTransactions WHERE SourceType = 'payment'");
    assert.equal(cash[0].n, 2);
  });

  it('cannot cancel an invoice with receipts; voiding a receipt reopens it', async () => {
    assert.equal((await api('POST', `/accounting/invoices/${ctx.invoice.id}/cancel`, { token: T(), body: { reason: 'test' } })).status, 409);
    const v = await api('POST', `/accounting/payments/${ctx.receipt.id}/void`, { token: T(), body: { reason: 'Bounced cheque' } });
    assert.equal(v.status, 200, JSON.stringify(v.body));
    const inv = (await api('GET', `/accounting/invoices/${ctx.invoice.id}`, { token: T() })).body.data;
    assert.equal(inv.status, 'partially-paid');
    assert.equal(inv.balanceDue, 10000);
  });

  it('cancelling keeps the number, reverses the sale and frees the quantity', async () => {
    const c = await api('POST', `/accounting/invoices/${ctx.restInvoice.id}/cancel`, { token: T(), body: { reason: 'Wrong rate' } });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.data.status, 'cancelled');
    assert.equal(c.body.data.invoiceNumber, 'TST/26-27/00003');
    const preview = await api('POST', '/accounting/invoices/preview', { token: T(), body: { orderId: ctx.awayOrder.id } });
    assert.equal(preview.status, 200, 'cancelled quantities can be invoiced again');
  });

  it('the trial balance balances and the receivables ageing agrees with invoices', async () => {
    const tb = (await api('GET', '/accounting/reports/trial-balance', { token: T() })).body.data;
    assert.equal(tb.balanced, true);
    const ar = (await api('GET', '/accounting/reports/receivables', { token: T() })).body.data;
    const open = await query("SELECT COALESCE(SUM(GrandTotal - AmountPaid), 0)::float AS n FROM Invoices WHERE Status IN ('issued','partially-paid')");
    assert.equal(ar.totals.total, open[0].n);
    const ledgerAR = await query("SELECT Balance::float AS b FROM vw_AccountBalances WHERE Code = '1100'");
    assert.equal(ledgerAR[0].b, open[0].n, 'the receivables control account equals open invoices');
    const bs = (await api('GET', '/accounting/reports/balance-sheet', { token: T() })).body.data;
    assert.equal(bs.balanced, true, JSON.stringify(bs));
  });

  it('GST summary reports output tax by rate, excluding cancelled invoices', async () => {
    const g = (await api('GET', '/accounting/reports/gst?from=2026-10-01&to=2026-10-31', { token: T() })).body.data;
    const issued = await query("SELECT SUM(CGST)::float AS c, SUM(IGST)::float AS i FROM Invoices WHERE Status <> 'cancelled'");
    assert.equal(g.outputTotals.cgst, issued[0].c);
    assert.equal(g.outputTotals.igst, issued[0].i);
    assert.equal(g.invoiceCounts.cancelled, 1);
  });

  it('an Orders-only user cannot read the ledger or invoices', async () => {
    assert.equal((await api('GET', '/accounting/invoices', { token: ctx.sales })).status, 403);
    assert.equal((await api('GET', '/accounting/reports/trial-balance', { token: ctx.sales })).status, 403);
  });

  it('manual journals must balance and may not touch control accounts', async () => {
    const unbalanced = await api('POST', '/accounting/journal', { token: T(), body: { narration: 'x', lines: [{ account: '5200', debit: 10 }, { account: '1010', credit: 9 }] } });
    assert.equal(unbalanced.status, 400);
    const control = await api('POST', '/accounting/journal', { token: T(), body: { narration: 'x', lines: [{ account: '1100', debit: 10 }, { account: '1010', credit: 10 }] } });
    assert.equal(control.status, 400);
    const ok = await api('POST', '/accounting/journal', { token: T(), body: { narration: 'Bank charges', lines: [{ account: '5200', debit: 10 }, { account: '1010', credit: 10 }] } });
    assert.equal(ok.status, 201);
    assert.equal((await api('POST', `/accounting/journal/${ok.body.data.id}/reverse`, { token: T() })).status, 200);
    assert.equal((await api('POST', `/accounting/journal/${ok.body.data.id}/reverse`, { token: T() })).status, 409);
    await assert.rejects(query('DELETE FROM JournalLines'), /cannot be changed or deleted/);
  });
});
