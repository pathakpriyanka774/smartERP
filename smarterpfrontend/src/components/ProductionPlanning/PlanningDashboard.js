import React, { useState, useEffect } from 'react';
import './ProductionPlanning.css';

const PlanningDashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    productionOverview: [],
    machineStatus: [],
    todayProduction: [],
    qualitySummary: [],
    metrics: {}
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [allocationForm, setAllocationForm] = useState({});
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    loadDashboardData();
    loadEmployees();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      const response = await fetch('http://localhost:5009/planning/dashboard');
      const result = await response.json();
      if (result.success) {
        setDashboardData(result.data);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      const response = await fetch('http://localhost:5009/employees/production');
      const result = await response.json();
      if (result.success) {
        setEmployees(result.data);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
    }
  };

  const handleMachineAllocation = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5009/machines/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allocationForm)
      });
      const result = await response.json();
      if (result.success) {
        setShowAllocationModal(false);
        setAllocationForm({});
        loadDashboardData();
        alert('Machine allocated successfully!');
      } else {
        alert(result.data?.Message || 'Failed to allocate machine');
      }
    } catch (error) {
      console.error('Error allocating machine:', error);
      alert('Error allocating machine');
    }
  };

  const { metrics } = dashboardData;

  return (
    <div className="planning-dashboard">
      <div className="dashboard-header">
        <h1>🏭 Production Planning Dashboard</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowAllocationModal(true)}>
            🔧 Allocate Machine
          </button>
          <button className="btn-refresh" onClick={loadDashboardData}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-grid">
        <div className="metric-card available">
          <div className="metric-icon">🟢</div>
          <div className="metric-content">
            <h3>Available Machines</h3>
            <div className="metric-value">{metrics.AvailableMachines || 0}</div>
          </div>
        </div>
        <div className="metric-card occupied">
          <div className="metric-icon">🔴</div>
          <div className="metric-content">
            <h3>Occupied Machines</h3>
            <div className="metric-value">{metrics.OccupiedMachines || 0}</div>
          </div>
        </div>
        <div className="metric-card production">
          <div className="metric-icon">📦</div>
          <div className="metric-content">
            <h3>Today's Production</h3>
            <div className="metric-value">{metrics.TodayProduction || 0}</div>
          </div>
        </div>
        <div className="metric-card quality">
          <div className="metric-icon">🔍</div>
          <div className="metric-content">
            <h3>Ready for Inspection</h3>
            <div className="metric-value">{metrics.ReadyForInspection || 0}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="dashboard-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Production Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'machines' ? 'active' : ''}`}
          onClick={() => setActiveTab('machines')}
        >
          🔧 Machine Status
        </button>
        <button 
          className={`tab-btn ${activeTab === 'production' ? 'active' : ''}`}
          onClick={() => setActiveTab('production')}
        >
          👷 Today's Production
        </button>
        <button 
          className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          🔍 Quality Status
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            <h2>📈 Production Orders Overview</h2>
            <div className="table-container">
              <table className="planning-table">
                <thead>
                  <tr>
                    <th>Order Code</th>
                    <th>Client</th>
                    <th>Style</th>
                    <th>Total Qty</th>
                    <th>Completed</th>
                    <th>Progress</th>
                    <th>Deadline</th>
                    <th>Days Left</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.productionOverview.map(order => (
                    <tr key={order.OrderCode}>
                      <td><strong>{order.OrderCode}</strong></td>
                      <td>{order.ClientName}</td>
                      <td>{order.StyleName}</td>
                      <td>{order.TotalQuantity}</td>
                      <td>{order.CompletedQuantity}</td>
                      <td>
                        <div className="progress-bar">
                          <div 
                            className="progress-fill" 
                            style={{width: `${order.CompletionPercentage}%`}}
                          ></div>
                          <span>{order.CompletionPercentage}%</span>
                        </div>
                      </td>
                      <td>{new Date(order.DeadlineDate).toLocaleDateString()}</td>
                      <td className={order.DaysRemaining < 3 ? 'urgent' : order.DaysRemaining < 7 ? 'warning' : ''}>
                        {order.DaysRemaining} days
                      </td>
                      <td><span className={`priority ${order.Priority.toLowerCase()}`}>{order.Priority}</span></td>
                      <td><span className={`status ${order.OrderStatus.toLowerCase()}`}>{order.OrderStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'machines' && (
          <div className="machines-section">
            <h2>🔧 Machine Status & Allocation</h2>
            <div className="table-container">
              <table className="planning-table">
                <thead>
                  <tr>
                    <th>Machine Code</th>
                    <th>Machine Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Assigned Employee</th>
                    <th>Current Order</th>
                    <th>Shift</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.machineStatus.map(machine => (
                    <tr key={machine.MachineCode}>
                      <td><strong>{machine.MachineCode}</strong></td>
                      <td>{machine.MachineName}</td>
                      <td>{machine.MachineType}</td>
                      <td>
                        <span className={`status ${machine.Status.toLowerCase()}`}>
                          {machine.Status === 'Available' ? '🟢' : machine.Status === 'Occupied' ? '🔴' : '🟡'} 
                          {machine.Status}
                        </span>
                      </td>
                      <td>{machine.Location}</td>
                      <td>{machine.AssignedEmployee || '-'}</td>
                      <td>{machine.CurrentOrder || '-'}</td>
                      <td>{machine.ShiftTime || '-'}</td>
                      <td>
                        {machine.Status === 'Available' && (
                          <button 
                            className="btn-allocate"
                            onClick={() => {
                              setAllocationForm({machineId: machine.MachineID});
                              setShowAllocationModal(true);
                            }}
                          >
                            Allocate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'production' && (
          <div className="production-section">
            <h2>👷 Today's Production Summary</h2>
            <div className="table-container">
              <table className="planning-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Machine</th>
                    <th>Order</th>
                    <th>Style</th>
                    <th>Pieces Completed</th>
                    <th>Quality Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.todayProduction.map((prod, index) => (
                    <tr key={index}>
                      <td>{prod.EmployeeName}</td>
                      <td>{prod.MachineName}</td>
                      <td>{prod.OrderCode}</td>
                      <td>{prod.StyleName}</td>
                      <td><strong>{prod.TotalPieces}</strong></td>
                      <td>
                        <span className={`status ${prod.QualityStatus.toLowerCase()}`}>
                          {prod.QualityStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="quality-section">
            <h2>🔍 Quality Inspection Summary</h2>
            <div className="table-container">
              <table className="planning-table">
                <thead>
                  <tr>
                    <th>Inspector</th>
                    <th>Order</th>
                    <th>Style</th>
                    <th>Inspected</th>
                    <th>Approved</th>
                    <th>Rejected</th>
                    <th>Approval Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.qualitySummary.map((quality, index) => (
                    <tr key={index}>
                      <td>{quality.InspectorName}</td>
                      <td>{quality.OrderCode}</td>
                      <td>{quality.StyleName}</td>
                      <td>{quality.TotalInspected}</td>
                      <td className="approved">{quality.TotalApproved}</td>
                      <td className="rejected">{quality.TotalRejected}</td>
                      <td>
                        <span className={`approval-rate ${quality.ApprovalRate >= 95 ? 'excellent' : quality.ApprovalRate >= 90 ? 'good' : 'needs-improvement'}`}>
                          {quality.ApprovalRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Machine Allocation Modal */}
      {showAllocationModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>🔧 Allocate Machine to Employee</h3>
            <form onSubmit={handleMachineAllocation}>
              <select
                value={allocationForm.employeeId || ''}
                onChange={(e) => setAllocationForm({...allocationForm, employeeId: parseInt(e.target.value)})}
                required
              >
                <option value="">Select Employee</option>
                {employees.filter(emp => emp.Status === 'Available').map(emp => (
                  <option key={emp.EmployeeID} value={emp.EmployeeID}>
                    {emp.Name} - {emp.Position}
                  </option>
                ))}
              </select>
              
              <select
                value={allocationForm.orderId || ''}
                onChange={(e) => setAllocationForm({...allocationForm, orderId: parseInt(e.target.value)})}
                required
              >
                <option value="">Select Production Order</option>
                {dashboardData.productionOverview.map(order => (
                  <option key={order.OrderCode} value={order.OrderID}>
                    {order.OrderCode} - {order.StyleName}
                  </option>
                ))}
              </select>
              
              <select
                value={allocationForm.shiftTime || ''}
                onChange={(e) => setAllocationForm({...allocationForm, shiftTime: e.target.value})}
                required
              >
                <option value="">Select Shift</option>
                <option value="Morning">Morning (8AM - 4PM)</option>
                <option value="Evening">Evening (4PM - 12AM)</option>
                <option value="Night">Night (12AM - 8AM)</option>
              </select>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">Allocate Machine</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAllocationModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanningDashboard;