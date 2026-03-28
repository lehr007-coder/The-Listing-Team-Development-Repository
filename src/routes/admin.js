import { Hono } from 'hono';

const adminRoutes = new Hono();

// Upload image
adminRoutes.post('/images', async (c) => {
  const maxSize = parseInt(c.env.MAX_FILE_SIZE_MB || '10') * 1024 * 1024;
  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;

  const formData = await c.req.formData();
  const file = formData.get('image');
  const altTitle = formData.get('alt_title') || '';
  const description = formData.get('description') || '';
  let slug = formData.get('slug') || '';

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No image file provided' }, 400);
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: `File type ${file.type} not allowed. Accepted: JPEG, PNG, GIF, WebP, SVG` }, 400);
  }

  // Validate file size
  if (file.size > maxSize) {
    return c.json({ error: `File too large. Maximum is ${c.env.MAX_FILE_SIZE_MB || 10}MB` }, 413);
  }

  // Generate filename
  const ext = file.name.split('.').pop().toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;

  // Generate or validate slug
  if (slug) {
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      return c.json({ error: 'Invalid slug format' }, 400);
    }
    const existing = await c.env.DB.prepare('SELECT id FROM images WHERE slug = ?').bind(slug).first();
    if (existing) {
      return c.json({ error: 'Slug already exists' }, 409);
    }
  } else {
    slug = generateSlug(file.name);
    // Ensure uniqueness
    let existing = await c.env.DB.prepare('SELECT id FROM images WHERE slug = ?').bind(slug).first();
    while (existing) {
      slug = generateSlug(file.name);
      existing = await c.env.DB.prepare('SELECT id FROM images WHERE slug = ?').bind(slug).first();
    }
  }

  // Upload to R2
  const arrayBuffer = await file.arrayBuffer();
  await c.env.IMAGES_BUCKET.put(filename, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  // Insert into D1
  const result = await c.env.DB.prepare(`
    INSERT INTO images (filename, original_name, slug, alt_title, description, mime_type, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(filename, file.name, slug, altTitle, description, file.type, file.size).run();

  const image = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(result.meta.last_row_id).first();

  return c.json({ ...image, url: `${baseUrl}/images/${image.slug}` }, 201);
});

// List images (paginated)
adminRoutes.get('/images', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit')) || 20));
  const search = c.req.query('search') || '';
  const offset = (page - 1) * limit;
  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;

  let images, totalResult;

  if (search) {
    const searchParam = `%${search}%`;
    totalResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM images WHERE alt_title LIKE ? OR description LIKE ? OR slug LIKE ? OR original_name LIKE ?'
    ).bind(searchParam, searchParam, searchParam, searchParam).first();
    images = await c.env.DB.prepare(
      'SELECT * FROM images WHERE alt_title LIKE ? OR description LIKE ? OR slug LIKE ? OR original_name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(searchParam, searchParam, searchParam, searchParam, limit, offset).all();
  } else {
    totalResult = await c.env.DB.prepare('SELECT COUNT(*) as total FROM images').first();
    images = await c.env.DB.prepare(
      'SELECT * FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();
  }

  const total = totalResult.total;

  return c.json({
    images: images.results.map((img) => ({ ...img, url: `${baseUrl}/images/${img.slug}` })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// Get single image
adminRoutes.get('/images/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(id).first();

  if (!image) return c.json({ error: 'Image not found' }, 404);

  return c.json({ ...image, url: `${baseUrl}/images/${image.slug}` });
});

// Update image metadata
adminRoutes.put('/images/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(id).first();

  if (!image) return c.json({ error: 'Image not found' }, 404);

  const body = await c.req.json();
  const altTitle = body.alt_title !== undefined ? body.alt_title : image.alt_title;
  const description = body.description !== undefined ? body.description : image.description;
  let slug = body.slug !== undefined ? body.slug : image.slug;

  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return c.json({ error: 'Invalid slug format' }, 400);
  }

  if (slug !== image.slug) {
    const existing = await c.env.DB.prepare('SELECT id FROM images WHERE slug = ?').bind(slug).first();
    if (existing) return c.json({ error: 'Slug already in use' }, 409);
  }

  await c.env.DB.prepare(
    "UPDATE images SET alt_title = ?, description = ?, slug = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(altTitle, description, slug, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(id).first();

  return c.json({ ...updated, url: `${baseUrl}/images/${updated.slug}` });
});

// Delete image
adminRoutes.delete('/images/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(id).first();

  if (!image) return c.json({ error: 'Image not found' }, 404);

  // Delete from R2
  await c.env.IMAGES_BUCKET.delete(image.filename);

  // Delete from D1
  await c.env.DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();

  return c.json({ message: 'Image deleted', id });
});

// Stats
adminRoutes.get('/stats', async (c) => {
  const totalImages = await c.env.DB.prepare('SELECT COUNT(*) as count FROM images').first();
  const totalSize = await c.env.DB.prepare('SELECT COALESCE(SUM(file_size), 0) as size FROM images').first();

  return c.json({
    totalImages: totalImages.count,
    totalSize: totalSize.size,
  });
});

// Slug helper
function generateSlug(originalName) {
  const name = originalName.replace(/\.[^/.]+$/, '');
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : suffix;
}

export { adminRoutes };
