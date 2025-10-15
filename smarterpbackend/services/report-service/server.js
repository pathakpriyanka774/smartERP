const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5007;

app.use(cors());
app.use(express.json());

// Routes
app.get('/dashboard', async (req, res) => {
  // Aggregate data from other services
  const dashboardData = {
    kpis: {
      totalOrders: 1250,
      revenue: 85000,
      activeProduction: 45,
      inventoryItems: 320
    },
    recentActivity: [
      { type: 'order', message: 'New order received from ABC Manufacturing', time: '2 hours ago' },
      { type: 'production', message: 'Production batch #123 completed', time: '4 hours ago' },
      { type: 'inventory', message: 'Low stock alert: Cotton Fabric', time: '6 hours ago' }
    ],
    charts: {
      monthlyRevenue: [65000, 72000, 68000, 85000],
      orderStatus: { pending: 15, inProgress: 30, completed: 205 }
    }
  };
  
  res.json({ success: true, data: dashboardData });
});

app.get('/reports/sales', (req, res) => {
  res.json({
    success: true,
    data: {
      totalSales: 85000,
      monthlyGrowth: 12.5,
      topProducts: [
        { name: 'Custom Shirts', sales: 35000 },
        { name: 'Formal Pants', sales: 28000 },
        { name: 'Casual Wear', sales: 22000 }
      ]
    }
  });
});

app.get('/reports/production', (req, res) => {
  res.json({
    success: true,
    data: {
      efficiency: 87.5,
      completedOrders: 205,
      avgProductionTime: 12.5,
      qualityScore: 94.2
    }
  });
});

app.listen(PORT, () => {
  console.log(`📊 Report Service running on http://localhost:${PORT}`);
});