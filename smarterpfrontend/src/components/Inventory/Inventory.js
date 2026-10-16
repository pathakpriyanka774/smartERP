import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryAPI } from '../../services/api';
import {
  formatMoney, formatNumber, formatDateTime, errorMessage, downloadCsv, todayIST
} from '../../utils/format';
import usePagedList from '../../hooks/usePagedList';
import Pagination, { SearchBox } from '../common/Pagination';
import Drawer from '../common/Drawer';
import RowMenu from '../common/RowMenu';
import './Inventory.css';

// Status values come from the server; the map gives each a label and a CSS
// class. Deriving the class from the label with replace(' ', '-') only
// replaced the first space, so multi-word statuses lost their styling.
const STATUS_META = {
  'in-stock': { label: 'In stock', className: 'in-stock' },
  'low-stock': { label: 'Low stock', className: 'low-stock' },
  'out-of-stock': { label: 'Out of stock', className: 'out-of-stock' }
};
const statusMeta = (status) => STATUS_META[status] || { label: status || 'Unknown', className: 'unknown' };

const MOVEMENT_LABELS = {
  opening: 'Opening stock',
  receipt: 'Receipt',
  issue: 'Issue',
  adjustment: 'Adjustment',
  consumption: 'Consumed in production',
  production: 'Produced',
  sale: 'Sale'
};

const DEFAULT_CATEGORIES = ['Raw Material', 'Accessories', 'Finished Goods', 'Packaging', 'Tools & Equipment'];
const DEFAULT_UNITS = ['pcs', 'm', 'kg', 'g', 'yards', 'rolls', 'cones', 'boxes', 'sets'];

