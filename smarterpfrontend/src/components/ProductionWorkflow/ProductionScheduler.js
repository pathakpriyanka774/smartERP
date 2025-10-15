import React, { useState } from 'react';
import './ProductionWorkflow.css';

const ProductionScheduler = ({ selectedOrders, materialStatus }) => {
  const [schedules, setSchedules] = useState([]);
  const [newSchedule, setNewSchedule] = useState({
    orderId: '',
    batchNumber: '',
    startDate: '',
    endDate: '',
    assignedTeam: '',
    machineId: '',
    priority: 'Medium'
  });

  const teams = ['Team A', 'Team B', 'Team C', 'Team D'];
  const machines = ['Machine Line 1', 'Machine Line 2', 'Machine Line 3'];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewSchedule({ ...newSchedule, [name]: value });
  };

  const addSchedule = () => {
    if (!newSchedule.orderId || !newSchedule.startDate || !newSchedule.endDate) return;
    
    const schedule = {
      id: Date.now(),
      ...newSchedule,
      batchNumber: `BTH-${Date.now()}`,
      status: 'Scheduled'
    };
    
    setSchedules([...schedules, schedule]);
    setNewSchedule({
      orderId: '',
      batchNumber: '',
      startDate: '',
      endDate: '',
      assignedTeam: '',
      machineId: '',
      priority: 'Medium'
    });
  };

  const startProduction = () => {
    // Save production schedules
    const productions = schedules.map(schedule => {
      const order = selectedOrders.find(o => o.id === parseInt(schedule.orderId));
      return {
        id: schedule.id,
        batchNumber: schedule.batchNumber,
        productName: order?.productType || order?.items?.[0]?.product || 'Mixed Items',
        orderNumber: `ORD-${order?.id}`,
        quantity: order?.items?.reduce((sum, item) => sum + item.quantity, 0) || order?.quantity || 100,
        startDate: schedule.startDate,
        targetDate: schedule.endDate,
        assignedWorkers: schedule.assignedTeam,
        machineUsed: schedule.machineId,
        stage: 'Planning',
        priority: schedule.priority,
        status: 'Not Started',
        progress: 0,
        created: new Date().toISOString().split('T')[0]
      };
    });

    const existingProductions = JSON.parse(localStorage.getItem('productions') || '[]');
    localStorage.setItem('productions', JSON.stringify([...existingProductions, ...productions]));
    
    // Update order status
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    const updatedOrders = orders.map(order => {
      if (selectedOrders.find(o => o.id === order.id)) {
        return { ...order, status: 'In Production' };
      }
      return order;
    });
    localStorage.setItem('orders', JSON.stringify(updatedOrders));
    
    alert('Production schedules created successfully!');
  };

  return (
    <div className="production-scheduler">
      <h2>Production Scheduling</h2>
      
      <div className="material-status">
        <h3>Material Status Summary</h3>
        {Object.entries(materialStatus || {}).map(([material, status]) => (
          <div key={material} className="material-status-item">
            <span>{material}: </span>
            <span className={status.sufficient ? 'status-ok' : 'status-warning'}>
              {status.sufficient ? 'Available' : `Shortage: ${status.shortage}`}
            </span>
          </div>
        ))}
      </div>

      <div className="schedule-form">
        <h3>Create Production Schedule</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Select Order:</label>
            <select
              name="orderId"
              value={newSchedule.orderId}
              onChange={handleInputChange}
            >
              <option value="">Select Order</option>
              {selectedOrders.map(order => (
                <option key={order.id} value={order.id}>
                  Order #{order.id} - {order.customerName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Priority:</label>
            <select
              name="priority"
              value={newSchedule.priority}
              onChange={handleInputChange}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Start Date:</label>
            <input
              type="date"
              name="startDate"
              value={newSchedule.startDate}
              onChange={handleInputChange}
            />
          </div>
          <div className="form-group">
            <label>End Date:</label>
            <input
              type="date"
              name="endDate"
              value={newSchedule.endDate}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Assigned Team:</label>
            <select
              name="assignedTeam"
              value={newSchedule.assignedTeam}
              onChange={handleInputChange}
            >
              <option value="">Select Team</option>
              {teams.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Machine:</label>
            <select
              name="machineId"
              value={newSchedule.machineId}
              onChange={handleInputChange}
            >
              <option value="">Select Machine</option>
              {machines.map(machine => (
                <option key={machine} value={machine}>{machine}</option>
              ))}
            </select>
          </div>
        </div>

        <button onClick={addSchedule} className="btn-secondary">
          Add to Schedule
        </button>
      </div>

      <div className="schedules-list">
        <h3>Production Schedules ({schedules.length})</h3>
        {schedules.map(schedule => {
          const order = selectedOrders.find(o => o.id === parseInt(schedule.orderId));
          return (
            <div key={schedule.id} className="schedule-item">
              <div className="schedule-header">
                <h4>Batch: {schedule.batchNumber}</h4>
                <span className={`priority ${schedule.priority.toLowerCase()}`}>
                  {schedule.priority}
                </span>
              </div>
              <div className="schedule-details">
                <p><strong>Order:</strong> #{order?.id} - {order?.customerName}</p>
                <p><strong>Duration:</strong> {schedule.startDate} to {schedule.endDate}</p>
                <p><strong>Team:</strong> {schedule.assignedTeam}</p>
                <p><strong>Machine:</strong> {schedule.machineId}</p>
              </div>
            </div>
          );
        })}
      </div>

      {schedules.length > 0 && (
        <div className="action-section">
          <button onClick={startProduction} className="btn-primary">
            Start Production ({schedules.length} batches)
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductionScheduler;