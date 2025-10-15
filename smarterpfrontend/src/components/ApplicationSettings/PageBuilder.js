import React, { useState } from 'react';
import './PageBuilder.css';

const PageBuilder = () => {
  const [pageData, setPageData] = useState({
    name: '',
    title: '',
    layout: 'Single Column',
    components: '',
    status: 'Active'
  });
  
  const [pages, setPages] = useState([
    { id: 1, name: 'dashboard-page', title: 'Dashboard Overview', layout: 'Grid Layout', components: 'Stats Cards, Charts, Tables', status: 'Active', created: '2024-01-15' },
    { id: 2, name: 'product-catalog', title: 'Product Catalog', layout: 'Card Layout', components: 'Product Cards, Filters, Search', status: 'Active', created: '2024-01-20' },
    { id: 3, name: 'user-profile', title: 'User Profile', layout: 'Single Column', components: 'Profile Form, Avatar, Settings', status: 'Inactive', created: '2024-01-25' }
  ]);
  
  const [editingId, setEditingId] = useState(null);

  const handleInputChange = (e) => {
    setPageData({
      ...pageData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      setPages(pages.map(page => 
        page.id === editingId 
          ? { ...page, ...pageData }
          : page
      ));
      setEditingId(null);
    } else {
      const newPage = {
        id: pages.length + 1,
        ...pageData,
        created: new Date().toISOString().split('T')[0]
      };
      setPages([...pages, newPage]);
    }
    setPageData({ name: '', title: '', layout: 'Single Column', components: '', status: 'Active' });
  };

  const handleEdit = (page) => {
    setPageData({
      name: page.name,
      title: page.title,
      layout: page.layout,
      components: page.components,
      status: page.status
    });
    setEditingId(page.id);
  };

  const handleCancel = () => {
    setPageData({ name: '', title: '', layout: 'Single Column', components: '', status: 'Active' });
    setEditingId(null);
  };

  return (
    <div className="page-builder">
      <div className="page-builder-header">
        <h2>Page Builder</h2>
        <p>Design and manage custom pages for your ERP system</p>
      </div>

      <div className="page-creator">
        <h3>{editingId ? 'Edit Page' : 'Create New Page'}</h3>
        <form onSubmit={handleSubmit} className="page-creator-form">
          <div className="form-row">
            <div className="form-group">
              <label>Page Name *</label>
              <input
                type="text"
                name="name"
                value={pageData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter page name (e.g., dashboard-page)"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={pageData.status} onChange={handleInputChange}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Page Title</label>
              <input
                type="text"
                name="title"
                value={pageData.title}
                onChange={handleInputChange}
                placeholder="Enter page title"
              />
            </div>
            <div className="form-group">
              <label>Layout Type</label>
              <select name="layout" value={pageData.layout} onChange={handleInputChange}>
                <option value="Single Column">Single Column</option>
                <option value="Two Column">Two Column</option>
                <option value="Grid Layout">Grid Layout</option>
                <option value="Card Layout">Card Layout</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Page Components</label>
            <textarea
              name="components"
              value={pageData.components}
              onChange={handleInputChange}
              placeholder="Enter page components (comma separated)"
              rows="3"
            />
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Page' : 'Create Page'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="pages-table-section">
        <h3>Existing Pages</h3>
        <table className="pages-table">
          <thead>
            <tr>
              <th>Page Name</th>
              <th>Title</th>
              <th>Layout</th>
              <th>Components</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(page => (
              <tr key={page.id}>
                <td>{page.name}</td>
                <td>{page.title}</td>
                <td>{page.layout}</td>
                <td>{page.components}</td>
                <td>
                  <span className={`status ${page.status.toLowerCase()}`}>
                    {page.status}
                  </span>
                </td>
                <td>{page.created}</td>
                <td>
                  <button 
                    onClick={() => handleEdit(page)}
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

export default PageBuilder;