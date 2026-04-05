const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth } = require('../config/middleware');
const { uniqueSlug } = require('../utils/slugify');
const { renderMarkdown } = require('../utils/markdown');
const { processCoverImage, deleteImage } = require('../utils/images');
const helpers = require('../utils/helpers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
}});

const DIFFICULTIES = ['easy', 'moderate', 'challenging'];

// GET /routes — listing
router.get('/', (req, res) => {
    const db = req.app.locals.db;
    const page = parseInt(req.query.page) || 1;
    const perPage = 12;
    const country = req.query.country;
    const difficulty = req.query.difficulty;

    let countSql = 'SELECT COUNT(*) as count FROM routes';
    let listSql = `SELECT r.*, u.username, u.display_name, u.avatar_path FROM routes r JOIN users u ON r.author_id = u.id`;
    const conditions = [];
    const params = [];

    if (country) {
        conditions.push('r.country = ?');
        params.push(country);
    }
    if (difficulty && DIFFICULTIES.includes(difficulty)) {
        conditions.push('r.difficulty = ?');
        params.push(difficulty);
    }

    if (conditions.length > 0) {
        const where = ' WHERE ' + conditions.join(' AND ');
        countSql += where.replace(/r\./g, '');
        listSql += where;
    }

    const total = db.prepare(countSql).get(...params).count;
    const pagination = helpers.paginate(total, page, perPage);

    listSql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    const routes = db.prepare(listSql).all(...params, pagination.perPage, pagination.offset);

    const countries = db.prepare('SELECT DISTINCT country FROM routes WHERE country IS NOT NULL ORDER BY country').all().map(r => r.country);

    const paginationParts = [];
    if (country) paginationParts.push(`country=${encodeURIComponent(country)}`);
    if (difficulty) paginationParts.push(`difficulty=${difficulty}`);
    const paginationQuery = paginationParts.join('&');

    res.render('routes/index', {
        title: 'Routes & Road Trips',
        routes,
        countries,
        difficulties: DIFFICULTIES,
        currentCountry: country || null,
        currentDifficulty: difficulty || null,
        pagination,
        paginationQuery,
        needsMap: true,
    });
});

// GET /routes/submit — submit form
router.get('/submit', ensureAuth, (req, res) => {
    res.render('routes/submit', {
        title: 'Submit a Route',
        difficulties: DIFFICULTIES,
        errors: [],
        route: null,
        needsMap: true,
        needsEditor: true,
    });
});

