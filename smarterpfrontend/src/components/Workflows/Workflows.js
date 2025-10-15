import React, { useState, useEffect } from 'react';
import './Workflows.css';

const Workflows = () => {
  const [workflows, setWorkflows] = useState([]);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    module: '',
    steps: [],
    status: 'Active'
  });
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const modules = ['Orders', 'Inventory', 'Production', 'Expenses', 'Clients', 'Reports'];
  const statuses = ['Active', 'Inactive', 'Draft'];

  useEffect(() => {
    const savedWorkflows = localStorage.getItem('workflows');
    if (savedWorkflows) {
      setWorkflows(JSON.parse(savedWorkflows));
    } else {
      const defaultWorkflows = [
        {
          id: 1,
          name: 'Order Processing',
          description: 'Complete order processing workflow',
          module: 'Orders',
          status: 'Active',
          steps: ['Create Order', 'Validate Inventory', 'Generate Invoice', 'Ship Order', 'Update Status']
        },
        {
          id: 2,
          name: 'Inventory Restock',
          description: 'Automatic inventory restocking process',
          module: 'Inventory',
          status: 'Active',
          steps: ['Check Stock Levels', 'Generate Purchase Order', 'Approve Order', 'Receive Goods', 'Update Inventory']
        },
        {
          id: 3,
          name: 'Production Planning',
          description: 'Production scheduling and planning workflow',
          module: 'Production',
          status: 'Active',
          steps: ['Review Orders', 'Check Materials', 'Schedule Production', 'Assign Resources', 'Start Production']
        }
      ];
      setWorkflows(defaultWorkflows);
      localStorage.setItem('workflows', JSON.stringify(defaultWorkflows));
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newWorkflow.name || !newWorkflow.module) return;

    const workflow = {
      id: editingId || Date.now(),
      ...newWorkflow,
      steps: newWorkflow.steps.filter(step => step.trim() !== '')
    };

    let updatedWorkflows;
    if (editingId) {
      updatedWorkflows = workflows.map(w => w.id === editingId ? workflow : w);
      setEditingId(null);
    } else {
      updatedWorkflows = [...workflows, workflow];
    }

    setWorkflows(updatedWorkflows);
    localStorage.setItem('workflows', JSON.stringify(updatedWorkflows));
    handleCancel();
  };

  const handleEdit = (workflow) => {
    setNewWorkflow(workflow);
    setEditingId(workflow.id);
    setShowForm(true);
  };

  const handleDelete = (id) => {
    const updatedWorkflows = workflows.filter(w => w.id !== id);
    setWorkflows(updatedWorkflows);
    localStorage.setItem('workflows', JSON.stringify(updatedWorkflows));
  };

  const handleCancel = () => {
    setNewWorkflow({ name: '', description: '', module: '', steps: [], status: 'Active' });
    setEditingId(null);
    setShowForm(false);
  };

  const addStep = () => {
    setNewWorkflow({ ...newWorkflow, steps: [...newWorkflow.steps, ''] });
  };

  const updateStep = (index, value) => {
    const updatedSteps = [...newWorkflow.steps];
    updatedSteps[index] = value;
    setNewWorkflow({ ...newWorkflow, steps: updatedSteps });
  };

  const removeStep = (index) => {
    const updatedSteps = newWorkflow.steps.filter((_, i) => i !== index);
    setNewWorkflow({ ...newWorkflow, steps: updatedSteps });
  };

  return (
    <div className="workflows-container">
      <div className="workflows-header">
        <h2>Workflow Management</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          + Add Workflow
        </button>
      </div>

      {showForm && (
        <div className="workflow-form">
          <h3>{editingId ? 'Edit Workflow' : 'Create New Workflow'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Workflow Name:</label>
                <input
                  type="text"
                  value={newWorkflow.name}
                  onChange={(e) => setNewWorkflow({...newWorkflow, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Module:</label>
                <select
                  value={newWorkflow.module}
                  onChange={(e) => setNewWorkflow({...newWorkflow, module: e.target.value})}
                  required
                >
                  <option value="">Select Module</option>
                  {modules.map(module => (
                    <option key={module} value={module}>{module}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Status:</label>
                <select
                  value={newWorkflow.status}
                  onChange={(e) => setNewWorkflow({...newWorkflow, status: e.target.value})}
                >
                  {statuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="form-group">
              <label>Description:</label>
              <textarea
                value={newWorkflow.description}
                onChange={(e) => setNewWorkflow({...newWorkflow, description: e.target.value})}
                rows="3"
              />
            </div>

            <div className="steps-section">
              <label>Workflow Steps:</label>
              {newWorkflow.steps.map((step, index) => (
                <div key={index} className="step-input">
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    placeholder={`Step ${index + 1}`}
                  />
                  <button type="button" onClick={() => removeStep(index)} className="btn-remove">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={addStep} className="btn-add-step">
                + Add Step
              </button>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update' : 'Create'} Workflow
              </button>
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="workflows-list">
        <h3>Workflows ({workflows.length})</h3>
        <div className="workflows-grid">
          {workflows.map(workflow => (
            <div key={workflow.id} className="workflow-card">
              <div className="workflow-header">
                <div>
                  <h4>{workflow.name}</h4>
                  <span className={`status-badge ${workflow.status.toLowerCase()}`}>
                    {workflow.status}
                  </span>
                </div>
                <div className="workflow-actions">
                  <button onClick={() => handleEdit(workflow)} className="btn-edit">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(workflow.id)} className="btn-delete">
                    Delete
                  </button>
                </div>
              </div>
              
              <div className="workflow-info">
                <p><strong>Module:</strong> {workflow.module}</p>
                <p><strong>Description:</strong> {workflow.description}</p>
              </div>

              <div className="workflow-steps">
                <strong>Steps ({workflow.steps.length}):</strong>
                <ol>
                  {workflow.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Workflows;