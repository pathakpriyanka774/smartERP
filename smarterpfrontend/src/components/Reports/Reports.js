import React, { useState } from 'react';
import './Reports.css';

const Reports = () => {
  const [activeReport, setActiveReport] = useState('sales');

  const salesData = [
    { month: 'Jan 2024', orders: 45, revenue: 125000, profit: 25000 },
    { month: 'Feb 2024', orders: 52, revenue: 142000, profit: 28400 },
    { month: 'Mar 2024', orders: 48, revenue: 135000, profit: 27000 },
    { month: 'Apr 2024', orders: 61, revenue: 168000, profit: 33600 },
    { month: 'May 2024', orders: 58, revenue: 159000, profit: 31800 }
  ];

  const inventoryData = [
    { item: 'Cotton Fabric', stock: 1250, reorderLevel: 500, status: 'Good' },
    { item: 'Polyester Thread', stock: 180, reorderLevel: 200, status: 'Low' },
    { item: 'Buttons (White)', stock: 5000, reorderLevel: 1000, status: 'Good' },
    { item: 'Zippers', stock: 85, reorderLevel: 100, status: 'Critical' },
    { item: 'Elastic Bands', stock: 750, reorderLevel: 300, status: 'Good' }
  ];

  const productionData = [
    { week: 'Week 1', planned: 500, actual: 485, efficiency: 97 },
    { week: 'Week 2', planned: 520, actual: 510, efficiency: 98 },
    { week: 'Week 3', planned: 480, actual: 465, efficiency: 97 },
    { week: 'Week 4', planned: 550, actual: 520, efficiency: 95 }
  ];

  const financialData = [
    { category: 'Raw Materials', budgeted: 50000, actual: 48500, variance: -1500 },
    { category: 'Labor Costs', budgeted: 80000, actual: 82000, variance: 2000 },
    { category: 'Utilities', budgeted: 12000, actual: 11200, variance: -800 },
    { category: 'Equipment', budgeted: 15000, actual: 14500, variance: -500 }
  ];

  const reports = [
    { id: 'sales', name: 'Sales Report', icon: '📈' },
    { id: 'inventory', name: 'Inventory Report', icon: '📦' },
    { id: 'production', name: 'Production Report', icon: '🏭' },
    { id: 'financial', name: 'Financial Report', icon: '💰' }
  ];

  return (
    <div className="reports">
      <h1>Reports</h1>
      
      <div className="reports-nav">
        {reports.map(report => (
          <button
            key={report.id}
            className={`report-btn ${activeReport === report.id ? 'active' : ''}`}
            onClick={() => setActiveReport(report.id)}
          >
            {report.icon} {report.name}
          </button>
        ))}
      </div>

      {activeReport === 'sales' && (
        <div className="report-section">
          <div className="report-header">
            <h2>Sales Performance Report</h2>
            <button className="export-btn">Export PDF</button>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Orders</h3>
              <div className="stat-value">{salesData.reduce((sum, d) => sum + d.orders, 0)}</div>
            </div>
            <div className="stat-card">
              <h3>Total Revenue</h3>
              <div className="stat-value">${salesData.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <h3>Total Profit</h3>
              <div className="stat-value">${salesData.reduce((sum, d) => sum + d.profit, 0).toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <h3>Avg Order Value</h3>
              <div className="stat-value">${Math.round(salesData.reduce((sum, d) => sum + d.revenue, 0) / salesData.reduce((sum, d) => sum + d.orders, 0)).toLocaleString()}</div>
            </div>
          </div>
          <table className="report-table">
            <thead>
              <tr><th>Month</th><th>Orders</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr>
            </thead>
            <tbody>
              {salesData.map((row, i) => (
                <tr key={i}>
                  <td>{row.month}</td>
                  <td>{row.orders}</td>
                  <td>${row.revenue.toLocaleString()}</td>
                  <td>${row.profit.toLocaleString()}</td>
                  <td>{((row.profit / row.revenue) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeReport === 'inventory' && (
        <div className="report-section">
          <div className="report-header">
            <h2>Inventory Status Report</h2>
            <button className="export-btn">Export PDF</button>
          </div>
          <table className="report-table">
            <thead>
              <tr><th>Item</th><th>Current Stock</th><th>Reorder Level</th><th>Status</th></tr>
            </thead>
            <tbody>
              {inventoryData.map((row, i) => (
                <tr key={i}>
                  <td>{row.item}</td>
                  <td>{row.stock}</td>
                  <td>{row.reorderLevel}</td>
                  <td><span className={`status ${row.status.toLowerCase()}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeReport === 'production' && (
        <div className="report-section">
          <div className="report-header">
            <h2>Production Efficiency Report</h2>
            <button className="export-btn">Export PDF</button>
          </div>
          <table className="report-table">
            <thead>
              <tr><th>Period</th><th>Planned</th><th>Actual</th><th>Efficiency</th></tr>
            </thead>
            <tbody>
              {productionData.map((row, i) => (
                <tr key={i}>
                  <td>{row.week}</td>
                  <td>{row.planned}</td>
                  <td>{row.actual}</td>
                  <td>{row.efficiency}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeReport === 'financial' && (
        <div className="report-section">
          <div className="report-header">
            <h2>Budget vs Actual Report</h2>
            <button className="export-btn">Export PDF</button>
          </div>
          <table className="report-table">
            <thead>
              <tr><th>Category</th><th>Budgeted</th><th>Actual</th><th>Variance</th></tr>
            </thead>
            <tbody>
              {financialData.map((row, i) => (
                <tr key={i}>
                  <td>{row.category}</td>
                  <td>${row.budgeted.toLocaleString()}</td>
                  <td>${row.actual.toLocaleString()}</td>
                  <td className={row.variance < 0 ? 'positive' : 'negative'}>
                    ${Math.abs(row.variance).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Reports;