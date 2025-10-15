import React, { useState, useEffect } from 'react';
import './UserManagement.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user',
    permissions: []
  });

  const availablePermissions = [
    { id: 'dashboard', label: 'Dashboard Access' },
    { id: 'orders', label: 'Orders Management' },
    { id: 'inventory', label: 'Inventory Management' },
    { id: 'production', label: 'Production Management' },
    { id: 'expenses', label: 'Expenses & Finance' },
    { id: 'clients', label: 'Clients & Vendors' },
    { id: 'reports', label: 'Reports Access' },
    { id: 'user-management', label: 'User Management' },
    { id: 'settings', label: 'Application Settings' }
  ];

  const rolePermissions = {
    admin: ['dashboard', 'orders', 'inventory', 'production', 'expenses', 'clients', 'reports', 'user-management', 'settings'],
    manager: ['dashboard', 'orders', 'inventory', 'production', 'expenses', 'clients', 'reports'],
    user: ['dashboard', 'orders', 'inventory']
  };

  useEffect(() => {
    const storedUsers = JSON.parse(localStorage.getItem('users') || '[]');
    setUsers(storedUsers);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      permissions: name === 'role' ? rolePermissions[value] || [] : prev.permissions
    }));
  };

  const handlePermissionChange = (permissionId) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permissionId)
        ? prev.permissions.filter(p => p !== permissionId)
        : [...prev.permissions, permissionId]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const updatedUsers = [...users];
    
    if (editingUser) {
      const index = users.findIndex(u => u.id === editingUser.id);
      updatedUsers[index] = { ...editingUser, ...formData };
    } else {
      const newUser = {
        id: Date.now(),
        ...formData,
        createdAt: new Date().toISOString(),
        status: 'Active'
      };
      updatedUsers.push(newUser);
    }
    
    setUsers(updatedUsers);
    localStorage.setItem('users', JSON.stringify(updatedUsers));
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', email: '', role: 'user', permissions: [] });
    setShowForm(false);
    setEditingUser(null);
  };

  const handleEdit = (user) => {
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions || rolePermissions[user.role] || []
    });
    setEditingUser(user);
    setShowForm(true);
  };

  const handleDelete = (userId) => {
    const updatedUsers = users.filter(u => u.id !== userId);
    setUsers(updatedUsers);
    localStorage.setItem('users', JSON.stringify(updatedUsers));
  };

  return (
    <div className="user-management">
      <div className="user-management-header">
        <h2>User Management</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Add User
        </button>
      </div>

      {showForm && (
        <div className="user-form-modal">
          <div className="user-form">
            <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Role</label>
                <select name="role" value={formData.role} onChange={handleInputChange}>
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="form-group">
                <label>Permissions</label>
                <div className="permissions-grid">
                  {availablePermissions.map(permission => (
                    <label key={permission.id} className="permission-item">
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(permission.id)}
                        onChange={() => handlePermissionChange(permission.id)}
                      />
                      {permission.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="users-table-section">
        <table className="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  <div className="permissions-list">
                    {(user.permissions || rolePermissions[user.role] || []).slice(0, 3).map(p => (
                      <span key={p} className="permission-tag">
                        {availablePermissions.find(ap => ap.id === p)?.label.split(' ')[0]}
                      </span>
                    ))}
                    {(user.permissions || rolePermissions[user.role] || []).length > 3 && (
                      <span className="permission-tag">+{(user.permissions || rolePermissions[user.role] || []).length - 3}</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="status active">Active</span>
                </td>
                <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</td>
                <td>
                  <button onClick={() => handleEdit(user)} className="btn-edit">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="btn-delete">
                    Delete
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

export default UserManagement;