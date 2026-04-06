const express = require('express');
const router = express.Router();

// Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    const validUser = process.env.PORTAL_USERNAME || 'western';
    const validPass = process.env.PORTAL_PASSWORD || 'windows2026';

    if (username === validUser && password === validPass) {
        req.session.authenticated = true;
        return res.json({ success: true });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// Logout
router.post('/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
});

// Check auth status
router.get('/check', (req, res) => {
    console.log('Auth check - session:', JSON.stringify(req.session), 'cookies:', req.headers.cookie);
    res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
