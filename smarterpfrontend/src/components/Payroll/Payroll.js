import React, { useState, useEffect } from 'react';
import { payrollAPI } from '../../services/api';
import './Payroll.css';

const Payroll = () => {
  const [activeTab, setActiveTab] = useState('employees');
  const [employees, setEmployees] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [stats, setStats] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingEmployee, setEditingEmployee] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [empRes, payRes, statsRes] = await Promise.all([
        payrollAPI.getEmployees(),
        payrollAPI.getPayrolls(),
        payrollAPI.getStats()
      ]);
      console.log('Employees data:', empRes.data.data);
      setEmployees(empRes.data.data || []);
      setPayrolls(payRes.data.data || []);
      setStats(statsRes.data || {});
    } catch (error) {
      console.error('Error loading data:', error);
      setEmployees([]);
      setPayrolls([]);
      setStats({});
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (activeTab === 'employees') {
        if (editingEmployee) {
          await payrollAPI.updateEmployee(editingEmployee.id, formData);
        } else {
          await payrollAPI.createEmployee(formData);
        }
      } else {
        await payrollAPI.createPayroll(formData);
      }
      setShowForm(false);
      setFormData({});
      setEditingEmployee(null);
      loadData();
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  const handleEdit = (employee) => {
    setEditingEmployee(employee);
    setFormData({
      name: employee.Name || employee.name,
      email: employee.Email || employee.email,
      phone: employee.Phone || employee.phone,
      position: employee.Position || employee.position,
      department: employee.Department || employee.department,
      joiningDate: employee.JoiningDate ? employee.JoiningDate.split('T')[0] : '',
      baseSalary: employee.BaseSalary || employee.baseSalary,
      ctc: employee.CTC || employee.ctc,
      tasks: employee.Tasks || employee.tasks,
      address: employee.Address || employee.address,
      emergencyContact: employee.EmergencyContact || employee.emergencyContact
    });
    setShowForm(true);
  };

  const autoGeneratePayroll = async () => {
    const month = prompt('Enter month (YYYY-MM):');
    if (month) {
      try {
        const response = await payrollAPI.autoGeneratePayroll(month);
        alert(response.data.message);
        loadData();
      } catch (error) {
        console.error('Error generating payroll:', error);
        alert('Error generating payroll');
      }
    }
  };

  const updatePayrollStatus = async (id, status) => {
    try {
      await payrollAPI.updatePayroll(id, { status });
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  return (
    <div className="payroll">
      <div className="payroll-header">
        <h1>👥 Employee & Payroll Management</h1>
        <div className="payroll-tabs">
          <button 
            className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            Employee Onboarding
          </button>
          <button 
            className={`tab-btn ${activeTab === 'payroll' ? 'active' : ''}`}
            onClick={() => setActiveTab('payroll')}
          >
            Payroll Management
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="payroll-stats">
        <div className="stat-card">
          <h3>Total Employees</h3>
          <div className="stat-value">{stats.totalEmployees || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Active Employees</h3>
          <div className="stat-value">{stats.activeEmployees || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Total CTC</h3>
          <div className="stat-value">${stats.totalCTC || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Pending Payrolls</h3>
          <div className="stat-value warning">{stats.pendingPayrolls || 0}</div>
        </div>
      </div>

      {/* Employees Tab */}
      {activeTab === 'employees' && (
        <div className="employees-section">
          <div className="section-header">
            <h3>👤 Employee Directory</h3>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Onboard Employee
            </button>
          </div>
          
          <div className="table-container">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Joining Date</th>
                  <th>Base Salary</th>
                  <th>CTC</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{textAlign: 'center', padding: '20px'}}>
                      No employees found. Add an employee to get started.
                    </td>
                  </tr>
                ) : (
                  employees.map(emp => (
                    <tr key={emp.EmployeeID || emp.id}>
                      <td>
                        <div className="employee-info">
                          <strong>{emp.Name || emp.name}</strong>
                          <small>{emp.Phone || emp.phone}</small>
                        </div>
                      </td>
                      <td>{emp.Email || emp.email}</td>
                      <td>{emp.Position || emp.position}</td>
                      <td>{emp.Department || emp.department}</td>
                      <td>{emp.JoiningDate ? new Date(emp.JoiningDate).toLocaleDateString() : 'N/A'}</td>
                      <td>${emp.BaseSalary || emp.baseSalary}</td>
                      <td>${emp.CTC || emp.ctc}</td>
                      <td><span className={`status ${emp.Status || emp.status}`}>{emp.Status || emp.status}</span></td>
                      <td>
                        <button className="btn-edit" onClick={() => handleEdit(emp)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payroll Tab */}
      {activeTab === 'payroll' && (
        <div className="payroll-section">
          <div className="section-header">
            <h3>💰 Payroll Processing</h3>
            <div className="payroll-actions">
              <button className="btn-auto-generate" onClick={autoGeneratePayroll}>
                <span className="icon">🔄</span>
                Auto Generate Payroll
              </button>
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                <span className="icon">+</span>
                Manual Entry
              </button>
            </div>
          </div>
          
          <div className="table-container">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Month</th>
                  <th>Basic Salary</th>
                  <th>Overtime</th>
                  <th>Deductions</th>
                  <th>Net Salary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.map(pay => (
                  <tr key={pay.id}>
                    <td>
                      <div className="employee-info">
                        <strong>{pay.employee?.name}</strong>
                        <small>{pay.employee?.position}</small>
                      </div>
                    </td>
                    <td>{pay.month}</td>
                    <td>${pay.basicSalary}</td>
                    <td>${pay.overtime}</td>
                    <td>${pay.deductions}</td>
                    <td><strong>${pay.netSalary}</strong></td>
                    <td><span className={`status ${pay.status}`}>{pay.status}</span></td>
                    <td>
                      {pay.status === 'pending' && (
                        <button 
                          className="btn-success"
                          onClick={() => updatePayrollStatus(pay.id, 'paid')}
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enhanced Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal large-modal">
            <h3>{activeTab === 'employees' ? (editingEmployee ? 'Edit Employee' : 'Employee Onboarding') : 'Manual Payroll Entry'}</h3>
            <form onSubmit={handleSubmit}>
              {activeTab === 'employees' ? (
                <div className="form-grid">
                  <div className="form-section">
                    <h4>Personal Information</h4>
                    <input
                      type="text"
                      placeholder="Full Name *"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email Address *"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                    />
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                    <textarea
                      placeholder="Address"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      rows="2"
                    />
                    <input
                      type="text"
                      placeholder="Emergency Contact"
                      value={formData.emergencyContact || ''}
                      onChange={(e) => setFormData({...formData, emergencyContact: e.target.value})}
                    />
                  </div>
                  
                  <div className="form-section">
                    <h4>Job Information</h4>
                    <input
                      type="text"
                      placeholder="Position/Designation *"
                      value={formData.position || ''}
                      onChange={(e) => setFormData({...formData, position: e.target.value})}
                      required
                    />
                    <select
                      value={formData.department || ''}
                      onChange={(e) => setFormData({...formData, department: e.target.value})}
                      required
                    >
                      <option value="">Select Department *</option>
                      <option value="Production">Production</option>
                      <option value="Quality">Quality</option>
                      <option value="HR">Human Resources</option>
                      <option value="Finance">Finance</option>
                      <option value="IT">Information Technology</option>
                      <option value="Sales">Sales & Marketing</option>
                    </select>
                    <input
                      type="date"
                      placeholder="Joining Date"
                      value={formData.joiningDate || ''}
                      onChange={(e) => setFormData({...formData, joiningDate: e.target.value})}
                    />
                    <textarea
                      placeholder="Tasks & Responsibilities (comma separated)"
                      value={formData.tasks || ''}
                      onChange={(e) => setFormData({...formData, tasks: e.target.value})}
                      rows="2"
                    />
                  </div>
                  
                  <div className="form-section">
                    <h4>Compensation</h4>
                    <input
                      type="number"
                      placeholder="Monthly Base Salary *"
                      value={formData.baseSalary || ''}
                      onChange={(e) => setFormData({...formData, baseSalary: parseInt(e.target.value)})}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Annual CTC"
                      value={formData.ctc || ''}
                      onChange={(e) => setFormData({...formData, ctc: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
              ) : (
                <div className="form-grid">
                  <select
                    value={formData.employeeId || ''}
                    onChange={(e) => setFormData({...formData, employeeId: parseInt(e.target.value)})}
                    required
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.EmployeeID || emp.id} value={emp.EmployeeID || emp.id}>{emp.Name || emp.name} - {emp.Position || emp.position}</option>
                    ))}
                  </select>
                  <input
                    type="month"
                    value={formData.month || ''}
                    onChange={(e) => setFormData({...formData, month: e.target.value})}
                    required
                  />
                  <input
                    type="number"
                    placeholder="Overtime Amount"
                    value={formData.overtime || ''}
                    onChange={(e) => setFormData({...formData, overtime: parseInt(e.target.value) || 0})}
                  />
                  <input
                    type="number"
                    placeholder="Deductions"
                    value={formData.deductions || ''}
                    onChange={(e) => setFormData({...formData, deductions: parseInt(e.target.value) || 0})}
                  />
                </div>
              )}
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  {editingEmployee ? 'Update Employee' : 'Save'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => {
                  setShowForm(false);
                  setFormData({});
                  setEditingEmployee(null);
                }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;