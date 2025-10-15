import React, { useState, useEffect } from 'react';
import './InventoryWorkflow.css';

const PurchaseOrders = ({ onOrderApproved }) => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    const savedOrders = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    setPurchaseOrders(savedOrders);
  }, []);

  const approveOrder = (orderId) => {
    const updatedOrders = purchaseOrders.map(order => 
      order.id === orderId ? { ...order, status: 'Approved' } : order
    );
    setPurchaseOrders(updatedOrders);
    localStorage.setItem('purchaseOrders', JSON.stringify(updatedOrders));
    
    if (onOrderApproved) {
      const approvedOrder = updatedOrders.find(order => order.id === orderId);
      onOrderApproved(approvedOrder);
    }
  };

  const rejectOrder = (orderId) => {
    const updatedOrders = purchaseOrders.map(order => 
      order.id === orderId ? { ...order, status: 'Rejected' } : order
    );
    setPurchaseOrders(updatedOrders);
    localStorage.setItem('purchaseOrders', JSON.stringify(updatedOrders));
  };

  const calculateTotal = (order) => {
    return order.items.reduce((total, item) => total + (item.orderQuantity * 10), 0); // Assuming $10 per unit
  };

  return (
    <div className="purchase-orders">
      <h2>Purchase Orders</h2>
      
      <div className="orders-list">
        {purchaseOrders.map(order => (
          <div key={order.id} className="order-card">
            <div className="order-header">
              <h3>PO #{order.id}</h3>
              <span className={`status-badge ${order.status.toLowerCase()}`}>
                {order.status}
              </span>
            </div>
            
            <div className="order-details">
              <p><strong>Created:</strong> {new Date(order.createdAt).toLocaleDateString()}</p>
              <p><strong>Items:</strong> {order.items.length}</p>
              <p><strong>Total:</strong> ${calculateTotal(order)}</p>
            </div>

            <div className="order-items">
              <h4>Items:</h4>
              {order.items.map(item => (
                <div key={item.id} className="item-row">
                  <span>{item.name}</span>
                  <span>{item.orderQuantity} {item.unit}</span>
                  <span>{item.supplier}</span>
                </div>
              ))}
            </div>

            {order.status === 'Pending' && (
              <div className="order-actions">
                <button 
                  onClick={() => approveOrder(order.id)}
                  className="btn-approve"
                >
                  Approve
                </button>
                <button 
                  onClick={() => rejectOrder(order.id)}
                  className="btn-reject"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {purchaseOrders.length === 0 && (
        <div className="no-orders">
          <p>No purchase orders found. Check stock levels to generate orders.</p>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrders;