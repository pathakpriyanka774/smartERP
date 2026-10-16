import React, { useState, useEffect } from 'react';
import './QualityManagement.css';
import { authHeaders } from '../../services/api';

// Routed through the API gateway, which proxies /api/production to the
// production-planning service. Override with REACT_APP_API_BASE if the
// gateway is not on localhost.
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000/api';

const QualityManagement = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState({});
  const [pendingInspections, setPendingInspections] = useState([]);
  const [qualityReports, setQualityReports] = useState([]);
  const [inspectionForm, setInspectionForm] = useState({
    inspection_id: '',
    pieces_inspected: '',
    pieces_approved: '',
    pieces_rejected: '',
    rejection_reasons: ''
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`${API_BASE}/production/quality/dashboard`, { headers: authHeaders() });
      const data = await response.json();
      if (data.success) {
        setDashboardData(data.data);
        setPendingInspections(data.data.pendingInspections || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchQualityReports = async () => {
    try {
      const response = await fetch(`${API_BASE}/production/quality/reports`, { headers: authHeaders() });
      const data = await response.json();
      if (data.success) {
        setQualityReports(data.data);
      }
    } catch (error) {
      console.error('Error fetching quality reports:', error);
    }
  };

  const startInspection = async (inspectionId) => {
    try {
      const response = await fetch(`${API_BASE}/production/quality/start-inspection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          inspection_id: inspectionId,
          inspector_id: 1 // Replace with actual inspector ID
        })
      });
      
      if (response.ok) {
        fetchDashboardData();
      }
    } catch (error) {
      console.error('Error starting inspection:', error);
    }
  };

  const completeInspection = async () => {
    try {
      const response = await fetch(`${API_BASE}/production/quality/complete-inspection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(inspectionForm)
      });
      
      if (response.ok) {
        setInspectionForm({
          inspection_id: '',
          pieces_inspected: '',
          pieces_approved: '',
          pieces_rejected: '',
          rejection_reasons: ''
        });
        fetchDashboardData();
      }
    } catch (error) {
      console.error('Error completing inspection:', error);
    }
  };

  const renderDashboard = () => (
    <div className="quality-dashboard">
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Today's Inspection Summary</h3>
          <div className="inspection-stats">
            <div className="stat-item">
              <span>Total Batches</span>
              <span>{dashboardData.todayInspections?.total_batches || 0}</span>
            </div>
            <div className="stat-item">
              <span>Pieces Sent</span>
              <span>{dashboardData.todayInspections?.total_pieces_sent || 0}</span>
            </div>
            <div className="stat-item">
              <span>Inspected</span>
              <span>{dashboardData.todayInspections?.total_inspected || 0}</span>
            </div>
            <div className="stat-item approved">
              <span>Approved</span>
              <span>{dashboardData.todayInspections?.total_approved || 0}</span>
            </div>
            <div className="stat-item rejected">
              <span>Rejected</span>
              <span>{dashboardData.todayInspections?.total_rejected || 0}</span>
            </div>
          </div>
        </div>

        <div className="dashboard-card">
          <h3>Rejection Rate by Style</h3>
          <div className="rejection-chart">
            {dashboardData.rejectionByStyle?.map(style => (
              <div key={style.style_name} className="style-rejection">
                <div className="style-info">
                  <span className="style-name">{style.style_name}</span>
                  <span className="rejection-rate">{style.rejection_rate?.toFixed(1)}%</span>
                </div>
                <div className="rejection-bar">
                  <div 
                    className="rejection-fill" 
                    style={{width: `${Math.min(style.rejection_rate, 100)}%`}}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pending-inspections">
        <h3>Pending Inspections</h3>
        <div className="inspections-table">
          <table>
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Style</th>
                <th>Employee</th>
                <th>Pieces Sent</th>
                <th>Date</th>
                <th>Hours Pending</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingInspections.map(inspection => (
                <tr key={inspection.id}>
                  <td>{inspection.order_number}</td>
                  <td>{inspection.style_name}</td>
                  <td>{inspection.employee_name}</td>
                  <td>{inspection.pieces_sent}</td>
                  <td>{new Date(inspection.inspection_date).toLocaleDateString()}</td>
                  <td className={inspection.hours_pending > 24 ? 'overdue' : ''}>
                    {inspection.hours_pending}h
                  </td>
                  <td>
                    <button 
                      className="start-btn"
                      onClick={() => startInspection(inspection.id)}
                    >
                      Start Inspection
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderInspectionForm = () => (
    <div className="inspection-form">
      <h3>Complete Inspection</h3>
      <form onSubmit={(e) => { e.preventDefault(); completeInspection(); }}>
        <div className="form-group">
          <label>Inspection ID:</label>
          <input
            type="number"
            value={inspectionForm.inspection_id}
            onChange={(e) => setInspectionForm({...inspectionForm, inspection_id: e.target.value})}
            required
          />
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>Pieces Inspected:</label>
            <input
              type="number"
              value={inspectionForm.pieces_inspected}
              onChange={(e) => setInspectionForm({...inspectionForm, pieces_inspected: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Pieces Approved:</label>
            <input
              type="number"
              value={inspectionForm.pieces_approved}
              onChange={(e) => setInspectionForm({...inspectionForm, pieces_approved: e.target.value})}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Pieces Rejected:</label>
            <input
              type="number"
              value={inspectionForm.pieces_rejected}
              onChange={(e) => setInspectionForm({...inspectionForm, pieces_rejected: e.target.value})}
              required
            />
          </div>
        </div>
        
        <div className="form-group">
          <label>Rejection Reasons:</label>
          <textarea
            value={inspectionForm.rejection_reasons}
            onChange={(e) => setInspectionForm({...inspectionForm, rejection_reasons: e.target.value})}
            rows="3"
            placeholder="Enter reasons for rejection..."
          />
        </div>
        
        <button type="submit" className="submit-btn">Complete Inspection</button>
      </form>
    </div>
  );

  const renderReports = () => (
    <div className="quality-reports">
      <div className="reports-header">
        <h3>Quality Reports</h3>
        <button onClick={fetchQualityReports} className="refresh-btn">
          Refresh Reports
        </button>
      </div>
      
      <div className="reports-table">
        <table>
          <thead>
            <tr>
              <th>Order Number</th>
              <th>Style</th>
              <th>Employee</th>
              <th>Inspector</th>
              <th>Date</th>
              <th>Sent</th>
              <th>Inspected</th>
              <th>Approved</th>
              <th>Rejected</th>
              <th>Rejection Rate</th>
              <th>Reasons</th>
            </tr>
          </thead>
          <tbody>
            {qualityReports.map((report, index) => (
              <tr key={index}>
                <td>{report.order_number}</td>
                <td>{report.style_name}</td>
                <td>{report.employee_name}</td>
                <td>{report.inspector_name || 'N/A'}</td>
                <td>{new Date(report.inspection_date).toLocaleDateString()}</td>
                <td>{report.pieces_sent}</td>
                <td>{report.pieces_inspected}</td>
                <td className="approved">{report.pieces_approved}</td>
                <td className="rejected">{report.pieces_rejected}</td>
                <td className={report.rejection_rate > 10 ? 'high-rejection' : 'low-rejection'}>
                  {report.rejection_rate?.toFixed(1)}%
                </td>
                <td className="reasons">{report.rejection_reasons || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="quality-management">
      <div className="quality-header">
        <h1>Quality Management</h1>
        <div className="tab-navigation">
          <button 
            className={activeTab === 'dashboard' ? 'active' : ''} 
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={activeTab === 'inspection' ? 'active' : ''} 
            onClick={() => setActiveTab('inspection')}
          >
            Complete Inspection
          </button>
          <button 
            className={activeTab === 'reports' ? 'active' : ''} 
            onClick={() => setActiveTab('reports')}
          >
            Reports
          </button>
        </div>
      </div>

      <div className="quality-content">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'inspection' && renderInspectionForm()}
        {activeTab === 'reports' && renderReports()}
      </div>
    </div>
  );
};

export default QualityManagement;