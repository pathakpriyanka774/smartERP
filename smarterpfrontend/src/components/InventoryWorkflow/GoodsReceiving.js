import React, { useState, useEffect } from 'react';
import './InventoryWorkflow.css';

const GoodsReceiving = () => {
  const [approvedOrders, setApprovedOrders] = useState([]);
  const [receivingData, setReceivingData] = useState({});

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    const approved = orders.filter(order => order.status === 'Approved');
    setApprovedOrders(approved);
  }, []);

  const handleQuantityChange = (orderId, itemId, receivedQty) => {
    setReceivingData({
      ...receivingData,
      [`${orderId}-${itemId}`]: parseInt(receivedQty) || 0
    });
  };

  const receiveGoods = (order) => {
    // Update inventory
    const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    const updatedInventory = inventory.map(invItem => {
      const orderItem = order.items.find(item => item.id === invItem.id);
      if (orderItem) {
        const receivedQty = receivingData[`${order.id}-${orderItem.id}`] || orderItem.orderQuantity;
        return {
          ...invItem,
          currentStock: invItem.currentStock + receivedQty
        };
      }
      return invItem;
    });
    
    localStorage.setItem('inventory', JSON.stringify(updatedInventory));

    // Update purchase order status
    const orders = JSON.parse(localStorage.getItem('purchaseOrders') || '[]');
    const updatedOrders = orders.map(o => 
      o.id === order.id ? { ...o, status: 'Received' } : o
    );
    localStorage.setItem('purchaseOrders', JSON.stringify(updatedOrders));

    // Remove from approved orders
    setApprovedOrders(approvedOrders.filter(o => o.id !== order.id));
    
    // Clear receiving data for this order
    const newReceivingData = { ...receivingData };
    order.items.forEach(item => {
      delete newReceivingData[`${order.id}-${item.id}`];
    });
    setReceivingData(newReceivingData);
  };

  return (
    <div className="goods-receiving">
      <h2>Goods Receiving</h2>
      
      {approvedOrders.map(order => (
        <div key={order.id} className="receiving-card">
          <div className="receiving-header">
            <h3>Receive PO #{order.id}</h3>
            <span className="order-date">
              Approved: {new Date(order.createdAt).toLocaleDateString()}
            </span>
          </div>

          <div className="receiving-items">
            <div className="items-header">
              <div>Item</div>
              <div>Ordered Qty</div>
              <div>Received Qty</div>
              <div>Supplier</div>
            </div>
            
            {order.items.map(item => (
              <div key={item.id} className="receiving-row">
                <div>{item.name}</div>
                <div>{item.orderQuantity} {item.unit}</div>
                <div>
                  <input
                    type="number"
                    min="0"
                    max={item.orderQuantity}
                    defaultValue={item.orderQuantity}
                    onChange={(e) => handleQuantityChange(order.id, item.id, e.target.value)}
                    className="qty-input"
                  />
                  <span className="unit">{item.unit}</span>
                </div>
                <div>{item.supplier}</div>
              </div>
            ))}
          </div>

          <div className="receiving-actions">
            <button 
              onClick={() => receiveGoods(order)}
              className="btn-receive"
            >
              Receive Goods
            </button>
          </div>
        </div>
      ))}

      {approvedOrders.length === 0 && (
        <div className="no-orders">
          <p>No approved orders awaiting goods receipt.</p>
        </div>
      )}
    </div>
  );
};

export default GoodsReceiving;