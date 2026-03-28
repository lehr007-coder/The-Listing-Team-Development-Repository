import { Hono } from 'hono';

const imageRoutes = new Hono();

// Serve image by slug
imageRoutes.get('/images/:slug', async (c) => {
  const slug = c.req.param('slug');
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE slug = ?').bind(slug).first();

  if (!image) {
    return c.json({ error: 'Image not found' }, 404);
  }

  const object = await c.env.IMAGES_BUCKET.get(image.filename);
  if (!object) {
    return c.json({ error: 'Image file not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', image.mime_type);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('ETag', `"${image.filename}"`);

  return new Response(object.body, { headers });
});

// Embeddable iframe page for a single image
imageRoutes.get('/embed/:slug', async (c) => {
  const slug = c.req.param('slug');
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE slug = ?').bind(slug).first();

  if (!image) {
    return c.html('<html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#999;">Image not found</body></html>', 404);
  }

  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${image.alt_title || image.original_name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:transparent;overflow:hidden}
img{max-width:100%;max-height:100vh;height:auto;display:block}
</style>
</head>
<body>
<img src="${baseUrl}/images/${image.slug}" alt="${(image.alt_title || '').replace(/"/g, '&quot;')}" title="${(image.description || '').replace(/"/g, '&quot;')}">
</body>
</html>`);
});

// Image metadata by slug
imageRoutes.get('/images/:slug/info', async (c) => {
  const slug = c.req.param('slug');
  const image = await c.env.DB.prepare('SELECT * FROM images WHERE slug = ?').bind(slug).first();

  if (!image) {
    return c.json({ error: 'Image not found' }, 404);
  }

  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;

  return c.json({
    url: `${baseUrl}/images/${image.slug}`,
    alt_title: image.alt_title,
    description: image.description,
    mime_type: image.mime_type,
    width: image.width,
    height: image.height,
    file_size: image.file_size,
    created_at: image.created_at,
  });
});

// Public gallery API (for embeddable widgets)
imageRoutes.get('/api/gallery', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page')) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit')) || 12));
  const search = c.req.query('search') || '';
  const offset = (page - 1) * limit;
  const baseUrl = c.env.BASE_URL || `https://${c.req.header('host')}`;

  let images, totalResult;

  if (search) {
    const searchParam = `%${search}%`;
    totalResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM images WHERE alt_title LIKE ? OR description LIKE ? OR slug LIKE ?'
    ).bind(searchParam, searchParam, searchParam).first();
    images = await c.env.DB.prepare(
      'SELECT slug, alt_title, description, width, height FROM images WHERE alt_title LIKE ? OR description LIKE ? OR slug LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(searchParam, searchParam, searchParam, limit, offset).all();
  } else {
    totalResult = await c.env.DB.prepare('SELECT COUNT(*) as total FROM images').first();
    images = await c.env.DB.prepare(
      'SELECT slug, alt_title, description, width, height FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(limit, offset).all();
  }

  const total = totalResult.total;

  return c.json({
    images: images.results.map((img) => ({
      ...img,
      url: `${baseUrl}/images/${img.slug}`,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

export { imageRoutes };
