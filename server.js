const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

app.set('trust proxy', 1);
app.use(express.json());

// ---------- sessions ----------

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_MS;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.setHeader('Set-Cookie',
    `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${PROD ? '; Secure' : ''}`);
}

function getSessionToken(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === 'sid') return v;
  }
  return null;
}

function getUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.username, s.expires_at FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

function requireAuth(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

// ---------- auth API ----------

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, _ or -).' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'That username is taken.' });
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, hash, Date.now());
  createSession(res, info.lastInsertRowid);
  res.json({ username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  createSession(res, row.id);
  res.json({ username: row.username });
});

app.post('/api/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${PROD ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ username: user.username });
});

// ---------- scores API ----------

const CATEGORIES = require('./public/js/catalog.js');
const GAME_IDS = new Set(CATEGORIES.flatMap(c => c.games.map(g => g.id)));

app.post('/api/scores', requireAuth, (req, res) => {
  const { game, score, wave } = req.body || {};
  if (!GAME_IDS.has(game)) return res.status(400).json({ error: 'Unknown game' });
  const s = Math.max(0, Math.floor(Number(score) || 0));
  const w = Math.max(0, Math.floor(Number(wave) || 0));
  db.prepare(`
    INSERT INTO scores (user_id, game, score, wave, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, game) DO UPDATE SET
      score = MAX(score, excluded.score),
      wave = MAX(wave, excluded.wave),
      updated_at = excluded.updated_at
  `).run(req.user.id, game, s, w, Date.now());
  const best = db.prepare('SELECT score, wave FROM scores WHERE user_id = ? AND game = ?').get(req.user.id, game);
  res.json({ best });
});

app.get('/api/scores/:game', requireAuth, (req, res) => {
  const game = req.params.game;
  if (!GAME_IDS.has(game)) return res.status(400).json({ error: 'Unknown game' });
  const top = db.prepare(`
    SELECT u.username, s.score, s.wave FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.game = ? ORDER BY s.score DESC LIMIT 10`).all(game);
  const me = db.prepare('SELECT score, wave FROM scores WHERE user_id = ? AND game = ?').get(req.user.id, game) || null;
  res.json({ top, me });
});

app.get('/api/me/scores', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT game, score, wave FROM scores WHERE user_id = ?').all(req.user.id);
  const byGame = {};
  for (const r of rows) byGame[r.game] = { score: r.score, wave: r.wave };
  res.json(byGame);
});

// ---------- stats ----------

/* Cross-game ranking can't just sum raw scores: a tower defense score and a
 * runner's metre count are different units, so summing them would make one
 * category worth more than the other by accident. Instead each game a player
 * has played awards points by placement within that game, floored at 10 so
 * showing up always counts for something. Overall = sum of those points, which
 * rewards both placing well and playing broadly. */
const MIN_POINTS = 10;
function placementPoints(rank, players) {
  return Math.max(MIN_POINTS, Math.round(100 * (1 - (rank - 1) / players)));
}

app.get('/api/stats', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id AS user_id, u.username, s.game, s.score, s.wave, s.updated_at,
           RANK() OVER (PARTITION BY s.game ORDER BY s.score DESC) AS rank,
           COUNT(*) OVER (PARTITION BY s.game) AS players
    FROM scores s
    JOIN users u ON u.id = s.user_id
  `).all().filter(r => GAME_IDS.has(r.game));

  const games = {};
  const players = new Map();

  for (const r of rows) {
    const entry = {
      username: r.username, score: r.score, wave: r.wave,
      rank: r.rank, players: r.players, updatedAt: r.updated_at,
      points: placementPoints(r.rank, r.players),
      isMe: r.user_id === req.user.id
    };

    const g = games[r.game] || (games[r.game] = { players: r.players, top: [], me: null });
    if (entry.rank <= 10) g.top.push(entry);
    if (entry.isMe) g.me = entry;

    let p = players.get(r.user_id);
    if (!p) {
      p = { username: r.username, points: 0, played: 0, totalScore: 0, golds: 0, silvers: 0, bronzes: 0, isMe: entry.isMe };
      players.set(r.user_id, p);
    }
    p.points += entry.points;
    p.played += 1;
    p.totalScore += r.score;
    if (r.rank === 1) p.golds++;
    else if (r.rank === 2) p.silvers++;
    else if (r.rank === 3) p.bronzes++;
  }

  for (const g of Object.values(games)) g.top.sort((a, b) => a.rank - b.rank);

  const overall = [...players.values()].sort((a, b) =>
    b.points - a.points || b.played - a.played || b.totalScore - a.totalScore
  );
  overall.forEach((p, i) => { p.rank = i + 1; });

  res.json({
    username: req.user.username,
    totalGames: GAME_IDS.size,
    overall,
    me: overall.find(p => p.isMe) || null,
    games
  });
});

// ---------- pages ----------

const PUB = path.join(__dirname, 'public');

app.get('/login', (req, res) => {
  if (getUser(req)) return res.redirect('/');
  res.sendFile(path.join(PUB, 'login.html'));
});

// Everything behind the hub and the games requires an account.
const GATED = ['/', '/index.html', '/stats', '/stats.html'];
app.use((req, res, next) => {
  if (GATED.includes(req.path) || req.path.startsWith('/games/')) {
    if (!getUser(req)) return res.redirect('/login');
  }
  next();
});

app.get('/stats', (req, res) => res.sendFile(path.join(PUB, 'stats.html')));

app.use(express.static(PUB));

app.listen(PORT, () => {
  console.log(`Pocket Arcade running on http://localhost:${PORT}`);
});
