const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth, ensureRole } = require('../config/middleware');
const { uniqueSlug } = require('../utils/slugify');
const { renderMarkdown } = require('../utils/markdown');
const { processCoverImage, deleteImage } = require('../utils/images');
const helpers = require('../utils/helpers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
}});

const CATEGORIES = ['routes', 'conversions', 'gear', 'lifestyle', 'tips'];

// GET /articles — listing
router.get('/', (req, res) => {
    const db = req.app.locals.db;
    const category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const perPage = 12;

    let countSql = "SELECT COUNT(*) as count FROM articles WHERE status = 'published'";
    let listSql = `SELECT a.*, u.username, u.display_name, u.avatar_path FROM articles a JOIN users u ON a.author_id = u.id WHERE a.status = 'published'`;
    const params = [];

    if (category && CATEGORIES.includes(category)) {
        countSql += ' AND category = ?';
        listSql += ' AND a.category = ?';
        params.push(category);
    }

    const total = db.prepare(countSql).get(...params).count;
    const pagination = helpers.paginate(total, page, perPage);

    listSql += ' ORDER BY a.featured DESC, a.published_at DESC LIMIT ? OFFSET ?';
    const articles = db.prepare(listSql).all(...params, pagination.perPage, pagination.offset);

    const paginationQuery = category ? `category=${category}` : '';

    res.render('articles/index', {
        title: 'Magazine',
        articles,
        categories: CATEGORIES,
        currentCategory: category || null,
        pagination,
        paginationQuery,
    });
});

// GET /articles/new — create form
router.get('/new', ensureRole('admin', 'contributor'), (req, res) => {
    res.render('articles/editor', {
        title: 'New Article',
        article: null,
        categories: CATEGORIES,
        errors: [],
        needsEditor: true,
    });
});

