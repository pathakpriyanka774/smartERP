import React, { useState, useEffect, useCallback, useRef } from 'react';
import { costingAPI } from '../../services/api';
import {
  formatMoney, formatNumber, formatPercent, formatDate, errorMessage, downloadCsv, todayIST
} from '../../utils/format';
import './StyleCosting.css';

// SQL decimals can arrive as strings or null; never call .toFixed on them directly.
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const csvName = (name) => `${name}-${todayIST()}.csv`;
const rows = (res) => res?.data?.data || [];

const TABS = [
  { id: 'overview', label: '📊 Style overview' },
  { id: 'breakdown', label: '🔍 Cost breakdown' },
  { id: 'links', label: '🔗 Stock links' },
  { id: 'materials', label: '🧵 Material usage' }
];

const EMPTY_FORM = { materialId: '', quantity: '', rate: '' };

// Defined outside the screen so it keeps its identity between renders
// (an inner component would remount the style select and drop focus).
const SectionHead = ({ title, onExport, disabled, children }) => (
  <div className="section-head">
    <h2>{title}</h2>
    <div className="section-actions">
      {children}
      {onExport && (
        <button type="button" className="btn-export" onClick={onExport} disabled={disabled}>Export CSV</button>
      )}
    </div>
  </div>
);

const StyleCosting = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const [dashboard, setDashboard] = useState({ styleCosts: [], metrics: {} });
  const [materials, setMaterials] = useState([]);
  const [styles, setStyles] = useState([]);
  const [usage, setUsage] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [breakdown, setBreakdown] = useState({ loading: false, error: null, rows: [] });

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(null);   // key of the link select whose save is in flight
  const [notice, setNotice] = useState(null);

  // A save outcome must always be visible; the old screen swallowed failures in console.error.
  const timer = useRef(null);
  const flash = useCallback((type, text) => {
    clearTimeout(timer.current);
    setNotice({ type, text });
    timer.current = setTimeout(() => setNotice(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [dash, mats, sty, use, items] = await Promise.all([
        costingAPI.getDashboard(),
        costingAPI.getMaterials(),
        costingAPI.getStyles(),
        costingAPI.getMaterialUsage(),
        costingAPI.getInventoryItems()
      ]);
      const d = dash.data?.data || {};
      setDashboard({ styleCosts: d.styleCosts || [], metrics: d.metrics || {} });
      setMaterials(rows(mats));
      setStyles(rows(sty));
      setUsage(rows(use));
      setStockItems(rows(items));
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load style costing'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadBreakdown = useCallback(async (styleId) => {
    setBreakdown(b => ({ ...b, loading: true, error: null }));
    try {
      const res = await costingAPI.getBreakdown(styleId);
      setBreakdown({ loading: false, error: null, rows: rows(res) });
    } catch (err) {
      setBreakdown({ loading: false, error: errorMessage(err, 'Could not load the cost breakdown'), rows: [] });
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadBreakdown(selectedId);
  }, [selectedId, loadBreakdown]);

  const selectStyle = (styleId) => {
    setSelectedId(styleId ? Number(styleId) : null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setActiveTab('breakdown');
  };

  const selectedStyle = dashboard.styleCosts.find(s => s.StyleID === selectedId)
    || styles.find(s => s.StyleID === selectedId) || null;

  // Percentages use the breakdown's own total so the shares always add up to 100%,
  // and a zero total (all rates 0 / null) shows "—" rather than NaN or Infinity.
  const breakdownTotal = breakdown.rows.reduce((a, r) => a + (num(r.TotalCost) || 0), 0);
  const shareOf = (cost) => {
    const c = num(cost);
    return breakdownTotal > 0 && c !== null ? (c / breakdownTotal) * 100 : null;
  };

  /* ------------------------- Update costing ------------------------- */
  const onMaterialChange = (materialId) => {
    const m = materials.find(x => String(x.MaterialID) === materialId);
    const rate = num(m?.CurrentRate);
    // Default to the material's current rate, but keep a rate the user already typed.
    setForm(f => ({ ...f, materialId, rate: f.rate === '' && rate !== null ? String(rate) : f.rate }));
  };

  // Breakdown rows carry no MaterialID, so match by name to prefill the form.
  const editRow = (row) => {
    const m = materials.find(x => x.MaterialName === row.MaterialName);
    setForm({
      materialId: m ? String(m.MaterialID) : '',
      quantity: num(row.Quantity) === null ? '' : String(num(row.Quantity)),
      rate: num(row.Rate) === null ? '' : String(num(row.Rate))
    });
    setFormError(m ? null : `Could not find "${row.MaterialName}" in the materials list — pick it below.`);
  };

  const saveCosting = async (e) => {
    e.preventDefault();
    const quantity = Number(form.quantity);
    const rate = Number(form.rate);
    if (!selectedId) return setFormError('Select a style first.');
    if (!form.materialId) return setFormError('Select a material.');
    if (!(quantity > 0)) return setFormError('Quantity per piece must be greater than 0.');
    if (form.rate === '' || !(rate >= 0)) return setFormError('Rate must be 0 or more.');
    setFormError(null);
    setSaving(true);
    try {
      const res = await costingAPI.updateCosting({
        styleId: selectedId, materialId: Number(form.materialId), quantity, rate
      });
      flash('success', res.data?.data?.Message || res.data?.message || 'Costing saved');
      setForm(EMPTY_FORM);
      await Promise.all([loadBreakdown(selectedId), loadAll()]);
    } catch (err) {
      flash('error', errorMessage(err, 'Could not save the costing'));
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------- Stock links --------------------------- */
  const linkMaterial = async (material, value) => {
    const key = `m-${material.MaterialID}`;
    setLinking(key);
    try {
      const res = await costingAPI.linkMaterial(material.MaterialID, value ? Number(value) : null);
      flash('success', res.data?.message || (value
        ? `${material.MaterialName} is now taken from stock in production`
        : `${material.MaterialName} is no longer tracked in stock`));
      setMaterials(rows(await costingAPI.getMaterials()));
    } catch (err) {
      flash('error', errorMessage(err, 'Could not link the material'));
    } finally {
      setLinking(null);
    }
  };

  const linkFinished = async (style, value) => {
    const key = `s-${style.StyleID}`;
    setLinking(key);
    try {
      const res = await costingAPI.linkFinishedItem(style.StyleID, value ? Number(value) : null);
      flash('success', res.data?.message || (value
        ? `Approved ${style.StyleName} pieces will be added to stock`
        : `${style.StyleName} finished goods are no longer tracked in stock`));
      setStyles(rows(await costingAPI.getStyles()));
    } catch (err) {
      flash('error', errorMessage(err, 'Could not link the finished-goods item'));
    } finally {
      setLinking(null);
    }
  };

  const stockOption = (it) => (
    <option key={it.ItemID} value={it.ItemID}>
      {it.ItemName}{it.SKU ? ` (${it.SKU})` : ''}{it.Unit ? ` · ${it.Unit}` : ''}
    </option>
  );

  /* ----------------------------- Exports ----------------------------- */
  const exportStyles = () => downloadCsv(csvName('style-costs'), dashboard.styleCosts, [
    ['StyleCode', 'Style code'], ['StyleName', 'Style name'], ['Category', 'Category'],
    ['TotalMaterialCost', 'Material cost per piece (INR)'], ['MaterialCount', 'Materials'],
    [r => (r.LastUpdated ? String(r.LastUpdated).slice(0, 10) : ''), 'Last updated']
  ]);
  const exportBreakdown = () => downloadCsv(
    csvName(`cost-breakdown-${selectedStyle?.StyleCode || selectedId}`), breakdown.rows, [
      ['MaterialName', 'Material'], ['MaterialCategory', 'Category'], ['Quantity', 'Qty per piece'],
      ['Unit', 'Unit'], ['Rate', 'Rate (INR)'], ['TotalCost', 'Cost (INR)'],
      [r => { const p = shareOf(r.TotalCost); return p === null ? '' : p.toFixed(1); }, '% of style cost']
    ]);
  const exportMaterialLinks = () => downloadCsv(csvName('material-stock-links'), materials, [
    ['MaterialCode', 'Material code'], ['MaterialName', 'Material'], ['Unit', 'Unit'],
    ['CurrentRate', 'Current rate (INR)'], ['InventoryItemName', 'Stock item'], ['InventoryQuantity', 'In stock']
  ]);
  const exportStyleLinks = () => downloadCsv(csvName('finished-goods-links'), styles, [
    ['StyleCode', 'Style code'], ['StyleName', 'Style name'], ['Category', 'Category'],
    ['FinishedItemName', 'Finished-goods stock item']
  ]);
  const exportUsage = () => downloadCsv(csvName('material-usage'), usage, [
    ['MaterialCode', 'Material code'], ['MaterialName', 'Material'], ['Category', 'Category'],
    ['CurrentRate', 'Current rate (INR)'], ['UsedInStyles', 'Used in styles'],
    ['TotalQuantityUsed', 'Total qty per piece'], ['AverageRate', 'Average rate (INR)']
  ]);

  const { metrics } = dashboard;

  /* ------------------------------ Render ------------------------------ */
  const renderOverview = () => (
    <div className="overview-section">
      <SectionHead title="Style cost overview" onExport={exportStyles} disabled={!dashboard.styleCosts.length} />
      {dashboard.styleCosts.length ? (
        <div className="table-container">
          <table className="costing-table">
            <thead>
              <tr>
                <th>Style code</th><th>Style name</th><th>Category</th>
                <th className="num">Material cost / piece</th><th className="num">Materials</th>
                <th>Last updated</th><th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {dashboard.styleCosts.map(style => (
                <tr key={style.StyleID} className={style.StyleID === selectedId ? 'selected' : ''}>
                  <td><strong>{style.StyleCode}</strong></td>
                  <td>{style.StyleName}</td>
                  <td>{style.Category || '—'}</td>
                  <td className="num cost-value">{formatMoney(style.TotalMaterialCost)}</td>
                  <td className="num">{formatNumber(style.MaterialCount, { decimals: 0 })}</td>
                  <td>{formatDate(style.LastUpdated)}</td>
                  <td>
                    <button type="button" className="btn-view" onClick={() => selectStyle(style.StyleID)}>
                      View breakdown
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No styles yet.</p>}
    </div>
  );

  const renderBreakdown = () => (
    <div className="breakdown-section">
      <SectionHead title="Cost breakdown" onExport={exportBreakdown} disabled={!breakdown.rows.length}>
        <label className="inline-field">
          Style
          <select value={selectedId || ''} onChange={(e) => selectStyle(e.target.value)}>
            <option value="">Select a style…</option>
            {dashboard.styleCosts.map(s => (
              <option key={s.StyleID} value={s.StyleID}>{s.StyleCode} — {s.StyleName}</option>
            ))}
          </select>
        </label>
      </SectionHead>

      {!selectedId ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>Select a style</h3>
          <p>Choose a style above or from the overview to see what it costs to make one piece.</p>
        </div>
      ) : (
        <>
          <div className="selected-style">
            <h3>{selectedStyle ? `${selectedStyle.StyleName} (${selectedStyle.StyleCode})` : `Style #${selectedId}`}</h3>
            <p>Material cost per piece: <strong>{formatMoney(breakdownTotal)}</strong></p>
          </div>

          {breakdown.error ? (
            <div className="sc-notice error" role="alert">
              {breakdown.error}{' '}
              <button type="button" className="btn-secondary" onClick={() => loadBreakdown(selectedId)}>Try again</button>
            </div>
          ) : breakdown.loading && !breakdown.rows.length ? (
            <p className="muted">Loading breakdown…</p>
          ) : breakdown.rows.length ? (
            <div className="breakdown-content">
              <div className="breakdown-chart" aria-label="Share of material cost">
                {breakdown.rows.map((item, index) => {
                  const pct = shareOf(item.TotalCost);
                  return (
                    <div key={`${item.MaterialName}-${index}`} className="cost-item">
                      <div className="cost-bar">
                        <div className="cost-fill" style={{ width: `${Math.min(100, pct || 0)}%` }} />
                      </div>
                      <div className="cost-details">
                        <span className="material-name">{item.MaterialName}</span>
                        <span className="cost-amount">{formatMoney(item.TotalCost)} ({formatPercent(pct)})</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="breakdown-table">
                <table className="costing-table">
                  <thead>
                    <tr>
                      <th>Material</th><th>Category</th><th className="num">Qty / piece</th><th>Unit</th>
                      <th className="num">Rate</th><th className="num">Cost</th><th className="num">% of style</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.rows.map((item, index) => (
                      <tr key={`${item.MaterialName}-${index}`}>
                        <td>{item.MaterialName}</td>
                        <td>{item.MaterialCategory || '—'}</td>
                        <td className="num">{formatNumber(item.Quantity, { decimals: 4 })}</td>
                        <td>{item.Unit || '—'}</td>
                        <td className="num">{formatMoney(item.Rate)}</td>
                        <td className="num cost-value">{formatMoney(item.TotalCost)}</td>
                        <td className="num">{formatPercent(shareOf(item.TotalCost))}</td>
                        <td>
                          <button type="button" className="btn-view" onClick={() => editRow(item)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <p className="muted">No materials costed for this style yet. Add the first one below.</p>}

          <form className="costing-form" onSubmit={saveCosting} noValidate>
            <h3>Update costing</h3>
            <p className="muted">Adds the material to this style, or replaces its quantity and rate if it is already there.</p>
            <div className="form-grid">
              <label>
                Material
                <select value={form.materialId} onChange={(e) => onMaterialChange(e.target.value)} required>
                  <option value="">Select a material…</option>
                  {materials.map(m => (
                    <option key={m.MaterialID} value={m.MaterialID}>
                      {m.MaterialCode} — {m.MaterialName}{m.Unit ? ` (${m.Unit})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity per piece
                <input type="number" min="0" step="any" inputMode="decimal" value={form.quantity}
                       onChange={(e) => setForm(f => ({ ...f, quantity: e.target.value }))} required />
              </label>
              <label>
                Rate (₹ per unit)
                <input type="number" min="0" step="any" inputMode="decimal" value={form.rate}
                       onChange={(e) => setForm(f => ({ ...f, rate: e.target.value }))} required />
              </label>
            </div>
            {form.quantity !== '' && form.rate !== '' && Number(form.quantity) > 0 && Number(form.rate) >= 0 && (
              <p className="muted">Cost per piece for this material: {formatMoney(Number(form.quantity) * Number(form.rate))}</p>
            )}
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => { setForm(EMPTY_FORM); setFormError(null); }}
                      disabled={saving}>Clear</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save costing'}</button>
            </div>
          </form>
        </>
      )}
    </div>
  );

  const renderLinks = () => (
    <div className="links-section">
      <div className="links-explainer">
        <strong>How stock links work.</strong> When production is recorded, each linked material is deducted
        from its stock item (quantity per piece × pieces made); production is refused if there is not enough.
        Pieces approved in quality inspection are added to the style’s finished-goods stock item.
        Materials or styles marked “Not tracked” do not touch stock.
      </div>

      <SectionHead title="Materials → stock items" onExport={exportMaterialLinks} disabled={!materials.length} />
      {materials.length ? (
        <div className="table-container">
          <table className="costing-table">
            <thead>
              <tr><th>Code</th><th>Material</th><th>Unit</th><th className="num">Current rate</th>
                <th>Stock item</th><th className="num">In stock</th></tr>
            </thead>
            <tbody>
              {materials.map(m => {
                const key = `m-${m.MaterialID}`;
                const id = `link-material-${m.MaterialID}`;
                return (
                  <tr key={m.MaterialID}>
                    <td><strong>{m.MaterialCode}</strong></td>
                    <td>{m.MaterialName}</td>
                    <td>{m.Unit || '—'}</td>
                    <td className="num">{formatMoney(m.CurrentRate)}</td>
                    <td>
                      <label htmlFor={id} className="sr-only">Stock item for {m.MaterialName}</label>
                      <select id={id} value={m.InventoryItemID ?? ''} disabled={linking !== null}
                              onChange={(e) => linkMaterial(m, e.target.value)}>
                        <option value="">Not tracked</option>
                        {stockItems.map(stockOption)}
                      </select>
                      {linking === key && <span className="saving-hint">Saving…</span>}
                    </td>
                    <td className="num">
                      {m.InventoryItemID ? `${formatNumber(m.InventoryQuantity)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No materials yet.</p>}

      <SectionHead title="Styles → finished-goods stock item" onExport={exportStyleLinks} disabled={!styles.length} />
      {styles.length ? (
        <div className="table-container">
          <table className="costing-table">
            <thead>
              <tr><th>Style code</th><th>Style name</th><th>Category</th><th>Finished-goods item</th></tr>
            </thead>
            <tbody>
              {styles.map(s => {
                const key = `s-${s.StyleID}`;
                const id = `link-style-${s.StyleID}`;
                return (
                  <tr key={s.StyleID}>
                    <td><strong>{s.StyleCode}</strong></td>
                    <td>{s.StyleName}</td>
                    <td>{s.Category || '—'}</td>
                    <td>
                      <label htmlFor={id} className="sr-only">Finished-goods item for {s.StyleName}</label>
                      <select id={id} value={s.FinishedItemID ?? ''} disabled={linking !== null}
                              onChange={(e) => linkFinished(s, e.target.value)}>
                        <option value="">Not tracked</option>
                        {stockItems.map(stockOption)}
                      </select>
                      {linking === key && <span className="saving-hint">Saving…</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No styles yet.</p>}
      {!stockItems.length && (
        <p className="muted">No stock items exist yet — create them in Inventory first, then link them here.</p>
      )}
    </div>
  );

  const renderUsage = () => (
    <div className="materials-section">
      <SectionHead title="Material usage" onExport={exportUsage} disabled={!usage.length} />
      {usage.length ? (
        <div className="table-container">
          <table className="costing-table">
            <thead>
              <tr>
                <th>Code</th><th>Material</th><th>Category</th><th className="num">Current rate</th>
                <th className="num">Used in styles</th><th className="num">Total qty / piece</th><th className="num">Average rate</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((m, i) => (
                <tr key={`${m.MaterialCode}-${i}`}>
                  <td><strong>{m.MaterialCode}</strong></td>
                  <td>{m.MaterialName}</td>
                  <td>{m.Category || '—'}</td>
                  <td className="num">{formatMoney(m.CurrentRate)}</td>
                  <td className="num">{formatNumber(m.UsedInStyles ?? 0, { decimals: 0 })}</td>
                  <td className="num">{formatNumber(m.TotalQuantityUsed, { decimals: 4 })}</td>
                  <td className="num">{formatMoney(m.AverageRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No materials yet.</p>}
    </div>
  );

  return (
    <div className="style-costing">
      <div className="costing-header">
        <h1>💰 Style Costing</h1>
        <button type="button" className="btn-secondary" onClick={loadAll} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {notice && <div className={`sc-notice ${notice.type}`} role="status">{notice.text}</div>}

      {loadError ? (
        <div className="sc-notice error" role="alert">
          {loadError}{' '}
          <button type="button" className="btn-secondary" onClick={loadAll}>Try again</button>
        </div>
      ) : loading && !dashboard.styleCosts.length && !materials.length ? (
        <p className="muted">Loading style costing…</p>
      ) : (
        <>
          <div className="metrics-grid">
            {[
              ['👕', 'Total styles', formatNumber(metrics.TotalStyles, { decimals: 0 })],
              ['🧵', 'Total materials', formatNumber(metrics.TotalMaterials, { decimals: 0 })],
              ['📊', 'Average cost / piece', formatMoney(metrics.AvgStyleCost)],
              ['📈', 'Highest cost / piece', formatMoney(metrics.MaxStyleCost)],
              ['📉', 'Lowest cost / piece', formatMoney(metrics.MinStyleCost)]
            ].map(([icon, title, value]) => (
              <div className="metric-card" key={title}>
                <div className="metric-icon" aria-hidden="true">{icon}</div>
                <div className="metric-content">
                  <h3>{title}</h3>
                  <div className="metric-value">{value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="costing-tabs" role="tablist" aria-label="Style costing">
            {TABS.map(t => (
              <button type="button" key={t.id} role="tab" aria-selected={activeTab === t.id}
                      className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="tab-content" role="tabpanel">
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'breakdown' && renderBreakdown()}
            {activeTab === 'links' && renderLinks()}
            {activeTab === 'materials' && renderUsage()}
          </div>
        </>
      )}
    </div>
  );
};

export default StyleCosting;
