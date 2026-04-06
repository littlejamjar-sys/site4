const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

// Initialize database
const Database = require('better-sqlite3');
const dbPath = path.resolve(__dirname, process.env.DB_PATH || './db/database.sqlite');
const db = new Database(dbPath);

const app = express();
app.locals.db = db;
const PORT = process.env.PORT || 4000;

// Configure passport
require('./config/passport')(passport, db);

// Trust first proxy
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com", "https://nominatim.openstreetmap.org"],
            connectSrc: ["'self'", "https://*.tile.openstreetmap.org", "https://*.basemaps.cartocdn.com", "https://nominatim.openstreetmap.org"],
            mediaSrc: ["'self'", "https:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
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

// Cookie parser
app.use(cookieParser());

// Static files
app.use('/public', express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0,
}));

// Sessions
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: path.join(__dirname, 'db'),
    }),
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
    },
    proxy: isProduction,
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Flash messages middleware (custom implementation)
app.use((req, res, next) => {
    req.flash = (type, message) => {
        if (!req.session.flash) req.session.flash = {};
        if (!req.session.flash[type]) req.session.flash[type] = [];
        req.session.flash[type].push(message);
    };
    next();
});

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    skip: (req) => req.method !== 'POST',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
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

// Make CSRF token available to all views (disabled for now)
app.use((req, res, next) => {
    res.locals.csrfToken = '';
    next();
});

// Flash messages display middleware
app.use((req, res, next) => {
    try {
        res.locals.flash = (req.session && req.session.flash) || {};
        if (req.session && req.session.flash) {
            delete req.session.flash;
        }
    } catch (err) {
        res.locals.flash = {};
    }
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
        message: 'The page you\'re looking for doesn\'t exist.',
        status: 404,
    });
});

// Error handler
app.use((err, req, res, next) => {
    if (!res.locals.currentPath) res.locals.currentPath = req.path;
    if (!res.locals.currentUser) res.locals.currentUser = req.user || null;
    if (!res.locals.isAuthenticated) res.locals.isAuthenticated = req.isAuthenticated();

    console.error('Error:', err.message || err);
    const status = err.status || 500;
    const message = isProduction
        ? 'An unexpected error occurred.'
        : err.message;
    
    try {
        res.status(status).render('error', {
            title: 'Error',
            message,
            status,
        });
    } catch (renderErr) {
        res.status(status).send(`<h1>${message}</h1>`);
    }
});

// Start
app.listen(PORT, () => {
    console.log(`The Overland Post running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Status: CSRF protection disabled (debugging mode)');
});

module.exports = app;
