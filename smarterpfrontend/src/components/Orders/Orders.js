import React, { useState } from 'react';
import './Orders.css';
import CreateOrder from '../OrderWorkflow/CreateOrder';
import InvoiceGenerator from '../OrderWorkflow/InvoiceGenerator';

const Orders = () => {
  const [orderData, setOrderData] = useState({
    clientName: '',
    clientType: 'Manufacturing Unit',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    productType: '',
    quantity: '',
    unitPrice: '',
    deliveryDate: '',
    priority: 'Medium',
    status: 'Pending'
  });
  
  const [orders, setOrders] = useState([
    { 
      id: 1001, 
      clientName: 'ABC Clothing Manufacturing', 
      clientType: 'Manufacturing Unit',
      contactPerson: 'John Smith',
      email: 'john@abcclothing.com',
      phone: '+1-555-0123',
      address: '123 Fashion Ave\nNew York, NY 10001\nUnited States',
      productType: 'Cotton T-Shirts', 
      quantity: 5000, 
      unitPrice: 12.50,
      totalAmount: 62500,
      deliveryDate: '2024-05-15',
      priority: 'High',
      status: 'In Production', 
      orderDate: '2024-01-15' 
    },
    { 
      id: 1002, 
      clientName: 'Fashion Forward Wholesale', 
      clientType: 'Wholesale',
      contactPerson: 'Sarah Johnson',
      email: 'sarah@fashionforward.com',
      phone: '+1-555-0456',
      address: '456 Commerce St\nLos Angeles, CA 90210\nUnited States',
      productType: 'Denim Jeans', 
      quantity: 2500, 
      unitPrice: 28.00,
      totalAmount: 70000,
      deliveryDate: '2024-05-20',
      priority: 'Medium',
      status: 'Pending', 
      orderDate: '2024-01-20' 
    },
    { 
      id: 1003, 
      clientName: 'Elite Designer Studio', 
      clientType: 'Designer',
      contactPerson: 'Maria Garcia',
      email: 'maria@elitedesign.com',
      phone: '+1-555-0789',
      address: '789 Design Plaza\nMiami, FL 33101\nUnited States',
      productType: 'Premium Silk Dresses', 
      quantity: 150, 
      unitPrice: 85.00,
      totalAmount: 12750,
      deliveryDate: '2024-05-10',
      priority: 'High',
      status: 'Completed', 
      orderDate: '2024-01-10' 
    }
  ]);
  
  const [editingId, setEditingId] = useState(null);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('legacy');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setOrderData({
      ...orderData,
      [name]: value
    });
  };

  const calculateTotal = () => {
    const quantity = parseFloat(orderData.quantity) || 0;
    const unitPrice = parseFloat(orderData.unitPrice) || 0;
    return quantity * unitPrice;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const totalAmount = calculateTotal();
    
    if (editingId) {
      setOrders(orders.map(order => 
        order.id === editingId 
          ? { ...order, ...orderData, totalAmount }
          : order
      ));
      setEditingId(null);
    } else {
      const newOrder = {
        id: Math.max(...orders.map(o => o.id)) + 1,
        ...orderData,
        quantity: parseInt(orderData.quantity),
        unitPrice: parseFloat(orderData.unitPrice),
        totalAmount,
        orderDate: new Date().toISOString().split('T')[0]
      };
      setOrders([...orders, newOrder]);
    }
    setOrderData({ 
      clientName: '', 
      clientType: 'Manufacturing Unit', 
      contactPerson: '', 
      email: '', 
      phone: '', 
      address: '', 
      productType: '', 
      quantity: '', 
      unitPrice: '', 
      deliveryDate: '', 
      priority: 'Medium', 
      status: 'Pending' 
    });
  };

  const handleEdit = (order) => {
    setOrderData({
      clientName: order.clientName,
      clientType: order.clientType,
      contactPerson: order.contactPerson,
      email: order.email,
      phone: order.phone,
      address: order.address || '',
      productType: order.productType,
      quantity: order.quantity.toString(),
      unitPrice: order.unitPrice.toString(),
      deliveryDate: order.deliveryDate,
      priority: order.priority,
      status: order.status
    });
    setEditingId(order.id);
  };

  const handleCancel = () => {
    setOrderData({ 
      clientName: '', 
      clientType: 'Manufacturing Unit', 
      contactPerson: '', 
      email: '', 
      phone: '', 
      address: '', 
      productType: '', 
      quantity: '', 
      unitPrice: '', 
      deliveryDate: '', 
      priority: 'Medium', 
      status: 'Pending' 
    });
    setEditingId(null);
  };

  return (
    <div className="orders">
      <div className="orders-header">
        <h1>Order Workflow</h1>
        <div className="order-tabs">
          <button 
            className={`tab-btn ${activeTab === 'legacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('legacy')}
          >
            All Orders
          </button>
          <button 
            className={`tab-btn ${activeTab === 'invoice' ? 'active' : ''}`}
            onClick={() => setActiveTab('invoice')}
          >
            Generate Invoice
          </button>
        </div>
      </div>

      {activeTab === 'invoice' && <InvoiceGenerator />}
      {activeTab === 'legacy' && (
      <>
      <div className="order-creator">
        <h3>{editingId ? 'Edit Order' : 'Create New Order'}</h3>
        <form onSubmit={handleSubmit} className="order-form">
          <div className="form-section">
            <h4>Client Information</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Client Name *</label>
                <input
                  type="text"
                  name="clientName"
                  value={orderData.clientName}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter client name"
                />
              </div>
              <div className="form-group">
                <label>Client Type</label>
                <select name="clientType" value={orderData.clientType} onChange={handleInputChange}>
                  <option value="Manufacturing Unit">Manufacturing Unit</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Designer">Designer</option>
                </select>
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Contact Person</label>
                <input
                  type="text"
                  name="contactPerson"
                  value={orderData.contactPerson}
                  onChange={handleInputChange}
                  placeholder="Enter contact person name"
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={orderData.email}
                  onChange={handleInputChange}
                  placeholder="Enter email address"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={orderData.phone}
                  onChange={handleInputChange}
                  placeholder="Enter phone number"
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>Client Address</label>
              <textarea
                name="address"
                value={orderData.address}
                onChange={handleInputChange}
                placeholder="Enter complete client address"
                rows="3"
              />
            </div>
          </div>

          <div className="form-section">
            <h4>Order Details</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Product Type *</label>
                <input
                  type="text"
                  name="productType"
                  value={orderData.productType}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g., Cotton T-Shirts, Denim Jeans"
                />
              </div>
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  name="quantity"
                  value={orderData.quantity}
                  onChange={handleInputChange}
                  required
                  min="1"
                  placeholder="Enter quantity"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Unit Price ($) *</label>
                <input
                  type="number"
                  name="unitPrice"
                  value={orderData.unitPrice}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  placeholder="Enter unit price"
                />
              </div>
              <div className="form-group">
                <label>Total Amount ($)</label>
                <input
                  type="text"
                  value={calculateTotal().toFixed(2)}
                  disabled
                  className="calculated-field"
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Delivery Date *</label>
                <input
                  type="date"
                  name="deliveryDate"
                  value={orderData.deliveryDate}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select name="priority" value={orderData.priority} onChange={handleInputChange}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
            
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={orderData.status} onChange={handleInputChange}>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="In Production">In Production</option>
                <option value="Ready for Delivery">Ready for Delivery</option>
                <option value="Delivered">Delivered</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Order' : 'Create Order'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="orders-table-section">
        <div className="table-header">
          <h3>All Orders</h3>
          <button 
            onClick={() => setIsTableExpanded(!isTableExpanded)}
            className="btn-expand"
          >
            {isTableExpanded ? '📋 Collapse' : '📊 Expand All'}
          </button>
        </div>
        <div className={`table-container ${isTableExpanded ? 'expanded' : 'compact'}`}>
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Client Name</th>
                <th>Product</th>
                <th>Total Amount</th>
                {!isTableExpanded && <th>Status</th>}
                {!isTableExpanded && <th>Actions</th>}
                {isTableExpanded && (
                  <>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Delivery Date</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Actions</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.clientName}</td>
                  <td>{order.productType}</td>
                  <td>${order.totalAmount.toLocaleString()}</td>
                  {!isTableExpanded && (
                    <>
                      <td>
                        <span className={`status ${order.status.toLowerCase().replace(' ', '-')}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => handleEdit(order)}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                  {isTableExpanded && (
                    <>
                      <td>{order.quantity.toLocaleString()}</td>
                      <td>${order.unitPrice.toFixed(2)}</td>
                      <td>{order.deliveryDate}</td>
                      <td>
                        <span className={`status ${order.status.toLowerCase().replace(' ', '-')}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>
                        <span className={`client-type ${order.clientType.toLowerCase().replace(' ', '-')}`}>
                          {order.clientType}
                        </span>
                      </td>
                      <td>
                        <span className={`priority ${order.priority.toLowerCase()}`}>
                          {order.priority}
                        </span>
                      </td>
                      <td>
                        <button 
                          onClick={() => handleEdit(order)}
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

export default Orders;