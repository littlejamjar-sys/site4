const express = require('express');
const router = express.Router();
const multer = require('multer');
const { ensureAuth } = require('../config/middleware');
const { processContentImage, deleteImage } = require('../utils/images');
const helpers = require('../utils/helpers');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
}});

const TYPES = ['wild', 'paid', 'aire', 'stellplatz', 'campsite', 'parking'];

// GET /campsites — map + listing
router.get('/', (req, res) => {
    const db = req.app.locals.db;
    const page = parseInt(req.query.page) || 1;
    const perPage = 24;
    const type = req.query.type;
    const country = req.query.country;

    let countSql = "SELECT COUNT(*) as count FROM campsites WHERE status = 'approved'";
    let listSql = `SELECT * FROM campsites WHERE status = 'approved'`;
    const params = [];

    if (type && TYPES.includes(type)) {
        countSql += ' AND type = ?';
        listSql += ' AND type = ?';
        params.push(type);
    }
    if (country) {
        countSql += ' AND country = ?';
        listSql += ' AND country = ?';
        params.push(country);
    }

    const total = db.prepare(countSql).get(...params).count;
    const pagination = helpers.paginate(total, page, perPage);

    listSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const campsites = db.prepare(listSql).all(...params, pagination.perPage, pagination.offset);

    // Get distinct countries for filter
    const countries = db.prepare("SELECT DISTINCT country FROM campsites WHERE status = 'approved' AND country IS NOT NULL ORDER BY country").all().map(r => r.country);

    const paginationParts = [];
    if (type) paginationParts.push(`type=${type}`);
    if (country) paginationParts.push(`country=${encodeURIComponent(country)}`);
    const paginationQuery = paginationParts.join('&');

    res.render('campsites/index', {
        title: 'Campsites & Wild Spots',
        campsites,
        types: TYPES,
        countries,
        currentType: type || null,
        currentCountry: country || null,
        pagination,
        paginationQuery,
        needsMap: true,
    });
});

// GET /campsites/submit — submit form
router.get('/submit', ensureAuth, (req, res) => {
    res.render('campsites/submit', {
        title: 'Submit a Spot',
        types: TYPES,
        errors: [],
        campsite: null,
        needsMap: true,
    });
});

// POST /campsites — create
router.post('/', ensureAuth, upload.array('photos', 5), async (req, res) => {
    const db = req.app.locals.db;
    const { name, description, latitude, longitude, country, region, type, cost_per_night, currency,
            has_water, has_electric, has_toilet, has_shower, has_wifi, dog_friendly, max_vehicle_length } = req.body;
    const errors = [];

    if (!name || name.trim().length < 2) errors.push('Name is required.');
    if (!latitude || !longitude || isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) errors.push('Valid coordinates are required.');
    if (!type || !TYPES.includes(type)) errors.push('Please select a valid type.');

    if (errors.length > 0) {
        return res.render('campsites/submit', { title: 'Submit a Spot', types: TYPES, errors, campsite: req.body, needsMap: true });
    }

    const result = db.prepare(`INSERT INTO campsites (submitted_by, name, description, latitude, longitude, country, region, type, cost_per_night, currency,
        has_water, has_electric, has_toilet, has_shower, has_wifi, dog_friendly, max_vehicle_length, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`)
        .run(req.user.id, name.trim(), description || null, parseFloat(latitude), parseFloat(longitude),
            country || null, region || null, type, cost_per_night ? parseFloat(cost_per_night) : null, currency || 'EUR',
            has_water ? 1 : 0, has_electric ? 1 : 0, has_toilet ? 1 : 0, has_shower ? 1 : 0, has_wifi ? 1 : 0, dog_friendly ? 1 : 0,
            max_vehicle_length ? parseFloat(max_vehicle_length) : null);

    const campsiteId = result.lastInsertRowid;

    // Process uploaded photos
    if (req.files && req.files.length > 0) {
        for (const file of req.files) {
            try {
                const filePath = await processContentImage(file, 'campsites');
                db.prepare('INSERT INTO campsite_photos (campsite_id, uploaded_by, file_path) VALUES (?, ?, ?)').run(campsiteId, req.user.id, filePath);
            } catch (err) { console.error('Photo upload error:', err); }
        }
    }

    // Award reputation
    db.prepare('UPDATE users SET reputation = reputation + 5 WHERE id = ?').run(req.user.id);

    req.flash('success', 'Spot submitted! It is now live on the map.');
    res.redirect(`/campsites/${campsiteId}`);
});

// GET /campsites/:id — detail
router.get('/:id', (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).render('error', { title: '404', message: 'Campsite not found.', status: 404 });

    const campsite = db.prepare(`SELECT c.*, u.username, u.display_name, u.avatar_path
        FROM campsites c JOIN users u ON c.submitted_by = u.id WHERE c.id = ?`).get(id);

    if (!campsite) return res.status(404).render('error', { title: '404', message: 'Campsite not found.', status: 404 });

    const photos = db.prepare('SELECT * FROM campsite_photos WHERE campsite_id = ? ORDER BY created_at').all(id);

    const reviews = db.prepare(`SELECT cr.*, u.username, u.display_name, u.avatar_path
        FROM campsite_reviews cr JOIN users u ON cr.user_id = u.id WHERE cr.campsite_id = ? ORDER BY cr.created_at DESC`).all(id);

    // Check if current user already reviewed
    let userReview = null;
    if (req.user) {
        userReview = db.prepare('SELECT * FROM campsite_reviews WHERE campsite_id = ? AND user_id = ?').get(id, req.user.id);
    }

    // Nearby campsites (within ~50km, rough approximation)
    const nearby = db.prepare(`SELECT * FROM campsites WHERE id != ? AND status = 'approved'
        AND ABS(latitude - ?) < 0.5 AND ABS(longitude - ?) < 0.5
        ORDER BY ABS(latitude - ?) + ABS(longitude - ?) LIMIT 4`)
        .all(id, campsite.latitude, campsite.longitude, campsite.latitude, campsite.longitude);

    res.render('campsites/show', {
        title: campsite.name,
        campsite,
        photos,
        reviews,
        userReview,
        nearby,
        needsMap: true,
    });
});

// POST /campsites/:id/review — add review
router.post('/:id/review', ensureAuth, (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id);
    const { rating, comment, visited_date } = req.body;

    if (!rating || isNaN(parseInt(rating)) || parseInt(rating) < 1 || parseInt(rating) > 5) {
        req.flash('error', 'Please provide a valid rating (1-5).');
        return res.redirect(`/campsites/${id}`);
    }

    // Check if already reviewed
    const existing = db.prepare('SELECT id FROM campsite_reviews WHERE campsite_id = ? AND user_id = ?').get(id, req.user.id);
    if (existing) {
        // Update existing review
        db.prepare('UPDATE campsite_reviews SET rating = ?, comment = ?, visited_date = ? WHERE id = ?')
            .run(parseInt(rating), comment || null, visited_date || null, existing.id);
    } else {
        db.prepare('INSERT INTO campsite_reviews (campsite_id, user_id, rating, comment, visited_date) VALUES (?, ?, ?, ?, ?)')
            .run(id, req.user.id, parseInt(rating), comment || null, visited_date || null);
    }

    // Update campsite rating averages
    const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM campsite_reviews WHERE campsite_id = ?').get(id);
    db.prepare('UPDATE campsites SET rating_avg = ?, rating_count = ? WHERE id = ?').run(stats.avg, stats.count, id);

    req.flash('success', 'Review submitted!');
    res.redirect(`/campsites/${id}#reviews`);
});

module.exports = router;
