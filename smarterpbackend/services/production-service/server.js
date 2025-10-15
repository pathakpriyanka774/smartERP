const express = require('express');
const cors = require('cors');
const { connectDB } = require('../../shared/database');
const { createProductionTables } = require('../../shared/production-schema');
const planningRoutes = require('./routes/planningRoutes');
const qualityRoutes = require('./routes/qualityRoutes');

const app = express();
const PORT = 5004;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/planning', planningRoutes);
app.use('/api/quality', qualityRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'Production Service is running', timestamp: new Date().toISOString() });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await connectDB();
    await createProductionTables();
    console.log('✅ Production database initialized');
    
    app.listen(PORT, () => {
      console.log(`🚀 Production Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start Production Service:', error);
    process.exit(1);
  }
};

startServer();