import React, { useState } from 'react';
import './OrderWorkflow.css';

const CreateOrder = ({ onOrderCreated }) => {
  const [order, setOrder] = useState({
    customerName: '',
    customerEmail: '',
    items: [{ product: '', quantity: 1, price: 0 }],
    discount: 0,
    tax: 10
  });

  const addItem = () => {
    setOrder({
      ...order,
      items: [...order.items, { product: '', quantity: 1, price: 0 }]
    });
  };

  const updateItem = (index, field, value) => {
    const updatedItems = [...order.items];
    updatedItems[index][field] = value;
    setOrder({ ...order, items: updatedItems });
  };

  const removeItem = (index) => {
    const updatedItems = order.items.filter((_, i) => i !== index);
    setOrder({ ...order, items: updatedItems });
  };

  const calculateTotal = () => {
    const subtotal = order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const discountAmount = (subtotal * order.discount) / 100;
    const taxAmount = ((subtotal - discountAmount) * order.tax) / 100;
    return subtotal - discountAmount + taxAmount;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newOrder = {
      id: Date.now(),
      ...order,
      total: calculateTotal(),
      status: 'Created',
      createdAt: new Date().toISOString()
    };
    
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    orders.push(newOrder);
    localStorage.setItem('orders', JSON.stringify(orders));
    
    if (onOrderCreated) onOrderCreated(newOrder);
    setOrder({
      customerName: '',
      customerEmail: '',
      items: [{ product: '', quantity: 1, price: 0 }],
      discount: 0,
      tax: 10
    });
  };

  return (
    <div className="create-order">
      <h2>Create New Order</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Customer Name:</label>
            <input
              type="text"
              value={order.customerName}
              onChange={(e) => setOrder({...order, customerName: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Customer Email:</label>
            <input
              type="email"
              value={order.customerEmail}
              onChange={(e) => setOrder({...order, customerEmail: e.target.value})}
              required
            />
          </div>
        </div>

        <div className="items-section">
          <h3>Order Items</h3>
          {order.items.map((item, index) => (
            <div key={index} className="item-row">
              <input
                type="text"
                placeholder="Product Name"
                value={item.product}
                onChange={(e) => updateItem(index, 'product', e.target.value)}
                required
              />
              <input
                type="number"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                min="1"
              />
              <input
                type="number"
                placeholder="Price"
                value={item.price}
                onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value))}
                step="0.01"
              />
              <span className="item-total">${(item.quantity * item.price).toFixed(2)}</span>
              <button type="button" onClick={() => removeItem(index)} className="btn-remove">×</button>
            </div>
          ))}
          <button type="button" onClick={addItem} className="btn-add">+ Add Item</button>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Discount (%):</label>
            <input
              type="number"
              value={order.discount}
              onChange={(e) => setOrder({...order, discount: parseFloat(e.target.value)})}
              min="0"
              max="100"
            />
          </div>
          <div className="form-group">
            <label>Tax (%):</label>
            <input
              type="number"
              value={order.tax}
              onChange={(e) => setOrder({...order, tax: parseFloat(e.target.value)})}
              min="0"
            />
          </div>
          <div className="form-group">
            <label>Total:</label>
            <div className="total-display">${calculateTotal().toFixed(2)}</div>
          </div>
        </div>

        <button type="submit" className="btn-primary">Create Order</button>
      </form>
    </div>
  );
};

export default CreateOrder;