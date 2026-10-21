import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { productionAPI } from '../../services/api';
import { formatNumber, formatPercent, formatDate, formatMoney, errorMessage, todayIST } from '../../utils/format';
import PlanningDashboard from '../ProductionPlanning/PlanningDashboard';
import QualityDashboard from '../QualityManagement/QualityDashboard';
import Drawer from '../common/Drawer';
import RowMenu from '../common/RowMenu';
import './Production.css';

const EMPTY_LIST = [];
const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUS_LABEL = { Pending: 'Pending', InProgress: 'In progress', Completed: 'Completed' };

/**
 * Loads one resource. `data` stays null until the first success, so a screen
 * that has not loaded (or failed to) never renders as an empty list.
 * A refresh keeps the previous data and reports its own error next to it.
 */
const useResource = (loader, fallback, what) => {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setState(s => ({ ...s, loading: true }));
    try {
      const res = await loader();
      // An older request finishing late must not overwrite a newer answer.
      if (mine !== seq.current) return;
      setState({ data: res.data?.data ?? fallback, loading: false, error: null });
    } catch (err) {
      if (mine !== seq.current) return;
      setState(s => ({ ...s, loading: false, error: errorMessage(err, `Could not load ${what}`) }));
    }
  }, [loader, fallback, what]);
  return [state, reload];
};

