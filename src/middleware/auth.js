const crypto = require('crypto');
const config = require('../config');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Image Server Admin"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const separatorIndex = credentials.indexOf(':');
  if (separatorIndex === -1) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Image Server Admin"');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const username = credentials.slice(0, separatorIndex);
  const password = credentials.slice(separatorIndex + 1);

  const usernameMatch = safeCompare(username, config.adminUsername);
  const passwordMatch = safeCompare(password, config.adminPassword);

  if (usernameMatch && passwordMatch) {
    return next();
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Image Server Admin"');
  return res.status(401).json({ error: 'Invalid credentials' });
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = authMiddleware;
