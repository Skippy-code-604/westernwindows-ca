// Simple auth middleware for the portal
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/portal/login');
}

module.exports = { requireAuth };
