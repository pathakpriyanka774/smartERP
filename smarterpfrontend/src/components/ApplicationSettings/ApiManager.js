import React, { useState } from 'react';
import './ApiManager.css';

const ApiManager = () => {
  const [apiData, setApiData] = useState({
    name: '',
    endpoint: '',
    method: 'GET',
    description: '',
    authentication: 'None',
    parameters: '',
    responseFormat: 'JSON',
    status: 'Active'
  });
  
  const [apis, setApis] = useState([
    { 
      id: 1, 
      name: 'Get Customers', 
      endpoint: '/api/customers', 
      method: 'GET', 
      description: 'Retrieve all customers', 
      authentication: 'Bearer Token', 
      parameters: 'page, limit',
      responseFormat: 'JSON',
      status: 'Active', 
      created: '2024-01-15' 
    },
    { 
      id: 2, 
      name: 'Create Order', 
      endpoint: '/api/orders', 
      method: 'POST', 
      description: 'Create new order', 
      authentication: 'API Key', 
      parameters: 'customer_id, products, total',
      responseFormat: 'JSON',
      status: 'Active', 
      created: '2024-01-20' 
    },
    { 
      id: 3, 
      name: 'Update Inventory', 
      endpoint: '/api/inventory/{id}', 
      method: 'PUT', 
      description: 'Update inventory item', 
      authentication: 'Bearer Token', 
      parameters: 'quantity, price, location',
      responseFormat: 'JSON',
      status: 'Inactive', 
      created: '2024-01-25' 
    }
  ]);
  
  const [editingId, setEditingId] = useState(null);

  const handleInputChange = (e) => {
    setApiData({
      ...apiData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      setApis(apis.map(api => 
        api.id === editingId 
          ? { ...api, ...apiData }
          : api
      ));
      setEditingId(null);
    } else {
      const newApi = {
        id: apis.length + 1,
        ...apiData,
        created: new Date().toISOString().split('T')[0]
      };
      setApis([...apis, newApi]);
    }
    setApiData({ 
      name: '', 
      endpoint: '', 
      method: 'GET', 
      description: '', 
      authentication: 'None', 
      parameters: '', 
      responseFormat: 'JSON', 
      status: 'Active' 
    });
  };

  const handleEdit = (api) => {
    setApiData({
      name: api.name,
      endpoint: api.endpoint,
      method: api.method,
      description: api.description,
      authentication: api.authentication,
      parameters: api.parameters,
      responseFormat: api.responseFormat,
      status: api.status
    });
    setEditingId(api.id);
  };

  const handleCancel = () => {
    setApiData({ 
      name: '', 
      endpoint: '', 
      method: 'GET', 
      description: '', 
      authentication: 'None', 
      parameters: '', 
      responseFormat: 'JSON', 
      status: 'Active' 
    });
    setEditingId(null);
  };

  return (
    <div className="api-manager">
      <div className="api-manager-header">
        <h2>API Manager</h2>
        <p>Create and manage API endpoints for your ERP system</p>
      </div>

      <div className="api-creator">
        <h3>{editingId ? 'Edit API' : 'Create New API'}</h3>
        <form onSubmit={handleSubmit} className="api-creator-form">
          <div className="form-row">
            <div className="form-group">
              <label>API Name *</label>
              <input
                type="text"
                name="name"
                value={apiData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter API name"
              />
            </div>
            <div className="form-group">
              <label>HTTP Method</label>
              <select name="method" value={apiData.method} onChange={handleInputChange}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Endpoint URL *</label>
              <input
                type="text"
                name="endpoint"
                value={apiData.endpoint}
                onChange={handleInputChange}
                required
                placeholder="/api/endpoint"
              />
            </div>
            <div className="form-group">
              <label>Authentication</label>
              <select name="authentication" value={apiData.authentication} onChange={handleInputChange}>
                <option value="None">None</option>
                <option value="API Key">API Key</option>
                <option value="Bearer Token">Bearer Token</option>
                <option value="Basic Auth">Basic Auth</option>
                <option value="OAuth">OAuth</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={apiData.description}
              onChange={handleInputChange}
              placeholder="Enter API description"
              rows="3"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Parameters</label>
              <textarea
                name="parameters"
                value={apiData.parameters}
                onChange={handleInputChange}
                placeholder="Enter parameters (comma separated)"
                rows="2"
              />
            </div>
            <div className="form-group">
              <label>Response Format</label>
              <select name="responseFormat" value={apiData.responseFormat} onChange={handleInputChange}>
                <option value="JSON">JSON</option>
                <option value="XML">XML</option>
                <option value="Text">Text</option>
                <option value="Binary">Binary</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Status</label>
            <select name="status" value={apiData.status} onChange={handleInputChange}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update API' : 'Create API'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="apis-table-section">
        <h3>Existing APIs</h3>
        <table className="apis-table">
          <thead>
            <tr>
              <th>API Name</th>
              <th>Method</th>
              <th>Endpoint</th>
              <th>Description</th>
              <th>Authentication</th>
              <th>Response Format</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apis.map(api => (
              <tr key={api.id}>
                <td>{api.name}</td>
                <td>
                  <span className={`method ${api.method.toLowerCase()}`}>
                    {api.method}
                  </span>
                </td>
                <td>{api.endpoint}</td>
                <td>{api.description}</td>
                <td>{api.authentication}</td>
                <td>{api.responseFormat}</td>
                <td>
                  <span className={`status ${api.status.toLowerCase()}`}>
                    {api.status}
                  </span>
                </td>
                <td>{api.created}</td>
                <td>
                  <button 
                    onClick={() => handleEdit(api)}
                    className="btn-edit"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ApiManager;