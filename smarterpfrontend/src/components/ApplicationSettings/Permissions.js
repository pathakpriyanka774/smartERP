import React, { useState, useEffect } from 'react';
import './Permissions.css';

const Permissions = () => {
  const [permissions, setPermissions] = useState([]);
  const [newPermission, setNewPermission] = useState({
    name: '',
    module: '',
    action: '',
    description: ''
  });
  const [editingId, setEditingId] = useState(null);

  const modules = [
    'Dashboard', 'Orders', 'Inventory', 'Production', 
    'Expenses', 'Clients', 'Reports', 'Application Settings'
  ];

  const actions = ['View', 'Create', 'Edit', 'Delete', 'Export', 'Import'];

  useEffect(() => {
    const savedPermissions = localStorage.getItem('permissions');
    if (savedPermissions) {
      setPermissions(JSON.parse(savedPermissions));
    } else {
      // Initialize with default permissions
      const defaultPermissions = [
        { id: 1, name: 'dashboard_view', module: 'Dashboard', action: 'View', description: 'View dashboard' },
        { id: 2, name: 'orders_create', module: 'Orders', action: 'Create', description: 'Create new orders' },
        { id: 3, name: 'orders_edit', module: 'Orders', action: 'Edit', description: 'Edit existing orders' },
        { id: 4, name: 'inventory_view', module: 'Inventory', action: 'View', description: 'View inventory' },
        { id: 5, name: 'reports_export', module: 'Reports', action: 'Export', description: 'Export reports' }
      ];
      setPermissions(defaultPermissions);
      localStorage.setItem('permissions', JSON.stringify(defaultPermissions));
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newPermission.name || !newPermission.module || !newPermission.action) return;

    const permission = {
      id: editingId || Date.now(),
      ...newPermission
    };

    let updatedPermissions;
    if (editingId) {
      updatedPermissions = permissions.map(p => p.id === editingId ? permission : p);
      setEditingId(null);
    } else {
      updatedPermissions = [...permissions, permission];
    }

    setPermissions(updatedPermissions);
    localStorage.setItem('permissions', JSON.stringify(updatedPermissions));
    setNewPermission({ name: '', module: '', action: '', description: '' });
  };

  const handleEdit = (permission) => {
    setNewPermission(permission);
    setEditingId(permission.id);
  };

  const handleDelete = (id) => {
    const updatedPermissions = permissions.filter(p => p.id !== id);
    setPermissions(updatedPermissions);
    localStorage.setItem('permissions', JSON.stringify(updatedPermissions));
  };

  const handleCancel = () => {
    setNewPermission({ name: '', module: '', action: '', description: '' });
    setEditingId(null);
  };

  return (
    <div className="permissions-container">
      <h2>Permissions Management</h2>
      
      <div className="permissions-form">
        <h3>{editingId ? 'Edit Permission' : 'Add New Permission'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Permission Name:</label>
              <input
                type="text"
                value={newPermission.name}
                onChange={(e) => setNewPermission({...newPermission, name: e.target.value})}
                placeholder="e.g., orders_create"
                required
              />
            </div>
            <div className="form-group">
              <label>Module:</label>
              <select
                value={newPermission.module}
                onChange={(e) => setNewPermission({...newPermission, module: e.target.value})}
                required
              >
                <option value="">Select Module</option>
                {modules.map(module => (
                  <option key={module} value={module}>{module}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Action:</label>
              <select
                value={newPermission.action}
                onChange={(e) => setNewPermission({...newPermission, action: e.target.value})}
                required
              >
                <option value="">Select Action</option>
                {actions.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Description:</label>
              <input
                type="text"
                value={newPermission.description}
                onChange={(e) => setNewPermission({...newPermission, description: e.target.value})}
                placeholder="Brief description"
              />
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update' : 'Add'} Permission
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="permissions-list">
        <h3>Existing Permissions ({permissions.length})</h3>
        <div className="permissions-table">
          <div className="table-header">
            <div>Name</div>
            <div>Module</div>
            <div>Action</div>
            <div>Description</div>
            <div>Actions</div>
          </div>
          {permissions.map(permission => (
            <div key={permission.id} className="table-row">
              <div className="permission-name">{permission.name}</div>
              <div className="permission-module">{permission.module}</div>
              <div className="permission-action">{permission.action}</div>
              <div className="permission-description">{permission.description}</div>
              <div className="permission-actions">
                <button onClick={() => handleEdit(permission)} className="btn-edit">
                  Edit
                </button>
                <button onClick={() => handleDelete(permission.id)} className="btn-delete">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Permissions;