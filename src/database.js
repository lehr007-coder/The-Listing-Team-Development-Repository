const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

const db = new Database(path.join(config.databaseDir, 'images.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    alt_title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_images_slug ON images(slug);
  CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);
`);

const insertImage = db.prepare(`
  INSERT INTO images (filename, original_name, slug, alt_title, description, mime_type, file_size, width, height)
  VALUES (@filename, @original_name, @slug, @alt_title, @description, @mime_type, @file_size, @width, @height)
`);

const getImageBySlug = db.prepare('SELECT * FROM images WHERE slug = ?');
const getImageById = db.prepare('SELECT * FROM images WHERE id = ?');
const deleteImageById = db.prepare('DELETE FROM images WHERE id = ?');

const updateImageStmt = db.prepare(`
  UPDATE images SET alt_title = @alt_title, description = @description, slug = @slug, updated_at = datetime('now')
  WHERE id = @id
`);

function insert(data) {
  const result = insertImage.run(data);
  return getImageById.get(result.lastInsertRowid);
}

function getBySlug(slug) {
  return getImageBySlug.get(slug);
}

function getById(id) {
  return getImageById.get(id);
}

function getAll({ page = 1, limit = 20, search = '' } = {}) {
  const offset = (page - 1) * limit;
  let query, countQuery;

  if (search) {
    const searchParam = `%${search}%`;
    countQuery = db.prepare(
      'SELECT COUNT(*) as total FROM images WHERE alt_title LIKE ? OR description LIKE ? OR slug LIKE ? OR original_name LIKE ?'
    );
    query = db.prepare(
      'SELECT * FROM images WHERE alt_title LIKE ? OR description LIKE ? OR slug LIKE ? OR original_name LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    );
    const { total } = countQuery.get(searchParam, searchParam, searchParam, searchParam);
    const images = query.all(searchParam, searchParam, searchParam, searchParam, limit, offset);
    return { images, total, page, totalPages: Math.ceil(total / limit) };
  }

  countQuery = db.prepare('SELECT COUNT(*) as total FROM images');
  query = db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?');
  const { total } = countQuery.get();
  const images = query.all(limit, offset);
  return { images, total, page, totalPages: Math.ceil(total / limit) };
}

function update(id, { alt_title, description, slug }) {
  updateImageStmt.run({ id, alt_title, description, slug });
  return getImageById.get(id);
}

function remove(id) {
  const image = getImageById.get(id);
  if (image) {
    deleteImageById.run(id);
  }
  return image;
}

function getStats() {
  const totalImages = db.prepare('SELECT COUNT(*) as count FROM images').get().count;
  const totalSize = db.prepare('SELECT COALESCE(SUM(file_size), 0) as size FROM images').get().size;
  const recent = db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 5').all();
  return { totalImages, totalSize, recent };
}

module.exports = { db, insert, getBySlug, getById, getAll, update, remove, getStats };
