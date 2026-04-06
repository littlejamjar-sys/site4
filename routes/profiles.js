const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../config/middleware');

// View public profile
router.get('/:username', (req, res) => {
  const db = req.app.locals.db;
  
  try {
    const user = db.prepare(`
      SELECT 
        id, username, display_name, bio, avatar_path, 
        location, van_name, van_type, created_at, reputation
      FROM users
      WHERE username = ?
    `).get(req.params.username);

    if (!user) {
      return res.status(404).render('error', {
        title: 'User Not Found',
        message: 'This user does not exist.',
        status: 404,
        currentPath: req.path,
        currentUser: req.user || null,
        isAuthenticated: req.isAuthenticated()
      });
    }

    // Get recent articles
    const articles = db.prepare(`
      SELECT id, title, created_at, slug
      FROM articles
      WHERE author_id = ? AND status = 'published'
      ORDER BY created_at DESC
      LIMIT 5
    `).all(user.id);

    // Get recent forum posts
    const forumPosts = db.prepare(`
      SELECT id, title, created_at, slug
      FROM forum_posts
      WHERE author_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(user.id);

    // Get recent forum replies count
    const repliesCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM forum_replies
      WHERE author_id = ?
    `).get(user.id).count;

    // Get article count
    const articleCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM articles
      WHERE author_id = ? AND status = 'published'
    `).get(user.id).count;

    res.render('profiles/view', {
      title: `${user.display_name || user.username} - Profile`,
      user,
      articles,
      forumPosts,
      repliesCount,
      articleCount,
      currentUser: req.user || null,
      isAuthenticated: req.isAuthenticated(),
      currentPath: req.path
    });
  } catch (error) {
    console.error('Profile view error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading profile.',
      status: 500,
      currentPath: req.path,
      currentUser: req.user || null,
      isAuthenticated: req.isAuthenticated()
    });
  }
});

// Get edit profile form
router.get('/:username/edit', ensureAuth, (req, res) => {
  const db = req.app.locals.db;
  
  try {
    const user = db.prepare(`
      SELECT 
        id, username, display_name, bio, avatar_path,
        location, van_name, van_type, email
      FROM users
      WHERE username = ?
    `).get(req.params.username);

    if (!user) {
      return res.status(404).render('error', {
        title: 'User Not Found',
        message: 'This user does not exist.',
        status: 404,
        currentPath: req.path,
        currentUser: req.user,
        isAuthenticated: true
      });
    }

    // Check authorization
    if (req.user.id !== user.id && req.user.role !== 'admin') {
      return res.status(403).render('error', {
        title: 'Forbidden',
        message: 'You can only edit your own profile.',
        status: 403,
        currentPath: req.path,
        currentUser: req.user,
        isAuthenticated: true
      });
    }

    res.render('profiles/edit', { 
      title: 'Edit Profile',
      user, 
      currentUser: req.user,
      isAuthenticated: true,
      currentPath: req.path
    });
  } catch (error) {
    console.error('Edit profile form error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Error loading profile editor.',
      status: 500,
      currentPath: req.path,
      currentUser: req.user,
      isAuthenticated: true
    });
  }
});

// Update profile
router.post('/:username/edit', ensureAuth, (req, res) => {
  const db = req.app.locals.db;
  
  try {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check authorization
    if (req.user.id !== user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      display_name,
      bio,
      location,
      van_name,
      van_type
    } = req.body;

    // Validate inputs
    if (!display_name || display_name.trim().length === 0) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    if (display_name.length > 100) {
      return res.status(400).json({ error: 'Display name too long (max 100 chars)' });
    }

    if (bio && bio.length > 500) {
      return res.status(400).json({ error: 'Bio too long (max 500 chars)' });
    }

    // Update user
    const updateStmt = db.prepare(`
      UPDATE users
      SET 
        display_name = ?,
        bio = ?,
        location = ?,
        van_name = ?,
        van_type = ?
      WHERE id = ?
    `);

    updateStmt.run(
      display_name.trim(),
      bio ? bio.trim() : null,
      location ? location.trim() : null,
      van_name ? van_name.trim() : null,
      van_type ? van_type.trim() : null,
      user.id
    );

    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      redirect: `/users/${req.params.username}`
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
