import React, { useState, useEffect } from 'react';
import './Roles.css';

const Roles = () => {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    permissions: []
  });
  const [editingId, setEditingId] = useState(null);
  const [showPermissions, setShowPermissions] = useState(false);

  useEffect(() => {
    // Load permissions
    const savedPermissions = localStorage.getItem('permissions');
    if (savedPermissions) {
      setPermissions(JSON.parse(savedPermissions));
    }

    // Load roles
    const savedRoles = localStorage.getItem('roles');
    if (savedRoles) {
      setRoles(JSON.parse(savedRoles));
    } else {
      // Initialize with default roles
      const defaultRoles = [
        {
          id: 1,
          name: 'Admin',
          description: 'Full system access',
          permissions: ['dashboard_view', 'orders_create', 'orders_edit', 'inventory_view', 'reports_export']
        },
        {
          id: 2,
          name: 'Manager',
          description: 'Management level access',
          permissions: ['dashboard_view', 'orders_create', 'inventory_view', 'reports_export']
        },
        {
          id: 3,
          name: 'Employee',
          description: 'Basic employee access',
          permissions: ['dashboard_view', 'inventory_view']
        }
      ];
      setRoles(defaultRoles);
      localStorage.setItem('roles', JSON.stringify(defaultRoles));
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newRole.name) return;

    const role = {
      id: editingId || Date.now(),
      ...newRole
    };

    let updatedRoles;
    if (editingId) {
      updatedRoles = roles.map(r => r.id === editingId ? role : r);
      setEditingId(null);
    } else {
      updatedRoles = [...roles, role];
    }

    setRoles(updatedRoles);
    localStorage.setItem('roles', JSON.stringify(updatedRoles));
    setNewRole({ name: '', description: '', permissions: [] });
    setShowPermissions(false);
  };

  const handleEdit = (role) => {
    setNewRole(role);
    setEditingId(role.id);
    setShowPermissions(true);
  };

  const handleDelete = (id) => {
    const updatedRoles = roles.filter(r => r.id !== id);
    setRoles(updatedRoles);
    localStorage.setItem('roles', JSON.stringify(updatedRoles));
  };

  const handleCancel = () => {
    setNewRole({ name: '', description: '', permissions: [] });
    setEditingId(null);
    setShowPermissions(false);
  };

  const handlePermissionToggle = (permissionName) => {
    const updatedPermissions = newRole.permissions.includes(permissionName)
      ? newRole.permissions.filter(p => p !== permissionName)
      : [...newRole.permissions, permissionName];
    
    setNewRole({ ...newRole, permissions: updatedPermissions });
  };

  const getPermissionsByModule = () => {
    const grouped = {};
    permissions.forEach(permission => {
      if (!grouped[permission.module]) {
        grouped[permission.module] = [];
      }
      grouped[permission.module].push(permission);
    });
    return grouped;
  };

  return (
    <div className="roles-container">
      <h2>Roles Management</h2>
      
      <div className="roles-form">
        <h3>{editingId ? 'Edit Role' : 'Add New Role'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Role Name:</label>
              <input
                type="text"
                value={newRole.name}
                onChange={(e) => setNewRole({...newRole, name: e.target.value})}
                placeholder="e.g., Manager"
                required
              />
            </div>
            <div className="form-group">
              <label>Description:</label>
              <input
                type="text"
                value={newRole.description}
                onChange={(e) => setNewRole({...newRole, description: e.target.value})}
                placeholder="Role description"
              />
            </div>
          </div>
          
          <div className="permissions-section">
            <button
              type="button"
              onClick={() => setShowPermissions(!showPermissions)}
              className="btn-toggle-permissions"
            >
              {showPermissions ? 'Hide' : 'Show'} Permissions ({newRole.permissions.length} selected)
            </button>
            
            {showPermissions && (
              <div className="permissions-grid">
                {Object.entries(getPermissionsByModule()).map(([module, modulePermissions]) => (
                  <div key={module} className="module-permissions">
                    <h4>{module}</h4>
                    {modulePermissions.map(permission => (
                      <label key={permission.name} className="permission-checkbox">
                        <input
                          type="checkbox"
                          checked={newRole.permissions.includes(permission.name)}
                          onChange={() => handlePermissionToggle(permission.name)}
                        />
                        <span>{permission.action} - {permission.description}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update' : 'Add'} Role
            </button>
            {(editingId || showPermissions) && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="roles-list">
        <h3>Existing Roles ({roles.length})</h3>
        <div className="roles-grid">
          {roles.map(role => (
            <div key={role.id} className="role-card">
              <div className="role-header">
                <h4>{role.name}</h4>
                <div className="role-actions">
                  <button onClick={() => handleEdit(role)} className="btn-edit">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(role.id)} className="btn-delete">
                    Delete
                  </button>
                </div>
              </div>
              <p className="role-description">{role.description}</p>
              <div className="role-permissions">
                <strong>Permissions ({role.permissions.length}):</strong>
                <div className="permissions-list">
                  {role.permissions.map(permissionName => {
                    const permission = permissions.find(p => p.name === permissionName);
                    return permission ? (
                      <span key={permissionName} className="permission-tag">
                        {permission.module}: {permission.action}
                      </span>
                    ) : (
                      <span key={permissionName} className="permission-tag invalid">
                        {permissionName} (Invalid)
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Roles;