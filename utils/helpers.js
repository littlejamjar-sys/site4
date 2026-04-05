/**
 * Template helpers available in all EJS views via res.locals.helpers
 */

/**
 * Format a date string for display.
 */
function formatDate(dateStr, style = 'medium') {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    if (style === 'relative') {
        return timeAgo(date);
    }
    if (style === 'short') {
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    if (style === 'long') {
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    // medium (default)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Relative time ago string.
 */
function timeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
function truncate(text, maxLength = 150) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

/**
 * Format a number with commas.
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('en-GB');
}

/**
 * Format currency.
 */
function formatCurrency(amount, currency = 'EUR') {
    if (amount === null || amount === undefined) return 'Free';
    if (amount === 0) return 'Free';
    const symbols = { EUR: '\u20ac', GBP: '\u00a3', USD: '$', CHF: 'CHF ' };
    const symbol = symbols[currency] || currency + ' ';
    return `${symbol}${Number(amount).toFixed(2)}`;
}

/**
 * Generate star rating HTML.
 */
function starRating(rating, maxStars = 5) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = maxStars - full - half;
    let html = '';
    for (let i = 0; i < full; i++) html += '<i data-lucide="star" class="w-4 h-4 fill-amber-400 text-amber-400 inline-block"></i>';
    if (half) html += '<i data-lucide="star-half" class="w-4 h-4 fill-amber-400 text-amber-400 inline-block"></i>';
    for (let i = 0; i < empty; i++) html += '<i data-lucide="star" class="w-4 h-4 text-slate-600 inline-block"></i>';
    return html;
}

/**
 * Pluralize a word based on count.
 */
function pluralize(count, singular, plural) {
    if (!plural) plural = singular + 's';
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

/**
 * Get amenity icon name (for Lucide icons).
 */
function amenityIcon(amenity) {
    const icons = {
        has_water: 'droplets',
        has_electric: 'zap',
        has_toilet: 'bath',
        has_shower: 'shower-head',
        has_wifi: 'wifi',
        dog_friendly: 'dog',
    };
    return icons[amenity] || 'circle';
}

/**
 * Get amenity display name.
 */
function amenityName(amenity) {
    const names = {
        has_water: 'Water',
        has_electric: 'Electric',
        has_toilet: 'Toilet',
        has_shower: 'Shower',
        has_wifi: 'WiFi',
        dog_friendly: 'Dog Friendly',
    };
    return names[amenity] || amenity;
}

/**
 * Get difficulty badge color class.
 */
function difficultyColor(difficulty) {
    const colors = {
        easy: 'bg-green-600 text-green-100',
        moderate: 'bg-amber-600 text-amber-100',
        challenging: 'bg-red-600 text-red-100',
    };
    return colors[difficulty] || 'bg-slate-600 text-slate-100';
}

/**
 * Get campsite type label.
 */
function campsiteTypeLabel(type) {
    const labels = {
        wild: 'Wild Camp',
        paid: 'Paid Campsite',
        aire: 'Aire',
        stellplatz: 'Stellplatz',
        campsite: 'Campsite',
        parking: 'Parking',
    };
    return labels[type] || type;
}

/**
 * Generate pagination data.
 */
function paginate(totalItems, currentPage, perPage = 20) {
    const totalPages = Math.ceil(totalItems / perPage);
    const page = Math.max(1, Math.min(currentPage, totalPages));
    const offset = (page - 1) * perPage;

    return {
        page,
        perPage,
        totalItems,
        totalPages,
        offset,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1,
    };
}

module.exports = {
    formatDate,
    timeAgo,
    truncate,
    formatNumber,
    formatCurrency,
    starRating,
    pluralize,
    amenityIcon,
    amenityName,
    difficultyColor,
    campsiteTypeLabel,
    paginate,
};