// POST /routes — create
router.post('/', ensureAuth, upload.single('cover_image'), async (req, res) => {
    const db = req.app.locals.db;
    const { title, description, country, region, distance_km, duration_days, difficulty, best_season, waypoints, tags } = req.body;
    const errors = [];

    if (!title || title.trim().length < 3) errors.push('Title must be at least 3 characters.');
    if (!description || description.trim().length < 10) errors.push('Description is required.');

    if (errors.length > 0) {
        return res.render('routes/submit', { title: 'Submit a Route', difficulties: DIFFICULTIES, errors, route: req.body, needsMap: true, needsEditor: true });
    }

    const slug = uniqueSlug(title, db, 'routes');
    let cover_image = null;
    if (req.file) {
        try { cover_image = await processCoverImage(req.file, 'routes'); } catch (err) { console.error('Cover image error:', err); }
    }

    db.prepare(`INSERT INTO routes (author_id, title, slug, description, country, region, distance_km, duration_days, difficulty, best_season, cover_image, waypoints, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(req.user.id, title.trim(), slug, description.trim(), country || null, region || null,
            distance_km ? parseFloat(distance_km) : null, duration_days ? parseInt(duration_days) : null,
            difficulty || null, best_season || null, cover_image, waypoints || null, tags || null);

    db.prepare('UPDATE users SET reputation = reputation + 5 WHERE id = ?').run(req.user.id);

    req.flash('success', 'Route submitted!');
    res.redirect(`/routes/${slug}`);
});

// GET /routes/:slug — detail
router.get('/:slug', (req, res) => {
    const db = req.app.locals.db;
    const route = db.prepare(`SELECT r.*, u.username, u.display_name, u.avatar_path, u.bio
        FROM routes r JOIN users u ON r.author_id = u.id WHERE r.slug = ?`).get(req.params.slug);

    if (!route) return res.status(404).render('error', { title: '404', message: 'Route not found.', status: 404 });

    db.prepare('UPDATE routes SET view_count = view_count + 1 WHERE id = ?').run(route.id);

    const reviews = db.prepare(`SELECT rr.*, u.username, u.display_name, u.avatar_path
        FROM route_reviews rr JOIN users u ON rr.user_id = u.id WHERE rr.route_id = ? ORDER BY rr.created_at DESC`).all(route.id);

    let userReview = null;
    if (req.user) {
        userReview = db.prepare('SELECT * FROM route_reviews WHERE route_id = ? AND user_id = ?').get(route.id, req.user.id);
    }

    route.descriptionHtml = renderMarkdown(route.description);

    // Parse waypoints JSON
    let waypointsData = [];
    if (route.waypoints) {
        try { waypointsData = JSON.parse(route.waypoints); } catch (e) {}
    }

    res.render('routes/show', {
        title: route.title,
        route,
        reviews,
        userReview,
        waypointsData,
        description: helpers.truncate(route.description, 160),
        needsMap: true,
    });
});

// POST /routes/:slug/review
router.post('/:slug/review', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const route = db.prepare('SELECT id FROM routes WHERE slug = ?').get(req.params.slug);
    if (!route) return res.status(404).render('error', { title: '404', message: 'Route not found.', status: 404 });

    const { rating, comment, travelled_date } = req.body;
    if (!rating || isNaN(parseInt(rating)) || parseInt(rating) < 1 || parseInt(rating) > 5) {
        req.flash('error', 'Please provide a valid rating (1-5).');
        return res.redirect(`/routes/${req.params.slug}`);
    }

    const existing = db.prepare('SELECT id FROM route_reviews WHERE route_id = ? AND user_id = ?').get(route.id, req.user.id);
    if (existing) {
        db.prepare('UPDATE route_reviews SET rating = ?, comment = ?, travelled_date = ? WHERE id = ?')
            .run(parseInt(rating), comment || null, travelled_date || null, existing.id);
    } else {
        db.prepare('INSERT INTO route_reviews (route_id, user_id, rating, comment, travelled_date) VALUES (?, ?, ?, ?, ?)')
            .run(route.id, req.user.id, parseInt(rating), comment || null, travelled_date || null);
    }

    const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM route_reviews WHERE route_id = ?').get(route.id);
    db.prepare('UPDATE routes SET rating_avg = ?, rating_count = ? WHERE id = ?').run(stats.avg, stats.count, route.id);

    req.flash('success', 'Review submitted!');
    res.redirect(`/routes/${req.params.slug}#reviews`);
});

// GET /routes/:slug/gpx — export as GPX
router.get('/:slug/gpx', (req, res) => {
    const db = req.app.locals.db;
    const route = db.prepare('SELECT * FROM routes WHERE slug = ?').get(req.params.slug);
    if (!route) return res.status(404).render('error', { title: '404', message: 'Route not found.', status: 404 });

    let waypoints = [];
    if (route.waypoints) {
        try { waypoints = JSON.parse(route.waypoints); } catch (e) {}
    }

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="The Overland Post" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(route.title)}</name>
    <desc>${escapeXml(route.description.substring(0, 500))}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(route.title)}</name>
    <trkseg>
${waypoints.map(wp => `      <trkpt lat="${wp.lat}" lon="${wp.lng}"><name>${escapeXml(wp.name || '')}</name></trkpt>`).join('\n')}
    </trkseg>
  </trk>
</gpx>`;

    res.set('Content-Type', 'application/gpx+xml');
    res.set('Content-Disposition', `attachment; filename="${route.slug}.gpx"`);
    res.send(gpx);
});

function escapeXml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = router;
