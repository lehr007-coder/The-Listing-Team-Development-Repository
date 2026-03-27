const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const config = require('../config');
const db = require('../database');
const upload = require('../middleware/upload');
const { generateSlug, validateSlug } = require('../utils/slug');

const router = express.Router();

// Upload a new image
router.post('/images', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { alt_title = '', description = '' } = req.body;
    let slug = req.body.slug;

    if (slug) {
      slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!validateSlug(slug)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Invalid slug format' });
      }
      // Check uniqueness
      if (db.getBySlug(slug)) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({ error: 'Slug already exists' });
      }
    } else {
      slug = generateSlug(req.file.originalname);
      // Ensure uniqueness
      while (db.getBySlug(slug)) {
        slug = generateSlug(req.file.originalname);
      }
    }

    // Get image dimensions
    let width = null;
    let height = null;
    try {
      if (req.file.mimetype !== 'image/svg+xml') {
        const metadata = await sharp(req.file.path).metadata();
        width = metadata.width;
        height = metadata.height;
      }
    } catch (e) {
      // Non-fatal: dimensions are optional
    }

    const image = db.insert({
      filename: req.file.filename,
      original_name: req.file.originalname,
      slug,
      alt_title,
      description,
      mime_type: req.file.mimetype,
      file_size: req.file.size,
      width,
      height,
    });

    res.status(201).json({
      ...image,
      url: `${config.baseUrl}/images/${image.slug}`,
    });
  } catch (err) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Slug already exists' });
    }
    throw err;
  }
});

// List images (paginated)
router.get('/images', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const search = req.query.search || '';

  const result = db.getAll({ page, limit, search });
  result.images = result.images.map((img) => ({
    ...img,
    url: `${config.baseUrl}/images/${img.slug}`,
  }));

  res.json(result);
});

// Get single image
router.get('/images/:id', (req, res) => {
  const image = db.getById(parseInt(req.params.id, 10));
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }
  res.json({ ...image, url: `${config.baseUrl}/images/${image.slug}` });
});

// Update image metadata
router.put('/images/:id', express.json(), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const image = db.getById(id);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  const alt_title = req.body.alt_title !== undefined ? req.body.alt_title : image.alt_title;
  const description = req.body.description !== undefined ? req.body.description : image.description;
  let slug = req.body.slug !== undefined ? req.body.slug : image.slug;

  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (!validateSlug(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  // Check slug uniqueness (if changed)
  if (slug !== image.slug) {
    const existing = db.getBySlug(slug);
    if (existing) {
      return res.status(409).json({ error: 'Slug already in use' });
    }
  }

  const updated = db.update(id, { alt_title, description, slug });
  res.json({ ...updated, url: `${config.baseUrl}/images/${updated.slug}` });
});

// Delete image
router.delete('/images/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const image = db.remove(id);
  if (!image) {
    return res.status(404).json({ error: 'Image not found' });
  }

  // Remove file from disk
  const filePath = path.join(config.uploadDir, image.filename);
  try { fs.unlinkSync(filePath); } catch (e) { /* ignore if already gone */ }

  res.json({ message: 'Image deleted', id });
});

// Stats
router.get('/stats', (req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

module.exports = router;
