require('dotenv').config();
const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const cors = require('cors');
const store = require('./firestore');

const app = express();

// Trust Firebase Hosting / Cloud Run reverse proxy
app.set('trust proxy', 1);

// Don't leak framework info
app.disable('x-powered-by');

// CORS — only allow our own domains
const ALLOWED_ORIGINS = [
    'https://western-windows-ca.web.app',
    'https://western-windows-ca.firebaseapp.com',
    'https://westernwindows.ca',
    'https://www.westernwindows.ca',
];
if (process.env.LOCAL_DEV === 'true') {
    ALLOWED_ORIGINS.push('http://localhost:3000');
}
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS blocked'));
        }
    },
    credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Prevent CDN caching of API responses
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    next();
});

// Seed suppliers on first request
let seeded = false;
app.use(async (req, res, next) => {
    if (!seeded) {
        try {
            await store.seedSuppliers();
            seeded = true;
        } catch (err) {
            console.error('Seed error:', err);
        }
    }
    next();
});

// Health check (public)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth check (public — returns user info if token is valid)
app.get('/api/auth/check', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({ authenticated: false });
    }
    try {
        const admin = store.getAdmin();
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        res.json({ authenticated: true, email: decoded.email, name: decoded.name });
    } catch (err) {
        res.json({ authenticated: false });
    }
});

// API Routes (auth handled inside each route via requireAuth middleware)
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/email', require('./routes/email'));
app.use('/api/google-reviews', require('./routes/google-reviews'));

// Export as Firebase Cloud Function
exports.api = onRequest({
    region: 'us-west1',
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_CC', 'DRIVE_ROOT_FOLDER_ID', 'DRIVE_IMPERSONATE_EMAIL', 'DRIVE_SA_KEY'],
}, app);

// --- Local development server ---
if (process.env.LOCAL_DEV === 'true') {
    const path = require('path');
    const port = process.env.PORT || 3000;

    // Serve static frontend files locally (src/ is the hosting root)
    app.use(express.static(path.join(__dirname, '..', 'src')));

    app.listen(port, () => {
        console.log(`\n╔══════════════════════════════════════════╗`);
        console.log(`║   Western Windows Portal (Local Dev)     ║`);
        console.log(`║   Running on http://localhost:${port}       ║`);
        console.log(`║   Portal: http://localhost:${port}/portal   ║`);
        console.log(`║   Using Firestore + Firebase Auth        ║`);
        console.log(`╚══════════════════════════════════════════╝\n`);
    });
}
