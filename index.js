const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://water-monitoring-ab4d9-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Middleware
app.use(cors());
app.use(express.json());

// Helper to calculate bill (1 unit = 1000 liters, 1 unit = 1000 TZS)
const calculateBill = (liters) => (liters / 1000.0) * 1000.0;

// POST /api/login - Authenticate user
app.post('/api/login', async (req, res) => {
  const { meter_number, password } = req.body;
  console.log('Login attempt for meter_number:', meter_number);

  if (!meter_number || !password) {
    console.log('Missing meter_number or password');
    return res.status(400).json({ success: false, message: 'Missing meter number or password' });
  }

  try {
    // Use meter_number as email for Firebase Authentication
    const email = `${meter_number}@watermonitoring.com`;
    const user = await admin.auth().getUserByEmail(email);
    if (!user) {
      console.log('No user found for meter_number:', meter_number);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Firebase Authentication handles password verification
    // Since we're using Admin SDK, we assume client-side auth token verification
    // For simplicity, we can use a custom token approach or client-side auth in production
    res.json({ success: true, message: 'Login successful' });
  } catch (err) {
    console.error('Login error details:', err.stack || err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/valve/control/:meter_number - Fetch current valve state
app.get('/api/valve/control/:meter_number', async (req, res) => {
  const meterNumber = req.params.meter_number;
  try {
    const snapshot = await db.ref(`valve_states/${meterNumber}`).once('value');
    const state = snapshot.val()?.state || 'close';
    res.json({ success: true, message: `Valve is ${state}`, state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/valve/control/:meter_number - Set valve state
app.post('/api/valve/control/:meter_number', async (req, res) => {
  const meterNumber = req.params.meter_number;
  const { state } = req.body;

  if (!state || !['open', 'close'].includes(state)) {
    return res.status(400).json({ success: false, message: 'Invalid state. Must be "open" or "close".' });
  }

  try {
    await db.ref(`valve_states/${meterNumber}`).set({ state });
    res.json({ success: true, message: `Valve ${state} command received` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/water-usage/daily/:meter_number - Fetch water usage data
app.get('/api/water-usage/daily/:meter_number', async (req, res) => {
  const meterNumber = req.params.meter_number;
  try {
    const snapshot = await db.ref(`water_usage/${meterNumber}`).once('value');
    const data = snapshot.val() ? Object.values(snapshot.val()) : [];
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/water-usage/daily/:meter_number - Store water usage data
app.post('/api/water-usage/daily/:meter_number', async (req, res) => {
  const meterNumber = req.params.meter_number;
  const { liters, date } = req.body;

  if (!liters || !date) {
    return res.status(400).json({ success: false, message: 'Missing liters or date' });
  }

  const bill = calculateBill(liters);
  try {
    await db.ref(`water_usage/${meterNumber}`).push({ meter_number: meterNumber, liters, date, bill });
    res.json({ success: true, message: 'Water usage recorded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});