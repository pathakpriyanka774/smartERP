import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersAPI } from '../../services/api';
import {
  formatMoney, formatNumber, formatDate, todayIST, errorMessage, downloadCsv
} from '../../utils/format';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import RowMenu from '../common/RowMenu';
import './Orders.css';

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  'in-production': 'In production',
  ready: 'Ready',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

// Mirrors the server's allowed transitions so we only offer buttons that can
// succeed; the server still enforces them (409 otherwise).
const NEXT = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in-production', 'ready', 'dispatched', 'cancelled'],
  'in-production': ['ready', 'dispatched', 'cancelled'],
  ready: ['dispatched', 'cancelled'],
  dispatched: ['delivered', 'completed'],
  delivered: ['completed'],
  completed: [],
  cancelled: []
};

const ACTION_LABELS = {
  confirmed: 'Confirm',
  'in-production': 'Start production',
  ready: 'Mark ready',
  dispatched: 'Dispatch',
  delivered: 'Mark delivered',
  completed: 'Complete',
  cancelled: 'Cancel'
};

// Dispatch issues stock and cancel releases reservations: both are hard to undo.
const CONFIRM_TEXT = {
  dispatched: 'Dispatch this order? Stock will be issued from inventory.',
  cancelled: 'Cancel this order? Any reserved stock will be released.'
};

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const NEW_CLIENT = '__new';
const COLUMNS = 9;

// GST rates the server accepts (%). Blank = take the stock item's rate.
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
// Invoices can be raised once an order is confirmed.
const INVOICEABLE = ['confirmed', 'in-production', 'ready', 'dispatched', 'delivered', 'completed'];
const fmtRate = (r) => (r === null || r === undefined || r === '' ? '—' : `${formatNumber(r)}%`);

