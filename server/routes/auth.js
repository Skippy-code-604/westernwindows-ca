const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.PORTAL_USERNAME || 'western';
    const validPass = process.env.PORTAL_PASSWORD || 'windows2026';

    if (username === validUser && password === validPass) {
        req.session.authenticated = true;
        req.session.user = username;
        return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

router.get('/check', (req, res) => {
    res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