// Every character that is not a letter or digit becomes a dash, so
// "Tools & Equipment" → "tools-equipment" is always a valid class name.
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Quantities are signed in the ledger; show the sign explicitly (a real minus
// sign, not a hyphen) so receipts and issues read differently without colour.
const signedQty = (q) => {
  const n = Number(q) || 0;
  if (n > 0) return `+${formatNumber(n)}`;
  if (n < 0) return `−${formatNumber(Math.abs(n))}`;
  return formatNumber(0);
};

// "3 days ago" style, for when an item last moved (slow-moving stock stands out).
const sinceText = (iso) => {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
};
const SLOW_DAYS = 90;

// GST rates the server accepts (%).
const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
const fmtRate = (r) => (r === null || r === undefined || r === '' ? '—' : `${formatNumber(r)}%`);
const rateValue = (r) => (r === null || r === undefined || r === '' ? '' : String(Number(r)));

const EMPTY_FORM = {
  itemName: '', sku: '', category: '', unit: 'pcs', reorderLevel: '', unitCost: '', quantity: '', notes: '',
  hsnCode: '', gstRate: ''
};
const EMPTY_MOVEMENT = { type: 'receipt', quantity: '', unitCost: '', reference: '', notes: '' };

const numOrUndefined = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

const renderMovementRows = (rows, showItem) => rows.map(m => (
  <tr key={m.id}>
    <td>{formatDateTime(m.createdAt)}</td>
    {showItem && <td>{m.itemName}</td>}
    <td><span className={`inv-move-type ${slug(m.type)}`}>{MOVEMENT_LABELS[m.type] || m.type}</span></td>
    <td className={`inv-num ${Number(m.quantity) < 0 ? 'inv-out' : 'inv-in'}`}>{signedQty(m.quantity)}</td>
    <td className="inv-num">{formatNumber(m.balanceAfter)}</td>
    <td className="inv-num">{formatMoney(m.unitCost)}</td>
    <td className="inv-wrap">
      {[m.reference, m.notes].filter(Boolean).join(' — ') || '—'}
    </td>
    <td>{m.createdBy || '—'}</td>
  </tr>
));

// Re-read a list when `refreshKey` changes (after a stock movement elsewhere on the page).
const useRefreshOn = (refreshKey, reload) => {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    reload();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
};

/** The stock ledger across all items, newest first, a page at a time. */
const MovementsLog = ({ refreshKey }) => {
  const [typeFilter, setTypeFilter] = useState('');
  const list = usePagedList(params => inventoryAPI.getRecentMovements(params), { pageSize: 50, filters: { type: typeFilter } });
  useRefreshOn(refreshKey, list.reload);
  const movements = list.rows;

  const exportMovements = () => {
    downloadCsv(`stock-movements-${todayIST()}.csv`, movements, [
      [r => formatDateTime(r.createdAt), 'Date/time (IST)'], ['itemName', 'Item'],
      [r => MOVEMENT_LABELS[r.type] || r.type, 'Type'], ['quantity', 'Quantity'],
      ['balanceAfter', 'Balance after'], ['unitCost', 'Unit cost (INR)'],
      ['reference', 'Reference'], ['notes', 'Notes'], ['createdBy', 'By']
    ]);
  };

  return (
    <div className="inventory-table-section">
      <div className="inv-section-head">
        <h3>Stock movements <span className="inv-count">{formatNumber(list.pagination.total, { decimals: 0 })}</span></h3>
        <div className="inv-toolbar-actions">
          <SearchBox value={list.query} onChange={list.setQuery} placeholder="Item, reference, notes"
            label="Search stock movements" />
          <label htmlFor="inv-move-type-filter" className="inv-sr-only">Filter by movement type</label>
          <select id="inv-move-type-filter" className="inv-search" value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" className="btn-expand" onClick={list.reload} disabled={list.loading}>
            {list.loading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="btn-expand" onClick={exportMovements} disabled={movements.length === 0}
            title="Exports the rows on this page">
            Export CSV
          </button>
        </div>
      </div>
      {list.loading && movements.length === 0 ? (
        <p className="inv-state" role="status">Loading stock movements…</p>
      ) : list.error ? (
        <div className="inv-notice error" role="alert">
          {list.error}{' '}
          <button type="button" className="inv-link-btn" onClick={list.reload}>Retry</button>
        </div>
      ) : movements.length === 0 ? (
        <p className="inv-state">{typeFilter || list.query ? 'No movements match your search or filter.' : 'No stock movements recorded yet.'}</p>
      ) : (
        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th scope="col">Date / time</th><th scope="col">Item</th><th scope="col">Type</th>
                <th scope="col" className="inv-num">Quantity</th>
                <th scope="col" className="inv-num">Balance after</th><th scope="col" className="inv-num">Unit cost</th>
                <th scope="col">Reference / notes</th><th scope="col">By</th>
              </tr>
            </thead>
            <tbody>{renderMovementRows(movements, true)}</tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="movements" />
    </div>
  );
};

/** Movement history of one item, a page at a time. */
const HistoryPanel = ({ item, refreshKey, onClose }) => {
  const list = usePagedList(params => inventoryAPI.getMovements(item.id, params), { pageSize: 25 });
  useRefreshOn(refreshKey, list.reload);
  const history = list.rows;
  return (
    <section className="inv-panel" aria-labelledby="inv-history-title">
      <div className="inv-panel-header">
        <h3 id="inv-history-title">History — {item.itemName}</h3>
        <button type="button" className="inv-link-btn" onClick={onClose}>Close</button>
      </div>
      <p className="inv-panel-sub">
        HSN {item.hsnCode || 'not set'} · GST {item.gstRate === null || item.gstRate === undefined ? 'not set' : fmtRate(item.gstRate)}
      </p>
      {list.loading && history.length === 0 ? (
        <p className="inv-state" role="status">Loading history…</p>
      ) : list.error ? (
        <div className="inv-notice error" role="alert">
          {list.error}{' '}
          <button type="button" className="inv-link-btn" onClick={list.reload}>Retry</button>
        </div>
      ) : history.length === 0 ? (
        <p className="inv-state">No movements recorded for this item yet.</p>
      ) : (
        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th scope="col">Date / time</th><th scope="col">Type</th><th scope="col">Quantity</th>
                <th scope="col">Balance after</th>
                <th scope="col">Unit cost</th><th scope="col">Reference / notes</th><th scope="col">By</th>
              </tr>
            </thead>
            <tbody>{renderMovementRows(history, false)}</tbody>
          </table>
        </div>
      )}
      <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="movements" />
    </section>
  );
};

const Inventory = () => {
  const [stats, setStats] = useState(null);
  const [notice, setNotice] = useState(null);

  const [activeTab, setActiveTab] = useState('items');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reorderStatus, setReorderStatus] = useState('low-stock');
  const [missingCost, setMissingCost] = useState(false);
  const [archivedView, setArchivedView] = useState('active');
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' });
  const [serverLists, setServerLists] = useState({ categories: [], units: [] });
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  // Bumped after any stock change so the movement lists re-read.
  const [refreshKey, setRefreshKey] = useState(0);

  // Server-paginated item list. "Needs reorder" is a status filter on the server.
  const list = usePagedList(params => inventoryAPI.getAll(params), {
    pageSize: 50,
    filters: {
      category: categoryFilter,
      status: activeTab === 'reorder' ? reorderStatus : statusFilter,
      missingCost: missingCost ? 'true' : '',
      archived: activeTab === 'reorder' ? 'active' : archivedView,
      sort: sort.key, dir: sort.dir
    }
  });
  const items = list.rows;
  const loadError = list.error || null;

  // Item form: mode is null (closed), 'add' or 'edit'.
  const [formMode, setFormMode] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [formSaving, setFormSaving] = useState(false);

  // Stock movement panel for one item.
  const [stockItem, setStockItem] = useState(null);
  const [movement, setMovement] = useState(EMPTY_MOVEMENT);
  const [movementError, setMovementError] = useState(null);
  const [movementSaving, setMovementSaving] = useState(false);

  // Movement history for one item.
  const [historyItem, setHistoryItem] = useState(null);

  const flash = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 5000);
  };

  // Stats come from their own endpoint: the list is only one page.
  const loadStats = useCallback(async () => {
    try {
      const statsRes = await inventoryAPI.getStats();
      setStats(statsRes.data || null);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // Every category and unit in use (the list itself is only one page).
  const loadCategories = useCallback(() => {
    inventoryAPI.getCategories()
      .then(res => setServerLists(res.data?.data || { categories: [], units: [] }))
      .catch(() => {});
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  const { reload } = list;
  const retry = () => reload();

  // After any stock change, refresh everything that shows quantities.
  const refreshAfterChange = async () => {
    setRefreshKey(k => k + 1);
    loadCategories();
    await Promise.all([reload(), loadStats()]);
  };

  // Categories and units seen so far feed the filter and form suggestions
  // (the list is paged, so this grows as pages are viewed).
  const [seen, setSeen] = useState({ categories: [], units: [] });
  useEffect(() => {
    setSeen(prev => {
      const cats = [...new Set([...prev.categories, ...items.map(i => i.category).filter(Boolean)])];
      const units = [...new Set([...prev.units, ...items.map(i => i.unit).filter(Boolean)])];
      return cats.length === prev.categories.length && units.length === prev.units.length ? prev : { categories: cats, units };
    });
  }, [items]);

  const categorySuggestions = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES, ...serverLists.categories, ...seen.categories])].sort((a, b) => a.localeCompare(b)),
    [serverLists.categories, seen.categories]);
  // The filter lists only categories that exist, so every choice finds something.
  const categoryFilterOptions = serverLists.categories.length ? serverLists.categories : categorySuggestions;
  const unitSuggestions = useMemo(
    () => [...new Set([...DEFAULT_UNITS, ...serverLists.units, ...seen.units])], [serverLists.units, seen.units]);

  // Search and filters run on the server; this is the current page.
  const visibleItems = items;

  const reorderCount = stats ? (Number(stats.lowStock) || 0) + (Number(stats.outOfStock) || 0) : 0;

  // ---- Item add / edit -------------------------------------------------

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingItem(null);
    setFormError(null);
    setFormMode('add');
  };

  const openEdit = (item) => {
    setForm({
      itemName: item.itemName || '',
      sku: item.sku || '',
      category: item.category || '',
      unit: item.unit || '',
      reorderLevel: item.reorderLevel ?? '',
      unitCost: item.unitCost ?? '',
      quantity: item.quantity ?? '',
      notes: '',
      hsnCode: item.hsnCode || '',
      gstRate: rateValue(item.gstRate)
    });
    setEditingItem(item);
    setFormError(null);
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingItem(null);
    setFormError(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const quantityChanged = formMode === 'edit' && editingItem
    && form.quantity !== '' && Number(form.quantity) !== Number(editingItem.quantity);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (formSaving) return;
    setFormError(null);

    if (!form.itemName.trim()) {
      setFormError('Item name is required.');
      return;
    }
    for (const [field, label] of [['reorderLevel', 'Reorder level'], ['unitCost', 'Unit cost'], ['quantity', 'Quantity']]) {
      if (form[field] !== '' && (Number.isNaN(Number(form[field])) || Number(form[field]) < 0)) {
        setFormError(`${label} must be zero or more.`);
        return;
      }
    }
    if (form.hsnCode.trim() && !/^\d{4,8}$/.test(form.hsnCode.trim())) {
      setFormError('HSN code must be 4–8 digits.');
      return;
    }
    if (quantityChanged && !form.notes.trim()) {
      setFormError('Explain why the quantity is changing — it is recorded as a stock adjustment.');
      return;
    }

    const details = {
      itemName: form.itemName.trim(),
      sku: form.sku.trim() || undefined,
      category: form.category.trim() || undefined,
      unit: form.unit.trim() || undefined,
      hsnCode: form.hsnCode.trim() || undefined,
      gstRate: form.gstRate === '' ? undefined : Number(form.gstRate)
    };

    setFormSaving(true);
    try {
      if (formMode === 'add') {
        await inventoryAPI.create({
          ...details,
          reorderLevel: numOrUndefined(form.reorderLevel),
          unitCost: numOrUndefined(form.unitCost),
          quantity: numOrUndefined(form.quantity)
        });
        flash('success', `Added ${details.itemName}`);
      } else {
        // An emptied number field on edit means zero, not "leave unchanged".
        const body = {
          ...details,
          reorderLevel: Number(form.reorderLevel || 0),
          unitCost: Number(form.unitCost || 0)
        };
        // Quantity is only sent when it changed, so a plain details edit
        // never creates an empty adjustment in the ledger.
        if (quantityChanged) {
          body.quantity = Number(form.quantity);
          body.notes = form.notes.trim();
        }
        await inventoryAPI.update(editingItem.id, body);
        flash('success', quantityChanged
          ? `Updated ${details.itemName} and recorded a stock adjustment`
          : `Updated ${details.itemName}`);
      }
      closeForm();
      await refreshAfterChange();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the item'));
    } finally {
      setFormSaving(false);
    }
  };

  // ---- Stock movement --------------------------------------------------

  const openStock = (item) => {
    setStockItem(item);
    setMovement(EMPTY_MOVEMENT);
    setMovementError(null);
  };

  const closeStock = () => {
    setStockItem(null);
    setMovementError(null);
  };

  const handleMovementChange = (e) => {
    const { name, value } = e.target;
    setMovement(m => ({ ...m, [name]: value }));
  };

  const handleMovementSubmit = async (e) => {
    e.preventDefault();
    if (movementSaving || !stockItem) return;
    setMovementError(null);

    const qty = Number(movement.quantity);
    if (movement.quantity === '' || Number.isNaN(qty) || qty === 0) {
      setMovementError('Enter a quantity.');
      return;
    }
    if (movement.type !== 'adjustment' && qty < 0) {
      setMovementError('Quantity must be more than zero.');
      return;
    }
    if (movement.type === 'adjustment' && !movement.notes.trim()) {
      setMovementError('A note is required for an adjustment.');
      return;
    }
    if (movement.type === 'receipt' && movement.unitCost !== ''
        && (Number.isNaN(Number(movement.unitCost)) || Number(movement.unitCost) < 0)) {
      setMovementError('Unit cost must be zero or more.');
      return;
    }

    const body = {
      type: movement.type,
      quantity: qty,
      reference: movement.reference.trim() || undefined,
      notes: movement.notes.trim() || undefined
    };
    if (movement.type === 'receipt' && movement.unitCost !== '') body.unitCost = Number(movement.unitCost);

    setMovementSaving(true);
    try {
      const res = await inventoryAPI.addMovement(stockItem.id, body);
      const updated = res.data?.data?.item;
      const balance = updated ? ` — on hand now ${formatNumber(updated.quantity)} ${updated.unit || ''}` : '';
      flash('success', `${MOVEMENT_LABELS[movement.type]} recorded for ${stockItem.itemName}${balance}`);
      closeStock();
      await refreshAfterChange();
    } catch (err) {
      // 409 carries the business reason ("Not enough stock of …"); 400 the
      // validation message. Both are meant to be shown as-is.
      setMovementError(errorMessage(err, 'Could not record the movement'));
    } finally {
      setMovementSaving(false);
    }
  };

  // ---- History ---------------------------------------------------------

  const openHistory = (item) => setHistoryItem(item);

  // ---- Archive / restore / reorder -------------------------------------

  const setArchived = async (item, archive) => {
    if (archive && !window.confirm(`Archive ${item.itemName}? It will be hidden from stock lists, orders and purchase orders. Its history is kept and you can restore it later.`)) return;
    try {
      await (archive ? inventoryAPI.archive(item.id) : inventoryAPI.restore(item.id));
      flash('success', `${item.itemName} ${archive ? 'archived' : 'restored'}`);
      await refreshAfterChange();
    } catch (err) {
      flash('error', errorMessage(err, `Could not ${archive ? 'archive' : 'restore'} the item`));
    }
  };

  // Suggest enough to get back above the reorder level with the same margin again.
  const suggestedOrder = (item) => Math.max(1, Math.ceil(Number(item.reorderLevel || 0) * 2 - Number(item.availableQuantity || 0)));
  const raisePO = (item) => navigate('/purchases', { state: { newPo: { itemId: item.id, quantity: suggestedOrder(item) } } });

  const toggleSort = (key) => setSort(s => (s.key === key
    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'name' || key === 'status' ? 'asc' : 'desc' }));

  // ---- CSV -------------------------------------------------------------

  // Every matching item, not just this page: fetched a page of 500 at a time.
  const exportItems = async () => {
    setExporting(true);
    try {
      const params = {
        category: categoryFilter || undefined,
        status: (activeTab === 'reorder' ? reorderStatus : statusFilter) || undefined,
        missingCost: missingCost ? 'true' : undefined,
        archived: activeTab === 'reorder' ? 'active' : archivedView,
        sort: sort.key, dir: sort.dir, q: list.query.trim() || undefined, pageSize: 500
      };
      const all = [];
      for (let page = 1; page <= 200; page++) {
        const res = await inventoryAPI.getAll({ ...params, page });
        all.push(...(res.data?.data || []));
        if (page >= (res.data?.pagination?.totalPages || 1)) break;
      }
      writeCsv(all);
    } catch (err) {
      flash('error', errorMessage(err, 'Could not export the items'));
    } finally {
      setExporting(false);
    }
  };

  const writeCsv = (rows) => {
    downloadCsv(`inventory-${todayIST()}.csv`, rows, [
      ['itemName', 'Item'], ['sku', 'SKU'], ['category', 'Category'],
      ['quantity', 'On hand'], ['reservedQuantity', 'Reserved'], ['availableQuantity', 'Available'],
      ['unit', 'Unit'], ['hsnCode', 'HSN'], ['gstRate', 'GST %'], ['reorderLevel', 'Reorder level'], ['unitCost', 'Unit cost (INR)'],
      ['totalValue', 'Value (INR)'], [r => statusMeta(r.status).label, 'Status'],
      [r => (r.lastMovementAt ? formatDateTime(r.lastMovementAt) : ''), 'Last movement (IST)'],
      [r => (r.isActive === false ? 'Archived' : 'Active'), 'Record']
    ]);
  };

  // ---- Render helpers --------------------------------------------------

  const renderItemForm = () => (
    <section className="inventory-creator" aria-labelledby="inv-form-title">
      <h3 id="inv-form-title">{formMode === 'edit' ? `Edit ${editingItem?.itemName}` : 'Add new item'}</h3>
      <form onSubmit={handleFormSubmit} className="inventory-form" noValidate>
        <div className="form-section">
          <h4>Item details</h4>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inv-itemName">Item name *</label>
              <input id="inv-itemName" name="itemName" type="text" value={form.itemName}
                onChange={handleFormChange} required placeholder="e.g. Cotton fabric - white" />
            </div>
            <div className="form-group">
              <label htmlFor="inv-sku">SKU</label>
              <input id="inv-sku" name="sku" type="text" value={form.sku}
                onChange={handleFormChange} placeholder="e.g. CTN-WHT-001" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inv-category">Category</label>
              <input id="inv-category" name="category" type="text" list="inv-category-list"
                value={form.category} onChange={handleFormChange} placeholder="Choose or type a category" />
              <datalist id="inv-category-list">
                {categorySuggestions.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label htmlFor="inv-unit">Unit</label>
              <input id="inv-unit" name="unit" type="text" list="inv-unit-list"
                value={form.unit} onChange={handleFormChange} placeholder="pcs, m, kg…" />
              <datalist id="inv-unit-list">
                {unitSuggestions.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>GST</h4>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inv-hsnCode">HSN code</label>
              <input id="inv-hsnCode" name="hsnCode" type="text" inputMode="numeric" maxLength={8}
                value={form.hsnCode} placeholder="4–8 digits, e.g. 6109" aria-describedby="inv-hsn-help"
                onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value.replace(/\D/g, '') }))} />
              <small id="inv-hsn-help" className="inv-help">Used as the default on order lines and invoices.</small>
            </div>
            <div className="form-group">
              <label htmlFor="inv-gstRate">GST rate</label>
              <select id="inv-gstRate" name="gstRate" value={form.gstRate} onChange={handleFormChange}>
                <option value="">Not set</option>
                {GST_RATES.map(r => <option key={r} value={String(r)}>{r}%</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Stock</h4>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inv-reorderLevel">Reorder level</label>
              <input id="inv-reorderLevel" name="reorderLevel" type="number" min="0" step="any"
                value={form.reorderLevel} onChange={handleFormChange} placeholder="0" />
            </div>
            <div className="form-group">
              <label htmlFor="inv-unitCost">Unit cost (₹)</label>
              <input id="inv-unitCost" name="unitCost" type="number" min="0" step="0.01"
                value={form.unitCost} onChange={handleFormChange} placeholder="0.00" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inv-quantity">{formMode === 'edit' ? 'Quantity on hand' : 'Opening quantity'}</label>
              <input id="inv-quantity" name="quantity" type="number" min="0" step="any"
                value={form.quantity} onChange={handleFormChange} placeholder="0"
                aria-describedby="inv-quantity-help" />
              <small id="inv-quantity-help" className="inv-help">
                {formMode === 'edit'
                  ? 'Changing this records a stock adjustment in the item history. For deliveries and issues use the Stock button instead.'
                  : 'Recorded as the opening stock movement.'}
              </small>
            </div>
            {formMode === 'edit' && (
              <div className="form-group">
                <label htmlFor="inv-notes">Reason for quantity change{quantityChanged ? ' *' : ''}</label>
                <input id="inv-notes" name="notes" type="text" value={form.notes}
                  onChange={handleFormChange} disabled={!quantityChanged}
                  required={quantityChanged}
                  placeholder={quantityChanged ? 'e.g. Physical count on stock-take' : 'Only needed if the quantity changes'} />
              </div>
            )}
          </div>
        </div>

        {formError && <div className="inv-notice error" role="alert">{formError}</div>}

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={formSaving}>
            {formSaving ? 'Saving…' : formMode === 'edit' ? 'Save changes' : 'Add item'}
          </button>
          <button type="button" onClick={closeForm} className="btn-secondary" disabled={formSaving}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );

  const renderStockPanel = () => {
    const isAdjust = movement.type === 'adjustment';
    return (
      <section className="inv-panel" aria-labelledby="inv-stock-title">
        <div className="inv-panel-header">
          <h3 id="inv-stock-title">Record stock movement — {stockItem.itemName}</h3>
          <button type="button" className="inv-link-btn" onClick={closeStock} disabled={movementSaving}>Close</button>
        </div>
        <p className="inv-panel-sub">
          On hand {formatNumber(stockItem.quantity)} {stockItem.unit} · reserved {formatNumber(stockItem.reservedQuantity)} · available {formatNumber(stockItem.availableQuantity)}
        </p>
        <form onSubmit={handleMovementSubmit} noValidate>
          <fieldset className="inv-type-choice">
            <legend>Movement type</legend>
            {[
              ['receipt', 'Receive', 'Stock coming in (supplier delivery, return)'],
              ['issue', 'Issue', 'Stock going out (to production, sample, dispatch)'],
              ['adjustment', 'Adjust', 'Correct the count (stock-take, damage, loss)']
            ].map(([value, label, hint]) => (
              <label key={value} className={`inv-type-option ${movement.type === value ? 'selected' : ''}`}>
                <input type="radio" name="type" value={value} checked={movement.type === value}
                  onChange={handleMovementChange} />
                <span><strong>{label}</strong><small>{hint}</small></span>
              </label>
            ))}
          </fieldset>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inv-mv-quantity">
                {isAdjust ? 'Quantity change (use − to reduce) *' : `Quantity (${stockItem.unit || 'units'}) *`}
              </label>
              <input id="inv-mv-quantity" name="quantity" type="number" step="any"
                min={isAdjust ? undefined : '0'} value={movement.quantity}
                onChange={handleMovementChange} required
                placeholder={isAdjust ? 'e.g. -5 or 10' : 'e.g. 100'} />
            </div>
            {movement.type === 'receipt' ? (
              <div className="form-group">
                <label htmlFor="inv-mv-unitCost">Unit cost (₹)</label>
                <input id="inv-mv-unitCost" name="unitCost" type="number" min="0" step="0.01"
                  value={movement.unitCost} onChange={handleMovementChange}
                  placeholder={`Current ${formatMoney(stockItem.unitCost)}`} aria-describedby="inv-mv-unitCost-help" />
                <small id="inv-mv-unitCost-help" className="inv-help">
                  Optional. Updates the item&apos;s weighted-average cost.
                </small>
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="inv-mv-reference">Reference</label>
                <input id="inv-mv-reference" name="reference" type="text" value={movement.reference}
                  onChange={handleMovementChange}
                  placeholder={isAdjust ? 'e.g. Stock-take Oct 2026' : 'e.g. Job card / challan no.'} />
              </div>
            )}
          </div>

          <div className="form-row">
            {movement.type === 'receipt' && (
              <div className="form-group">
                <label htmlFor="inv-mv-reference">Reference</label>
                <input id="inv-mv-reference" name="reference" type="text" value={movement.reference}
                  onChange={handleMovementChange} placeholder="e.g. Supplier invoice or PO no." />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="inv-mv-notes">{isAdjust ? 'Reason *' : 'Notes'}</label>
              <input id="inv-mv-notes" name="notes" type="text" value={movement.notes}
                onChange={handleMovementChange} required={isAdjust}
                placeholder={isAdjust ? 'Why is the count changing?' : 'Optional'} />
            </div>
          </div>

          {movementError && <div className="inv-notice error" role="alert">{movementError}</div>}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={movementSaving}>
              {movementSaving ? 'Saving…' : `Record ${MOVEMENT_LABELS[movement.type].toLowerCase()}`}
            </button>
            <button type="button" className="btn-secondary" onClick={closeStock} disabled={movementSaving}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  };

  const renderItemsTable = () => {
    if (list.loading && items.length === 0) {
      return <p className="inv-state" role="status">Loading inventory…</p>;
    }
    if (items.length === 0) {
      const filtered = list.query.trim() || categoryFilter || (activeTab !== 'reorder' && statusFilter);
      return (
        <p className="inv-state">
          {filtered
            ? 'No items match your search or filter.'
            : activeTab === 'reorder'
              ? `No items are ${reorderStatus === 'low-stock' ? 'low on' : 'out of'} stock.`
              : 'No inventory items yet. Use “+ Add item” to create your first item with its opening stock.'}
        </p>
      );
    }
    const SortHead = ({ k, children, num }) => {
      const active = sort.key === k;
      return (
        <th scope="col" className={num ? 'inv-num' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
          <button type="button" className={`inv-sort ${active ? 'active' : ''}`} onClick={() => toggleSort(k)}>
            {children}<span aria-hidden="true">{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
          </button>
        </th>
      );
    };
    return (
      <div className="table-container">
        <table className="inventory-table inv-items">
          <thead>
            <tr>
              <SortHead k="name">Item</SortHead>
              <SortHead k="quantity" num>On hand</SortHead>
              <SortHead k="available" num>Available</SortHead>
              <SortHead k="value" num>Stock value</SortHead>
              <SortHead k="moved">Last movement</SortHead>
              <SortHead k="status">Status</SortHead>
              <th scope="col"><span className="inv-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(item => {
              const meta = statusMeta(item.status);
              const archived = item.isActive === false;
              const level = Number(item.reorderLevel) || 0;
              // Bar: on hand against twice the reorder level (full = comfortably stocked).
              const fill = level > 0 ? Math.min(100, (Number(item.quantity) / (level * 2)) * 100) : (Number(item.quantity) > 0 ? 100 : 0);
              const noCost = Number(item.unitCost) === 0 && Number(item.quantity) > 0;
              const days = item.lastMovementAt ? Math.floor((Date.now() - new Date(item.lastMovementAt).getTime()) / 86400000) : null;
              const slow = days !== null && days >= SLOW_DAYS && Number(item.quantity) > 0;
              const needsReorder = item.status === 'low-stock' || item.status === 'out-of-stock';
              const more = [
                { key: 'history', label: 'Movement history', run: () => openHistory(item) },
                ...(!archived ? [{ key: 'edit', label: 'Edit details', run: () => openEdit(item) }] : []),
                ...(!archived && needsReorder ? [{ key: 'po', label: 'Raise purchase order', run: () => raisePO(item) }] : []),
                archived
                  ? { key: 'restore', label: 'Restore item', run: () => setArchived(item, false) }
                  : { key: 'archive', label: 'Archive item', danger: true, run: () => setArchived(item, true) }
              ];
              return (
                <tr key={item.id} className={archived ? 'inv-row-archived' : ''}>
                  <td className="inv-item-cell">
                    <div className="inv-item-name">
                      {item.itemName}
                      {archived && <span className="inv-tag muted">Archived</span>}
                    </div>
                    <div className="inv-item-meta">
                      {item.category && <span className="stk-chip">{item.category}</span>}
                      <span>{item.sku ? `SKU ${item.sku}` : 'No SKU'}</span>
                      <span>HSN {item.hsnCode || '—'}</span>
                      <span>GST {fmtRate(item.gstRate)}</span>
                    </div>
                  </td>
                  <td className="inv-num">
                    <div className="inv-qty"><strong>{formatNumber(item.quantity)}</strong> <span>{item.unit || ''}</span></div>
                    <div className={`inv-level ${meta.className}`} role="img"
                      aria-label={level ? `Reorder level ${formatNumber(level)}` : 'No reorder level set'}>
                      <span style={{ width: `${fill}%` }} />
                    </div>
                    <div className="stk-sub">{level ? `Reorder at ${formatNumber(level)}` : 'No reorder level'}</div>
                  </td>
                  <td className="inv-num">
                    <strong>{formatNumber(item.availableQuantity)}</strong>
                    <div className="stk-sub">{Number(item.reservedQuantity) ? `${formatNumber(item.reservedQuantity)} reserved` : 'None reserved'}</div>
                  </td>
                  <td className="inv-num">
                    <strong>{formatMoney(item.totalValue)}</strong>
                    <div className="stk-sub">
                      {noCost
                        ? <span className="inv-tag warn" title="Stock is valued at ₹0 until a unit cost is entered">No cost</span>
                        : `@ ${formatMoney(item.unitCost)}${item.unit ? ` / ${item.unit}` : ''} avg`}
                    </div>
                  </td>
                  <td>
                    <span className={slow ? 'inv-slow' : ''} title={item.lastMovementAt ? formatDateTime(item.lastMovementAt) : 'No movement recorded'}>
                      {sinceText(item.lastMovementAt)}
                    </span>
                    {slow && <div className="stk-sub warn">Slow-moving</div>}
                  </td>
                  <td><span className={`status ${meta.className}`}>{meta.label}</span></td>
                  <td className="inv-actions">
                    <div className="inv-actions-row">
                      {!archived && (activeTab === 'reorder'
                        ? <button type="button" className="inv-act primary" onClick={() => raisePO(item)}
                            aria-label={`Raise purchase order for ${item.itemName}`}>Raise PO</button>
                        : <button type="button" className="inv-act primary" onClick={() => openStock(item)}
                            aria-label={`Record stock movement for ${item.itemName}`}>Stock</button>)}
                      <RowMenu label={`More actions for ${item.itemName}`} items={more} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ---- Page ------------------------------------------------------------

  // A figure card that also filters the list when clicked.
  const kpi = ({ label, value, tone, sub, active, onClick }) => {
    const body = (
      <>
        <span className="inv-kpi-label">{label}</span>
        <span className="inv-kpi-value">{value}</span>
        {sub && <span className="inv-kpi-sub">{sub}</span>}
      </>
    );
    // Only cards that filter are buttons; the others are plain figures.
    return onClick ? (
      <button type="button" key={label} className={`inv-kpi clickable ${tone || ''} ${active ? 'active' : ''}`}
        onClick={onClick} aria-pressed={Boolean(active)} title="Click to filter the list">{body}</button>
    ) : (
      <div key={label} className={`inv-kpi ${tone || ''}`}>{body}</div>
    );
  };
  const showReorder = (status) => { setActiveTab('reorder'); setReorderStatus(status); setMissingCost(false); };
  const clearFilters = () => {
    list.setQuery(''); setCategoryFilter(''); setStatusFilter(''); setMissingCost(false); setArchivedView('active');
  };
  const filtersOn = Boolean(list.query || categoryFilter || statusFilter || missingCost || archivedView !== 'active');
  const missing = Number(stats?.missingCost) || 0;

  return (
    <div className="inventory">
      <div className="inventory-header">
        <div className="inv-title-row">
          <div>
            <h1>Inventory</h1>
            <p className="inv-subtitle">Stock on hand, reservations for orders and the value of what you hold, at average cost.</p>
          </div>
          <button type="button" className="btn-primary" onClick={openAdd}>+ Add item</button>
        </div>
        <div className="inventory-tabs" role="tablist" aria-label="Inventory views">
          {[
            ['items', 'All items'],
            ['reorder', `Needs reorder${reorderCount ? ` (${reorderCount})` : ''}`],
            ['movements', 'Stock movements']
          ].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={activeTab === key}
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice && <div className={`inv-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}
      {loadError && (
        <div className="inv-notice error" role="alert">
          {loadError}{' '}
          <button type="button" className="inv-link-btn" onClick={retry}>Retry</button>
        </div>
      )}

      {/* The server's status categories are mutually exclusive (in/low/out),
          so low stock here does not include out-of-stock items. */}
      <div className="inv-kpis">
        {kpi({ label: 'Active items', value: formatNumber(stats?.totalItems ?? 0, { decimals: 0 }),
          sub: stats?.archived ? `${formatNumber(stats.archived, { decimals: 0 })} archived` : 'All in use' })}
        {kpi({ label: 'Stock value', value: formatMoney(stats?.totalValue ?? 0), tone: 'accent', sub: 'At average cost' })}
        {kpi({ label: 'Reserved for orders', value: formatMoney(stats?.reservedValue ?? 0), sub: 'Held for confirmed orders' })}
        {kpi({ label: 'Low stock', value: formatNumber(stats?.lowStock ?? 0, { decimals: 0 }), tone: 'warn', sub: 'At or below reorder level',
          active: activeTab === 'reorder' && reorderStatus === 'low-stock', onClick: () => showReorder('low-stock') })}
        {kpi({ label: 'Out of stock', value: formatNumber(stats?.outOfStock ?? 0, { decimals: 0 }), tone: 'danger', sub: 'Nothing on hand',
          active: activeTab === 'reorder' && reorderStatus === 'out-of-stock', onClick: () => showReorder('out-of-stock') })}
        {kpi({ label: 'Missing cost', value: formatNumber(missing, { decimals: 0 }), tone: missing ? 'warn' : '', sub: 'Valued at ₹0',
          active: missingCost, onClick: () => { setActiveTab('items'); setMissingCost(m => !m); } })}
      </div>

      {missing > 0 && !missingCost && (
        <div className="inv-banner" role="note">
          <span>
            <strong>{formatNumber(missing, { decimals: 0 })} item{missing === 1 ? ' has' : 's have'} stock but no unit cost</strong>, so
            stock value and cost of goods sold are understated. Enter a cost with Edit details.
          </span>
          <button type="button" className="inv-banner-btn" onClick={() => { setActiveTab('items'); setMissingCost(true); }}>Show them</button>
        </div>
      )}

      {activeTab === 'movements' ? <MovementsLog refreshKey={refreshKey} /> : (
        <div className="inventory-table-section">
          <div className="inv-section-head">
            <h3>
              {activeTab === 'reorder' ? 'Items at or below reorder level' : missingCost ? 'Items missing a unit cost' : 'Inventory items'}
              <span className="inv-count">{formatNumber(list.pagination.total, { decimals: 0 })}</span>
            </h3>
            <div className="inv-toolbar-actions">
              <SearchBox value={list.query} onChange={list.setQuery} placeholder="Name, SKU, category or HSN"
                label="Search items" />
              <label htmlFor="inv-category-filter" className="inv-sr-only">Filter by category</label>
              <select id="inv-category-filter" className="inv-search" value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">All categories</option>
                {categoryFilterOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {activeTab === 'reorder' ? (
                <>
                  <label htmlFor="inv-reorder-filter" className="inv-sr-only">Reorder status</label>
                  <select id="inv-reorder-filter" className="inv-search" value={reorderStatus}
                    onChange={(e) => setReorderStatus(e.target.value)}>
                    <option value="low-stock">Low stock</option>
                    <option value="out-of-stock">Out of stock</option>
                  </select>
                </>
              ) : (
                <>
                  <label htmlFor="inv-status-filter" className="inv-sr-only">Filter by status</label>
                  <select id="inv-status-filter" className="inv-search" value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                  <label htmlFor="inv-archived-filter" className="inv-sr-only">Active or archived items</label>
                  <select id="inv-archived-filter" className="inv-search inv-narrow" value={archivedView}
                    onChange={(e) => setArchivedView(e.target.value)}>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">Active + archived</option>
                  </select>
                </>
              )}
              <button type="button" className="btn-expand" onClick={exportItems}
                disabled={exporting || list.pagination.total === 0} title="Exports every item that matches the filters">
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>
          {(filtersOn || activeTab === 'reorder') && (
            <div className="inv-filterbar">
              {activeTab === 'reorder' && <span>Suggested order quantity brings available stock back to twice the reorder level. Use <strong>Raise PO</strong> to start a purchase order.</span>}
              {filtersOn && activeTab !== 'reorder' && <span>Filters are on.</span>}
              {filtersOn && <button type="button" className="inv-link-btn" onClick={clearFilters}>Clear all filters</button>}
            </div>
          )}
          {renderItemsTable()}
          <Pagination pagination={list.pagination} onPage={list.setPage} disabled={list.loading} label="items" />
        </div>
      )}

      {formMode && (
        <Drawer title={formMode === 'edit' ? `Edit ${editingItem?.itemName}` : 'Add new item'}
          subtitle={formMode === 'edit' ? 'Details, GST and stock settings' : 'Creates the item with its opening stock'}
          onClose={closeForm} busy={formSaving} width={620}>
          {renderItemForm()}
        </Drawer>
      )}
      {stockItem && (
        <Drawer title={`Stock movement — ${stockItem.itemName}`}
          subtitle={`On hand ${formatNumber(stockItem.quantity)} ${stockItem.unit || ''} · reserved ${formatNumber(stockItem.reservedQuantity)} · available ${formatNumber(stockItem.availableQuantity)}`}
          onClose={closeStock} busy={movementSaving}>
          {renderStockPanel()}
        </Drawer>
      )}
      {historyItem && (
        <Drawer title={`History — ${historyItem.itemName}`} onClose={() => setHistoryItem(null)} width={860}>
          <HistoryPanel key={historyItem.id} item={historyItem} refreshKey={refreshKey} onClose={() => setHistoryItem(null)} />
        </Drawer>
      )}
    </div>
  );
};

export default Inventory;
