const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL connection configuration (use environment variables or a config file in production)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'water_db',
};

// Initialize MySQL pool
const pool = mysql.createPool(dbConfig);

console.log('Attempting to connect to MySQL with config:', dbConfig);

// Initialize database tables
(async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Acquired database connection');

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        meter_number VARCHAR(50) PRIMARY KEY,
        password_hash VARCHAR(255) NOT NULL
      );
    `);
    console.log('Created users table');

    // Create valve_states table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS valve_states (
        meter_number VARCHAR(50) PRIMARY KEY,
        state VARCHAR(10) NOT NULL,
        CHECK (state IN ('open', 'close'))
      );
    `);
    console.log('Created valve_states table');

    // Create water_usage table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS water_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        meter_number VARCHAR(50) NOT NULL,
        liters FLOAT NOT NULL,
        date BIGINT NOT NULL,
        bill FLOAT NOT NULL
      );
    `);
    console.log('Created water_usage table');

    connection.release();
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
    if (connection) connection.release();
  }
})();

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
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE meter_number = ?', [meter_number]);
    console.log('Query result rows:', rows.length);
    if (rows.length === 0) {
      console.log('No user found for meter_number:', meter_number);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const passwordHash = rows[0].password_hash;
    const isMatch = await bcrypt.compare(password, passwordHash);
    console.log('Password match result:', isMatch);

    if (isMatch) {
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/valve/control/:meter_number - Fetch current valve state
app.get('/api/valve/control/:meter_number', async (req, res) => {
  const meterNumber = req.params.meter_number;
  try {
    const [rows] = await pool.query('SELECT state FROM valve_states WHERE meter_number = ?', [meterNumber]);
    const state = rows[0]?.state || 'close';
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
    await pool.query(
      'INSERT INTO valve_states (meter_number, state) VALUES (?, ?) ON DUPLICATE KEY UPDATE state = ?',
      [meterNumber, state, state]
    );
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
    const [rows] = await pool.query('SELECT meter_number, liters, date, bill FROM water_usage WHERE meter_number = ?', [meterNumber]);
    res.json(rows);
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
    await pool.query(
      'INSERT INTO water_usage (meter_number, liters, date, bill) VALUES (?, ?, ?, ?)',
      [meterNumber, liters, date, bill]
    );
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