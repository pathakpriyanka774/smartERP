const express = require('express');
const router = express.Router();
const {
  getQualityDashboard,
  startInspection,
  completeInspection,
  sendForInspection,
  getQualityReports
} = require('../controllers/qualityController');

// Quality Team Routes
router.get('/dashboard', getQualityDashboard);
router.post('/send-for-inspection', sendForInspection);
router.post('/start-inspection', startInspection);
router.post('/complete-inspection', completeInspection);
router.get('/reports', getQualityReports);

module.exports = router;