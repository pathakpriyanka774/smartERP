import React, { useState, useEffect } from 'react';
import './ProductionWorkflow.css';

const OrderReview = ({ onOrderSelected }) => {
  const [orders, setOrders] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);

  useEffect(() => {
    const savedOrders = JSON.parse(localStorage.getItem('orders') || '[]');
    const confirmedOrders = savedOrders.filter(order => 
      order.status === 'Confirmed' || order.status === 'Invoiced'
    );
    setOrders(confirmedOrders);
  }, []);

  const selectOrder = (order) => {
    if (selectedOrders.find(o => o.id === order.id)) {
      setSelectedOrders(selectedOrders.filter(o => o.id !== order.id));
    } else {
      setSelectedOrders([...selectedOrders, order]);
    }
  };

  const proceedToPlanning = () => {
    if (onOrderSelected) onOrderSelected(selectedOrders);
  };

  return (
    <div className="order-review">
      <h2>Review Orders for Production</h2>
      
      <div className="orders-summary">
        <div className="summary-item">
          <span>Available Orders: {orders.length}</span>
        </div>
        <div className="summary-item">
          <span>Selected: {selectedOrders.length}</span>
        </div>
      </div>

      <div className="orders-list">
        {orders.map(order => (
          <div 
            key={order.id} 
            className={`order-item ${selectedOrders.find(o => o.id === order.id) ? 'selected' : ''}`}
            onClick={() => selectOrder(order)}
          >
            <div className="order-header">
              <h4>Order #{order.id}</h4>
              <span className="order-status">{order.status}</span>
            </div>
            <div className="order-details">
              <p><strong>Customer:</strong> {order.customerName}</p>
              <p><strong>Items:</strong> {order.items?.length || 'N/A'}</p>
              <p><strong>Total:</strong> ${order.total?.toFixed(2) || order.totalAmount?.toLocaleString()}</p>
              <p><strong>Delivery:</strong> {order.deliveryDate}</p>
            </div>
          </div>
        ))}
      </div>

      {selectedOrders.length > 0 && (
        <div className="action-section">
          <button onClick={proceedToPlanning} className="btn-primary">
            Proceed to Production Planning ({selectedOrders.length} orders)
          </button>
        </div>
      )}

      {orders.length === 0 && (
        <div className="no-orders">
          <p>No confirmed orders available for production planning.</p>
        </div>
      )}
    </div>
  );
};

export default OrderReview;