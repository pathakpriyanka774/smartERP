import React, { useState, useEffect } from 'react';
import './Templates.css';

const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    type: 'Invoice',
    content: '',
    variables: []
  });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const templateTypes = ['Invoice', 'Email', 'Report', 'Contract'];
  const availableVariables = [
    '{{customerName}}', '{{customerEmail}}', '{{orderDate}}', 
    '{{invoiceNumber}}', '{{total}}', '{{items}}', '{{companyName}}'
  ];

  useEffect(() => {
    const savedTemplates = localStorage.getItem('templates');
    if (savedTemplates) {
      setTemplates(JSON.parse(savedTemplates));
    } else {
      const defaultTemplates = [
        {
          id: 1,
          name: 'Standard Invoice',
          type: 'Invoice',
          content: `Invoice #{{invoiceNumber}}
Date: {{orderDate}}

Bill To:
{{customerName}}
{{customerEmail}}

Items:
{{items}}

Total: {{total}}

Thank you for your business!`,
          variables: ['{{invoiceNumber}}', '{{orderDate}}', '{{customerName}}', '{{customerEmail}}', '{{items}}', '{{total}}']
        },
        {
          id: 2,
          name: 'Order Confirmation Email',
          type: 'Email',
          content: `Dear {{customerName}},

Thank you for your order! We have received your order and it is being processed.

Order Details:
{{items}}
Total: {{total}}

We will notify you once your order ships.

Best regards,
{{companyName}}`,
          variables: ['{{customerName}}', '{{items}}', '{{total}}', '{{companyName}}']
        }
      ];
      setTemplates(defaultTemplates);
      localStorage.setItem('templates', JSON.stringify(defaultTemplates));
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newTemplate.name || !newTemplate.content) return;

    const template = {
      id: editingId || Date.now(),
      ...newTemplate
    };

    let updatedTemplates;
    if (editingId) {
      updatedTemplates = templates.map(t => t.id === editingId ? template : t);
      setEditingId(null);
    } else {
      updatedTemplates = [...templates, template];
    }

    setTemplates(updatedTemplates);
    localStorage.setItem('templates', JSON.stringify(updatedTemplates));
    handleCancel();
  };

  const handleEdit = (template) => {
    setNewTemplate(template);
    setEditingId(template.id);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    const updatedTemplates = templates.filter(t => t.id !== id);
    setTemplates(updatedTemplates);
    localStorage.setItem('templates', JSON.stringify(updatedTemplates));
  };

  const handleCancel = () => {
    setNewTemplate({ name: '', type: 'Invoice', content: '', variables: [] });
    setEditingId(null);
    setShowForm(false);
  };

  const insertVariable = (variable) => {
    setNewTemplate({
      ...newTemplate,
      content: newTemplate.content + variable,
      variables: [...new Set([...newTemplate.variables, variable])]
    });
  };

  return (
    <div className="templates-container">
      <div className="templates-header">
        <h2>Template Management</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Add Template
        </button>
      </div>

      {showForm && (
        <div className="template-form">
          <h3>{editingId ? 'Edit Template' : 'Create New Template'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Template Name:</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({...newTemplate, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Type:</label>
                <select
                  value={newTemplate.type}
                  onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}
                >
                  {templateTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Template Content:</label>
              <textarea
                value={newTemplate.content}
                onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
                rows="10"
                placeholder="Enter your template content here..."
                required
              />
            </div>

            <div className="variables-section">
              <label>Available Variables:</label>
              <div className="variables-list">
                {availableVariables.map(variable => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable)}
                    className="variable-btn"
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update' : 'Create'} Template
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="templates-list">
        <h3>Templates ({templates.length})</h3>
        <div className="templates-grid">
          {templates.map(template => (
            <div key={template.id} className="template-card">
              <div className="template-header">
                <div>
                  <h4>{template.name}</h4>
                  <span className={`type-badge ${template.type.toLowerCase()}`}>
                    {template.type}
                  </span>
                </div>
                <div className="template-actions">
                  <button onClick={() => handleEdit(template)} className="btn-edit">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(template.id)} className="btn-delete">
                    Delete
                  </button>
                </div>
              </div>
              
              <div className="template-content">
                <pre>{template.content.substring(0, 200)}...</pre>
              </div>

              <div className="template-variables">
                <strong>Variables Used:</strong>
                <div className="variables-tags">
                  {template.variables.map(variable => (
                    <span key={variable} className="variable-tag">
                      {variable}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Templates;