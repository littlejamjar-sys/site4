const express = require('express');
const router = express.Router();
const { ensureRole } = require('../config/middleware');

// All admin routes require admin role
router.use(ensureRole('admin'));

// GET /admin — dashboard
router.get('/', (req, res) => {
    const db = req.app.locals.db;

    const stats = {
        users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
        articles: db.prepare('SELECT COUNT(*) as count FROM articles').get().count,
        publishedArticles: db.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'published'").get().count,
        forumPosts: db.prepare('SELECT COUNT(*) as count FROM forum_posts').get().count,
        forumReplies: db.prepare('SELECT COUNT(*) as count FROM forum_replies').get().count,
        campsites: db.prepare('SELECT COUNT(*) as count FROM campsites').get().count,
        approvedCampsites: db.prepare("SELECT COUNT(*) as count FROM campsites WHERE status = 'approved'").get().count,
        pendingCampsites: db.prepare("SELECT COUNT(*) as count FROM campsites WHERE status = 'pending'").get().count,
        routes: db.prepare('SELECT COUNT(*) as count FROM routes').get().count,
        builds: db.prepare('SELECT COUNT(*) as count FROM builds').get().count,
    };

    const recentUsers = db.prepare('SELECT id, username, display_name, email, role, created_at, last_seen FROM users ORDER BY created_at DESC LIMIT 10').all();
    const recentArticles = db.prepare("SELECT a.*, u.username FROM articles a JOIN users u ON a.author_id = u.id ORDER BY a.created_at DESC LIMIT 10").all();
    const pendingCampsites = db.prepare("SELECT c.*, u.username FROM campsites c JOIN users u ON c.submitted_by = u.id WHERE c.status = 'pending' ORDER BY c.created_at DESC LIMIT 10").all();

    res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        stats,
        recentUsers,
        recentArticles,
        pendingCampsites,
    });
});

// POST /admin/users/:id/role — change user role
router.post('/users/:id/role', (req, res) => {
    const db = req.app.locals.db;
    const { role } = req.body;
    const validRoles = ['member', 'contributor', 'admin'];
    if (!validRoles.includes(role)) {
        req.flash('error', 'Invalid role.');
        return res.redirect('/admin');
    }

    const userId = parseInt(req.params.id);
    if (userId === req.user.id) {
        req.flash('error', 'You cannot change your own role.');
        return res.redirect('/admin');
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    req.flash('success', 'User role updated.');
    res.redirect('/admin');
});

// POST /admin/campsites/:id/approve
router.post('/campsites/:id/approve', (req, res) => {
    const db = req.app.locals.db;
    db.prepare("UPDATE campsites SET status = 'approved' WHERE id = ?").run(parseInt(req.params.id));
    req.flash('success', 'Campsite approved.');
    res.redirect('/admin');
});

// POST /admin/campsites/:id/reject
router.post('/campsites/:id/reject', (req, res) => {
    const db = req.app.locals.db;
    db.prepare("UPDATE campsites SET status = 'rejected' WHERE id = ?").run(parseInt(req.params.id));
    req.flash('success', 'Campsite rejected.');
    res.redirect('/admin');
});

// POST /admin/articles/:id/feature
router.post('/articles/:id/feature', (req, res) => {
    const db = req.app.locals.db;
    const article = db.prepare('SELECT id, featured FROM articles WHERE id = ?').get(parseInt(req.params.id));
    if (article) {
        db.prepare('UPDATE articles SET featured = ? WHERE id = ?').run(article.featured ? 0 : 1, article.id);
        req.flash('success', article.featured ? 'Article unfeatured.' : 'Article featured.');
    }
    res.redirect('/admin');
});

module.exports = router;
