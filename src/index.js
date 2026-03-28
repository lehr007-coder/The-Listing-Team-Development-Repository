import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adminRoutes } from './routes/admin.js';
import { imageRoutes } from './routes/images.js';
import { adminHTML } from './admin/index.js';
import { adminCSS } from './admin/style.js';
import { adminJS } from './admin/app.js';
import { embedGuideHTML } from './admin/embed-guide.js';
import { widgetJS } from './embed/widget.js';

const app = new Hono();

// CORS for public endpoints
app.use('/images/*', cors());
app.use('/api/*', cors());
app.use('/embed/*', cors());

// Public routes - no auth
app.route('/', imageRoutes);

// Embed widget - no auth
app.get('/embed/widget.js', (c) => {
  return c.body(widgetJS, 200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' });
});

// Admin static files - auth required
app.use('/admin/*', async (c, next) => {
  const auth = basicAuth(c);
  if (!auth) {
    return c.body('Unauthorized', 401, { 'WWW-Authenticate': 'Basic realm="Image Server Admin"' });
  }
  await next();
});

app.get('/admin', (c) => c.html(adminHTML));
app.get('/admin/', (c) => c.html(adminHTML));
app.get('/admin/style.css', (c) => {
  return c.body(adminCSS, 200, { 'Content-Type': 'text/css' });
});
app.get('/admin/app.js', (c) => {
  return c.body(adminJS, 200, { 'Content-Type': 'application/javascript' });
});
app.get('/admin/embed-guide.html', (c) => c.html(embedGuideHTML));

// Admin API routes - auth required
app.use('/admin/api/*', async (c, next) => {
  const auth = basicAuth(c);
  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.route('/admin/api', adminRoutes);

// Basic auth helper
function basicAuth(c) {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Basic ')) return false;

  const decoded = atob(header.slice(6));
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;

  const username = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);

  return username === c.env.ADMIN_USERNAME && password === c.env.ADMIN_PASSWORD;
}

export default app;
