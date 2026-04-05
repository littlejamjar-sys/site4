const { marked } = require('marked');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Configure marked
marked.setOptions({
    gfm: true,
    breaks: true,
});

/**
 * Render markdown to sanitized HTML.
 */
function renderMarkdown(text) {
    if (!text) return '';
    const html = marked.parse(text);
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'br', 'hr',
            'ul', 'ol', 'li',
            'strong', 'em', 'del', 'code', 'pre',
            'blockquote',
            'a', 'img',
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
            'div', 'span',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
    });
}

/**
 * Strip markdown to plain text (for summaries/previews).
 */
function stripMarkdown(text, maxLength = 200) {
    if (!text) return '';
    const html = marked.parse(text);
    const plain = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
    if (plain.length <= maxLength) return plain;
    return plain.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

module.exports = { renderMarkdown, stripMarkdown };
