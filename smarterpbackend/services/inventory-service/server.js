const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5003;

app.use(cors());
app.use(express.json());

// Mock inventory database
let inventory = [
  { id: 1, itemName: 'Cotton Fabric', category: 'raw-material', quantity: 500, unit: 'meters', reorderLevel: 100, status: 'in-stock' },
  { id: 2, itemName: 'Buttons', category: 'accessories', quantity: 25, unit: 'pieces', reorderLevel: 50, status: 'low-stock' }
];

// Routes
app.get('/inventory', (req, res) => {
  res.json({ success: true, data: inventory });
});

app.post('/inventory', (req, res) => {
  const newItem = { id: Date.now(), ...req.body };
  inventory.push(newItem);
  res.json({ success: true, data: newItem });
});

app.put('/inventory/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = inventory.findIndex(i => i.id === id);
  if (index !== -1) {
    inventory[index] = { ...inventory[index], ...req.body };
    res.json({ success: true, data: inventory[index] });
  } else {
    res.status(404).json({ success: false, message: 'Item not found' });
  }
});

app.get('/inventory/stats', (req, res) => {
  res.json({
    totalItems: inventory.length,
    inStock: inventory.filter(i => i.status === 'in-stock').length,
    lowStock: inventory.filter(i => i.status === 'low-stock').length,
    outOfStock: inventory.filter(i => i.status === 'out-of-stock').length
  });
});

app.listen(PORT, () => {
  console.log(`📋 Inventory Service running on http://localhost:${PORT}`);
});