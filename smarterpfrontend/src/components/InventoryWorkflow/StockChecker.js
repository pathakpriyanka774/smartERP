import React, { useState, useEffect } from 'react';
import './InventoryWorkflow.css';

const StockChecker = ({ onRestockNeeded }) => {
  const [inventory, setInventory] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [minStockLevel, setMinStockLevel] = useState(10);

  useEffect(() => {
    const savedInventory = localStorage.getItem('inventory');
    if (savedInventory) {
      const items = JSON.parse(savedInventory);
      setInventory(items);
      checkLowStock(items);
    } else {
      const defaultInventory = [
        { id: 1, name: 'Cotton Fabric', currentStock: 5, minStock: 20, unit: 'yards', supplier: 'Fabric Co.' },
        { id: 2, name: 'Polyester Thread', currentStock: 15, minStock: 50, unit: 'spools', supplier: 'Thread Ltd.' },
        { id: 3, name: 'Buttons', currentStock: 8, minStock: 100, unit: 'pieces', supplier: 'Button Inc.' },
        { id: 4, name: 'Zippers', currentStock: 25, minStock: 30, unit: 'pieces', supplier: 'Zip Corp.' }
      ];
      setInventory(defaultInventory);
      localStorage.setItem('inventory', JSON.stringify(defaultInventory));
      checkLowStock(defaultInventory);
    }
  }, []);

  const checkLowStock = (items) => {
    const lowStock = items.filter(item => item.currentStock <= item.minStock);
    setLowStockItems(lowStock);
  };

  const generatePurchaseOrder = (items) => {
    const purchaseOrder = {
      id: Date.now(),
      items: items.map(item => ({
        ...item,
        orderQuantity: item.minStock * 2 - item.currentStock
      })),
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    
    const orders = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    orders.push(purchaseOrder);
    localStorage.setItem('purchaseOrders', JSON.stringify(orders));
    
    if (onRestockNeeded) onRestockNeeded(purchaseOrder);
  };

  return (
    <div className="stock-checker">
      <h2>Stock Level Check</h2>
      
      <div className="stock-summary">
        <div className="summary-card">
          <h3>Total Items</h3>
          <span className="count">{inventory.length}</span>
        </div>
        <div className="summary-card alert">
          <h3>Low Stock Items</h3>
          <span className="count">{lowStockItems.length}</span>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="low-stock-section">
          <h3>Items Requiring Restock</h3>
          <div className="stock-table">
            <div className="table-header">
              <div>Item</div>
              <div>Current</div>
              <div>Min Level</div>
              <div>Supplier</div>
              <div>Status</div>
            </div>
            {lowStockItems.map(item => (
              <div key={item.id} className="table-row">
                <div>{item.name}</div>
                <div className="stock-level low">{item.currentStock} {item.unit}</div>
                <div>{item.minStock} {item.unit}</div>
                <div>{item.supplier}</div>
                <div className="status-low">Low Stock</div>
              </div>
            ))}
          </div>
          <button 
            onClick={() => generatePurchaseOrder(lowStockItems)}
            className="btn-primary"
          >
            Generate Purchase Order
          </button>
        </div>
      )}

      <div className="all-inventory">
        <h3>All Inventory Items</h3>
        <div className="stock-table">
          <div className="table-header">
            <div>Item</div>
            <div>Current Stock</div>
            <div>Min Level</div>
            <div>Supplier</div>
            <div>Status</div>
          </div>
          {inventory.map(item => (
            <div key={item.id} className="table-row">
              <div>{item.name}</div>
              <div className={`stock-level ${item.currentStock <= item.minStock ? 'low' : 'good'}`}>
                {item.currentStock} {item.unit}
              </div>
              <div>{item.minStock} {item.unit}</div>
              <div>{item.supplier}</div>
              <div className={`status-${item.currentStock <= item.minStock ? 'low' : 'good'}`}>
                {item.currentStock <= item.minStock ? 'Low Stock' : 'In Stock'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StockChecker;