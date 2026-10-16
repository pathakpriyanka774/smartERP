import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { accountingAPI, ordersAPI } from '../../services/api';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import {
  formatMoney, formatNumber, formatDate, todayIST, errorMessage, downloadCsv
} from '../../utils/format';
import './Invoices.css';

/*
 * Sales Invoices: GST tax invoices issued from sales orders, and the customer
 * receipts against them. Every tax figure on this screen comes from the
 * accounting service (shared/gst.js); the browser never works out GST.
 */

const STATUS_FILTERS = [
  ['', 'All'],
  ['unpaid', 'Unpaid'],
  ['overdue', 'Overdue'],
  ['issued', 'Issued'],
  ['partially-paid', 'Partially paid'],
  ['paid', 'Paid'],
  ['cancelled', 'Cancelled']
];
const STATUS_LABELS = { issued: 'Issued', 'partially-paid': 'Partially paid', paid: 'Paid', cancelled: 'Cancelled' };
const METHODS = [['bank', 'Bank transfer'], ['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['card', 'Card']];
const METHOD_LABELS = Object.fromEntries(METHODS);
const CHIPS = [
  ['', 'All invoices'],
  ['unpaid', 'Unpaid'],
  ['overdue', 'Overdue'],
  ['paid', 'Paid'],
  ['cancelled', 'Cancelled']
];
const PREVIEW_DEBOUNCE_MS = 400;

const num = (v) => Number(v) || 0;
const statusLabel = (s) => STATUS_LABELS[s] || s || '—';
const stateLabel = (code, name) => (code ? `${code} – ${name || ''}`.trim() : '—');
const isSettingsMissing = (err) => err?.response?.status === 409 && /GSTIN/i.test(errorMessage(err, ''));

// ------------------------------------------------------------------ shared UI

function Modal({ title, onClose, busy = false, wide = false, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    if (ref.current) ref.current.focus();
    return () => { if (previous && typeof previous.focus === 'function') previous.focus(); };
  }, []);
  const onKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); }
  };
  return (
    <div className="inv-overlay">
      <div
        className={`inv-modal ${wide ? 'inv-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onKeyDown={onKeyDown}
      >
        <div className="inv-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="inv-btn inv-btn-ghost" onClick={onClose} disabled={busy}>Close</button>
        </div>
        <div className="inv-modal-body">{children}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status, overdue }) {
  return (
    <span className="inv-badges">
      <span className={`inv-badge inv-badge-${status}`}>{statusLabel(status)}</span>
      {overdue && <span className="inv-badge inv-badge-overdue">Overdue</span>}
    </span>
  );
}

function ListState({ loading, error, empty, onRetry, children }) {
  if (error) {
    return (
      <div className="inv-state inv-state-error" role="alert">
        <p>{error}</p>
        <button type="button" className="inv-btn inv-btn-secondary" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (loading && empty) return <div className="inv-state" role="status">Loading…</div>;
  return children;
}

/** Tax summary by HSN/SAC and rate, as the server worked it out. */
function TaxSummary({ rows = [], supplyType }) {
  const intra = supplyType === 'intra';
  if (!rows.length) return null;
  return (
    <table className="inv-table inv-table-compact">
      <caption>Tax summary by HSN/SAC and rate</caption>
      <thead>
        <tr>
          <th scope="col">HSN/SAC</th>
          <th scope="col" className="num">Taxable value</th>
          <th scope="col" className="num">GST %</th>
          {intra ? (
            <>
              <th scope="col" className="num">CGST</th>
              <th scope="col" className="num">SGST</th>
            </>
          ) : <th scope="col" className="num">IGST</th>}
          <th scope="col" className="num">Total tax</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.hsnCode || ''}|${r.gstRate}`}>
            <td>{r.hsnCode || '—'}</td>
            <td className="num">{formatMoney(r.taxableValue)}</td>
            <td className="num">{formatNumber(r.gstRate)}%</td>
            {intra ? (
              <>
                <td className="num">{formatMoney(r.cgst)}</td>
                <td className="num">{formatMoney(r.sgst)}</td>
              </>
            ) : <td className="num">{formatMoney(r.igst)}</td>}
            <td className="num">{formatMoney(r.totalTax)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Taxable, CGST/SGST or IGST, round off, grand total and amount in words. */
function Totals({ doc }) {
  const intra = doc.supplyType === 'intra';
  return (
    <div className="inv-totals">
      <dl>
        <div><dt>Taxable value</dt><dd>{formatMoney(doc.taxableValue)}</dd></div>
        {intra ? (
          <>
            <div><dt>CGST</dt><dd>{formatMoney(doc.cgst)}</dd></div>
            <div><dt>SGST</dt><dd>{formatMoney(doc.sgst)}</dd></div>
          </>
        ) : <div><dt>IGST</dt><dd>{formatMoney(doc.igst)}</dd></div>}
        <div><dt>Round off</dt><dd>{formatMoney(doc.roundOff)}</dd></div>
        <div className="inv-grand"><dt>Grand total</dt><dd>{formatMoney(doc.grandTotal)}</dd></div>
      </dl>
      {doc.amountInWords && <p className="inv-words"><strong>Amount in words:</strong> {doc.amountInWords}</p>}
    </div>
  );
}

// ----------------------------------------------------------- invoice document

/** Amounts on the document: Indian grouping, always two decimals, no symbol (columns say ₹). */
const amt = (n) => (Number.isFinite(Number(n))
  ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—');
const signedAmt = (n) => (Number(n) > 0 ? `+${amt(n)}` : amt(n));
const stateWithCode = (code, name) => (code ? `${name || '—'} (Code: ${code})` : '—');

/** A label: value row; renders nothing when there is no value. */
const Row = ({ label, children }) => (children === null || children === undefined || children === '' ? null : (
  <div className="invd-row"><span className="invd-label">{label}:</span><span className="invd-value">{children}</span></div>
));

/** The printable GST tax invoice. */
function InvoiceDocument({ inv }) {
  const seller = inv.seller || {};
  const intra = inv.supplyType === 'intra';
  const cancelled = inv.status === 'cancelled';
  const lines = inv.lines || [];
  const summary = inv.taxSummary || [];
  // Quantities are only added up when every line is in the same unit.
  const units = new Set(lines.map(l => l.unit || 'Nos'));
  const totalQty = units.size === 1 ? lines.reduce((t, l) => t + Number(l.quantity || 0), 0) : null;
  const sum = (rows, key) => rows.reduce((t, r) => t + Number(r[key] || 0), 0);
  const totalTax = Number(inv.cgst || 0) + Number(inv.sgst || 0) + Number(inv.igst || 0);
  const taxCols = intra ? ['cgst', 'sgst'] : ['igst'];
  const taxHead = { cgst: 'CGST', sgst: 'SGST', igst: 'IGST' };

  return (
    <article className={`inv-doc invd ${cancelled ? 'inv-doc-cancelled' : ''}`} aria-label={`Tax invoice ${inv.invoiceNumber || ''}`}>
      {cancelled && <div className="inv-watermark" aria-hidden="true">CANCELLED</div>}

      {/* Letterhead */}
      <header className="invd-head">
        <div className="invd-seller">
          <p className="invd-company">{seller.name || '—'}</p>
          {seller.address && <p className="invd-address">{seller.address}</p>}
          <div className="invd-contacts">
            <Row label="Mobile">{seller.phone}</Row>
            <Row label="Email">{seller.email}</Row>
            <Row label="Website">{seller.website}</Row>
          </div>
        </div>
        <div className="invd-titlebox">
          <h3>TAX INVOICE</h3>
          <p className="invd-copy">Original for Recipient</p>
          <Row label="GSTIN">{seller.gstin || '—'}</Row>
          <Row label="PAN">{seller.pan}</Row>
          <Row label="State">{stateWithCode(seller.stateCode, seller.stateName)}</Row>
        </div>
      </header>

      {/* Buyer and invoice details */}
      <section className="invd-parties">
        <div className="invd-box">
          <h4>Bill To</h4>
          <p className="invd-party-name">{inv.buyerName || '—'}</p>
          <Row label="Address">{inv.buyerAddress}</Row>
          <Row label="State">{inv.buyerStateCode ? stateWithCode(inv.buyerStateCode, inv.buyerStateName) : null}</Row>
          <Row label="GSTIN/UIN">{inv.buyerGstin || 'Unregistered (B2C)'}</Row>
          <Row label="Mobile">{inv.buyerPhone}</Row>
          <Row label="Email">{inv.buyerEmail}</Row>
        </div>
        <div className="invd-box">
          <h4>Invoice Details</h4>
          <Row label="Invoice No.">{inv.invoiceNumber || 'Draft (not issued)'}</Row>
          <Row label="Invoice Date">{formatDate(inv.invoiceDate)}</Row>
          <Row label="Due Date">{formatDate(inv.dueDate)}</Row>
          <Row label="Order Ref.">{inv.orderId ? `SO #${inv.orderId}` : null}</Row>
          <Row label="Place of Supply">{stateWithCode(inv.placeOfSupply, inv.placeOfSupplyName)}</Row>
          <Row label="Supply Type">{intra ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}</Row>
          <Row label="Reverse Charge">No</Row>
        </div>
      </section>

      {/* Lines */}
      <div className="inv-table-wrap">
        <table className="invd-table">
          <caption className="invd-caption">All amounts in Indian Rupees (₹)</caption>
          <thead>
            <tr>
              <th scope="col" className="c">S.No.</th>
              <th scope="col">Description of Goods / Services</th>
              <th scope="col" className="c">HSN/SAC</th>
              <th scope="col" className="num">Qty</th>
              <th scope="col" className="c">Unit</th>
              <th scope="col" className="num">Rate</th>
              <th scope="col" className="num">Taxable Value</th>
              <th scope="col" className="num">GST %</th>
              {taxCols.map(k => <th key={k} scope="col" className="num">{taxHead[k]}</th>)}
              <th scope="col" className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id || l.orderItemId || i}>
                <td className="c">{i + 1}</td>
                <td>{l.description || '—'}</td>
                <td className="c">{l.hsnCode || '—'}</td>
                <td className="num">{formatNumber(l.quantity, { decimals: 3 })}</td>
                <td className="c">{l.unit || 'Nos'}</td>
                <td className="num">{amt(l.unitPrice)}</td>
                <td className="num">{amt(l.taxableValue)}</td>
                <td className="num">{formatNumber(l.gstRate)}%</td>
                {taxCols.map(k => <td key={k} className="num">{amt(l[k])}</td>)}
                <td className="num">{amt(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="invd-total-label">Total</th>
              <td className="num">{totalQty === null ? '' : formatNumber(totalQty, { decimals: 3 })}</td>
              <td className="c">{totalQty === null ? '' : [...units][0]}</td>
              <td />
              <td className="num">{amt(inv.taxableValue)}</td>
              <td />
              {taxCols.map(k => <td key={k} className="num">{amt(inv[k])}</td>)}
              <td className="num">{amt(sum(lines, 'lineTotal'))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Words, HSN summary and bank on the left; totals on the right */}
      <section className="invd-bottom">
        <div className="invd-bottom-left">
          <div className="invd-words">
            <span className="invd-label">Amount Chargeable (in words):</span>
            <strong>{inv.amountInWords || '—'}</strong>
          </div>

          {summary.length > 0 && (
            <table className="invd-table invd-summary">
              <caption className="invd-subhead">HSN/SAC-wise Tax Summary</caption>
              <thead>
                <tr>
                  <th scope="col">HSN/SAC</th>
                  <th scope="col" className="num">Taxable Value</th>
                  <th scope="col" className="num">Rate</th>
                  {taxCols.map(k => <th key={k} scope="col" className="num">{taxHead[k]}</th>)}
                  <th scope="col" className="num">Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(r => (
                  <tr key={`${r.hsnCode || ''}|${r.gstRate}`}>
                    <td>{r.hsnCode || '—'}</td>
                    <td className="num">{amt(r.taxableValue)}</td>
                    <td className="num">{formatNumber(r.gstRate)}%</td>
                    {taxCols.map(k => <td key={k} className="num">{amt(r[k])}</td>)}
                    <td className="num">{amt(r.totalTax)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td className="num">{amt(sum(summary, 'taxableValue'))}</td>
                  <td />
                  {taxCols.map(k => <td key={k} className="num">{amt(sum(summary, k))}</td>)}
                  <td className="num">{amt(sum(summary, 'totalTax'))}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {seller.bank && (
            <div className="invd-box invd-bank">
              <h4>Bank Details</h4>
              <Row label="Account Name">{seller.name}</Row>
              <Row label="Bank Name">{seller.bank.name || '—'}</Row>
              <Row label="A/c No.">{seller.bank.account || '—'}</Row>
              <Row label="IFSC Code">{seller.bank.ifsc || '—'}</Row>
              <Row label="Branch">{seller.bank.branch}</Row>
            </div>
          )}
        </div>

        <div className="invd-totals">
          <Row label="Taxable Amount">₹{amt(inv.taxableValue)}</Row>
          {intra ? (
            <>
              <Row label="CGST">₹{amt(inv.cgst)}</Row>
              <Row label="SGST">₹{amt(inv.sgst)}</Row>
            </>
          ) : <Row label="IGST">₹{amt(inv.igst)}</Row>}
          <Row label="Total Tax">₹{amt(totalTax)}</Row>
          <Row label="Round Off">₹{signedAmt(inv.roundOff)}</Row>
          <div className="invd-grand"><span>Grand Total</span><span>₹{amt(inv.grandTotal)}</span></div>
          {Number(inv.amountPaid) > 0 && (
            <>
              <Row label="Amount Received">₹{amt(inv.amountPaid)}</Row>
              <Row label="Balance Due">₹{amt(inv.balanceDue)}</Row>
            </>
          )}
        </div>
      </section>

      {(inv.notes || seller.terms) && (
        <section className="invd-notes">
          {inv.notes && <div><h4>Notes</h4><p>{inv.notes}</p></div>}
          {seller.terms && <div><h4>Terms &amp; Conditions</h4><p className="inv-pre">{seller.terms}</p></div>}
        </section>
      )}

      {cancelled && (
        <div className="inv-doc-cancel-note invd-box">
          <h4>Cancelled</h4>
          <p>{inv.cancelReason || 'No reason recorded'}{inv.cancelledAt ? ` (${formatDate(inv.cancelledAt)})` : ''}</p>
        </div>
      )}

      <section className="invd-sign-row">
        <div className="invd-declaration">
          <h4>Declaration</h4>
          <p>We declare that this invoice shows the actual price of the goods / services described and that all particulars are true and correct.</p>
        </div>
        <div className="invd-sign">
          <p>For <strong>{seller.name || 'the seller'}</strong></p>
          <div className="invd-sign-space" />
          <p>Authorised Signatory</p>
        </div>
      </section>

      <footer className="invd-foot">
        {seller.city ? `Subject to ${seller.city} jurisdiction · ` : ''}This is a computer-generated invoice.
      </footer>
    </article>
  );
}

// --------------------------------------------------------------- invoice view

function InvoiceView({ invoiceId, initial, onClose, onChanged }) {
  const [inv, setInv] = useState(initial || null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null); // 'receipt' | 'cancel'
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [reason, setReason] = useState('');
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await accountingAPI.getInvoice(invoiceId);
      setInv(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the invoice'));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { if (!initial) load(); }, [initial, load]);

  // Print only the invoice: a copy is portalled to <body> and a scoped body
  // class hides everything else for the duration of the print.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => {
      document.body.classList.remove('inv-printing');
      setPrinting(false);
    };
    document.body.classList.add('inv-printing');
    window.addEventListener('afterprint', done);
    try {
      window.print();
    } catch (e) {
      done();
    }
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('inv-printing');
    };
  }, [printing]);

  const openReceipt = () => {
    setActionError('');
    setNotice('');
    setReceipt({
      amount: num(inv.balanceDue).toFixed(2),
      method: 'bank',
      paymentDate: todayIST(),
      reference: '',
      notes: ''
    });
    setPanel('receipt');
  };

  const openCancel = () => {
    setActionError('');
    setNotice('');
    setReason('');
    setPanel('cancel');
  };

  const submitReceipt = async (e) => {
    e.preventDefault();
    const amount = Number(receipt.amount);
    if (!(amount > 0)) { setActionError('Enter an amount greater than zero.'); return; }
    if (amount > num(inv.balanceDue)) { setActionError(`The amount cannot be more than the balance due (${formatMoney(inv.balanceDue)}).`); return; }
    if (receipt.paymentDate && receipt.paymentDate > todayIST()) { setActionError('The receipt date cannot be in the future.'); return; }
    setBusy(true);
    setActionError('');
    try {
      const body = { direction: 'in', invoiceId: inv.id, amount, method: receipt.method };
      if (receipt.paymentDate) body.paymentDate = receipt.paymentDate;
      if (receipt.reference.trim()) body.reference = receipt.reference.trim();
      if (receipt.notes.trim()) body.notes = receipt.notes.trim();
      const res = await accountingAPI.createPayment(body);
      setPanel(null);
      setNotice(`Receipt ${res.data?.data?.paymentNumber || ''} of ${formatMoney(amount)} recorded.`);
      await load();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not record the receipt'));
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async (e) => {
    e.preventDefault();
    const text = reason.trim();
    if (text.length < 3) { setActionError('Give a reason of at least 3 characters.'); return; }
    if (!window.confirm(`Cancel invoice ${inv.invoiceNumber}? The sale is reversed in the ledger and the number stays on record as cancelled. This cannot be undone.`)) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await accountingAPI.cancelInvoice(inv.id, text);
      setInv(res.data.data);
      setPanel(null);
      setNotice(`${inv.invoiceNumber} is cancelled.`);
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not cancel the invoice'));
    } finally {
      setBusy(false);
    }
  };

  const title = inv ? `Invoice ${inv.invoiceNumber}` : 'Invoice';
  const cancelled = inv?.status === 'cancelled';
  const canReceive = inv && !cancelled && inv.status !== 'paid' && num(inv.balanceDue) > 0;
  const canCancel = inv && !cancelled && num(inv.amountPaid) <= 0;
  const payments = inv?.payments || [];

  return (
    <Modal title={title} onClose={onClose} busy={busy} wide>
      {loading && !inv && <div className="inv-state" role="status">Loading invoice…</div>}
      {error && (
        <div className="inv-state inv-state-error" role="alert">
          <p>{error}</p>
          <button type="button" className="inv-btn inv-btn-secondary" onClick={load}>Try again</button>
        </div>
      )}
      {inv && (
        <>
          <div className="inv-view-bar">
            <div className="inv-view-facts">
              <StatusBadge status={inv.status} overdue={inv.overdue} />
              <span>Total <strong>{formatMoney(inv.grandTotal)}</strong></span>
              <span>Received <strong>{formatMoney(inv.amountPaid)}</strong></span>
              <span>Balance due <strong>{formatMoney(inv.balanceDue)}</strong></span>
            </div>
            <div className="inv-view-actions">
              <button type="button" className="inv-btn inv-btn-secondary" onClick={() => setPrinting(true)} disabled={printing}>Print</button>
              <button type="button" className="inv-btn inv-btn-primary" onClick={openReceipt} disabled={!canReceive || busy}>Record receipt</button>
              <button type="button" className="inv-btn inv-btn-danger" onClick={openCancel} disabled={!canCancel || busy}>Cancel invoice</button>
            </div>
          </div>
          {!cancelled && num(inv.amountPaid) > 0 && (
            <p className="inv-muted">To cancel this invoice, void its receipts first (Receipts tab).</p>
          )}

          {notice && <div className="inv-notice inv-notice-success" role="status">{notice}</div>}

          {panel === 'receipt' && receipt && (
            <form className="inv-panel" onSubmit={submitReceipt} noValidate>
              <h3>Record receipt against {inv.invoiceNumber}</h3>
              <div className="inv-form-grid">
                <div className="inv-field">
                  <label htmlFor="inv-rcpt-amount">Amount (₹)</label>
                  <input
                    id="inv-rcpt-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={num(inv.balanceDue)}
                    inputMode="decimal"
                    value={receipt.amount}
                    onChange={e => setReceipt(r => ({ ...r, amount: e.target.value }))}
                  />
                  <small>Balance due {formatMoney(inv.balanceDue)}</small>
                </div>
                <div className="inv-field">
                  <label htmlFor="inv-rcpt-method">Method</label>
                  <select id="inv-rcpt-method" value={receipt.method} onChange={e => setReceipt(r => ({ ...r, method: e.target.value }))}>
                    {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="inv-field">
                  <label htmlFor="inv-rcpt-date">Receipt date</label>
                  <input
                    id="inv-rcpt-date"
                    type="date"
                    min={inv.invoiceDate}
                    max={todayIST()}
                    value={receipt.paymentDate}
                    onChange={e => setReceipt(r => ({ ...r, paymentDate: e.target.value }))}
                  />
                </div>
                <div className="inv-field">
                  <label htmlFor="inv-rcpt-ref">Reference (UTR / cheque no.)</label>
                  <input
                    id="inv-rcpt-ref"
                    type="text"
                    maxLength={100}
                    value={receipt.reference}
                    onChange={e => setReceipt(r => ({ ...r, reference: e.target.value }))}
                  />
                </div>
                <div className="inv-field inv-field-wide">
                  <label htmlFor="inv-rcpt-notes">Notes</label>
                  <input
                    id="inv-rcpt-notes"
                    type="text"
                    maxLength={300}
                    value={receipt.notes}
                    onChange={e => setReceipt(r => ({ ...r, notes: e.target.value }))}
                  />
                </div>
              </div>
              {actionError && <div className="inv-notice inv-notice-error" role="alert">{actionError}</div>}
              <div className="inv-form-actions">
                <button type="submit" className="inv-btn inv-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save receipt'}</button>
                <button type="button" className="inv-btn inv-btn-secondary" onClick={() => setPanel(null)} disabled={busy}>Back</button>
              </div>
            </form>
          )}

          {panel === 'cancel' && (
            <form className="inv-panel inv-panel-danger" onSubmit={submitCancel} noValidate>
              <h3>Cancel {inv.invoiceNumber}</h3>
              <p className="inv-muted">
                GST requires an unbroken invoice series, so the number is not reused: it stays on record marked
                CANCELLED. The sale is reversed in the ledger and the order quantities can be invoiced again.
              </p>
              <div className="inv-field inv-field-wide">
                <label htmlFor="inv-cancel-reason">Reason for cancelling (at least 3 characters)</label>
                <textarea id="inv-cancel-reason" rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              {actionError && <div className="inv-notice inv-notice-error" role="alert">{actionError}</div>}
              <div className="inv-form-actions">
                <button type="submit" className="inv-btn inv-btn-danger" disabled={busy || reason.trim().length < 3}>
                  {busy ? 'Cancelling…' : 'Cancel invoice'}
                </button>
                <button type="button" className="inv-btn inv-btn-secondary" onClick={() => setPanel(null)} disabled={busy}>Keep invoice</button>
              </div>
            </form>
          )}

          <InvoiceDocument inv={inv} />

          <section className="inv-payments">
            <h3>Receipts against this invoice</h3>
            {payments.length === 0 ? <p className="inv-muted">No receipts recorded yet.</p> : (
              <div className="inv-table-wrap">
                <table className="inv-table inv-table-compact">
                  <thead>
                    <tr>
                      <th scope="col">Receipt no.</th>
                      <th scope="col">Date</th>
                      <th scope="col">Method</th>
                      <th scope="col">Reference</th>
                      <th scope="col" className="num">Amount</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className={p.status === 'void' ? 'inv-row-void' : ''}>
                        <td>{p.paymentNumber}</td>
                        <td>{formatDate(p.paymentDate)}</td>
                        <td>{METHOD_LABELS[p.method] || p.method}</td>
                        <td>{p.reference || '—'}</td>
                        <td className="num">{formatMoney(p.amount)}</td>
                        <td><span className={`inv-badge inv-badge-${p.status}`}>{p.status === 'void' ? 'Void' : 'Posted'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {printing && createPortal(<div className="inv-print-root"><InvoiceDocument inv={inv} /></div>, document.body)}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------- new invoice flow

function OrderPicker({ onPick }) {
  const list = usePagedList(params => accountingAPI.invoiceableOrders(params), { pageSize: 10 });
  return (
    <div>
      <p className="inv-muted">Choose a confirmed sales order with quantities still to invoice.</p>
      <div className="inv-toolbar">
        <SearchBox value={list.query} onChange={list.setQuery} placeholder="Search client or order no.…" label="Search orders" />
      </div>
      <ListState loading={list.loading} error={list.error} empty={!list.rows.length} onRetry={list.reload}>
        {!list.loading && !list.rows.length ? (
          <div className="inv-state">No orders are waiting to be invoiced.</div>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Client</th>
                  <th scope="col">Order date</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Order value</th>
                  <th scope="col" className="num">Not yet invoiced (pre-tax)</th>
                  <th scope="col"><span className="inv-sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(o => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>{o.clientName || '—'}</td>
                    <td>{formatDate(o.orderDate)}</td>
                    <td>{o.status}</td>
                    <td className="num">{formatMoney(o.totalAmount)}</td>
                    <td className="num">{formatMoney(o.uninvoicedValue)}</td>
                    <td>
                      <button type="button" className="inv-btn inv-btn-primary inv-btn-sm" onClick={() => onPick(o)}>
                        Invoice order #{o.id}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="orders" />
    </div>
  );
}

/** The request body for preview/create, plus anything to fix before sending it. */
const buildRequest = (draft) => {
  if (!draft) return { body: null, problems: [] };
  const problems = [];
  const today = todayIST();
  if (!draft.invoiceDate) problems.push('Choose an invoice date.');
  else if (draft.invoiceDate > today) problems.push('The invoice date cannot be in the future.');
  const gstin = draft.buyerGstin.trim().toUpperCase();
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) problems.push('Buyer GSTIN must be 15 letters and digits.');
  const lines = [];
  draft.lines.forEach((l, i) => {
    const raw = String(l.quantity).trim();
    const q = Number(raw);
    if (raw === '' || !Number.isInteger(q) || q < 0) {
      problems.push(`Line ${i + 1}: quantity must be a whole number.`);
      return;
    }
    if (q > l.remaining) problems.push(`Line ${i + 1}: only ${formatNumber(l.remaining)} left to invoice.`);
    const hsn = l.hsnCode.trim();
    if (hsn && !/^\d{4,8}$/.test(hsn)) problems.push(`Line ${i + 1}: HSN/SAC code must be 4–8 digits.`);
    if (q === 0) return;
    const line = { orderItemId: l.orderItemId, quantity: q };
    if (hsn) line.hsnCode = hsn;
    if (l.gstRate !== '') line.gstRate = Number(l.gstRate);
    lines.push(line);
  });
  if (!lines.length && !problems.length) problems.push('Invoice at least one line (quantity above zero).');
  const body = { orderId: draft.orderId, invoiceDate: draft.invoiceDate, lines };
  if (draft.placeOfSupply) body.placeOfSupply = draft.placeOfSupply;
  if (gstin) body.buyerGstin = gstin;
  if (draft.notes.trim()) body.notes = draft.notes.trim();
  return { body, problems };
};

function SettingsMissing() {
  return (
    <div className="inv-notice inv-notice-warn" role="alert">
      The company GSTIN and state are not set, so invoices cannot be issued yet. An admin needs to fill in{' '}
      <Link to="/company-settings">Company Settings</Link> (company name, GSTIN and state) first.
    </div>
  );
}

function NewInvoice({ reference, onClose, onIssued, initialOrderId = null }) {
  const [order, setOrder] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewedKey, setPreviewedKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);

  const { body, problems } = useMemo(() => buildRequest(draft), [draft]);

  // Opened from Orders → "Create invoice": start on that order.
  const started = useRef(false);
  const bodyKey = body ? JSON.stringify(body) : null;
  const blocked = problems.length > 0;

  const pick = async (o) => {
    setOrder(o);
    setLoading(true);
    setError('');
    setSettingsMissing(false);
    try {
      const [prev, ord] = await Promise.allSettled([
        accountingAPI.previewInvoice({ orderId: o.id }),
        ordersAPI.get(o.id)
      ]);
      if (prev.status === 'rejected') throw prev.reason;
      const data = prev.value.data.data;
      // Remaining = ordered − already invoiced. Without access to the order
      // itself, the server's default (everything remaining) is the same figure.
      const items = ord.status === 'fulfilled' ? (ord.value.data?.data?.items || []) : [];
      const byId = new Map(items.map(it => [it.id, it]));
      const nextDraft = {
        orderId: o.id,
        invoiceDate: data.invoiceDate || todayIST(),
        placeOfSupply: '',
        buyerGstin: '',
        notes: '',
        lines: data.lines.map(l => {
          const it = byId.get(l.orderItemId);
          return {
            orderItemId: l.orderItemId,
            description: l.description,
            unit: l.unit,
            unitPrice: l.unitPrice,
            remaining: it ? num(it.quantity) - num(it.invoicedQuantity) : num(l.quantity),
            quantity: String(l.quantity),
            hsnCode: l.hsnCode || '',
            gstRate: l.gstRate === null || l.gstRate === undefined ? '' : String(Number(l.gstRate))
          };
        })
      };
      setPreview(data);
      setDraft(nextDraft);
      setPreviewedKey(JSON.stringify(buildRequest(nextDraft).body));
    } catch (err) {
      if (isSettingsMissing(err)) setSettingsMissing(true);
      else setError(errorMessage(err, 'Could not prepare the invoice'));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  // Ask the server again whenever the draft changes (debounced).
  useEffect(() => {
    if (initialOrderId && !started.current) {
      started.current = true;
      pick({ id: initialOrderId });
    }
    // pick is stable enough for a one-time start; re-running would restart the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderId]);

  useEffect(() => {
    if (!bodyKey || blocked || bodyKey === previewedKey) {
      if (blocked) { seq.current += 1; setPreviewing(false); }
      return undefined;
    }
    const mine = ++seq.current;
    setPreviewing(true);
    setError('');
    const t = setTimeout(async () => {
      try {
        const res = await accountingAPI.previewInvoice(JSON.parse(bodyKey));
        if (mine !== seq.current) return;
        setPreview(res.data.data);
        setPreviewedKey(bodyKey);
        setError('');
      } catch (err) {
        if (mine !== seq.current) return;
        if (isSettingsMissing(err)) setSettingsMissing(true);
        setError(errorMessage(err, 'Could not work out the invoice'));
        // Remember the attempt so the same draft is not re-sent in a loop.
        setPreviewedKey(bodyKey);
      } finally {
        if (mine === seq.current) setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [bodyKey, blocked, previewedKey]);

  const setField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setLine = (id, k, v) => setDraft(d => ({ ...d, lines: d.lines.map(l => (l.orderItemId === id ? { ...l, [k]: v } : l)) }));

  const upToDate = !!bodyKey && bodyKey === previewedKey && !previewing && !error && !blocked;

  const issue = async () => {
    if (!upToDate) return;
    setSaving(true);
    setError('');
    try {
      const res = await accountingAPI.createInvoice(JSON.parse(bodyKey));
      onIssued(res.data.data);
    } catch (err) {
      if (isSettingsMissing(err)) setSettingsMissing(true);
      else setError(errorMessage(err, 'Could not issue the invoice'));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    seq.current += 1;
    setOrder(null); setDraft(null); setPreview(null); setPreviewedKey(null); setError(''); setPreviewing(false);
  };

  const rates = reference?.rates || [];
  const states = reference?.states || [];
  const serverLines = new Map((preview?.lines || []).map(l => [l.orderItemId, l]));
  const intra = preview?.supplyType === 'intra';

  return (
    <Modal title={order ? `New invoice — order #${order.id}` : 'New invoice — choose an order'} onClose={onClose} busy={saving} wide>
      {settingsMissing && <SettingsMissing />}
      {!order && !loading && <OrderPicker onPick={pick} />}
      {!order && error && <div className="inv-notice inv-notice-error" role="alert">{error}</div>}
      {loading && <div className="inv-state" role="status">Preparing invoice…</div>}

      {order && draft && preview && (
        <div className="inv-new">
          <div className="inv-new-buyer">
            <div>
              <h3>{preview.buyerName}</h3>
              <p className="inv-muted">{preview.buyerAddress || 'No address on file'}</p>
              <p className="inv-muted">GSTIN: {preview.buyerGstin || 'Unregistered buyer'}</p>
            </div>
            <button type="button" className="inv-btn inv-btn-ghost" onClick={back} disabled={saving}>Choose another order</button>
          </div>

          <div className="inv-form-grid">
            <div className="inv-field">
              <label htmlFor="inv-new-date">Invoice date</label>
              <input id="inv-new-date" type="date" max={todayIST()} value={draft.invoiceDate} onChange={e => setField('invoiceDate', e.target.value)} />
            </div>
            <div className="inv-field">
              <label htmlFor="inv-new-pos">Place of supply</label>
              <select id="inv-new-pos" value={draft.placeOfSupply} onChange={e => setField('placeOfSupply', e.target.value)}>
                <option value="">Automatic{previewedKey && !draft.placeOfSupply ? ` (${stateLabel(preview.placeOfSupply, preview.placeOfSupplyName)})` : ''}</option>
                {states.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
              </select>
              <small>For a registered buyer it must be the state of the buyer's GSTIN.</small>
            </div>
            <div className="inv-field">
              <label htmlFor="inv-new-gstin">Buyer GSTIN (override, optional)</label>
              <input
                id="inv-new-gstin"
                type="text"
                maxLength={15}
                autoComplete="off"
                placeholder={preview.buyerGstin || '15-character GSTIN'}
                value={draft.buyerGstin}
                onChange={e => setField('buyerGstin', e.target.value.toUpperCase())}
              />
            </div>
            <div className="inv-field inv-field-wide">
              <label htmlFor="inv-new-notes">Notes (printed on the invoice)</label>
              <input id="inv-new-notes" type="text" maxLength={500} value={draft.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>

          <div className="inv-table-wrap">
            <table className="inv-table inv-edit-lines">
              <caption>Lines to invoice — set quantity to 0 to leave a line for a later invoice</caption>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col" className="num">Remaining</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">HSN/SAC</th>
                  <th scope="col">GST %</th>
                  <th scope="col" className="num">Rate</th>
                  <th scope="col" className="num">Taxable</th>
                  {intra ? (
                    <>
                      <th scope="col" className="num">CGST</th>
                      <th scope="col" className="num">SGST</th>
                    </>
                  ) : <th scope="col" className="num">IGST</th>}
                  <th scope="col" className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const s = serverLines.get(l.orderItemId);
                  const rateOptions = rates.map(r => String(r));
                  if (l.gstRate !== '' && !rateOptions.includes(l.gstRate)) rateOptions.push(l.gstRate);
                  return (
                    <tr key={l.orderItemId}>
                      <th scope="row" className="inv-row-head">{l.description}{l.unit ? <span className="inv-muted"> ({l.unit})</span> : null}</th>
                      <td className="num">{formatNumber(l.remaining)}</td>
                      <td>
                        <label className="inv-sr-only" htmlFor={`inv-q-${l.orderItemId}`}>Quantity for line {i + 1}</label>
                        <input
                          id={`inv-q-${l.orderItemId}`}
                          className="inv-input-qty"
                          type="number"
                          min="0"
                          max={l.remaining}
                          step="1"
                          inputMode="numeric"
                          value={l.quantity}
                          onChange={e => setLine(l.orderItemId, 'quantity', e.target.value)}
                        />
                      </td>
                      <td>
                        <label className="inv-sr-only" htmlFor={`inv-h-${l.orderItemId}`}>HSN/SAC code for line {i + 1}</label>
                        <input
                          id={`inv-h-${l.orderItemId}`}
                          className="inv-input-hsn"
                          type="text"
                          inputMode="numeric"
                          maxLength={8}
                          value={l.hsnCode}
                          onChange={e => setLine(l.orderItemId, 'hsnCode', e.target.value.replace(/\D/g, ''))}
                        />
                      </td>
                      <td>
                        <label className="inv-sr-only" htmlFor={`inv-r-${l.orderItemId}`}>GST rate for line {i + 1}</label>
                        <select id={`inv-r-${l.orderItemId}`} value={l.gstRate} onChange={e => setLine(l.orderItemId, 'gstRate', e.target.value)}>
                          {l.gstRate === '' && <option value="">Default</option>}
                          {rateOptions.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="num">{formatMoney(l.unitPrice)}</td>
                      <td className="num">{s ? formatMoney(s.taxableValue) : '—'}</td>
                      {intra ? (
                        <>
                          <td className="num">{s ? formatMoney(s.cgst) : '—'}</td>
                          <td className="num">{s ? formatMoney(s.sgst) : '—'}</td>
                        </>
                      ) : <td className="num">{s ? formatMoney(s.igst) : '—'}</td>}
                      <td className="num">{s ? formatMoney(s.lineTotal) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {problems.length > 0 && (
            <div className="inv-notice inv-notice-warn" role="alert">
              <ul>{problems.map(p => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {error && <div className="inv-notice inv-notice-error" role="alert">{error}</div>}

          <div className={`inv-preview-figures ${upToDate ? '' : 'inv-stale'}`} aria-busy={previewing}>
            <p className="inv-preview-status" role="status">
              {previewing ? 'Updating totals…'
                : upToDate ? `Totals worked out by the server · ${intra ? 'intra-state: CGST + SGST' : 'inter-state: IGST'} · place of supply ${stateLabel(preview.placeOfSupply, preview.placeOfSupplyName)} · due ${formatDate(preview.dueDate)}`
                  : 'Totals below are out of date — fix the issues above.'}
            </p>
            <div className="inv-doc-bottom">
              <div className="inv-doc-summary"><TaxSummary rows={preview.taxSummary} supplyType={preview.supplyType} /></div>
              <Totals doc={preview} />
            </div>
          </div>

          <div className="inv-form-actions">
            <button type="button" className="inv-btn inv-btn-primary" onClick={issue} disabled={!upToDate || saving || settingsMissing}>
              {saving ? 'Issuing…' : `Issue invoice for ${formatMoney(preview.grandTotal)}`}
            </button>
            <button type="button" className="inv-btn inv-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          </div>
          <p className="inv-muted">Issuing allocates the next invoice number and posts the sale to the ledger.</p>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ list tabs

function InvoicesTab({ status, setStatus, reloadKey, onOpen }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const list = usePagedList(params => accountingAPI.getInvoices(params), { pageSize: 25, filters: { status, from, to } });
  const { reload } = list;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    reload();
  }, [reloadKey, reload]);

  const exportCsv = () => {
    downloadCsv(`invoices-${todayIST()}-page${list.pagination.page}.csv`, list.rows, [
      ['invoiceNumber', 'Invoice no.'],
      ['invoiceDate', 'Invoice date'],
      ['dueDate', 'Due date'],
      ['buyerName', 'Buyer'],
      ['buyerGstin', 'Buyer GSTIN'],
      ['placeOfSupply', 'Place of supply'],
      ['taxableValue', 'Taxable (INR)'],
      ['cgst', 'CGST (INR)'],
      ['sgst', 'SGST (INR)'],
      ['igst', 'IGST (INR)'],
      ['grandTotal', 'Total (INR)'],
      ['balanceDue', 'Balance due (INR)'],
      [r => `${statusLabel(r.status)}${r.overdue ? ' (overdue)' : ''}`, 'Status']
    ]);
  };

  const dateProblem = from && to && from > to ? 'The “from” date is after the “to” date.' : '';

  return (
    <section className="inv-card" aria-label="Invoices">
      <div className="inv-toolbar">
        <SearchBox value={list.query} onChange={list.setQuery} placeholder="Search invoice no. or buyer…" label="Search invoices" />
        <div className="inv-field inv-field-inline">
          <label htmlFor="inv-filter-status">Status</label>
          <select id="inv-filter-status" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="inv-field inv-field-inline">
          <label htmlFor="inv-filter-from">From</label>
          <input id="inv-filter-from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="inv-field inv-field-inline">
          <label htmlFor="inv-filter-to">To</label>
          <input id="inv-filter-to" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button type="button" className="inv-btn inv-btn-secondary" onClick={exportCsv} disabled={!list.rows.length}>Export CSV (this page)</button>
      </div>
      {dateProblem && <p className="inv-field-error" role="alert">{dateProblem}</p>}
      <ListState loading={list.loading} error={list.error} empty={!list.rows.length} onRetry={list.reload}>
        {!list.loading && !list.rows.length ? (
          <div className="inv-state">
            {list.query || status || from || to ? 'No invoices match these filters.' : 'No invoices yet. Use “New invoice” to bill a confirmed order.'}
          </div>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">Invoice no.</th>
                  <th scope="col">Date</th>
                  <th scope="col">Buyer</th>
                  <th scope="col">Place of supply</th>
                  <th scope="col" className="num">Taxable</th>
                  <th scope="col" className="num">Tax</th>
                  <th scope="col" className="num">Total</th>
                  <th scope="col" className="num">Balance due</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(r => (
                  <tr key={r.id} className={`${r.overdue ? 'inv-row-overdue' : ''} ${r.status === 'cancelled' ? 'inv-row-void' : ''}`}>
                    <td>
                      <button type="button" className="inv-link" onClick={() => onOpen(r.id)}>{r.invoiceNumber}</button>
                    </td>
                    <td>{formatDate(r.invoiceDate)}</td>
                    <td>{r.buyerName || '—'}{r.buyerGstin && <span className="inv-sub">{r.buyerGstin}</span>}</td>
                    <td>{r.placeOfSupply || '—'}</td>
                    <td className="num">{formatMoney(r.taxableValue)}</td>
                    <td className="num">{formatMoney(num(r.cgst) + num(r.sgst) + num(r.igst))}</td>
                    <td className="num">{formatMoney(r.grandTotal)}</td>
                    <td className="num">{r.status === 'cancelled' ? '—' : formatMoney(r.balanceDue)}</td>
                    <td><StatusBadge status={r.status} overdue={r.overdue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="invoices" />
    </section>
  );
}

function ReceiptsTab({ reloadKey, onOpenInvoice, onChanged }) {
  const [status, setStatus] = useState('');
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [voidError, setVoidError] = useState('');
  const [notice, setNotice] = useState('');
  const list = usePagedList(params => accountingAPI.getPayments(params), { pageSize: 25, filters: { direction: 'in', status } });
  const { reload } = list;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    reload();
  }, [reloadKey, reload]);

  const startVoid = (p) => { setVoiding(p); setReason(''); setVoidError(''); setNotice(''); };

  const submitVoid = async (e) => {
    e.preventDefault();
    const text = reason.trim();
    if (text.length < 3) { setVoidError('Give a reason of at least 3 characters.'); return; }
    if (!window.confirm(`Void receipt ${voiding.paymentNumber} of ${formatMoney(voiding.amount)}? The ledger entry is reversed and the invoice balance reopens.`)) return;
    setBusy(true);
    setVoidError('');
    try {
      await accountingAPI.voidPayment(voiding.id, text);
      setNotice(`${voiding.paymentNumber} is void.`);
      setVoiding(null);
      onChanged();
      reload();
    } catch (err) {
      setVoidError(errorMessage(err, 'Could not void the receipt'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="inv-card" aria-label="Receipts">
      <div className="inv-toolbar">
        <SearchBox value={list.query} onChange={list.setQuery} placeholder="Search receipt, customer, invoice, reference…" label="Search receipts" />
        <div className="inv-field inv-field-inline">
          <label htmlFor="inv-rcpt-status">Status</label>
          <select id="inv-rcpt-status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>
      {notice && <div className="inv-notice inv-notice-success" role="status">{notice}</div>}
      <ListState loading={list.loading} error={list.error} empty={!list.rows.length} onRetry={list.reload}>
        {!list.loading && !list.rows.length ? (
          <div className="inv-state">{list.query || status ? 'No receipts match these filters.' : 'No customer receipts recorded yet.'}</div>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th scope="col">Receipt no.</th>
                  <th scope="col">Date</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Invoice</th>
                  <th scope="col">Method</th>
                  <th scope="col">Reference</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map(p => (
                  <tr key={p.id} className={p.status === 'void' ? 'inv-row-void' : ''}>
                    <td>{p.paymentNumber}</td>
                    <td>{formatDate(p.paymentDate)}</td>
                    <td>{p.partyName || '—'}</td>
                    <td>
                      {p.invoiceId
                        ? <button type="button" className="inv-link" onClick={() => onOpenInvoice(p.invoiceId)}>{p.invoiceNumber || `#${p.invoiceId}`}</button>
                        : '—'}
                    </td>
                    <td>{METHOD_LABELS[p.method] || p.method}</td>
                    <td>{p.reference || '—'}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td>
                      <span className={`inv-badge inv-badge-${p.status}`}>{p.status === 'void' ? 'Void' : 'Posted'}</span>
                      {p.status === 'void' && p.voidReason && <span className="inv-sub">{p.voidReason}</span>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="inv-btn inv-btn-danger inv-btn-sm"
                        onClick={() => startVoid(p)}
                        disabled={p.status !== 'posted' || busy}
                      >
                        Void<span className="inv-sr-only"> receipt {p.paymentNumber}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="receipts" />

      {voiding && (
        <Modal title={`Void receipt ${voiding.paymentNumber}`} onClose={() => setVoiding(null)} busy={busy}>
          <form onSubmit={submitVoid} noValidate>
            <p>
              {formatMoney(voiding.amount)} from {voiding.partyName || 'the customer'} against {voiding.invoiceNumber || 'the invoice'},
              dated {formatDate(voiding.paymentDate)}. Voiding reverses the ledger entry; the receipt stays on record as void.
            </p>
            <div className="inv-field inv-field-wide">
              <label htmlFor="inv-void-reason">Reason (at least 3 characters)</label>
              <textarea id="inv-void-reason" rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            {voidError && <div className="inv-notice inv-notice-error" role="alert">{voidError}</div>}
            <div className="inv-form-actions">
              <button type="submit" className="inv-btn inv-btn-danger" disabled={busy || reason.trim().length < 3}>{busy ? 'Voiding…' : 'Void receipt'}</button>
              <button type="button" className="inv-btn inv-btn-secondary" onClick={() => setVoiding(null)} disabled={busy}>Keep receipt</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

// ----------------------------------------------------------------- the screen

export default function Invoices() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fromOrder] = useState(() => location.state?.orderId || null);
  const [tab, setTab] = useState('invoices');
  const [status, setStatus] = useState('');
  const [counts, setCounts] = useState({});
  const [settings, setSettings] = useState(null);
  const [reference, setReference] = useState(null);
  const [showNew, setShowNew] = useState(Boolean(fromOrder));
  const [view, setView] = useState(null); // { id, initial }
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');

  const loadCounts = useCallback(async () => {
    const results = await Promise.allSettled(CHIPS.map(([s]) => accountingAPI.getInvoices({ page: 1, pageSize: 1, ...(s ? { status: s } : {}) })));
    const next = {};
    results.forEach((r, i) => {
      next[CHIPS[i][0]] = r.status === 'fulfilled' ? (r.value.data?.pagination?.total ?? null) : null;
    });
    setCounts(next);
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts, reloadKey]);

  // Consume the hand-off from Orders, so a reload does not reopen the form.
  useEffect(() => {
    if (fromOrder) navigate('.', { replace: true, state: null });
  }, [fromOrder, navigate]);

  useEffect(() => {
    let alive = true;
    accountingAPI.getSettings().then(res => { if (alive) setSettings(res.data.data); }).catch(() => {});
    accountingAPI.gstReference().then(res => { if (alive) setReference(res.data.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const changed = useCallback(() => setReloadKey(k => k + 1), []);

  const issued = (inv) => {
    setShowNew(false);
    setNotice(`Invoice ${inv.invoiceNumber} issued for ${formatMoney(inv.grandTotal)}.`);
    changed();
    setView({ id: inv.id, initial: inv });
  };

  const notReady = settings && settings.readyToInvoice === false;

  return (
    <div className="inv-page">
      <header className="inv-header">
        <div>
          <h1>Sales Invoices</h1>
          <p className="inv-subtitle">GST tax invoices from sales orders, and customer receipts against them.</p>
        </div>
        <button type="button" className="inv-btn inv-btn-primary" onClick={() => setShowNew(true)} disabled={notReady}>+ New invoice</button>
      </header>

      <ul className="inv-chips" aria-label="Invoice counts by status">
        {CHIPS.map(([s, l]) => (
          <li key={s || 'all'}>
            <button
              type="button"
              className={`inv-chip ${s === 'overdue' ? 'inv-chip-overdue' : ''} ${tab === 'invoices' && status === s ? 'active' : ''}`}
              aria-pressed={tab === 'invoices' && status === s}
              onClick={() => { setTab('invoices'); setStatus(s); }}
            >
              <span className="inv-chip-count">{counts[s] === null || counts[s] === undefined ? '—' : formatNumber(counts[s], { decimals: 0 })}</span>
              <span className="inv-chip-label">{l}</span>
            </button>
          </li>
        ))}
      </ul>

      {notReady && <SettingsMissing />}
      {notice && (
        <div className="inv-notice inv-notice-success" role="status">
          <span>{notice}</span>
          <button type="button" className="inv-btn inv-btn-ghost inv-btn-sm" onClick={() => setNotice('')}>Dismiss</button>
        </div>
      )}

      <div className="inv-tabs" role="tablist" aria-label="Sales invoices sections">
        <button type="button" role="tab" id="inv-tab-invoices" aria-selected={tab === 'invoices'} aria-controls="inv-panel-invoices"
          className={`inv-tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>Invoices</button>
        <button type="button" role="tab" id="inv-tab-receipts" aria-selected={tab === 'receipts'} aria-controls="inv-panel-receipts"
          className={`inv-tab ${tab === 'receipts' ? 'active' : ''}`} onClick={() => setTab('receipts')}>Receipts</button>
      </div>

      <div role="tabpanel" id={`inv-panel-${tab}`} aria-labelledby={`inv-tab-${tab}`}>
        {tab === 'invoices'
          ? <InvoicesTab status={status} setStatus={setStatus} reloadKey={reloadKey} onOpen={id => setView({ id })} />
          : <ReceiptsTab reloadKey={reloadKey} onOpenInvoice={id => setView({ id })} onChanged={changed} />}
      </div>

      {showNew && <NewInvoice reference={reference} initialOrderId={fromOrder} onClose={() => setShowNew(false)} onIssued={issued} />}
      {view && (
        <InvoiceView
          key={view.id}
          invoiceId={view.id}
          initial={view.initial}
          onClose={() => setView(null)}
          onChanged={changed}
        />
      )}
    </div>
  );
}
