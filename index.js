require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});
const db = admin.database();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes
app.post('/api/login', async (req, res) => {
  try {
    const { meter_number, password } = req.body;
    
    if (!meter_number || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const userSnapshot = await db.ref(`users/${meter_number}`).once('value');
    
    if (!userSnapshot.exists()) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userSnapshot.val();

    // Plain password comparison
    if (password !== user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { meter_number }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    res.json({ 
      token,
      expiresIn: 3600,
      meter_number
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Protected Route Example
app.get('/api/water-usage', authenticateToken, async (req, res) => {
  try {
    const { meter_number } = req.user;
    const snapshot = await db.ref(`water_usage/${meter_number}`).once('value');
    
    res.json({
      data: snapshot.val() || {},
      meter_number
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Server Startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('WARNING: Using plain text passwords - Not secure for production!');
});

// Error Handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});