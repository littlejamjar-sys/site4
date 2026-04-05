/**
 * Generate a URL-friendly slug from a string.
 * Handles unicode, strips special chars, deduplicates hyphens.
 */
function slugify(text) {
    return text
        .toString()
        .normalize('NFD')                   // Normalize unicode
        .replace(/[\u0300-\u036f]/g, '')    // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')      // Remove non-alphanumeric
        .replace(/[\s_]+/g, '-')            // Spaces/underscores to hyphens
        .replace(/-+/g, '-')               // Deduplicate hyphens
        .replace(/^-+|-+$/g, '');           // Trim leading/trailing hyphens
}

/**
 * Generate a unique slug by appending a number if the slug already exists.
 * @param {string} text - The text to slugify
 * @param {object} db - better-sqlite3 database instance
 * @param {string} table - Table name to check against
 * @param {number|null} excludeId - ID to exclude from uniqueness check (for updates)
 */
function uniqueSlug(text, db, table, excludeId = null) {
    let slug = slugify(text);
    if (!slug) slug = 'untitled';

    let candidate = slug;
    let counter = 1;

    while (true) {
        let existing;
        if (excludeId) {
            existing = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).get(candidate, excludeId);
        } else {
            existing = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(candidate);
        }
        if (!existing) return candidate;
        candidate = `${slug}-${counter}`;
        counter++;
    }
}

module.exports = { slugify, uniqueSlug };
