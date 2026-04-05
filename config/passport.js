const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');

module.exports = function (passport, db) {
    passport.use(new LocalStrategy(
        { usernameField: 'email' },
        (email, password, done) => {
            const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
            if (!user) {
                return done(null, false, { message: 'Invalid email or password.' });
            }
            const isMatch = bcrypt.compareSync(password, user.password_hash);
            if (!isMatch) {
                return done(null, false, { message: 'Invalid email or password.' });
            }
            return done(null, user);
        }
    ));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id, done) => {
        const user = db.prepare('SELECT id, username, email, display_name, bio, avatar_path, location, van_name, van_type, role, reputation, created_at, last_seen FROM users WHERE id = ?').get(id);
        done(null, user || null);
    });
};
