const express = require('express');
const router = express.Router();
const { renderMarkdown } = require('../utils/markdown');
const helpers = require('../utils/helpers');

// GET / — Homepage
router.get('/', (req, res) => {
    const db = req.app.locals.db;

    // Featured/latest articles
    const featuredArticles = db.prepare(`
        SELECT a.*, u.username, u.display_name, u.avatar_path
        FROM articles a
        JOIN users u ON a.author_id = u.id
        WHERE a.status = 'published'
        ORDER BY a.featured DESC, a.published_at DESC
        LIMIT 3
    `).all();

    // Recent forum posts
    const recentPosts = db.prepare(`
        SELECT fp.*, u.username, u.display_name, u.avatar_path
        FROM forum_posts fp
        JOIN users u ON fp.author_id = u.id
        ORDER BY fp.created_at DESC
        LIMIT 5
    `).all();

    // Latest approved campsites
    const latestCampsites = db.prepare(`
        SELECT * FROM campsites WHERE status = 'approved' ORDER BY created_at DESC LIMIT 5
    `).all();

    // Latest builds
    const latestBuilds = db.prepare(`
        SELECT b.*, u.username, u.display_name, u.avatar_path
        FROM builds b
        JOIN users u ON b.owner_id = u.id
        ORDER BY b.created_at DESC
        LIMIT 3
    `).all();

    // Community stats
    const stats = {
        users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
        campsites: db.prepare("SELECT COUNT(*) as count FROM campsites WHERE status = 'approved'").get().count,
        routes: db.prepare('SELECT COUNT(*) as count FROM routes').get().count,
        builds: db.prepare('SELECT COUNT(*) as count FROM builds').get().count,
        posts: db.prepare('SELECT COUNT(*) as count FROM forum_posts').get().count,
    };

    res.render('index', {
        title: null,
        featuredArticles,
        recentPosts,
        latestCampsites,
        latestBuilds,
        stats,
        needsMap: true,
    });
});

// GET /search
router.get('/search', (req, res) => {
    const db = req.app.locals.db;
    const query = (req.query.q || '').trim();
    const type = req.query.type || 'all';

    if (!query) {
        return res.render('search', { title: 'Search', query: '', results: {}, type });
    }

    const searchTerm = query.replace(/['"]/g, '').split(/\s+/).map(w => `"${w}"*`).join(' ');
    const results = {};

    if (type === 'all' || type === 'articles') {
        try {
            results.articles = db.prepare(`
                SELECT a.*, u.username, u.display_name, u.avatar_path
                FROM articles_fts fts
                JOIN articles a ON a.id = fts.rowid
                JOIN users u ON a.author_id = u.id
                WHERE articles_fts MATCH ? AND a.status = 'published'
                ORDER BY rank
                LIMIT 10
            `).all(searchTerm);
        } catch { results.articles = []; }
    }

    if (type === 'all' || type === 'forum') {
        try {
            results.forum = db.prepare(`
                SELECT fp.*, u.username, u.display_name
                FROM forum_posts_fts fts
                JOIN forum_posts fp ON fp.id = fts.rowid
                JOIN users u ON fp.author_id = u.id
                WHERE forum_posts_fts MATCH ?
                ORDER BY rank
                LIMIT 10
            `).all(searchTerm);
        } catch { results.forum = []; }
    }

    if (type === 'all' || type === 'campsites') {
        try {
            results.campsites = db.prepare(`
                SELECT c.*
                FROM campsites_fts fts
                JOIN campsites c ON c.id = fts.rowid
                WHERE campsites_fts MATCH ? AND c.status = 'approved'
                ORDER BY rank
                LIMIT 10
            `).all(searchTerm);
        } catch { results.campsites = []; }
    }

    if (type === 'all' || type === 'routes') {
        try {
            results.routes = db.prepare(`
                SELECT r.*, u.username, u.display_name
                FROM routes_fts fts
                JOIN routes r ON r.id = fts.rowid
                JOIN users u ON r.author_id = u.id
                WHERE routes_fts MATCH ?
                ORDER BY rank
                LIMIT 10
            `).all(searchTerm);
        } catch { results.routes = []; }
    }

    res.render('search', { title: `Search: ${query}`, query, results, type });
});

module.exports = router;
