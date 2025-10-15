const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5005;

app.use(cors());
app.use(express.json());

// Mock finance database
let transactions = [
  { id: 1, type: 'income', amount: 15000, description: 'Order Payment', date: '2024-01-15', category: 'sales' },
  { id: 2, type: 'expense', amount: 3000, description: 'Raw Materials', date: '2024-01-10', category: 'materials' }
];

// Routes
app.get('/transactions', (req, res) => {
  res.json({ success: true, data: transactions });
});

app.post('/transactions', (req, res) => {
  const newTransaction = { id: Date.now(), ...req.body, date: new Date().toISOString().split('T')[0] };
  transactions.push(newTransaction);
  res.json({ success: true, data: newTransaction });
});

app.get('/finance/summary', (req, res) => {
  const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  
  res.json({
    totalIncome: income,
    totalExpenses: expenses,
    netProfit: income - expenses,
    transactionCount: transactions.length
  });
});

app.listen(PORT, () => {
  console.log(`💰 Finance Service running on http://localhost:${PORT}`);
});