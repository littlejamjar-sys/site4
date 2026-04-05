const express = require('express');
const router = express.Router();
const { ensureAuth, ensureRole } = require('../config/middleware');
const { uniqueSlug } = require('../utils/slugify');
const { renderMarkdown } = require('../utils/markdown');
const helpers = require('../utils/helpers');

const CATEGORIES = [
    { slug: 'general', name: 'General', icon: 'message-square', description: 'Chat about anything vanlife related' },
    { slug: 'routes', name: 'Routes & Travel', icon: 'map', description: 'Share and discuss travel routes' },
    { slug: 'conversions', name: 'Conversions & Builds', icon: 'wrench', description: 'Van conversion tips and questions' },
    { slug: 'mechanical', name: 'Mechanical & DIY', icon: 'settings', description: 'Mechanical repairs and maintenance' },
    { slug: 'wild-camping', name: 'Wild Camping', icon: 'tent', description: 'Wild camping spots and advice' },
    { slug: 'sell-swap', name: 'Buy/Sell/Swap', icon: 'shopping-bag', description: 'Buy, sell, or trade gear and vehicles' },
    { slug: 'meetups', name: 'Meetups & Events', icon: 'calendar', description: 'Organise and find vanlife meetups' },
];

// GET /forum — category listing
router.get('/', (req, res) => {
    const db = req.app.locals.db;
    const categoriesWithCounts = CATEGORIES.map(cat => {
        const stats = db.prepare(`SELECT COUNT(*) as post_count, MAX(created_at) as latest FROM forum_posts WHERE category = ?`).get(cat.slug);
        return { ...cat, postCount: stats.post_count, latestPost: stats.latest };
    });

    res.render('forum/index', { title: 'Forum', categories: categoriesWithCounts });
});

// GET /forum/new — new post form
router.get('/new', ensureAuth, (req, res) => {
    res.render('forum/new', { title: 'New Discussion', categories: CATEGORIES, errors: [], post: null });
});

// POST /forum — create post
router.post('/', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const { title, content, category } = req.body;
    const errors = [];

    if (!title || title.trim().length < 3) errors.push('Title must be at least 3 characters.');
    if (!content || content.trim().length < 5) errors.push('Content is required.');
    if (!category || !CATEGORIES.find(c => c.slug === category)) errors.push('Please select a valid category.');

    if (errors.length > 0) {
        return res.render('forum/new', { title: 'New Discussion', categories: CATEGORIES, errors, post: req.body });
    }

    const slug = uniqueSlug(title, db, 'forum_posts');
    db.prepare(`INSERT INTO forum_posts (author_id, title, slug, content, category) VALUES (?, ?, ?, ?, ?)`)
        .run(req.user.id, title.trim(), slug, content.trim(), category);

    req.flash('success', 'Discussion posted!');
    res.redirect(`/forum/${category}/${slug}`);
});

// GET /forum/:category — posts in category
router.get('/:category', (req, res) => {
    const db = req.app.locals.db;
    const cat = CATEGORIES.find(c => c.slug === req.params.category);
    if (!cat) return res.status(404).render('error', { title: '404', message: 'Category not found.', status: 404 });

    const page = parseInt(req.query.page) || 1;
    const sort = req.query.sort || 'newest';
    const perPage = 20;

    const total = db.prepare('SELECT COUNT(*) as count FROM forum_posts WHERE category = ?').get(cat.slug).count;
    const pagination = helpers.paginate(total, page, perPage);

    let orderBy = 'fp.pinned DESC, fp.created_at DESC';
    if (sort === 'active') orderBy = 'fp.pinned DESC, COALESCE(fp.last_reply_at, fp.created_at) DESC';
    if (sort === 'popular') orderBy = 'fp.pinned DESC, fp.reply_count DESC';

    const posts = db.prepare(`
        SELECT fp.*, u.username, u.display_name, u.avatar_path,
        (SELECT COALESCE(SUM(v.value), 0) FROM votes v WHERE v.target_type = 'post' AND v.target_id = fp.id) as vote_score
        FROM forum_posts fp
        JOIN users u ON fp.author_id = u.id
        WHERE fp.category = ?
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
    `).all(cat.slug, pagination.perPage, pagination.offset);

    const paginationQuery = sort !== 'newest' ? `sort=${sort}` : '';

    res.render('forum/category', { title: cat.name, category: cat, posts, pagination, paginationQuery, sort, allCategories: CATEGORIES });
});

