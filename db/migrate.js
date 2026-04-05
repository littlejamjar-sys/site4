const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './db/database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Running migrations...');

db.exec(`
-- Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    bio TEXT,
    avatar_path TEXT,
    location TEXT,
    van_name TEXT,
    van_type TEXT,
    role TEXT DEFAULT 'member',
    reputation INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Articles (magazine/editorial content)
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    summary TEXT,
    content TEXT NOT NULL,
    cover_image TEXT,
    category TEXT NOT NULL,
    tags TEXT,
    status TEXT DEFAULT 'draft',
    featured INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Forum posts
CREATE TABLE IF NOT EXISTS forum_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    last_reply_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Forum replies
CREATE TABLE IF NOT EXISTS forum_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER REFERENCES forum_posts(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    parent_reply_id INTEGER REFERENCES forum_replies(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Votes
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    value INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, target_type, target_id)
);

-- Campsites
CREATE TABLE IF NOT EXISTS campsites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitted_by INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    country TEXT,
    region TEXT,
    type TEXT,
    cost_per_night REAL,
    currency TEXT DEFAULT 'EUR',
    has_water INTEGER DEFAULT 0,
    has_electric INTEGER DEFAULT 0,
    has_toilet INTEGER DEFAULT 0,
    has_shower INTEGER DEFAULT 0,
    has_wifi INTEGER DEFAULT 0,
    dog_friendly INTEGER DEFAULT 0,
    max_vehicle_length REAL,
    rating_avg REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Campsite reviews
CREATE TABLE IF NOT EXISTS campsite_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campsite_id INTEGER REFERENCES campsites(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    visited_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campsite_id, user_id)
);

-- Campsite photos
CREATE TABLE IF NOT EXISTS campsite_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campsite_id INTEGER REFERENCES campsites(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id),
    file_path TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Routes
CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    country TEXT,
    region TEXT,
    distance_km REAL,
    duration_days INTEGER,
    difficulty TEXT,
    best_season TEXT,
    cover_image TEXT,
    waypoints TEXT,
    tags TEXT,
    rating_avg REAL DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Route reviews
CREATE TABLE IF NOT EXISTS route_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    travelled_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route_id, user_id)
);

-- Builds
CREATE TABLE IF NOT EXISTS builds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    base_vehicle TEXT,
    year INTEGER,
    status TEXT DEFAULT 'in-progress',
    total_cost REAL,
    currency TEXT DEFAULT 'EUR',
    cover_image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Build entries
CREATE TABLE IF NOT EXISTS build_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id INTEGER REFERENCES builds(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    cost REAL,
    hours_spent REAL,
    entry_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Build photos
CREATE TABLE IF NOT EXISTS build_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    build_id INTEGER REFERENCES builds(id) ON DELETE CASCADE,
    entry_id INTEGER REFERENCES build_entries(id) ON DELETE CASCADE,
    uploaded_by INTEGER REFERENCES users(id),
    file_path TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER REFERENCES users(id),
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, target_type, target_id)
);
`);

// Create indexes (using IF NOT EXISTS isn't supported for indexes, so we use try/catch pattern)
const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category)',
    'CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status)',
    'CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug)',
    'CREATE INDEX IF NOT EXISTS idx_forum_posts_category ON forum_posts(category)',
    'CREATE INDEX IF NOT EXISTS idx_forum_posts_slug ON forum_posts(slug)',
    'CREATE INDEX IF NOT EXISTS idx_forum_replies_post ON forum_replies(post_id)',
    'CREATE INDEX IF NOT EXISTS idx_campsites_location ON campsites(latitude, longitude)',
    'CREATE INDEX IF NOT EXISTS idx_campsites_country ON campsites(country)',
    'CREATE INDEX IF NOT EXISTS idx_campsites_type ON campsites(type)',
    'CREATE INDEX IF NOT EXISTS idx_routes_country ON routes(country)',
    'CREATE INDEX IF NOT EXISTS idx_routes_slug ON routes(slug)',
    'CREATE INDEX IF NOT EXISTS idx_builds_slug ON builds(slug)',
    'CREATE INDEX IF NOT EXISTS idx_builds_owner ON builds(owner_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)',
    'CREATE INDEX IF NOT EXISTS idx_votes_target ON votes(target_type, target_id)',
    'CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_type, target_id)',
];

for (const sql of indexes) {
    db.exec(sql);
}

