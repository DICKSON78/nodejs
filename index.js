const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for valve state and water usage (replace with a database in production)
const valveStates = new Map(); 
const waterUsageData = new Map(); 

// Helper to calculate bill (1 unit = 1000 liters, 1 unit = 1000 TZS)
const calculateBill = (liters) => (liters / 1000.0) * 1000.0;

// GET /api/valve/control/:meter_number - Fetch current valve state
app.get('/api/valve/control/:meter_number', (req, res) => {
  const meterNumber = req.params.meter_number;
  const state = valveStates.get(meterNumber) || 'close'; // Default to closed if not set
  res.json({ success: true, message: `Valve is ${state}`, state });
});

// POST /api/valve/control/:meter_number - Set valve state
app.post('/api/valve/control/:meter_number', (req, res) => {
  const meterNumber = req.params.meter_number;
  const { state } = req.body;

  if (!state || !['open', 'close'].includes(state)) {
    return res.status(400).json({ success: false, message: 'Invalid state. Must be "open" or "close".' });
  }

  valveStates.set(meterNumber, state);
  res.json({ success: true, message: `Valve ${state} command received` });
});

// GET /api/water-usage/daily/:meter_number - Fetch water usage data
app.get('/api/water-usage/daily/:meter_number', (req, res) => {
  const meterNumber = req.params.meter_number;
  const usage = waterUsageData.get(meterNumber) || [];
  res.json(usage);
});

// POST /api/water-usage/daily/:meter_number - Store water usage data (from ESP8266)
app.post('/api/water-usage/daily/:meter_number', (req, res) => {
  const meterNumber = req.params.meter_number;
  const { liters, date } = req.body;

  if (!liters || !date) {
    return res.status(400).json({ success: false, message: 'Missing liters or date' });
  }

  const bill = calculateBill(liters);
  const newUsage = { meter_number: meterNumber, liters, date, bill };

  let usageList = waterUsageData.get(meterNumber) || [];
  usageList.push(newUsage);
  waterUsageData.set(meterNumber, usageList);

  res.json({ success: true, message: 'Water usage recorded' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
