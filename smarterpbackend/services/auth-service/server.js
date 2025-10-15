const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 5001;
const JWT_SECRET = 'your-secret-key';

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 Auth Service: ${req.method} ${req.url}`);
  next();
});

// Mock users database
let users = [];

// Test endpoint
app.get('/test', (req, res) => {
  console.log('Auth service test endpoint hit');
  res.json({ message: 'Auth service is working!' });
});

// Auth Routes
app.post('/login', async (req, res) => {
  console.log('Login request received:', req.body);
  const { email, password } = req.body;
  
  if (!email || !password) {
    console.log('Missing email or password');
    return res.status(400).json({ success: false, message: 'Email and password required' });
  }
  
  let user = users.find(u => u.email === email);
  
  // For testing: create user if doesn't exist
  if (!user) {
    const hashedPassword = await bcrypt.hash(password, 10);
    user = { id: Date.now(), name: email.split('@')[0], email, password: hashedPassword, role: 'admin' };
    users.push(user);
  }
  
  if (await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    console.log('Login successful for:', email);
    res.json({ 
      success: true, 
      user: { id: user.id, name: user.name, email: user.email, role: user.role }, 
      token 
    });
  } else {
    console.log('Invalid password for:', email);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }
  
  // Check if user exists
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ success: false, message: 'User already exists' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { id: Date.now(), name, email, password: hashedPassword, role: role || 'user' };
  users.push(newUser);
  
  const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, user: { id: newUser.id, name, email, role: newUser.role }, token });
});

app.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Auth Service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🔐 Auth Service running on http://localhost:${PORT}`);
  console.log('🔗 Available endpoints:');
  console.log(`   POST http://localhost:${PORT}/login`);
  console.log(`   POST http://localhost:${PORT}/signup`);
  console.log(`   GET http://localhost:${PORT}/test`);
});