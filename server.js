'use strict';
const express = require('express');
const helmet = require('helmet');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOKEN_SECRET = process.env.TOKEN_SECRET;
if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
  console.error('TOKEN_SECRET must be set to a random secret of at least 32 characters.');
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'pocket-stock.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS items_user_updated ON items(user_id, updated_at);
`);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // The bundled Caddy reverse proxy is trusted.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50mb', strict: true }));
const attempts = new Map();
function authRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = attempts.get(key);
  if (!record || now - record.start > 10 * 60 * 1000) record = { start: now, count: 0 };
  record.count++;
  attempts.set(key, record);
  if (record.count > 30) return res.status(429).json({ error: 'Too many attempts. Try again in 10 minutes.' });
  next();
}
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}
function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return payload + '.' + signature;
}
function readToken(token) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(parts[0]).digest();
  let supplied;
  try { supplied = Buffer.from(parts[1], 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const user = match && readToken(match[1]);
  if (!user) return res.status(401).json({ error: 'Session expired or invalid. Sign in again.' });
  req.user = user;
  next();
}
function validCredentials(username, password) {
  return typeof username === 'string' && /^[a-zA-Z0-9_.-]{3,80}$/.test(username) &&
    typeof password === 'string' && password.length >= 12 && password.length <= 256;
}
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'pocket-stock' }));
app.get('/api/auth/status', (_req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  res.json({ accountExists: count > 0 });
});
app.post('/api/auth/register', authRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (!validCredentials(username, password)) return res.status(400).json({ error: 'Use a 3–80 character username (letters, numbers, dot, underscore, hyphen) and a password of at least 12 characters.' });
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) {
    return res.status(403).json({ error: 'An account already exists on this server. Sign in with it on other devices.' });
  }
  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  try {
    db.prepare('INSERT INTO users(id, username, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, salt, passwordHash, Date.now());
  } catch (e) {
    return res.status(409).json({ error: 'Could not create account. Check the username and try again.' });
  }
  res.status(201).json({ token: signToken({ id, username }), username });
});
app.post('/api/auth/login', authRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || username.length > 80 || typeof password !== 'string' || password.length < 1 || password.length > 256) return res.status(400).json({ error: 'Enter a valid username and password.' });
  const user = db.prepare('SELECT id, username, salt, password_hash FROM users WHERE username = ? COLLATE NOCASE').get(username);
  // Perform a dummy scrypt when the user does not exist to reduce username timing leaks.
  const actual = user ? hashPassword(password, user.salt) : hashPassword(password, '00'.repeat(16));
  const expected = user ? user.password_hash : '00'.repeat(64);
  const ok = actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  if (!user || !ok) return res.status(401).json({ error: 'Incorrect username or password.' });
  res.json({ token: signToken({ id: user.id, username: user.username }), username: user.username });
});

const getItems = db.prepare('SELECT id, updated_at, payload FROM items WHERE user_id = ?');
const getOne = db.prepare('SELECT updated_at FROM items WHERE user_id = ? AND id = ?');
const putItem = db.prepare(`INSERT INTO items(user_id, id, updated_at, payload) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, id) DO UPDATE SET updated_at=excluded.updated_at, payload=excluded.payload`);
const mergeItems = db.transaction((userId, incoming) => {
  for (const item of incoming) {
    const existing = getOne.get(userId, item.id);
    const stamp = Number(item.updatedAt);
    if (!existing || stamp >= existing.updated_at) {
      putItem.run(userId, item.id, stamp, JSON.stringify(item));
    }
  }
  return getItems.all(userId).map(row => JSON.parse(row.payload));
});
app.post('/api/sync', requireAuth, (req, res) => {
  const incoming = req.body && req.body.items;
  if (!Array.isArray(incoming) || incoming.length > 10000) return res.status(400).json({ error: 'Expected an items array with no more than 10,000 records.' });
  const cleaned = [];
  for (const item of incoming) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || item.id.length < 1 || item.id.length > 100) {
      return res.status(400).json({ error: 'An item has an invalid ID.' });
    }
    const updatedAt = Number(item.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt < 0 || updatedAt > Date.now() + 86400000) {
      return res.status(400).json({ error: 'An item has an invalid update timestamp. Check device date and time.' });
    }
    const safe = {
      id: item.id,
      barcode: typeof item.barcode === 'string' ? item.barcode.slice(0, 160) : '',
      name: typeof item.name === 'string' ? item.name.slice(0, 500) : '',
      quantity: Math.max(0, Math.min(100000000, Number(item.quantity) || 0)),
      category: typeof item.category === 'string' ? item.category.slice(0, 200) : '',
      location: typeof item.location === 'string' ? item.location.slice(0, 300) : '',
      notes: typeof item.notes === 'string' ? item.notes.slice(0, 5000) : '',
      photo: typeof item.photo === 'string' && item.photo.length <= 6 * 1024 * 1024 ? item.photo : null,
      updatedAt,
      deleted: Boolean(item.deleted)
    };
    if (item.photo && safe.photo === null) return res.status(413).json({ error: 'A photo is too large. Please use a photo smaller than 4 MB.' });
    cleaned.push(safe);
  }
  try {
    const all = mergeItems(req.user.sub, cleaned);
    res.json({ items: all, syncedAt: Date.now() });
  } catch (e) {
    console.error('Sync failed:', e.message);
    res.status(500).json({ error: 'Could not sync inventory. Check server storage and try again.' });
  }
});

const staticDir = path.join(__dirname, 'public');
app.use(express.static(staticDir, { etag: true, maxAge: '1h', setHeaders(res, filePath) {
  if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
} }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found.' });
  res.sendFile(path.join(staticDir, 'index.html'), err => { if (err) next(err); });
});
app.listen(PORT, '0.0.0.0', () => console.log(`Pocket Stock server listening on ${PORT}`));
