// Minispiele: kurze Spiele mit Rekorden, die Emilia und Lars gegenseitig sehen –
// Blitzrunde, Städte-Pin, Nachbarn, Entweder-oder, Umrisse und das Tagesrätsel.
import { W } from './map.js?v=10';
import { NUMBERS } from './data/numbers.js?v=10';

const fmt = n => Math.round(n).toLocaleString('de-DE');
const genName = n => (/[sßxz]$/.test(n) ? n + '’' : n + 's');   // „Emilias Rekord“, „Lars’ Rekord“
const clockText = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dec = (n, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

// Grenzen, die in den Kartendaten fehlen (Botswana–Sambia: 150 m bei Kazungula; Israel–Syrien: Golan)
const EXTRA_BORDERS = [['BW', 'ZM'], ['IL', 'SY']];
// Gebiete ohne eigenen Staat, die trotzdem als Nachbar zählen
const NEIGHBOR_AREAS = new Set(['EH', 'GI']);

const SW = {
  minispiele: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#f5e79b"/><path d="M19 2L9 14h7l-2 8 11-13h-7z" fill="#d6246e" stroke="#2a2833" stroke-width="1" stroke-linejoin="round"/></svg>',
  tagesraetsel: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><rect width="34" height="7" fill="#d6246e"/><path d="M9 1v4M25 1v4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M17 9.5a4 4 0 0 1 4 4c0 3-4 7-4 7s-4-4-4-7a4 4 0 0 1 4-4z" fill="#2a2833"/><circle cx="17" cy="13.5" r="1.4" fill="#fff"/></svg>',
  blitz: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><circle cx="17" cy="13.5" r="8" fill="#f5e79b" stroke="#2a2833" stroke-width="1.4"/><path d="M15 2.5h4M17 2.5v3" stroke="#2a2833" stroke-width="1.4"/><path d="M17 13.5V8.5" stroke="#d6246e" stroke-width="1.8" stroke-linecap="round"/><path d="M17 13.5l3.5 2" stroke="#2a2833" stroke-width="1.4" stroke-linecap="round"/></svg>',
  pin: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#a9d3ea"/><path d="M0 17l9-3 5 3 8-4 12 2v9H0z" fill="#cfe1a9"/><path d="M7 8l15 7" stroke="#2a2833" stroke-width="1.2" stroke-dasharray="2.5 2"/><circle cx="7" cy="8" r="2.4" fill="#2a2833" stroke="#fff" stroke-width="1"/><path d="M22.5 15l1.4 2.9 3.1.3-2.3 2.1.7 3.1-2.9-1.6-2.9 1.6.7-3.1-2.3-2.1 3.1-.3z" fill="#fff" stroke="#11683a" stroke-width="1"/></svg>',
  nachbarn: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#cfe1a9"/><path d="M0 0h13l2 9-7 4-8-1z" fill="#f5e79b"/><path d="M13 0h21v9l-10 2-9-2z" fill="#f2c0c7"/><path d="M15 9l9 2 10-2v15H11l-3-11z" fill="#d6246e"/><path d="M13 0l2 9-7 4 3 11M15 9l9 2 10-2" fill="none" stroke="#85766a" stroke-width="1"/></svg>',
  vergleich: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><rect x="6" y="11" width="8" height="10" fill="#f3d29b" stroke="#2a2833" stroke-width="1.2"/><rect x="20" y="4" width="8" height="17" fill="#cfe1a9" stroke="#2a2833" stroke-width="1.2"/><path d="M3 21h28" stroke="#2a2833" stroke-width="1.4"/></svg>',
  umrisse: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><path d="M7 7l5-3 4 2 5-2 4 3 3-1 1 5-3 2 2 4-4 4-5-1-3 2-5-2-2-4 1-3-3-2z" fill="#2a2833"/></svg>',
};

const GAMES = [
  {
    id: 'blitz', name: 'Blitzrunde', desc: '60 Sekunden: Wie viele Länder findest du?',
    how: ['Ein Land wird genannt – tippe es auf der Karte an.', 'Richtig geht sofort weiter. Bei einem Fehler zeigt die Karte kurz die Lösung.', 'Rekorde gibt es je Region.'],
    unit: n => (n === 1 ? 'Land' : 'Länder'),
  },
  {
    id: 'pin', name: 'Städte-Pin', desc: 'Wo liegt die Stadt? Je näher dein Tipp, desto mehr Punkte.',
    how: ['Fünf Hauptstädte und bekannte Städte.', 'Setz deinen Punkt auf die Karte – heranzoomen hilft beim Zielen.', 'Bis 25 km daneben gibt es volle 1000 Punkte, danach immer weniger.'],
    unit: () => 'Punkte',
  },
  {
    id: 'nachbarn', name: 'Nachbarn', desc: 'Tippe alle Nachbarländer an.',
    how: ['Fünf Länder, jeweils alle Nachbarn mit gemeinsamer Landgrenze finden.', 'Jeder Nachbar gibt einen Punkt, alle ohne Fehler drei Punkte extra.', 'Nach drei falschen Ländern ist das Land vorbei.'],
    unit: () => 'Punkte',
  },
  {
    id: 'vergleich', name: 'Entweder-oder', desc: 'Größer? Mehr Einwohner? Weiter nördlich? Bis zum ersten Fehler.',
    how: ['Zwei Länder – wähle das richtige.', 'Gefragt wird nach Fläche, Einwohnerzahl oder der Lage der Hauptstadt.', 'Wie lang wird deine Serie?'],
    unit: () => 'richtig in Folge',
  },
  {
    id: 'umrisse', name: 'Umrisse', desc: 'Erkenne Länder an ihrer Form – ganz ohne Zeitdruck.',
    how: ['Zehn Umrisse, vier Antworten zur Auswahl.', 'Keine Uhr: Schau dir jede Form in Ruhe an.', 'Die Karte bleibt abgedeckt, bis du geantwortet hast.'],
    // eigene Rekordliste: die alten Rekorde (Punkte mit Zeitbonus) sind mit „erkannt von 10“ nicht vergleichbar
    key: 'umrisse10',
    unit: () => 'von 10 erkannt',
  },
];

export function createGames(ctx) {
  const {
    map, state, sfx, C, COUNTRIES, CITIES, PLAYERS, CONTINENTS,
    $, esc, flagUrl, shuffle, nameOf, nom, acc, gen, inDat, pl, capFirst, emph, unionBox, regionLabel, playerName,
  } = ctx;

  let screen = 'hub';     // hub | intro | result (im Panel „Minispiele“)
  let intro = { id: 'blitz', region: 'welt' };
  let game = null;        // laufendes Spiel
  let seq = 0;            // jede Runde bekommt eine Nummer – alte Zeitgeber verfallen

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const me = () => state.player;
  const keyOf = (id, region = 'welt') => (id === 'blitz' ? 'blitz-' + region : GAMES.find(g => g.id === id)?.key || id);
  const bestOf = (pid, key) => ctx.gamesOf(pid)?.[key]?.best ?? null;
  const dayOf = (pid, day = today()) => ctx.dailyOf(pid)?.[day] || null;
  const nameFor = code => C.get(code)?.name || map.countryFeatures.find(f => f.properties.c === code)?.properties.n || code;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function hud(bar, text) {
    $('#scalebar').innerHTML = bar;
    $('#hud-text').innerHTML = text;
  }

  function card(html) {
    $('#view-game').innerHTML = html;
  }

  function pickable(on) {
    $('#map').classList.toggle('pickable', !!on);
    if (!on) { map.onClick = null; map.hitOptions = null; }
  }

  function veil(on) {
    $('#map').classList.toggle('veiled', !!on);
  }

  /* ---------- Rekorde anzeigen ---------- */

  function recordsHtml(key, unit, { compact = false } = {}) {
    const rows = PLAYERS.map(p => ({ ...p, best: bestOf(p.id, key) }));
    if (!state.player) {
      const b = bestOf(null, key);
      return b == null ? '' : `<span class="rec">Dein Rekord: <b>${fmt(b)}</b></span>`;
    }
    if (rows.every(r => r.best == null)) return compact ? '<span class="rec muted">Noch kein Rekord</span>' : '';
    const top = Math.max(...rows.map(r => r.best ?? -1));
    if (compact) {
      return `<span class="rec">${rows.map(r => `<span class="p-${r.id}${r.best === top ? ' lead' : ''}">${esc(r.name)} <b>${r.best == null ? '–' : fmt(r.best)}</b></span>`).join('')}</span>`;
    }
    return `<div class="rec-board">${rows.map(r => `<div class="rb p-${r.id}${r.best === top && r.best != null ? ' lead' : ''}">
      <span class="rb-name">${esc(r.name)}${r.id === me() ? ' <small>(du)</small>' : ''}</span>
      <span class="rb-val">${r.best == null ? '–' : fmt(r.best)}</span>
      <span class="rb-unit">${r.best == null ? 'noch kein Rekord' : esc(unit(r.best))}</span></div>`).join('')}</div>`;
  }

  /* ---------- Übersicht ---------- */

  function openHub() {
    stop();
    screen = 'hub';
    renderHub();
    ctx.show('games');
    map.clear();
    map.showRegion('welt');
  }

  function dailyBox() {
    const day = today();
    const mine = dayOf(me(), day);
    const run = state.dailyRun?.day === day && state.dailyRun.player === me() ? state.dailyRun : null;
    const label = mine ? 'Ergebnis ansehen' : run ? 'Weiterspielen' : 'Jetzt spielen';
    return `<div class="daily-game">
      <div class="dg-head"><span class="swatch">${SW.tagesraetsel}</span>
        <span><span class="name">Tagesrätsel</span><span class="dg-sub">Fünf Orte, für euch beide dieselben. Ein Versuch pro Tag.</span></span></div>
      ${state.player ? `<div class="dg-scores">${PLAYERS.map(p => { const r = dayOf(p.id, day); return `<span class="p-${p.id}">${esc(p.name)} <b>${r ? fmt(r.score) : 'offen'}</b></span>`; }).join('')}</div>` : ''}
      <button class="btn ${mine ? '' : 'primary'} wide" type="button" data-gact="daily">${label}</button>
    </div>`;
  }

  function renderHub() {
    $('#view-games').innerHTML = `
      <button class="back" type="button" data-act="home">‹ Zurück</button>
      <h2 class="h2">Minispiele</h2>
      <p class="lead">Kurz und schnell. Eure Rekorde stehen nebeneinander – auch im Duell.</p>
      ${dailyBox()}
      <ul class="legend-list game-list">
        ${GAMES.map(g => `<li><button class="legend-row" type="button" data-game="${g.id}">
          <span class="swatch">${SW[g.id]}</span>
          <span><span class="name">${g.name}</span><span class="desc">${g.desc}</span>${recordsHtml(keyOf(g.id), g.unit, { compact: true })}</span>
        </button></li>`).join('')}
      </ul>`;
  }

  /* ---------- Spielvorstellung ---------- */

  function openIntro(id) {
    stop();
    intro = { ...intro, id };
    screen = 'intro';
    renderIntro();
    ctx.show('games');
    map.clear();
    map.showRegion(id === 'blitz' && intro.region !== 'welt' ? intro.region : 'welt');
  }

  function renderIntro() {
    const g = GAMES.find(x => x.id === intro.id);
    const regions = [{ id: 'welt', label: 'Welt' }, ...CONTINENTS];
    $('#view-games').innerHTML = `
      <button class="back" type="button" data-gact="hub">‹ Minispiele</button>
      <h2 class="h2">${g.name}</h2>
      <p class="lead">${g.desc}</p>
      <ul class="how">${g.how.map(t => `<li>${t}</li>`).join('')}</ul>
      ${g.id === 'blitz' ? `<div class="field"><p class="field-label">Wo?</p>
        <div class="options">${regions.map(r => `<button type="button" class="opt" data-gopt="${r.id}" aria-pressed="${r.id === intro.region}">${r.label}</button>`).join('')}</div></div>` : ''}
      <p class="field-label" style="margin-top:20px">Rekorde${g.id === 'blitz' ? ` – ${esc(regionLabel(intro.region))}` : ''}</p>
      ${recordsHtml(keyOf(g.id, intro.region), g.unit) || '<p class="hint" style="margin:0">Noch hat niemand gespielt.</p>'}
      <div class="actions"><button class="btn primary wide" type="button" data-gact="start">Los geht's</button></div>`;
  }

  function start() {
    const id = intro.id;
    if (id === 'blitz') startBlitz(intro.region);
    else if (id === 'pin') startPin({ daily: false });
    else if (id === 'nachbarn') startNachbarn();
    else if (id === 'vergleich') startVergleich();
    else if (id === 'umrisse') startUmrisse();
  }

  function begin(g) {
    stop();
    game = { ...g, seq: ++seq };
    ctx.show('game');
    map.clear();
    veil(false);
    return game;
  }

  const alive = g => game && game.seq === g.seq;

  /** Laufendes Spiel ohne Ergebnis beenden (Zeitgeber, Karte, Abdeckung). */
  function stop() {
    if (game) { clearInterval(game.clock); clearTimeout(game.timer); }
    game = null;
    seq++;
    veil(false);
    pickable(false);
  }

  /* ---------- Ergebnis ---------- */

  function showResult({ g, title, score, big, unit, details = '', key }) {
    const res = ctx.saveRecord(key, score);
    if (res.isRecord) sfx.record();
    const other = state.player && PLAYERS.find(p => p.id !== state.player);
    const theirs = other ? bestOf(other.id, key) : null;
    const def = GAMES.find(x => x.id === g.id);
    let line = '';
    if (res.isRecord) line = `<p class="record-badge">Neuer Rekord!${res.prev != null ? ` Vorher: ${fmt(res.prev)}` : ''}</p>`;
    else if (res.prev != null) line = `<p class="lead">Dein Rekord: ${fmt(res.prev)} ${esc(def.unit(res.prev))}</p>`;
    if (other && theirs != null) {
      const mine = Math.max(score, res.prev ?? 0);
      line += `<p class="lead">${esc(genName(other.name))} Rekord: <b class="p-${other.id}-ink">${fmt(theirs)}</b>${mine > theirs ? ' – du liegst vorn.' : mine === theirs ? ' – Gleichstand.' : ` – noch ${fmt(theirs - mine)} bis zur Führung.`}</p>`;
    }
    screen = 'result';
    game = null;
    seq++;
    pickable(false);
    veil(false);
    $('#view-games').innerHTML = `
      <button class="back" type="button" data-gact="hub">‹ Minispiele</button>
      <h2 class="h2">${title}</h2>
      <div class="big-score">${big}<small> ${esc(unit)}</small></div>
      ${line}
      ${details}
      <div class="actions">
        <button class="btn primary" type="button" data-gact="again">Nochmal</button>
        <button class="btn" type="button" data-gact="hub">Andere Spiele</button>
      </div>`;
    ctx.show('games');
  }

  /* ---------- Zeitgeber ---------- */

  function clock(g, ms, onTick, onEnd) {
    g.left = ms;
    g.total = ms;
    let last = performance.now();
    clearInterval(g.clock);
    g.clock = setInterval(() => {
      if (!alive(g)) { clearInterval(g.clock); return; }
      const now = performance.now();
      if (document.visibilityState === 'visible') g.left -= now - last;   // im Hintergrund läuft die Zeit nicht weiter
      last = now;
      if (g.left <= 0) { g.left = 0; clearInterval(g.clock); onTick(); onEnd(); return; }
      onTick();
    }, 100);
  }

  function countdown(g, then) {
    let n = 3;
    const step = () => {
      if (!alive(g)) return;
      if (n === 0) { then(); return; }
      card(`<div class="countdown" aria-live="assertive">${n}</div>`);
      sfx.tick(n === 1);
      n--;
      g.timer = setTimeout(step, 650);
    };
    step();
  }

  /* ================= Blitzrunde ================= */

  function startBlitz(region) {
    const ids = COUNTRIES.filter(c => region === 'welt' || c.regions.includes(region)).map(c => c.iso);
    const g = begin({ id: 'blitz', key: keyOf('blitz', region), region, pool: shuffle(ids), i: 0, score: 0, streak: 0, hits: [], missed: [], busy: false, over: false });
    if (region !== 'welt') map.dimOutside(ids);
    map.showRegion(region);
    blitzHud(g);
    countdown(g, () => {
      clock(g, 60000, () => blitzHud(g), () => { g.over = true; if (!g.busy) finishBlitz(g); });
      blitzNext(g);
    });
  }

  function blitzHud(g) {
    const left = g.left ?? 60000;
    const sec = Math.ceil(left / 1000);
    if (g.left != null && left <= 5000 && sec !== g.lastTick && sec > 0) { g.lastTick = sec; sfx.tick(); }
    hud(`<i class="time${sec <= 10 ? ' low' : ''}" style="width:${(left / 60000 * 100).toFixed(1)}%"></i>`,
      `<span>${g.score} ${g.score === 1 ? 'Land' : 'Länder'}</span><span class="clock">${clockText(left)}</span>`);
  }

  function blitzNext(g) {
    if (!alive(g)) return;
    if (g.i >= g.pool.length) {
      const last = g.pool[g.pool.length - 1];
      g.pool = shuffle(g.pool);
      if (g.pool.length > 1 && g.pool[0] === last) g.pool.push(g.pool.shift());
      g.i = 0;
    }
    g.target = g.pool[g.i++];
    const c = C.get(g.target);
    card(`<div class="g-row">
      <h2 class="q-prompt">Wo ${pl(c, 'liegt', 'liegen')} ${emph(nom(c))}?</h2>
      <button class="chip-btn" type="button" data-gact="blitz-skip">Weiter</button>
    </div>`);
    map.hitOptions = { water: false, prefer: g.target };
    map.onClick = hit => blitzTap(g, hit);
    $('#map').classList.add('pickable');
  }

  function blitzTap(g, hit) {
    if (!alive(g) || g.busy || g.over || !hit || hit.type !== 'country' || hit.code === 'AQ') return;
    if (hit.code === g.target) {
      g.score++;
      g.streak++;
      g.hits.push(g.target);
      map.setCountryClass(g.target, 'is-right');
      sfx.blip(g.streak);
      blitzHud(g);
      blitzNext(g);
    } else {
      blitzReveal(g, hit);
    }
  }

  /** Falsch oder übersprungen: kurz die Lösung zeigen. */
  function blitzReveal(g, hit = null) {
    if (!alive(g) || g.busy || g.over) return;
    g.busy = true;
    g.streak = 0;
    const target = g.target;
    g.missed.push(target);
    const wasHit = g.hits.includes(target);
    if (wasHit) map.setCountryClass(target, 'is-right', false);
    map.setCountryClass(target, 'is-target');
    map.labelCountry(target, C.get(target).name, '');
    map.ringsForCountry(target);
    if (hit) {
      sfx.buzz();
      map.setCountryClass(hit.code, 'is-wrong');
      map.labelCountry(hit.code, nameOf(hit.code, hit.props), 'wrong');
    }
    const wrong = hit?.code;
    g.timer = setTimeout(() => {
      if (!alive(g)) return;
      map.setCountryClass(target, 'is-target', false);
      if (wasHit) map.setCountryClass(target, 'is-right');
      if (wrong) map.setCountryClass(wrong, 'is-wrong', false);
      map.clearOverlay();
      g.busy = false;
      if (g.over) finishBlitz(g); else blitzNext(g);
    }, hit ? 1400 : 1000);
  }

  function finishBlitz(g) {
    if (!alive(g)) return;
    clearInterval(g.clock);
    pickable(false);
    map.clearOverlay();
    const missed = [...new Set(g.missed)].filter(id => !g.hits.includes(id));
    for (const id of missed) map.setCountryClass(id, 'is-wrong');
    const names = missed.map(id => C.get(id).name);
    const details = names.length ? `<p class="field-label" style="margin-top:14px">Diesmal nicht gefunden</p>
      <p class="name-list">${names.slice(0, 14).map(esc).join(', ')}${names.length > 14 ? ` und ${names.length - 14} weitere` : ''}</p>
      <p class="hint" style="margin-top:6px">Auf der Karte rot, deine Treffer grün.</p>` : '<p class="lead">Kein einziger Fehler!</p>';
    showResult({ g, key: g.key, score: g.score, title: `Zeit um – ${esc(regionLabel(g.region))}`, big: g.score, unit: g.score === 1 ? 'Land' : 'Länder', details });
  }

  /* ================= Städte-Pin und Tagesrätsel ================= */

  let places = null;
  function placePool() {
    if (places) return places;
    places = [];
    for (const c of COUNTRIES) if (c.capital.lat != null) places.push({ name: c.capital.name, lat: c.capital.lat, lon: c.capital.lon, iso: c.iso, capital: true });
    for (const s of CITIES) places.push({ name: s.name, lat: s.lat, lon: s.lon, iso: s.iso, capital: false });
    return places;
  }

  // Zufall mit Startwert: Am selben Tag bekommen beide dieselben Orte
  function seeded(text) {
    let a = 2166136261;
    for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickPlaces(n, rnd = Math.random) {
    const pool = placePool().slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = [], seen = new Set();
    for (const p of pool) {
      if (seen.has(p.iso)) continue;
      seen.add(p.iso);
      out.push(p);
      if (out.length >= n) break;
    }
    return out;
  }

  function km([lon1, lat1], [lon2, lat2]) {
    const r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  const pinPoints = d => (d == null ? 0 : d <= 25 ? 1000 : Math.round(1000 * Math.exp(-(d - 25) / 1000)));

  function openDaily() {
    stop();
    const day = today();
    const mine = dayOf(me(), day);
    if (mine) { showDailyResult(day); return; }
    startPin({ daily: true });
  }

  function startPin({ daily }) {
    const day = today();
    let g;
    if (daily) {
      const run = state.dailyRun?.day === day && state.dailyRun.player === me() ? state.dailyRun : null;
      g = begin({ id: 'daily', key: 'daily', day, places: pickPlaces(5, seeded('weltquiz-' + day)), i: run?.i || 0, total: run?.total || 0, results: run?.results || [] });
    } else {
      g = begin({ id: 'pin', key: 'pin', places: pickPlaces(5), i: 0, total: 0, results: [] });
    }
    pinQuestion(g);
  }

  function pinHud(g) {
    const segs = g.places.map((_, i) => {
      const r = g.results[i];
      return `<i class="${r ? (r.pts >= 700 ? 'r' : r.pts >= 250 ? 'm' : 'w') : i === g.i ? 'now' : ''}"></i>`;
    }).join('');
    hud(segs, `<span class="long">Ort ${Math.min(g.i + 1, 5)} von 5</span><span>${fmt(g.total)} Punkte</span>`);
  }

  function pinQuestion(g) {
    if (!alive(g)) return;
    if (g.i >= g.places.length) { finishPin(g); return; }
    const p = g.places[g.i];
    g.guess = null;
    map.clear();
    map.showRegion('welt');
    pinHud(g);
    card(`<div class="q-head"><h2 class="q-prompt">Wo liegt <em>${esc(p.name)}</em>?</h2>${g.id === 'daily' ? '<span class="tag">Tagesrätsel</span>' : ''}</div>
      <p class="hint" id="pin-state">Tippe auf die Karte, wo du den Ort vermutest. Zum genauen Zielen heranzoomen.</p>
      <div class="below">
        <button class="chip-btn" type="button" data-gact="pin-skip">Keine Ahnung</button>
        <button class="btn primary ok" type="button" data-gact="pin-ok" disabled>OK</button>
      </div>`);
    map.hitOptions = null;
    map.onClick = (hit, e, xy) => {
      if (!alive(g) || !xy) return;
      const ll = map.lonLatAt(xy);
      if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
      g.guess = ll;
      map.guessPin(ll[0], ll[1]);
      sfx.select();
      $('#pin-state').textContent = 'Gesetzt. Passt? Dann OK – oder tippe woanders hin.';
      $('[data-gact="pin-ok"]').disabled = false;
    };
    $('#map').classList.add('pickable');
  }

  function pinAnswer(g, skipped = false) {
    if (!alive(g) || g.answered === g.i) return;
    g.answered = g.i;
    const p = g.places[g.i];
    const target = [p.lon, p.lat];
    const d = !skipped && g.guess ? km(g.guess, target) : null;
    const pts = pinPoints(d);
    g.total += pts;
    g.results.push({ name: p.name, iso: p.iso, km: d == null ? null : Math.round(d), pts });
    if (g.id === 'daily') { state.dailyRun = { day: g.day, player: me(), i: g.i + 1, total: g.total, results: g.results }; ctx.save(); }
    pickable(false);
    pinHud(g);
    if (pts >= 700) sfx.correct(); else if (pts >= 250) sfx.hint(); else sfx.wrong();

    // Karte: Ziel als Stern, dein Tipp als Punkt, dazwischen die Strecke
    map.pin(p.lon, p.lat, p.name, 'right');
    const t = map.projection(target);
    if (d != null) {
      map.line(g.guess, target);
      const a = map.projection(g.guess);
      let bx = t[0];
      while (bx - a[0] > W / 2) bx -= W;
      while (a[0] - bx > W / 2) bx += W;
      if (d >= 60) map.labelAt((a[0] + bx) / 2, (a[1] + t[1]) / 2, `${fmt(d)} km`, 'dist');
      const box = [[Math.min(a[0], bx), Math.min(a[1], t[1])], [Math.max(a[0], bx), Math.max(a[1], t[1])]];
      requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.5, minSize: 40 }));
    } else {
      requestAnimationFrame(() => alive(g) && map.flyToPoint(p.lon, p.lat, { size: 160 }));
    }

    const c = C.get(p.iso);
    const where = p.capital ? `${esc(p.name)} ist die Hauptstadt ${emph(gen(c), 'b')}.` : `${esc(p.name)} liegt ${emph(inDat(c), 'b')}.`;
    const verdict = d == null ? 'Kein Tipp – 0 Punkte.' : d <= 25 ? 'Volltreffer!' : `${fmt(d)} km daneben`;
    const last = g.i + 1 >= g.places.length;
    card(`<div class="result ${pts >= 700 ? 'right' : pts >= 250 ? 'mid' : 'wrong'}">${verdict}<span class="pts">+${fmt(pts)}</span></div>
      <p class="result-detail">${where}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächster Ort'}</button></div>`);
    $('#view-game [data-gact="next"]').focus({ preventScroll: true });
  }

  function pinNext(g) {
    if (!alive(g)) return;
    g.i++;
    pinQuestion(g);
  }

  function pinTable(results) {
    return `<ul class="res-list">${results.map(r => `<li><span>${esc(r.name)}</span><span class="res-km">${r.km == null ? 'kein Tipp' : r.km <= 25 ? 'Volltreffer' : fmt(r.km) + ' km'}</span><b>${fmt(r.pts)}</b></li>`).join('')}</ul>`;
  }

  function finishPin(g) {
    if (!alive(g)) return;
    pickable(false);
    map.clearOverlay();
    // alle Orte auf einer Karte
    for (const p of g.places) map.pin(p.lon, p.lat, p.name, 'right');
    map.showRegion('welt');
    if (g.id === 'daily') {
      ctx.saveDaily(g.day, g.total);
      state.dailyRun = null;
      ctx.save();
      sfx.fanfare(g.total / 5000);
      game = null;
      seq++;
      showDailyResult(g.day, g.results);
      return;
    }
    showResult({ g, key: 'pin', score: g.total, title: 'Städte-Pin', big: fmt(g.total), unit: 'von 5.000 Punkten', details: pinTable(g.results) });
  }

  function showDailyResult(day, results = null) {
    screen = 'result';
    pickable(false);
    veil(false);
    const scores = PLAYERS.map(p => ({ ...p, r: dayOf(p.id, day) }));
    const mine = dayOf(me(), day);
    const other = scores.find(s => s.id !== me());
    let verdict = '';
    if (state.player && mine && other) {
      if (!other.r) verdict = `${esc(other.name)} hat heute noch nicht gespielt.`;
      else if (other.r.score === mine.score) verdict = 'Gleichstand!';
      else verdict = mine.score > other.r.score ? 'Du gewinnst heute!' : `${esc(other.name)} gewinnt heute.`;
    }
    // Siege über alle Tage
    const wins = Object.fromEntries(PLAYERS.map(p => [p.id, 0]));
    const days = new Set(PLAYERS.flatMap(p => Object.keys(ctx.dailyOf(p.id) || {})));
    for (const d of days) {
      const [a, b] = PLAYERS.map(p => ctx.dailyOf(p.id)?.[d]?.score);
      if (a == null || b == null || a === b) continue;
      wins[a > b ? PLAYERS[0].id : PLAYERS[1].id]++;
    }
    const places = pickPlaces(5, seeded('weltquiz-' + day));
    $('#view-games').innerHTML = `
      <button class="back" type="button" data-gact="hub">‹ Minispiele</button>
      <h2 class="h2">Tagesrätsel</h2>
      <p class="lead">${new Date(day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div class="rec-board">${scores.map(s => `<div class="rb p-${s.id}${s.r && other?.r && mine && s.r.score === Math.max(mine.score, other.r.score) ? ' lead' : ''}">
        <span class="rb-name">${esc(s.name)}${s.id === me() ? ' <small>(du)</small>' : ''}</span>
        <span class="rb-val">${s.r ? fmt(s.r.score) : '–'}</span>
        <span class="rb-unit">${s.r ? 'Punkte' : 'noch offen'}</span></div>`).join('')}</div>
      ${verdict ? `<p class="duel-verdict">${verdict}</p>` : ''}
      ${results ? pinTable(results) : `<p class="field-label" style="margin-top:14px">Die Orte heute</p><p class="name-list">${places.map(p => esc(p.name)).join(', ')}</p>`}
      ${state.player && (wins[PLAYERS[0].id] || wins[PLAYERS[1].id]) ? `<p class="hint" style="margin-top:12px">Gewonnene Tage: ${PLAYERS.map(p => `${esc(p.name)} ${wins[p.id]}`).join(' · ')}</p>` : ''}
      <p class="hint" style="margin-top:12px">Morgen gibt es fünf neue Orte.</p>
      <div class="actions"><button class="btn primary" type="button" data-gact="hub">Zu den Minispielen</button></div>`;
    ctx.show('games');
    if (!results) {
      map.clear();
      for (const p of places) map.pin(p.lon, p.lat, p.name, 'right');
      map.showRegion('welt');
    }
  }

  /* ================= Nachbarn ================= */

  function neighborsOf(iso) {
    const graph = map.neighborGraph();
    const set = new Set([...(graph.get(iso) || [])].filter(d => C.has(d) || NEIGHBOR_AREAS.has(d)));
    for (const [a, b] of EXTRA_BORDERS) { if (a === iso) set.add(b); if (b === iso) set.add(a); }
    return set;
  }

  function startNachbarn() {
    const eligible = COUNTRIES.filter(c => neighborsOf(c.iso).size >= 2).map(c => c.iso);
    const g = begin({ id: 'nachbarn', key: 'nachbarn', targets: shuffle(eligible).slice(0, 5), i: 0, points: 0, rows: [] });
    nachbarnQuestion(g);
  }

  function nachbarnHud(g) {
    hud(g.targets.map((_, i) => {
      const r = g.rows[i];
      return `<i class="${r ? (r.perfect ? 'r' : r.found === r.total ? 'm' : 'w') : i === g.i ? 'now' : ''}"></i>`;
    }).join(''), `<span class="long">Land ${Math.min(g.i + 1, 5)} von 5</span><span>${g.points} Punkte</span>`);
  }

  function nachbarnQuestion(g) {
    if (!alive(g)) return;
    if (g.i >= g.targets.length) { finishNachbarn(g); return; }
    const iso = g.targets[g.i];
    const c = C.get(iso);
    g.cur = { iso, nb: neighborsOf(iso), found: new Set(), wrong: new Set(), mistakes: 0, done: false };
    map.clear();
    map.setCountryClass(iso, 'is-target');
    map.labelCountry(iso, c.name, '');
    let box = map.countryBox(iso);
    for (const n of g.cur.nb) box = unionBox(box, map.countryBox(n));
    requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.2, minSize: 30 }));
    nachbarnHud(g);
    card(`<div class="q-head"><h2 class="q-prompt">Alle Nachbarländer ${emph(gen(c))}</h2></div>
      <p class="hint" id="nb-state"></p>
      <div class="below"><button class="chip-btn" type="button" data-gact="nb-giveup">Aufgeben</button><span class="miss-dots" id="nb-dots"></span></div>`);
    nachbarnState(g);
    map.hitOptions = { water: false };
    map.onClick = hit => nachbarnTap(g, hit);
    $('#map').classList.add('pickable');
  }

  function nachbarnState(g, note = '') {
    const cur = g.cur;
    const n = cur.nb.size;
    $('#nb-state').textContent = note || `${cur.found.size} von ${n} gefunden. Tippe alle Länder an, die direkt angrenzen.`;
    $('#nb-dots').innerHTML = [0, 1, 2].map(i => `<i class="${i < cur.mistakes ? 'on' : ''}" title="Fehler"></i>`).join('');
  }

  function nachbarnTap(g, hit) {
    const cur = g.cur;
    if (!alive(g) || !cur || cur.done || !hit || hit.type !== 'country') return;
    const code = hit.code;
    if (code === cur.iso || code === 'AQ' || cur.found.has(code) || cur.wrong.has(code)) return;
    if (cur.nb.has(code)) {
      cur.found.add(code);
      map.setCountryClass(code, 'is-right');
      map.labelCountry(code, nameFor(code), 'right');
      sfx.blip(cur.found.size);
      if (cur.found.size === cur.nb.size) nachbarnEnd(g);
      else nachbarnState(g);
    } else if (!C.has(code)) {
      nachbarnState(g, `${nameOf(code, hit.props)} ist kein eigener Staat und zählt hier nicht.`);
    } else {
      cur.wrong.add(code);
      cur.mistakes++;
      map.setCountryClass(code, 'is-wrong');
      map.labelCountry(code, nameFor(code), 'wrong');
      sfx.buzz();
      if (cur.mistakes >= 3) nachbarnEnd(g);
      else { const t = C.get(code); nachbarnState(g, `${capFirst(nom(t))} ${pl(t, 'grenzt', 'grenzen')} nicht an ${acc(C.get(cur.iso))}.`); }
    }
  }

  function nachbarnEnd(g) {
    const cur = g.cur;
    if (!alive(g) || cur.done) return;
    cur.done = true;
    pickable(false);
    const missing = [...cur.nb].filter(n => !cur.found.has(n));
    for (const m of missing) { map.setCountryClass(m, 'is-pick'); map.labelCountry(m, nameFor(m), ''); }
    const perfect = !missing.length && !cur.mistakes;
    const pts = cur.found.size + (perfect ? 3 : 0);
    g.points += pts;
    g.rows.push({ iso: cur.iso, found: cur.found.size, total: cur.nb.size, mistakes: cur.mistakes, perfect, pts });
    nachbarnHud(g);
    if (perfect) sfx.correct(); else if (!missing.length) sfx.select(); else sfx.wrong();
    const c = C.get(cur.iso);
    const text = perfect ? `Perfekt: alle ${cur.nb.size} Nachbarn ohne Fehler. +3 Bonus!`
      : !missing.length ? `Alle ${cur.nb.size} gefunden – mit ${cur.mistakes} ${cur.mistakes === 1 ? 'Fehler' : 'Fehlern'}.`
        : `${cur.found.size} von ${cur.nb.size} gefunden. Gefehlt ${missing.length === 1 ? 'hat' : 'haben'}: ${missing.map(nameFor).join(', ')} (rosa markiert).`;
    const last = g.i + 1 >= g.targets.length;
    card(`<div class="result ${perfect ? 'right' : !missing.length ? 'mid' : 'wrong'}">${esc(c.name)}<span class="pts">+${pts}</span></div>
      <p class="result-detail">${esc(text)}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächstes Land'}</button></div>`);
    let box = map.countryBox(cur.iso);
    for (const n of cur.nb) box = unionBox(box, map.countryBox(n));
    requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.2, minSize: 30 }));
  }

  function finishNachbarn(g) {
    const details = `<ul class="res-list">${g.rows.map(r => `<li><span>${esc(C.get(r.iso).name)}</span><span class="res-km">${r.found} von ${r.total}${r.perfect ? ' · perfekt' : ''}</span><b>${r.pts}</b></li>`).join('')}</ul>`;
    map.clear();
    for (const r of g.rows) map.setCountryClass(r.iso, r.perfect ? 'is-right' : 'is-pick');
    map.showRegion('welt');
    showResult({ g, key: 'nachbarn', score: g.points, title: 'Nachbarn', big: g.points, unit: g.points === 1 ? 'Punkt' : 'Punkte', details });
  }

  /* ================= Entweder-oder ================= */

  const KINDS = {
    area: { q: 'Welches Land ist größer?', val: c => NUMBERS[c.iso]?.area },
    pop: { q: 'Wo leben mehr Menschen?', val: c => NUMBERS[c.iso]?.pop },
    north: { q: 'Welche Hauptstadt liegt weiter nördlich?', val: c => c.capital.lat },
  };

  function startVergleich() {
    const g = begin({ id: 'vergleich', key: 'vergleich', streak: 0, recent: [] });
    map.showRegion('welt');
    vergleichQuestion(g);
  }

  function vergleichPair(g) {
    const usable = COUNTRIES.filter(c => NUMBERS[c.iso] && !g.recent.includes(c.iso));
    for (let tries = 0; tries < 400; tries++) {
      const r = Math.random();
      const kind = r < 0.38 ? 'area' : r < 0.72 ? 'pop' : 'north';
      const val = KINDS[kind].val;
      const a = pick(usable);
      if (val(a) == null) continue;
      const near = Math.random() < 0.55;
      const cands = usable.filter(b => b !== a && val(b) != null && (!near || b.regions.some(x => a.regions.includes(x))));
      if (!cands.length) continue;
      const b = pick(cands);
      const va = val(a), vb = val(b);
      if (kind === 'north') {
        const d = Math.abs(va - vb);
        if (d < 1.5 || d > 30) continue;
      } else {
        const ratio = Math.max(va, vb) / Math.min(va, vb);
        if (ratio < 1.25 || ratio > (tries < 200 ? 6 : 30)) continue;
      }
      return { kind, a, b };
    }
    const [a, b] = shuffle(usable);
    return { kind: 'area', a, b };
  }

  const popText = n => (n >= 1e9 ? `${dec(n / 1e9, 2)} Mrd.` : n >= 1e6 ? `${dec(n / 1e6, n >= 1e7 ? 0 : 1)} Mio.` : fmt(n));
  const areaText = n => (n >= 100 ? `${fmt(n >= 1e5 ? Math.round(n / 1000) * 1000 : n)} km²` : `${dec(n, n < 10 ? 2 : 0)} km²`);
  const latText = lat => `${dec(Math.abs(lat), 1)}° ${lat >= 0 ? 'N' : 'S'}`;
  function ratioText(r) {
    if (r < 1.95) return dec(r, 1);
    if (r < 10) return dec(Math.round(r * 2) / 2, Number.isInteger(Math.round(r * 2) / 2) ? 0 : 1);
    return fmt(r);
  }

  function vergleichQuestion(g) {
    if (!alive(g)) return;
    const { kind, a, b } = vergleichPair(g);
    g.q = { kind, a, b, answered: false };
    g.recent = [...g.recent, a.iso, b.iso].slice(-6);
    map.clear();
    map.showRegion('welt');
    vergleichHud(g);
    const opt = (c, i) => `<button class="duo-opt" type="button" data-gact="vs" data-side="${i}">
      <img src="${flagUrl(c.iso)}" alt="">
      <span class="duo-name">${esc(kind === 'north' ? c.capital.name : c.name)}</span>
      <span class="duo-sub">${kind === 'north' ? esc(c.name) : '&nbsp;'}</span>
      <span class="duo-val" hidden></span></button>`;
    card(`<div class="q-head"><h2 class="q-prompt">${KINDS[kind].q}</h2></div>
      <div class="duo">${opt(a, 0)}<span class="duo-or">oder</span>${opt(b, 1)}</div>
      <div id="vs-after"></div>`);
  }

  function vergleichHud(g) {
    hud(`<i class="r" style="flex:${Math.max(g.streak, 0.001)}"></i><i style="flex:${Math.max(1, 10 - g.streak)}"></i>`, `<span>Serie: ${g.streak}</span>`);
  }

  function vergleichAnswer(g, side) {
    const q = g.q;
    if (!alive(g) || !q || q.answered) return;
    q.answered = true;
    const val = KINDS[q.kind].val;
    const va = val(q.a), vb = val(q.b);
    const win = va > vb ? 0 : 1;
    const ok = side === win;
    const winner = win === 0 ? q.a : q.b, loser = win === 0 ? q.b : q.a;
    if (ok) { g.streak++; sfx.correct(); } else sfx.wrong();
    vergleichHud(g);
    $('#view-game').querySelectorAll('.duo-opt').forEach((btn, i) => {
      btn.disabled = true;
      btn.classList.add(i === win ? 'is-right' : i === side ? 'is-wrong' : 'is-other');
      const c = i === 0 ? q.a : q.b;
      const v = btn.querySelector('.duo-val');
      v.hidden = false;
      v.textContent = q.kind === 'area' ? areaText(val(c)) : q.kind === 'pop' ? `${popText(val(c))} Einw.` : latText(val(c));
    });
    let text = '', note = '';
    if (q.kind === 'area') {
      text = `${capFirst(nom(winner))} ${pl(winner, 'ist', 'sind')} etwa ${ratioText(val(winner) / val(loser))}-mal so groß wie ${nom(loser)}.`;
      // Mercator: Länder nahe den Polen wirken auf der Karte viel größer
      if (map.shownArea(loser.iso) > map.shownArea(winner.iso) * 1.15) note = `Auf der Karte ${pl(loser, 'wirkt', 'wirken')} ${nom(loser)} größer – die Weltkarte (Mercator) streckt Länder nahe den Polen in die Breite.`;
    } else if (q.kind === 'pop') {
      text = `${capFirst(inDat(winner))} leben rund ${popText(val(winner))} Menschen, ${inDat(loser)} rund ${popText(val(loser))}.`;
    } else {
      text = `${winner.capital.name} liegt auf ${latText(val(winner))}, ${loser.capital.name} auf ${latText(val(loser))}.`;
    }
    text = text.replace(/\.\.$/, '.');   // „… rund 53 Mio.“ nicht doppelt punkten
    $('#vs-after').innerHTML = `<p class="result-detail" style="margin-top:12px">${esc(text)}</p>${note ? `<p class="note">${esc(note)}</p>` : ''}
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${ok ? 'Weiter' : 'Zum Ergebnis'}</button></div>`;
    $('#view-game [data-gact="next"]').focus({ preventScroll: true });
    g.over = !ok;

    // Karte: beide Länder, das richtige grün
    map.setCountryClass(winner.iso, 'is-right');
    map.setCountryClass(loser.iso, 'is-pick');
    if (q.kind === 'north') {
      map.pin(winner.capital.lon, winner.capital.lat, winner.capital.name, 'right');
      map.pin(loser.capital.lon, loser.capital.lat, loser.capital.name, 'capital');
    } else {
      map.labelCountry(winner.iso, winner.name, 'right');
      map.labelCountry(loser.iso, loser.name, '');
    }
    const box = unionBox(map.countryBox(winner.iso), map.countryBox(loser.iso));
    requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.25, minSize: 40 }));
  }

  function vergleichNext(g) {
    if (!alive(g)) return;
    if (g.over) {
      const s = g.streak;
      showResult({ g, key: 'vergleich', score: s, title: 'Entweder-oder', big: s, unit: 'richtig in Folge',
        details: s >= 10 ? '<p class="lead">Starke Serie!</p>' : '' });
      return;
    }
    vergleichQuestion(g);
  }

  /* ================= Umrisse ================= */

  let shapes = null;
  function shapePool() {
    if (shapes) return shapes;
    shapes = new Map();
    for (const c of COUNTRIES) {
      const s = map.silhouette(c.iso);
      // genug Details und kein Streuteppich aus winzigen Inseln
      if (s && s.points >= 30 && s.fill >= 0.06) shapes.set(c.iso, s);
    }
    return shapes;
  }

  function shapeOptions(iso) {
    const c = C.get(iso);
    const pool = [...shapePool().keys()].filter(x => x !== iso);
    const area = x => NUMBERS[x]?.area || 1;
    const sameCont = x => C.get(x).regions.some(r => c.regions.includes(r));
    const similar = pool.filter(x => sameCont(x) && area(x) / area(iso) < 5 && area(iso) / area(x) < 5);
    const out = [];
    for (const list of [shuffle(similar), shuffle(pool.filter(sameCont)), shuffle(pool)]) {
      for (const x of list) { if (out.length >= 3) break; if (!out.includes(x)) out.push(x); }
    }
    return shuffle([iso, ...out]);
  }

  function startUmrisse() {
    const pool = [...shapePool().keys()];
    const g = begin({ id: 'umrisse', key: keyOf('umrisse'), targets: shuffle(pool).slice(0, 10), i: 0, rows: [] });
    map.showRegion('welt');
    umrisseQuestion(g);
  }

  function umrisseHud(g) {
    const right = g.rows.filter(r => r.ok).length;
    hud(g.targets.map((_, i) => `<i class="${g.rows[i] ? (g.rows[i].ok ? 'r' : 'w') : i === g.i ? 'now' : ''}"></i>`).join(''),
      `<span class="long">Form ${Math.min(g.i + 1, 10)} von 10</span><span>${right} erkannt</span>`);
  }

  function umrisseQuestion(g) {
    if (!alive(g)) return;
    if (g.i >= g.targets.length) { finishUmrisse(g); return; }
    const iso = g.targets[g.i];
    const s = shapePool().get(iso);
    g.q = { iso, opts: shapeOptions(iso), answered: false };
    map.clear();
    veil(true);
    map.showRegion('welt', { duration: 0 });
    card(`<div class="q-head"><h2 class="q-prompt">Welches Land hat diese Form?</h2></div>
      <div class="shape-wrap"><svg class="shape" viewBox="0 0 ${s.w} ${s.h}" role="img" aria-label="Umriss eines Landes"><path d="${s.d}" fill-rule="evenodd"/>${s.lakes ? `<path class="lake" d="${s.lakes}" fill-rule="evenodd"/>` : ''}</svg></div>
      <div class="opts4">${g.q.opts.map(x => `<button class="opt" type="button" data-gact="shape" data-iso="${x}">${esc(C.get(x).name)}</button>`).join('')}</div>
      <div class="below" id="shape-skip"><button class="chip-btn" type="button" data-gact="shape-skip">Weiß ich nicht</button></div>
      <div id="shape-after"></div>`);
    umrisseHud(g);
  }

  function umrisseAnswer(g, chosen) {
    const q = g.q;
    if (!alive(g) || !q || q.answered) return;
    q.answered = true;
    const ok = chosen === q.iso;
    g.rows.push({ iso: q.iso, ok });
    $('#shape-skip')?.remove();
    if (ok) sfx.correct(); else sfx.wrong();
    umrisseHud(g);
    $('#view-game').querySelectorAll('[data-gact="shape"]').forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.iso === q.iso) btn.classList.add('is-right');
      else if (btn.dataset.iso === chosen) btn.classList.add('is-wrong');
    });
    const c = C.get(q.iso);
    const last = g.i + 1 >= g.targets.length;
    $('#shape-after').innerHTML = `<div class="result ${ok ? 'right' : 'wrong'}" style="margin-top:10px">${ok ? 'Richtig!' : chosen ? 'Leider nein' : 'Aufgelöst'}</div>
      <p class="result-detail">${ok ? `Das ${pl(c, 'ist', 'sind')} ${emph(nom(c), 'b')}.` : `Das ${pl(c, 'war', 'waren')} ${emph(nom(c), 'b')}.`}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächste Form'}</button></div>`;
    $('#view-game [data-gact="next"]').focus({ preventScroll: true });
    // Karte aufdecken: Wo liegt das Land?
    veil(false);
    map.setCountryClass(q.iso, ok ? 'is-right' : 'is-target');
    map.labelCountry(q.iso, c.name, ok ? 'right' : '');
    requestAnimationFrame(() => alive(g) && map.flyToCountry(q.iso));
  }

  function finishUmrisse(g) {
    veil(false);
    map.clear();
    for (const r of g.rows) map.setCountryClass(r.iso, r.ok ? 'is-right' : 'is-wrong');
    map.showRegion('welt');
    const right = g.rows.filter(r => r.ok).length;
    const details = `<ul class="res-list">${g.rows.map(r => `<li><span>${esc(C.get(r.iso).name)}</span><span class="res-km">${r.ok ? 'erkannt' : 'nicht erkannt'}</span><b>${r.ok ? '✓' : '–'}</b></li>`).join('')}</ul>`;
    showResult({ g, key: g.key, score: right, title: 'Umrisse', big: right, unit: 'von 10 erkannt', details });
  }

  /* ================= Klicks und Einbindung ================= */

  function handleClick(t) {
    if (t.dataset.game) { openIntro(t.dataset.game); return true; }
    if (t.dataset.gopt) { intro.region = t.dataset.gopt; renderIntro(); map.clear(); map.showRegion(intro.region); return true; }
    const act = t.dataset.gact;
    if (!act) return false;
    const g = game;
    switch (act) {
      case 'hub': openHub(); break;
      case 'daily': openDaily(); break;
      case 'start': start(); break;
      case 'again': if (intro.id) start(); break;
      case 'blitz-skip': if (g?.id === 'blitz') blitzReveal(g); break;
      case 'pin-ok': if (g && (g.id === 'pin' || g.id === 'daily')) pinAnswer(g); break;
      case 'pin-skip': if (g && (g.id === 'pin' || g.id === 'daily')) pinAnswer(g, true); break;
      case 'nb-giveup': if (g?.id === 'nachbarn') nachbarnEnd(g); break;
      case 'vs': if (g?.id === 'vergleich') vergleichAnswer(g, +t.dataset.side); break;
      case 'shape': if (g?.id === 'umrisse') umrisseAnswer(g, t.dataset.iso); break;
      case 'shape-skip': if (g?.id === 'umrisse') umrisseAnswer(g, null); break;
      case 'next':
        if (!g) break;
        if (g.id === 'pin' || g.id === 'daily') pinNext(g);
        else if (g.id === 'nachbarn') { g.i++; nachbarnQuestion(g); }
        else if (g.id === 'vergleich') vergleichNext(g);
        else if (g.id === 'umrisse') { g.i++; umrisseQuestion(g); }
        break;
      default: return false;
    }
    return true;
  }

  /** „Beenden“ oben rechts: Spiel abbrechen. Beim Tagesrätsel zählt dann der bisherige Stand. */
  function quit() {
    const g = game;
    if (!g) { openHub(); return; }
    if (g.id === 'daily') {
      if (!confirm('Tagesrätsel beenden? Dann zählen deine bisherigen Punkte als Ergebnis für heute.')) return;
      g.places = g.places.slice(0, g.results.length);
      finishPin(g);
      return;
    }
    const id = g.id;
    stop();
    openIntro(id);
  }

  function homeRows() {
    const mine = dayOf(me());
    return {
      daily: { name: 'Tagesrätsel', desc: mine ? `Heute: ${fmt(mine.score)} Punkte – morgen gibt es neue Orte.` : 'Fünf Orte, für euch beide dieselben', count: mine ? fmt(mine.score) : 'neu' },
      games: { name: 'Minispiele', desc: 'Blitzrunde, Städte-Pin, Nachbarn, Umrisse …' },
    };
  }

  function duelHtml() {
    if (!state.player) return '';
    const rows = [];
    for (const g of GAMES) {
      const keys = g.id === 'blitz' ? ['welt', ...CONTINENTS.map(r => r.id)].map(r => ['blitz-' + r, `Blitzrunde ${regionLabel(r)}`]) : [[keyOf(g.id), g.name]];
      for (const [key, label] of keys) {
        const vals = PLAYERS.map(p => bestOf(p.id, key));
        if (vals.every(v => v == null)) continue;
        const top = Math.max(...vals.map(v => v ?? -1));
        rows.push(`<div class="rec-row"><span class="rec-name">${esc(label)}</span>${PLAYERS.map((p, i) => `<span class="rec-val p-${p.id}${vals[i] === top ? ' lead' : ''}">${vals[i] == null ? '–' : fmt(vals[i])}</span>`).join('')}</div>`);
      }
    }
    const day = today();
    const d = PLAYERS.map(p => dayOf(p.id, day));
    return `<p class="field-label" style="margin-top:18px">Minispiele: Rekorde</p>
      ${rows.length ? `<div class="rec-rows"><div class="rec-row head"><span></span>${PLAYERS.map(p => `<span class="rec-val p-${p.id}">${esc(p.name)}</span>`).join('')}</div>${rows.join('')}</div>` : '<p class="hint" style="margin:0">Noch keine Rekorde – ab zu den Minispielen!</p>'}
      <p class="hint" style="margin:10px 0 0">Tagesrätsel heute: ${PLAYERS.map((p, i) => `${esc(p.name)} ${d[i] ? fmt(d[i].score) : 'offen'}`).join(' · ')}</p>`;
  }

  /** Für die Neuzeichnen-Prüfung: ändern sich Rekorde oder Tagesergebnisse? */
  function signature() {
    const day = today();
    return JSON.stringify(PLAYERS.map(p => [ctx.gamesOf(p.id), dayOf(p.id, day)]));
  }

  function refresh() {
    if (screen === 'hub') renderHub();
    else if (screen === 'intro') renderIntro();
  }

  function onEnter() {
    const btn = $('#view-game [data-gact="next"]') || $('#view-game [data-gact="pin-ok"]:not(:disabled)');
    if (btn) { btn.click(); return true; }
    return false;
  }

  return {
    SW, openHub, openDaily, handleClick, quit, stop, homeRows, duelHtml, signature, refresh, onEnter,
    playing: () => !!game,
  };
}
