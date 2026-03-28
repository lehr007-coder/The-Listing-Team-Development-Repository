const express = require('express');
const path = require('path');
const config = require('../config');
const db = require('../database');

const router = express.Router();

// Serve image by slug
router.get('/images/:slug', (req, res) => {
  const image = db.getBySlug(req.params.slug);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const filePath = path.join(config.uploadDir, image.filename);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', image.mime_type);
  res.sendFile(filePath);
});

// Get image metadata by slug
router.get('/images/:slug/info', (req, res) => {
  const image = db.getBySlug(req.params.slug);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.json({
    url: `${config.baseUrl}/images/${image.slug}`,
    alt_title: image.alt_title,
    description: image.description,
    mime_type: image.mime_type,
    width: image.width,
    height: image.height,
    file_size: image.file_size,
    created_at: image.created_at,
  });
});

// Public gallery API (no auth) - for embeddable widgets
router.get('/api/gallery', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const search = req.query.search || '';

  const result = db.getAll({ page, limit, search });
  result.images = result.images.map((img) => ({
    slug: img.slug,
    url: `${config.baseUrl}/images/${img.slug}`,
    alt_title: img.alt_title,
    description: img.description,
    width: img.width,
    height: img.height,
  }));

  res.json(result);
});

module.exports = router;
