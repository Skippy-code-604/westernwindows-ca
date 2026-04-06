// Auth middleware — Firebase Auth token verification
const { getAdmin } = require('./firestore');

async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No auth token provided' });
    }

    try {
        const admin = getAdmin();
        const token = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { requireAuth };
