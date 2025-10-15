const express = require('express');
const cors = require('cors');
const { connectDB, getPool, sql } = require('../../shared/database');

const app = express();
const PORT = 5010;

app.use(cors());
app.use(express.json());

let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
  console.log('✅ Costing Service connected to SmartERP database');
}).catch(err => {
  console.error('❌ Database connection failed:', err.message);
});

// Costing Dashboard
app.get('/costing/dashboard', async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(500).json({ success: false, message: 'Database not connected' });
    }
    
    const pool = getPool();
    const result = await pool.request().execute('sp_GetCostingDashboard');
    
    const dashboard = {
      styleCosts: result.recordsets[0] || [],
      materialUsage: result.recordsets[1] || [],
      metrics: result.recordsets[2][0] || {}
    };
    
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Error fetching costing dashboard:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
});

// Style costing details
app.get('/costing/style/:styleId', async (req, res) => {
  try {
    const styleId = parseInt(req.params.styleId);
    const pool = getPool();
    const result = await pool.request()
      .input('StyleID', sql.Int, styleId)
      .execute('sp_GetStyleCosting');
    
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching style costing:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch style costing' });
  }
});

// All styles with costs
app.get('/costing/styles', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT StyleID, StyleCode, StyleName, Category FROM Styles ORDER BY StyleCode
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching styles:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch styles' });
  }
});

// Materials
app.get('/materials', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM Materials WHERE IsActive = 1 ORDER BY MaterialCode
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching materials:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch materials' });
  }
});

// Add/Update style costing
app.post('/costing/update', async (req, res) => {
  try {
    const { styleId, materialId, quantity, rate, createdBy } = req.body;
    
    const pool = getPool();
    const result = await pool.request()
      .input('StyleID', sql.Int, styleId)
      .input('MaterialID', sql.Int, materialId)
      .input('Quantity', sql.Decimal(8,2), quantity)
      .input('Rate', sql.Decimal(10,2), rate)
      .input('CreatedBy', sql.Int, createdBy || 1)
      .execute('sp_UpdateStyleCosting');
    
    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error updating costing:', error);
    res.status(500).json({ success: false, message: 'Failed to update costing' });
  }
});

// Style cost breakdown
app.get('/costing/breakdown/:styleId', async (req, res) => {
  try {
    const styleId = parseInt(req.params.styleId);
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM vw_StyleCostBreakdown 
      WHERE StyleCode = (SELECT StyleCode FROM Styles WHERE StyleID = ${styleId})
      ORDER BY MaterialCategory, MaterialName
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching cost breakdown:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cost breakdown' });
  }
});

// Material usage analysis
app.get('/costing/material-usage', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM vw_MaterialUsage ORDER BY TotalQuantityUsed DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error fetching material usage:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch material usage' });
  }
});

app.listen(PORT, () => {
  console.log(`💰 Costing Service running on http://localhost:${PORT}`);
});