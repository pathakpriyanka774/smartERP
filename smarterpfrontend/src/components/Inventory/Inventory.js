import React, { useState } from 'react';
import './Inventory.css';
import StockChecker from '../InventoryWorkflow/StockChecker';
import PurchaseOrders from '../InventoryWorkflow/PurchaseOrders';
import GoodsReceiving from '../InventoryWorkflow/GoodsReceiving';

const Inventory = () => {
  const [inventoryData, setInventoryData] = useState({
    itemName: '',
    category: 'Raw Material',
    sku: '',
    quantity: '',
    unitPrice: '',
    supplier: '',
    location: '',
    minStockLevel: '',
    status: 'In Stock'
  });
  
  const [inventory, setInventory] = useState([
    { 
      id: 1, 
      itemName: 'Cotton Fabric - White', 
      category: 'Raw Material',
      sku: 'CTN-WHT-001',
      quantity: 5000, 
      unitPrice: 8.50,
      totalValue: 42500,
      supplier: 'Textile Mills Co.',
      location: 'Warehouse A',
      minStockLevel: 1000,
      status: 'In Stock', 
      lastUpdated: '2024-01-15' 
    },
    { 
      id: 2, 
      itemName: 'Denim Fabric - Blue', 
      category: 'Raw Material',
      sku: 'DNM-BLU-002',
      quantity: 2500, 
      unitPrice: 12.00,
      totalValue: 30000,
      supplier: 'Premium Fabrics Ltd.',
      location: 'Warehouse B',
      minStockLevel: 500,
      status: 'In Stock', 
      lastUpdated: '2024-01-20' 
    },
    { 
      id: 3, 
      itemName: 'Polyester Thread', 
      category: 'Accessories',
      sku: 'PLY-THR-003',
      quantity: 150, 
      unitPrice: 2.50,
      totalValue: 375,
      supplier: 'Thread Solutions Inc.',
      location: 'Storage Room C',
      minStockLevel: 200,
      status: 'Low Stock', 
      lastUpdated: '2024-01-25' 
    },
    { 
      id: 4, 
      itemName: 'Metal Buttons - Silver', 
      category: 'Accessories',
      sku: 'BTN-SLV-004',
      quantity: 0, 
      unitPrice: 0.15,
      totalValue: 0,
      supplier: 'Button World',
      location: 'Storage Room D',
      minStockLevel: 1000,
      status: 'Out of Stock', 
      lastUpdated: '2024-01-28' 
    },
    { 
      id: 5, 
      itemName: 'Finished T-Shirts - Medium', 
      category: 'Finished Goods',
      sku: 'TSH-MED-005',
      quantity: 850, 
      unitPrice: 15.00,
      totalValue: 12750,
      supplier: 'Internal Production',
      location: 'Finished Goods Area',
      minStockLevel: 100,
      status: 'In Stock', 
      lastUpdated: '2024-01-30' 
    }
  ]);
  
  const [editingId, setEditingId] = useState(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInventoryData({
      ...inventoryData,
      [name]: value
    });
  };

  const calculateTotalValue = () => {
    const quantity = parseFloat(inventoryData.quantity) || 0;
    const unitPrice = parseFloat(inventoryData.unitPrice) || 0;
    return quantity * unitPrice;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const totalValue = calculateTotalValue();
    
    if (editingId) {
      setInventory(inventory.map(item => 
        item.id === editingId 
          ? { ...item, ...inventoryData, quantity: parseInt(inventoryData.quantity), unitPrice: parseFloat(inventoryData.unitPrice), totalValue }
          : item
      ));
      setEditingId(null);
    } else {
      const newItem = {
        id: Math.max(...inventory.map(i => i.id)) + 1,
        ...inventoryData,
        quantity: parseInt(inventoryData.quantity),
        unitPrice: parseFloat(inventoryData.unitPrice),
        totalValue,
        lastUpdated: new Date().toISOString().split('T')[0]
      };
      setInventory([...inventory, newItem]);
    }
    setInventoryData({ 
      itemName: '', 
      category: 'Raw Material', 
      sku: '', 
      quantity: '', 
      unitPrice: '', 
      supplier: '', 
      location: '', 
      minStockLevel: '', 
      status: 'In Stock' 
    });
  };

  const handleEdit = (item) => {
    setInventoryData({
      itemName: item.itemName,
      category: item.category,
      sku: item.sku,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      supplier: item.supplier,
      location: item.location,
      minStockLevel: item.minStockLevel.toString(),
      status: item.status
    });
    setEditingId(item.id);
  };

  const handleCancel = () => {
    setInventoryData({ 
      itemName: '', 
      category: 'Raw Material', 
      sku: '', 
      quantity: '', 
      unitPrice: '', 
      supplier: '', 
      location: '', 
      minStockLevel: '', 
      status: 'In Stock' 
    });
    setEditingId(null);
  };

  const getTotalInventoryValue = () => {
    return inventory.reduce((total, item) => total + item.totalValue, 0);
  };

  const getLowStockItems = () => {
    return inventory.filter(item => item.quantity <= item.minStockLevel).length;
  };

  const getOutOfStockItems = () => {
    return inventory.filter(item => item.quantity === 0).length;
  };

  return (
    <div className="inventory">
      <div className="inventory-header">
        <h1>Inventory Workflow</h1>
        <div className="inventory-tabs">
          <button 
            className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            All Inventory
          </button>
          <button 
            className={`tab-btn ${activeTab === 'stock-check' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock-check')}
          >
            Stock Check
          </button>
          <button 
            className={`tab-btn ${activeTab === 'purchase-orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('purchase-orders')}
          >
            Purchase Orders
          </button>
          <button 
            className={`tab-btn ${activeTab === 'goods-receiving' ? 'active' : ''}`}
            onClick={() => setActiveTab('goods-receiving')}
          >
            Goods Receiving
          </button>
        </div>
      </div>

      {activeTab === 'stock-check' && <StockChecker onRestockNeeded={() => setActiveTab('purchase-orders')} />}
      {activeTab === 'purchase-orders' && <PurchaseOrders onOrderApproved={() => setActiveTab('goods-receiving')} />}
      {activeTab === 'goods-receiving' && <GoodsReceiving />}
      {activeTab === 'inventory' && (
      <>
      <div className="inventory-stats">
        <div className="stat-card">
          <h3>Total Items</h3>
          <div className="stat-value">{inventory.length}</div>
        </div>
        <div className="stat-card">
          <h3>Total Value</h3>
          <div className="stat-value">${getTotalInventoryValue().toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Low Stock Items</h3>
          <div className="stat-value warning">{getLowStockItems()}</div>
        </div>
        <div className="stat-card">
          <h3>Out of Stock</h3>
          <div className="stat-value danger">{getOutOfStockItems()}</div>
        </div>
      </div>

      <div className="inventory-creator">
        <h3>{editingId ? 'Edit Inventory Item' : 'Add New Inventory Item'}</h3>
        <form onSubmit={handleSubmit} className="inventory-form">
          <div className="form-section">
            <h4>Item Information</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Item Name *</label>
                <input
                  type="text"
                  name="itemName"
                  value={inventoryData.itemName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter item name"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select name="category" value={inventoryData.category} onChange={handleInputChange}>
                  <option value="Raw Material">Raw Material</option>
                  <option value="Accessories">Accessories</option>
                  <option value="Finished Goods">Finished Goods</option>
                  <option value="Tools & Equipment">Tools & Equipment</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>SKU *</label>
                <input
                  type="text"
                  name="sku"
                  value={inventoryData.sku}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter SKU code"
                />
              </div>
              <div className="form-group">
                <label>Supplier</label>
                <input
                  type="text"
                  name="supplier"
                  value={inventoryData.supplier}
                  onChange={handleInputChange}
                  placeholder="Enter supplier name"
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h4>Stock Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  name="quantity"
                  value={inventoryData.quantity}
                  onChange={handleInputChange}
                  required
                  min="0"
                  placeholder="Enter quantity"
                />
              </div>
              <div className="form-group">
                <label>Unit Price ($) *</label>
                <input
                  type="number"
                  name="unitPrice"
                  value={inventoryData.unitPrice}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  placeholder="Enter unit price"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Total Value ($)</label>
                <input
                  type="text"
                  value={calculateTotalValue().toFixed(2)}
                  disabled
                  className="calculated-field"
                />
              </div>
              <div className="form-group">
                <label>Min Stock Level</label>
                <input
                  type="number"
                  name="minStockLevel"
                  value={inventoryData.minStockLevel}
                  onChange={handleInputChange}
                  min="0"
                  placeholder="Enter minimum stock level"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={inventoryData.location}
                  onChange={handleInputChange}
                  placeholder="Enter storage location"
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={inventoryData.status} onChange={handleInputChange}>
                  <option value="In Stock">In Stock</option>
                  <option value="Low Stock">Low Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Discontinued">Discontinued</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Item' : 'Add Item'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="inventory-table-section">
        <div className="table-header">
          <h3>Inventory Items</h3>
          <button 
            onClick={() => setIsTableExpanded(!isTableExpanded)}
            className="btn-expand"
          >
            {isTableExpanded ? '📋 Collapse' : '📊 Expand All'}
          </button>
        </div>
        <div className={`table-container ${isTableExpanded ? 'expanded' : 'compact'}`}>
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Item Name</th>
                {!isTableExpanded && <th>Category</th>}
                <th>Quantity</th>
                <th>Total Value</th>
                {!isTableExpanded && <th>Status</th>}
                {!isTableExpanded && <th>Actions</th>}
                {isTableExpanded && (
                  <>
                    <th>SKU</th>
                    <th>Unit Price</th>
                    <th>Supplier</th>
                    <th>Location</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => (
                <tr key={item.id}>
                  <td>{item.itemName}</td>
                  {!isTableExpanded && (
                    <>
                      <td>
                        <span className={`category ${item.category.toLowerCase().replace(' ', '-')}`}>
                          {item.category}
                        </span>
                      </td>
                    </>
                  )}
                  <td>{item.quantity.toLocaleString()}</td>
                  <td>${item.totalValue.toLocaleString()}</td>
                  {!isTableExpanded && (
                    <>
                      <td>
                        <span className={`status ${item.status.toLowerCase().replace(' ', '-')}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => handleEdit(item)}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                  {isTableExpanded && (
                    <>
                      <td>{item.sku}</td>
                      <td>${item.unitPrice.toFixed(2)}</td>
                      <td>{item.supplier}</td>
                      <td>{item.location}</td>
                      <td>
                        <span className={`category ${item.category.toLowerCase().replace(' ', '-')}`}>
                          {item.category}
                        </span>
                      </td>
                      <td>
                        <span className={`status ${item.status.toLowerCase().replace(' ', '-')}`}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => handleEdit(item)}
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

export default Inventory;