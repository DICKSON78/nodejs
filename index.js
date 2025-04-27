const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'water_monitoring',
});

db.connect((err) => {
    if (err) {
        console.error('Failed to connect to Database:', err.message);
        return;
    }
    console.log('Connected to Database successfully');
});

// POST endpoint for user login
app.post('/api/login', (req, res) => {
    const { meter_number, password } = req.body;
    if (!meter_number || !password) {
        return res.status(400).send('Missing meter_number or password');
    }
    const query = 'SELECT * FROM users WHERE meter_number = ? AND password = ?';
    db.query(query, [meter_number, password], (err, results) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) {
            return res.status(401).send('Invalid credentials');
        }
        res.json({ message: 'Login successful', meter_number: results[0].meter_number });
    });
});

// POST endpoint to receive data from GSM module
app.post('/api/water-usage', (req, res) => {
    const { meter_number, liters } = req.body;
    if (!meter_number || !liters) {
        return res.status(400).send('Missing meter_number or liters');
    }
    const query = 'INSERT INTO usage (meter_number, liters, timestamp) VALUES (?, ?, NOW())';
    db.query(query, [meter_number, liters], (err, result) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        res.status(200).send('Data saved');
    });
});

// GET endpoint for raw usage data
app.get('/api/water-usage/:meter_number', (req, res) => {
    const { meter_number } = req.params;
    const query = 'SELECT * FROM usage WHERE meter_number = ? ORDER BY timestamp DESC LIMIT 50';
    db.query(query, [meter_number], (err, results) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        res.json(results);
    });
});

// GET endpoint for daily usage totals
app.get('/api/water-usage/daily/:meter_number', (req, res) => {
    const { meter_number } = req.params;
    const query = `
        SELECT meter_number, SUM(liters) as liters, DATE(timestamp) as date,
               SUM(liters) * 1000 as bill
        FROM usage
        WHERE meter_number = ? AND MONTH(timestamp) = MONTH(CURDATE()) AND YEAR(timestamp) = YEAR(CURDATE())
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
        LIMIT 31`;
    db.query(query, [meter_number], (err, results) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        res.json(results);
    });
});

app.listen(3000, () => console.log('Server running on port 3000'));