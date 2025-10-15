const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

console.log('🚀 Starting API Gateway...');

// Service routes
const services = {
  auth: 'http://localhost:5001',
  orders: 'http://localhost:5002',
  inventory: 'http://localhost:5003',
  production: 'http://localhost:5004',
  finance: 'http://localhost:5005',
  clients: 'http://localhost:5006',
  reports: 'http://localhost:5007',
  payroll: 'http://localhost:5008'
};

// Health check first
app.get('/api/health', (req, res) => {
  console.log('Health check requested');
  res.json({ 
    message: 'API Gateway is running',
    services: Object.keys(services),
    timestamp: new Date().toISOString()
  });
});

// Setup proxies for all services
Object.keys(services).forEach(serviceName => {
  const serviceUrl = services[serviceName];
  console.log(`Setting up proxy: /api/${serviceName} -> ${serviceUrl}`);
  
  app.use(`/api/${serviceName}`, createProxyMiddleware({
    target: serviceUrl,
    changeOrigin: true,
    pathRewrite: { [`^/api/${serviceName}`]: '' },
    onError: (err, req, res) => {
      console.error(`❌ Proxy error for ${serviceName}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: `${serviceName} service unavailable`, message: err.message });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`📡 Proxying: ${req.method} /api/${serviceName}${req.url} -> ${serviceUrl}${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      console.log(`✅ Response from ${serviceName}: ${proxyRes.statusCode}`);
    }
  }));
});

// Catch-all for debugging
app.use('/api/*', (req, res) => {
  console.log(`❓ Unmatched API route: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'API route not found', path: req.url });
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on http://localhost:${PORT}`);
  console.log('📋 Available services:', Object.keys(services).join(', '));
  console.log('🔗 Test URLs:');
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Auth: http://localhost:${PORT}/api/auth/test`);
});