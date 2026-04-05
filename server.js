require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');

// Initialize database
const Database = require('better-sqlite3');
const dbPath = path.resolve(__dirname, process.env.DB_PATH || './db/database.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Make db available globally
const app = express();
app.locals.db = db;
app.locals.siteName = process.env.SITE_NAME || 'The Overland Post';
app.locals.siteUrl = process.env.SITE_URL || 'http://localhost:4000';

// Configure passport
require('./config/passport')(passport, db);

// Trust first proxy (nginx) — required for secure cookies behind reverse proxy
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers - configured for CDN usage
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/public', express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
}));

// Sessions
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: path.join(__dirname, 'db'),
    }),
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
    proxy: isProduction, // Trust the reverse proxy for secure cookies
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// CSRF protection
const csrfProtection = csrf();
app.use((req, res, next) => {
    // Skip CSRF for API JSON endpoints
    if (req.method === 'POST' && req.path === '/auth/register') return next();
    if (req.path.startsWith('/api/')) {
        return next();
    }
    csrfProtection(req, res, next);
});

// Rate limiting — only limit POST requests (actual login/register attempts)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    skipSuccessfulRequests: true,
    skip: (req) => req.method === 'GET', // Don't count page views
    handler: (req, res) => {
        res.status(429).render('error', {
            title: 'Too Many Attempts',
            message: 'Too many attempts, please try again in 15 minutes.',
            status: 429,
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Global middleware
const { updateLastSeen, injectUserData, injectHelpers } = require('./config/middleware');
app.use(updateLastSeen(db));
app.use(injectUserData(db));
app.use(injectHelpers);

// Make CSRF token available to all views
app.use((req, res, next) => {
    if (req.csrfToken) {
        res.locals.csrfToken = req.csrfToken();
    } else {
        res.locals.csrfToken = '';
    }
    next();
});

// Flash messages (simple implementation without extra dependency)
app.use((req, res, next) => {
    res.locals.flash = req.session.flash || {};
    delete req.session.flash;
    req.flash = (type, message) => {
        req.session.flash = req.session.flash || {};
        req.session.flash[type] = message;
    };
    next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/articles', require('./routes/articles'));
app.use('/forum', require('./routes/forum'));
app.use('/campsites', require('./routes/campsites'));
app.use('/routes', require('./routes/routes'));
app.use('/builds', require('./routes/builds'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: '404 — Page Not Found',
        message: 'The page you\'re looking for doesn\'t exist. Maybe it drove off into the sunset.',
        status: 404,
    });
});

// Error handler
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        req.flash('error', 'Form expired. Please try again.');
        return res.redirect('back');
    }
    console.error(err.stack);
    const status = err.status || 500;
    const message = isProduction
        ? 'An unexpected error occurred. Please try again.'
        : err.message;
    try {
        res.status(status).render('error', {
            title: 'Something went wrong',
            message,
            status,
        });
    } catch (renderErr) {
        // Fallback if the error template itself fails to render
        console.error('Error rendering error page:', renderErr);
        res.status(status).send(`
            <!DOCTYPE html>
            <html><head><title>Error ${status}</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:60px;">
                <h1>${status}</h1>
                <p>${message}</p>
                <a href="/">Back to Home</a>
            </body></html>
        `);
    }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`The Overland Post running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});
process.on('SIGTERM', () => {
    db.close();
    process.exit(0);
});
