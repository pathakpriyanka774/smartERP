const express = require('express');
const router = express.Router();
const {
  getPlanningDashboard,
  getEmployeePerformance,
  createDailyPlan,
  getMachineAvailability
} = require('../controllers/planningController');

// Planning Manager Routes
router.get('/dashboard', getPlanningDashboard);
router.get('/employee-performance', getEmployeePerformance);
router.get('/machine-availability', getMachineAvailability);
router.post('/daily-plan', createDailyPlan);

module.exports = router;