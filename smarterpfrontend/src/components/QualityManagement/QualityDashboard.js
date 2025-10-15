import React, { useState, useEffect } from 'react';
import './QualityManagement.css';

const QualityDashboard = () => {
  const [pendingInspections, setPendingInspections] = useState([]);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedProduction, setSelectedProduction] = useState(null);
  const [inspectionForm, setInspectionForm] = useState({
    piecesInspected: 0,
    piecesApproved: 0,
    piecesRejected: 0,
    defectTypes: '',
    notes: ''
  });
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    loadPendingInspections();
    const interval = setInterval(loadPendingInspections, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadPendingInspections = async () => {
    try {
      const response = await fetch('http://localhost:5009/quality/pending');
      const result = await response.json();
      if (result.success) {
        setPendingInspections(result.data);
      }
    } catch (error) {
      console.error('Error loading pending inspections:', error);
    }
  };

  const handleInspectionSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5009/quality/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionId: selectedProduction.ProductionID,
          inspectorId: 1, // Should come from logged-in user
          ...inspectionForm
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setShowInspectionModal(false);
        setSelectedProduction(null);
        setInspectionForm({
          piecesInspected: 0,
          piecesApproved: 0,
          piecesRejected: 0,
          defectTypes: '',
          notes: ''
        });
        loadPendingInspections();
        alert('Quality inspection recorded successfully!');
      }
    } catch (error) {
      console.error('Error recording inspection:', error);
      alert('Error recording inspection');
    }
  };

  const startInspection = (production) => {
    setSelectedProduction(production);
    setInspectionForm({
      piecesInspected: production.PiecesCompleted,
      piecesApproved: 0,
      piecesRejected: 0,
      defectTypes: '',
      notes: ''
    });
    setShowInspectionModal(true);
  };

  const defectOptions = [
    'Stitching Issues',
    'Fabric Defects',
    'Size Variations',
    'Color Mismatch',
    'Missing Components',
    'Finishing Problems',
    'Measurement Errors'
  ];

  return (
    <div className="quality-dashboard">
      <div className="dashboard-header">
        <h1>🔍 Quality Control Dashboard</h1>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-label">Pending Inspections</span>
            <span className="stat-value">{pendingInspections.length}</span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quality-stats">
        <div className="stat-card pending">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>Pending Inspections</h3>
            <div className="stat-value">{pendingInspections.length}</div>
            <div className="stat-subtitle">Items ready for quality check</div>
          </div>
        </div>
        <div className="stat-card today">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <h3>Today's Target</h3>
            <div className="stat-value">
              {pendingInspections.reduce((sum, item) => sum + item.PiecesCompleted, 0)}
            </div>
            <div className="stat-subtitle">Total pieces to inspect</div>
          </div>
        </div>
        <div className="stat-card priority">
          <div className="stat-icon">🚨</div>
          <div className="stat-content">
            <h3>High Priority</h3>
            <div className="stat-value">
              {pendingInspections.filter(item => 
                new Date(item.ProductionDate) < new Date(Date.now() - 24*60*60*1000)
              ).length}
            </div>
            <div className="stat-subtitle">Items over 24 hours old</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="dashboard-tabs">
        <button 
          className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          ⏳ Pending Inspections
        </button>
        <button 
          className={`tab-btn ${activeTab === 'guidelines' ? 'active' : ''}`}
          onClick={() => setActiveTab('guidelines')}
        >
          📋 Quality Guidelines
        </button>
        <button 
          className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          📊 Quality Reports
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'pending' && (
          <div className="pending-section">
            <h2>⏳ Items Ready for Quality Inspection</h2>
            <div className="table-container">
              <table className="quality-table">
                <thead>
                  <tr>
                    <th>Production Date</th>
                    <th>Employee</th>
                    <th>Machine</th>
                    <th>Order Code</th>
                    <th>Style</th>
                    <th>Pieces Completed</th>
                    <th>Priority</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInspections.map(item => {
                    const isOld = new Date(item.ProductionDate) < new Date(Date.now() - 24*60*60*1000);
                    return (
                      <tr key={item.ProductionID} className={isOld ? 'high-priority' : ''}>
                        <td>{new Date(item.ProductionDate).toLocaleDateString()}</td>
                        <td>{item.EmployeeName}</td>
                        <td>{item.MachineName}</td>
                        <td><strong>{item.OrderCode}</strong></td>
                        <td>{item.StyleName}</td>
                        <td><strong>{item.PiecesCompleted}</strong></td>
                        <td>
                          <span className={`priority ${isOld ? 'high' : 'normal'}`}>
                            {isOld ? '🚨 High' : '📋 Normal'}
                          </span>
                        </td>
                        <td>
                          <button 
                            className="btn-inspect"
                            onClick={() => startInspection(item)}
                          >
                            🔍 Start Inspection
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pendingInspections.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <h3>All Caught Up!</h3>
                  <p>No items pending quality inspection at the moment.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'guidelines' && (
          <div className="guidelines-section">
            <h2>📋 Quality Control Guidelines</h2>
            <div className="guidelines-grid">
              <div className="guideline-card">
                <h3>👕 T-Shirt Quality Standards</h3>
                <ul>
                  <li>Check seam strength and alignment</li>
                  <li>Verify neck and sleeve measurements</li>
                  <li>Inspect fabric for holes or stains</li>
                  <li>Ensure proper label placement</li>
                  <li>Check color consistency</li>
                </ul>
              </div>
              <div className="guideline-card">
                <h3>👖 Jeans Quality Standards</h3>
                <ul>
                  <li>Test zipper functionality</li>
                  <li>Check button attachment strength</li>
                  <li>Verify inseam and waist measurements</li>
                  <li>Inspect pocket stitching</li>
                  <li>Check for proper distressing (if applicable)</li>
                </ul>
              </div>
              <div className="guideline-card">
                <h3>👗 Dress Quality Standards</h3>
                <ul>
                  <li>Check zipper alignment and function</li>
                  <li>Verify hem evenness</li>
                  <li>Inspect lining attachment</li>
                  <li>Check dart placement and symmetry</li>
                  <li>Ensure proper fit at key points</li>
                </ul>
              </div>
              <div className="guideline-card">
                <h3>🔍 General Inspection Process</h3>
                <ul>
                  <li>Visual inspection for defects</li>
                  <li>Measurement verification</li>
                  <li>Functional testing (zippers, buttons)</li>
                  <li>Final packaging check</li>
                  <li>Documentation of any issues</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="reports-section">
            <h2>📊 Quality Performance Reports</h2>
            <div className="report-cards">
              <div className="report-card">
                <h3>📈 Daily Quality Metrics</h3>
                <div className="metric-row">
                  <span>Inspection Rate:</span>
                  <span className="metric-value">95.2%</span>
                </div>
                <div className="metric-row">
                  <span>Approval Rate:</span>
                  <span className="metric-value good">92.8%</span>
                </div>
                <div className="metric-row">
                  <span>Rejection Rate:</span>
                  <span className="metric-value warning">7.2%</span>
                </div>
              </div>
              <div className="report-card">
                <h3>🎯 Quality Targets</h3>
                <div className="target-item">
                  <span>Target Approval Rate: ≥95%</span>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{width: '92.8%'}}></div>
                  </div>
                </div>
                <div className="target-item">
                  <span>Target Inspection Time: ≤2 hours</span>
                  <div className="progress-bar">
                    <div className="progress-fill good" style={{width: '85%'}}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inspection Modal */}
      {showInspectionModal && selectedProduction && (
        <div className="modal-overlay">
          <div className="modal large-modal">
            <h3>🔍 Quality Inspection - {selectedProduction.StyleName}</h3>
            <div className="inspection-details">
              <div className="detail-row">
                <span>Order:</span> <strong>{selectedProduction.OrderCode}</strong>
              </div>
              <div className="detail-row">
                <span>Employee:</span> <strong>{selectedProduction.EmployeeName}</strong>
              </div>
              <div className="detail-row">
                <span>Machine:</span> <strong>{selectedProduction.MachineName}</strong>
              </div>
              <div className="detail-row">
                <span>Production Date:</span> <strong>{new Date(selectedProduction.ProductionDate).toLocaleDateString()}</strong>
              </div>
            </div>
            
            <form onSubmit={handleInspectionSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Pieces to Inspect</label>
                  <input
                    type="number"
                    value={inspectionForm.piecesInspected}
                    onChange={(e) => setInspectionForm({
                      ...inspectionForm, 
                      piecesInspected: parseInt(e.target.value)
                    })}
                    max={selectedProduction.PiecesCompleted}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Pieces Approved</label>
                  <input
                    type="number"
                    value={inspectionForm.piecesApproved}
                    onChange={(e) => {
                      const approved = parseInt(e.target.value);
                      setInspectionForm({
                        ...inspectionForm, 
                        piecesApproved: approved,
                        piecesRejected: inspectionForm.piecesInspected - approved
                      });
                    }}
                    max={inspectionForm.piecesInspected}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Pieces Rejected</label>
                  <input
                    type="number"
                    value={inspectionForm.piecesRejected}
                    onChange={(e) => {
                      const rejected = parseInt(e.target.value);
                      setInspectionForm({
                        ...inspectionForm, 
                        piecesRejected: rejected,
                        piecesApproved: inspectionForm.piecesInspected - rejected
                      });
                    }}
                    max={inspectionForm.piecesInspected}
                    required
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Defect Types (if any)</label>
                <div className="defect-checkboxes">
                  {defectOptions.map(defect => (
                    <label key={defect} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={inspectionForm.defectTypes.includes(defect)}
                        onChange={(e) => {
                          const defects = inspectionForm.defectTypes.split(', ').filter(d => d);
                          if (e.target.checked) {
                            defects.push(defect);
                          } else {
                            const index = defects.indexOf(defect);
                            if (index > -1) defects.splice(index, 1);
                          }
                          setInspectionForm({...inspectionForm, defectTypes: defects.join(', ')});
                        }}
                      />
                      {defect}
                    </label>
                  ))}
                </div>
              </div>
              
              <div className="form-group">
                <label>Inspection Notes</label>
                <textarea
                  value={inspectionForm.notes}
                  onChange={(e) => setInspectionForm({...inspectionForm, notes: e.target.value})}
                  rows="3"
                  placeholder="Add any additional notes about the inspection..."
                />
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  ✅ Complete Inspection
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowInspectionModal(false)}>
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

export default QualityDashboard;