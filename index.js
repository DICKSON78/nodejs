const express = require('express');
const mysql = require('mysql2');
const app = express();
const cors = require('cors');
app.use(cors());
app.use(express.json());


const db = mysql.createConnection({
    host:process.env.DB_HOST || 'localhost',
    user:process.env.DB_USER || 'root',
    password:process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'water_monitoring',
    port: process.env.BD_PORT || 3306
});

// Test database connection
db.connect((err) => {
    if (err) {
        console.error('Failed to connect to Database:', err.message);
        return;
    }
    console.log('Connected to Database successfully');
});

// POST endpoint to receive data from GSM module
app.post('/api/water-usage', (req, res) => {
    const { tenant_id, liters } = req.body;
    if (!tenant_id || !liters) {
        return res.status(400).send('Missing tenant_id or liters');
    }
    const query = 'INSERT INTO usage (tenant_id, liters, timestamp) VALUES (?, ?, NOW())';
    db.query(query, [tenant_id, liters], (err, result) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        res.status(200).send('Data saved');
    });
});

// GET endpoint for raw usage data
app.get('/api/water-usage/:tenant_id', (req, res) => {
    const query = 'SELECT * FROM usage WHERE tenant_id = ? ORDER BY timestamp DESC LIMIT 50';
    db.query(query, [req.params.tenant_id], (err, results) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        res.json(results);
    });
});

// GET endpoint for daily usage totals
app.get('/api/water-usage/daily/:tenant_id', (req, res) => {
    const query = `
        SELECT tenant_id, SUM(liters) as liters, DATE(timestamp) as date,
               SUM(liters) * 1000 as bill
        FROM water_usage
        WHERE tenant_id = ? AND MONTH(timestamp) = MONTH(CURDATE()) AND YEAR(timestamp) = YEAR(CURDATE())
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
        LIMIT 31`;
    db.query(query, [req.params.tenant_id], (err, results) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }
        res.json(results);
    });
});

app.listen(3000, () => console.log('Server running on port 3000'));