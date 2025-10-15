import React, { useState, useEffect } from 'react';
import './StyleCosting.css';

const StyleCosting = () => {
  const [dashboardData, setDashboardData] = useState({
    styleCosts: [],
    materialUsage: [],
    metrics: {}
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [showCostingModal, setShowCostingModal] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [styles, setStyles] = useState([]);
  const [costingForm, setCostingForm] = useState({
    styleId: '',
    materialId: '',
    quantity: '',
    rate: ''
  });

  useEffect(() => {
    loadDashboardData();
    loadMaterials();
    loadStyles();
  }, []);

  const loadDashboardData = async () => {
    try {
      const response = await fetch('http://localhost:5010/costing/dashboard');
      const result = await response.json();
      if (result.success) {
        setDashboardData(result.data);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const loadMaterials = async () => {
    try {
      const response = await fetch('http://localhost:5010/materials');
      const result = await response.json();
      if (result.success) {
        setMaterials(result.data);
      }
    } catch (error) {
      console.error('Error loading materials:', error);
    }
  };

  const loadStyles = async () => {
    try {
      const response = await fetch('http://localhost:5010/costing/styles');
      const result = await response.json();
      if (result.success) {
        setStyles(result.data);
      }
    } catch (error) {
      console.error('Error loading styles:', error);
    }
  };

  const loadCostBreakdown = async (styleId) => {
    try {
      const response = await fetch(`http://localhost:5010/costing/breakdown/${styleId}`);
      const result = await response.json();
      if (result.success) {
        setCostBreakdown(result.data);
      }
    } catch (error) {
      console.error('Error loading cost breakdown:', error);
    }
  };

  const handleStyleSelect = (style) => {
    setSelectedStyle(style);
    loadCostBreakdown(style.StyleID);
    setActiveTab('breakdown');
  };

  const handleCostingSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5010/costing/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costingForm)
      });
      const result = await response.json();
      if (result.success) {
        setShowCostingModal(false);
        setCostingForm({ styleId: '', materialId: '', quantity: '', rate: '' });
        loadDashboardData();
        if (selectedStyle) {
          loadCostBreakdown(selectedStyle.StyleID);
        }
        alert('Costing updated successfully!');
      }
    } catch (error) {
      console.error('Error updating costing:', error);
      alert('Error updating costing');
    }
  };

  const { metrics } = dashboardData;

  return (
    <div className="style-costing">
      <div className="costing-header">
        <h1>💰 Style Costing Dashboard</h1>
        <button className="btn-primary" onClick={() => setShowCostingModal(true)}>
          + Add Costing
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">👕</div>
          <div className="metric-content">
            <h3>Total Styles</h3>
            <div className="metric-value">{metrics.TotalStyles || 0}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">🧵</div>
          <div className="metric-content">
            <h3>Total Materials</h3>
            <div className="metric-value">{metrics.TotalMaterials || 0}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <h3>Average Cost</h3>
            <div className="metric-value">${(metrics.AvgStyleCost || 0).toFixed(2)}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon">📈</div>
          <div className="metric-content">
            <h3>Highest Cost</h3>
            <div className="metric-value">${(metrics.MaxStyleCost || 0).toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="costing-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Style Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'breakdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('breakdown')}
        >
          🔍 Cost Breakdown
        </button>
        <button 
          className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >
          🧵 Material Usage
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            <h2>👕 Style Cost Overview</h2>
            <div className="table-container">
              <table className="costing-table">
                <thead>
                  <tr>
                    <th>Style Code</th>
                    <th>Style Name</th>
                    <th>Category</th>
                    <th>Material Cost</th>
                    <th>Materials Used</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.styleCosts.map(style => (
                    <tr key={style.StyleID}>
                      <td><strong>{style.StyleCode}</strong></td>
                      <td>{style.StyleName}</td>
                      <td>{style.Category}</td>
                      <td className="cost-value">${(style.TotalMaterialCost || 0).toFixed(2)}</td>
                      <td>{style.MaterialCount}</td>
                      <td>{style.LastUpdated ? new Date(style.LastUpdated).toLocaleDateString() : 'N/A'}</td>
                      <td>
                        <button 
                          className="btn-view"
                          onClick={() => handleStyleSelect(style)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'breakdown' && (
          <div className="breakdown-section">
            <div className="breakdown-header">
              <h2>🔍 Cost Breakdown</h2>
              {selectedStyle && (
                <div className="selected-style">
                  <h3>{selectedStyle.StyleName} ({selectedStyle.StyleCode})</h3>
                  <p>Total Cost: <strong>${(selectedStyle.TotalMaterialCost || 0).toFixed(2)}</strong></p>
                </div>
              )}
            </div>
            
            {costBreakdown.length > 0 ? (
              <div className="breakdown-content">
                <div className="breakdown-chart">
                  {costBreakdown.map((item, index) => {
                    const percentage = selectedStyle ? (item.TotalCost / selectedStyle.TotalMaterialCost * 100) : 0;
                    return (
                      <div key={index} className="cost-item">
                        <div className="cost-bar">
                          <div 
                            className="cost-fill" 
                            style={{width: `${percentage}%`}}
                          ></div>
                        </div>
                        <div className="cost-details">
                          <span className="material-name">{item.MaterialName}</span>
                          <span className="cost-amount">${item.TotalCost.toFixed(2)} ({percentage.toFixed(1)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="breakdown-table">
                  <table className="costing-table">
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Category</th>
                        <th>Quantity</th>
                        <th>Unit</th>
                        <th>Rate</th>
                        <th>Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costBreakdown.map((item, index) => (
                        <tr key={index}>
                          <td>{item.MaterialName}</td>
                          <td>{item.MaterialCategory}</td>
                          <td>{item.Quantity}</td>
                          <td>{item.Unit}</td>
                          <td>${item.Rate.toFixed(2)}</td>
                          <td className="cost-value">${item.TotalCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>Select a Style</h3>
                <p>Choose a style from the overview to see its cost breakdown.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="materials-section">
            <h2>🧵 Material Usage Analysis</h2>
            <div className="table-container">
              <table className="costing-table">
                <thead>
                  <tr>
                    <th>Material Code</th>
                    <th>Material Name</th>
                    <th>Category</th>
                    <th>Current Rate</th>
                    <th>Used in Styles</th>
                    <th>Total Quantity</th>
                    <th>Average Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardData.materialUsage.map(material => (
                    <tr key={material.MaterialCode}>
                      <td><strong>{material.MaterialCode}</strong></td>
                      <td>{material.MaterialName}</td>
                      <td>{material.Category}</td>
                      <td>${(material.CurrentRate || 0).toFixed(2)}</td>
                      <td>{material.UsedInStyles || 0}</td>
                      <td>{(material.TotalQuantityUsed || 0).toFixed(2)}</td>
                      <td>${(material.AverageRate || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Costing Modal */}
      {showCostingModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>💰 Add/Update Style Costing</h3>
            <form onSubmit={handleCostingSubmit}>
              <select
                value={costingForm.styleId}
                onChange={(e) => setCostingForm({...costingForm, styleId: e.target.value})}
                required
              >
                <option value="">Select Style</option>
                {styles.map(style => (
                  <option key={style.StyleID} value={style.StyleID}>
                    {style.StyleCode} - {style.StyleName}
                  </option>
                ))}
              </select>
              
              <select
                value={costingForm.materialId}
                onChange={(e) => setCostingForm({...costingForm, materialId: e.target.value})}
                required
              >
                <option value="">Select Material</option>
                {materials.map(material => (
                  <option key={material.MaterialID} value={material.MaterialID}>
                    {material.MaterialCode} - {material.MaterialName}
                  </option>
                ))}
              </select>
              
              <input
                type="number"
                step="0.01"
                placeholder="Quantity"
                value={costingForm.quantity}
                onChange={(e) => setCostingForm({...costingForm, quantity: e.target.value})}
                required
              />
              
              <input
                type="number"
                step="0.01"
                placeholder="Rate per unit"
                value={costingForm.rate}
                onChange={(e) => setCostingForm({...costingForm, rate: e.target.value})}
                required
              />
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">Save Costing</button>
                <button type="button" className="btn-secondary" onClick={() => setShowCostingModal(false)}>
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

export default StyleCosting;