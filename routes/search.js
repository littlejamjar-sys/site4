const express = require('express');
const router = express.Router();

const RESULTS_PER_PAGE = 15;

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const query = req.query.q ? req.query.q.trim() : '';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const offset = (page - 1) * RESULTS_PER_PAGE;

  let results = {
    articles: [],
    forum_posts: [],
    campsites: [],
    total: 0,
    page,
    hasMore: false,
    query
  };

  if (!query || query.length < 2) {
    return res.render('search/index', { ...results, title: 'Search' });
  }

  try {
    // Search articles
    const articlesStmt = db.prepare(`
      SELECT 
        a.id,
        a.title,
        a.slug,
        a.content,
        a.author_id,
        a.created_at,
        u.display_name,
        u.username,
        ROUND((fts.rank / -1000), 2) as relevance
      FROM articles_fts fts
      JOIN articles a ON fts.rowid = a.id
      JOIN users u ON a.author_id = u.id
      WHERE articles_fts MATCH ?
      ORDER BY fts.rank DESC, a.created_at DESC
      LIMIT ? OFFSET ?
    `);
    results.articles = articlesStmt.all(query, RESULTS_PER_PAGE + 1, offset);

    // Search forum posts
    const forumStmt = db.prepare(`
      SELECT 
        fp.id,
        fp.title,
        fp.slug,
        fp.content,
        fp.author_id,
        fp.created_at,
        u.display_name,
        u.username,
        ROUND((fts.rank / -1000), 2) as relevance
      FROM forum_posts_fts fts
      JOIN forum_posts fp ON fts.rowid = fp.id
      JOIN users u ON fp.author_id = u.id
      WHERE forum_posts_fts MATCH ?
      ORDER BY fts.rank DESC, fp.created_at DESC
      LIMIT ? OFFSET ?
    `);
    results.forum_posts = forumStmt.all(query, RESULTS_PER_PAGE + 1, offset);

    // Search campsites
    const campsitesStmt = db.prepare(`
      SELECT 
        c.id,
        c.name,
        c.description,
        c.country,
        c.region,
        c.created_at,
        ROUND((fts.rank / -1000), 2) as relevance
      FROM campsites_fts fts
      JOIN campsites c ON fts.rowid = c.id
      WHERE campsites_fts MATCH ?
      ORDER BY fts.rank DESC, c.created_at DESC
      LIMIT ? OFFSET ?
    `);
    results.campsites = campsitesStmt.all(query, RESULTS_PER_PAGE + 1, offset);

    // Check if there are more results and trim excess
    if (results.articles.length > RESULTS_PER_PAGE) {
      results.articles.pop();
      results.hasMore = true;
    }
    if (results.forum_posts.length > RESULTS_PER_PAGE) {
      results.forum_posts.pop();
      results.hasMore = true;
    }
    if (results.campsites.length > RESULTS_PER_PAGE) {
      results.campsites.pop();
      results.hasMore = true;
    }

    results.total = results.articles.length + results.forum_posts.length + results.campsites.length;

    // Truncate content for display
    results.articles.forEach(a => {
      a.preview = a.content ? a.content.substring(0, 150) + (a.content.length > 150 ? '...' : '') : '';
    });
    results.forum_posts.forEach(p => {
      p.preview = p.content ? p.content.substring(0, 150) + (p.content.length > 150 ? '...' : '') : '';
    });
    results.campsites.forEach(c => {
      c.preview = c.description ? c.description.substring(0, 150) + (c.description.length > 150 ? '...' : '') : 'No description';
    });

    res.render('search/index', { ...results, title: 'Search Results' });
  } catch (error) {
    console.error('Search error:', error);
    results.error = 'Search failed. Please try again.';
    res.render('search/index', { ...results, title: 'Search' });
  }
});

module.exports = router;
