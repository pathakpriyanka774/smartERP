const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5006;

app.use(cors());
app.use(express.json());

// Mock clients database
let clients = [
  { id: 1, name: 'ABC Manufacturing', type: 'manufacturing-unit', email: 'contact@abc.com', phone: '+1234567890', status: 'active' },
  { id: 2, name: 'XYZ Wholesale', type: 'wholesale', email: 'orders@xyz.com', phone: '+0987654321', status: 'active' }
];

// Routes
app.get('/clients', (req, res) => {
  res.json({ success: true, data: clients });
});

app.post('/clients', (req, res) => {
  const newClient = { id: Date.now(), ...req.body, status: 'active' };
  clients.push(newClient);
  res.json({ success: true, data: newClient });
});

app.put('/clients/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = clients.findIndex(c => c.id === id);
  if (index !== -1) {
    clients[index] = { ...clients[index], ...req.body };
    res.json({ success: true, data: clients[index] });
  } else {
    res.status(404).json({ success: false, message: 'Client not found' });
  }
});

app.get('/clients/stats', (req, res) => {
  res.json({
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    inactive: clients.filter(c => c.status === 'inactive').length,
    byType: {
      manufacturing: clients.filter(c => c.type === 'manufacturing-unit').length,
      wholesale: clients.filter(c => c.type === 'wholesale').length,
      designer: clients.filter(c => c.type === 'designer').length
    }
  });
});

app.listen(PORT, () => {
  console.log(`👥 Client Service running on http://localhost:${PORT}`);
});