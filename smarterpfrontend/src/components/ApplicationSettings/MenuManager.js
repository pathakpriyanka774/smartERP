import React, { useState } from 'react';
import './MenuManager.css';

const MenuManager = () => {
  const [menuData, setMenuData] = useState({
    name: '',
    icon: '',
    parentSection: 'Main Menu',
    url: '',
    order: 1,
    status: 'Active'
  });
  
  const [menus, setMenus] = useState([
    { id: 1, name: 'Dashboard', icon: '🏠', parentSection: 'Main Menu', url: '/dashboard', order: 1, status: 'Active', created: '2024-01-15' },
    { id: 2, name: 'Orders', icon: '📦', parentSection: 'Main Menu', url: '/orders', order: 2, status: 'Active', created: '2024-01-15' },
    { id: 3, name: 'Inventory', icon: '📋', parentSection: 'Main Menu', url: '/inventory', order: 3, status: 'Active', created: '2024-01-15' },
    { id: 4, name: 'Production', icon: '🏭', parentSection: 'Main Menu', url: '/production', order: 4, status: 'Active', created: '2024-01-15' },
    { id: 5, name: 'Expenses & Finance', icon: '💰', parentSection: 'Main Menu', url: '/expenses', order: 5, status: 'Active', created: '2024-01-15' },
    { id: 6, name: 'Clients & Vendors', icon: '👥', parentSection: 'Main Menu', url: '/clients', order: 6, status: 'Active', created: '2024-01-15' },
    { id: 7, name: 'Reports', icon: '📊', parentSection: 'Main Menu', url: '/reports', order: 7, status: 'Active', created: '2024-01-15' },
    { id: 8, name: 'Sales Report', icon: '📈', parentSection: 'Reports', url: '/reports/sales', order: 1, status: 'Active', created: '2024-01-25' },
    { id: 9, name: 'Inventory Report', icon: '📦', parentSection: 'Reports', url: '/reports/inventory', order: 2, status: 'Active', created: '2024-01-25' },
    { id: 10, name: 'Production Report', icon: '🏭', parentSection: 'Reports', url: '/reports/production', order: 3, status: 'Active', created: '2024-01-25' },
    { id: 11, name: 'Financial Report', icon: '💰', parentSection: 'Reports', url: '/reports/financial', order: 4, status: 'Active', created: '2024-01-25' },
    { id: 12, name: 'Form Builder', icon: '📝', parentSection: 'Application Settings', url: '/form-builder', order: 1, status: 'Active', created: '2024-01-20' },
    { id: 13, name: 'Page Builder', icon: '🎨', parentSection: 'Application Settings', url: '/page-builder', order: 2, status: 'Active', created: '2024-01-20' },
    { id: 14, name: 'Menu Manager', icon: '📋', parentSection: 'Application Settings', url: '/menu-manager', order: 3, status: 'Active', created: '2024-01-20' },
    { id: 15, name: 'Form Rules', icon: '⚙️', parentSection: 'Application Settings', url: '/form-rules', order: 4, status: 'Active', created: '2024-01-20' },
    { id: 16, name: 'APIs', icon: '🔗', parentSection: 'Application Settings', url: '/apis', order: 5, status: 'Active', created: '2024-01-20' }
  ]);
  
  const [editingId, setEditingId] = useState(null);

  const handleInputChange = (e) => {
    setMenuData({
      ...menuData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      setMenus(menus.map(menu => 
        menu.id === editingId 
          ? { ...menu, ...menuData }
          : menu
      ));
      setEditingId(null);
    } else {
      const newMenu = {
        id: menus.length + 1,
        ...menuData,
        order: parseInt(menuData.order),
        created: new Date().toISOString().split('T')[0]
      };
      setMenus([...menus, newMenu]);
    }
    setMenuData({ name: '', icon: '', parentSection: 'Main Menu', url: '', order: 1, status: 'Active' });
  };

  const handleEdit = (menu) => {
    setMenuData({
      name: menu.name,
      icon: menu.icon,
      parentSection: menu.parentSection,
      url: menu.url,
      order: menu.order,
      status: menu.status
    });
    setEditingId(menu.id);
  };

  const handleCancel = () => {
    setMenuData({ name: '', icon: '', parentSection: 'Main Menu', url: '', order: 1, status: 'Active' });
    setEditingId(null);
  };

  return (
    <div className="menu-manager">
      <div className="menu-manager-header">
        <h2>Menu Manager</h2>
        <p>Create and manage sidebar navigation menus</p>
      </div>

      <div className="menu-creator">
        <h3>{editingId ? 'Edit Menu Item' : 'Create New Menu Item'}</h3>
        <form onSubmit={handleSubmit} className="menu-creator-form">
          <div className="form-row">
            <div className="form-group">
              <label>Menu Name *</label>
              <input
                type="text"
                name="name"
                value={menuData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter menu name"
              />
            </div>
            <div className="form-group">
              <label>Icon</label>
              <input
                type="text"
                name="icon"
                value={menuData.icon}
                onChange={handleInputChange}
                placeholder="Enter emoji or icon (e.g., 🏠)"
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Parent Section</label>
              <select name="parentSection" value={menuData.parentSection} onChange={handleInputChange}>
                <option value="Main Menu">Main Menu</option>
                <option value="Application Settings">Application Settings</option>
                <option value="Reports">Reports</option>
                <option value="Management">Management</option>
                <option value="Tools">Tools</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={menuData.status} onChange={handleInputChange}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>URL/Route</label>
              <input
                type="text"
                name="url"
                value={menuData.url}
                onChange={handleInputChange}
                placeholder="Enter URL or route (e.g., /dashboard)"
              />
            </div>
            <div className="form-group">
              <label>Display Order</label>
              <input
                type="number"
                name="order"
                value={menuData.order}
                onChange={handleInputChange}
                min="1"
                placeholder="1"
              />
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Menu' : 'Create Menu'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="menus-table-section">
        <h3>Existing Menu Items</h3>
        <table className="menus-table">
          <thead>
            <tr>
              <th>Menu Name</th>
              <th>Icon</th>
              <th>Parent Section</th>
              <th>URL</th>
              <th>Order</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {menus.map(menu => (
              <tr key={menu.id}>
                <td>{menu.name}</td>
                <td>{menu.icon}</td>
                <td>{menu.parentSection}</td>
                <td>{menu.url}</td>
                <td>{menu.order}</td>
                <td>
                  <span className={`status ${menu.status.toLowerCase()}`}>
                    {menu.status}
                  </span>
                </td>
                <td>{menu.created}</td>
                <td>
                  <button 
                    onClick={() => handleEdit(menu)}
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

export default MenuManager;