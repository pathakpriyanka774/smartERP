import React, { useState } from 'react';
import './Clients.css';

const Clients = () => {
  const [activeTab, setActiveTab] = useState('clients');

  const clients = [
    { id: 1, name: 'ABC Clothing', contact: 'John Smith', email: 'john@abcclothing.com', phone: '+1-555-0123', orders: 15, totalValue: 45000, status: 'Active' },
    { id: 2, name: 'XYZ Apparel', contact: 'Sarah Johnson', email: 'sarah@xyzapparel.com', phone: '+1-555-0124', orders: 8, totalValue: 28000, status: 'Active' },
    { id: 3, name: 'Fashion Hub', contact: 'Mike Wilson', email: 'mike@fashionhub.com', phone: '+1-555-0125', orders: 22, totalValue: 67000, status: 'Active' },
    { id: 4, name: 'Style Co.', contact: 'Emma Davis', email: 'emma@styleco.com', phone: '+1-555-0126', orders: 5, totalValue: 15000, status: 'Inactive' }
  ];

  const vendors = [
    { id: 1, name: 'Cotton Suppliers Inc', contact: 'Robert Brown', email: 'robert@cottonsuppliers.com', phone: '+1-555-0201', category: 'Raw Materials', totalPurchases: 85000, status: 'Active' },
    { id: 2, name: 'Textile Mills Co', contact: 'Lisa Garcia', email: 'lisa@textilemills.com', phone: '+1-555-0202', category: 'Fabrics', totalPurchases: 62000, status: 'Active' },
    { id: 3, name: 'Button & Zipper Ltd', contact: 'David Lee', email: 'david@buttonzipper.com', phone: '+1-555-0203', category: 'Accessories', totalPurchases: 12000, status: 'Active' },
    { id: 4, name: 'Machinery Services', contact: 'Anna Martinez', email: 'anna@machineryservices.com', phone: '+1-555-0204', category: 'Equipment', totalPurchases: 35000, status: 'Active' }
  ];

  return (
    <div className="clients">
      <h1>Clients & Vendors</h1>
      
      <div className="clients-tabs">
        <button 
          className={`tab-btn ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          Clients
        </button>
        <button 
          className={`tab-btn ${activeTab === 'vendors' ? 'active' : ''}`}
          onClick={() => setActiveTab('vendors')}
        >
          Vendors
        </button>
      </div>

      {activeTab === 'clients' && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Clients</h3>
              <div className="stat-value">{clients.length}</div>
            </div>
            <div className="stat-card">
              <h3>Active Clients</h3>
              <div className="stat-value">{clients.filter(c => c.status === 'Active').length}</div>
            </div>
            <div className="stat-card">
              <h3>Total Orders</h3>
              <div className="stat-value">{clients.reduce((sum, c) => sum + c.orders, 0)}</div>
            </div>
            <div className="stat-card">
              <h3>Total Revenue</h3>
              <div className="stat-value">${clients.reduce((sum, c) => sum + c.totalValue, 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="clients-section">
            <div className="section-header">
              <h2>Client List</h2>
              <button className="add-btn">+ Add Client</button>
            </div>
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Contact Person</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Orders</th>
                  <th>Total Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id}>
                    <td>{client.name}</td>
                    <td>{client.contact}</td>
                    <td>{client.email}</td>
                    <td>{client.phone}</td>
                    <td>{client.orders}</td>
                    <td>${client.totalValue.toLocaleString()}</td>
                    <td>
                      <span className={`status ${client.status.toLowerCase()}`}>
                        {client.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'vendors' && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Vendors</h3>
              <div className="stat-value">{vendors.length}</div>
            </div>
            <div className="stat-card">
              <h3>Active Vendors</h3>
              <div className="stat-value">{vendors.filter(v => v.status === 'Active').length}</div>
            </div>
            <div className="stat-card">
              <h3>Categories</h3>
              <div className="stat-value">{new Set(vendors.map(v => v.category)).size}</div>
            </div>
            <div className="stat-card">
              <h3>Total Purchases</h3>
              <div className="stat-value">${vendors.reduce((sum, v) => sum + v.totalPurchases, 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="vendors-section">
            <div className="section-header">
              <h2>Vendor List</h2>
              <button className="add-btn">+ Add Vendor</button>
            </div>
            <table className="vendors-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Contact Person</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Category</th>
                  <th>Total Purchases</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(vendor => (
                  <tr key={vendor.id}>
                    <td>{vendor.name}</td>
                    <td>{vendor.contact}</td>
                    <td>{vendor.email}</td>
                    <td>{vendor.phone}</td>
                    <td>{vendor.category}</td>
                    <td>${vendor.totalPurchases.toLocaleString()}</td>
                    <td>
                      <span className={`status ${vendor.status.toLowerCase()}`}>
                        {vendor.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Clients;