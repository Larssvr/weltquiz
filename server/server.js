// Weltquiz-Server: speichert den Lernfortschritt von Emilia und Lars, damit beide ihn auf jedem Gerät
// haben und sich gegenseitig sehen – dazu die Minispiel-Rekorde und die Ergebnisse des Tagesrätsels.
// Ohne Abhängigkeiten, Daten als JSON-Datei auf dem Railway-Volume.
// Schreiben führt immer zusammen und löscht nie etwas; jeden Tag entsteht eine Sicherungskopie.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +process.env.PORT || 8080;
const DIR = process.env.DATA_DIR || '/data';
const FILE = path.join(DIR, 'weltquiz.json');
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://larssvr.github.io,http://localhost:8766').split(',').map(s => s.trim());
const PLAYERS = { emilia: 'Emilia', lars: 'Lars' };
const MODES = new Set(['laender', 'hauptstaedte', 'gewaesser', 'flaggen']);
const MAX_BODY = 1_000_000;

fs.mkdirSync(DIR, { recursive: true });
let db = load();

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (d && d.players) return d;
  } catch { /* neu */ }
  return { players: {} };
}

function persist() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
  const day = new Date().toISOString().slice(0, 10);
  const bak = path.join(DIR, `backup-${day}.json`);
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(FILE, bak);
    const old = fs.readdirSync(DIR).filter(f => f.startsWith('backup-')).sort();
    while (old.length > 30) fs.unlinkSync(path.join(DIR, old.shift()));
  }
}

// Ein Eintrag je Land/Gewässer: n = Versuche, c = richtig, s = richtig in Folge, t = letzte Antwort (ms)
function mergeItem(a, b) {
  if (!a) return b;
  if (!b) return a;
  const latest = (b.t || 0) > (a.t || 0) ? b : a;
  return { n: Math.max(a.n, b.n), c: Math.max(a.c, b.c), s: latest.s, t: Math.max(a.t, b.t) };
}

function cleanStats(stats) {
  const out = {};
  if (!stats || typeof stats !== 'object') return out;
  const limit = Date.now() + 864e5;
  const num = x => (Number.isFinite(+x) && +x >= 0 ? Math.min(Math.floor(+x), 1e6) : 0);
  for (const [mode, items] of Object.entries(stats)) {
    if (!MODES.has(mode) || !items || typeof items !== 'object') continue;
    for (const [id, v] of Object.entries(items)) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || !v || typeof v !== 'object') continue;
      const t = Number.isFinite(+v.t) && +v.t > 0 && +v.t < limit ? Math.floor(+v.t) : 0;
      (out[mode] ||= {})[id] = { n: num(v.n), c: num(v.c), s: num(v.s), t };
    }
  }
  return out;
}

// Minispiele: je Spiel der beste Wert (best) und wann er erreicht wurde (at)
const GAME_KEY = /^[a-z][a-z0-9-]{1,39}$/;
// Tagesrätsel: je Tag ein Ergebnis (score) mit Zeitpunkt (t)
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function cleanNum(x, max = 1e7) {
  return Number.isFinite(+x) && +x >= 0 ? Math.min(Math.round(+x), max) : null;
}

function cleanTime(x) {
  const limit = Date.now() + 864e5;
  return Number.isFinite(+x) && +x > 0 && +x < limit ? Math.floor(+x) : 0;
}

function cleanGames(games) {
  const out = {};
  if (!games || typeof games !== 'object') return out;
  for (const [key, v] of Object.entries(games).slice(0, 80)) {
    if (!GAME_KEY.test(key) || !v || typeof v !== 'object') continue;
    const best = cleanNum(v.best);
    if (best != null) out[key] = { best, at: cleanTime(v.at) };
  }
  return out;
}

function cleanDaily(daily) {
  const out = {};
  if (!daily || typeof daily !== 'object') return out;
  for (const [day, v] of Object.entries(daily).slice(-500)) {
    if (!DAY_KEY.test(day) || !v || typeof v !== 'object') continue;
    const score = cleanNum(v.score), t = cleanTime(v.t);
    if (score != null && t) out[day] = { score, t };
  }
  return out;
}

function mergeInto(player, stats, games = {}, daily = {}) {
  const p = db.players[player] ||= { name: PLAYERS[player], stats: {}, updatedAt: 0 };
  for (const [mode, items] of Object.entries(stats)) {
    const m = p.stats[mode] ||= {};
    for (const [id, v] of Object.entries(items)) m[id] = mergeItem(m[id], v);
  }
  // Rekorde: der bessere Wert bleibt
  const g = p.games ||= {};
  for (const [key, v] of Object.entries(games)) {
    const cur = g[key];
    if (!cur || v.best > cur.best || (v.best === cur.best && v.at && (!cur.at || v.at < cur.at))) g[key] = v;
  }
  // Tagesrätsel: der erste Versuch des Tages zählt
  const d = p.daily ||= {};
  for (const [day, v] of Object.entries(daily)) {
    if (!d[day] || v.t < d[day].t) d[day] = v;
  }
  p.updatedAt = Date.now();
  return p;
}

// einfache Bremse gegen Missbrauch
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60_000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  return h.n > 120;
}

function send(res, code, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  res.writeHead(code, headers);
  res.end(body == null ? '' : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, null, origin);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true }, origin);

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const players = {};
    for (const id of Object.keys(PLAYERS)) {
      const p = db.players[id];
      players[id] = { name: PLAYERS[id], stats: p?.stats || {}, games: p?.games || {}, daily: p?.daily || {}, updatedAt: p?.updatedAt || 0 };
    }
    return send(res, 200, { players, now: Date.now() }, origin);
  }

  const m = url.pathname.match(/^\/api\/players\/([a-z]+)$/);
  if (req.method === 'POST' && m) {
    const player = m[1];
    if (!PLAYERS[player]) return send(res, 404, { error: 'Unbekannter Spieler' }, origin);
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (limited(ip)) return send(res, 429, { error: 'Zu viele Anfragen' }, origin);
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { send(res, 413, { error: 'Zu groß' }, origin); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { error: 'Kein gültiges JSON' }, origin); }
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'Kein gültiges JSON' }, origin);
      const p = mergeInto(player, cleanStats(body.stats), cleanGames(body.games), cleanDaily(body.daily));
      try { persist(); } catch (e) { console.error('Speichern fehlgeschlagen', e); return send(res, 500, { error: 'Speichern fehlgeschlagen' }, origin); }
      send(res, 200, { ok: true, updatedAt: p.updatedAt, stats: p.stats, games: p.games || {}, daily: p.daily || {} }, origin);
    });
    return;
  }

  send(res, 404, { error: 'Nicht gefunden' }, origin);
});

server.listen(PORT, () => console.log(`Weltquiz-Server auf Port ${PORT}, Daten in ${FILE}`));
