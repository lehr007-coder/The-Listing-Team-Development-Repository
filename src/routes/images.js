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

module.exports = router;
