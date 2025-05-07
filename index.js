require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Configure CORS with dynamic origin
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Initialize Firebase with environment variables
if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DATABASE_URL) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_URL in .env');
  process.exit(1);
}

console.log('FIREBASE_SERVICE_ACCOUNT raw:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 100) + '...');
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  console.log('Parsed serviceAccount private_key:', serviceAccount.private_key.substring(0, 50) + '...');
} catch (parseError) {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', parseError.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
console.log('Firebase initialized successfully');

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('Auth header:', authHeader);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, decoded) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Login endpoint (validate meter_number and password from Firebase)
app.post('/api/login', async (req, res) => {
  const { meter_number, password } = req.body;

  console.log('Login attempt for meter_number:', meter_number);
  if (!meter_number || !password) {
    return res.status(400).json({ success: false, message: 'Missing meter number or password' });
  }

  try {
    const userRef = db.ref(`users/${meter_number}`);
    const snapshot = await userRef.once('value');
    if (!snapshot.exists()) {
      return res.status(401).json({ success: false, message: 'Invalid meter number' });
    }

    const user = snapshot.val();
    if (!user.password_hash) {
      return res.status(500).json({ success: false, message: 'User data corrupted' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign({ meter_number }, process.env.JWT_SECRET || 'default-secret', { expiresIn: '1h' });
    console.log('Login successful, token generated');
    res.status(200).json({ success: true, message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Protected endpoint to get daily water usage from Firebase (populated by Arduino)
app.get('/api/water-usage', authenticateToken, async (req, res) => {
  const { meter_number } = req.user;

  console.log('Fetching water usage for meter_number:', meter_number);
  try {
    const usageRef = db.ref(`water_usage/${meter_number}`);
    const snapshot = await usageRef.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, message: 'No water usage data found' });
    }

    const waterUsage = snapshot.val();
    console.log('Water usage fetched:', waterUsage);
    res.status(200).json({ success: true, data: waterUsage });
  } catch (error) {
    console.error('Water usage fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));