// DeadlineDate arrives as an ISO datetime; the calendar day is its first 10 chars.
const day = (v) => (v ? String(v).slice(0, 10) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const lower = (v) => String(v ?? '').toLowerCase();
const hasDays = (o) => o.DaysRemaining !== null && o.DaysRemaining !== undefined;
const isOverdue = (o) => o.OrderStatus !== 'Completed' && hasDays(o) && Number(o.DaysRemaining) < 0;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const daysText = (o) => {
  if (o.OrderStatus === 'Completed') return null;
  if (!hasDays(o)) return 'No deadline';
  const d = Number(o.DaysRemaining);
  if (d < 0) return `${plural(-d, 'day')} overdue`;
  if (d === 0) return 'Due today';
  return `${plural(d, 'day')} left`;
};

const ErrorBox = ({ message, onRetry, busy }) => (
  <div className="poh-error" role="alert">
    <span>{message}</span>
    {onRetry && (
      <button type="button" className="poh-btn poh-btn-secondary" onClick={onRetry} disabled={busy}>
        {busy ? 'Retrying…' : 'Retry'}
      </button>
    )}
  </div>
);

// --- New production order ---------------------------------------------------

const blankForm = () => ({
  styleId: '', quantity: '', priority: 'Medium', startDate: todayIST(), deadlineDate: '',
  source: 'sales', salesOrderId: '', clientName: ''
});

const validateOrder = (f) => {
  const e = {};
  if (!f.styleId) e.styleId = 'Choose a style';
  if (!/^\d+$/.test(String(f.quantity).trim()) || Number(f.quantity) < 1) e.quantity = 'Enter a whole number of at least 1';
  if (f.deadlineDate && f.startDate && f.deadlineDate < f.startDate) e.deadlineDate = 'Deadline cannot be before the start date';
  if (f.source === 'sales' && !f.salesOrderId) e.salesOrderId = 'Choose a sales order, or type a client name instead';
  if (f.source === 'client') {
    if (!f.clientName.trim()) e.clientName = 'Enter the client name';
    else if (f.clientName.trim().length > 100) e.clientName = 'Keep the client name under 100 characters';
  }
  return e;
};

const NewOrderForm = ({ onCreated, onCancel }) => {
  const [styles, loadStyles] = useResource(productionAPI.getStyles, EMPTY_LIST, 'styles');
  const [sales, loadSales] = useResource(productionAPI.getSalesOrders, EMPTY_LIST, 'sales orders');
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => { loadStyles(); loadSales(); }, [loadStyles, loadSales]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const style = (styles.data || []).find(s => String(s.StyleID) === String(form.styleId));
  const salesOrder = (sales.data || []).find(o => String(o.OrderID) === String(form.salesOrderId));

  const pickSalesOrder = (value) => {
    const so = (sales.data || []).find(o => String(o.OrderID) === value);
    // Pre-fill the deadline from the delivery date, but never overwrite one the planner typed.
    setForm(f => ({ ...f, salesOrderId: value, deadlineDate: f.deadlineDate || day(so?.DeliveryDate) || '' }));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validateOrder(form);
    setErrors(e);
    setSaveError(null);
    if (Object.keys(e).length) return;
    const body = {
      styleId: Number(form.styleId),
      quantity: Number(form.quantity),
      priority: form.priority,
      startDate: form.startDate || undefined,
      deadlineDate: form.deadlineDate || undefined,
      ...(form.source === 'sales'
        ? { salesOrderId: Number(form.salesOrderId) }
        : { clientName: form.clientName.trim() })
    };
    setSaving(true);
    try {
      const res = await productionAPI.createOrder(body);
      onCreated(res.data?.data?.OrderCode, form.source === 'sales' ? form.salesOrderId : null);
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not create the production order'));
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (name) => errors[name] && (
    <span id={`poh-${name}-err`} className="poh-field-error">{errors[name]}</span>
  );
  const describedBy = (name) => (errors[name] ? `poh-${name}-err` : undefined);

  return (
    <form className="poh-form" onSubmit={submit} noValidate>

      <div className="poh-form-grid">
        <div className="poh-field poh-span-2">
          <label htmlFor="poh-style">Style</label>
          {styles.error ? (
            <ErrorBox message={styles.error} onRetry={loadStyles} busy={styles.loading} />
          ) : (
            <select id="poh-style" value={form.styleId} onChange={e => set('styleId', e.target.value)}
                    disabled={styles.data === null} aria-describedby={describedBy('styleId')}>
              <option value="">{styles.data === null ? 'Loading styles…' : 'Choose a style'}</option>
              {(styles.data || []).map(s => (
                <option key={s.StyleID} value={s.StyleID}>
                  {s.StyleCode} — {s.StyleName} · materials {formatMoney(s.MaterialCostPerPiece)}/pc
                </option>
              ))}
            </select>
          )}
          {styles.data && styles.data.length === 0 && (
            <span className="poh-hint">No styles yet. Create one in Style Costing first.</span>
          )}
          {fieldError('styleId')}
        </div>

        <div className="poh-field">
          <label htmlFor="poh-qty">Quantity (pieces)</label>
          <input id="poh-qty" type="number" min="1" step="1" inputMode="numeric" value={form.quantity}
                 onChange={e => set('quantity', e.target.value)} aria-describedby={describedBy('quantity')} />
          {style && /^\d+$/.test(String(form.quantity)) && Number(form.quantity) > 0 && (
            <span className="poh-hint">≈ {formatMoney(num(style.MaterialCostPerPiece) * Number(form.quantity))} of materials</span>
          )}
          {fieldError('quantity')}
        </div>

        <div className="poh-field">
          <label htmlFor="poh-priority">Priority</label>
          <select id="poh-priority" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="poh-field">
          <label htmlFor="poh-start">Start date</label>
          <input id="poh-start" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>

        <div className="poh-field">
          <label htmlFor="poh-deadline">Deadline</label>
          <input id="poh-deadline" type="date" value={form.deadlineDate} min={form.startDate || undefined}
                 onChange={e => set('deadlineDate', e.target.value)} aria-describedby={describedBy('deadlineDate')} />
          {fieldError('deadlineDate')}
        </div>
      </div>

      <fieldset className="poh-source">
        <legend>Produce for</legend>
        <div className="poh-radio-row">
          <label htmlFor="poh-src-sales" className="poh-radio">
            <input id="poh-src-sales" type="radio" name="poh-source" value="sales"
                   checked={form.source === 'sales'} onChange={() => set('source', 'sales')} />
            A sales order
          </label>
          <label htmlFor="poh-src-client" className="poh-radio">
            <input id="poh-src-client" type="radio" name="poh-source" value="client"
                   checked={form.source === 'client'} onChange={() => set('source', 'client')} />
            A client (no sales order)
          </label>
        </div>

        {form.source === 'sales' ? (
          <div className="poh-field">
            <label htmlFor="poh-sales">Sales order</label>
            {sales.error ? (
              <ErrorBox message={sales.error} onRetry={loadSales} busy={sales.loading} />
            ) : (
              <select id="poh-sales" value={form.salesOrderId} onChange={e => pickSalesOrder(e.target.value)}
                      disabled={sales.data === null} aria-describedby={describedBy('salesOrderId')}>
                <option value="">{sales.data === null ? 'Loading sales orders…' : 'Choose a sales order'}</option>
                {(sales.data || []).map(o => (
                  <option key={o.OrderID} value={o.OrderID}>
                    #{o.OrderID} · {o.ClientName} · {o.Status} · delivery {formatDate(day(o.DeliveryDate))}
                  </option>
                ))}
              </select>
            )}
            {sales.data && sales.data.length === 0 && (
              <span className="poh-hint">No open sales orders (pending, confirmed or in production). Type a client name instead.</span>
            )}
            {salesOrder && (
              <div className="poh-so-detail">
                <strong>#{salesOrder.OrderID} — {salesOrder.ClientName}</strong>
                <span>Items: {salesOrder.Items || 'no line items'}</span>
                <span>Delivery: {formatDate(day(salesOrder.DeliveryDate))} · Value {formatMoney(salesOrder.TotalAmount)}</span>
              </div>
            )}
            {fieldError('salesOrderId')}
          </div>
        ) : (
          <div className="poh-field">
            <label htmlFor="poh-client">Client name</label>
            <input id="poh-client" type="text" maxLength={100} value={form.clientName}
                   onChange={e => set('clientName', e.target.value)} aria-describedby={describedBy('clientName')} />
            {fieldError('clientName')}
          </div>
        )}
      </fieldset>

      {saveError && <ErrorBox message={saveError} />}

      <div className="poh-form-actions">
        <button type="button" className="poh-btn poh-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="poh-btn poh-btn-primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create production order'}
        </button>
      </div>
    </form>
  );
};

// --- Material check ---------------------------------------------------------

const MaterialsPanel = ({ state, onRetry }) => {
  if (state.error) return <ErrorBox message={state.error} onRetry={onRetry} busy={state.loading} />;
  if (!state.data) return <p className="poh-muted">Checking materials…</p>;

  const { order, materials = [], allAvailable, untracked = [] } = state.data;
  const tracked = materials.filter(m => m.InventoryItemID !== null && m.InventoryItemID !== undefined);
  const short = tracked.filter(m => num(m.Shortage) > 0);
  const remaining = num(order?.Remaining);

  if (materials.length === 0) {
    return (
      <p className="poh-banner poh-banner-neutral">
        This style has no active costing, so no materials will be consumed when output is recorded.
        Add its materials in Style Costing.
      </p>
    );
  }

  return (
    <div className="poh-materials">
      {tracked.length === 0 ? (
        <p className="poh-banner poh-banner-neutral">None of these materials is tracked in stock, so availability cannot be checked.</p>
      ) : allAvailable ? (
        <p className="poh-banner poh-banner-ok">
          All stock-tracked materials are available for the remaining {formatNumber(remaining, { decimals: 0 })} pieces.
        </p>
      ) : (
        <p className="poh-banner poh-banner-warn">
          Short of {short.map(m => m.MaterialName).join(', ')} for the remaining {formatNumber(remaining, { decimals: 0 })} pieces.
          Recording output will be refused until stock is received.
        </p>
      )}
      {untracked.length > 0 && (
        <p className="poh-hint">
          Not tracked in stock (not checked or consumed): {untracked.join(', ')}. Link them to stock items in Style Costing.
        </p>
      )}
      <div className="poh-table-wrap">
        <table className="poh-table poh-table-compact">
          <thead>
            <tr>
              <th>Material</th><th className="num">Per piece</th><th className="num">Required</th>
              <th>Stock item</th><th className="num">Available</th><th className="num">Shortage</th>
            </tr>
          </thead>
          <tbody>
            {materials.map(m => {
              const linked = m.InventoryItemID !== null && m.InventoryItemID !== undefined;
              const isShort = linked && num(m.Shortage) > 0;
              return (
                <tr key={m.MaterialID} className={isShort ? 'poh-row-short' : ''}>
                  <td>{m.MaterialName}</td>
                  <td className="num">{formatNumber(m.PerPiece, { decimals: 3 })} {m.Unit || ''}</td>
                  <td className="num">{formatNumber(m.Required, { decimals: 2 })} {m.Unit || ''}</td>
                  <td>{linked ? m.StockItem : <span className="poh-muted">Not tracked in stock</span>}</td>
                  <td className="num">{linked ? formatNumber(m.Available) : '—'}</td>
                  <td className="num">{linked ? (isShort ? <strong>{formatNumber(m.Shortage)}</strong> : 'None') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Production order hub -------------------------------------------------------

// Most urgent first: overdue, then by deadline (none last); completed at the end.
const urgency = (o) => {
  if (o.OrderStatus === 'Completed') return [3, 0];
  if (isOverdue(o)) return [0, Number(o.DaysRemaining)];
  return hasDays(o) ? [1, Number(o.DaysRemaining)] : [2, 0];
};
const SORTS = {
  urgency: (a, b) => { const x = urgency(a); const y = urgency(b); return x[0] - y[0] || x[1] - y[1]; },
  order: (a, b) => lower(a.OrderCode).localeCompare(lower(b.OrderCode)),
  client: (a, b) => lower(a.ClientName).localeCompare(lower(b.ClientName)),
  progress: (a, b) => num(a.CompletionPercentage) - num(b.CompletionPercentage),
  deadline: (a, b) => (day(a.DeadlineDate) || '9999').localeCompare(day(b.DeadlineDate) || '9999'),
  priority: (a, b) => ({ high: 0, medium: 1, low: 2 }[lower(a.Priority)] ?? 3) - ({ high: 0, medium: 1, low: 2 }[lower(b.Priority)] ?? 3)
};
const dueSoon = (o) => o.OrderStatus !== 'Completed' && hasDays(o) && Number(o.DaysRemaining) >= 0 && Number(o.DaysRemaining) <= 7;

const Production = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('orders');
  const [orders, loadOrders] = useResource(productionAPI.getOrders, EMPTY_LIST, 'production orders');
  const [statusFilter, setStatusFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'urgency', dir: 'asc' });
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);
  const [materials, setMaterials] = useState({ orderId: null, data: null, error: null, loading: false });

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const loadMaterials = useCallback(async (orderId) => {
    setMaterials({ orderId, data: null, error: null, loading: true });
    try {
      const res = await productionAPI.getOrderMaterials(orderId);
      setMaterials(m => (m.orderId === orderId ? { orderId, data: res.data?.data || null, error: null, loading: false } : m));
    } catch (err) {
      setMaterials(m => (m.orderId === orderId
        ? { orderId, data: null, error: errorMessage(err, 'Could not check materials'), loading: false } : m));
    }
  }, []);

  const toggleMaterials = (orderId) => {
    if (materials.orderId === orderId) setMaterials({ orderId: null, data: null, error: null, loading: false });
    else loadMaterials(orderId);
  };

  const handleCreated = (orderCode, salesOrderId) => {
    setShowForm(false);
    setNotice({
      type: 'success',
      text: `Production order ${orderCode || ''} created${salesOrderId ? ` for sales order #${salesOrderId}` : ''}. Allocate a machine to it on the Planning board.`
    });
    loadOrders();
  };

  const list = orders.data;
  const stats = useMemo(() => {
    if (!list) return null;
    const active = list.filter(o => o.OrderStatus !== 'Completed');
    const planned = active.reduce((s, o) => s + num(o.TotalQuantity), 0);
    const done = active.reduce((s, o) => s + num(o.CompletedQuantity), 0);
    return {
      all: list.length,
      active: active.length,
      pending: list.filter(o => o.OrderStatus === 'Pending').length,
      inProgress: list.filter(o => o.OrderStatus === 'InProgress').length,
      completed: list.filter(o => o.OrderStatus === 'Completed').length,
      overdue: list.filter(isOverdue).length,
      dueSoon: list.filter(dueSoon).length,
      planned,
      done,
      pct: planned > 0 ? (done / planned) * 100 : null
    };
  }, [list]);

  const FILTERS = [
    ['active', 'Active', stats?.active], ['Pending', 'Not started', stats?.pending], ['InProgress', 'In progress', stats?.inProgress],
    ['overdue', 'Overdue', stats?.overdue], ['due-soon', 'Due in 7 days', stats?.dueSoon], ['Completed', 'Completed', stats?.completed],
    ['all', 'All', stats?.all]
  ];
  const matches = (o) => {
    switch (statusFilter) {
      case 'all': return true;
      case 'active': return o.OrderStatus !== 'Completed';
      case 'overdue': return isOverdue(o);
      case 'due-soon': return dueSoon(o);
      default: return o.OrderStatus === statusFilter;
    }
  };

  const visible = useMemo(() => {
    if (!list) return [];
    const q = search.trim().toLowerCase();
    const rows = list.filter(o => matches(o) && (!q || [o.OrderCode, o.ClientName, o.StyleName, o.SalesOrderID && `so #${o.SalesOrderID}`].some(v => lower(v).includes(q))));
    const cmp = SORTS[sort.key] || SORTS.urgency;
    return rows.sort((a, b) => (sort.dir === 'asc' ? cmp(a, b) : cmp(b, a)) || SORTS.urgency(a, b));
  }, [list, statusFilter, search, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSort = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const SortHead = ({ k, children, className = '' }) => {
    const active = sort.key === k;
    return (
      <th scope="col" className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`poh-sort ${active ? 'active' : ''}`} onClick={() => toggleSort(k)}>
          {children}<span aria-hidden="true">{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
        </button>
      </th>
    );
  };

  const renderOrders = () => {
    if (list === null) {
      return orders.error
        ? <ErrorBox message={orders.error} onRetry={loadOrders} busy={orders.loading} />
        : <p className="poh-muted poh-loading">Loading production orders…</p>;
    }
    if (list.length === 0) {
      return (
        <div className="poh-empty">
          <p><strong>No production orders yet.</strong></p>
          <p className="poh-muted">Create one from a confirmed sales order, or for a client directly.</p>
          <button type="button" className="poh-btn poh-btn-primary" onClick={() => setShowForm(true)}>+ New production order</button>
        </div>
      );
    }
    if (visible.length === 0) return <p className="poh-empty">No orders match this filter.</p>;

    return (
      <div className="poh-table-wrap">
        <table className="poh-table poh-orders">
          <thead>
            <tr>
              <SortHead k="order">Order</SortHead>
              <SortHead k="client">Client / style</SortHead>
              <SortHead k="progress">Progress</SortHead>
              <SortHead k="deadline">Deadline</SortHead>
              <SortHead k="priority">Priority</SortHead>
              <th scope="col">Status</th>
              <th scope="col"><span className="poh-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(o => {
              const pct = o.CompletionPercentage === null || o.CompletionPercentage === undefined ? null : num(o.CompletionPercentage);
              const open = materials.orderId === o.OrderID;
              const overdue = isOverdue(o);
              const done = o.OrderStatus === 'Completed';
              const more = [
                { key: 'materials', label: open ? 'Hide materials' : 'Check materials', run: () => toggleMaterials(o.OrderID) },
                ...(!done ? [{ key: 'plan', label: 'Allocate a machine (Planning board)', run: () => setTab('planning') }] : []),
                ...(o.SalesOrderID ? [{ key: 'so', label: `Open sales order #${o.SalesOrderID}`, run: () => navigate('/orders') }] : [])
              ];
              return (
                <React.Fragment key={o.OrderID}>
                  <tr className={`${overdue ? 'poh-row-overdue' : ''} ${open ? 'poh-row-open' : ''}`}>
                    <td className="poh-cell-order">
                      <strong>{o.OrderCode}</strong>
                      <span className="poh-sub">{o.SalesOrderID ? `Sales order #${o.SalesOrderID}` : 'Direct order'}</span>
                    </td>
                    <td className="poh-cell-client">
                      <span className="poh-client">{o.ClientName || '—'}</span>
                      <span className="poh-sub">{o.StyleName}</span>
                    </td>
                    <td className="poh-cell-progress">
                      <div className="poh-progress-line">
                        <strong>{formatNumber(o.CompletedQuantity, { decimals: 0 })}</strong>
                        <span> / {formatNumber(o.TotalQuantity, { decimals: 0 })} pcs</span>
                        <span className="poh-pct">{formatPercent(pct)}</span>
                      </div>
                      <div className="poh-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100}
                           aria-valuenow={pct === null ? undefined : Math.min(100, pct)} aria-label={`${o.OrderCode} progress`}>
                        {/* Over-production can exceed 100%; the bar is capped, the label is not. */}
                        <div className={`poh-progress-fill ${done ? 'done' : ''}`} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
                      </div>
                    </td>
                    <td className="poh-cell-deadline">
                      <span className="poh-date">{formatDate(day(o.DeadlineDate))}</span>
                      {daysText(o) && <span className={`poh-sub ${overdue ? 'poh-text-danger' : dueSoon(o) ? 'poh-text-warn' : ''}`}>{daysText(o)}</span>}
                    </td>
                    <td><span className={`poh-pill poh-priority-${lower(o.Priority)}`}>{o.Priority || '—'}</span></td>
                    <td><span className={`poh-pill poh-status-${lower(o.OrderStatus)}`}>{STATUS_LABEL[o.OrderStatus] || o.OrderStatus || '—'}</span></td>
                    <td className="poh-cell-actions">
                      <div className="poh-actions">
                        <button type="button" className="poh-act" aria-expanded={open} onClick={() => toggleMaterials(o.OrderID)}
                                disabled={open && materials.loading} aria-label={`${open ? 'Hide' : 'Check'} materials for ${o.OrderCode}`}>
                          {open ? 'Hide' : 'Materials'}
                        </button>
                        <RowMenu label={`More actions for ${o.OrderCode}`} items={more} />
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr className="poh-detail-row">
                      <td colSpan={7}>
                        <h3 className="poh-detail-title">Materials for {o.OrderCode} · {o.StyleName}</h3>
                        <MaterialsPanel state={materials} onRetry={() => loadMaterials(o.OrderID)} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const card = ({ label, value, sub, tone, filter, bar }) => {
    const body = (
      <>
        <span className="poh-card-label">{label}</span>
        <span className="poh-card-value">{value}</span>
        {bar !== undefined && (
          <span className="poh-card-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, bar || 0))}%` }} /></span>
        )}
        {sub && <span className="poh-card-sub">{sub}</span>}
      </>
    );
    return filter ? (
      <button type="button" key={label} className={`poh-card clickable ${tone || ''} ${statusFilter === filter ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter)} aria-pressed={statusFilter === filter} title="Click to filter the list">{body}</button>
    ) : <div key={label} className={`poh-card ${tone || ''}`}>{body}</div>;
  };
  const n = (v) => (stats ? formatNumber(v, { decimals: 0 }) : '—');

  return (
    <div className="poh">
      <header className="poh-header">
        <div>
          <h1>Production</h1>
          <p>Production orders, machine planning and quality inspection, from cutting to finished goods.</p>
        </div>
        {tab === 'orders' && (
          <button type="button" className="poh-btn poh-btn-primary poh-btn-lg" onClick={() => { setNotice(null); setShowForm(true); }}>
            + New production order
          </button>
        )}
      </header>

      <div className="poh-tabs" role="tablist" aria-label="Production sections">
        {[['orders', 'Production orders', stats?.active], ['planning', 'Planning board'], ['quality', 'Quality inspection']].map(([id, label, count]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
                  className={`poh-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}{count ? <span className="poh-tab-count">{count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'planning' && <div className="poh-embedded"><PlanningDashboard embedded /></div>}
      {tab === 'quality' && <div className="poh-embedded"><QualityDashboard embedded /></div>}

      {tab === 'orders' && (
        <>
          {notice && (
            <div className={`poh-notice poh-notice-${notice.type}`} role="status">
              <span>{notice.text}</span>
              <button type="button" className="poh-btn poh-btn-ghost poh-btn-small" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}

          <div className="poh-cards">
            {card({ label: 'Active orders', value: n(stats?.active), sub: 'Not yet completed', filter: 'active' })}
            {card({ label: 'In progress', value: n(stats?.inProgress), sub: 'Output being recorded', filter: 'InProgress' })}
            {card({ label: 'Not started', value: n(stats?.pending), sub: 'Waiting for a machine', filter: 'Pending' })}
            {card({ label: 'Overdue', value: n(stats?.overdue), sub: 'Past the deadline', tone: stats?.overdue ? 'danger' : '', filter: 'overdue' })}
            {card({ label: 'Due in 7 days', value: n(stats?.dueSoon), sub: 'Deadline this week', tone: stats?.dueSoon ? 'warn' : '', filter: 'due-soon' })}
            {card({
              label: 'Pieces completed', tone: 'accent',
              value: stats ? `${formatNumber(stats.done, { decimals: 0 })} / ${formatNumber(stats.planned, { decimals: 0 })}` : '—',
              bar: stats?.pct ?? 0, sub: stats ? `${formatPercent(stats.pct)} of active orders` : null
            })}
          </div>

          <section className="poh-panel poh-list">
            <div className="poh-list-head">
              <h2>Production orders <span className="poh-count">{formatNumber(visible.length, { decimals: 0 })}</span></h2>
              <div className="poh-toolbar">
                <label htmlFor="poh-search" className="poh-sr">Search production orders</label>
                <input id="poh-search" className="poh-search" type="search" placeholder="Order, client, style or SO number" value={search}
                       onChange={e => setSearch(e.target.value)} />
                <button type="button" className="poh-btn poh-btn-secondary" onClick={loadOrders} disabled={orders.loading}>
                  {orders.loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>
            <div className="poh-filters" role="group" aria-label="Filter by status">
              {FILTERS.map(([v, l, c]) => (
                <button key={v} type="button" className={`poh-chip ${statusFilter === v ? 'active' : ''} ${v === 'overdue' && c ? 'danger' : ''}`}
                        aria-pressed={statusFilter === v} onClick={() => setStatusFilter(v)}>
                  {l}{c !== undefined && c !== null && <span className="poh-chip-count">{c}</span>}
                </button>
              ))}
              {sort.key !== 'urgency' && (
                <button type="button" className="poh-link" onClick={() => setSort({ key: 'urgency', dir: 'asc' })}>Sort by urgency</button>
              )}
            </div>

            {/* A failed refresh keeps the last list on screen but says so. */}
            {list !== null && orders.error && (
              <ErrorBox message={`${orders.error} — showing the last loaded list.`} onRetry={loadOrders} busy={orders.loading} />
            )}
            {renderOrders()}
          </section>

          {showForm && (
            <Drawer title="New production order" subtitle="Plan pieces of a style for a sales order or a client" onClose={() => setShowForm(false)} width={640}>
              <NewOrderForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
            </Drawer>
          )}
        </>
      )}
    </div>
  );
};

export default Production;
