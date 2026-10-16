import React, { useState, useEffect, useCallback, useRef } from 'react';
import { reportsAPI } from '../../services/api';
import ChartRenderer from '../../chartbuilder/ChartRenderer';
import { OTHER } from '../../pagebuilder/palette';
import {
  formatMoney, formatNumber, formatPercent, formatMonth, errorMessage, downloadCsv, todayIST
} from '../../utils/format';
import './Reports.css';

const TABS = [
  { id: 'sales', name: 'Sales', icon: '📈', load: reportsAPI.getSalesReport },
  { id: 'production', name: 'Production', icon: '🏭', load: reportsAPI.getProductionReport },
  { id: 'inventory', name: 'Inventory', icon: '📦', load: reportsAPI.getInventoryReport },
  { id: 'finance', name: 'Finance', icon: '💰', load: reportsAPI.getFinanceReport }
];

// The API returns SQL decimals, which may arrive as strings; charts need numbers.
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Minutes → "2 h 15 min"; null means no task has been timed yet. */
const formatDuration = (minutes) => {
  const m = num(minutes);
  if (m === null || Number.isNaN(m)) return '—';
  const total = Math.round(m);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
};

const signedPercent = (v) => {
  const n = num(v);
  if (n === null || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${formatPercent(n)}`;
};

const csvName = (name) => `${name}-${todayIST()}.csv`;

/** A pie with many slices is unreadable: keep the largest 7 and fold the rest into "Other". */
const MAX_SLICES = 8;
const foldSlices = (rows, labelKey, valueKey) => {
  const sorted = [...rows]
    .map(r => ({ label: r[labelKey] || 'Uncategorised', value: Math.max(0, num(r[valueKey]) || 0) }))
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return { slices: sorted, folded: false };
  const head = sorted.slice(0, MAX_SLICES - 1);
  const other = sorted.slice(MAX_SLICES - 1).reduce((a, r) => a + r.value, 0);
  return { slices: [...head, { label: 'Other', value: other }], folded: true };
};

const StatCard = ({ title, value, note, tone }) => (
  <div className="stat-card">
    <h3>{title}</h3>
    <div className={`stat-value ${tone || ''}`}>{value}</div>
    {note && <div className="stat-note">{note}</div>}
  </div>
);

/** A titled block with a working CSV export (replaces the old non-functional "Export PDF"). */
const Panel = ({ title, onExport, exportDisabled, children }) => (
  <div className="report-panel">
    <div className="report-header">
      <h2>{title}</h2>
      {onExport && (
        <button type="button" className="export-btn" onClick={onExport} disabled={exportDisabled}>
          Export CSV
        </button>
      )}
    </div>
    {children}
  </div>
);

const Empty = ({ children }) => <p className="report-empty">{children}</p>;

const ProgressBar = ({ value }) => {
  const n = num(value);
  if (n === null || Number.isNaN(n)) return <span>—</span>;
  // Over-production can push progress past 100%; cap the bar, keep the real figure.
  const width = Math.min(100, Math.max(0, n));
  return (
    <div className="progress-cell">
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(n)}
           aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
        <div className={`progress-fill ${n >= 100 ? 'done' : ''}`} style={{ width: `${width}%` }} />
      </div>
      <span className="progress-label">{formatPercent(n)}</span>
    </div>
  );
};

const STATUS_LABEL = { 'in-stock': 'In stock', 'low-stock': 'Low stock', 'out-of-stock': 'Out of stock' };

/* ----------------------------- Sales ----------------------------- */
const SalesReport = ({ data }) => {
  const byMonth = data.byMonth || [];
  const topProducts = data.topProducts || [];
  const topClients = data.topClients || [];
  const growth = num(data.monthlyGrowth);

  return (
    <>
      <div className="stats-grid">
        <StatCard title="Total sales" value={formatMoney(data.totalSales)} />
        <StatCard title="Orders" value={formatNumber(data.orderCount, { decimals: 0 })}
                  note={`${formatNumber(data.cancelledCount || 0, { decimals: 0 })} cancelled (excluded)`} />
        <StatCard title="Average order value" value={formatMoney(data.averageOrderValue)} />
        <StatCard title="This month" value={formatMoney(data.thisMonth)}
                  note={`Last month: ${formatMoney(data.lastMonth)}`} />
        <StatCard title="Monthly growth"
                  value={growth === null ? '—' : signedPercent(growth)}
                  tone={growth === null ? '' : growth >= 0 ? 'positive' : 'negative'}
                  note={growth === null ? 'No previous month to compare' : 'vs last month'} />
      </div>

      <Panel title="Sales by month" exportDisabled={!byMonth.length}
             onExport={() => downloadCsv(csvName('sales-by-month'), byMonth,
               [['month', 'Month'], ['orders', 'Orders'], ['value', 'Sales (INR)']])}>
        {byMonth.length ? (
          <ChartRenderer def={{
            title: 'Sales by month',
            type: 'bar',
            labels: byMonth.map(m => formatMonth(m.month)),
            series: [{ name: 'Sales', values: byMonth.map(m => num(m.value)) }],
            options: { valuePrefix: '₹' }
          }} />
        ) : <Empty>No orders recorded yet.</Empty>}
      </Panel>

      <div className="report-columns">
        <Panel title="Top products" exportDisabled={!topProducts.length}
               onExport={() => downloadCsv(csvName('top-products'), topProducts,
                 [['name', 'Product'], ['quantity', 'Quantity'], ['sales', 'Sales (INR)']])}>
          {topProducts.length ? (
            <div className="table-scroll">
              <table className="report-table">
                <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Sales</th></tr></thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={`${p.name}-${i}`}>
                      <td>{p.name || '—'}</td>
                      <td className="num">{formatNumber(p.quantity)}</td>
                      <td className="num">{formatMoney(p.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No product sales yet.</Empty>}
        </Panel>

        <Panel title="Top clients" exportDisabled={!topClients.length}
               onExport={() => downloadCsv(csvName('top-clients'), topClients,
                 [['name', 'Client'], ['orders', 'Orders'], ['sales', 'Sales (INR)']])}>
          {topClients.length ? (
            <div className="table-scroll">
              <table className="report-table">
                <thead><tr><th>Client</th><th className="num">Orders</th><th className="num">Sales</th></tr></thead>
                <tbody>
                  {topClients.map((c, i) => (
                    <tr key={`${c.name}-${i}`}>
                      <td>{c.name || '—'}</td>
                      <td className="num">{formatNumber(c.orders, { decimals: 0 })}</td>
                      <td className="num">{formatMoney(c.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No client sales yet.</Empty>}
        </Panel>
      </div>
    </>
  );
};

/* --------------------------- Production --------------------------- */
const ProductionReport = ({ data }) => {
  const byStyle = data.byStyle || [];
  return (
    <>
      <div className="stats-grid">
        <StatCard title="Efficiency" value={formatPercent(data.efficiency)}
                  note={num(data.efficiency) === null ? 'No production recorded yet' : 'Completed vs target'} />
        <StatCard title="Active orders" value={formatNumber(data.activeOrders, { decimals: 0 })} />
        <StatCard title="Completed orders" value={formatNumber(data.completedOrders, { decimals: 0 })} />
        <StatCard title="Avg task time" value={formatDuration(data.avgProductionTime)} />
        <StatCard title="Quality score" value={formatPercent(data.qualityScore)}
                  note={num(data.qualityScore) === null ? 'No inspections yet' : 'Approved of inspected'} />
      </div>

      <Panel title="Progress by style" exportDisabled={!byStyle.length}
             onExport={() => downloadCsv(csvName('production-by-style'), byStyle,
               [['style', 'Style'], ['planned', 'Planned'], ['completed', 'Completed'], ['progress', 'Progress %']])}>
        {byStyle.length ? (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr><th>Style</th><th className="num">Planned</th><th className="num">Completed</th><th>Progress</th></tr>
              </thead>
              <tbody>
                {byStyle.map((s, i) => (
                  <tr key={`${s.style}-${i}`}>
                    <td>{s.style || '—'}</td>
                    <td className="num">{formatNumber(s.planned, { decimals: 0 })}</td>
                    <td className="num">{formatNumber(s.completed, { decimals: 0 })}</td>
                    <td><ProgressBar value={s.progress} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No production orders yet.</Empty>}
      </Panel>
    </>
  );
};

/* --------------------------- Inventory ---------------------------- */
const InventoryReport = ({ data }) => {
  const byCategory = data.byCategory || [];
  const items = data.items || [];
  const last30 = data.last30Days || [];
  const totalValue = byCategory.reduce((a, c) => a + (num(c.value) || 0), 0);
  const itemCount = byCategory.length
    ? byCategory.reduce((a, c) => a + (num(c.items) || 0), 0)
    : items.length;
  const reorder = byCategory.reduce((a, c) => a + (num(c.needsReorder) || 0), 0);
  const { slices, folded } = foldSlices(byCategory, 'category', 'value');

  return (
    <>
      <div className="stats-grid">
        <StatCard title="Total stock value" value={formatMoney(totalValue)} />
        <StatCard title="Items" value={formatNumber(itemCount, { decimals: 0 })} />
        <StatCard title="Needs reorder" value={formatNumber(reorder, { decimals: 0 })}
                  tone={reorder > 0 ? 'negative' : ''} note="At or below reorder level" />
      </div>

      <div className="report-columns">
        <Panel title="Value by category" exportDisabled={!byCategory.length}
               onExport={() => downloadCsv(csvName('inventory-by-category'), byCategory,
                 [['category', 'Category'], ['items', 'Items'], ['quantity', 'Quantity'],
                  ['value', 'Value (INR)'], ['needsReorder', 'Needs reorder']])}>
          {byCategory.length ? (
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr><th>Category</th><th className="num">Items</th><th className="num">Quantity</th>
                    <th className="num">Value</th><th className="num">Reorder</th></tr>
                </thead>
                <tbody>
                  {byCategory.map((c, i) => (
                    <tr key={`${c.category}-${i}`}>
                      <td>{c.category || 'Uncategorised'}</td>
                      <td className="num">{formatNumber(c.items, { decimals: 0 })}</td>
                      <td className="num">{formatNumber(c.quantity)}</td>
                      <td className="num">{formatMoney(c.value)}</td>
                      <td className={`num ${num(c.needsReorder) > 0 ? 'negative' : ''}`}>
                        {formatNumber(c.needsReorder, { decimals: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No stock items yet.</Empty>}
        </Panel>

        <Panel title="Share of stock value">
          {totalValue > 0 ? (
            <>
              <ChartRenderer def={{
                title: 'Stock value by category',
                type: 'donut',
                labels: slices.map(s => s.label),
                series: [{ name: 'Value', values: slices.map(s => s.value) }],
                // "Other" is a bucket, not a category: give it the neutral grey.
                sliceColors: folded ? slices.map((_, i) => (i === slices.length - 1 ? OTHER : undefined)) : undefined,
                options: { valuePrefix: '₹' }
              }} />
              {folded && <p className="report-hint">Smaller categories are grouped under “Other”.</p>}
            </>
          ) : <Empty>No stock value recorded yet.</Empty>}
        </Panel>
      </div>

      <Panel title="Stock items" exportDisabled={!items.length}
             onExport={() => downloadCsv(csvName('inventory-items'), items,
               [['itemName', 'Item'], ['category', 'Category'], ['quantity', 'Quantity'], ['unit', 'Unit'],
                ['reorderLevel', 'Reorder level'], ['unitCost', 'Unit cost (INR)'],
                ['totalValue', 'Value (INR)'], ['status', 'Status']])}>
        {items.length ? (
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr><th>Item</th><th>Category</th><th className="num">Quantity</th><th className="num">Reorder level</th>
                  <th className="num">Unit cost</th><th className="num">Value</th><th>Status</th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={`${it.itemName}-${i}`}>
                    <td>{it.itemName || '—'}</td>
                    <td>{it.category || '—'}</td>
                    <td className="num">{formatNumber(it.quantity)} {it.unit || ''}</td>
                    <td className="num">{formatNumber(it.reorderLevel)}</td>
                    <td className="num">{formatMoney(it.unitCost)}</td>
                    <td className="num">{formatMoney(it.totalValue)}</td>
                    <td><span className={`status ${it.status || ''}`}>{STATUS_LABEL[it.status] || it.status || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No stock items yet.</Empty>}
      </Panel>

      <Panel title="Stock movements — last 30 days" exportDisabled={!last30.length}
             onExport={() => downloadCsv(csvName('stock-movements-30-days'), last30,
               [['type', 'Movement type'], ['count', 'Movements'], ['quantity', 'Net quantity']])}>
        {last30.length ? (
          <div className="table-scroll">
            <table className="report-table">
              <thead><tr><th>Movement type</th><th className="num">Movements</th><th className="num">Net quantity</th></tr></thead>
              <tbody>
                {last30.map((m, i) => (
                  <tr key={`${m.type}-${i}`}>
                    <td className="capitalize">{m.type || '—'}</td>
                    <td className="num">{formatNumber(m.count, { decimals: 0 })}</td>
                    <td className={`num ${num(m.quantity) < 0 ? 'negative' : ''}`}>{formatNumber(m.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No stock movements in the last 30 days.</Empty>}
      </Panel>
    </>
  );
};

/* ---------------------------- Finance ----------------------------- */
const FinanceReport = ({ data }) => {
  const monthly = (data.monthly || []).map(m => {
    const income = num(m.income) || 0;
    const expenses = num(m.expenses) || 0;
    return { ...m, income, expenses, net: income - expenses };
  });
  const byCategory = data.byCategory || [];
  const totals = monthly.reduce((a, m) => ({ income: a.income + m.income, expenses: a.expenses + m.expenses }),
    { income: 0, expenses: 0 });
  const net = totals.income - totals.expenses;

  return (
    <>
      <div className="stats-grid">
        <StatCard title="Income" value={formatMoney(totals.income)} />
        <StatCard title="Expenses" value={formatMoney(totals.expenses)} />
        <StatCard title="Net" value={formatMoney(net)} tone={net >= 0 ? 'positive' : 'negative'} />
      </div>

      <Panel title="Income vs expenses by month" exportDisabled={!monthly.length}
             onExport={() => downloadCsv(csvName('finance-by-month'), monthly,
               [['month', 'Month'], ['income', 'Income (INR)'], ['expenses', 'Expenses (INR)'], ['net', 'Net (INR)']])}>
        {monthly.length ? (
          <>
            <ChartRenderer def={{
              title: 'Income vs expenses by month',
              type: 'bar',
              labels: monthly.map(m => formatMonth(m.month)),
              series: [
                { name: 'Income', values: monthly.map(m => m.income), color: '#1A3A5C' },
                { name: 'Expenses', values: monthly.map(m => m.expenses), color: '#E85D26' }
              ],
              options: { valuePrefix: '₹' }
            }} />
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr><th>Month</th><th className="num">Income</th><th className="num">Expenses</th><th className="num">Net</th></tr>
                </thead>
                <tbody>
                  {monthly.map(m => (
                    <tr key={m.month}>
                      <td>{formatMonth(m.month)}</td>
                      <td className="num">{formatMoney(m.income)}</td>
                      <td className="num">{formatMoney(m.expenses)}</td>
                      <td className={`num ${m.net >= 0 ? 'positive' : 'negative'}`}>{formatMoney(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <Empty>No transactions recorded yet.</Empty>}
      </Panel>

      <Panel title="By category" exportDisabled={!byCategory.length}
             onExport={() => downloadCsv(csvName('finance-by-category'), byCategory,
               [['category', 'Category'], ['type', 'Type'], ['total', 'Total (INR)']])}>
        {byCategory.length ? (
          <div className="table-scroll">
            <table className="report-table">
              <thead><tr><th>Category</th><th>Type</th><th className="num">Total</th></tr></thead>
              <tbody>
                {byCategory.map((c, i) => (
                  <tr key={`${c.category}-${c.type}-${i}`}>
                    <td>{c.category || 'Uncategorised'}</td>
                    <td><span className={`type-badge ${c.type}`}>{c.type === 'income' ? 'Income' : 'Expense'}</span></td>
                    <td className="num">{formatMoney(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No categorised transactions yet.</Empty>}
      </Panel>
    </>
  );
};

const RENDERERS = { sales: SalesReport, production: ProductionReport, inventory: InventoryReport, finance: FinanceReport };

const Reports = () => {
  const [activeTab, setActiveTab] = useState('sales');
  // One slot per tab so switching back shows what was loaded instead of refetching.
  const [reports, setReports] = useState({});
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async (id) => {
    const tab = TABS.find(t => t.id === id);
    setReports(r => ({ ...r, [id]: { ...r[id], loading: true, error: null } }));
    try {
      const res = await tab.load();
      if (!mounted.current) return;
      setReports(r => ({ ...r, [id]: { loading: false, error: null, data: res.data?.data || {} } }));
    } catch (err) {
      if (!mounted.current) return;
      setReports(r => ({ ...r, [id]: { ...r[id], loading: false, error: errorMessage(err, `Could not load the ${tab.name.toLowerCase()} report`) } }));
    }
  }, []);

  // Load each report the first time its tab is opened.
  useEffect(() => {
    if (!reports[activeTab]) load(activeTab);
  }, [activeTab, reports, load]);

  const current = reports[activeTab] || { loading: true };
  const tab = TABS.find(t => t.id === activeTab);
  const Renderer = RENDERERS[activeTab];

  return (
    <div className="reports">
      <div className="reports-title">
        <h1>Reports</h1>
        <button type="button" className="refresh-btn" onClick={() => load(activeTab)} disabled={current.loading}>
          {current.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="reports-nav" role="tablist" aria-label="Reports">
        {TABS.map(t => (
          <button
            type="button"
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`report-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.name}
          </button>
        ))}
      </div>

      <div className="report-section" role="tabpanel" aria-label={`${tab.name} report`}>
        {current.error ? (
          <div className="report-error" role="alert">
            <p>{current.error}</p>
            <button type="button" className="export-btn" onClick={() => load(activeTab)}>Try again</button>
          </div>
        ) : current.loading && !current.data ? (
          <p className="report-loading">Loading {tab.name.toLowerCase()} report…</p>
        ) : current.data ? (
          <Renderer data={current.data} />
        ) : null}
      </div>
    </div>
  );
};

export default Reports;
