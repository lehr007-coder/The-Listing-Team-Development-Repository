const path = require('path');
const fs = require('fs');

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  databaseDir: path.resolve(process.env.DATABASE_DIR || './data'),
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
};

// Ensure directories exist
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.databaseDir, { recursive: true });

module.exports = config;
