// Minispiel „Heiß & kalt“: ein geheimes Land finden. Jeder Tipp verrät, wie weit es entfernt ist (von Grenze zu
// Grenze) und in welcher Richtung es liegt; die Karte färbt die Tipps nach Nähe. Stile in css/games/heiss.css.
import { W } from '../map.js?v=15';

const ROUNDS = 3;     // geheime Länder je Spiel
const TRIES = 10;     // Versuche je Land: 10 Punkte für den ersten, 1 für den zehnten
const FAR = 6000;     // ist kein Tipp näher als so viele Kilometer, zeigt die Kamera die ganze Welt
const RIM = 400;      // Suchgebiet mindestens so weit (km) um einen Tipp – bei einem Nachbarland sieht man so die Länder ringsum

// Hitzestufen: 5 = Nachbarland, dann unter 300, 800, 1800 und 4000 km
const WORDS = ['kalt', 'kühl', 'lauwarm', 'warm', 'heiß', 'glühend heiß'];
const heatOf = (km, nb) => (nb ? 5 : km < 300 ? 4 : km < 800 ? 3 : km < 1800 ? 2 : km < 4000 ? 1 : 0);

// Ferne Landesteile, über die zwei Länder aneinandergrenzen (Namen wie bei extrasOf). Liegt er beim Tipp selbst
// (Frankreich → Brasilien), gehört er mit ins Suchgebiet – sonst läge das gesuchte Land außerhalb des Rahmens.
const VIA_BOX = { 'Französisch-Guayana': [-54.7, 2.1, -51.5, 5.9], 'Ceuta und Melilla': [-5.5, 35.2, -2.9, 35.95] };

