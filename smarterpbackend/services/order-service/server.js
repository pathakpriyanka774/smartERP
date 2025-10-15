const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5002;

app.use(cors());
app.use(express.json());

// Mock orders database
let orders = [
  { id: 1, clientName: 'ABC Manufacturing', orderDate: '2024-01-15', deliveryDate: '2024-02-15', status: 'in-production', priority: 'high', totalAmount: 15000 },
  { id: 2, clientName: 'XYZ Wholesale', orderDate: '2024-01-20', deliveryDate: '2024-02-20', status: 'confirmed', priority: 'medium', totalAmount: 8500 }
];

// Routes
app.get('/orders', (req, res) => {
  res.json({ success: true, data: orders });
});

app.post('/orders', (req, res) => {
  const newOrder = { id: Date.now(), ...req.body, status: 'pending' };
  orders.push(newOrder);
  res.json({ success: true, data: newOrder });
});

app.put('/orders/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = orders.findIndex(o => o.id === id);
  if (index !== -1) {
    orders[index] = { ...orders[index], ...req.body };
    res.json({ success: true, data: orders[index] });
  } else {
    res.status(404).json({ success: false, message: 'Order not found' });
  }
});

app.get('/orders/stats', (req, res) => {
  res.json({
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    inProduction: orders.filter(o => o.status === 'in-production').length,
    completed: orders.filter(o => o.status === 'completed').length
  });
});

app.listen(PORT, () => {
  console.log(`📦 Order Service running on http://localhost:${PORT}`);
});