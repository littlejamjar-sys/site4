// Update last_seen timestamp for logged-in users
function updateLastSeen(db) {
    return (req, res, next) => {
        if (req.user) {
            db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.id);
        }
        next();
    };
}

// Inject user-related data into all views
function injectUserData(db) {
    return (req, res, next) => {
        res.locals.currentUser = req.user || null;
        res.locals.isAuthenticated = req.isAuthenticated();

        // Inject unread notification count for logged-in users
        if (req.user) {
            const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id);
            res.locals.unreadNotifications = result.count;
        } else {
            res.locals.unreadNotifications = 0;
        }
        next();
    };
}

// Inject template helpers
function injectHelpers(req, res, next) {
    const helpers = require('../utils/helpers');
    res.locals.helpers = helpers;
    res.locals.currentPath = req.path;
    next();
}

// Auth guard middleware
function ensureAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash('error', 'Please log in to continue.');
    req.session.returnTo = req.originalUrl;
    res.redirect('/auth/login');
}

// Role guard middleware
function ensureRole(...roles) {
    return (req, res, next) => {
        if (!req.isAuthenticated()) {
            req.flash('error', 'Please log in to continue.');
            req.session.returnTo = req.originalUrl;
            return res.redirect('/auth/login');
        }
        if (!roles.includes(req.user.role)) {
            req.flash('error', 'You do not have permission to access this page.');
            return res.redirect('/');
        }
        next();
    };
}

module.exports = { updateLastSeen, injectUserData, injectHelpers, ensureAuth, ensureRole };
