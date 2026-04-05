const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth } = require('../config/middleware');
const { uniqueSlug } = require('../utils/slugify');
const { renderMarkdown } = require('../utils/markdown');
const { processCoverImage, processContentImage, deleteImage } = require('../utils/images');
const helpers = require('../utils/helpers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
}});

const STATUSES = ['in-progress', 'complete', 'planning'];

// GET /builds — gallery listing
router.get('/', (req, res) => {
    const db = req.app.locals.db;
    const page = parseInt(req.query.page) || 1;
    const perPage = 12;
    const status = req.query.status;
    const mine = req.query.mine;

    let countSql = 'SELECT COUNT(*) as count FROM builds';
    let listSql = `SELECT b.*, u.username, u.display_name, u.avatar_path FROM builds b JOIN users u ON b.owner_id = u.id`;
    const conditions = [];
    const params = [];

    if (mine && req.user) {
        conditions.push('b.owner_id = ?');
        params.push(req.user.id);
    }
    if (status && STATUSES.includes(status)) {
        conditions.push('b.status = ?');
        params.push(status);
    }

    if (conditions.length > 0) {
        const where = ' WHERE ' + conditions.join(' AND ');
        countSql += where.replace(/b\./g, '');
        listSql += where;
    }

    const total = db.prepare(countSql).get(...params).count;
    const pagination = helpers.paginate(total, page, perPage);

    listSql += ' ORDER BY b.updated_at DESC LIMIT ? OFFSET ?';
    const builds = db.prepare(listSql).all(...params, pagination.perPage, pagination.offset);

    const paginationParts = [];
    if (status) paginationParts.push(`status=${status}`);
    if (mine) paginationParts.push('mine=1');
    const paginationQuery = paginationParts.join('&');

    res.render('builds/index', {
        title: mine && req.user ? 'My Builds' : 'Van Builds',
        builds,
        statuses: STATUSES,
        currentStatus: status || null,
        showingMine: !!(mine && req.user),
        pagination,
        paginationQuery,
    });
});

// GET /builds/new — create form
router.get('/new', ensureAuth, (req, res) => {
    res.render('builds/editor', {
        title: 'Start a Build Log',
        build: null,
        statuses: STATUSES,
        errors: [],
    });
});

