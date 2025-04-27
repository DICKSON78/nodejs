const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Test database connection and table existence
async function testDbConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('MySQL connection successful');
        const [tables] = await connection.query("SHOW TABLES LIKE 'water_usage'");
        if (tables.length === 0) {
            console.warn('Warning: usage table does not exist');
        } else {
            console.log('usage table exists');
            const [columns] = await connection.query("DESCRIBE water_usage");
            console.log('usage table columns:', columns.map(c => c.Field));
        }
        connection.release();
    } catch (error) {
        console.error('MySQL connection failed:', error.message);
    }
}
testDbConnection();

app.post('/api/login', async (req, res) => {
    try {
        const { meter_number, password } = req.body;
        console.log(`Login attempt for meter_number: ${meter_number}`);
        const [rows] = await pool.query(
            'SELECT * FROM users WHERE meter_number = ? AND password = ?',
            [meter_number, password]
        );
        if (rows.length > 0) {
            console.log(`Login successful for ${meter_number}`);
            res.json({ success: true, meter_number });
        } else {
            console.log(`Login failed for ${meter_number}: Invalid credentials`);
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ success: false, message: 'Server error during login', details: error.message });
    }
});

app.get('/api/water-usage/daily/:meter_number', async (req, res) => {
    try {
        const { meter_number } = req.params;
        console.log(`Fetching daily usage for meter_number: ${meter_number}`);
        const [rows] = await pool.query(
            'SELECT meter_number, liters, DATE(timestamp) AS date, liters * 1000 AS bill ' +
            'FROM usage WHERE meter_number = ? AND timestamp >= DATE_SUB(CURDATE(), INTERVAL 31 DAY)',
            [meter_number]
        );
        if (rows.length === 0) {
            console.log(`No data found for meter_number: ${meter_number}`);
            res.json([]);
        } else {
            console.log(`Fetched ${rows.length} records for meter_number: ${meter_number}`);
            res.json(rows);
        }
    } catch (error) {
        console.error(`Daily usage error for ${req.params.meter_number}:`, error.message);
        res.status(500).json({ error: 'Server error fetching daily usage', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));