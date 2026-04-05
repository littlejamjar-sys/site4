const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../config/middleware');

// GET /api/campsites — campsites within bounds (for map)
router.get('/campsites', (req, res) => {
    const db = req.app.locals.db;
    const { north, south, east, west, type } = req.query;

    if (!north || !south || !east || !west) {
        return res.json({ campsites: [] });
    }

    let sql = `SELECT id, name, latitude, longitude, type, cost_per_night, currency, rating_avg, rating_count,
        has_water, has_electric, has_toilet, has_shower, has_wifi, dog_friendly, verified
        FROM campsites WHERE status = 'approved'
        AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`;
    const params = [parseFloat(south), parseFloat(north), parseFloat(west), parseFloat(east)];

    if (type && type !== 'all') {
        sql += ' AND type = ?';
        params.push(type);
    }

    sql += ' LIMIT 500';
    const campsites = db.prepare(sql).all(...params);
    res.json({ campsites });
});

// GET /api/routes/waypoints/:slug — route waypoints for map
router.get('/routes/waypoints/:slug', (req, res) => {
    const db = req.app.locals.db;
    const route = db.prepare('SELECT waypoints FROM routes WHERE slug = ?').get(req.params.slug);
    if (!route) return res.status(404).json({ error: 'Route not found' });

    let waypoints = [];
    if (route.waypoints) {
        try { waypoints = JSON.parse(route.waypoints); } catch (e) {}
    }
    res.json({ waypoints });
});

// POST /api/votes — cast vote
router.post('/votes', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const { target_type, target_id, value } = req.body;

    if (!['post', 'reply'].includes(target_type)) return res.status(400).json({ error: 'Invalid target type' });
    if (!target_id) return res.status(400).json({ error: 'Target ID required' });
    if (![1, -1].includes(parseInt(value))) return res.status(400).json({ error: 'Invalid vote value' });

    const voteValue = parseInt(value);
    const targetId = parseInt(target_id);

    // Check if user already voted
    const existing = db.prepare('SELECT * FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?')
        .get(req.user.id, target_type, targetId);

    if (existing) {
        if (existing.value === voteValue) {
            // Remove vote (toggle off)
            db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id);
        } else {
            // Change vote
            db.prepare('UPDATE votes SET value = ? WHERE id = ?').run(voteValue, existing.id);
        }
    } else {
        // New vote
        db.prepare('INSERT INTO votes (user_id, target_type, target_id, value) VALUES (?, ?, ?, ?)')
            .run(req.user.id, target_type, targetId, voteValue);
    }

    // Get new score
    const score = db.prepare('SELECT COALESCE(SUM(value), 0) as score FROM votes WHERE target_type = ? AND target_id = ?')
        .get(target_type, targetId);

    // Update author reputation
    let authorId;
    if (target_type === 'post') {
        const post = db.prepare('SELECT author_id FROM forum_posts WHERE id = ?').get(targetId);
        if (post) authorId = post.author_id;
    } else {
        const reply = db.prepare('SELECT author_id FROM forum_replies WHERE id = ?').get(targetId);
        if (reply) authorId = reply.author_id;
    }

    if (authorId && authorId !== req.user.id) {
        // Recalculate reputation from all votes on all user's posts/replies
        const repFromPosts = db.prepare(`SELECT COALESCE(SUM(v.value), 0) as rep FROM votes v
            JOIN forum_posts fp ON v.target_type = 'post' AND v.target_id = fp.id
            WHERE fp.author_id = ?`).get(authorId);
        const repFromReplies = db.prepare(`SELECT COALESCE(SUM(v.value), 0) as rep FROM votes v
            JOIN forum_replies fr ON v.target_type = 'reply' AND v.target_id = fr.id
            WHERE fr.author_id = ?`).get(authorId);
        // Base reputation + vote reputation (don't let it go below 0)
        const totalVoteRep = (repFromPosts.rep || 0) + (repFromReplies.rep || 0);
        db.prepare('UPDATE users SET reputation = MAX(0, ?) WHERE id = ?').run(totalVoteRep, authorId);
    }

    // Get user's current vote state
    const userVote = db.prepare('SELECT value FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?')
        .get(req.user.id, target_type, targetId);

    res.json({ score: score.score, userVote: userVote ? userVote.value : 0 });
});

// GET /api/notifications — get notifications
router.get('/notifications', (req, res) => {
    if (!req.user) return res.json({ notifications: [], unreadCount: 0 });

    const db = req.app.locals.db;
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
    const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0').get(req.user.id).count;

    res.json({ notifications, unreadCount });
});

// POST /api/notifications/read — mark all as read
router.post('/notifications/read', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
});

// POST /api/notifications/:id/read — mark one as read
router.post('/notifications/:id/read', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
});

// GET /api/search — search endpoint
router.get('/search', (req, res) => {
    const db = req.app.locals.db;
    const q = req.query.q;
    if (!q || q.trim().length < 2) return res.json({ results: [] });

    const searchTerm = q.trim().replace(/[^\w\s]/g, '').split(/\s+/).join(' AND ');

    const results = [];

    try {
        const articles = db.prepare(`SELECT a.id, a.title, a.slug, a.summary, 'article' as result_type
            FROM articles_fts fts JOIN articles a ON fts.rowid = a.id
            WHERE articles_fts MATCH ? AND a.status = 'published' LIMIT 5`).all(searchTerm);
        results.push(...articles);
    } catch (e) {}

    try {
        const posts = db.prepare(`SELECT fp.id, fp.title, fp.slug, fp.category, 'forum_post' as result_type
            FROM forum_posts_fts fts JOIN forum_posts fp ON fts.rowid = fp.id
            WHERE forum_posts_fts MATCH ? LIMIT 5`).all(searchTerm);
        results.push(...posts);
    } catch (e) {}

    try {
        const campsites = db.prepare(`SELECT c.id, c.name as title, c.country, 'campsite' as result_type
            FROM campsites_fts fts JOIN campsites c ON fts.rowid = c.id
            WHERE campsites_fts MATCH ? AND c.status = 'approved' LIMIT 5`).all(searchTerm);
        results.push(...campsites);
    } catch (e) {}

    res.json({ results });
});

module.exports = router;
