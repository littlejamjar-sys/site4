const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads';

/**
 * Process and save an uploaded image.
 * @param {object} file - Multer file object
 * @param {string} subfolder - e.g. 'avatars', 'articles', 'campsites'
 * @param {object} options - { maxWidth, maxHeight, quality }
 * @returns {string} Relative path to saved file
 */
async function processImage(file, subfolder, options = {}) {
    const {
        maxWidth = 1200,
        maxHeight = null,
        quality = 80,
    } = options;

    const ext = '.webp';
    const filename = `${uuidv4()}${ext}`;
    const outputDir = path.join(UPLOAD_DIR, subfolder);
    const outputPath = path.join(outputDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    let pipeline = sharp(file.buffer || file.path);

    // Resize
    const resizeOptions = { width: maxWidth, withoutEnlargement: true };
    if (maxHeight) {
        resizeOptions.height = maxHeight;
        resizeOptions.fit = 'cover';
    }
    pipeline = pipeline.resize(resizeOptions);

    // Convert to webp
    pipeline = pipeline.webp({ quality });

    await pipeline.toFile(outputPath);

    // Clean up temp file if multer saved to disk
    if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }

    return `/public/uploads/${subfolder}/${filename}`;
}

/**
 * Process avatar upload (200x200 square crop).
 */
async function processAvatar(file) {
    return processImage(file, 'avatars', {
        maxWidth: 200,
        maxHeight: 200,
        quality: 85,
    });
}

/**
 * Process cover image (1200x630 for social sharing).
 */
async function processCoverImage(file, subfolder) {
    return processImage(file, subfolder, {
        maxWidth: 1200,
        maxHeight: 630,
        quality: 80,
    });
}

/**
 * Process general content image (max 1200px wide).
 */
async function processContentImage(file, subfolder) {
    return processImage(file, subfolder, {
        maxWidth: 1200,
        quality: 80,
    });
}

/**
 * Delete an uploaded file.
 */
function deleteImage(filePath) {
    if (!filePath) return;
    const fullPath = path.join(__dirname, '..', filePath);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
}

module.exports = { processImage, processAvatar, processCoverImage, processContentImage, deleteImage };
