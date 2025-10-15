import React, { useState, useEffect } from 'react';
import './ProductionWorkflow.css';

const ProductionWorkerDashboard = () => {
  const [todayTasks, setTodayTasks] = useState([]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [productionForm, setProductionForm] = useState({
    piecesCompleted: 0,
    notes: ''
  });
  const [currentUser] = useState({ id: 1, name: 'John Doe' }); // Should come from auth context

  useEffect(() => {
    loadTodayTasks();
    const interval = setInterval(loadTodayTasks, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadTodayTasks = async () => {
    try {
      const response = await fetch('http://localhost:5009/tasks/today');
      const result = await response.json();
      if (result.success) {
        // Filter tasks for current user (in real app, this would be done on backend)
        setTodayTasks(result.data);
      }
    } catch (error) {
      console.error('Error loading today tasks:', error);
    }
  };

  const handleProductionRecord = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5009/production/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.TaskID,
          piecesCompleted: productionForm.piecesCompleted,
          notes: productionForm.notes
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setShowRecordModal(false);
        setSelectedTask(null);
        setProductionForm({ piecesCompleted: 0, notes: '' });
        loadTodayTasks();
        alert('Production recorded successfully!');
      }
    } catch (error) {
      console.error('Error recording production:', error);
      alert('Error recording production');
    }
  };

  const startRecording = (task) => {
    setSelectedTask(task);
    setProductionForm({ piecesCompleted: 0, notes: '' });
    setShowRecordModal(true);
  };

  const getTaskProgress = (task) => {
    return Math.min((task.CompletedPieces / task.TargetPieces) * 100, 100);
  };

  const getTaskStatus = (task) => {
    const progress = getTaskProgress(task);
    if (progress === 100) return 'completed';
    if (progress > 0) return 'in-progress';
    return 'pending';
  };

  return (
    <div className="worker-dashboard">
      <div className="dashboard-header">
        <h1>👷 Production Worker Dashboard</h1>
        <div className="worker-info">
          <span>Welcome, <strong>{currentUser.name}</strong></span>
          <span className="date">{new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</span>
        </div>
      </div>

      {/* Daily Summary */}
      <div className="daily-summary">
        <div className="summary-card">
          <div className="summary-icon">📋</div>
          <div className="summary-content">
            <h3>Today's Tasks</h3>
            <div className="summary-value">{todayTasks.length}</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">🎯</div>
          <div className="summary-content">
            <h3>Target Pieces</h3>
            <div className="summary-value">
              {todayTasks.reduce((sum, task) => sum + task.TargetPieces, 0)}
            </div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">✅</div>
          <div className="summary-content">
            <h3>Completed Pieces</h3>
            <div className="summary-value">
              {todayTasks.reduce((sum, task) => sum + task.CompletedPieces, 0)}
            </div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">📊</div>
          <div className="summary-content">
            <h3>Overall Progress</h3>
            <div className="summary-value">
              {todayTasks.length > 0 ? Math.round(
                (todayTasks.reduce((sum, task) => sum + task.CompletedPieces, 0) /
                 todayTasks.reduce((sum, task) => sum + task.TargetPieces, 0)) * 100
              ) : 0}%
            </div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="tasks-section">
        <h2>📋 Today's Production Tasks</h2>
        <div className="tasks-grid">
          {todayTasks.map(task => {
            const progress = getTaskProgress(task);
            const status = getTaskStatus(task);
            
            return (
              <div key={task.TaskID} className={`task-card ${status}`}>
                <div className="task-header">
                  <div className="task-info">
                    <h3>{task.StyleName}</h3>
                    <p className="order-code">Order: {task.OrderCode}</p>
                  </div>
                  <div className={`task-status ${status}`}>
                    {status === 'completed' && '✅'}
                    {status === 'in-progress' && '🔄'}
                    {status === 'pending' && '⏳'}
                  </div>
                </div>
                
                <div className="task-details">
                  <div className="detail-row">
                    <span>Machine:</span>
                    <strong>{task.MachineName}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Shift:</span>
                    <strong>{task.ShiftTime}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Target:</span>
                    <strong>{task.TargetPieces} pieces</strong>
                  </div>
                  <div className="detail-row">
                    <span>Completed:</span>
                    <strong>{task.CompletedPieces} pieces</strong>
                  </div>
                </div>
                
                <div className="task-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{width: `${progress}%`}}
                    ></div>
                  </div>
                  <span className="progress-text">{Math.round(progress)}% Complete</span>
                </div>
                
                <div className="task-actions">
                  {status !== 'completed' && (
                    <button 
                      className="btn-record"
                      onClick={() => startRecording(task)}
                    >
                      📝 Record Production
                    </button>
                  )}
                  {status === 'completed' && (
                    <span className="completed-badge">✅ Task Completed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {todayTasks.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No Tasks Assigned</h3>
            <p>No production tasks have been assigned for today. Please check with your supervisor.</p>
          </div>
        )}
      </div>

      {/* Production Tips */}
      <div className="tips-section">
        <h2>💡 Production Tips</h2>
        <div className="tips-grid">
          <div className="tip-card">
            <div className="tip-icon">⚡</div>
            <h3>Efficiency Tips</h3>
            <ul>
              <li>Keep your workspace organized</li>
              <li>Check machine settings before starting</li>
              <li>Take regular breaks to maintain quality</li>
            </ul>
          </div>
          <div className="tip-card">
            <div className="tip-icon">🔍</div>
            <h3>Quality Focus</h3>
            <ul>
              <li>Inspect each piece before completion</li>
              <li>Report any material defects immediately</li>
              <li>Follow the style specifications exactly</li>
            </ul>
          </div>
          <div className="tip-card">
            <div className="tip-icon">🛡️</div>
            <h3>Safety First</h3>
            <ul>
              <li>Always wear safety equipment</li>
              <li>Keep fingers away from moving parts</li>
              <li>Report any machine issues immediately</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Production Recording Modal */}
      {showRecordModal && selectedTask && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>📝 Record Production - {selectedTask.StyleName}</h3>
            <div className="task-summary">
              <div className="summary-row">
                <span>Order:</span> <strong>{selectedTask.OrderCode}</strong>
              </div>
              <div className="summary-row">
                <span>Machine:</span> <strong>{selectedTask.MachineName}</strong>
              </div>
              <div className="summary-row">
                <span>Target:</span> <strong>{selectedTask.TargetPieces} pieces</strong>
              </div>
              <div className="summary-row">
                <span>Already Completed:</span> <strong>{selectedTask.CompletedPieces} pieces</strong>
              </div>
              <div className="summary-row">
                <span>Remaining:</span> <strong>{selectedTask.TargetPieces - selectedTask.CompletedPieces} pieces</strong>
              </div>
            </div>
            
            <form onSubmit={handleProductionRecord}>
              <div className="form-group">
                <label>Pieces Completed Now</label>
                <input
                  type="number"
                  value={productionForm.piecesCompleted}
                  onChange={(e) => setProductionForm({
                    ...productionForm, 
                    piecesCompleted: parseInt(e.target.value) || 0
                  })}
                  min="1"
                  max={selectedTask.TargetPieces - selectedTask.CompletedPieces}
                  required
                />
                <small>Maximum: {selectedTask.TargetPieces - selectedTask.CompletedPieces} pieces</small>
              </div>
              
              <div className="form-group">
                <label>Notes (Optional)</label>
                <textarea
                  value={productionForm.notes}
                  onChange={(e) => setProductionForm({...productionForm, notes: e.target.value})}
                  rows="3"
                  placeholder="Any issues, observations, or comments..."
                />
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  ✅ Record Production
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowRecordModal(false)}>
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

export default ProductionWorkerDashboard;