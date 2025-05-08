require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Constants
const PASSWORD_SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'pass123'; // Only for initial setup

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

// Helper Functions
const initializeDefaultPasswords = async () => {
  console.log('Checking default passwords...');
  const usersRef = db.ref('users');
  const snapshot = await usersRef.once('value');

  const updates = {};
  snapshot.forEach(userSnapshot => {
    const user = userSnapshot.val();
    if (!user.password_hash) {
      const hash = bcrypt.hashSync(DEFAULT_PASSWORD, PASSWORD_SALT_ROUNDS);
      updates[`${userSnapshot.key}/password_hash`] = hash;
      console.log(`Initialized password for ${userSnapshot.key}`);
    }
  });

  if (Object.keys(updates).length > 0) {
    await usersRef.update(updates);
  }
};

// Routes

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString() 
  });
});

// Login
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
    if (!user.password_hash) {
      return res.status(500).json({ error: 'User not properly configured' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
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

// Password Reset (Admin)
app.post('/api/reset-password', authenticateToken, async (req, res) => {
  try {
    const { meter_number, new_password } = req.body;
    if (!meter_number || !new_password) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const hash = await bcrypt.hash(new_password, PASSWORD_SALT_ROUNDS);
    await db.ref(`users/${meter_number}`).update({ password_hash: hash });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Server Startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize default passwords on startup
  await initializeDefaultPasswords();
});

// Error Handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});