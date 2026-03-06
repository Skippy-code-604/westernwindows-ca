require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'ww-portal-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
}));

// Serve static files
app.use('/portal', express.static(path.join(__dirname, '..', 'src')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/email', require('./routes/email'));

// Serve the login page as the portal root
app.get('/portal', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'index.html'));
});

// Initialize database (just importing it runs the init)
require('./db');

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   Western Windows Portal                 ║
║   Running on http://localhost:${PORT}       ║
║   Portal: http://localhost:${PORT}/portal   ║
╚══════════════════════════════════════════╝
  `);
});