// POST /articles — create
router.post('/', ensureRole('admin', 'contributor'), upload.single('cover_image'), async (req, res) => {
    const db = req.app.locals.db;
    const { title, summary, content, category, tags, status } = req.body;
    const errors = [];

    if (!title || title.trim().length < 3) errors.push('Title must be at least 3 characters.');
    if (!content || content.trim().length < 10) errors.push('Content is required.');
    if (!category || !CATEGORIES.includes(category)) errors.push('Please select a valid category.');

    if (errors.length > 0) {
        return res.render('articles/editor', { title: 'New Article', article: req.body, categories: CATEGORIES, errors, needsEditor: true });
    }

    const slug = uniqueSlug(title, db, 'articles');
    let cover_image = null;
    if (req.file) {
        try { cover_image = await processCoverImage(req.file, 'articles'); } catch (err) { console.error('Cover image error:', err); }
    }

    const articleStatus = (status === 'published') ? 'published' : 'draft';
    const published_at = articleStatus === 'published' ? new Date().toISOString() : null;

    db.prepare(`INSERT INTO articles (author_id, title, slug, summary, content, cover_image, category, tags, status, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(req.user.id, title.trim(), slug, summary || null, content.trim(), cover_image, category, tags || null, articleStatus, published_at);

    if (articleStatus === 'published') {
        db.prepare('UPDATE users SET reputation = reputation + 10 WHERE id = ?').run(req.user.id);
    }

    req.flash('success', articleStatus === 'published' ? 'Article published!' : 'Draft saved.');
    res.redirect(`/articles/${slug}`);
});

// GET /articles/:slug — single article
router.get('/:slug', (req, res) => {
    const db = req.app.locals.db;
    const article = db.prepare(`SELECT a.*, u.username, u.display_name, u.avatar_path, u.bio FROM articles a JOIN users u ON a.author_id = u.id WHERE a.slug = ?`).get(req.params.slug);

    if (!article) return res.status(404).render('error', { title: '404', message: 'Article not found.', status: 404 });
    if (article.status !== 'published' && (!req.user || (req.user.id !== article.author_id && req.user.role !== 'admin'))) {
        return res.status(404).render('error', { title: '404', message: 'Article not found.', status: 404 });
    }

    db.prepare('UPDATE articles SET view_count = view_count + 1 WHERE id = ?').run(article.id);

    const related = db.prepare(`SELECT a.*, u.username, u.display_name, u.avatar_path FROM articles a JOIN users u ON a.author_id = u.id WHERE a.category = ? AND a.id != ? AND a.status = 'published' ORDER BY a.published_at DESC LIMIT 3`).all(article.category, article.id);

    article.contentHtml = renderMarkdown(article.content);

    res.render('articles/show', { title: article.title, article, related, description: article.summary });
});

// GET /articles/:slug/edit
router.get('/:slug/edit', ensureRole('admin', 'contributor'), (req, res) => {
    const db = req.app.locals.db;
    const article = db.prepare('SELECT * FROM articles WHERE slug = ?').get(req.params.slug);
    if (!article) return res.status(404).render('error', { title: '404', message: 'Article not found.', status: 404 });
    if (req.user.id !== article.author_id && req.user.role !== 'admin') {
        req.flash('error', 'You can only edit your own articles.');
        return res.redirect(`/articles/${article.slug}`);
    }
    res.render('articles/editor', { title: 'Edit Article', article, categories: CATEGORIES, errors: [], needsEditor: true });
});

// POST /articles/:slug/edit
router.post('/:slug/edit', ensureRole('admin', 'contributor'), upload.single('cover_image'), async (req, res) => {
    const db = req.app.locals.db;
    const article = db.prepare('SELECT * FROM articles WHERE slug = ?').get(req.params.slug);
    if (!article) return res.status(404).render('error', { title: '404', message: 'Article not found.', status: 404 });
    if (req.user.id !== article.author_id && req.user.role !== 'admin') {
        req.flash('error', 'You can only edit your own articles.');
        return res.redirect(`/articles/${article.slug}`);
    }

    const { title, summary, content, category, tags, status } = req.body;
    const errors = [];
    if (!title || title.trim().length < 3) errors.push('Title must be at least 3 characters.');
    if (!content || content.trim().length < 10) errors.push('Content is required.');
    if (!category || !CATEGORIES.includes(category)) errors.push('Please select a valid category.');

    if (errors.length > 0) {
        return res.render('articles/editor', { title: 'Edit Article', article: { ...article, ...req.body }, categories: CATEGORIES, errors, needsEditor: true });
    }

    const slug = uniqueSlug(title, db, 'articles', article.id);
    let cover_image = article.cover_image;
    if (req.file) {
        try {
            cover_image = await processCoverImage(req.file, 'articles');
            if (article.cover_image) deleteImage(article.cover_image);
        } catch (err) { console.error('Cover image error:', err); }
    }

    const articleStatus = (status === 'published') ? 'published' : 'draft';
    let published_at = article.published_at;
    if (articleStatus === 'published' && !article.published_at) {
        published_at = new Date().toISOString();
    }

    db.prepare(`UPDATE articles SET title = ?, slug = ?, summary = ?, content = ?, cover_image = ?, category = ?, tags = ?, status = ?, published_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(title.trim(), slug, summary || null, content.trim(), cover_image, category, tags || null, articleStatus, published_at, article.id);

    req.flash('success', 'Article updated.');
    res.redirect(`/articles/${slug}`);
});

// POST /articles/:slug/delete
router.post('/:slug/delete', ensureRole('admin'), (req, res) => {
    const db = req.app.locals.db;
    const article = db.prepare('SELECT * FROM articles WHERE slug = ?').get(req.params.slug);
    if (!article) return res.status(404).render('error', { title: '404', message: 'Article not found.', status: 404 });
    if (article.cover_image) deleteImage(article.cover_image);
    db.prepare('DELETE FROM articles WHERE id = ?').run(article.id);
    req.flash('success', 'Article deleted.');
    res.redirect('/articles');
});

module.exports = router;
