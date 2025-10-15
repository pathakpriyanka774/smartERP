import React, { useState } from 'react';
import './Production.css';
import OrderReview from '../ProductionWorkflow/OrderReview';
import MaterialCheck from '../ProductionWorkflow/MaterialCheck';
import ProductionScheduler from '../ProductionWorkflow/ProductionScheduler';

const Production = () => {
  const [productionData, setProductionData] = useState({
    batchNumber: '',
    productName: '',
    orderNumber: '',
    quantity: '',
    startDate: '',
    targetDate: '',
    assignedWorkers: '',
    machineUsed: '',
    stage: 'Planning',
    priority: 'Medium',
    status: 'Not Started'
  });
  
  const [productions, setProductions] = useState([
    { 
      id: 1, 
      batchNumber: 'BTH-001', 
      productName: 'Cotton T-Shirts - White', 
      orderNumber: 'ORD-1001',
      quantity: 5000, 
      startDate: '2024-02-01',
      targetDate: '2024-02-15',
      assignedWorkers: 'Team A (8 workers)',
      machineUsed: 'Machine Line 1',
      stage: 'Cutting',
      priority: 'High',
      status: 'In Progress',
      progress: 35,
      created: '2024-01-28' 
    },
    { 
      id: 2, 
      batchNumber: 'BTH-002', 
      productName: 'Denim Jeans - Blue', 
      orderNumber: 'ORD-1002',
      quantity: 2500, 
      startDate: '2024-02-05',
      targetDate: '2024-02-20',
      assignedWorkers: 'Team B (6 workers)',
      machineUsed: 'Machine Line 2',
      stage: 'Sewing',
      priority: 'Medium',
      status: 'In Progress',
      progress: 60,
      created: '2024-02-01' 
    },
    { 
      id: 3, 
      batchNumber: 'BTH-003', 
      productName: 'Silk Dresses - Premium', 
      orderNumber: 'ORD-1003',
      quantity: 150, 
      startDate: '2024-01-20',
      targetDate: '2024-02-05',
      assignedWorkers: 'Team C (4 workers)',
      machineUsed: 'Machine Line 3',
      stage: 'Quality Check',
      priority: 'High',
      status: 'Completed',
      progress: 100,
      created: '2024-01-15' 
    },
    { 
      id: 4, 
      batchNumber: 'BTH-004', 
      productName: 'Polo Shirts - Navy', 
      orderNumber: 'ORD-1004',
      quantity: 1200, 
      startDate: '2024-02-10',
      targetDate: '2024-02-25',
      assignedWorkers: 'Team D (5 workers)',
      machineUsed: 'Machine Line 1',
      stage: 'Planning',
      priority: 'Low',
      status: 'Not Started',
      progress: 0,
      created: '2024-02-08' 
    }
  ]);
  
  const [editingId, setEditingId] = useState(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('production');
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [materialStatus, setMaterialStatus] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProductionData({
      ...productionData,
      [name]: value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (editingId) {
      setProductions(productions.map(prod => 
        prod.id === editingId 
          ? { ...prod, ...productionData, quantity: parseInt(productionData.quantity), progress: 0 }
          : prod
      ));
      setEditingId(null);
    } else {
      const newProduction = {
        id: Math.max(...productions.map(p => p.id)) + 1,
        ...productionData,
        quantity: parseInt(productionData.quantity),
        progress: 0,
        created: new Date().toISOString().split('T')[0]
      };
      setProductions([...productions, newProduction]);
    }
    setProductionData({ 
      batchNumber: '', 
      productName: '', 
      orderNumber: '', 
      quantity: '', 
      startDate: '', 
      targetDate: '', 
      assignedWorkers: '', 
      machineUsed: '', 
      stage: 'Planning', 
      priority: 'Medium', 
      status: 'Not Started' 
    });
  };

  const handleEdit = (production) => {
    setProductionData({
      batchNumber: production.batchNumber,
      productName: production.productName,
      orderNumber: production.orderNumber,
      quantity: production.quantity.toString(),
      startDate: production.startDate,
      targetDate: production.targetDate,
      assignedWorkers: production.assignedWorkers,
      machineUsed: production.machineUsed,
      stage: production.stage,
      priority: production.priority,
      status: production.status
    });
    setEditingId(production.id);
  };

  const handleCancel = () => {
    setProductionData({ 
      batchNumber: '', 
      productName: '', 
      orderNumber: '', 
      quantity: '', 
      startDate: '', 
      targetDate: '', 
      assignedWorkers: '', 
      machineUsed: '', 
      stage: 'Planning', 
      priority: 'Medium', 
      status: 'Not Started' 
    });
    setEditingId(null);
  };

  const getActiveProductions = () => {
    return productions.filter(prod => prod.status === 'In Progress').length;
  };

  const getCompletedProductions = () => {
    return productions.filter(prod => prod.status === 'Completed').length;
  };

  const getTotalQuantity = () => {
    return productions.reduce((total, prod) => total + prod.quantity, 0);
  };

  return (
    <div className="production">
      <div className="production-header">
        <h1>Production Workflow</h1>
        <div className="production-tabs">
          <button 
            className={`tab-btn ${activeTab === 'production' ? 'active' : ''}`}
            onClick={() => setActiveTab('production')}
          >
            All Production
          </button>
          <button 
            className={`tab-btn ${activeTab === 'order-review' ? 'active' : ''}`}
            onClick={() => setActiveTab('order-review')}
          >
            Review Orders
          </button>
          <button 
            className={`tab-btn ${activeTab === 'material-check' ? 'active' : ''}`}
            onClick={() => setActiveTab('material-check')}
          >
            Check Materials
          </button>
          <button 
            className={`tab-btn ${activeTab === 'scheduler' ? 'active' : ''}`}
            onClick={() => setActiveTab('scheduler')}
          >
            Schedule Production
          </button>
        </div>
      </div>

      {activeTab === 'order-review' && (
        <OrderReview 
          onOrderSelected={(orders) => {
            setSelectedOrders(orders);
            setActiveTab('material-check');
          }} 
        />
      )}
      {activeTab === 'material-check' && (
        <MaterialCheck 
          selectedOrders={selectedOrders}
          onMaterialsChecked={(status) => {
            setMaterialStatus(status);
            setActiveTab('scheduler');
          }}
        />
      )}
      {activeTab === 'scheduler' && (
        <ProductionScheduler 
          selectedOrders={selectedOrders}
          materialStatus={materialStatus}
        />
      )}
      {activeTab === 'production' && (
      <>
      <div className="production-stats">
        <div className="stat-card">
          <h3>Total Batches</h3>
          <div className="stat-value">{productions.length}</div>
        </div>
        <div className="stat-card">
          <h3>Active Productions</h3>
          <div className="stat-value warning">{getActiveProductions()}</div>
        </div>
        <div className="stat-card">
          <h3>Completed</h3>
          <div className="stat-value success">{getCompletedProductions()}</div>
        </div>
        <div className="stat-card">
          <h3>Total Quantity</h3>
          <div className="stat-value">{getTotalQuantity().toLocaleString()}</div>
        </div>
      </div>

      <div className="production-creator">
        <h3>{editingId ? 'Edit Production Batch' : 'Create New Production Batch'}</h3>
        <form onSubmit={handleSubmit} className="production-form">
          <div className="form-section">
            <h4>Batch Information</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Batch Number *</label>
                <input
                  type="text"
                  name="batchNumber"
                  value={productionData.batchNumber}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter batch number"
                />
              </div>
              <div className="form-group">
                <label>Order Number</label>
                <input
                  type="text"
                  name="orderNumber"
                  value={productionData.orderNumber}
                  onChange={handleInputChange}
                  placeholder="Enter related order number"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  name="productName"
                  value={productionData.productName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter product name"
                />
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  name="quantity"
                  value={productionData.quantity}
                  onChange={handleInputChange}
                  required
                  min="1"
                  placeholder="Enter quantity"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Production Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Start Date *</label>
                <input
                  type="date"
                  name="startDate"
                  value={productionData.startDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Target Date *</label>
                <input
                  type="date"
                  name="targetDate"
                  value={productionData.targetDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Assigned Workers</label>
                <input
                  type="text"
                  name="assignedWorkers"
                  value={productionData.assignedWorkers}
                  onChange={handleInputChange}
                  placeholder="Enter assigned workers/team"
                />
              </div>
              <div className="form-group">
                <label>Machine Used</label>
                <input
                  type="text"
                  name="machineUsed"
                  value={productionData.machineUsed}
                  onChange={handleInputChange}
                  placeholder="Enter machine/line used"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Production Stage</label>
                <select name="stage" value={productionData.stage} onChange={handleInputChange}>
                  <option value="Planning">Planning</option>
                  <option value="Material Prep">Material Prep</option>
                  <option value="Cutting">Cutting</option>
                  <option value="Sewing">Sewing</option>
                  <option value="Finishing">Finishing</option>
                  <option value="Quality Check">Quality Check</option>
                  <option value="Packaging">Packaging</option>
                </select>
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select name="priority" value={productionData.priority} onChange={handleInputChange}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
            
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={productionData.status} onChange={handleInputChange}>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Batch' : 'Create Batch'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="production-table-section">
        <div className="table-header">
          <h3>Production Batches</h3>
          <button 
            onClick={() => setIsTableExpanded(!isTableExpanded)}
            className="btn-expand"
          >
            {isTableExpanded ? '📋 Collapse' : '📊 Expand All'}
          </button>
        </div>
        <div className={`table-container ${isTableExpanded ? 'expanded' : 'compact'}`}>
          <table className="production-table">
            <thead>
              <tr>
                <th>Batch Number</th>
                <th>Product Name</th>
                <th>Quantity</th>
                <th>Progress</th>
                {!isTableExpanded && <th>Status</th>}
                {!isTableExpanded && <th>Actions</th>}
                {isTableExpanded && (
                  <>
                    <th>Order Number</th>
                    <th>Start Date</th>
                    <th>Target Date</th>
                    <th>Workers</th>
                    <th>Machine</th>
                    <th>Stage</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {productions.map(production => (
                <tr key={production.id}>
                  <td>{production.batchNumber}</td>
                  <td>{production.productName}</td>
                  <td>{production.quantity.toLocaleString()}</td>
                  <td>
                    <div className="progress-container">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{width: `${production.progress}%`}}
                        ></div>
                      </div>
                      <span className="progress-text">{production.progress}%</span>
                    </div>
                  </td>
                  {!isTableExpanded && (
                    <>
                      <td>
                        <span className={`status ${production.status.toLowerCase().replace(' ', '-')}`}>
                          {production.status}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => handleEdit(production)}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                  {isTableExpanded && (
                    <>
                      <td>{production.orderNumber}</td>
                      <td>{production.startDate}</td>
                      <td>{production.targetDate}</td>
                      <td>{production.assignedWorkers}</td>
                      <td>{production.machineUsed}</td>
                      <td>
                        <span className={`stage ${production.stage.toLowerCase().replace(' ', '-')}`}>
                          {production.stage}
                        </span>
                      </td>
                      <td>
                        <span className={`priority ${production.priority.toLowerCase()}`}>
                          {production.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`status ${production.status.toLowerCase().replace(' ', '-')}`}>
                          {production.status}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => handleEdit(production)}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default Production;