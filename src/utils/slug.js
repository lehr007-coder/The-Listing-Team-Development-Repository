const crypto = require('crypto');
const path = require('path');

function generateSlug(originalName) {
  const name = path.parse(originalName).name;
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const suffix = crypto.randomBytes(2).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}

function validateSlug(slug) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}

module.exports = { generateSlug, validateSlug };