const label = (s) => STATUS_LABELS[s] || s || '—';
// Statuses contain hyphens and could contain spaces; normalise every run of
// unsafe characters, not just the first one.
const slug = (s) => String(s || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');

let lineSeq = 0;
const newLine = (line = {}) => ({
  key: ++lineSeq,
  itemId: line.itemId ? String(line.itemId) : '',
  description: line.description || '',
  quantity: line.quantity !== undefined ? String(line.quantity) : '1',
  unitPrice: line.unitPrice !== undefined ? String(line.unitPrice) : '',
  hsnCode: line.hsnCode || '',
  gstRate: line.gstRate !== undefined && line.gstRate !== null ? String(Number(line.gstRate)) : ''
});

const emptyForm = () => ({
  mode: 'create',
  id: null,
  status: 'pending',
  clientChoice: '',
  clientName: '',
  orderDate: todayIST(),
  deliveryDate: '',
  priority: 'medium',
  lines: [newLine()],
  originalLines: []
});

// Server validation errors may be strings or { field, message } objects.
const errorText = (e) => (typeof e === 'string' ? e : e?.message || e?.msg || JSON.stringify(e));

const Orders = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Server-paginated list; search matches client name or order number.
  const list = usePagedList(params => ordersAPI.getAll(params), { pageSize: 25, filters: { status: statusFilter } });
  const orders = list.rows;
  const loading = list.loading;
  const loadError = list.error || null;

  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState({ id: null, data: null, loading: false, error: null });

  const [busyId, setBusyId] = useState(null);   // order whose status change is in flight
  const [notice, setNotice] = useState(null);   // { type, text, items? }

  const [form, setForm] = useState(null);
  const [catalog, setCatalog] = useState({ clients: [], items: [], loaded: false, error: null });
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState([]);

  const loadStats = useCallback(async () => {
    try {
      const statsRes = await ordersAPI.getStats();
      setStats(statsRes.data || null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const { reload } = list;
  const loadOrders = useCallback(() => Promise.all([reload(), loadStats()]), [reload, loadStats]);

  // Success messages fade; warnings and errors stay until dismissed because
  // they usually need action (e.g. stock shortages after confirming).
  useEffect(() => {
    if (notice?.type !== 'success') return undefined;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const loadDetail = useCallback(async (id) => {
    setDetail({ id, data: null, loading: true, error: null });
    try {
      const res = await ordersAPI.get(id);
      setDetail({ id, data: res.data.data, loading: false, error: null });
      return res.data.data;
    } catch (err) {
      setDetail({ id, data: null, loading: false, error: errorMessage(err, 'Could not load order lines') });
      return null;
    }
  }, []);

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    loadDetail(id);
  };

  const ensureCatalog = useCallback(async () => {
    if (catalog.loaded) return;
    try {
      const [clientsRes, itemsRes] = await Promise.all([ordersAPI.catalogClients(), ordersAPI.catalogItems()]);
      setCatalog({ clients: clientsRes.data.data || [], items: itemsRes.data.data || [], loaded: true, error: null });
    } catch (err) {
      setCatalog(c => ({ ...c, error: errorMessage(err, 'Could not load clients and stock items') }));
    }
  }, [catalog.loaded]);

  // Filtering and search happen on the server; this is the current page.
  const visibleOrders = useMemo(() => orders, [orders]);

  // ---- form -------------------------------------------------------------

  const openCreate = () => {
    setFormErrors([]);
    setForm(emptyForm());
    ensureCatalog();
  };

  const openEdit = async (order) => {
    setFormErrors([]);
    ensureCatalog();
    // Fetched separately so the expanded row (possibly another order) keeps its lines.
    let full = detail.id === order.id ? detail.data : null;
    if (!full) {
      try {
        full = (await ordersAPI.get(order.id)).data.data;
      } catch (err) {
        setNotice({ type: 'error', text: `Order #${order.id}: ${errorMessage(err, 'Could not load the order for editing')}` });
        return;
      }
    }
    const lines = (full.items || []).map(newLine);
    setForm({
      mode: 'edit',
      id: full.id,
      status: full.status,
      clientChoice: full.clientId ? String(full.clientId) : NEW_CLIENT,
      clientName: full.clientId ? '' : (full.clientName || ''),
      currentClient: { id: full.clientId, name: full.clientName },
      orderDate: full.orderDate || '',
      deliveryDate: full.deliveryDate || '',
      priority: full.priority || 'medium',
      lines: lines.length ? lines : [newLine()],
      originalLines: full.items || []
    });
  };

  const closeForm = () => {
    setForm(null);
    setFormErrors([]);
  };

  const setField = (name, value) => setForm(f => ({ ...f, [name]: value }));

  const setLine = (key, name, value) => setForm(f => ({
    ...f,
    lines: f.lines.map(l => {
      if (l.key !== key) return l;
      // A stock item carries its own name, so the free-text description is cleared.
      return name === 'itemId' ? { ...l, itemId: value, description: value ? '' : l.description } : { ...l, [name]: value };
    })
  }));

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, newLine()] }));
  const removeLine = (key) => setForm(f => ({ ...f, lines: f.lines.filter(l => l.key !== key) }));

  const linesEditable = form ? form.mode === 'create' || form.status === 'pending' : false;

  // Display only: the server computes the authoritative total.
  const liveTotal = form
    ? form.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)
    : 0;

  const validate = () => {
    const errors = [];
    if (!form.clientChoice) errors.push('Choose a client or add a new one.');
    if (form.clientChoice === NEW_CLIENT && !form.clientName.trim()) errors.push('Enter the new client name.');
    if (form.orderDate && form.deliveryDate && form.deliveryDate < form.orderDate) {
      errors.push('Delivery date cannot be before the order date.');
    }
    if (linesEditable) {
      if (!form.lines.length) errors.push('Add at least one order line.');
      form.lines.forEach((l, i) => {
        const n = i + 1;
        if (!l.itemId && !l.description.trim()) errors.push(`Line ${n}: choose a stock item or enter a description.`);
        if (!/^\d+$/.test(l.quantity.trim()) || Number(l.quantity) < 1) errors.push(`Line ${n}: quantity must be a whole number of at least 1.`);
        if (l.unitPrice.trim() === '' || Number.isNaN(Number(l.unitPrice)) || Number(l.unitPrice) < 0) {
          errors.push(`Line ${n}: unit price must be 0 or more.`);
        }
        if (l.hsnCode.trim() && !/^\d{4,8}$/.test(l.hsnCode.trim())) errors.push(`Line ${n}: HSN/SAC code must be 4–8 digits.`);
      });
    }
    return errors;
  };

  const buildBody = () => {
    const body = {
      orderDate: form.orderDate || undefined,
      deliveryDate: form.deliveryDate || (form.mode === 'edit' ? null : undefined),
      priority: form.priority
    };
    if (form.clientChoice === NEW_CLIENT) body.clientName = form.clientName.trim();
    else body.clientId = Number(form.clientChoice);
    if (linesEditable) {
      body.items = form.lines.map(l => {
        const line = l.itemId
          ? { itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }
          : { description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) };
        // Left blank, the server uses the stock item's HSN code and GST rate.
        if (l.hsnCode.trim()) line.hsnCode = l.hsnCode.trim();
        if (l.gstRate !== '') line.gstRate = Number(l.gstRate);
        return line;
      });
    }
    return body;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const errors = validate();
    setFormErrors(errors);
    if (errors.length) return;

    setSaving(true);
    try {
      const body = buildBody();
      let warnings = [];
      let savedId;
      if (form.mode === 'edit') {
        const res = await ordersAPI.update(form.id, body);
        warnings = res.data.warnings || [];
        savedId = form.id;
      } else {
        const res = await ordersAPI.create(body);
        savedId = res.data.data?.id;
      }
      setNotice(warnings.length
        ? { type: 'warn', text: `Order #${savedId} saved with warnings:`, items: warnings }
        : { type: 'success', text: form.mode === 'edit'
          ? `Order #${savedId} updated.`
          : `Order #${savedId} created as pending. No invoice has been issued: confirm the order, then use More ▾ → Create invoice.` });
      closeForm();
      // A new client or changed reservations make the picker data stale.
      setCatalog(c => ({ ...c, loaded: false }));
      await loadOrders();
      if (expandedId === savedId) loadDetail(savedId);
    } catch (err) {
      const serverErrors = err?.response?.data?.errors;
      setFormErrors([
        errorMessage(err, 'Could not save the order'),
        ...(Array.isArray(serverErrors) ? serverErrors.map(errorText) : [])
      ]);
    } finally {
      setSaving(false);
    }
  };

  // ---- status -----------------------------------------------------------

  const changeStatus = async (order, next) => {
    if (CONFIRM_TEXT[next] && !window.confirm(`Order #${order.id}: ${CONFIRM_TEXT[next]}`)) return;
    setBusyId(order.id);
    try {
      const res = await ordersAPI.setStatus(order.id, next);
      const warnings = res.data.warnings || [];
      setNotice(warnings.length
        ? { type: 'warn', text: `Order #${order.id} is now ${label(next)}, with warnings:`, items: warnings }
        : { type: 'success', text: `Order #${order.id} is now ${label(next)}.` });
      setCatalog(c => ({ ...c, loaded: false }));
      await loadOrders();
      if (expandedId === order.id) loadDetail(order.id);
    } catch (err) {
      setNotice({ type: 'error', text: `Order #${order.id}: ${errorMessage(err, 'Status change failed')}` });
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(`orders-${todayIST()}.csv`, visibleOrders, [
      ['id', 'Order #'],
      ['clientName', 'Client'],
      ['orderDate', 'Order date'],
      ['deliveryDate', 'Delivery date'],
      ['priority', 'Priority'],
      [o => label(o.status), 'Status'],
      ['totalAmount', 'Total (INR)'],
      ['invoicedValue', 'Invoiced (INR)'],
      ['itemCount', 'Items']
    ]);
  };

  // ---- render -----------------------------------------------------------

  const renderKpis = () => {
    if (!stats) return null;
    const cards = [
      ['Open orders value', formatMoney(stats.openValue)],
      ['Pending', stats.pending],
      ['Confirmed', stats.confirmed],
      ['In production', stats.inProduction],
      ['Ready', stats.ready],
      ['Dispatched', stats.dispatched],
      ['Completed', stats.completed]
    ];
    return (
      <div className="orders-kpis">
        {cards.map(([title, value]) => (
          <div className="orders-kpi" key={title}>
            <span className="orders-kpi-label">{title}</span>
            <span className="orders-kpi-value">{typeof value === 'number' ? formatNumber(value, { decimals: 0 }) : (value ?? 0)}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderLinesTable = (items) => (
    <table className="order-lines-table">
      <thead>
        <tr>
          <th scope="col">Description</th>
          <th scope="col">HSN/SAC</th>
          <th scope="col" className="num">GST</th>
          <th scope="col" className="num">Qty</th>
          <th scope="col" className="num">Unit price</th>
          <th scope="col" className="num">Line total</th>
          <th scope="col" className="num">Reserved</th>
          <th scope="col" className="num">Issued</th>
          <th scope="col" className="num">Invoiced</th>
        </tr>
      </thead>
      <tbody>
        {items.map(it => (
          <tr key={it.id}>
            <td>
              {it.description || '—'}
              {it.sku && <span className="line-sku"> ({it.sku})</span>}
            </td>
            <td>{it.hsnCode || '—'}</td>
            <td className="num">{fmtRate(it.gstRate)}</td>
            <td className="num">{formatNumber(it.quantity)} {it.unit || ''}</td>
            <td className="num">{formatMoney(it.unitPrice)}</td>
            <td className="num">{formatMoney(it.lineTotal)}</td>
            <td className="num">{formatNumber(it.reservedQuantity ?? 0)}</td>
            <td className="num">{formatNumber(it.issuedQuantity ?? 0)}</td>
            <td className="num">{formatNumber(it.invoicedQuantity ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderDetail = () => {
    if (detail.loading) return <p className="orders-muted">Loading order lines…</p>;
    if (detail.error) {
      return (
        <p className="orders-inline-error">
          {detail.error}{' '}
          <button type="button" className="btn-link" onClick={() => loadDetail(expandedId)}>Retry</button>
        </p>
      );
    }
    const items = detail.data?.items || [];
    if (!items.length) return <p className="orders-muted">This order has no lines.</p>;
    return renderLinesTable(items);
  };

  const renderLineEditor = () => (
    <div className="order-lines-editor">
      {form.lines.map((l, i) => {
        const item = catalog.items.find(c => String(c.id) === l.itemId);
        const short = item && Number(l.quantity) > Number(item.available);
        return (
          <div className="line-row" key={l.key}>
            <div className="form-group line-item">
              <label htmlFor={`line-item-${l.key}`}>Line {i + 1}: stock item</label>
              <select id={`line-item-${l.key}`} value={l.itemId} onChange={e => setLine(l.key, 'itemId', e.target.value)}>
                <option value="">Free text (not a stock item)</option>
                {/* Keep an existing line's item selectable even if it left the catalogue. */}
                {l.itemId && !item && <option value={l.itemId}>Item #{l.itemId}</option>}
                {catalog.items.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}{c.sku ? ` (${c.sku})` : ''} — {formatNumber(c.available)} {c.unit || ''} available
                  </option>
                ))}
              </select>
              {short && (
                <small className="line-hint warn">
                  Only {formatNumber(item.available)} available; the shortfall will be flagged when confirming.
                </small>
              )}
            </div>
            {l.itemId ? (
              // Keeps the grid aligned; stock lines take their name from the item.
              <div className="line-total">
                <span className="line-total-label">Description</span>
                <span>{item ? item.name : `Item #${l.itemId}`}</span>
              </div>
            ) : (
              <div className="form-group line-desc">
                <label htmlFor={`line-desc-${l.key}`}>Description</label>
                <input
                  id={`line-desc-${l.key}`}
                  type="text"
                  value={l.description}
                  onChange={e => setLine(l.key, 'description', e.target.value)}
                  placeholder="e.g. Cotton T-shirts, custom print"
                />
              </div>
            )}
            <div className="form-group line-qty">
              <label htmlFor={`line-qty-${l.key}`}>Quantity</label>
              <input
                id={`line-qty-${l.key}`}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={l.quantity}
                onChange={e => setLine(l.key, 'quantity', e.target.value)}
              />
            </div>
            <div className="form-group line-price">
              <label htmlFor={`line-price-${l.key}`}>Unit price (₹)</label>
              <input
                id={`line-price-${l.key}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={l.unitPrice}
                onChange={e => setLine(l.key, 'unitPrice', e.target.value)}
              />
            </div>
            <div className="form-group line-hsn">
              <label htmlFor={`line-hsn-${l.key}`}>HSN/SAC</label>
              <input
                id={`line-hsn-${l.key}`}
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={l.hsnCode}
                onChange={e => setLine(l.key, 'hsnCode', e.target.value.replace(/\D/g, ''))}
                placeholder={item?.hsnCode || 'From item'}
              />
            </div>
            <div className="form-group line-gst">
              <label htmlFor={`line-gst-${l.key}`}>GST rate</label>
              <select id={`line-gst-${l.key}`} value={l.gstRate} onChange={e => setLine(l.key, 'gstRate', e.target.value)}>
                <option value="">{l.itemId ? 'From item' : 'Not set'}</option>
                {GST_RATES.map(r => <option key={r} value={String(r)}>{r}%</option>)}
              </select>
            </div>
            <div className="line-total">
              <span className="line-total-label">Line total</span>
              <span>{formatMoney((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))}</span>
            </div>
            <button
              type="button"
              className="btn-remove-line"
              onClick={() => removeLine(l.key)}
              disabled={form.lines.length === 1}
              aria-label={`Remove line ${i + 1}`}
            >
              Remove
            </button>
          </div>
        );
      })}
      <button type="button" className="btn-add-line" onClick={addLine}>+ Add line</button>
      <p className="orders-muted">
        HSN/SAC and GST rate are optional: left blank, they are taken from the stock item when the order is saved.
      </p>
    </div>
  );

  const renderForm = () => {
    const known = catalog.clients.some(c => String(c.id) === form.clientChoice);
    return (
      <div className="order-creator">
        <h3>{form.mode === 'edit' ? `Edit Order #${form.id}` : 'Create New Order'}</h3>
        {catalog.error && (
          <div className="notice error" role="alert">
            {catalog.error}{' '}
            <button type="button" className="btn-link" onClick={ensureCatalog}>Retry</button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="order-form" noValidate>
          <div className="form-section">
            <h4>Client & Schedule</h4>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="order-client">Client *</label>
                <select id="order-client" value={form.clientChoice} onChange={e => setField('clientChoice', e.target.value)}>
                  <option value="">Select a client…</option>
                  {/* An inactive client drops out of the picker but must stay on its existing orders. */}
                  {form.currentClient?.id && !known && form.clientChoice === String(form.currentClient.id) && (
                    <option value={String(form.currentClient.id)}>{form.currentClient.name}</option>
                  )}
                  {catalog.clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                  <option value={NEW_CLIENT}>+ New client…</option>
                </select>
              </div>
              {form.clientChoice === NEW_CLIENT && (
                <div className="form-group">
                  <label htmlFor="order-client-name">New client name *</label>
                  <input
                    id="order-client-name"
                    type="text"
                    value={form.clientName}
                    onChange={e => setField('clientName', e.target.value)}
                    placeholder="Enter client name"
                  />
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="order-date">Order date</label>
                <input id="order-date" type="date" value={form.orderDate} onChange={e => setField('orderDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="order-delivery">Delivery date</label>
                <input
                  id="order-delivery"
                  type="date"
                  value={form.deliveryDate}
                  min={form.orderDate || undefined}
                  onChange={e => setField('deliveryDate', e.target.value)}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="order-priority">Priority</label>
                <select id="order-priority" value={form.priority} onChange={e => setField('priority', e.target.value)}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{capitalise(p)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Order Lines</h4>
            {linesEditable ? renderLineEditor() : (
              <>
                <p className="orders-muted">
                  Lines can only be changed while an order is pending. This order is {label(form.status)}, so its
                  lines are shown read-only; stock may already be reserved or issued against them.
                </p>
                {form.originalLines.length ? renderLinesTable(form.originalLines) : <p className="orders-muted">No lines.</p>}
              </>
            )}
            {linesEditable && (
              <div className="order-live-total">
                <span>Estimated total</span>
                <strong>{formatMoney(liveTotal)}</strong>
              </div>
            )}
          </div>

          {formErrors.length > 0 && (
            <div className="notice error" role="alert">
              <ul className="notice-list">
                {formErrors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : form.mode === 'edit' ? 'Save Changes' : 'Create Order'}
            </button>
            <button type="button" onClick={closeForm} className="btn-secondary" disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  };

  const renderActions = (order) => {
    const next = NEXT[order.status] || [];
    const busy = busyId === order.id;
    const editable = order.status !== 'completed' && order.status !== 'cancelled';
    // One primary step forward stays visible; cancelling, other steps and
    // invoicing go in the menu, so every row keeps a single line.
    const primary = next.find(s => s !== 'cancelled');
    const more = [
      ...(editable ? [{ key: 'edit', label: 'Edit order', run: () => openEdit(order) }] : []),
      ...next.filter(s => s !== primary && s !== 'cancelled').map(s => ({ key: s, label: ACTION_LABELS[s], run: () => changeStatus(order, s) })),
      ...(INVOICEABLE.includes(order.status)
        ? [{ key: 'invoice', label: 'Create invoice', run: () => navigate('/invoices', { state: { orderId: order.id } }) }]
        : []),
      ...(next.includes('cancelled') ? [{ key: 'cancelled', label: 'Cancel order', danger: true, run: () => changeStatus(order, 'cancelled') }] : [])
    ];
    return (
      <div className="row-actions">
        {primary && (
          <button type="button" className="btn-action primary" onClick={() => changeStatus(order, primary)} disabled={busy}>
            {ACTION_LABELS[primary]}
          </button>
        )}
        {more.length > 0 && <RowMenu label={`More actions for order ${order.id}`} items={more} disabled={busy} />}
      </div>
    );
  };

  const renderTable = () => {
    if (loading && !orders.length) return <div className="orders-state">Loading orders…</div>;
    if (loadError) {
      return (
        <div className="orders-state error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn-secondary" onClick={() => loadOrders()}>Retry</button>
        </div>
      );
    }
    if (!orders.length) {
      return (statusFilter || list.query.trim())
        ? <div className="orders-state">No orders match the current filter.</div>
        : <div className="orders-state">No orders yet. Use “+ New Order” to create the first one.</div>;
    }
    return (
      <div className="table-container">
        <table className="orders-table">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Client</th>
              <th scope="col">Order date</th>
              <th scope="col">Delivery</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Total</th>
              <th scope="col" className="num">Items</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleOrders.map(order => {
              const open = expandedId === order.id;
              return (
                <React.Fragment key={order.id}>
                  <tr className={`order-row ${open ? 'open' : ''}`} onClick={() => toggleExpand(order.id)}>
                    <td>
                      <button
                        type="button"
                        className="btn-expand-row"
                        aria-expanded={open}
                        aria-label={`${open ? 'Hide' : 'Show'} lines for order ${order.id}`}
                        onClick={e => { e.stopPropagation(); toggleExpand(order.id); }}
                      >
                        {open ? '▾' : '▸'} #{order.id}
                      </button>
                    </td>
                    <td>{order.clientName || '—'}</td>
                    <td>{formatDate(order.orderDate)}</td>
                    <td>{formatDate(order.deliveryDate)}</td>
                    <td><span className={`priority ${slug(order.priority)}`}>{capitalise(order.priority)}</span></td>
                    <td><span className={`status-badge status-${slug(order.status)}`}>{label(order.status)}</span></td>
                    <td className="num">
                      <span className="orders-total">{formatMoney(order.totalAmount)}</span>
                      {order.invoicedValue > 0 ? (
                        <span className="orders-invoiced">
                          {order.invoicedValue >= order.totalAmount ? 'Fully invoiced' : `Invoiced ${formatMoney(order.invoicedValue)}`}
                        </span>
                      ) : order.status !== 'cancelled' && (
                        <span className="orders-not-invoiced">Not invoiced</span>
                      )}
                    </td>
                    <td className="num">{formatNumber(order.itemCount ?? 0, { decimals: 0 })}</td>
                    {/* Buttons here must not toggle the row. */}
                    <td onClick={e => e.stopPropagation()}>{renderActions(order)}</td>
                  </tr>
                  {open && (
                    <tr className="order-detail-row">
                      <td colSpan={COLUMNS}>{renderDetail()}</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <Pagination pagination={list.pagination} onPage={list.setPage} disabled={loading} label="orders" />
      </div>
    );
  };

  return (
    <div className="orders">
      <div className="orders-header">
        <div className="orders-title">
          <h1>Order Workflow</h1>
          <p className="orders-subtitle">Sales orders from confirmation to dispatch, with stock reserved and issued automatically.</p>
        </div>
        {!form && (
          <button type="button" className="btn-new-order" onClick={openCreate}>+ New Order</button>
        )}
      </div>

      <div className="notice info orders-invoice-note" role="note">
        <div className="notice-body">
          <span>
            <strong>Creating an order does not bill the customer.</strong> To issue a GST invoice, confirm the
            order, then choose <strong>More ▾ → Create invoice</strong>. Issued invoices are listed in Sales Invoices.
          </span>
        </div>
        <button type="button" className="btn-toolbar" onClick={() => navigate('/invoices')}>Go to Sales Invoices</button>
      </div>

      {notice && (
        <div className={`notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          <div className="notice-body">
            <span>{notice.text}</span>
            {notice.items?.length > 0 && (
              <ul className="notice-list">
                {notice.items.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
          <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      )}

      {renderKpis()}

      {form && renderForm()}

      <div className="orders-table-section">
        <div className="orders-section-head">
          <h3>
            All Orders
            <span className="orders-count">{formatNumber(list.pagination.total, { decimals: 0 })}</span>
          </h3>
          <div className="orders-toolbar">
            <label htmlFor="orders-status-filter" className="orders-sr-only">Filter by status</label>
            <select id="orders-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open (not delivered, completed or cancelled)</option>
              {Object.keys(STATUS_LABELS).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <SearchBox
              value={list.query}
              onChange={list.setQuery}
              placeholder="Search client or order #…"
              label="Search orders by client or order number"
            />
            <button type="button" className="btn-toolbar" onClick={() => loadOrders()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="btn-toolbar" onClick={exportCsv} disabled={!visibleOrders.length}>
              Export CSV
            </button>
          </div>
        </div>
        {renderTable()}
      </div>
    </div>
  );
};

export default Orders;
