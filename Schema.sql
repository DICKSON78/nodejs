CREATE DATABASE IF NOT EXISTS water_monitoring;
USE water_monitoring;

-- Create usage table
CREATE TABLE usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meter_number VARCHAR(50) NOT NULL,
    liters FLOAT NOT NULL,
    timestamp DATETIME NOT NULL,
    INDEX idx_meter_number (meter_number),
    INDEX idx_timestamp (timestamp)
);

-- Create users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    meter_number VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_meter_number (meter_number)
);

INSERT INTO users (meter_number, password, created_at) VALUES
    ('MTR001', 'pass123', '2025-04-24 08:00:00'),
    ('MTR002', 'pass123', '2025-04-24 08:00:00'); 


INSERT INTO usage (meter_number, liters, timestamp) VALUES
    ('MTR001', 10.5, '2025-04-26 08:00:00'),
    ('MTR001', 7.2, '2025-04-26 12:00:00'),
    ('MTR001', 12.8, '2025-04-26 18:00:00'),
    ('MTR001', 9.0, '2025-04-25 09:00:00'),
    ('MTR001', 11.3, '2025-04-25 15:00:00'),
    ('MTR002', 8.5, '2025-04-26 07:00:00'),
    ('MTR002', 6.7, '2025-04-26 13:00:00'),
    ('MTR002', 9.2, '2025-04-26 19:00:00'),
    ('MTR002', 10.0, '2025-04-25 10:00:00'),
    ('MTR002', 7.8, '2025-04-25 16:00:00');

-- Verify dataa
SELECT * FROM usage;
SELECT * FROM users;