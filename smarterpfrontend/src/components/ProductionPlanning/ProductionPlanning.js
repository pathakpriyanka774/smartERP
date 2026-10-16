import React, { useState, useEffect } from 'react';
import './ProductionPlanning.css';
import { authHeaders } from '../../services/api';

// Routed through the API gateway, which proxies /api/production to the
// production-planning service. Override with REACT_APP_API_BASE if the
// gateway is not on localhost.
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const ProductionPlanning = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState({});
  const [employeePerformance, setEmployeePerformance] = useState([]);
  const [machineAvailability, setMachineAvailability] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchDashboardData();
    fetchEmployeePerformance();
    fetchMachineAvailability();
  }, [selectedDate]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`${API_BASE}/production/planning/summary`, { headers: authHeaders() });
      const data = await response.json();
      if (data.success) {
        setDashboardData(data.data);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchEmployeePerformance = async () => {
    try {
      const response = await fetch(`${API_BASE}/production/planning/employee-performance?date=${selectedDate}`, { headers: authHeaders() });
      const data = await response.json();
      if (data.success) {
        setEmployeePerformance(data.data);
      }
    } catch (error) {
      console.error('Error fetching employee performance:', error);
    }
  };

  const fetchMachineAvailability = async () => {
    try {
      const response = await fetch(`${API_BASE}/production/planning/machine-availability?date=${selectedDate}`, { headers: authHeaders() });
      const data = await response.json();
      if (data.success) {
        setMachineAvailability(data.data);
      }
    } catch (error) {
      console.error('Error fetching machine availability:', error);
    }
  };

  const renderDashboard = () => (
    <div className="dashboard-grid">
      <div className="dashboard-card">
        <h3>Machine Status</h3>
        <div className="machine-status">
          {dashboardData.machineStatus?.map(status => (
            <div key={status.status} className={`status-item ${status.status}`}>
              <span className="status-label">{status.status}</span>
              <span className="status-count">{status.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-card">
        <h3>Today's Production</h3>
        <div className="production-stats">
          <div className="stat-item">
            <span>Target Pieces</span>
            <span>{dashboardData.dailyProduction?.total_target || 0}</span>
          </div>
          <div className="stat-item">
            <span>Completed</span>
            <span>{dashboardData.dailyProduction?.total_completed || 0}</span>
          </div>
          <div className="stat-item">
            <span>Active Employees</span>
            <span>{dashboardData.dailyProduction?.active_employees || 0}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card">
        <h3>Quality Status</h3>
        <div className="quality-stats">
          <div className="stat-item">
            <span>Sent for Inspection</span>
            <span>{dashboardData.qualitySummary?.total_sent || 0}</span>
          </div>
          <div className="stat-item">
            <span>Approved</span>
            <span>{dashboardData.qualitySummary?.total_approved || 0}</span>
          </div>
          <div className="stat-item">
            <span>Rejected</span>
            <span>{dashboardData.qualitySummary?.total_rejected || 0}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card active-orders">
        <h3>Active Production Orders</h3>
        <div className="orders-list">
          {dashboardData.activeOrders?.map(order => (
            <div key={order.order_number} className="order-item">
              <div className="order-info">
                <span className="order-number">{order.order_number}</span>
                <span className="style-name">{order.style_name}</span>
              </div>
              <div className="order-progress">
                <span>{order.completed_pieces || 0}/{order.total_quantity}</span>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{width: `${((order.completed_pieces || 0) / order.total_quantity) * 100}%`}}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderEmployeePerformance = () => (
    <div className="employee-performance">
      <div className="date-selector">
        <label>Select Date:</label>
        <input 
          type="date" 
          value={selectedDate} 
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>
      
      <div className="performance-table">
        <table>
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Name</th>
              <th>Department</th>
              <th>Machine</th>
              <th>Style</th>
              <th>Target</th>
              <th>Completed</th>
              <th>Efficiency %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {employeePerformance.map((emp, index) => (
              <tr key={index}>
                <td>{emp.employee_code}</td>
                <td>{emp.name}</td>
                <td>{emp.department}</td>
                <td>{emp.machine_name || 'Not Assigned'}</td>
                <td>{emp.style_name || 'Not Assigned'}</td>
                <td>{emp.target_pieces || 0}</td>
                <td>{emp.completed_pieces || 0}</td>
                <td className={emp.efficiency_percentage >= 80 ? 'high-efficiency' : emp.efficiency_percentage >= 60 ? 'medium-efficiency' : 'low-efficiency'}>
                  {emp.efficiency_percentage?.toFixed(1) || 0}%
                </td>
                <td className={`status ${emp.attendance_status}`}>
                  {emp.attendance_status || 'Unknown'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderMachineAvailability = () => (
    <div className="machine-availability">
      <div className="machines-grid">
        {machineAvailability.map(machine => (
          <div key={machine.id} className={`machine-card ${machine.status}`}>
            <div className="machine-header">
              <h4>{machine.machine_name}</h4>
              <span className="machine-code">{machine.machine_code}</span>
            </div>
            <div className="machine-details">
              <p><strong>Type:</strong> {machine.machine_type}</p>
              <p><strong>Status:</strong> <span className={`status ${machine.status}`}>{machine.status}</span></p>
              <p><strong>Capacity:</strong> {machine.capacity_per_hour}/hour</p>
              {machine.assigned_employee && (
                <>
                  <p><strong>Assigned to:</strong> {machine.assigned_employee}</p>
                  <p><strong>Current Style:</strong> {machine.current_style}</p>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="production-planning">
      <div className="planning-header">
        <h1>Production Planning & Management</h1>
        <div className="tab-navigation">
          <button 
            className={activeTab === 'dashboard' ? 'active' : ''} 
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={activeTab === 'performance' ? 'active' : ''} 
            onClick={() => setActiveTab('performance')}
          >
            Employee Performance
          </button>
          <button 
            className={activeTab === 'machines' ? 'active' : ''} 
            onClick={() => setActiveTab('machines')}
          >
            Machine Availability
          </button>
        </div>
      </div>

      <div className="planning-content">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'performance' && renderEmployeePerformance()}
        {activeTab === 'machines' && renderMachineAvailability()}
      </div>
    </div>
  );
};

export default ProductionPlanning;