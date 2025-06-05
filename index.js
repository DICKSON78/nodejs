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

  if (!token) return res.status(401).json({ success: false, error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
};

// Auto-close valve after specified minutes
const scheduleValveAutoClose = async (meter_number, minutes) => {
  setTimeout(async () => {
    const valveRef = db.ref(`valve_states/${meter_number}`);
    const snapshot = await valveRef.once('value');
    if (snapshot.exists() && snapshot.val().state === 'open') {
      await valveRef.update({
        state: 'close',
        last_updated: Date.now(),
        controlled_by: 'system',
        last_command_status: 'pending',
        hardware_ack: false
      });

      // Log the auto-close action
      const logRef = db.ref(`valve_logs/${meter_number}`).push();
      await logRef.set({
        action: 'close',
        initiated_by: 'system',
        status: 'completed',
        hardware_response: 'pending',
        timestamp: Date.now()
      });

      console.log(`Auto-closed valve for ${meter_number} after ${minutes} minutes`);
    }
  }, minutes * 60 * 1000);
};

// Routes

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { meter_number, password } = req.body;

    if (!meter_number || !password) {
      return res.status(400).json({ success: false, error: 'Meter number and password are required' });
    }

    const userSnapshot = await db.ref(`users/${meter_number}`).once('value');

    if (!userSnapshot.exists()) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = userSnapshot.val();

    if (password !== user.password) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { meter_number },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      token,
      expiresIn: 3600,
      meter_number
    });

  } catch (error) {
    console.error('Login error:', error.stack);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get Water Usage
app.get('/api/water-usage', authenticateToken, async (req, res) => {
  try {
    const { meter_number } = req.user;

    const snapshot = await db.ref(`water_usage/${meter_number}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, error: 'No water usage data found' });
    }

    res.json({
      success: true,
      meter_number,
      data: snapshot.val()
    });

  } catch (error) {
    console.error('Water usage error:', error.stack);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Get Water Usage by Specific Date
app.get('/api/water-usage/:date', authenticateToken, async (req, res) => {
  try {
    const { meter_number } = req.user;
    const { date } = req.params;

    if (!/^\d{8}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYYMMDD' });
    }

    const snapshot = await db.ref(`water_usage/${meter_number}/${date}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: 'No data available for this date'
      });
    }

    res.json({
      success: true,
      meter_number,
      date,
      data: snapshot.val()
    });

  } catch (error) {
    console.error('Water usage by date error:', error.stack);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Valve Control Endpoint
app.post('/api/control-valve', authenticateToken, async (req, res) => {
  try {
    const { meter_number } = req.user;
    const { action } = req.body;

    if (!action || !['open', 'close'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Use "open" or "close"'
      });
    }

    // Update valve state in Firebase
    const valveRef = db.ref(`valve_states/${meter_number}`);
    await valveRef.update({
      state: action,
      last_updated: Date.now(),
      controlled_by: meter_number,
      last_command_status: 'pending',
      hardware_ack: false
    });

    // Log the action
    const logRef = db.ref(`valve_logs/${meter_number}`).push();
    await logRef.set({
      action: action,
      initiated_by: meter_number,
      status: 'completed',
      hardware_response: 'pending',
      timestamp: Date.now()
    });

    // Fetch system settings for auto-close
    const settingsSnapshot = await db.ref('system_settings').once('value');
    const settings = settingsSnapshot.val();
    if (action === 'open' && settings.valve_auto_close_minutes) {
      scheduleValveAutoClose(meter_number, settings.valve_auto_close_minutes);
    }

    res.json({
      success: true,
      message: `Valve ${action} command sent successfully`,
      meter_number,
      action
    });

  } catch (error) {
    console.error('Valve control error:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to control valve'
    });
  }
});

// Get Current Valve State
app.get('/api/valve-state', authenticateToken, async (req, res) => {
  try {
    const { meter_number } = req.user;
    const snapshot = await db.ref(`valve_states/${meter_number}`).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({
        success: false,
        error: 'No valve state found for this meter'
      });
    }

    const valveData = snapshot.val();
    res.json({
      success: true,
      meter_number,
      state: valveData.state || 'close',
      last_updated: valveData.last_updated
    });

  } catch (error) {
    console.error('Valve state error:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to get valve state'
    });
  }
});

// Server Startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('WARNING: Using plain text passwords - For testing only!');
});

// Error Handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason.stack || reason);
});