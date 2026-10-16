import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { purchasesAPI, accountingAPI } from '../../services/api';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import {
  formatMoney, formatNumber, formatDate, todayIST, errorMessage, downloadCsv
} from '../../utils/format';
import './Purchases.css';

/*
 * Purchasing: purchase orders (draft → approval → receipt → bill), goods
 * receipts, supplier bills and suppliers. Every rule shown here (who may
 * approve, how much can be received or billed) is enforced by the purchase
 * service; the screen only avoids offering actions that cannot succeed.
 */

const PO_STATUS = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  'partially-received': 'Partly received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

const PO_FILTERS = [
  ['', 'All'],
  ['draft', 'Draft'],
  ['to-approve', 'To approve'],
  ['open', 'Open (approved / partly received)'],
  ['partially-received', 'Partly received'],
  ['received', 'Received'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled']
];

const BILL_STATUS = {
  open: 'Unpaid',
  'partially-paid': 'Partly paid',
  paid: 'Paid',
  cancelled: 'Cancelled'
};

const BILL_FILTERS = [
  ['', 'All'],
  ['unpaid', 'Unpaid (open + partly paid)'],
  ['overdue', 'Overdue'],
  ['open', 'Open'],
  ['partially-paid', 'Partly paid'],
  ['paid', 'Paid'],
  ['cancelled', 'Cancelled']
];

// Used only if the GST reference cannot be loaded; the server validates the rate.
const FALLBACK_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

const TABS = [
  ['orders', 'Purchase orders'],
  ['receipts', 'Goods receipts'],
  ['bills', 'Supplier bills'],
  ['suppliers', 'Suppliers']
];

const NEW_SUPPLIER = '__new';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const rateKey = (v) => (v === null || v === undefined || v === '' ? '' : String(Number(v)));
const slug = (s) => String(s || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const isWholeNumber = (s) => /^\d+$/.test(String(s).trim());

const readCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || 'null');
  } catch {
    return null;
  }
};

/** Paise-exact estimate, the same way the server totals a PO (tax per line at its rate). */
const estimateTotals = (lines) => {
  let subtotal = 0;
  let tax = 0;
  lines.forEach((l) => {
    const qty = num(l.quantity);
    const price = Math.round(num(l.unitPrice) * 100);
    const taxable = Math.round(qty * price);
    subtotal += taxable;
    tax += Math.round((taxable * num(l.gstRate)) / 100);
  });
  return { subtotal: subtotal / 100, tax: tax / 100, total: (subtotal + tax) / 100 };
};

// ---------------------------------------------------------------- shared UI

const StatusBadge = ({ status, labels, overdue = false }) => (
  <span className={`pur-badge pur-badge-${overdue ? 'overdue' : slug(status)}`}>
    {overdue ? 'Overdue' : labels[status] || status || '—'}
  </span>
);

