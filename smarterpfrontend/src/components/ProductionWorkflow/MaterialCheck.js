import React, { useState, useEffect } from 'react';
import './ProductionWorkflow.css';

const MaterialCheck = ({ selectedOrders, onMaterialsChecked }) => {
  const [inventory, setInventory] = useState([]);
  const [materialRequirements, setMaterialRequirements] = useState([]);
  const [availability, setAvailability] = useState({});

  useEffect(() => {
    const savedInventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    setInventory(savedInventory);
    
    if (selectedOrders.length > 0) {
      calculateMaterialRequirements();
    }
  }, [selectedOrders]);

  const calculateMaterialRequirements = () => {
    const requirements = [
      { material: 'Cotton Fabric', required: 100, unit: 'yards' },
      { material: 'Polyester Thread', required: 20, unit: 'spools' },
      { material: 'Buttons', required: 50, unit: 'pieces' },
      { material: 'Zippers', required: 10, unit: 'pieces' }
    ];
    
    setMaterialRequirements(requirements);
    checkAvailability(requirements);
  };

  const checkAvailability = (requirements) => {
    const availabilityStatus = {};
    
    requirements.forEach(req => {
      const inventoryItem = inventory.find(item => 
        item.name?.toLowerCase().includes(req.material.toLowerCase()) ||
        item.itemName?.toLowerCase().includes(req.material.toLowerCase())
      );
      
      if (inventoryItem) {
        const available = inventoryItem.quantity || inventoryItem.currentStock || 0;
        availabilityStatus[req.material] = {
          available,
          required: req.required,
          sufficient: available >= req.required,
          shortage: Math.max(0, req.required - available)
        };
      } else {
        availabilityStatus[req.material] = {
          available: 0,
          required: req.required,
          sufficient: false,
          shortage: req.required
        };
      }
    });
    
    setAvailability(availabilityStatus);
  };

  const allMaterialsAvailable = () => {
    return Object.values(availability).every(item => item.sufficient);
  };

  const proceedToScheduling = () => {
    if (onMaterialsChecked) onMaterialsChecked(availability);
  };

  return (
    <div className="material-check">
      <h2>Material Availability Check</h2>
      
      <div className="selected-orders">
        <h3>Selected Orders ({selectedOrders.length})</h3>
        {selectedOrders.map(order => (
          <div key={order.id} className="order-summary">
            Order #{order.id} - {order.customerName} - {order.items?.length || 'N/A'} items
          </div>
        ))}
      </div>

      <div className="material-requirements">
        <h3>Material Requirements</h3>
        <div className="materials-table">
          <div className="table-header">
            <div>Material</div>
            <div>Required</div>
            <div>Available</div>
            <div>Status</div>
            <div>Shortage</div>
          </div>
          
          {materialRequirements.map(req => {
            const avail = availability[req.material];
            return (
              <div key={req.material} className="material-row">
                <div>{req.material}</div>
                <div>{req.required} {req.unit}</div>
                <div>{avail?.available || 0} {req.unit}</div>
                <div>
                  <span className={`status ${avail?.sufficient ? 'available' : 'shortage'}`}>
                    {avail?.sufficient ? 'Available' : 'Shortage'}
                  </span>
                </div>
                <div>
                  {avail?.shortage > 0 && (
                    <span className="shortage-amount">{avail.shortage} {req.unit}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="material-summary">
        {allMaterialsAvailable() ? (
          <div className="success-message">
            ✅ All materials are available for production
          </div>
        ) : (
          <div className="warning-message">
            ⚠️ Some materials are in shortage. Consider restocking before production.
          </div>
        )}
      </div>

      <div className="action-section">
        <button 
          onClick={proceedToScheduling} 
          className={`btn-primary ${!allMaterialsAvailable() ? 'btn-warning' : ''}`}
        >
          {allMaterialsAvailable() ? 'Proceed to Scheduling' : 'Proceed with Shortages'}
        </button>
      </div>
    </div>
  );
};

export default MaterialCheck;