export default function heiss(api) {
  const { map, C, COUNTRIES, $, esc, fmt, geo, nom, acc, pl, capFirst, emph, sfx } = api;

  // auf zehn Kilometer gerundet; „0 km“ wäre irreführend (Malaysia–Singapur liegen nur wenige Kilometer auseinander)
  const kmText = km => (km < 10 ? 'unter 10 km' : `${fmt(Math.round(km / 10) * 10)} km`);
  const arrowOf = t => (t.dir == null ? '' : geo.ARROWS[t.dir]);
  const distText = t => (t.nb ? 'Nachbar' : kmText(t.km));

  function start(region) {
    const pool = region === 'welt' ? COUNTRIES : COUNTRIES.filter(c => c.regions.includes(region));
    const g = api.begin({ id: 'heiss', key: 'heiss-' + region, region, secrets: api.shuffle(pool).slice(0, ROUNDS).map(c => c.iso), i: 0, total: 0, rows: [] });
    $('#map').classList.add('heatmode');
    $('#view-game').classList.add('hk-card');   // Handy quer: Spielkarte links statt unten (css/games/heiss.css)
    question(g);
  }

  function hud(g) {
    api.hud(g.secrets.map((_, i) => {
      const r = g.rows[i];
      return `<i class="${r ? (!r.found ? 'w' : r.pts >= 7 ? 'r' : 'm') : i === g.i ? 'now' : ''}"></i>`;
    }).join(''), `<span class="long">Land ${Math.min(g.i + 1, ROUNDS)} von ${ROUNDS}</span><span>${g.total} ${g.total === 1 ? 'Punkt' : 'Punkte'}</span>`);
  }

  function question(g) {
    if (!api.alive(g)) return;
    if (g.i >= g.secrets.length) { finish(g); return; }
    const cur = g.cur = { secret: g.secrets[g.i], tips: [], tries: 0, best: null, done: false };
    map.clear();
    hud(g);
    const where = g.region === 'welt' ? '' : `<p class="hk-where">Es liegt in ${esc(api.placeLabel(g.region))}.</p>`;
    api.card(`<div class="hk-head"><h2 class="q-prompt">Welches Land ist gesucht?</h2>${where}</div>
      <p class="hk-state" id="nb-state">Nenne irgendein Land – du erfährst, wie weit du weg bist.</p>
      <ul class="hk-chips" id="hk-chips" hidden></ul>
      ${api.nameFormHtml({ placeholder: 'Land eingeben …' })}
      <div class="below"><button class="chip-btn" type="button" data-gact="hk-giveup">Aufgeben</button><span class="hk-count" id="hk-count"></span></div>`);
    $('#view-game').classList.add('asking');   // Vorschläge dürfen über die Karte hinausragen
    api.arm(g);
    counter(g);
    api.wireNameInput(code => guess(g, code));
    if (!matchMedia('(pointer: coarse)').matches) $('#nb-input').focus({ preventScroll: true });
    // erst die Spielkarte, dann der Ausschnitt – er richtet sich nach ihrer Höhe
    requestAnimationFrame(() => api.alive(g) && g.cur === cur && !cur.tries && map.showRegion(g.region));
  }

  function guess(g, code) {
    const cur = g.cur;
    if (!api.alive(g) || !cur || cur.done || !C.has(code)) return;
    const c = C.get(code);
    const had = cur.tips.find(t => t.code === code);
    if (had) {   // zählt nicht als Versuch
      $('#nb-state').innerHTML = `${esc(capFirst(acc(c)))} hattest du schon.`;
      chips(g, had);
      return;
    }
    cur.tries++;
    if (code === cur.secret) { settle(g, true); reveal(g); return; }
    // Nachbar: gemeinsame Grenze laut Karte, fehlende Grenzen (Botswana–Sambia) und Grenzen über ferne Landesteile
    const via = api.extrasOf(cur.secret).get(code) || null;
    const raw = geo.betweenKm(map, code, cur.secret);
    const nb = raw === 0 || !!via || api.neighborsOf(cur.secret).has(code);
    const tip = { code, km: nb ? 0 : raw, nb, via, dir: geo.direction(map, code, cur.secret), n: cur.tries };
    tip.heat = heatOf(tip.km, nb);
    tip.box = searchBox(tip);
    tip.size = tip.box ? (tip.box[1][0] - tip.box[0][0]) * (tip.box[1][1] - tip.box[0][1]) : Infinity;
    cur.tips.push(tip);
    // der nächste Tipp; bei gleicher Entfernung (mehrere Nachbarn) der mit dem engeren Suchgebiet
    if (!cur.best || tip.km < cur.best.km || (tip.km === cur.best.km && tip.size < cur.best.size)) cur.best = tip;
    map.setCountryClass(code, 'heat-' + tip.heat);
    if (cur.tries >= TRIES) { settle(g, false); reveal(g); return; }
    if (tip.heat >= 4) sfx.hint(); else sfx.select();
    $('#nb-state').innerHTML = feedback(tip);
    chips(g);
    counter(g);
    labels(g);
    // neue Höhe der Spielkarte abwarten, dann das Suchgebiet zeigen
    requestAnimationFrame(() => { if (api.alive(g) && g.cur === cur && !cur.done) frame(g); });
  }

  /** „Peru: 2.340 km entfernt · ↗ Richtung Nordosten – lauwarm“ */
  function feedback(t) {
    const c = C.get(t.code);
    const dir = t.dir == null ? '' : `${geo.ARROWS[t.dir]} Richtung ${geo.WINDS[t.dir]}`;
    const heat = `<span class="hk-heat hk-h${t.heat}">${WORDS[t.heat]}</span>`;
    if (t.nb) return `${capFirst(emph(nom(c), 'b'))} ${pl(c, 'ist', 'sind')} ein Nachbarland${t.via ? ` – über ${esc(t.via)}` : ''}!${dir ? ' ' + dir : ''} – ${heat}`;
    return `<b>${esc(c.name)}</b>: ${kmText(t.km)} entfernt${dir ? ' · ' + dir : ''} – ${heat}`;
  }

  /** Alle Tipps als kleine Schilder, die nächsten zuerst. again: schon genannter Tipp, der kurz aufleuchtet. */
  function chips(g, again = null) {
    const cur = g.cur, list = $('#hk-chips');
    const last = cur.tips[cur.tips.length - 1];
    const sorted = [...cur.tips].sort((a, b) => a.km - b.km || a.n - b.n);
    list.innerHTML = sorted.map(t => `<li class="hk-chip${t === last ? ' is-last' : ''}${t === again ? ' is-again' : ''}">`
      + `<i class="hk-dot hk-h${t.heat}"></i><span class="hk-name">${esc(C.get(t.code).name)}</span>`
      + `<span class="hk-dist">· ${distText(t)}${t.dir == null ? '' : ' ' + arrowOf(t)}</span></li>`).join('');
    list.hidden = !sorted.length;
    // Die Liste scrollt, wenn sie lang wird: oben stehen die nächsten Tipps – nur ein schon genannter wird ins Bild geholt
    const el = again && list.querySelector('.is-again');
    list.scrollTop = el ? el.offsetTop - 2 : 0;
  }

  function counter(g) {
    const el = $('#hk-count'), n = Math.min(g.cur.tries + 1, TRIES);
    el.textContent = `Versuch ${n} von ${TRIES}`;
    el.classList.toggle('is-last', n === TRIES);   // der letzte Versuch fällt auf
  }

  /** Nur der neueste und der bisher nächste Tipp tragen ein Schild – sonst wird die Karte unübersichtlich. */
  function labels(g) {
    const { tips, best } = g.cur, last = tips[tips.length - 1];
    map.clearOverlay();
    for (const t of best === last ? [last] : [best, last]) {
      map.labelCountry(t.code, `${C.get(t.code).name} · ${distText(t)}`, 'hk');
      map.ringFor(map.countryBox(t.code));   // winzige Länder (Monaco, Nauru …): Ring, solange sie auf dem Bildschirm klein sind
    }
    map.overlay.selectAll('g.ring').classed('hk-ring', true);
  }

  // Rahmen des Kernlands, von dem aus gemessen wird – mit Alaska bei den USA, auch wenn die Kamera es sonst ausspart
  const cores = new Map();
  function coreBox(code) {
    if (cores.has(code)) return cores.get(code);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of geo.coreRings(map, code)) {
      for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const box = x0 < x1 ? api.unionBox(map.countryBox(code), [[x0, y0], [x1, y1]]) : map.countryBox(code);
    cores.set(code, box);
    return box;
  }

  /**
   * Suchgebiet eines Tipps: sein Land, auf jeder Seite um die Entfernung erweitert (mindestens RIM). Das gesuchte Land
   * liegt immer darin – die Mitte ist aber der Tipp, nie das Ziel. null: zu weit weg, dann die ganze Welt.
   */
  function searchBox(t) {
    if (t.km > FAR) return null;
    let box = coreBox(t.code);
    if (t.via && VIA_BOX[t.via]) box = api.unionBox(box, map.lonLatBox(VIA_BOX[t.via]));
    const km = Math.max(t.km, RIM);
    const latOf = y => map.projection.invert([W / 2, y])[1];
    const north = Math.min(80, latOf(box[0][1]) + km / 111), south = Math.max(-58, latOf(box[1][1]) - km / 111);
    // ein Längengrad ist zu den Polen hin kürzer: mit der polnächsten Breite rechnen, damit nichts herausfällt
    const lon = km / (111 * Math.cos(Math.min(80, Math.max(Math.abs(north), Math.abs(south))) * Math.PI / 180));
    const west = box[0][0] / W * 360 - 180 - lon, east = box[1][0] / W * 360 - 180 + lon;
    if (east - west >= 340) return null;
    return map.lonLatBox([west, south, east, north]);
  }

  // Jedes Suchgebiet enthält das Ziel; die Kamera nimmt das engste. Meist gehört es zum nächsten Tipp – aber nicht
  // immer: Russland 300 km entfernt sagt weniger als Luxemburg 600 km entfernt.
  function frame(g) {
    const { tips } = g.cur, last = tips[tips.length - 1];
    const box = tips.reduce((a, t) => (t.size < a.size ? t : a)).box;
    if (!box) { map.showRegion('welt'); return; }
    // der neueste Tipp soll auch zu sehen sein – außer der Rahmen würde dafür größer als die Welt
    const both = api.unionBox(box, map.countryBox(last.code));
    map.flyToBox(both[1][0] - both[0][0] <= W ? both : box, { pad: 1.1 });
  }

  /** Land abschließen: gefunden im n-ten Versuch gibt 11 − n Punkte, sonst 0. */
  function settle(g, found) {
    const cur = g.cur;
    cur.done = true;
    const pts = found ? TRIES + 1 - cur.tries : 0;
    g.total += pts;
    g.rows.push({ iso: cur.secret, found, n: cur.tries, pts });
  }

  function reveal(g) {
    const cur = g.cur, row = g.rows[g.rows.length - 1], c = C.get(cur.secret);
    hud(g);
    map.clearOverlay();
    map.setCountryClass(cur.secret, row.found ? 'is-right' : 'is-target');
    map.labelCountry(cur.secret, c.name, row.found ? 'right' : '');
    map.ringsForCountry(cur.secret);
    if (row.found) map.overlay.selectAll('g.ring').classed('right', true);
    if (row.found) sfx.correct(); else sfx.wrong();
    const fact = c.facts?.length ? api.pick(c.facts) : '';
    const last = g.i + 1 >= g.secrets.length;
    api.card(`<div class="result ${row.found ? 'right' : 'wrong'}">${row.found ? `Gefunden: ${esc(nom(c))}!` : 'Nicht gefunden'}<span class="pts">+${row.pts}</span></div>
      <p class="result-detail">${row.found ? (row.n === 1 ? 'Gleich beim ersten Versuch!' : `Im ${row.n}. Versuch.`) : `Gesucht ${pl(c, 'war', 'waren')} ${emph(nom(c), 'b')}.`}</p>
      ${fact ? `<div class="fact"><div class="fact-head">Wusstest du?</div><p class="fact-text">${esc(fact)}</p></div>` : ''}
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächstes Land'}</button></div>`);
    api.arm(g);
    api.focusNext();
    requestAnimationFrame(() => api.alive(g) && g.cur === cur && map.flyToCountry(cur.secret));
  }

  function giveUp(g) {
    const cur = g.cur;
    if (!api.alive(g) || !cur || cur.done) return;
    settle(g, false);
    reveal(g);
  }

  function next(g) {
    if (!api.alive(g) || !g.cur?.done) return;
    g.i++;
    question(g);
  }

  function finish(g) {
    if (!api.alive(g)) return;
    $('#map').classList.remove('heatmode');
    map.clear();
    for (const r of g.rows) map.setCountryClass(r.iso, r.found ? 'is-right' : 'is-target');
    map.showRegion(g.region);
    const details = `<ul class="res-list">${g.rows.map(r => `<li><span>${esc(C.get(r.iso).name)}</span>`
      + `<span class="res-km">${r.found ? `im ${r.n}. Versuch` : 'nicht gefunden'}</span><b>${r.pts}</b></li>`).join('')}</ul>`;
    api.showResult({ g, key: g.key, score: g.total, title: `Heiß &amp; kalt – ${esc(api.placeLabel(g.region))}`, big: g.total, unit: 'von 30 Punkten', details });
  }

  return {
    id: 'heiss',
    name: 'Heiß & kalt',
    badge: 'neu',
    desc: 'Finde das geheime Land – jeder Tipp verrät Entfernung und Richtung.',
    how: [
      'Drei geheime Länder. Nenne irgendein Land: Du erfährst, wie weit es vom gesuchten entfernt ist (von Grenze zu Grenze) und in welcher Richtung das gesuchte liegt.',
      'Die Karte färbt deine Tipps – je röter, desto näher. Nachbarländer des gesuchten Landes werden eigens gemeldet.',
      'Je weniger Versuche, desto mehr Punkte: 10 für den ersten, 1 für den zehnten. Danach wird aufgelöst.',
    ],
    swatch: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fdf0c4"/><path d="M10 0h11l-1 6 4 5-3 6 2 7H9l2-9-3-5z" fill="#f8b25c"/><path d="M21 0h13v24H23l-2-7 3-6-4-5z" fill="#a8172a"/><path d="M10 0L8 10l3 5-2 9M21 0l-1 6 4 5-3 6 2 7" fill="none" stroke="#85766a" stroke-width="1"/></svg>',
    regions: true,
    key: region => 'heiss-' + region,
    unit: n => (n === 1 ? 'Punkt' : 'Punkte'),
    start,
    actions: { 'hk-giveup': g => giveUp(g) },
    next,
    // „Beenden“: ein angefangenes Land (mit Tipp) zählt als nicht gefunden
    finishEarly(g) {
      if (g.cur && !g.cur.done && g.cur.tries) settle(g, false);
      if (!g.rows.length) return false;
      finish(g);
      return true;
    },
    scoreSoFar: g => (g.rows.length ? g.total : null),
    cleanup() {
      $('#map').classList.remove('heatmode');
      $('#view-game').classList.remove('hk-card');
    },
  };
}
