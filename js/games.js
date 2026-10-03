// Minispiele: kurze Spiele mit Rekorden, die Emilia und Lars gegenseitig sehen –
// Blitzrunde, Städte-Pin, Nachbarn, Entweder-oder, Umrisse und das Tagesrätsel.
// Weitere Spiele kommen als eigene Module aus js/games/ dazu (Schnittstelle: „Spiele als Module“ ganz unten).
import { W, REGION_BOX } from './map.js?v=15';
import { NUMBERS } from './data/numbers.js?v=15';
import { DE_CITIES } from './data/de-cities.js?v=15';
import * as geo from './games/geo.js?v=15';
import route from './games/route.js?v=15';
import heiss from './games/heiss.js?v=15';
import alle from './games/alle.js?v=15';
import blind from './games/blind.js?v=15';
import schaetzen from './games/schaetzen.js?v=15';

const fmt = n => Math.round(n).toLocaleString('de-DE');
const genName = n => (/[sßxz]$/.test(n) ? n + '’' : n + 's');   // „Emilias Rekord“, „Lars’ Rekord“
const clockText = ms => { const s = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dec = (n, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

// Grenzen, die in den Kartendaten fehlen (Botswana–Sambia: 150 m bei Kazungula; Israel–Syrien: Golan)
const EXTRA_BORDERS = [['BW', 'ZM'], ['IL', 'SY']];
// Grenzen über Landesteile fern vom Kernland: Wer sie nennt, bekommt einen Extrapunkt – fehlen tun sie aber nicht
const OVERSEAS = [['FR', 'BR', 'Französisch-Guayana'], ['FR', 'SR', 'Französisch-Guayana'], ['ES', 'MA', 'Ceuta und Melilla']];
const ARM_MS = 350;   // so lange nach neuen Knöpfen zählt kein Klick (Doppelklick landet sonst auf dem nächsten Knopf)

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
    regions: true,
    unit: n => (n === 1 ? 'Land' : 'Länder'),
  },
  {
    id: 'pin', name: 'Städte-Pin', desc: 'Wo liegt die Stadt? Je näher dein Tipp, desto mehr Punkte.',
    how: r => (r === 'de'
      ? ['Fünf Städte in Deutschland – von Sylt bis Oberstdorf.', 'Setz deinen Punkt auf die Karte – heranzoomen hilft beim Zielen.', 'Hier zählt es genauer: volle 1000 Punkte nur bis 10 km daneben. Rekorde gibt es je Region.']
      : ['Fünf Hauptstädte und bekannte Städte – weltweit, auf einem Kontinent oder in Deutschland.', 'Setz deinen Punkt auf die Karte – heranzoomen hilft beim Zielen.', 'Bis 25 km daneben gibt es volle 1000 Punkte, danach immer weniger. Rekorde gibt es je Region.']),
    regions: true,
    unit: () => 'Punkte',
  },
  {
    id: 'nachbarn', name: 'Nachbarn', desc: 'Nenne alle Nachbarländer eines Landes.',
    how: ['Fünf Länder: Nenne jeweils alle Nachbarn mit gemeinsamer Landgrenze – Tippfehler sind kein Problem.', 'Die Karte zeigt einen Nachbarn erst, wenn du ihn genannt hast. Jeder gibt einen Punkt, alle ohne Fehler drei Punkte extra.', 'Nach drei falschen Ländern ist das Land vorbei.'],
    // eigene Rekordliste: früher wurde angetippt statt genannt
    key: 'nachbarn2',
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

// Spiele aus eigenen Modulen (js/games/<id>.js) – in dieser Reihenfolge stehen sie in der Übersicht, vor denen oben.
// Ein Modul, das null liefert, ist noch nicht fertig und erscheint nirgends.
const PLUGINS = [route, heiss, alle, blind, schaetzen];

export function createGames(ctx) {
  const {
    map, state, sfx, C, COUNTRIES, CITIES, PLAYERS, CONTINENTS,
    $, esc, flagUrl, shuffle, nameOf, nom, acc, gen, inDat, pl, capFirst, emph, unionBox, regionLabel, playerName,
  } = ctx;

  let screen = 'hub';     // hub | intro | result (im Panel „Minispiele“)
  let intro = { id: 'blitz', region: 'welt' };
  const lastRegion = {};  // zuletzt gewählte Region je Spiel
  let game = null;        // laufendes Spiel
  let seq = 0;            // jede Runde bekommt eine Nummer – alte Zeitgeber verfallen
  const plugins = new Map();   // Spiele aus Modulen: id → Definition (gefüllt ganz unten, wenn alle Helfer stehen)

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const me = () => state.player;
  const defOf = id => plugins.get(id) || GAMES.find(g => g.id === id);
  const allGames = () => [...plugins.values(), ...GAMES];
  const keyOf = (id, region = 'welt') => {
    const p = plugins.get(id);
    if (p) return typeof p.key === 'function' ? p.key(region) : p.key || id;
    if (id === 'blitz') return 'blitz-' + region;
    if (id === 'pin') return region === 'welt' ? 'pin' : 'pin-' + region;   // „pin“ bleibt der Welt-Rekord
    return GAMES.find(g => g.id === id)?.key || id;
  };
  const regionCodes = region => (region === 'de' ? ['DE'] : COUNTRIES.filter(c => c.regions.includes(region)).map(c => c.iso));
  const placeLabel = r => (r === 'de' ? 'Deutschland' : regionLabel(r));
  const regionsOf = g => {
    const own = g.regionList?.();
    return own?.length ? own : [{ id: 'welt', label: 'Welt' }, ...CONTINENTS, ...(g.id === 'pin' ? [{ id: 'de', label: 'Deutschland' }] : [])];
  };
  const bestOf = (pid, key) => ctx.gamesOf(pid)?.[key]?.best ?? null;
  const dayOf = (pid, day = today()) => ctx.dailyOf(pid)?.[day] || null;
  const nameFor = code => C.get(code)?.name || map.countryFeatures.find(f => f.properties.c === code)?.properties.n || code;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function hud(bar, text) {
    $('#scalebar').innerHTML = bar;
    $('#hud-text').innerHTML = text;
  }

  function card(html) {
    const el = $('#view-game');
    el.classList.remove('asking');
    el.innerHTML = html;
  }

  /** „Weiter“ bekommt den Fokus (Enter) – und rückt ins Bild, falls die Karte auf flachen Bildschirmen scrollt. */
  function focusNext() {
    const btn = $('#view-game [data-gact="next"]');
    if (!btn) return;
    btn.focus({ preventScroll: true });
    const box = $('#view-game');
    if (box.scrollHeight > box.clientHeight) box.scrollTop = box.scrollHeight;
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
    settleDaily();
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
        ${allGames().map(g => `<li><button class="legend-row" type="button" data-game="${g.id}">
          <span class="swatch">${SW[g.id] || ''}</span>
          <span><span class="name">${g.name}${g.badge ? ` <span class="tag mini">${esc(g.badge)}</span>` : ''}</span><span class="desc">${g.desc}</span>${recordsHtml(keyOf(g.id, regionsOf(g)[0].id), g.unit, { compact: true })}</span>
        </button></li>`).join('')}
      </ul>`;
  }

  /* ---------- Spielvorstellung ---------- */

  function openIntro(id) {
    stop();
    // zuletzt gewählte Region – sofern das Spiel sie (noch) anbietet, sonst die erste seiner Liste
    const regions = regionsOf(defOf(id));
    intro = { id, region: regions.some(r => r.id === lastRegion[id]) ? lastRegion[id] : regions[0].id };
    screen = 'intro';
    renderIntro();
    ctx.show('games');
    map.clear();
    map.showRegion(intro.region);
  }

  function renderIntro() {
    const g = defOf(intro.id);
    const regions = regionsOf(g);
    $('#view-games').innerHTML = `
      <button class="back" type="button" data-gact="hub">‹ Minispiele</button>
      <h2 class="h2">${g.name}</h2>
      <p class="lead">${g.desc}</p>
      <ul class="how">${(typeof g.how === 'function' ? g.how(intro.region) : g.how).map(t => `<li>${t}</li>`).join('')}</ul>
      ${g.regions ? `<div class="field"><p class="field-label">Wo?</p>
        <div class="options">${regions.map(r => `<button type="button" class="opt" data-gopt="${r.id}" aria-pressed="${r.id === intro.region}">${r.label}</button>`).join('')}</div></div>` : ''}
      <p class="field-label" style="margin-top:20px">Rekorde${g.regions ? ` – ${esc(regions.find(r => r.id === intro.region)?.label || placeLabel(intro.region))}` : ''}</p>
      ${recordsHtml(keyOf(g.id, intro.region), g.unit) || '<p class="hint" style="margin:0">Noch hat niemand gespielt.</p>'}
      <div class="actions"><button class="btn primary wide" type="button" data-gact="start">Los geht's</button></div>`;
  }

  function start() {
    const id = intro.id;
    if (plugins.has(id)) plugins.get(id).start(intro.region);
    else if (id === 'blitz') startBlitz(intro.region);
    else if (id === 'pin') startPin({ daily: false, region: intro.region });
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
  // neue Frage oder neues Ergebnis: kurz keine Klicks annehmen
  const arm = g => { g.readyAt = performance.now() + ARM_MS; };

  /** Laufendes Spiel ohne Ergebnis beenden (Zeitgeber, Karte, Abdeckung). */
  function stop() {
    const g = game;
    if (g) { clearInterval(g.clock); clearTimeout(g.timer); }
    game = null;
    seq++;
    veil(false);
    pickable(false);
    if (g) hook(plugins.get(g.id), 'cleanup', g);
  }

  /* ---------- Ergebnis ---------- */

  function showResult({ g, title, score, big, unit, details = '', key }) {
    const res = ctx.saveRecord(key, score);
    if (res.isRecord) sfx.record();
    const other = state.player && PLAYERS.find(p => p.id !== state.player);
    const theirs = other ? bestOf(other.id, key) : null;
    const def = defOf(g.id);
    let line = '';
    if (res.isRecord) line = `<p class="record-badge">Neuer Rekord!${res.prev != null ? ` Vorher: ${fmt(res.prev)}` : ''}</p>`;
    else if (res.prev != null) line = `<p class="lead">Dein Rekord: ${fmt(res.prev)} ${esc(def.unit(res.prev))}</p>`;
    if (other && theirs != null) {
      const mine = Math.max(score, res.prev ?? 0);
      line += `<p class="lead">${esc(genName(other.name))} Rekord: <b class="p-${other.id}-ink">${fmt(theirs)}</b>${mine > theirs ? ' – du liegst vorn.' : mine === theirs ? ' – Gleichstand.' : ` – noch ${fmt(theirs - mine + 1)} bis zur Führung.`}</p>`;
    }
    screen = 'result';
    game = null;
    seq++;
    pickable(false);
    veil(false);
    hook(plugins.get(g.id), 'cleanup', g);
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
    refitMap();
  }

  /** Die Ergebnisseite verdeckt einen anderen Teil der Karte als das Spiel: Ausschnitt neu einpassen. */
  function refitMap() {
    const s = seq;
    requestAnimationFrame(() => { if (s === seq && !game) map.refit(); });
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
      // im Hintergrund läuft die Zeit nicht weiter – auch nicht, wenn das Handy die App ganz angehalten hatte
      // (dann kommt der erste Takt danach mit einer riesigen Lücke)
      if (document.visibilityState === 'visible') g.left -= Math.min(now - last, 250);
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
    arm(g);
    map.hitOptions = { water: false, prefer: g.target };
    map.onClick = hit => blitzTap(g, hit);
    $('#map').classList.add('pickable');
  }

  function blitzTap(g, hit) {
    if (!alive(g) || g.busy || g.over || !hit || hit.type !== 'country' || hit.code === 'AQ') return;
    // Doppeltipp: Der zweite Tipp auf das eben gefundene Land ist kein Fehler bei der nächsten Frage
    if (hit.code !== g.target && hit.code === g.lastHit?.code && performance.now() - g.lastHit.at < 600) return;
    if (hit.code === g.target) {
      g.lastHit = { code: hit.code, at: performance.now() };
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
    // „Kein Fehler“ nur, wenn wirklich nichts danebenging – und überhaupt etwas gefunden wurde
    const details = names.length ? `<p class="field-label" style="margin-top:14px">Diesmal nicht gefunden</p>
      <p class="name-list">${names.slice(0, 14).map(esc).join(', ')}${names.length > 14 ? ` und ${names.length - 14} weitere` : ''}</p>
      <p class="hint" style="margin-top:6px">Auf der Karte rot, deine Treffer grün.</p>`
      : !g.missed.length && g.score > 0 ? '<p class="lead">Kein einziger Fehler!</p>' : '';
    showResult({ g, key: g.key, score: g.score, title: `${g.left > 0 ? 'Blitzrunde' : 'Zeit um'} – ${esc(regionLabel(g.region))}`, big: g.score, unit: g.score === 1 ? 'Land' : 'Länder', details });
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

  // Ort auf dem Kontinent? Bei Ländern auf zwei Kontinenten entscheidet die Lage des Ortes.
  function inRegion(p, region) {
    if (region === 'welt') return true;
    const c = C.get(p.iso);
    if (!c?.regions.includes(region)) return false;
    if (c.regions.length === 1) return true;
    // Türkei: Europa ist nur Ostthrakien nördlich des Marmarameers (mit Istanbul), der Rest ist Kleinasien
    if (p.iso === 'TR' && (region === 'europa' || region === 'asien')) return (p.lon < 29.1 && p.lat > 40.6) === (region === 'europa');
    const [x0, y0, x1, y1] = REGION_BOX[region];
    return p.lon >= x0 && p.lon <= x1 && p.lat >= y0 && p.lat <= y1;
  }

  const dePlaces = () => DE_CITIES.map(c => ({ name: c.name, lat: c.lat, lon: c.lon, iso: 'DE', state: c.state, cap: c.cap, de: true }));

  function pickPlaces(n, rnd = Math.random, region = 'welt') {
    const pool = region === 'de' ? dePlaces() : placePool().filter(p => inRegion(p, region));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = [], seen = new Set();
    for (const p of pool) {
      const key = p.de ? p.name : p.iso;   // in Deutschland verschiedene Städte, sonst verschiedene Länder
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
      if (out.length >= n) break;
    }
    return out;
  }

  // Punkte nach Entfernung: weltweit volle Punkte bis 25 km, in Deutschland bis 10 km und steiler abfallend
  const pinScale = region => (region === 'de' ? { full: 10, decay: 150 } : { full: 25, decay: 1000 });
  const pinPoints = (d, region) => {
    if (d == null) return 0;
    const { full, decay } = pinScale(region);
    return d <= full ? 1000 : Math.round(1000 * Math.exp(-(d - full) / decay));
  };

  /** Satz zur deutschen Stadt: Bundesland, Landeshauptstadt, Stadtstaat. */
  function deSentence(p) {
    const n = esc(p.name);
    if (p.cap === 'bund') return `${n} ist die Hauptstadt Deutschlands und zugleich ein eigenes Bundesland.`;
    if (p.name === 'Bremen') return `${n} bildet zusammen mit Bremerhaven das Bundesland ${emph('Bremen', 'b')}.`;
    if (p.name === p.state) return `${n} ist ein Stadtstaat – Stadt und Bundesland zugleich.`;
    if (p.cap === 'land') return `${n} ist die Landeshauptstadt ${p.state === 'Saarland' ? 'des <b>Saarlandes</b>' : `von <b>${esc(p.state)}</b>`}.`;
    const where = p.state === 'Saarland' ? 'im Saarland' : ['Bremen', 'Hamburg', 'Berlin'].includes(p.state) ? `im Land ${p.state}` : `in ${p.state}`;
    return `${n} liegt ${emph(where, 'b')}.`;
  }

  /**
   * Angefangenes Tagesrätsel von einem früheren Tag (z. B. über Mitternacht liegen gelassen):
   * Es zählt mit dem bisherigen Stand – wie bei „Beenden“. Ein schon gespeichertes Ergebnis bleibt.
   */
  function settleDaily() {
    const run = state.dailyRun;
    if (!run || run.player !== me() || (game?.id === 'daily' && game.day === run.day)) return;
    if (!dayOf(me(), run.day) && run.day === today()) return;   // läuft heute noch
    if (!dayOf(me(), run.day) && run.results?.length) ctx.saveDaily(run.day, run.total);
    state.dailyRun = null;
    ctx.save();
  }

  function openDaily() {
    stop();
    settleDaily();
    const day = today();
    const mine = dayOf(me(), day);
    if (mine) { showDailyResult(day); return; }
    startPin({ daily: true });
  }

  function startPin({ daily, region = 'welt' }) {
    const day = today();
    let g;
    if (daily) {
      const run = state.dailyRun?.day === day && state.dailyRun.player === me() ? state.dailyRun : null;
      g = begin({ id: 'daily', key: 'daily', day, places: pickPlaces(5, seeded('weltquiz-' + day)), i: run?.i || 0, total: run?.total || 0, results: run?.results || [] });
    } else {
      g = begin({ id: 'pin', key: keyOf('pin', region), region, places: pickPlaces(5, Math.random, region), i: 0, total: 0, results: [] });
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
    // erst die Karte des Spiels zeigen, dann den Ausschnitt wählen – er richtet sich nach ihrer Höhe
    card(`<div class="q-head"><h2 class="q-prompt">Wo liegt <em>${esc(p.name)}</em>?</h2>${g.id === 'daily' ? '<span class="tag">Tagesrätsel</span>' : ''}</div>
      <p class="hint" id="pin-state">Tippe auf die Karte, wo du den Ort vermutest. Zum genauen Zielen heranzoomen.</p>
      <div class="below">
        <button class="chip-btn" type="button" data-gact="pin-skip">Keine Ahnung</button>
        <button class="btn primary ok" type="button" data-gact="pin-ok" disabled>OK</button>
      </div>`);
    arm(g);
    pinView(g);
    pinHud(g);
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
    const d = !skipped && g.guess ? geo.km(g.guess, target) : null;
    const pts = pinPoints(d, g.region);
    const full = d != null && d <= pinScale(g.region).full;
    const near = g.region === 'de';   // Deutschland: Kamera näher heran
    g.total += pts;
    g.results.push({ name: p.name, iso: p.iso, km: d == null ? null : Math.round(d), pts, hit: full });
    if (g.id === 'daily') {
      state.dailyRun = { day: g.day, player: me(), i: g.i + 1, total: g.total, results: g.results };
      // fünfter Ort beantwortet: Ergebnis sofort speichern, nicht erst bei „Zum Ergebnis“
      if (g.i + 1 >= g.places.length) ctx.saveDaily(g.day, g.total);
      ctx.save();
    }
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
      if (d >= (near ? 15 : 60)) map.labelAt((a[0] + bx) / 2, (a[1] + t[1]) / 2, `${fmt(d)} km`, 'dist');
      const box = [[Math.min(a[0], bx), Math.min(a[1], t[1])], [Math.max(a[0], bx), Math.max(a[1], t[1])]];
      requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.5, minSize: near ? 12 : 40 }));
    } else {
      requestAnimationFrame(() => alive(g) && map.flyToPoint(p.lon, p.lat, { size: near ? 40 : 160 }));
    }

    const c = C.get(p.iso);
    const where = p.de ? deSentence(p)
      : p.capital ? `${esc(p.name)} ist die Hauptstadt ${emph(gen(c), 'b')}.` : `${esc(p.name)} liegt ${emph(inDat(c), 'b')}.`;
    const verdict = d == null ? 'Kein Tipp – 0 Punkte.' : full ? 'Volltreffer!' : `${fmt(d)} km daneben`;
    const last = g.i + 1 >= g.places.length;
    card(`<div class="result ${pts >= 700 ? 'right' : pts >= 250 ? 'mid' : 'wrong'}">${verdict}<span class="pts">+${fmt(pts)}</span></div>
      <p class="result-detail">${where}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächster Ort'}</button></div>`);
    arm(g);
    focusNext();
  }

  function pinNext(g) {
    if (!alive(g)) return;
    g.i++;
    pinQuestion(g);
  }

  /** Karte für Städte-Pin: die gewählte Region, alles andere ausgegraut. */
  function pinView(g, opts) {
    map.clear();
    const region = g.region || 'welt';
    if (region !== 'welt') map.dimOutside(regionCodes(region));   // Deutschland: nur Deutschland farbig
    map.showRegion(region, opts);
  }

  function pinTable(results) {
    return `<ul class="res-list">${results.map(r => `<li><span>${esc(r.name)}</span><span class="res-km">${r.km == null ? 'kein Tipp' : (r.hit ?? r.km <= 25) ? 'Volltreffer' : fmt(r.km) + ' km'}</span><b>${fmt(r.pts)}</b></li>`).join('')}</ul>`;
  }

  function finishPin(g) {
    if (!alive(g)) return;
    pickable(false);
    // alle Orte auf einer Karte
    pinView(g);
    for (const p of g.places) map.pin(p.lon, p.lat, p.name, 'right');
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
    const where = g.region && g.region !== 'welt' ? ` – ${esc(placeLabel(g.region))}` : '';
    showResult({ g, key: g.key, score: g.total, title: `Städte-Pin${where}`, big: fmt(g.total), unit: 'von 5.000 Punkten', details: pinTable(g.results) });
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
    } else refitMap();
  }

  /* ================= Nachbarn ================= */

  /** Nachbarn über Landesteile fern vom Kernland: Land → Landesteil, über den die Grenze läuft. */
  function extrasOf(iso) {
    const out = new Map();
    for (const [a, b, via] of OVERSEAS) { if (a === iso) out.set(b, via); if (b === iso) out.set(a, via); }
    return out;
  }

  // Nur Staaten zählen – Gebiete wie Westsahara oder Gibraltar kann man nicht als Land eintippen.
  // Grenzen über ferne Landesteile (Französisch-Guayana, Ceuta und Melilla) muss man nicht wissen.
  function neighborsOf(iso) {
    const graph = map.neighborGraph();
    const extra = extrasOf(iso);
    const set = new Set([...(graph.get(iso) || [])].filter(d => C.has(d) && !extra.has(d)));
    for (const [a, b] of EXTRA_BORDERS) { if (a === iso) set.add(b); if (b === iso) set.add(a); }
    return set;
  }

  function startNachbarn() {
    const eligible = COUNTRIES.filter(c => neighborsOf(c.iso).size >= 2).map(c => c.iso);
    const g = begin({ id: 'nachbarn', key: keyOf('nachbarn'), targets: shuffle(eligible).slice(0, 5), i: 0, points: 0, rows: [] });
    nachbarnQuestion(g);
  }

  function nachbarnHud(g) {
    hud(g.targets.map((_, i) => {
      const r = g.rows[i];
      return `<i class="${r ? (r.perfect ? 'r' : r.found === r.total ? 'm' : 'w') : i === g.i ? 'now' : ''}"></i>`;
    }).join(''), `<span class="long">Land ${Math.min(g.i + 1, 5)} von 5</span><span>${g.points} Punkte</span>`);
  }

  function nachbarnBox(cur) {
    let box = map.countryBox(cur.iso);
    for (const n of [...cur.nb, ...cur.bonus]) box = unionBox(box, map.countryBox(n));
    return box;
  }

  // Man muss die Nachbarn wissen und nennen: Die Karte zeigt sie erst, wenn sie genannt sind.
  function nachbarnQuestion(g) {
    if (!alive(g)) return;
    if (g.i >= g.targets.length) { finishNachbarn(g); return; }
    const iso = g.targets[g.i];
    const c = C.get(iso);
    g.cur = { iso, nb: neighborsOf(iso), extra: extrasOf(iso), found: new Set(), bonus: new Set(), wrong: new Set(), mistakes: 0, done: false };
    map.clear();
    map.setCountryClass(iso, 'is-target');
    map.labelCountry(iso, c.name, '');
    const box = nachbarnBox(g.cur);
    requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.2, minSize: 30 }));
    nachbarnHud(g);
    card(`<div class="q-head"><h2 class="q-prompt">Welche Länder grenzen an ${emph(acc(c))}?</h2></div>
      <p class="hint" id="nb-state"></p>
      ${nameFormHtml({ placeholder: 'Nachbarland eingeben …', label: 'Nachbarland' })}
      <div class="below"><button class="chip-btn" type="button" data-gact="nb-giveup">Aufgeben</button><span class="miss-dots" id="nb-dots"></span></div>`);
    $('#view-game').classList.add('asking');   // Vorschläge dürfen über die Karte hinausragen
    arm(g);
    nachbarnState(g);
    wireNameInput(id => nachbarnGuess(g, id));
    if (!matchMedia('(pointer: coarse)').matches) $('#nb-input').focus({ preventScroll: true });
  }

  /** Eingabefeld für einen Ländernamen mit Vorschlagsliste (Nachbarn und Spiele aus Modulen) – verbunden mit wireNameInput. */
  function nameFormHtml({ placeholder = 'Land eingeben …', label = 'Land' } = {}) {
    return `<form class="answer" id="nb-form" autocomplete="off">
        <input id="nb-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="nb-suggest"
          placeholder="${esc(placeholder)}" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="${esc(label)}">
        <button class="btn primary ok" type="submit" disabled>OK</button>
        <ul class="suggest" id="nb-suggest" role="listbox" hidden></ul>
      </form>`;
  }

  /** Eingabefeld mit Vorschlägen: Tippen auf einen Vorschlag gilt sofort, Enter wählt erst aus und schickt dann ab. */
  function wireNameInput(onPick) {
    const input = $('#nb-input'), list = $('#nb-suggest'), ok = $('#nb-form .ok');
    let results = [], active = -1, chosen = null;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const render = () => {
      if (!input.value.trim()) { close(); return; }
      list.innerHTML = results.length
        ? results.map((r, i) => `<li id="nbs${i}" role="option" data-i="${i}" aria-selected="${i === active}"><b>${esc(r.item.label)}</b>${r.via ? `<span class="via">${esc(r.via)}</span>` : ''}</li>`).join('')
        : '<li class="empty" role="option" aria-disabled="true">Kein Land gefunden – anders schreiben?</li>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    const choose = item => { chosen = item; input.value = item.label; ok.disabled = false; close(); };
    const submit = item => {
      if (!item) return;
      input.value = '';
      chosen = null;
      results = [];
      ok.disabled = true;
      close();
      onPick(item.id);
      if (document.body.contains(input)) input.focus({ preventScroll: true });
    };
    input.addEventListener('input', () => {
      results = ctx.countrySearch.search(input.value);
      active = results.length ? 0 : -1;
      chosen = ctx.countrySearch.exact(input.value) || null;
      ok.disabled = !chosen && !results.length;
      render();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; render(); }
      else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; render(); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('pointerdown', e => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      e.preventDefault();
      submit(results[+li.dataset.i].item);
    });
    $('#nb-form').addEventListener('submit', e => {
      e.preventDefault();
      const top = results[active]?.item;
      if (chosen && (list.hidden || !top || top === chosen)) submit(chosen);
      else if (top) choose(top);   // erst auswählen, damit ein Tippfehler nicht gleich als Fehler zählt
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  function nachbarnState(g, note = '') {
    const cur = g.cur;
    $('#nb-state').textContent = note || `${cur.found.size} von ${cur.nb.size} gefunden. Nenne alle Länder mit gemeinsamer Landgrenze.`;
    $('#nb-dots').innerHTML = [0, 1, 2].map(i => `<i class="${i < cur.mistakes ? 'on' : ''}" title="Fehler"></i>`).join('');
  }

  function nachbarnGuess(g, code) {
    const cur = g.cur;
    if (!alive(g) || !cur || cur.done || !C.has(code)) return;
    const t = C.get(code);
    if (code === cur.iso) { nachbarnState(g, `${capFirst(nom(t))} ${pl(t, 'ist', 'sind')} das Land selbst – gesucht sind die Nachbarn.`); return; }
    if (cur.found.has(code) || cur.bonus.has(code)) { nachbarnState(g, `${capFirst(acc(t))} hast du schon genannt.`); return; }
    if (cur.wrong.has(code)) { nachbarnState(g, `${capFirst(nom(t))} – das war schon falsch.`); return; }
    if (cur.nb.has(code)) {
      cur.found.add(code);
      map.setCountryClass(code, 'is-right');
      map.labelCountry(code, t.name, 'right');
      sfx.blip(cur.found.size);
      if (cur.found.size === cur.nb.size) nachbarnEnd(g);
      else nachbarnState(g);
      return;
    }
    if (cur.extra.has(code)) {
      // Grenze über einen fernen Landesteil: zählt extra
      cur.bonus.add(code);
      map.setCountryClass(code, 'is-right');
      map.labelCountry(code, t.name, 'right');
      sfx.blip(cur.found.size + cur.bonus.size);
      const box = nachbarnBox(cur);
      requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.2, minSize: 30 }));
      nachbarnState(g, `Stimmt – über ${cur.extra.get(code)} ${pl(C.get(cur.iso), 'grenzt', 'grenzen')} ${nom(C.get(cur.iso))} an ${acc(t)}. Ein Extrapunkt!`);
      return;
    }
    cur.wrong.add(code);
    cur.mistakes++;
    map.setCountryClass(code, 'is-wrong');
    map.labelCountry(code, t.name, 'wrong');
    sfx.buzz();
    // falsches Land mit ins Bild nehmen, damit man sieht, wo es liegt
    const box = unionBox(nachbarnBox(cur), map.countryBox(code));
    requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.2, minSize: 30 }));
    if (cur.mistakes >= 3) nachbarnEnd(g);
    else nachbarnState(g, `${capFirst(nom(t))} ${pl(t, 'grenzt', 'grenzen')} nicht an ${acc(C.get(cur.iso))}.`);
  }

  /** Land abschließen und Punkte zählen: je Nachbar einer, Extrapunkte für ferne Grenzen, alle ohne Fehler +3. */
  function nachbarnScore(g) {
    const cur = g.cur;
    cur.done = true;
    const missing = [...cur.nb].filter(n => !cur.found.has(n));
    const perfect = !missing.length && !cur.mistakes;
    const pts = cur.found.size + cur.bonus.size + (perfect ? 3 : 0);
    g.points += pts;
    g.rows.push({ iso: cur.iso, found: cur.found.size, total: cur.nb.size, bonus: cur.bonus.size, mistakes: cur.mistakes, perfect, pts });
    return { missing, perfect, pts };
  }

  function nachbarnEnd(g) {
    const cur = g.cur;
    if (!alive(g) || cur.done) return;
    const { missing, perfect, pts } = nachbarnScore(g);
    for (const m of missing) { map.setCountryClass(m, 'is-pick'); map.labelCountry(m, nameFor(m), ''); }
    nachbarnHud(g);
    if (perfect) sfx.correct(); else if (!missing.length) sfx.select(); else sfx.wrong();
    const c = C.get(cur.iso);
    let text = perfect ? `Perfekt: alle ${cur.nb.size} Nachbarn ohne Fehler. +3 Bonus!`
      : !missing.length ? `Alle ${cur.nb.size} genannt – mit ${cur.mistakes} ${cur.mistakes === 1 ? 'Fehler' : 'Fehlern'}.`
        : `${cur.found.size} von ${cur.nb.size} genannt. Gefehlt ${missing.length === 1 ? 'hat' : 'haben'}: ${missing.map(nameFor).join(', ')} (rosa markiert).`;
    // ferne Grenzen, die niemand kennen muss: als Wissen nachreichen
    const unnamed = [...cur.extra].filter(([code]) => !cur.bonus.has(code));
    for (const via of new Set(unnamed.map(([, v]) => v))) {
      const names = unnamed.filter(([, v]) => v === via).map(([code]) => acc(C.get(code)));
      text += ` Übrigens: Über ${via} ${pl(c, 'grenzt', 'grenzen')} ${nom(c)} auch an ${names.join(' und ')}.`;
    }
    const last = g.i + 1 >= g.targets.length;
    card(`<div class="result ${perfect ? 'right' : !missing.length ? 'mid' : 'wrong'}">${esc(c.name)}<span class="pts">+${pts}</span></div>
      <p class="result-detail">${esc(text)}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächstes Land'}</button></div>`);
    arm(g);
    focusNext();
    let box = nachbarnBox(cur);
    for (const w of cur.wrong) box = unionBox(box, map.countryBox(w));
    requestAnimationFrame(() => alive(g) && map.flyToBox(box, { pad: 1.2, minSize: 30 }));
  }

  function finishNachbarn(g) {
    const details = `<ul class="res-list">${g.rows.map(r => `<li><span>${esc(C.get(r.iso).name)}</span><span class="res-km">${r.found} von ${r.total}${r.bonus ? ` · +${r.bonus} extra` : ''}${r.perfect ? ' · perfekt' : ''}</span><b>${r.pts}</b></li>`).join('')}</ul>`;
    map.clear();
    for (const r of g.rows) map.setCountryClass(r.iso, r.perfect ? 'is-right' : 'is-pick');
    map.showRegion('welt');
    showResult({ g, key: g.key, score: g.points, title: 'Nachbarn', big: g.points, unit: g.points === 1 ? 'Punkt' : 'Punkte', details });
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
    arm(g);
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
    arm(g);
    focusNext();
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
    if (g.over) { finishVergleich(g); return; }
    vergleichQuestion(g);
  }

  function finishVergleich(g) {
    const s = g.streak;
    showResult({ g, key: 'vergleich', score: s, title: 'Entweder-oder', big: s, unit: 'richtig in Folge',
      details: s >= 10 ? '<p class="lead">Starke Serie!</p>' : '' });
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
    arm(g);
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
    arm(g);
    focusNext();
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
    if (t.dataset.gopt) { intro.region = lastRegion[intro.id] = t.dataset.gopt; renderIntro(); map.clear(); map.showRegion(intro.region); return true; }
    const act = t.dataset.gact;
    if (!act) return false;
    const g = game;
    // Klick kurz nach neuen Knöpfen (Doppelklick): ignorieren statt ungesehen die nächste Frage zu beantworten
    const nav = ['hub', 'daily', 'start', 'again'].includes(act);
    if (g && performance.now() < (g.readyAt || 0) && !nav) return true;
    // Spiel aus einem Modul: „Weiter“ und seine eigenen Knöpfe
    const p = g && !nav ? plugins.get(g.id) : null;
    if (p && act === 'next') { p.next?.(g); return true; }
    if (p?.actions && Object.prototype.hasOwnProperty.call(p.actions, act)) { p.actions[act](g, t); return true; }
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

  /**
   * „Beenden“ oben rechts. Was schon gespielt ist, zählt (wie im normalen Quiz): Ergebnisseite mit Rekord.
   * Ohne Fortschritt zurück zur Spielvorstellung. Beim Tagesrätsel wird vorher gefragt.
   */
  function quit() {
    const g = game;
    if (!g) { openHub(); return; }
    if (g.id === 'daily') {
      if (!confirm('Tagesrätsel beenden? Dann zählen deine bisherigen Punkte als Ergebnis für heute.')) return;
      g.places = g.places.slice(0, g.results.length);
      finishPin(g);
      return;
    }
    if (finishEarly(g)) return;
    const id = g.id;
    stop();
    openIntro(id);
  }

  /** Spiel mit dem bisherigen Stand abschließen. false, wenn noch nichts gespielt ist. */
  function finishEarly(g) {
    if (plugins.has(g.id)) return !!plugins.get(g.id).finishEarly?.(g);
    if (g.id === 'blitz' && (g.score || g.missed.length)) { g.over = true; finishBlitz(g); return true; }
    if (g.id === 'pin' && g.results.length) { g.places = g.places.slice(0, g.results.length); finishPin(g); return true; }
    if (g.id === 'nachbarn') {
      const cur = g.cur;
      if (cur && !cur.done && (cur.found.size || cur.bonus.size || cur.mistakes)) nachbarnScore(g);   // angefangenes Land zählt wie aufgegeben
      if (g.rows.length) { finishNachbarn(g); return true; }
    }
    if (g.id === 'vergleich' && (g.streak || g.over)) { finishVergleich(g); return true; }
    if (g.id === 'umrisse' && g.rows.length) { finishUmrisse(g); return true; }
    return false;
  }

  /** Bisheriger Stand als Zahl für die Rekordliste (null: noch nichts gespielt). */
  function scoreSoFar(g) {
    if (plugins.has(g.id)) return hook(plugins.get(g.id), 'scoreSoFar', g) ?? null;
    if (g.id === 'blitz') return g.score;
    if (g.id === 'pin') return g.results.length ? g.total : null;
    if (g.id === 'nachbarn') return g.points + (g.cur && !g.cur.done ? g.cur.found.size + g.cur.bonus.size : 0);
    if (g.id === 'vergleich') return g.streak;
    if (g.id === 'umrisse') return g.rows.filter(r => r.ok).length;
    return null;
  }

  /**
   * Spiel verlassen, ohne die Ergebnisseite zu zeigen (Logo, Spielerwechsel): Ein Rekord zählt trotzdem.
   * Das Tagesrätsel bleibt fortsetzbar.
   */
  function leave() {
    const g = game;
    if (g && g.id !== 'daily') {
      const score = scoreSoFar(g);
      if (score) ctx.saveRecord(g.key, score);
    }
    stop();
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
    for (const g of allGames()) {
      const keys = g.regions ? regionsOf(g).map(r => [keyOf(g.id, r.id), `${g.name} ${r.label}`]) : [[keyOf(g.id, regionsOf(g)[0].id), g.name]];
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
    const btn = $('#view-game [data-gact="next"]') || $('#view-game [data-gact="pin-ok"]:not(:disabled)') || $('#view-game [data-enter]:not(:disabled)');
    if (btn) { btn.click(); return true; }
    return false;
  }

  /* ================= Spiele als Module ================= */

  // Haken eines Spielmoduls aufrufen: Ein Fehler darin darf weder die Navigation noch andere Spiele lahmlegen
  function hook(p, name, ...args) {
    try { return p?.[name]?.(...args); } catch (err) { console.error(err); return undefined; }
  }

  /**
   * Schnittstelle für Minispiele in eigenen Modulen. Ein Modul js/games/<id>.js exportiert
   *
   *   export default function (api) { return { …Definition… }; }    // oder null: Spiel noch nicht fertig
   *
   * Es steht oben in PLUGINS (Import mit ?v=15) und wird beim Start der App einmal aufgerufen.
   * Eigene Stile gehören nach css/games/<id>.css – Klassen mit eigener Vorsilbe, z. B. .rt-…
   *
   * Definition (Pflicht: id, name, desc, how, swatch, key, unit, start):
   *   id              eindeutig; data-game in der Übersicht und g.id des laufenden Spiels
   *   name, desc      Name und eine Zeile Beschreibung für die Übersicht (Text)
   *   how             Sätze für die Spielvorstellung: ['…', '…'] oder region => ['…']
   *   badge           optional: kleines Schild neben dem Namen, z. B. 'neu'
   *   swatch          Symbol in der Übersicht: '<svg viewBox="0 0 34 24">…</svg>'
   *   regions         optional true: Regionswahl in der Vorstellung, Rekorde je Region (auch im Duell)
   *   regionList      optional () => [{ id, label }]; sonst Welt und die sechs Kontinente. Der erste Eintrag ist die
   *                   Vorgabe und sein Rekord steht in der Übersicht. Eine gemerkte Region, die fehlt, fällt auf ihn zurück.
   *   key             region => Rekordschlüssel, z. B. r => 'route-' + r (ohne Regionen das Argument übergehen).
   *                   Nie ändern – sonst sind die Rekorde weg; eine andere Wertung bekommt einen neuen Schlüssel.
   *   unit            n => Einheit hinter der Zahl, z. B. n => (n === 1 ? 'Punkt' : 'Punkte')
   *   start(region)   g = api.begin({ id, key, … }) aufrufen, dann Karte und Spielkarte aufbauen
   *   actions         { 'rt-giveup'(g, t) {}, … } für Knöpfe mit data-gact="rt-giveup"; g = laufendes Spiel, t = der Knopf.
   *                   Gilt nur, solange das Spiel läuft. Eigene Vorsilbe; hub, daily, start, again, next sind vergeben.
   *   next(g)         Knopf data-gact="next" („Weiter“, „Zum Ergebnis“) – Enter drückt ihn auch
   *   finishEarly(g)  „Beenden“: mit dem bisherigen Stand api.showResult(…) aufrufen und true liefern;
   *                   false, wenn noch nichts gespielt ist – dann geht es zurück zur Vorstellung
   *   scoreSoFar(g)   bisheriger Stand als Zahl oder null; wird Rekord, wenn man über Logo oder Spielerwechsel geht
   *   cleanup(g)      optional: eigene Modi zurücksetzen (Klassen am SVG oder an #map, eigene Ebenen, Zeitgeber,
   *                   Ereignisse). Läuft bei JEDEM Spielende, auch in showResult vor der Ergebnisseite. Länderklassen
   *                   aus map.setCountryClass nimmt map.clear() ab – die bleiben so auf der Ergebnisseite stehen.
   *
   * Spielregeln für Module:
   *   - Jeder Zeitgeber, Kameraflug und Rückruf prüft zuerst api.alive(g): Das Spiel kann längst vorbei sein.
   *     api.clock hört mit dem Spiel von selbst auf; eigene Intervalle und Ereignisse räumt cleanup ab.
   *   - Nach neuen Knöpfen api.arm(g), sonst beantwortet ein Doppelklick gleich die nächste Frage mit.
   *   - Den wichtigsten Knopf einer Frage (z. B. OK) mit data-enter markieren: Enter drückt ihn, wenn es kein „Weiter“ gibt.
   *   - Karte antippen: map.onClick = (hit, e, [x, y]) => …, map.hitOptions = { water: false, … } und
   *     $('#map').classList.add('pickable'); api.pickable(false) nimmt alles wieder weg, api.begin ebenso.
   *
   * api – aus der App:
   *   map             die Weltkarte (js/map.js): flyToBox, flyToCountry, flyToPoint, showRegion, refit, countryBox,
   *                   setCountryClass(code, cls, on), dimOutside, labelCountry, labelAt, pin, guessPin, line,
   *                   clearOverlay, clear, hitTest, lonLatAt, projection, neighborGraph, silhouette …
   *                   map.clear() nimmt auch jede Klasse ab, die je über setCountryClass gesetzt wurde.
   *   state, save     gespeicherter Stand (state.player: 'emilia' | 'lars' | null) · speichern
   *   sfx             Töne: correct, wrong, hint, select, whoosh, buzz, blip(n), streak(n), tick(last), record, fanfare(anteil)
   *   C, COUNTRIES    Länder als Map ISO → Land und als Liste: { iso, name, aliases, capital: { name, lat, lon },
   *                   otherCapitals, languages, currency, facts, regions: ['europa', …] }
   *   CITIES          weitere Städte: { name, lat, lon, iso }
   *   PLAYERS         [{ id, name }] · CONTINENTS: [{ id, label }] ohne Welt
   *   $, esc          document.querySelector · Text für HTML maskieren
   *   flagUrl(iso), shuffle(a) (gemischte Kopie), nameOf(code, props) (Name auch für Gebiete der Karte)
   *   nom, acc, gen, inDat (Land)   „die Türkei“, „den Iran“, „der Türkei“ / „von Deutschland“, „in der Türkei“
   *   pl(c, eins, mehrere), capFirst(text), emph(wendung, tag = 'em') (hebt nur den Namen hervor)
   *   unionBox(a, b)  Rahmen um zwei Rahmen in Karteneinheiten (auch über die Datumsgrenze)
   *   regionLabel(id), playerName(id)
   *   countrySearch   Ländersuche, Tippfehler egal: search(text) → [{ item: { id, label }, via }], exact(text) → item | null
   *
   * api – aus den Minispielen:
   *   fmt(n), dec(n, d), clockText(ms), genName(name)   „1.234“, „3,5“, „1:05“, „Emilias“ / „Lars’“
   *   pick(a), today(), me()     Zufallselement · 'JJJJ-MM-TT' · Spieler-ID oder null
   *   hud(bar, text)  Kopfzeile: Balken aus <i>-Teilen (Klassen r, m, w, now; time mit style="width:…%") und Text aus
   *                   <span>s (.long nur breit, .short nur schmal, .clock für die Uhr)
   *   card(html)      Spielkarte (#view-game) füllen · focusNext(): Knopf „Weiter“ fokussieren und ins Bild holen
   *   pickable(on)    Karte antippbar (aus: auch map.onClick und map.hitOptions weg) · veil(on): Karte abdecken
   *   begin({ id, key, … }) → g   neues Spiel: beendet ein laufendes, zeigt die Spielkarte, leert die Karte.
   *                   Weiter mit dem zurückgegebenen g (eine Kopie mit g.seq)
   *   alive(g), arm(g)           läuft g noch? · kurz keine Klicks annehmen
   *   showResult({ g, key, score, title, big, unit, details })   Ergebnisseite; speichert score als Rekord unter key.
   *                   title und details sind HTML, big die große Zahl, unit Text. Wirkt nur für das laufende Spiel.
   *   refitMap()      nach dem Spiel: Kartenausschnitt für die Ergebnisseite neu einpassen (macht showResult schon);
   *                   im laufenden Spiel stattdessen map.refit()
   *   clock(g, ms, onTick, onEnd)   Spieluhr: g.left, g.total; steht still, solange die App im Hintergrund ist
   *   countdown(g, then)         3 – 2 – 1 in der Spielkarte, dann then()
   *   regionCodes(region), placeLabel(region)   ISO-Codes eines Kontinents ('de' → ['DE'], 'welt' → []) · Name
   *   bestOf(pid, key)           Rekord eines Spielers (pid null: eigener), null = noch keiner
   *   neighborsOf(iso)           Nachbarstaaten mit gemeinsamer Landgrenze (Set), wie bei Nachbarn
   *   extrasOf(iso)              Nachbarn nur über ferne Landesteile: Map ISO → 'Französisch-Guayana' …
   *   nameFor(code)              Name, auch für Gebiete ohne Eintrag in C
   *   popText(n), areaText(n), NUMBERS   „83,2 Mio.“, „357.000 km²“ · { ISO: { pop, area } }
   *   nameFormHtml({ placeholder, label })   Ländereingabe mit Vorschlägen wie bei Nachbarn (ids nb-form, nb-input, nb-suggest)
   *   wireNameInput(onPick)      verbindet sie, onPick(iso) bei Auswahl. Ablauf: card(`… ${nameFormHtml(…)} …`);
   *                   $('#view-game').classList.add('asking') (Vorschläge dürfen über die Karte ragen); wireNameInput(…);
   *                   ohne Touch noch $('#nb-input').focus({ preventScroll: true })
   *   geo             Geometrie (js/games/geo.js): km, coreRings, corePoints, betweenKm, toCountryKm, centerOf,
   *                   direction, WINDS, ARROWS
   */
  const api = {
    map, state, save: ctx.save, sfx, C, COUNTRIES, CITIES, PLAYERS, CONTINENTS,
    $, esc, flagUrl, shuffle, nameOf, nom, acc, gen, inDat, pl, capFirst, emph, unionBox, regionLabel, playerName,
    countrySearch: ctx.countrySearch,
    fmt, dec, clockText, genName, pick, today, me, hud, card, focusNext, pickable, veil, begin, alive, arm,
    showResult: o => { if (alive(o.g)) showResult(o); },
    refitMap, clock, countdown, regionCodes, placeLabel, bestOf, neighborsOf, extrasOf, nameFor, popText, areaText, NUMBERS,
    nameFormHtml, wireNameInput, geo,
  };

  for (const make of PLUGINS) {
    let def = null;
    try { def = make(api); } catch (err) { console.error(err); }
    if (!def) continue;
    if (defOf(def.id) || def.id === 'daily') { console.error(`Minispiel „${def.id}“ gibt es schon`); continue; }
    plugins.set(def.id, def);
    if (def.swatch) SW[def.id] = def.swatch;
  }

  return {
    SW, openHub, openDaily, handleClick, quit, stop, leave, homeRows, duelHtml, signature, refresh, onEnter,
    settle: settleDaily,
    playing: () => !!game,
    peek: () => game,   // nur für Tests (?debug)
  };
}
