import React, { useState } from 'react';
import './FormBuilder.css';

const FormBuilder = () => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fields: '',
    status: 'Active'
  });
  
  const [forms, setForms] = useState([
    { id: 1, name: 'Customer Registration', description: 'Form for new customer registration', fields: 'Name, Email, Phone, Address', status: 'Active', created: '2024-01-15' },
    { id: 2, name: 'Order Form', description: 'Product order submission form', fields: 'Product, Quantity, Delivery Date', status: 'Active', created: '2024-01-20' },
    { id: 3, name: 'Feedback Form', description: 'Customer feedback collection', fields: 'Rating, Comments, Suggestions', status: 'Inactive', created: '2024-01-25' }
  ]);
  
  const [editingId, setEditingId] = useState(null);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      setForms(forms.map(form => 
        form.id === editingId 
          ? { ...form, ...formData }
          : form
      ));
      setEditingId(null);
    } else {
      const newForm = {
        id: forms.length + 1,
        ...formData,
        created: new Date().toISOString().split('T')[0]
      };
      setForms([...forms, newForm]);
    }
    setFormData({ name: '', description: '', fields: '', status: 'Active' });
  };

  const handleEdit = (form) => {
    setFormData({
      name: form.name,
      description: form.description,
      fields: form.fields,
      status: form.status
    });
    setEditingId(form.id);
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '', fields: '', status: 'Active' });
    setEditingId(null);
  };

  return (
    <div className="form-builder">
      <div className="form-builder-header">
        <h2>Form Builder</h2>
        <p>Create and manage custom forms for your ERP system</p>
      </div>

      <div className="form-creator">
        <h3>{editingId ? 'Edit Form' : 'Create New Form'}</h3>
        <form onSubmit={handleSubmit} className="form-creator-form">
          <div className="form-row">
            <div className="form-group">
              <label>Form Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter form name"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={formData.status} onChange={handleInputChange}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Enter form description"
              rows="3"
            />
          </div>
          
          <div className="form-group">
            <label>Form Fields</label>
            <textarea
              name="fields"
              value={formData.fields}
              onChange={handleInputChange}
              placeholder="Enter form fields (comma separated)"
              rows="3"
            />
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Form' : 'Create Form'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="forms-table-section">
        <h3>Existing Forms</h3>
        <table className="forms-table">
          <thead>
            <tr>
              <th>Form Name</th>
              <th>Description</th>
              <th>Fields</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {forms.map(form => (
              <tr key={form.id}>
                <td>{form.name}</td>
                <td>{form.description}</td>
                <td>{form.fields}</td>
                <td>
                  <span className={`status ${form.status.toLowerCase()}`}>
                    {form.status}
                  </span>
                </td>
                <td>{form.created}</td>
                <td>
                  <button 
                    onClick={() => handleEdit(form)}
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

export default FormBuilder;