const Notice = ({ notice, onClose }) => {
  if (!notice) return null;
  return (
    <div className={`pur-notice pur-notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      <span>{notice.text}</span>
      <button type="button" className="pur-btn-link" onClick={onClose}>Dismiss</button>
    </div>
  );
};

const ErrorList = ({ errors }) => {
  if (!errors || !errors.length) return null;
  return (
    <div className="pur-notice pur-notice-error" role="alert">
      {errors.length === 1 ? <span>{errors[0]}</span> : (
        <ul className="pur-error-list">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
    </div>
  );
};

const LoadState = ({ loading, error, onRetry, empty, emptyText, loadingText = 'Loading…' }) => {
  if (loading) return <div className="pur-state" role="status">{loadingText}</div>;
  if (error) {
    return (
      <div className="pur-state pur-state-error" role="alert">
        <p>{error}</p>
        {onRetry && <button type="button" className="pur-btn pur-btn-secondary" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  if (empty) return <div className="pur-state">{emptyText}</div>;
  return null;
};

/** A modal dialog: Escape or the Close button closes it; focus moves into it on open. */
// Open modals, innermost last, so Escape closes only the one on top.
const modalStack = [];

const Modal = ({ title, onClose, children, wide = false, busy = false }) => {
  const closeRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    modalStack.push(titleId);
    closeRef.current?.focus();
    return () => {
      const at = modalStack.lastIndexOf(titleId);
      if (at >= 0) modalStack.splice(at, 1);
      if (previous && previous.focus) previous.focus();
    };
  }, [titleId]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy && modalStack[modalStack.length - 1] === titleId) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy, titleId]);
  return (
    <div className="pur-overlay">
      <div className={`pur-modal ${wide ? 'pur-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="pur-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" ref={closeRef} className="pur-btn pur-btn-ghost" onClick={onClose} disabled={busy}>Close</button>
        </div>
        <div className="pur-modal-body">{children}</div>
      </div>
    </div>
  );
};

/** Ask before an action that is hard to undo. */
const confirmAction = (text) => window.confirm(text);

/** Re-run `reload` whenever `token` changes after the first render. */
const useReloadOn = (token, reload) => {
  const last = useRef(token);
  useEffect(() => {
    if (last.current !== token) {
      last.current = token;
      reload();
    }
  }, [token, reload]);
};

// ---------------------------------------------------------------- suppliers

const emptySupplier = () => ({
  name: '', gstin: '', stateCode: '', email: '', phone: '', address: '', city: '', pincode: '', paymentTermsDays: ''
});

const SupplierForm = ({ states, onSaved, onCancel, idPrefix = 'sup' }) => {
  const [form, setForm] = useState(emptySupplier);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = [];
    if (!form.name.trim()) errs.push('Supplier name is required.');
    const gstin = form.gstin.trim().toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) errs.push('GSTIN must be 15 characters, starting with the 2-digit state code.');
    if (form.phone.trim() && !/^[+0-9 ()-]{6,30}$/.test(form.phone.trim())) errs.push('Phone may contain only digits, spaces, +, - and brackets.');
    if (form.pincode.trim() && !/^\d{6}$/.test(form.pincode.trim())) errs.push('Pincode must be 6 digits.');
    if (form.paymentTermsDays !== '' && (!isWholeNumber(form.paymentTermsDays) || Number(form.paymentTermsDays) > 365)) {
      errs.push('Payment terms must be a whole number of days from 0 to 365.');
    }
    setErrors(errs);
    if (errs.length) return;
    const body = { name: form.name.trim() };
    ['email', 'phone', 'address', 'city', 'pincode', 'stateCode'].forEach((k) => {
      if (form[k].trim()) body[k] = form[k].trim();
    });
    if (gstin) {
      body.gstin = gstin;
      delete body.stateCode; // the server takes the state from the GSTIN
    }
    if (form.paymentTermsDays !== '') body.paymentTermsDays = Number(form.paymentTermsDays);
    setSaving(true);
    try {
      const res = await purchasesAPI.createSupplier(body);
      setForm(emptySupplier());
      onSaved(res.data.data);
    } catch (err) {
      setErrors([errorMessage(err, 'Could not save the supplier')]);
    } finally {
      setSaving(false);
    }
  };

  const field = (k, labelText, props = {}) => (
    <div className="pur-field">
      <label htmlFor={`${idPrefix}-${k}`}>{labelText}</label>
      <input id={`${idPrefix}-${k}`} value={form[k]} onChange={e => set(k, e.target.value)} disabled={saving} {...props} />
    </div>
  );

  return (
    <form className="pur-subform" onSubmit={submit} noValidate>
      <h3 className="pur-subhead">New supplier</h3>
      <div className="pur-grid">
        {field('name', 'Name *', { maxLength: 150, required: true })}
        {field('gstin', 'GSTIN', { maxLength: 15, placeholder: '27AAAAA0000A1Z5', className: 'pur-upper' })}
        <div className="pur-field">
          <label htmlFor={`${idPrefix}-stateCode`}>State</label>
          <select
            id={`${idPrefix}-stateCode`}
            value={form.stateCode}
            onChange={e => set('stateCode', e.target.value)}
            disabled={saving || Boolean(form.gstin.trim())}
          >
            <option value="">Select state…</option>
            {states.map(s => <option key={s.code} value={s.code}>{s.code} – {s.name}</option>)}
          </select>
          {form.gstin.trim() && <span className="pur-hint">Taken from the GSTIN.</span>}
        </div>
        {field('email', 'Email', { type: 'email', maxLength: 150 })}
        {field('phone', 'Phone', { type: 'tel', maxLength: 30 })}
        {field('paymentTermsDays', 'Payment terms (days)', { type: 'number', min: 0, max: 365, step: 1, inputMode: 'numeric' })}
        {field('address', 'Address', { maxLength: 300 })}
        {field('city', 'City', { maxLength: 100 })}
        {field('pincode', 'Pincode', { maxLength: 6, inputMode: 'numeric' })}
      </div>
      <p className="pur-hint">The supplier's state decides whether bills carry CGST + SGST (same state as us) or IGST.</p>
      <ErrorList errors={errors} />
      <div className="pur-actions">
        <button type="submit" className="pur-btn pur-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save supplier'}</button>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
};

// ------------------------------------------------------------ PO create/edit

let lineSeq = 0;
const newLine = (l = {}) => ({
  key: ++lineSeq,
  itemId: l.itemId ? String(l.itemId) : '',
  quantity: l.quantity !== undefined ? String(l.quantity) : '1',
  unitPrice: l.unitPrice !== undefined && l.unitPrice !== null ? String(num(l.unitPrice)) : '',
  gstRate: rateKey(l.gstRate)
});

const formFromPO = (po) => ({
  id: po?.id || null,
  poNumber: po?.poNumber || '',
  supplierChoice: po?.supplierId ? String(po.supplierId) : '',
  currentSupplier: po ? { id: po.supplierId, name: po.supplierName } : null,
  orderDate: po?.orderDate || todayIST(),
  expectedDate: po?.expectedDate || '',
  notes: po?.notes || '',
  lines: po?.items?.length ? po.items.map(newLine) : [newLine()]
});

const POForm = ({ po, prefill, lookups, onSupplierCreated, onSaved, onCancel }) => {
  // A new PO opened from Inventory ("Raise PO") starts with that item's line.
  const [form, setForm] = useState(() => {
    const f = formFromPO(po);
    const item = !po && prefill ? lookups.items.find(i => String(i.id) === String(prefill.itemId)) : null;
    return item
      ? { ...f, lines: [newLine({ itemId: item.id, quantity: prefill.quantity || 1, unitPrice: item.unitCost, gstRate: item.gstRate ?? 0 })] }
      : f;
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const editing = Boolean(po);
  const { suppliers, items, states, rates } = lookups;
  const itemById = useMemo(() => new Map(items.map(i => [String(i.id), i])), [items]);
  const activeSuppliers = suppliers.filter(s => s.status !== 'inactive');
  const known = activeSuppliers.some(s => String(s.id) === form.supplierChoice);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setLine = (key, patch) => setForm(f => ({ ...f, lines: f.lines.map(l => (l.key === key ? { ...l, ...patch } : l)) }));
  const chooseItem = (key, itemId) => {
    const item = itemById.get(itemId);
    setLine(key, item
      ? { itemId, unitPrice: item.unitCost !== null && item.unitCost !== undefined ? String(num(item.unitCost)) : '', gstRate: rateKey(item.gstRate ?? 0) }
      : { itemId });
  };
  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, newLine()] }));
  const removeLine = (key) => setForm(f => ({ ...f, lines: f.lines.filter(l => l.key !== key) }));

  const totals = estimateTotals(form.lines);
  const rateOptions = useMemo(() => {
    const all = new Set((rates.length ? rates : FALLBACK_RATES).map(rateKey));
    form.lines.forEach(l => l.gstRate !== '' && all.add(l.gstRate));
    return [...all].sort((a, b) => Number(a) - Number(b));
  }, [rates, form.lines]);

  const submit = async (e) => {
    e.preventDefault();
    const errs = [];
    if (!form.supplierChoice || form.supplierChoice === NEW_SUPPLIER) errs.push('Choose a supplier (or save the new supplier first).');
    if (form.expectedDate && form.orderDate && form.expectedDate < form.orderDate) errs.push('Expected date cannot be before the order date.');
    if (!form.lines.length) errs.push('Add at least one line.');
    form.lines.forEach((l, i) => {
      const n = i + 1;
      if (!l.itemId) errs.push(`Line ${n}: choose an item.`);
      if (!isWholeNumber(l.quantity) || Number(l.quantity) < 1) errs.push(`Line ${n}: quantity must be a whole number of at least 1.`);
      if (l.unitPrice === '' || !Number.isFinite(Number(l.unitPrice)) || Number(l.unitPrice) < 0) errs.push(`Line ${n}: enter a unit price of 0 or more.`);
    });
    setErrors(errs);
    if (errs.length) return;
    const body = {
      supplierId: Number(form.supplierChoice),
      orderDate: form.orderDate || undefined,
      expectedDate: form.expectedDate || undefined,
      notes: form.notes.trim() || undefined,
      items: form.lines.map(l => ({
        itemId: Number(l.itemId),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        ...(l.gstRate !== '' ? { gstRate: Number(l.gstRate) } : {})
      }))
    };
    setSaving(true);
    try {
      const res = editing ? await purchasesAPI.updateOrder(po.id, body) : await purchasesAPI.createOrder(body);
      onSaved(res.data.data, editing);
    } catch (err) {
      setErrors([errorMessage(err, editing ? 'Could not save the purchase order' : 'Could not create the purchase order')]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pur-form" onSubmit={submit} noValidate>
      {lookups.error && <ErrorList errors={[lookups.error]} />}
      <fieldset className="pur-fieldset" disabled={saving}>
        <legend>Supplier and dates</legend>
        <div className="pur-grid">
          <div className="pur-field">
            <label htmlFor="po-supplier">Supplier *</label>
            <select id="po-supplier" value={form.supplierChoice} onChange={e => set('supplierChoice', e.target.value)}>
              <option value="">Select a supplier…</option>
              {form.currentSupplier?.id && !known && form.supplierChoice === String(form.currentSupplier.id) && (
                <option value={String(form.currentSupplier.id)}>{form.currentSupplier.name}</option>
              )}
              {activeSuppliers.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}{s.gstin ? ` (${s.gstin})` : ''}</option>
              ))}
              <option value={NEW_SUPPLIER}>+ New supplier…</option>
            </select>
          </div>
          <div className="pur-field">
            <label htmlFor="po-date">Order date</label>
            <input id="po-date" type="date" value={form.orderDate} onChange={e => set('orderDate', e.target.value)} />
          </div>
          <div className="pur-field">
            <label htmlFor="po-expected">Expected delivery</label>
            <input id="po-expected" type="date" value={form.expectedDate} min={form.orderDate || undefined}
              onChange={e => set('expectedDate', e.target.value)} />
          </div>
        </div>
        <div className="pur-field">
          <label htmlFor="po-notes">Notes</label>
          <textarea id="po-notes" rows={2} maxLength={500} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </fieldset>

      {form.supplierChoice === NEW_SUPPLIER && (
        <SupplierForm
          idPrefix="po-newsup"
          states={states}
          onCancel={() => set('supplierChoice', '')}
          onSaved={(s) => { onSupplierCreated(s); set('supplierChoice', String(s.id)); }}
        />
      )}

      <fieldset className="pur-fieldset" disabled={saving}>
        <legend>Lines</legend>
        <div className="pur-table-wrap">
          <table className="pur-table pur-lines-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="pur-num">Quantity</th>
                <th scope="col" className="pur-num">Unit price (₹)</th>
                <th scope="col">GST rate</th>
                <th scope="col" className="pur-num">Line total</th>
                <th scope="col"><span className="pur-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {form.lines.map((l, i) => {
                const item = itemById.get(l.itemId);
                const lineTotal = num(l.quantity) * num(l.unitPrice);
                return (
                  <tr key={l.key}>
                    <td>
                      <label className="pur-sr" htmlFor={`po-line-item-${l.key}`}>Line {i + 1} item</label>
                      <select id={`po-line-item-${l.key}`} value={l.itemId} onChange={e => chooseItem(l.key, e.target.value)}>
                        <option value="">Select an item…</option>
                        {l.itemId && !item && <option value={l.itemId}>Item #{l.itemId}</option>}
                        {items.map(it => (
                          <option key={it.id} value={String(it.id)}>{it.name}{it.sku ? ` — ${it.sku}` : ''}</option>
                        ))}
                      </select>
                      {item && (
                        <span className="pur-hint">
                          SKU {item.sku || '—'} · unit {item.unit || '—'} · last cost {formatMoney(item.unitCost)}
                        </span>
                      )}
                    </td>
                    <td className="pur-num">
                      <label className="pur-sr" htmlFor={`po-line-qty-${l.key}`}>Line {i + 1} quantity</label>
                      <input id={`po-line-qty-${l.key}`} type="number" min={1} step={1} inputMode="numeric" className="pur-input-num"
                        value={l.quantity} onChange={e => setLine(l.key, { quantity: e.target.value })} />
                      {item?.unit && <span className="pur-hint">{item.unit}</span>}
                    </td>
                    <td className="pur-num">
                      <label className="pur-sr" htmlFor={`po-line-price-${l.key}`}>Line {i + 1} unit price</label>
                      <input id={`po-line-price-${l.key}`} type="number" min={0} step="0.01" inputMode="decimal" className="pur-input-num"
                        value={l.unitPrice} onChange={e => setLine(l.key, { unitPrice: e.target.value })} />
                    </td>
                    <td>
                      <label className="pur-sr" htmlFor={`po-line-gst-${l.key}`}>Line {i + 1} GST rate</label>
                      <select id={`po-line-gst-${l.key}`} value={l.gstRate} onChange={e => setLine(l.key, { gstRate: e.target.value })}>
                        <option value="">Item default</option>
                        {rateOptions.map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </td>
                    <td className="pur-num">{formatMoney(lineTotal)}</td>
                    <td>
                      <button type="button" className="pur-btn pur-btn-ghost" onClick={() => removeLine(l.key)}
                        disabled={form.lines.length === 1} aria-label={`Remove line ${i + 1}`}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={addLine}>+ Add line</button>

        <dl className="pur-totals" aria-label="Estimated totals">
          <div><dt>Subtotal</dt><dd>{formatMoney(totals.subtotal)}</dd></div>
          <div><dt>GST</dt><dd>{formatMoney(totals.tax)}</dd></div>
          <div className="pur-totals-grand"><dt>Total</dt><dd>{formatMoney(totals.total)}</dd></div>
        </dl>
        <p className="pur-hint pur-right">Estimate — final tax split is on the supplier bill.</p>
      </fieldset>

      <ErrorList errors={errors} />
      <div className="pur-actions">
        <button type="submit" className="pur-btn pur-btn-primary" disabled={saving || form.supplierChoice === NEW_SUPPLIER}>
          {saving ? 'Saving…' : editing ? 'Save draft' : 'Create draft PO'}
        </button>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
};

// ------------------------------------------------------------ receive goods

const ReceiveForm = ({ po, onDone, onCancel }) => {
  const pendingLines = po.items.filter(l => num(l.pendingQuantity) > 0);
  const [form, setForm] = useState(() => ({
    receiptDate: todayIST(),
    supplierRef: '',
    notes: '',
    lines: Object.fromEntries(pendingLines.map(l => [l.id, { accepted: '', rejected: '', reason: '' }]))
  }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const today = todayIST();
  const setLine = (id, patch) => setForm(f => ({ ...f, lines: { ...f.lines, [id]: { ...f.lines[id], ...patch } } }));
  const fillAll = () => setForm(f => ({
    ...f,
    lines: Object.fromEntries(pendingLines.map(l => [l.id, { ...f.lines[l.id], accepted: String(num(l.pendingQuantity)) }]))
  }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = [];
    if (!form.receiptDate) errs.push('Enter the receipt date.');
    else if (form.receiptDate > today) errs.push('Receipt date cannot be in the future.');
    const lines = [];
    pendingLines.forEach((l) => {
      const v = form.lines[l.id];
      const acc = v.accepted.trim() === '' ? 0 : v.accepted;
      const rej = v.rejected.trim() === '' ? 0 : v.rejected;
      if (!isWholeNumber(acc) || !isWholeNumber(rej)) {
        errs.push(`${l.description}: quantities must be whole numbers.`);
        return;
      }
      const a = Number(acc);
      const r = Number(rej);
      if (a > num(l.pendingQuantity)) errs.push(`${l.description}: only ${formatNumber(l.pendingQuantity)} still to receive.`);
      if (r > 0 && !v.reason.trim()) errs.push(`${l.description}: give a reason for the rejected quantity.`);
      if (a + r > 0) {
        lines.push({ poItemId: l.id, acceptedQuantity: a, rejectedQuantity: r, ...(r > 0 ? { rejectReason: v.reason.trim() } : {}) });
      }
    });
    if (!errs.length && !lines.length) errs.push('Enter the accepted or rejected quantity for at least one line.');
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const res = await purchasesAPI.receive(po.id, {
        receiptDate: form.receiptDate,
        supplierRef: form.supplierRef.trim() || undefined,
        notes: form.notes.trim() || undefined,
        lines
      });
      onDone(res.data.data);
    } catch (err) {
      setErrors([errorMessage(err, 'Could not record the receipt')]);
    } finally {
      setSaving(false);
    }
  };

  if (!pendingLines.length) {
    return (
      <div>
        <p className="pur-muted">Everything on this order has been received.</p>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={onCancel}>Back</button>
      </div>
    );
  }

  return (
    <form className="pur-form" onSubmit={submit} noValidate>
      <h3 className="pur-subhead">Receive goods</h3>
      <p className="pur-explain">
        Accepted goods enter stock at the PO price. Rejected goods go back to the supplier and do not count as
        received, so a replacement can still be received against this order.
      </p>
      <fieldset className="pur-fieldset" disabled={saving}>
        <legend>Receipt</legend>
        <div className="pur-grid">
          <div className="pur-field">
            <label htmlFor="grn-date">Receipt date *</label>
            <input id="grn-date" type="date" max={today} value={form.receiptDate}
              onChange={e => setForm(f => ({ ...f, receiptDate: e.target.value }))} />
          </div>
          <div className="pur-field">
            <label htmlFor="grn-ref">Supplier challan / delivery note</label>
            <input id="grn-ref" maxLength={60} value={form.supplierRef}
              onChange={e => setForm(f => ({ ...f, supplierRef: e.target.value }))} />
          </div>
          <div className="pur-field">
            <label htmlFor="grn-notes">Notes</label>
            <input id="grn-notes" maxLength={300} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </fieldset>
      <fieldset className="pur-fieldset" disabled={saving}>
        <legend>Quantities</legend>
        <button type="button" className="pur-btn pur-btn-ghost" onClick={fillAll}>Accept all pending</button>
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="pur-num">Pending</th>
                <th scope="col" className="pur-num">Accepted</th>
                <th scope="col" className="pur-num">Rejected</th>
                <th scope="col">Reject reason</th>
              </tr>
            </thead>
            <tbody>
              {pendingLines.map((l) => {
                const v = form.lines[l.id];
                return (
                  <tr key={l.id}>
                    <th scope="row" className="pur-rowhead">{l.description}<span className="pur-hint">{l.sku}</span></th>
                    <td className="pur-num">{formatNumber(l.pendingQuantity)} {l.unit}</td>
                    <td className="pur-num">
                      <label className="pur-sr" htmlFor={`grn-acc-${l.id}`}>Accepted quantity of {l.description}</label>
                      <input id={`grn-acc-${l.id}`} type="number" min={0} max={num(l.pendingQuantity)} step={1} inputMode="numeric"
                        className="pur-input-num" value={v.accepted} onChange={e => setLine(l.id, { accepted: e.target.value })} />
                    </td>
                    <td className="pur-num">
                      <label className="pur-sr" htmlFor={`grn-rej-${l.id}`}>Rejected quantity of {l.description}</label>
                      <input id={`grn-rej-${l.id}`} type="number" min={0} step={1} inputMode="numeric"
                        className="pur-input-num" value={v.rejected} onChange={e => setLine(l.id, { rejected: e.target.value })} />
                    </td>
                    <td>
                      <label className="pur-sr" htmlFor={`grn-reason-${l.id}`}>Reject reason for {l.description}</label>
                      <input id={`grn-reason-${l.id}`} maxLength={200} value={v.reason}
                        required={num(v.rejected) > 0} placeholder={num(v.rejected) > 0 ? 'Required' : ''}
                        onChange={e => setLine(l.id, { reason: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>
      <ErrorList errors={errors} />
      <div className="pur-actions">
        <button type="submit" className="pur-btn pur-btn-primary" disabled={saving}>{saving ? 'Recording…' : 'Record receipt'}</button>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={onCancel} disabled={saving}>Back</button>
      </div>
    </form>
  );
};

// ------------------------------------------------------------ book a bill

const BillSummary = ({ bill }) => (
  <dl className="pur-totals pur-totals-left" aria-label="Bill totals">
    <div><dt>Taxable value</dt><dd>{formatMoney(bill.taxableValue)}</dd></div>
    {bill.supplyType === 'inter' ? (
      <div><dt>IGST</dt><dd>{formatMoney(bill.igst)}</dd></div>
    ) : (
      <>
        <div><dt>CGST</dt><dd>{formatMoney(bill.cgst)}</dd></div>
        <div><dt>SGST</dt><dd>{formatMoney(bill.sgst)}</dd></div>
      </>
    )}
    {num(bill.roundOff) !== 0 && <div><dt>Round off</dt><dd>{formatMoney(bill.roundOff)}</dd></div>}
    <div className="pur-totals-grand"><dt>Total</dt><dd>{formatMoney(bill.total)}</dd></div>
  </dl>
);

const BillForm = ({ po, onBooked, onCancel, onView }) => {
  const billable = po.items.filter(l => num(l.unbilledQuantity) > 0);
  const today = todayIST();
  const [form, setForm] = useState(() => ({
    supplierBillNo: '',
    billDate: today,
    dueDate: '',
    notes: '',
    qty: Object.fromEntries(billable.map(l => [l.id, String(num(l.unbilledQuantity))]))
  }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [booked, setBooked] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const errs = [];
    if (!form.supplierBillNo.trim()) errs.push("Enter the supplier's bill (invoice) number.");
    if (!form.billDate) errs.push('Enter the bill date.');
    else if (form.billDate > today) errs.push('Bill date cannot be in the future.');
    if (form.dueDate && form.billDate && form.dueDate < form.billDate) errs.push('Due date cannot be before the bill date.');
    const lines = [];
    billable.forEach((l) => {
      const q = form.qty[l.id].trim() === '' ? '0' : form.qty[l.id];
      if (!isWholeNumber(q)) { errs.push(`${l.description}: quantity must be a whole number.`); return; }
      if (Number(q) > num(l.unbilledQuantity)) errs.push(`${l.description}: only ${formatNumber(l.unbilledQuantity)} received and not yet billed.`);
      if (Number(q) > 0) lines.push({ poItemId: l.id, quantity: Number(q) });
    });
    if (!errs.length && !lines.length) errs.push('Bill at least one line.');
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    try {
      const res = await purchasesAPI.createBill({
        poId: po.id,
        supplierBillNo: form.supplierBillNo.trim(),
        billDate: form.billDate,
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
        lines
      });
      setBooked(res.data.data);
      onBooked(res.data.data);
    } catch (err) {
      setErrors([err?.response?.status === 409
        ? errorMessage(err, 'This supplier bill number has already been booked for this supplier.')
        : errorMessage(err, 'Could not book the bill')]);
    } finally {
      setSaving(false);
    }
  };

  if (booked) {
    return (
      <div className="pur-result" role="status">
        <h3 className="pur-subhead">Bill {booked.billRef} booked</h3>
        <p>
          Supplier bill <strong>{booked.supplierBillNo}</strong> dated {formatDate(booked.billDate)}, due {formatDate(booked.dueDate)}
          {' '}({booked.supplyType === 'inter' ? 'inter-state: IGST' : 'intra-state: CGST + SGST'}).
        </p>
        <BillSummary bill={booked} />
        <p className="pur-hint">Pay it from Accounting → Supplier payments (needs the Accounting permission).</p>
        <div className="pur-actions">
          <button type="button" className="pur-btn pur-btn-secondary" onClick={() => onView(booked.id)}>View bill</button>
          <button type="button" className="pur-btn pur-btn-primary" onClick={onCancel}>Back to order</button>
        </div>
      </div>
    );
  }

  if (!billable.length) {
    return (
      <div>
        <p className="pur-muted">Nothing received on this order is waiting to be billed.</p>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={onCancel}>Back</button>
      </div>
    );
  }

  return (
    <form className="pur-form" onSubmit={submit} noValidate>
      <h3 className="pur-subhead">Book supplier bill</h3>
      <p className="pur-explain">
        A bill can cover only goods accepted and not yet billed, at the PO price (three-way match: order,
        receipt, bill). GST is split into CGST + SGST or IGST from the supplier's state.
      </p>
      <fieldset className="pur-fieldset" disabled={saving}>
        <legend>Bill</legend>
        <div className="pur-grid">
          <div className="pur-field">
            <label htmlFor="bill-no">Supplier bill number *</label>
            <input id="bill-no" maxLength={30} required value={form.supplierBillNo}
              onChange={e => setForm(f => ({ ...f, supplierBillNo: e.target.value }))} />
          </div>
          <div className="pur-field">
            <label htmlFor="bill-date">Bill date *</label>
            <input id="bill-date" type="date" max={today} value={form.billDate}
              onChange={e => setForm(f => ({ ...f, billDate: e.target.value }))} />
          </div>
          <div className="pur-field">
            <label htmlFor="bill-due">Due date</label>
            <input id="bill-due" type="date" min={form.billDate || undefined} value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            <span className="pur-hint">Leave blank to use the supplier's payment terms.</span>
          </div>
        </div>
        <div className="pur-field">
          <label htmlFor="bill-notes">Notes</label>
          <input id="bill-notes" maxLength={300} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </fieldset>
      <fieldset className="pur-fieldset" disabled={saving}>
        <legend>Quantities to bill</legend>
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="pur-num">Received, unbilled</th>
                <th scope="col" className="pur-num">Unit price</th>
                <th scope="col">GST</th>
                <th scope="col" className="pur-num">Quantity to bill</th>
                <th scope="col" className="pur-num">Taxable value</th>
              </tr>
            </thead>
            <tbody>
              {billable.map(l => (
                <tr key={l.id}>
                  <th scope="row" className="pur-rowhead">{l.description}<span className="pur-hint">{l.sku}</span></th>
                  <td className="pur-num">{formatNumber(l.unbilledQuantity)} {l.unit}</td>
                  <td className="pur-num">{formatMoney(l.unitPrice)}</td>
                  <td>{formatNumber(l.gstRate)}%</td>
                  <td className="pur-num">
                    <label className="pur-sr" htmlFor={`bill-qty-${l.id}`}>Quantity of {l.description} to bill</label>
                    <input id={`bill-qty-${l.id}`} type="number" min={0} max={num(l.unbilledQuantity)} step={1} inputMode="numeric"
                      className="pur-input-num" value={form.qty[l.id]}
                      onChange={e => setForm(f => ({ ...f, qty: { ...f.qty, [l.id]: e.target.value } }))} />
                  </td>
                  <td className="pur-num">{formatMoney(num(form.qty[l.id]) * num(l.unitPrice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
      <ErrorList errors={errors} />
      <div className="pur-actions">
        <button type="submit" className="pur-btn pur-btn-primary" disabled={saving}>{saving ? 'Booking…' : 'Book bill'}</button>
        <button type="button" className="pur-btn pur-btn-secondary" onClick={onCancel} disabled={saving}>Back</button>
      </div>
    </form>
  );
};

// ------------------------------------------------------------ PO detail

const PODetail = ({ id, currentUser, onClose, onChanged, onEdit, onViewBill, onViewReceipt, notify }) => {
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('view'); // view | receive | bill
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await purchasesAPI.getOrder(id);
      setPo(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the purchase order'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const CONFIRM = {
    cancel: 'Cancel this purchase order? This cannot be undone.',
    close: 'Short-close this order? Quantities not yet received will no longer be expected.',
    approve: 'Approve this purchase order? It can then be received against and billed.'
  };
  const DONE = {
    submit: 'submitted for approval', return: 'returned to draft', approve: 'approved', cancel: 'cancelled', close: 'short-closed'
  };

  const doStep = async (step) => {
    if (CONFIRM[step] && !confirmAction(`${po.poNumber}: ${CONFIRM[step]}`)) return;
    setBusy(true);
    setActionError('');
    try {
      await purchasesAPI.step(po.id, step);
      notify({ type: 'success', text: `${po.poNumber} ${DONE[step]}.` });
      onChanged();
      await load();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not update the purchase order'));
    } finally {
      setBusy(false);
    }
  };

  const title = po ? `Purchase order ${po.poNumber}` : 'Purchase order';

  const renderActions = () => {
    const s = po.status;
    const unbilled = po.items.reduce((a, l) => a + num(l.unbilledQuantity), 0);
    const received = po.items.reduce((a, l) => a + num(l.receivedQuantity), 0);
    const role = String(currentUser?.role || '').toLowerCase();
    const isRequester = currentUser?.id !== undefined && String(currentUser.id) === String(po.createdById);
    const mayReturn = isRequester || role === 'manager' || role === 'admin';
    const billButton = (
      <button type="button" className="pur-btn pur-btn-secondary" onClick={() => setMode('bill')} disabled={busy || unbilled === 0}>
        Book supplier bill
      </button>
    );
    return (
      <div className="pur-detail-actions">
        {s === 'draft' && (
          <>
            <button type="button" className="pur-btn pur-btn-secondary" onClick={() => onEdit(po)} disabled={busy}>Edit</button>
            <button type="button" className="pur-btn pur-btn-primary" onClick={() => doStep('submit')} disabled={busy}>Submit for approval</button>
            <button type="button" className="pur-btn pur-btn-danger" onClick={() => doStep('cancel')} disabled={busy}>Cancel order</button>
          </>
        )}
        {s === 'submitted' && (
          <>
            {po.canApprove ? (
              <button type="button" className="pur-btn pur-btn-primary" onClick={() => doStep('approve')} disabled={busy}>Approve</button>
            ) : (
              <p className="pur-waiting">
                {isRequester
                  ? "Waiting for a Manager's approval — you cannot approve your own order."
                  : "Waiting for a Manager's approval."}
              </p>
            )}
            {mayReturn && (
              <button type="button" className="pur-btn pur-btn-secondary" onClick={() => doStep('return')} disabled={busy}>Return to draft</button>
            )}
            <button type="button" className="pur-btn pur-btn-danger" onClick={() => doStep('cancel')} disabled={busy}>Cancel order</button>
          </>
        )}
        {(s === 'approved' || s === 'partially-received') && (
          <>
            <button type="button" className="pur-btn pur-btn-primary" onClick={() => setMode('receive')} disabled={busy}>Receive goods</button>
            {billButton}
            {s === 'partially-received' && (
              <button type="button" className="pur-btn pur-btn-danger" onClick={() => doStep('close')} disabled={busy}>Short-close</button>
            )}
            {s === 'approved' && received === 0 && (
              <button type="button" className="pur-btn pur-btn-danger" onClick={() => doStep('cancel')} disabled={busy}>Cancel order</button>
            )}
          </>
        )}
        {(s === 'received' || s === 'closed') && unbilled > 0 && billButton}
        {(s === 'approved' || s === 'partially-received') && unbilled === 0 && (
          <span className="pur-hint">Bills can be booked once goods are received.</span>
        )}
      </div>
    );
  };

  const renderView = () => (
    <>
      <div className="pur-detail-head">
        <dl className="pur-facts">
          <div><dt>Status</dt><dd><StatusBadge status={po.status} labels={PO_STATUS} /></dd></div>
          <div><dt>Supplier</dt><dd>{po.supplierName}</dd></div>
          <div><dt>Order date</dt><dd>{formatDate(po.orderDate)}</dd></div>
          <div><dt>Expected</dt><dd>{formatDate(po.expectedDate)}</dd></div>
          <div><dt>Raised by</dt><dd>{po.createdBy || '—'}</dd></div>
          <div><dt>Approved by</dt><dd>{po.approvedBy || '—'}</dd></div>
          <div><dt>Subtotal</dt><dd>{formatMoney(po.subtotal)}</dd></div>
          <div><dt>GST (estimate)</dt><dd>{formatMoney(po.taxAmount)}</dd></div>
          <div><dt>Total</dt><dd><strong>{formatMoney(po.total)}</strong></dd></div>
        </dl>
        {po.notes && <p className="pur-notes"><strong>Notes:</strong> {po.notes}</p>}
      </div>

      {renderActions()}
      {actionError && <ErrorList errors={[actionError]} />}

      <h3 className="pur-subhead">Lines</h3>
      <div className="pur-table-wrap">
        <table className="pur-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="pur-num">Unit price</th>
              <th scope="col">GST</th>
              <th scope="col" className="pur-num">Ordered</th>
              <th scope="col" className="pur-num">Received</th>
              <th scope="col" className="pur-num">Rejected</th>
              <th scope="col" className="pur-num">Billed</th>
              <th scope="col" className="pur-num">Pending</th>
              <th scope="col" className="pur-num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map(l => (
              <tr key={l.id}>
                <th scope="row" className="pur-rowhead">{l.description}<span className="pur-hint">{l.sku} · {l.unit}</span></th>
                <td className="pur-num">{formatMoney(l.unitPrice)}</td>
                <td>{formatNumber(l.gstRate)}%</td>
                <td className="pur-num">{formatNumber(l.quantity)}</td>
                <td className="pur-num">{formatNumber(l.receivedQuantity)}</td>
                <td className="pur-num">{formatNumber(l.rejectedQuantity)}</td>
                <td className="pur-num">{formatNumber(l.billedQuantity)}</td>
                <td className="pur-num">{formatNumber(l.pendingQuantity)}</td>
                <td className="pur-num">{formatMoney(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="pur-subhead">Goods receipts</h3>
      {po.receipts.length ? (
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">GRN</th>
                <th scope="col">Date</th>
                <th scope="col">Challan</th>
                <th scope="col" className="pur-num">Accepted</th>
                <th scope="col" className="pur-num">Rejected</th>
                <th scope="col"><span className="pur-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {po.receipts.map(g => (
                <tr key={g.id}>
                  <th scope="row" className="pur-rowhead">{g.grnNumber}</th>
                  <td>{formatDate(g.receiptDate)}</td>
                  <td>{g.supplierRef || '—'}</td>
                  <td className="pur-num">{formatNumber(g.accepted)}</td>
                  <td className="pur-num">{formatNumber(g.rejected)}</td>
                  <td><button type="button" className="pur-btn pur-btn-ghost" onClick={() => onViewReceipt(g.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="pur-muted">No goods received yet.</p>}

      <h3 className="pur-subhead">Supplier bills</h3>
      {po.bills.length ? (
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">Bill</th>
                <th scope="col">Supplier bill no.</th>
                <th scope="col">Date</th>
                <th scope="col" className="pur-num">Total</th>
                <th scope="col" className="pur-num">Paid</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="pur-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {po.bills.map(b => (
                <tr key={b.id}>
                  <th scope="row" className="pur-rowhead">{b.billRef}</th>
                  <td>{b.supplierBillNo}</td>
                  <td>{formatDate(b.billDate)}</td>
                  <td className="pur-num">{formatMoney(b.total)}</td>
                  <td className="pur-num">{formatMoney(b.amountPaid)}</td>
                  <td><StatusBadge status={b.status} labels={BILL_STATUS} /></td>
                  <td><button type="button" className="pur-btn pur-btn-ghost" onClick={() => onViewBill(b.id)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="pur-muted">No bills booked yet.</p>}
    </>
  );

  return (
    <Modal title={title} onClose={onClose} wide busy={busy}>
      <LoadState loading={loading && !po} error={!po ? error : ''} onRetry={load} loadingText="Loading purchase order…" />
      {po && mode === 'view' && renderView()}
      {po && mode === 'receive' && (
        <ReceiveForm
          po={po}
          onCancel={() => setMode('view')}
          onDone={(grn) => {
            notify({ type: 'success', text: `${grn.grnNumber} recorded against ${po.poNumber}; accepted goods are now in stock.` });
            setMode('view');
            onChanged();
            load();
          }}
        />
      )}
      {po && mode === 'bill' && (
        <BillForm
          po={po}
          onCancel={() => { setMode('view'); load(); }}
          onBooked={(bill) => {
            notify({ type: 'success', text: `Bill ${bill.billRef} booked for ${formatMoney(bill.total)}.` });
            onChanged();
          }}
          onView={onViewBill}
        />
      )}
    </Modal>
  );
};

// ------------------------------------------------------------ bill / receipt detail

const BillDetail = ({ id, onClose, onChanged, notify }) => {
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await purchasesAPI.getBill(id);
      setBill(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the bill'));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    if (!confirmAction(`Cancel bill ${bill.billRef}? Its accounting entry will be reversed and the quantities can be billed again.`)) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await purchasesAPI.cancelBill(bill.id);
      setBill(res.data.data);
      notify({ type: 'success', text: `Bill ${bill.billRef} cancelled.` });
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not cancel the bill'));
    } finally {
      setBusy(false);
    }
  };

  const canCancel = bill && bill.status !== 'cancelled' && num(bill.amountPaid) === 0;

  return (
    <Modal title={bill ? `Supplier bill ${bill.billRef}` : 'Supplier bill'} onClose={onClose} wide busy={busy}>
      <LoadState loading={loading && !bill} error={!bill ? error : ''} onRetry={load} loadingText="Loading bill…" />
      {bill && (
        <>
          <dl className="pur-facts">
            <div><dt>Status</dt><dd><StatusBadge status={bill.status} labels={BILL_STATUS} overdue={bill.overdue} /></dd></div>
            <div><dt>Supplier</dt><dd>{bill.supplierName}</dd></div>
            <div><dt>Supplier bill no.</dt><dd>{bill.supplierBillNo}</dd></div>
            <div><dt>Purchase order</dt><dd>{bill.poNumber || '—'}</dd></div>
            <div><dt>Bill date</dt><dd>{formatDate(bill.billDate)}</dd></div>
            <div><dt>Due date</dt><dd>{formatDate(bill.dueDate)}</dd></div>
            <div><dt>Supply</dt><dd>{bill.supplyType === 'inter' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</dd></div>
            <div><dt>Paid</dt><dd>{formatMoney(bill.amountPaid)}</dd></div>
            <div><dt>Balance due</dt><dd><strong>{formatMoney(bill.balanceDue)}</strong></dd></div>
          </dl>
          {bill.notes && <p className="pur-notes"><strong>Notes:</strong> {bill.notes}</p>}
          <BillSummary bill={bill} />

          <h3 className="pur-subhead">Lines</h3>
          <div className="pur-table-wrap">
            <table className="pur-table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col" className="pur-num">Qty</th>
                  <th scope="col" className="pur-num">Unit price</th>
                  <th scope="col" className="pur-num">Taxable</th>
                  <th scope="col">GST</th>
                  {bill.supplyType === 'inter' ? <th scope="col" className="pur-num">IGST</th> : (
                    <><th scope="col" className="pur-num">CGST</th><th scope="col" className="pur-num">SGST</th></>
                  )}
                </tr>
              </thead>
              <tbody>
                {bill.lines.map(l => (
                  <tr key={l.id}>
                    <th scope="row" className="pur-rowhead">{l.description}</th>
                    <td className="pur-num">{formatNumber(l.quantity)}</td>
                    <td className="pur-num">{formatMoney(l.unitPrice)}</td>
                    <td className="pur-num">{formatMoney(l.taxableValue)}</td>
                    <td>{formatNumber(l.gstRate)}%</td>
                    {bill.supplyType === 'inter' ? <td className="pur-num">{formatMoney(l.igst)}</td> : (
                      <><td className="pur-num">{formatMoney(l.cgst)}</td><td className="pur-num">{formatMoney(l.sgst)}</td></>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="pur-subhead">Payments</h3>
          {bill.payments.length ? (
            <div className="pur-table-wrap">
              <table className="pur-table">
                <thead>
                  <tr>
                    <th scope="col">Payment</th>
                    <th scope="col">Date</th>
                    <th scope="col">Method</th>
                    <th scope="col">Reference</th>
                    <th scope="col" className="pur-num">Amount</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.payments.map(p => (
                    <tr key={p.id}>
                      <th scope="row" className="pur-rowhead">{p.paymentNumber}</th>
                      <td>{formatDate(p.paymentDate)}</td>
                      <td>{p.method || '—'}</td>
                      <td>{p.reference || '—'}</td>
                      <td className="pur-num">{formatMoney(p.amount)}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="pur-muted">No payments yet.</p>}
          <p className="pur-hint">Paying a bill is done in Accounting → Supplier payments (needs the Accounting permission).</p>

          {actionError && <ErrorList errors={[actionError]} />}
          {bill.status !== 'cancelled' && (
            <div className="pur-detail-actions">
              <button type="button" className="pur-btn pur-btn-danger" onClick={cancel} disabled={busy || !canCancel}>
                {busy ? 'Cancelling…' : 'Cancel bill'}
              </button>
              {!canCancel && <span className="pur-hint">A bill with payments cannot be cancelled; void the payments first.</span>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

const ReceiptDetail = ({ id, onClose }) => {
  const [grn, setGrn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await purchasesAPI.getReceipt(id);
      setGrn(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the receipt'));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Modal title={grn ? `Goods receipt ${grn.grnNumber}` : 'Goods receipt'} onClose={onClose} wide>
      <LoadState loading={loading && !grn} error={!grn ? error : ''} onRetry={load} loadingText="Loading receipt…" />
      {grn && (
        <>
          <dl className="pur-facts">
            <div><dt>Purchase order</dt><dd>{grn.poNumber}</dd></div>
            <div><dt>Supplier</dt><dd>{grn.supplierName}</dd></div>
            <div><dt>Receipt date</dt><dd>{formatDate(grn.receiptDate)}</dd></div>
            <div><dt>Challan</dt><dd>{grn.supplierRef || '—'}</dd></div>
          </dl>
          {grn.notes && <p className="pur-notes"><strong>Notes:</strong> {grn.notes}</p>}
          <div className="pur-table-wrap">
            <table className="pur-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="pur-num">Accepted</th>
                  <th scope="col" className="pur-num">Rejected</th>
                  <th scope="col">Reject reason</th>
                  <th scope="col" className="pur-num">Unit price</th>
                  <th scope="col" className="pur-num">Value into stock</th>
                </tr>
              </thead>
              <tbody>
                {grn.lines.map(l => (
                  <tr key={l.poItemId}>
                    <th scope="row" className="pur-rowhead">{l.description}</th>
                    <td className="pur-num">{formatNumber(l.acceptedQuantity)}</td>
                    <td className="pur-num">{formatNumber(l.rejectedQuantity)}</td>
                    <td>{l.rejectReason || '—'}</td>
                    <td className="pur-num">{formatMoney(l.unitPrice)}</td>
                    <td className="pur-num">{formatMoney(num(l.acceptedQuantity) * num(l.unitPrice))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
};

// ------------------------------------------------------------ tabs

const FilterSelect = ({ id, value, onChange, options, labelText }) => (
  <div className="pur-filter">
    <label htmlFor={id}>{labelText}</label>
    <select id={id} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
    </select>
  </div>
);

const OrdersTab = ({ refreshToken, onOpen, onNew }) => {
  const [status, setStatus] = useState('');
  const filters = useMemo(() => ({ status }), [status]);
  const list = usePagedList(params => purchasesAPI.getOrders(params), { pageSize: 25, filters });
  useReloadOn(refreshToken, list.reload);

  const exportCsv = () => downloadCsv(`purchase-orders-${todayIST()}.csv`, list.rows, [
    ['poNumber', 'PO number'], ['orderDate', 'Order date'], ['supplierName', 'Supplier'], ['expectedDate', 'Expected date'],
    ['subtotal', 'Subtotal (INR)'], ['taxAmount', 'GST (INR)'], ['total', 'Total (INR)'], ['pendingQuantity', 'Pending qty'],
    [r => PO_STATUS[r.status] || r.status, 'Status'], ['createdBy', 'Created by']
  ]);

  return (
    <section aria-labelledby="pur-orders-h">
      <div className="pur-toolbar">
        <h2 id="pur-orders-h" className="pur-section-title">Purchase orders</h2>
        <div className="pur-toolbar-controls">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="PO number or supplier…" label="Search purchase orders" />
          <FilterSelect id="pur-po-status" labelText="Status" value={status} onChange={setStatus} options={PO_FILTERS} />
          <button type="button" className="pur-btn pur-btn-secondary" onClick={exportCsv} disabled={!list.rows.length}>Export CSV</button>
          <button type="button" className="pur-btn pur-btn-primary" onClick={onNew}>+ New PO</button>
        </div>
      </div>
      <LoadState
        loading={list.loading && !list.rows.length}
        error={list.error}
        onRetry={list.reload}
        empty={!list.rows.length}
        emptyText={list.query || status ? 'No purchase orders match.' : 'No purchase orders yet. Use “+ New PO” to raise the first one.'}
        loadingText="Loading purchase orders…"
      />
      {!list.error && list.rows.length > 0 && (
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">PO number</th>
                <th scope="col">Date</th>
                <th scope="col">Supplier</th>
                <th scope="col">Expected</th>
                <th scope="col" className="pur-num">Total</th>
                <th scope="col" className="pur-num">Pending qty</th>
                <th scope="col">Status</th>
                <th scope="col">Created by</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(po => (
                <tr key={po.id}>
                  <th scope="row" className="pur-rowhead">
                    <button type="button" className="pur-btn-link" onClick={() => onOpen(po.id)}>{po.poNumber}</button>
                  </th>
                  <td>{formatDate(po.orderDate)}</td>
                  <td>{po.supplierName}</td>
                  <td>{formatDate(po.expectedDate)}</td>
                  <td className="pur-num">{formatMoney(po.total)}</td>
                  <td className="pur-num">{formatNumber(po.pendingQuantity)}</td>
                  <td><StatusBadge status={po.status} labels={PO_STATUS} /></td>
                  <td>{po.createdBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="purchase orders" />
    </section>
  );
};

const ReceiptsTab = ({ refreshToken, onOpen }) => {
  const list = usePagedList(params => purchasesAPI.getReceipts(params), { pageSize: 25 });
  useReloadOn(refreshToken, list.reload);
  return (
    <section aria-labelledby="pur-grn-h">
      <div className="pur-toolbar">
        <h2 id="pur-grn-h" className="pur-section-title">Goods receipts</h2>
        <div className="pur-toolbar-controls">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="GRN, PO number or supplier…" label="Search goods receipts" />
        </div>
      </div>
      <p className="pur-hint">Receive goods from an approved purchase order (open it from the Purchase orders tab).</p>
      <LoadState
        loading={list.loading && !list.rows.length}
        error={list.error}
        onRetry={list.reload}
        empty={!list.rows.length}
        emptyText={list.query ? 'No receipts match.' : 'No goods received yet.'}
        loadingText="Loading receipts…"
      />
      {!list.error && list.rows.length > 0 && (
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">GRN</th>
                <th scope="col">Date</th>
                <th scope="col">PO number</th>
                <th scope="col">Supplier</th>
                <th scope="col">Challan</th>
                <th scope="col" className="pur-num">Accepted</th>
                <th scope="col" className="pur-num">Rejected</th>
                <th scope="col"><span className="pur-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(g => (
                <tr key={g.id}>
                  <th scope="row" className="pur-rowhead">{g.grnNumber}</th>
                  <td>{formatDate(g.receiptDate)}</td>
                  <td>{g.poNumber}</td>
                  <td>{g.supplierName}</td>
                  <td>{g.supplierRef || '—'}</td>
                  <td className="pur-num">{formatNumber(g.accepted)}</td>
                  <td className="pur-num">{formatNumber(g.rejected)}</td>
                  <td><button type="button" className="pur-btn pur-btn-ghost" onClick={() => onOpen(g.id)}>View lines</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="receipts" />
    </section>
  );
};

const BillsTab = ({ refreshToken, onOpen }) => {
  const [status, setStatus] = useState('');
  const filters = useMemo(() => ({ status }), [status]);
  const list = usePagedList(params => purchasesAPI.getBills(params), { pageSize: 25, filters });
  useReloadOn(refreshToken, list.reload);

  const exportCsv = () => downloadCsv(`supplier-bills-${todayIST()}.csv`, list.rows, [
    ['billRef', 'Bill ref'], ['supplierBillNo', 'Supplier bill no'], ['supplierName', 'Supplier'], ['poNumber', 'PO number'],
    ['billDate', 'Bill date'], ['dueDate', 'Due date'], ['supplyType', 'Supply type'], ['taxableValue', 'Taxable (INR)'],
    ['cgst', 'CGST (INR)'], ['sgst', 'SGST (INR)'], ['igst', 'IGST (INR)'], ['roundOff', 'Round off (INR)'], ['total', 'Total (INR)'],
    ['amountPaid', 'Paid (INR)'], ['balanceDue', 'Balance (INR)'],
    [r => (r.overdue ? 'Overdue' : BILL_STATUS[r.status] || r.status), 'Status']
  ]);

  return (
    <section aria-labelledby="pur-bills-h">
      <div className="pur-toolbar">
        <h2 id="pur-bills-h" className="pur-section-title">Supplier bills</h2>
        <div className="pur-toolbar-controls">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Bill ref, supplier bill no. or supplier…" label="Search supplier bills" />
          <FilterSelect id="pur-bill-status" labelText="Status" value={status} onChange={setStatus} options={BILL_FILTERS} />
          <button type="button" className="pur-btn pur-btn-secondary" onClick={exportCsv} disabled={!list.rows.length}>Export CSV</button>
        </div>
      </div>
      <p className="pur-hint">Book a bill from its purchase order. Paying a bill is done in Accounting → Supplier payments (needs the Accounting permission).</p>
      <LoadState
        loading={list.loading && !list.rows.length}
        error={list.error}
        onRetry={list.reload}
        empty={!list.rows.length}
        emptyText={list.query || status ? 'No bills match.' : 'No supplier bills booked yet.'}
        loadingText="Loading bills…"
      />
      {!list.error && list.rows.length > 0 && (
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">Bill</th>
                <th scope="col">Supplier bill no.</th>
                <th scope="col">Supplier</th>
                <th scope="col">PO</th>
                <th scope="col">Bill date</th>
                <th scope="col">Due date</th>
                <th scope="col" className="pur-num">Total</th>
                <th scope="col" className="pur-num">Balance due</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(b => (
                <tr key={b.id}>
                  <th scope="row" className="pur-rowhead">
                    <button type="button" className="pur-btn-link" onClick={() => onOpen(b.id)}>{b.billRef}</button>
                  </th>
                  <td>{b.supplierBillNo}</td>
                  <td>{b.supplierName}</td>
                  <td>{b.poNumber || '—'}</td>
                  <td>{formatDate(b.billDate)}</td>
                  <td>{formatDate(b.dueDate)}</td>
                  <td className="pur-num">{formatMoney(b.total)}</td>
                  <td className="pur-num">{formatMoney(b.balanceDue)}</td>
                  <td><StatusBadge status={b.status} labels={BILL_STATUS} overdue={b.overdue} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="bills" />
    </section>
  );
};

const SuppliersTab = ({ refreshToken, states, onCreated }) => {
  const list = usePagedList(params => purchasesAPI.getSuppliers(params), { pageSize: 25 });
  const [adding, setAdding] = useState(false);
  useReloadOn(refreshToken, list.reload);
  const stateName = (code) => states.find(s => s.code === code)?.name || code || '—';

  return (
    <section aria-labelledby="pur-sup-h">
      <div className="pur-toolbar">
        <h2 id="pur-sup-h" className="pur-section-title">Suppliers</h2>
        <div className="pur-toolbar-controls">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Name or GSTIN…" label="Search suppliers" />
          {!adding && <button type="button" className="pur-btn pur-btn-primary" onClick={() => setAdding(true)}>+ Add supplier</button>}
        </div>
      </div>
      {adding && (
        <SupplierForm
          idPrefix="sup-tab"
          states={states}
          onCancel={() => setAdding(false)}
          onSaved={(s) => { setAdding(false); onCreated(s); list.reload(); }}
        />
      )}
      <LoadState
        loading={list.loading && !list.rows.length}
        error={list.error}
        onRetry={list.reload}
        empty={!list.rows.length}
        emptyText={list.query ? 'No suppliers match.' : 'No suppliers yet. Add one to start raising purchase orders.'}
        loadingText="Loading suppliers…"
      />
      {!list.error && list.rows.length > 0 && (
        <div className="pur-table-wrap">
          <table className="pur-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">GSTIN</th>
                <th scope="col">State</th>
                <th scope="col">City</th>
                <th scope="col">Phone</th>
                <th scope="col">Email</th>
                <th scope="col" className="pur-num">Terms (days)</th>
                <th scope="col" className="pur-num">Outstanding</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map(s => (
                <tr key={s.id}>
                  <th scope="row" className="pur-rowhead">{s.name}</th>
                  <td>{s.gstin || '—'}</td>
                  <td>{stateName(s.stateCode)}</td>
                  <td>{s.city || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td className="pur-num">{s.paymentTermsDays ?? 'Default'}</td>
                  <td className="pur-num">{formatMoney(s.outstanding)}</td>
                  <td><span className={`pur-badge pur-badge-${slug(s.status)}`}>{s.status === 'inactive' ? 'Inactive' : 'Active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="suppliers" />
    </section>
  );
};

// ------------------------------------------------------------ screen

const Purchases = () => {
  const [tab, setTab] = useState('orders');
  const [notice, setNotice] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [poForm, setPoForm] = useState(null);          // { po, prefill } — po null for a new order
  const [poDetailId, setPoDetailId] = useState(null);
  const [billDetailId, setBillDetailId] = useState(null);
  const [receiptDetailId, setReceiptDetailId] = useState(null);
  const [lookups, setLookups] = useState({ suppliers: [], items: [], states: [], rates: [], loaded: false, loading: false, error: '' });
  const currentUser = useMemo(readCurrentUser, []);

  const refresh = useCallback(() => setRefreshToken(t => t + 1), []);

  useEffect(() => {
    if (notice?.type !== 'success') return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // GST states are needed by the supplier forms on every tab; cheap, load once.
  useEffect(() => {
    let live = true;
    accountingAPI.gstReference()
      .then(res => { if (live) setLookups(l => ({ ...l, states: res.data.data?.states || [], rates: res.data.data?.rates || [] })); })
      .catch(() => { /* the state list is optional; the rate select falls back to the standard slabs */ });
    return () => { live = false; };
  }, []);

  const ensureLookups = useCallback(async () => {
    setLookups(l => ({ ...l, loading: true, error: '' }));
    try {
      const [s, i] = await Promise.all([
        purchasesAPI.getSuppliers({ pageSize: 200 }),
        purchasesAPI.getItems({ pageSize: 500 })
      ]);
      setLookups(l => ({ ...l, suppliers: s.data.data || [], items: i.data.data || [], loaded: true, loading: false }));
    } catch (err) {
      setLookups(l => ({ ...l, loading: false, error: errorMessage(err, 'Could not load suppliers and items for the form') }));
    }
  }, []);

  const openForm = (po = null, prefill = null) => {
    setPoForm({ po, prefill });
    if (!lookups.loaded) ensureLookups();
  };

  // Hand-off from Inventory → "Raise PO": open a new PO for that item once,
  // then clear the navigation state so a reload does not reopen it.
  const location = useLocation();
  const navigate = useNavigate();
  const handoff = useRef(location.state?.newPo || null);
  useEffect(() => {
    if (!handoff.current) return;
    openForm(null, handoff.current);
    handoff.current = null;
    navigate('.', { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const supplierCreated = (s) => {
    setLookups(l => ({ ...l, suppliers: [...l.suppliers.filter(x => x.id !== s.id), s].sort((a, b) => a.name.localeCompare(b.name)) }));
    setNotice({ type: 'success', text: `Supplier ${s.name} added.` });
  };

  return (
    <div className="pur">
      <header className="pur-header">
        <h1>Purchases</h1>
        <p className="pur-lead">Raise purchase orders, get them approved, receive goods into stock and book supplier bills.</p>
        <nav className="pur-tabs" aria-label="Purchasing sections">
          {TABS.map(([key, text]) => (
            <button
              key={key}
              type="button"
              className={`pur-tab ${tab === key ? 'pur-tab-active' : ''}`}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => setTab(key)}
            >
              {text}
            </button>
          ))}
        </nav>
      </header>

      <Notice notice={notice} onClose={() => setNotice(null)} />

      {tab === 'orders' && <OrdersTab refreshToken={refreshToken} onOpen={setPoDetailId} onNew={() => openForm(null)} />}
      {tab === 'receipts' && <ReceiptsTab refreshToken={refreshToken} onOpen={setReceiptDetailId} />}
      {tab === 'bills' && <BillsTab refreshToken={refreshToken} onOpen={setBillDetailId} />}
      {tab === 'suppliers' && (
        <SuppliersTab refreshToken={refreshToken} states={lookups.states} onCreated={(s) => { supplierCreated(s); }} />
      )}

      {poDetailId && !poForm && (
        <PODetail
          id={poDetailId}
          currentUser={currentUser}
          onClose={() => setPoDetailId(null)}
          onChanged={refresh}
          onEdit={(po) => openForm(po)}
          onViewBill={setBillDetailId}
          onViewReceipt={setReceiptDetailId}
          notify={setNotice}
        />
      )}

      {poForm && (
        <Modal title={poForm.po ? `Edit draft ${poForm.po.poNumber}` : 'New purchase order'} onClose={() => setPoForm(null)} wide>
          {lookups.loading && !lookups.loaded ? (
            <div className="pur-state" role="status">Loading suppliers and items…</div>
          ) : lookups.error && !lookups.loaded ? (
            <div className="pur-state pur-state-error" role="alert">
              <p>{lookups.error}</p>
              <button type="button" className="pur-btn pur-btn-secondary" onClick={ensureLookups}>Try again</button>
            </div>
          ) : (
            <POForm
              po={poForm.po}
              prefill={poForm.prefill}
              lookups={lookups}
              onSupplierCreated={supplierCreated}
              onCancel={() => setPoForm(null)}
              onSaved={(po, edited) => {
                setPoForm(null);
                setNotice({ type: 'success', text: edited ? `${po.poNumber} saved.` : `${po.poNumber} created as a draft. Submit it for approval when ready.` });
                refresh();
                setPoDetailId(po.id);
              }}
            />
          )}
        </Modal>
      )}

      {receiptDetailId && <ReceiptDetail id={receiptDetailId} onClose={() => setReceiptDetailId(null)} />}
      {billDetailId && (
        <BillDetail id={billDetailId} onClose={() => setBillDetailId(null)} onChanged={refresh} notify={setNotice} />
      )}
    </div>
  );
};

export default Purchases;
