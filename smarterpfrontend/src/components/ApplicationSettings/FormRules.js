import React, { useState } from 'react';
import './FormRules.css';

const FormRules = () => {
  const [ruleData, setRuleData] = useState({
    pageName: '',
    formName: '',
    sourceColumn: '',
    sourceValue: '',
    targetColumn: '',
    action: 'Show Options',
    targetOptions: '',
    status: 'Active'
  });
  
  const [rules, setRules] = useState([
    { 
      id: 1, 
      pageName: 'Customer Registration', 
      formName: 'Customer Form', 
      sourceColumn: 'Customer Type', 
      sourceValue: 'Corporate', 
      targetColumn: 'Payment Terms', 
      action: 'Show Options',
      targetOptions: '30 Days, 60 Days, 90 Days',
      status: 'Active', 
      created: '2024-01-15' 
    },
    { 
      id: 2, 
      pageName: 'Order Management', 
      formName: 'Order Form', 
      sourceColumn: 'Product Category', 
      sourceValue: 'Electronics', 
      targetColumn: 'Warranty Period', 
      action: 'Show Options',
      targetOptions: '1 Year, 2 Years, 3 Years',
      status: 'Active', 
      created: '2024-01-20' 
    },
    { 
      id: 3, 
      pageName: 'Inventory', 
      formName: 'Product Form', 
      sourceColumn: 'Item Type', 
      sourceValue: 'Raw Material', 
      targetColumn: 'Storage Location', 
      action: 'Hide Field',
      targetOptions: '',
      status: 'Inactive', 
      created: '2024-01-25' 
    }
  ]);
  
  const [editingId, setEditingId] = useState(null);

  const handleInputChange = (e) => {
    setRuleData({
      ...ruleData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingId) {
      setRules(rules.map(rule => 
        rule.id === editingId 
          ? { ...rule, ...ruleData }
          : rule
      ));
      setEditingId(null);
    } else {
      const newRule = {
        id: rules.length + 1,
        ...ruleData,
        created: new Date().toISOString().split('T')[0]
      };
      setRules([...rules, newRule]);
    }
    setRuleData({ 
      pageName: '', 
      formName: '', 
      sourceColumn: '', 
      sourceValue: '', 
      targetColumn: '', 
      action: 'Show Options', 
      targetOptions: '', 
      status: 'Active' 
    });
  };

  const handleEdit = (rule) => {
    setRuleData({
      pageName: rule.pageName,
      formName: rule.formName,
      sourceColumn: rule.sourceColumn,
      sourceValue: rule.sourceValue,
      targetColumn: rule.targetColumn,
      action: rule.action,
      targetOptions: rule.targetOptions,
      status: rule.status
    });
    setEditingId(rule.id);
  };

  const handleCancel = () => {
    setRuleData({ 
      pageName: '', 
      formName: '', 
      sourceColumn: '', 
      sourceValue: '', 
      targetColumn: '', 
      action: 'Show Options', 
      targetOptions: '', 
      status: 'Active' 
    });
    setEditingId(null);
  };

  return (
    <div className="form-rules">
      <div className="form-rules-header">
        <h2>Form Rules</h2>
        <p>Create conditional logic and field dependencies for your forms</p>
      </div>

      <div className="rule-creator">
        <h3>{editingId ? 'Edit Form Rule' : 'Create New Form Rule'}</h3>
        <form onSubmit={handleSubmit} className="rule-creator-form">
          <div className="form-row">
            <div className="form-group">
              <label>Page Name *</label>
              <input
                type="text"
                name="pageName"
                value={ruleData.pageName}
                onChange={handleInputChange}
                required
                placeholder="Enter page name"
              />
            </div>
            <div className="form-group">
              <label>Form Name *</label>
              <input
                type="text"
                name="formName"
                value={ruleData.formName}
                onChange={handleInputChange}
                required
                placeholder="Enter form name"
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Source Column/Field *</label>
              <input
                type="text"
                name="sourceColumn"
                value={ruleData.sourceColumn}
                onChange={handleInputChange}
                required
                placeholder="Field that triggers the rule"
              />
            </div>
            <div className="form-group">
              <label>Source Value *</label>
              <input
                type="text"
                name="sourceValue"
                value={ruleData.sourceValue}
                onChange={handleInputChange}
                required
                placeholder="Value that triggers the rule"
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Target Column/Field *</label>
              <input
                type="text"
                name="targetColumn"
                value={ruleData.targetColumn}
                onChange={handleInputChange}
                required
                placeholder="Field to be affected"
              />
            </div>
            <div className="form-group">
              <label>Action</label>
              <select name="action" value={ruleData.action} onChange={handleInputChange}>
                <option value="Show Options">Show Options</option>
                <option value="Hide Options">Hide Options</option>
                <option value="Show Field">Show Field</option>
                <option value="Hide Field">Hide Field</option>
                <option value="Make Required">Make Required</option>
                <option value="Make Optional">Make Optional</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Target Options/Values</label>
              <textarea
                name="targetOptions"
                value={ruleData.targetOptions}
                onChange={handleInputChange}
                placeholder="Enter options (comma separated) or leave empty for field actions"
                rows="3"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select name="status" value={ruleData.status} onChange={handleInputChange}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update Rule' : 'Create Rule'}
            </button>
            {editingId && (
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="rules-table-section">
        <h3>Existing Form Rules</h3>
        <table className="rules-table">
          <thead>
            <tr>
              <th>Page Name</th>
              <th>Form Name</th>
              <th>Source Field</th>
              <th>Source Value</th>
              <th>Target Field</th>
              <th>Action</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id}>
                <td>{rule.pageName}</td>
                <td>{rule.formName}</td>
                <td>{rule.sourceColumn}</td>
                <td>{rule.sourceValue}</td>
                <td>{rule.targetColumn}</td>
                <td>{rule.action}</td>
                <td>
                  <span className={`status ${rule.status.toLowerCase()}`}>
                    {rule.status}
                  </span>
                </td>
                <td>{rule.created}</td>
                <td>
                  <button 
                    onClick={() => handleEdit(rule)}
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

export default FormRules;