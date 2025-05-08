require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// 1. Server Time Validation
const validateServerTime = () => {
  const now = new Date();
  console.log(`Server Startup Time: ${now.toISOString()}`);
  console.log(`UTC Offset: ${now.getTimezoneOffset()} minutes`);
  
  if (Math.abs(now.getTime() - Date.now()) > 5000) {
    console.error('WARNING: Significant time drift detected!');
  }
};
validateServerTime();

// 2. CORS Configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 3. Firebase Initialization with Enhanced Error Handling
const initializeFirebase = () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FIREBASE_DATABASE_URL) {
    console.error('Missing Firebase configuration in .env');
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\\n/g, '\n')
    );
    
    if (!serviceAccount.private_key || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
      throw new Error('Invalid private key format');
    }
  } catch (error) {
    console.error('Firebase Service Account Error:', {
      message: error.message,
      sampleKey: process.env.FIREBASE_SERVICE_ACCOUNT?.substring(0, 50) + '...'
    });
    process.exit(1);
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    
    console.log('Firebase initialized successfully');
    return admin.database();
  } catch (error) {
    console.error('Firebase Initialization Error:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

const db = initializeFirebase();

// 4. Connection Monitoring
db.ref('.info/connected').on('value', (snap) => {
  console.log(`Firebase connection: ${snap.val()} at ${new Date().toISOString()}`);
});

// 5. Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.warn('No token provided at', new Date().toISOString());
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required',
      timestamp: new Date().toISOString()
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('JWT Verification Error:', {
        error: err.message,
        serverTime: new Date().toISOString(),
        tokenIssuedAt: decoded?.iat ? new Date(decoded.iat * 1000).toISOString() : 'N/A'
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid or expired token',
        detail: err.message
      });
    }
    req.user = decoded;
    next();
  });
};

// 6. API Endpoints

// Login Endpoint
app.post('/api/login', async (req, res) => {
  const { meter_number, password } = req.body;

  if (!meter_number || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing credentials',
      required: ['meter_number', 'password']
    });
  }

  try {
    const userRef = db.ref(`users/${meter_number}`);
    const snapshot = await userRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials'
      });
    }

    const user = snapshot.val();
    if (!user.password_hash) {
      return res.status(500).json({ 
        success: false, 
        message: 'User data error'
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { meter_number }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    console.log(`Successful login for meter: ${meter_number}`);
    res.json({ 
      success: true, 
      message: 'Login successful',
      token,
      expiresIn: 3600
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Protected Water Usage Endpoint
app.get('/api/water-usage', authenticateToken, async (req, res) => {
  const { meter_number } = req.user;

  try {
    const usageRef = db.ref(`water_usage/${meter_number}`);
    const snapshot = await usageRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(404).json({ 
        success: false, 
        message: 'No data available'
      });
    }

    res.json({ 
      success: true, 
      data: snapshot.val(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Water Usage Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// 7. Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    const timeSnapshot = await db.ref('.info/serverTimeOffset').once('value');
    res.json({
      status: 'healthy',
      serverTime: new Date().toISOString(),
      firebaseTimeOffset: timeSnapshot.val(),
      firebaseConnected: true
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      firebaseConnected: false
    });
  }
});

// 8. Server Startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS Origin: ${corsOptions.origin}`);
});

// 9. Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});