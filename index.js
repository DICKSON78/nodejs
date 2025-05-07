require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());
app.use(cors());

var admin = require("firebase-admin");

var serviceAccount = require("https://firebase-adminsdk-fbsvc@water-monitoring-ab4d9.iam.gserviceaccount.com");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://water-monitoring-ab4d9-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expect "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { meter_number, password } = req.body;

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
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    // Generate JWT
    const token = jwt.sign({ meter_number }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).json({ success: true, message: 'Login successful', token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Protected endpoint to get water usage
app.get('/api/water-usage', authenticateToken, async (req, res) => {
  const { meter_number } = req.user;

  try {
    const usageRef = db.ref(`water_usage/${meter_number}`);
    const snapshot = await usageRef.once('value');
    const waterUsage = snapshot.val() || {};

    res.status(200).json({ success: true, data: waterUsage });
  } catch (error) {
    console.error('Water usage fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));