// Create FTS5 virtual tables
// These need special handling since IF NOT EXISTS isn't supported for virtual tables
const ftsStatements = [
    {
        check: "SELECT name FROM sqlite_master WHERE type='table' AND name='articles_fts'",
        create: "CREATE VIRTUAL TABLE articles_fts USING fts5(title, summary, content, tags, content=articles, content_rowid=id)"
    },
    {
        check: "SELECT name FROM sqlite_master WHERE type='table' AND name='forum_posts_fts'",
        create: "CREATE VIRTUAL TABLE forum_posts_fts USING fts5(title, content, content=forum_posts, content_rowid=id)"
    },
    {
        check: "SELECT name FROM sqlite_master WHERE type='table' AND name='campsites_fts'",
        create: "CREATE VIRTUAL TABLE campsites_fts USING fts5(name, description, country, region, content=campsites, content_rowid=id)"
    },
    {
        check: "SELECT name FROM sqlite_master WHERE type='table' AND name='routes_fts'",
        create: "CREATE VIRTUAL TABLE routes_fts USING fts5(title, description, country, region, tags, content=routes, content_rowid=id)"
    },
];

for (const fts of ftsStatements) {
    const exists = db.prepare(fts.check).get();
    if (!exists) {
        db.exec(fts.create);
        console.log(`  Created FTS table: ${fts.create.match(/TABLE (\w+)/)[1]}`);
    }
}

// Create triggers to keep FTS tables in sync
const triggers = [
    // Articles FTS triggers
    `CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
        INSERT INTO articles_fts(rowid, title, summary, content, tags) VALUES (new.id, new.title, new.summary, new.content, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, summary, content, tags) VALUES('delete', old.id, old.title, old.summary, old.content, old.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, summary, content, tags) VALUES('delete', old.id, old.title, old.summary, old.content, old.tags);
        INSERT INTO articles_fts(rowid, title, summary, content, tags) VALUES (new.id, new.title, new.summary, new.content, new.tags);
    END`,
    // Forum posts FTS triggers
    `CREATE TRIGGER IF NOT EXISTS forum_posts_ai AFTER INSERT ON forum_posts BEGIN
        INSERT INTO forum_posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END`,
    `CREATE TRIGGER IF NOT EXISTS forum_posts_ad AFTER DELETE ON forum_posts BEGIN
        INSERT INTO forum_posts_fts(forum_posts_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
    END`,
    `CREATE TRIGGER IF NOT EXISTS forum_posts_au AFTER UPDATE ON forum_posts BEGIN
        INSERT INTO forum_posts_fts(forum_posts_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
        INSERT INTO forum_posts_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END`,
    // Campsites FTS triggers
    `CREATE TRIGGER IF NOT EXISTS campsites_ai AFTER INSERT ON campsites BEGIN
        INSERT INTO campsites_fts(rowid, name, description, country, region) VALUES (new.id, new.name, new.description, new.country, new.region);
    END`,
    `CREATE TRIGGER IF NOT EXISTS campsites_ad AFTER DELETE ON campsites BEGIN
        INSERT INTO campsites_fts(campsites_fts, rowid, name, description, country, region) VALUES('delete', old.id, old.name, old.description, old.country, old.region);
    END`,
    `CREATE TRIGGER IF NOT EXISTS campsites_au AFTER UPDATE ON campsites BEGIN
        INSERT INTO campsites_fts(campsites_fts, rowid, name, description, country, region) VALUES('delete', old.id, old.name, old.description, old.country, old.region);
        INSERT INTO campsites_fts(rowid, name, description, country, region) VALUES (new.id, new.name, new.description, new.country, new.region);
    END`,
    // Routes FTS triggers
    `CREATE TRIGGER IF NOT EXISTS routes_ai AFTER INSERT ON routes BEGIN
        INSERT INTO routes_fts(rowid, title, description, country, region, tags) VALUES (new.id, new.title, new.description, new.country, new.region, new.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS routes_ad AFTER DELETE ON routes BEGIN
        INSERT INTO routes_fts(routes_fts, rowid, title, description, country, region, tags) VALUES('delete', old.id, old.title, old.description, old.country, old.region, old.tags);
    END`,
    `CREATE TRIGGER IF NOT EXISTS routes_au AFTER UPDATE ON routes BEGIN
        INSERT INTO routes_fts(routes_fts, rowid, title, description, country, region, tags) VALUES('delete', old.id, old.title, old.description, old.country, old.region, old.tags);
        INSERT INTO routes_fts(rowid, title, description, country, region, tags) VALUES (new.id, new.title, new.description, new.country, new.region, new.tags);
    END`,
];

for (const trigger of triggers) {
    db.exec(trigger);
}

console.log('Migrations complete.');
db.close();