// POST /builds — create
router.post('/', ensureAuth, upload.single('cover_image'), async (req, res) => {
    const db = req.app.locals.db;
    const { title, description, base_vehicle, year, status, total_cost, currency } = req.body;
    const errors = [];

    if (!title || title.trim().length < 3) errors.push('Title must be at least 3 characters.');

    if (errors.length > 0) {
        return res.render('builds/editor', { title: 'Start a Build Log', build: req.body, statuses: STATUSES, errors });
    }

    const slug = uniqueSlug(title, db, 'builds');
    let cover_image = null;
    if (req.file) {
        try { cover_image = await processCoverImage(req.file, 'builds'); } catch (err) { console.error('Cover image error:', err); }
    }

    db.prepare(`INSERT INTO builds (owner_id, title, slug, description, base_vehicle, year, status, total_cost, currency, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(req.user.id, title.trim(), slug, description || null, base_vehicle || null,
            year ? parseInt(year) : null, status && STATUSES.includes(status) ? status : 'in-progress',
            total_cost ? parseFloat(total_cost) : null, currency || 'EUR', cover_image);

    req.flash('success', 'Build log created!');
    res.redirect(`/builds/${slug}`);
});

// GET /builds/:slug — detail
router.get('/:slug', (req, res) => {
    const db = req.app.locals.db;
    const build = db.prepare(`SELECT b.*, u.username, u.display_name, u.avatar_path
        FROM builds b JOIN users u ON b.owner_id = u.id WHERE b.slug = ?`).get(req.params.slug);

    if (!build) return res.status(404).render('error', { title: '404', message: 'Build not found.', status: 404 });

    const entries = db.prepare('SELECT * FROM build_entries WHERE build_id = ? ORDER BY entry_order ASC, created_at ASC').all(build.id);

    // Get photos for each entry
    entries.forEach(entry => {
        entry.photos = db.prepare('SELECT * FROM build_photos WHERE entry_id = ? ORDER BY created_at').all(entry.id);
        entry.contentHtml = renderMarkdown(entry.content);
    });

    // General build photos (not tied to an entry)
    const photos = db.prepare('SELECT * FROM build_photos WHERE build_id = ? AND entry_id IS NULL ORDER BY created_at').all(build.id);

    // Calculate totals from entries
    const entryTotals = db.prepare('SELECT COALESCE(SUM(cost), 0) as total_cost, COALESCE(SUM(hours_spent), 0) as total_hours FROM build_entries WHERE build_id = ?').get(build.id);

    const isOwner = req.user && req.user.id === build.owner_id;

    res.render('builds/show', {
        title: build.title,
        build,
        entries,
        photos,
        entryTotals,
        isOwner,
        description: build.description ? helpers.truncate(build.description, 160) : null,
    });
});

// GET /builds/:slug/edit — edit build
router.get('/:slug/edit', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const build = db.prepare('SELECT * FROM builds WHERE slug = ?').get(req.params.slug);
    if (!build) return res.status(404).render('error', { title: '404', message: 'Build not found.', status: 404 });
    if (req.user.id !== build.owner_id && req.user.role !== 'admin') {
        req.flash('error', 'You can only edit your own builds.');
        return res.redirect(`/builds/${build.slug}`);
    }
    res.render('builds/editor', { title: 'Edit Build', build, statuses: STATUSES, errors: [] });
});

// POST /builds/:slug/edit — update build
router.post('/:slug/edit', ensureAuth, upload.single('cover_image'), async (req, res) => {
    const db = req.app.locals.db;
    const build = db.prepare('SELECT * FROM builds WHERE slug = ?').get(req.params.slug);
    if (!build) return res.status(404).render('error', { title: '404', message: 'Build not found.', status: 404 });
    if (req.user.id !== build.owner_id && req.user.role !== 'admin') {
        req.flash('error', 'You can only edit your own builds.');
        return res.redirect(`/builds/${build.slug}`);
    }

    const { title, description, base_vehicle, year, status, total_cost, currency } = req.body;
    const errors = [];
    if (!title || title.trim().length < 3) errors.push('Title must be at least 3 characters.');

    if (errors.length > 0) {
        return res.render('builds/editor', { title: 'Edit Build', build: { ...build, ...req.body }, statuses: STATUSES, errors });
    }

    const slug = uniqueSlug(title, db, 'builds', build.id);
    let cover_image = build.cover_image;
    if (req.file) {
        try {
            cover_image = await processCoverImage(req.file, 'builds');
            if (build.cover_image) deleteImage(build.cover_image);
        } catch (err) { console.error('Cover image error:', err); }
    }

    db.prepare(`UPDATE builds SET title = ?, slug = ?, description = ?, base_vehicle = ?, year = ?, status = ?, total_cost = ?, currency = ?, cover_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(title.trim(), slug, description || null, base_vehicle || null,
            year ? parseInt(year) : null, status && STATUSES.includes(status) ? status : build.status,
            total_cost ? parseFloat(total_cost) : null, currency || 'EUR', cover_image, build.id);

    req.flash('success', 'Build updated.');
    res.redirect(`/builds/${slug}`);
});

// POST /builds/:slug/entry — add entry
router.post('/:slug/entry', ensureAuth, upload.array('photos', 5), async (req, res) => {
    const db = req.app.locals.db;
    const build = db.prepare('SELECT * FROM builds WHERE slug = ?').get(req.params.slug);
    if (!build) return res.status(404).render('error', { title: '404', message: 'Build not found.', status: 404 });
    if (req.user.id !== build.owner_id && req.user.role !== 'admin') {
        req.flash('error', 'Only the build owner can add entries.');
        return res.redirect(`/builds/${build.slug}`);
    }

    const { title, content, cost, hours_spent } = req.body;
    if (!title || !content) {
        req.flash('error', 'Title and content are required.');
        return res.redirect(`/builds/${build.slug}`);
    }

    // Get next order number
    const maxOrder = db.prepare('SELECT MAX(entry_order) as max FROM build_entries WHERE build_id = ?').get(build.id);
    const entryOrder = (maxOrder.max || 0) + 1;

    const result = db.prepare('INSERT INTO build_entries (build_id, title, content, cost, hours_spent, entry_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(build.id, title.trim(), content.trim(), cost ? parseFloat(cost) : null, hours_spent ? parseFloat(hours_spent) : null, entryOrder);

    const entryId = result.lastInsertRowid;

    // Process photos
    if (req.files && req.files.length > 0) {
        for (const file of req.files) {
            try {
                const filePath = await processContentImage(file, 'builds');
                db.prepare('INSERT INTO build_photos (build_id, entry_id, uploaded_by, file_path) VALUES (?, ?, ?, ?)').run(build.id, entryId, req.user.id, filePath);
            } catch (err) { console.error('Photo upload error:', err); }
        }
    }

    // Update build timestamp
    db.prepare('UPDATE builds SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(build.id);

    req.flash('success', 'Entry added!');
    res.redirect(`/builds/${build.slug}#entry-${entryId}`);
});

// POST /builds/:slug/delete — delete build (owner or admin)
router.post('/:slug/delete', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const build = db.prepare('SELECT * FROM builds WHERE slug = ?').get(req.params.slug);
    if (!build) return res.status(404).render('error', { title: '404', message: 'Build not found.', status: 404 });
    if (req.user.id !== build.owner_id && req.user.role !== 'admin') {
        req.flash('error', 'You cannot delete this build.');
        return res.redirect(`/builds/${build.slug}`);
    }

    // Clean up images
    if (build.cover_image) deleteImage(build.cover_image);
    const photos = db.prepare('SELECT file_path FROM build_photos WHERE build_id = ?').all(build.id);
    photos.forEach(p => deleteImage(p.file_path));

    db.prepare('DELETE FROM builds WHERE id = ?').run(build.id);
    req.flash('success', 'Build deleted.');
    res.redirect('/builds');
});

module.exports = router;
