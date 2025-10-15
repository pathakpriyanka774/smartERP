import React from 'react';
import './Dashboard.css';

const Dashboard = () => {
  const notifications = [
    { id: 1, type: 'urgent', title: 'Low Stock Alert', message: 'Cotton fabric running low - 150 units remaining', time: '2 hours ago' },
    { id: 2, type: 'info', title: 'New Order Received', message: 'ABC Manufacturing - 5000 units order confirmed', time: '4 hours ago' },
    { id: 3, type: 'warning', title: 'Delivery Deadline', message: '3 orders due for delivery tomorrow', time: '6 hours ago' },
    { id: 4, type: 'success', title: 'Production Complete', message: 'Order #1003 completed ahead of schedule', time: '1 day ago' }
  ];

  const upcomingTasks = [
    { id: 1, task: 'Review Q2 Production Reports', priority: 'High', due: 'Today' },
    { id: 2, task: 'Client Meeting - Fashion Forward', priority: 'Medium', due: 'Tomorrow' },
    { id: 3, task: 'Inventory Audit - Warehouse A', priority: 'High', due: 'This Week' },
    { id: 4, task: 'Budget Planning for Q3', priority: 'Low', due: 'Next Week' }
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Executive Dashboard</h1>
        <div className="date-info">
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>
      
      <div className="kpi-grid">
        <div className="kpi-card revenue">
          <div className="kpi-icon">💰</div>
          <div className="kpi-content">
            <h3>Monthly Revenue</h3>
            <div className="kpi-value">$245,800</div>
            <div className="kpi-trend positive">↗ +12.5% from last month</div>
          </div>
        </div>
        <div className="kpi-card orders">
          <div className="kpi-icon">📦</div>
          <div className="kpi-content">
            <h3>Active Orders</h3>
            <div className="kpi-value">47</div>
            <div className="kpi-trend positive">↗ +8 new orders this week</div>
          </div>
        </div>
        <div className="kpi-card production">
          <div className="kpi-icon">🏭</div>
          <div className="kpi-content">
            <h3>Production Efficiency</h3>
            <div className="kpi-value">94.2%</div>
            <div className="kpi-trend positive">↗ +2.1% improvement</div>
          </div>
        </div>
        <div className="kpi-card inventory">
          <div className="kpi-icon">📋</div>
          <div className="kpi-content">
            <h3>Inventory Turnover</h3>
            <div className="kpi-value">6.8x</div>
            <div className="kpi-trend negative">↘ -0.3x from target</div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="left-column">
          <div className="chart-section">
            <h2>📈 Revenue Trends</h2>
            <div className="chart-container">
              <div className="chart-placeholder">
                <div className="bar-chart">
                  <div className="bar" style={{height: '60%'}}><span>Jan</span></div>
                  <div className="bar" style={{height: '75%'}}><span>Feb</span></div>
                  <div className="bar" style={{height: '45%'}}><span>Mar</span></div>
                  <div className="bar" style={{height: '85%'}}><span>Apr</span></div>
                  <div className="bar" style={{height: '95%'}}><span>May</span></div>
                  <div className="bar" style={{height: '70%'}}><span>Jun</span></div>
                </div>
                <div className="chart-legend">
                  <span className="legend-item">📊 Monthly Revenue Growth</span>
                </div>
              </div>
            </div>
          </div>

          <div className="production-overview">
            <h2>🏭 Production Overview</h2>
            <div className="production-stats">
              <div className="production-item">
                <div className="production-circle" style={{background: 'conic-gradient(#4caf50 0deg 270deg, #e0e0e0 270deg 360deg)'}}>
                  <span>75%</span>
                </div>
                <div className="production-info">
                  <h4>Cotton T-Shirts</h4>
                  <p>3,750 / 5,000 units</p>
                </div>
              </div>
              <div className="production-item">
                <div className="production-circle" style={{background: 'conic-gradient(#2196f3 0deg 216deg, #e0e0e0 216deg 360deg)'}}>
                  <span>60%</span>
                </div>
                <div className="production-info">
                  <h4>Denim Jeans</h4>
                  <p>1,500 / 2,500 units</p>
                </div>
              </div>
              <div className="production-item">
                <div className="production-circle" style={{background: 'conic-gradient(#ff9800 0deg 324deg, #e0e0e0 324deg 360deg)'}}>
                  <span>90%</span>
                </div>
                <div className="production-info">
                  <h4>Silk Dresses</h4>
                  <p>135 / 150 units</p>
                </div>
              </div>
            </div>
          </div>

          <div className="financial-summary">
            <h2>💰 Financial Summary</h2>
            <div className="financial-grid">
              <div className="financial-item">
                <div className="financial-icon">📈</div>
                <div className="financial-info">
                  <h4>Profit Margin</h4>
                  <div className="financial-value">18.5%</div>
                  <div className="financial-change positive">+2.3%</div>
                </div>
              </div>
              <div className="financial-item">
                <div className="financial-icon">💳</div>
                <div className="financial-info">
                  <h4>Outstanding Payments</h4>
                  <div className="financial-value">$45,200</div>
                  <div className="financial-change negative">3 overdue</div>
                </div>
              </div>
              <div className="financial-item">
                <div className="financial-icon">🏦</div>
                <div className="financial-info">
                  <h4>Cash Flow</h4>
                  <div className="financial-value">$128,900</div>
                  <div className="financial-change positive">Healthy</div>
                </div>
              </div>
              <div className="financial-item">
                <div className="financial-icon">📊</div>
                <div className="financial-info">
                  <h4>Monthly Expenses</h4>
                  <div className="financial-value">$89,400</div>
                  <div className="financial-change neutral">On budget</div>
                </div>
              </div>
            </div>
          </div>

          <div className="recent-activity">
            <h2>🕰️ Recent Activity</h2>
            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-icon completed">✓</div>
                <div className="activity-content">
                  <h4>Order #1003 Completed</h4>
                  <p>Elite Designer Studio - 150 silk dresses delivered</p>
                  <span className="activity-time">2 hours ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon new">📦</div>
                <div className="activity-content">
                  <h4>New Order Received</h4>
                  <p>Fashion Forward Wholesale - 2,500 denim jeans</p>
                  <span className="activity-time">4 hours ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon warning">⚠️</div>
                <div className="activity-content">
                  <h4>Stock Alert</h4>
                  <p>Cotton fabric inventory below minimum threshold</p>
                  <span className="activity-time">6 hours ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon info">📊</div>
                <div className="activity-content">
                  <h4>Production Milestone</h4>
                  <p>Monthly production target achieved 3 days early</p>
                  <span className="activity-time">1 day ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="notifications-section">
            <h2>🔔 Recent Notifications</h2>
            <div className="notifications-list">
              {notifications.map(notification => (
                <div key={notification.id} className={`notification-item ${notification.type}`}>
                  <div className="notification-content">
                    <h4>{notification.title}</h4>
                    <p>{notification.message}</p>
                    <span className="notification-time">{notification.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="planning-section">
            <h2>📅 Upcoming Tasks & Planning</h2>
            <div className="tasks-list">
              {upcomingTasks.map(task => (
                <div key={task.id} className="task-item">
                  <div className="task-content">
                    <h4>{task.task}</h4>
                    <div className="task-meta">
                      <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
                      <span className="due-date">{task.due}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="quick-insights">
        <h2>💡 Business Insights</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <h3>🎯 Performance Highlight</h3>
            <p>Production efficiency increased by 2.1% this month, exceeding the quarterly target. The new automated cutting system is showing excellent results.</p>
          </div>
          <div className="insight-card">
            <h3>⚠️ Action Required</h3>
            <p>Cotton fabric inventory is below minimum threshold. Consider placing urgent order with Textile Mills Co. to avoid production delays.</p>
          </div>
          <div className="insight-card">
            <h3>📊 Market Opportunity</h3>
            <p>Demand for sustainable fabrics increased 35% this quarter. Consider expanding eco-friendly product line for Q3.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;