// GET /forum/:category/:slug — single post
router.get('/:category/:slug', (req, res) => {
    const db = req.app.locals.db;
    const post = db.prepare(`
        SELECT fp.*, u.username, u.display_name, u.avatar_path, u.role as author_role, u.reputation,
        (SELECT COALESCE(SUM(v.value), 0) FROM votes v WHERE v.target_type = 'post' AND v.target_id = fp.id) as vote_score
        FROM forum_posts fp
        JOIN users u ON fp.author_id = u.id
        WHERE fp.slug = ?
    `).get(req.params.slug);

    if (!post) return res.status(404).render('error', { title: '404', message: 'Post not found.', status: 404 });

    db.prepare('UPDATE forum_posts SET view_count = view_count + 1 WHERE id = ?').run(post.id);

    // Get replies with vote scores
    const replies = db.prepare(`
        SELECT r.*, u.username, u.display_name, u.avatar_path, u.role as author_role, u.reputation,
        (SELECT COALESCE(SUM(v.value), 0) FROM votes v WHERE v.target_type = 'reply' AND v.target_id = r.id) as vote_score
        FROM forum_replies r
        JOIN users u ON r.author_id = u.id
        WHERE r.post_id = ?
        ORDER BY r.created_at ASC
    `).all(post.id);

    // Get user's existing votes
    let userVotes = {};
    if (req.user) {
        const votes = db.prepare(`SELECT target_type, target_id, value FROM votes WHERE user_id = ? AND (
            (target_type = 'post' AND target_id = ?) OR
            (target_type = 'reply' AND target_id IN (SELECT id FROM forum_replies WHERE post_id = ?))
        )`).all(req.user.id, post.id, post.id);
        votes.forEach(v => { userVotes[`${v.target_type}_${v.target_id}`] = v.value; });
    }

    post.contentHtml = renderMarkdown(post.content);
    replies.forEach(r => { r.contentHtml = renderMarkdown(r.content); });

    // Organize threaded replies
    const topLevel = replies.filter(r => !r.parent_reply_id);
    const childReplies = replies.filter(r => r.parent_reply_id);
    topLevel.forEach(r => {
        r.children = childReplies.filter(c => c.parent_reply_id === r.id);
    });

    const cat = CATEGORIES.find(c => c.slug === post.category);

    res.render('forum/show', { title: post.title, post, replies: topLevel, category: cat, userVotes });
});

// POST /forum/:category/:slug/reply
router.post('/:category/:slug/reply', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const post = db.prepare('SELECT * FROM forum_posts WHERE slug = ?').get(req.params.slug);
    if (!post) return res.status(404).render('error', { title: '404', message: 'Post not found.', status: 404 });
    if (post.locked && (!req.user || req.user.role !== 'admin')) {
        req.flash('error', 'This discussion is locked.');
        return res.redirect(`/forum/${post.category}/${post.slug}`);
    }

    const { content, parent_reply_id } = req.body;
    if (!content || content.trim().length < 2) {
        req.flash('error', 'Reply cannot be empty.');
        return res.redirect(`/forum/${post.category}/${post.slug}`);
    }

    db.prepare(`INSERT INTO forum_replies (post_id, author_id, content, parent_reply_id) VALUES (?, ?, ?, ?)`)
        .run(post.id, req.user.id, content.trim(), parent_reply_id || null);

    db.prepare('UPDATE forum_posts SET reply_count = reply_count + 1, last_reply_at = CURRENT_TIMESTAMP WHERE id = ?').run(post.id);

    // Notify post author
    if (post.author_id !== req.user.id) {
        db.prepare(`INSERT INTO notifications (user_id, type, message, link) VALUES (?, 'reply', ?, ?)`)
            .run(post.author_id, `${req.user.display_name || req.user.username} replied to your post "${post.title}"`, `/forum/${post.category}/${post.slug}`);
    }

    // Notify parent reply author if threaded
    if (parent_reply_id) {
        const parentReply = db.prepare('SELECT author_id FROM forum_replies WHERE id = ?').get(parent_reply_id);
        if (parentReply && parentReply.author_id !== req.user.id && parentReply.author_id !== post.author_id) {
            db.prepare(`INSERT INTO notifications (user_id, type, message, link) VALUES (?, 'reply', ?, ?)`)
                .run(parentReply.author_id, `${req.user.display_name || req.user.username} replied to your comment`, `/forum/${post.category}/${post.slug}`);
        }
    }

    // Award reputation to post author
    if (post.author_id !== req.user.id) {
        db.prepare('UPDATE users SET reputation = reputation + 1 WHERE id = ?').run(post.author_id);
    }

    res.redirect(`/forum/${post.category}/${post.slug}#replies`);
});

// POST /forum/:category/:slug/pin (admin)
router.post('/:category/:slug/pin', ensureRole('admin'), (req, res) => {
    const db = req.app.locals.db;
    const post = db.prepare('SELECT * FROM forum_posts WHERE slug = ?').get(req.params.slug);
    if (!post) return res.status(404).render('error', { title: '404', message: 'Post not found.', status: 404 });
    db.prepare('UPDATE forum_posts SET pinned = ? WHERE id = ?').run(post.pinned ? 0 : 1, post.id);
    req.flash('success', post.pinned ? 'Post unpinned.' : 'Post pinned.');
    res.redirect(`/forum/${post.category}/${post.slug}`);
});

// POST /forum/:category/:slug/lock (admin)
router.post('/:category/:slug/lock', ensureRole('admin'), (req, res) => {
    const db = req.app.locals.db;
    const post = db.prepare('SELECT * FROM forum_posts WHERE slug = ?').get(req.params.slug);
    if (!post) return res.status(404).render('error', { title: '404', message: 'Post not found.', status: 404 });
    db.prepare('UPDATE forum_posts SET locked = ? WHERE id = ?').run(post.locked ? 0 : 1, post.id);
    req.flash('success', post.locked ? 'Post unlocked.' : 'Post locked.');
    res.redirect(`/forum/${post.category}/${post.slug}`);
});

// POST /forum/:category/:slug/delete (admin)
router.post('/:category/:slug/delete', ensureRole('admin'), (req, res) => {
    const db = req.app.locals.db;
    const post = db.prepare('SELECT * FROM forum_posts WHERE slug = ?').get(req.params.slug);
    if (!post) return res.status(404).render('error', { title: '404', message: 'Post not found.', status: 404 });
    db.prepare('DELETE FROM forum_posts WHERE id = ?').run(post.id);
    req.flash('success', 'Post deleted.');
    res.redirect(`/forum/${post.category}`);
});

module.exports = router;
