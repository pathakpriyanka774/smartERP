import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsAPI } from '../../services/api';
import ChartRenderer from '../../chartbuilder/ChartRenderer';
import {
  formatMoney, formatMoneyCompact, formatNumber, formatPercent, formatDate, formatDateTime, formatMonth, errorMessage
} from '../../utils/format';
import './Dashboard.css';

/**
 * Management dashboard.
 *
 * Every figure comes from GET /api/reports/dashboard, which computes it from
 * the database (the screen used to show fixed sample numbers). Calendar
 * boundaries ("this month", "today") are the Indian business day, worked out
 * by the server.
 */

const STATUS_LABELS = {
  pending: 'Pending', confirmed: 'Confirmed', 'in-production': 'In production', ready: 'Ready',
  dispatched: 'Dispatched', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled'
};

const ACTIVITY_ICONS = { order: '📦', production: '🏭', inventory: '📋' };

const Kpi = ({ icon, label, value, detail, tone, onClick }) => (
  <button type="button" className={`kpi-card kpi-button ${tone ? `kpi-${tone}` : ''}`} onClick={onClick}>
    <div className="kpi-icon" aria-hidden="true">{icon}</div>
    <div className="kpi-content">
      <h3>{label}</h3>
      <div className="kpi-value">{value}</div>
      {detail && <div className="kpi-trend">{detail}</div>}
    </div>
  </button>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsAPI.getDashboard();
      setData(res.data.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the dashboard'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Figures move during the day; refresh every five minutes.
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [load]);

  if (loading && !data) {
    return <div className="dashboard"><div className="dash-state">Loading dashboard…</div></div>;
  }
  if (error && !data) {
    return (
      <div className="dashboard">
        <div className="dash-state dash-error" role="alert">
          <p>{error}</p>
          <button type="button" className="dash-btn" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const change = k.incomeChangePct;
  const monthly = data.charts.monthly || [];
  const hasMoney = monthly.some(m => m.income || m.expenses);
  const statusRows = (data.charts.orderStatus || []).filter(s => s.count > 0);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Business Dashboard</h1>
        <div className="date-info">
          Figures as of {formatDate(data.asOf)}
          <button type="button" className="dash-btn dash-refresh" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
      {error && <div className="dash-notice" role="alert">{error} — showing the last figures loaded.</div>}

      <div className="kpi-grid">
        <Kpi icon="💰" label="Income this month" value={formatMoneyCompact(k.incomeThisMonth)}
             detail={change === null ? `Last month ${formatMoneyCompact(k.incomeLastMonth)}`
               : `${change >= 0 ? '▲' : '▼'} ${formatPercent(Math.abs(change))} vs last month`}
             tone={change !== null && change < 0 ? 'down' : 'up'} onClick={() => navigate('/expenses')} />
        <Kpi icon="📦" label="Open orders" value={formatNumber(k.openOrders, { decimals: 0 })}
             detail={`${formatMoneyCompact(k.openOrdersValue)} still to deliver`} onClick={() => navigate('/orders')} />
        <Kpi icon="🏭" label="Active production orders" value={formatNumber(k.activeProduction, { decimals: 0 })}
             detail={k.overdueProduction ? `${k.overdueProduction} past deadline` : `${formatNumber(k.piecesToday, { decimals: 0 })} pieces made today`}
             tone={k.overdueProduction ? 'down' : undefined} onClick={() => navigate('/production')} />
        <Kpi icon="📋" label="Stock value" value={formatMoneyCompact(k.stockValue)}
             detail={`${k.lowStock} low · ${k.outOfStock} out of stock`}
             tone={k.outOfStock ? 'down' : undefined} onClick={() => navigate('/inventory')} />
      </div>

      <div className="kpi-grid kpi-grid-small">
        <Kpi icon="🧾" label="Sales booked this month" value={formatMoneyCompact(k.salesThisMonth)}
             detail={`${k.ordersThisMonth} orders, excluding cancelled`} onClick={() => navigate('/orders')} />
        <Kpi icon="💸" label="Expenses this month" value={formatMoneyCompact(k.expensesThisMonth)}
             detail={`Net ${formatMoneyCompact(k.incomeThisMonth - k.expensesThisMonth)}`} onClick={() => navigate('/expenses')} />
        <Kpi icon="🔍" label="Waiting for inspection" value={formatNumber(k.pendingInspections, { decimals: 0 })}
             detail="Production batches in the quality queue" onClick={() => navigate('/quality-dashboard')} />
        <Kpi icon="🕒" label="Present today" value={`${k.presentToday} / ${k.activeEmployees}`}
             detail={k.pendingPayrolls ? `${k.pendingPayrolls} payrolls awaiting payment` : 'No payrolls pending'}
             onClick={() => navigate('/attendance')} />
      </div>

      <div className="dashboard-content">
        <div className="chart-section">
          <h2>Income and expenses — last 6 months</h2>
          {hasMoney ? (
            <ChartRenderer def={{
              title: 'Income and expenses',
              type: 'bar',
              labels: monthly.map(m => formatMonth(m.month)),
              series: [
                { name: 'Income', values: monthly.map(m => m.income) },
                { name: 'Expenses', values: monthly.map(m => m.expenses) }
              ],
              options: { valuePrefix: '₹' }
            }} />
          ) : (
            <p className="dash-empty">No income or expenses recorded in the last six months.</p>
          )}
        </div>

        <div className="chart-section">
          <h2>Orders by status</h2>
          {statusRows.length ? (
            <ChartRenderer def={{
              title: 'Orders by status',
              type: 'hbar',
              labels: statusRows.map(s => STATUS_LABELS[s.status] || s.status),
              series: [{ name: 'Orders', values: statusRows.map(s => s.count) }],
              options: { showValues: true }
            }} />
          ) : (
            <p className="dash-empty">No orders yet.</p>
          )}
        </div>

        <div className="chart-section">
          <h2>Stock needing attention</h2>
          {data.lowStockItems.length ? (
            <table className="dash-table">
              <thead>
                <tr><th>Item</th><th>On hand</th><th>Reorder at</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.lowStockItems.map(i => (
                  <tr key={i.id}>
                    <td>{i.itemName}</td>
                    <td>{formatNumber(i.quantity, { decimals: 0 })} {i.unit || ''}</td>
                    <td>{formatNumber(i.reorderLevel, { decimals: 0 })}</td>
                    <td><span className={`dash-badge ${i.status}`}>{i.status === 'out-of-stock' ? 'Out of stock' : 'Low stock'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="dash-empty">All stock is above its reorder level.</p>
          )}
        </div>

        <div className="chart-section">
          <h2>Recent activity</h2>
          {data.recentActivity.length ? (
            <ul className="activity-list">
              {data.recentActivity.map((a, i) => (
                <li className="activity-item" key={i}>
                  <span className="activity-icon" aria-hidden="true">{ACTIVITY_ICONS[a.type] || '•'}</span>
                  <div className="activity-content">
                    <p>{a.message}</p>
                    <span className="activity-time">{formatDateTime(a.occurredAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">Nothing recorded yet.</p>
          )}
        </div>
      </div>

      <p className="dash-footnote">
        Income is money recorded in Expenses &amp; Finance; sales are order values booked (cancelled orders excluded).
        Stock value is quantity × weighted-average unit cost. Total income this month: {formatMoney(k.incomeThisMonth)}.
      </p>
    </div>
  );
};

export default Dashboard;
