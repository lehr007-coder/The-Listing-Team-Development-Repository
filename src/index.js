const express = require('express');
const path = require('path');
const config = require('./config');
const { db } = require('./database');
const authMiddleware = require('./middleware/auth');
const imagesRouter = require('./routes/images');
const adminRouter = require('./routes/admin');

const app = express();

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS for public image serving
app.use('/images', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Public routes - serve images without auth
app.use('/', imagesRouter);

// Admin portal - protected by basic auth
app.use('/admin', authMiddleware, express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/admin/api', authMiddleware, adminRouter);

// Error handling
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large. Maximum size is ${config.maxFileSizeMB}MB` });
  }
  if (err.message && err.message.includes('File type')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(config.port, config.host, () => {
  console.log(`Image server running at http://${config.host}:${config.port}`);
  console.log(`Admin portal: http://${config.host}:${config.port}/admin`);
  console.log(`Base URL for images: ${config.baseUrl}/images/<slug>`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});
