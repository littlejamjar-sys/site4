const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { ensureAuth } = require('../config/middleware');
const { processAvatar, deleteImage } = require('../utils/images');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
}});

// GET /auth/register
router.get('/register', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/');
    res.render('auth/register', { title: 'Join', errors: [] });
});

// POST /auth/register
router.post('/register', upload.none(), async (req, res) => {
    const db = req.app.locals.db;
    const { username, email, password, password_confirm } = req.body;
    const errors = [];

    if (!username || username.length < 3 || username.length > 30) errors.push('Username must be 3-30 characters.');
    if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) errors.push('Username can only contain letters, numbers, hyphens and underscores.');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Please enter a valid email address.');
    if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
    if (password !== password_confirm) errors.push('Passwords do not match.');

    if (errors.length === 0) {
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) errors.push('Username or email already taken.');
    }

    if (errors.length > 0) {
        return res.render('auth/register', { title: 'Join', errors, username, email });
    }

    const password_hash = bcrypt.hashSync(password, 12);
    const result = db.prepare('INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)').run(username, email, password_hash, username);

        // Fetch the newly created user from DB (required for proper Passport serialization)
    const newUser = db.prepare('SELECT id, username, email, display_name, bio, avatar_path, location, van_name, van_type, role, reputation, created_at, last_seen FROM users WHERE id = ?').get(result.lastInsertRowid);

    console.log('DEBUG: About to login user:', newUser); req.login(newUser, (err) => { if (err) console.log('DEBUG: Login error:', err);
        if (err) {
            req.flash('error', 'Registration succeeded but login failed. Please log in.');
            return res.redirect('/auth/login');
        }
        req.flash('success', 'Welcome to The Overland Post!');
        res.redirect('/');
    });
});

// GET /auth/login
router.get('/login', (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/');
    res.render('auth/login', { title: 'Log In', errors: [] });
});

// POST /auth/login
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.render('auth/login', { title: 'Log In', errors: [info.message || 'Invalid credentials.'], email: req.body.email });
        }
        req.login(user, (err) => {
            if (err) {
                return next(err);
            }
            const returnTo = req.session.returnTo || '/';
            delete req.session.returnTo;
            req.flash('success', `Welcome back, ${user.display_name || user.username}!`);
            // Ensure session is saved before redirect
            req.session.save((saveErr) => {
                if (saveErr) console.error('Session save error:', saveErr);
                res.redirect(returnTo);
            });
        });
    })(req, res, next);
});

// GET /auth/logout
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) console.error('Logout error:', err);
        req.flash('success', 'You have been logged out.');
        res.redirect('/');
    });
});

// GET /auth/profile
router.get('/profile', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const posts = db.prepare('SELECT * FROM forum_posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 10').all(req.user.id);
    const builds = db.prepare('SELECT * FROM builds WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id);
    const campsites = db.prepare('SELECT * FROM campsites WHERE submitted_by = ? ORDER BY created_at DESC').all(req.user.id);
    res.render('auth/profile', { title: 'Your Profile', profileUser: user, posts, builds, campsites, errors: [] });
});

// POST /auth/profile
router.post('/profile', ensureAuth, upload.single('avatar'), async (req, res) => {
    const db = req.app.locals.db;
    const { display_name, bio, location, van_name, van_type } = req.body;
    const errors = [];

    if (display_name && display_name.length > 50) errors.push('Display name must be under 50 characters.');
    if (bio && bio.length > 500) errors.push('Bio must be under 500 characters.');

    if (errors.length > 0) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const posts = db.prepare('SELECT * FROM forum_posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 10').all(req.user.id);
        const builds = db.prepare('SELECT * FROM builds WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id);
        const campsites = db.prepare('SELECT * FROM campsites WHERE submitted_by = ? ORDER BY created_at DESC').all(req.user.id);
        return res.render('auth/profile', { title: 'Your Profile', profileUser: user, posts, builds, campsites, errors });
    }

    let avatar_path = undefined;
    if (req.file) {
        try {
            avatar_path = await processAvatar(req.file);
            // Delete old avatar
            const oldUser = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(req.user.id);
            if (oldUser && oldUser.avatar_path) deleteImage(oldUser.avatar_path);
        } catch (err) {
            console.error('Avatar processing error:', err);
        }
    }

    if (avatar_path) {
        db.prepare('UPDATE users SET display_name = ?, bio = ?, location = ?, van_name = ?, van_type = ?, avatar_path = ? WHERE id = ?')
            .run(display_name || null, bio || null, location || null, van_name || null, van_type || null, avatar_path, req.user.id);
    } else {
        db.prepare('UPDATE users SET display_name = ?, bio = ?, location = ?, van_name = ?, van_type = ? WHERE id = ?')
            .run(display_name || null, bio || null, location || null, van_name || null, van_type || null, req.user.id);
    }

    // Handle password change
    if (req.body.new_password) {
        if (req.body.new_password.length < 8) {
            req.flash('error', 'New password must be at least 8 characters.');
            return res.redirect('/auth/profile');
        }
        if (req.body.new_password !== req.body.new_password_confirm) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect('/auth/profile');
        }
        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
        if (!bcrypt.compareSync(req.body.current_password || '', user.password_hash)) {
            req.flash('error', 'Current password is incorrect.');
            return res.redirect('/auth/profile');
        }
        const newHash = bcrypt.hashSync(req.body.new_password, 12);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    }

    req.flash('success', 'Profile updated successfully.');
    res.redirect('/auth/profile');
});

// GET /auth/user/:username (public profile)
router.get('/user/:username', (req, res) => {
    const db = req.app.locals.db;
    const user = db.prepare('SELECT id, username, display_name, bio, avatar_path, location, van_name, van_type, role, reputation, created_at FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).render('error', { title: '404', message: 'User not found.', status: 404 });

    const posts = db.prepare('SELECT * FROM forum_posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);
    const builds = db.prepare(`SELECT b.*, u.username, u.display_name, u.avatar_path FROM builds b JOIN users u ON b.owner_id = u.id WHERE b.owner_id = ? ORDER BY b.created_at DESC`).all(user.id);
    const articles = db.prepare(`SELECT a.*, u.username, u.display_name, u.avatar_path FROM articles a JOIN users u ON a.author_id = u.id WHERE a.author_id = ? AND a.status = 'published' ORDER BY a.published_at DESC LIMIT 10`).all(user.id);
    res.render('auth/public-profile', { title: user.display_name || user.username, profileUser: user, posts, builds, articles });
});

module.exports = router;
