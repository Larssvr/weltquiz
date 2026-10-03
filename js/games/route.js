// Minispiel „Reiseroute“: Start- und Zielland sind vorgegeben, dazwischen nennt man Land für Land das nächste
// Nachbarland. Der kürzeste Weg bringt die meisten Punkte. Die Karte zeigt die Länder ohne Namen – beschriftet
// sind nur Start, Ziel und was man selbst genannt hat.

const TRIPS = 3;           // Reisen je Spiel
const MAX_MISTAKES = 3;    // so viele falsche Länder, dann ist die Reise vorbei
const MIN_PAIRS = 15;      // so viele Start-Ziel-Paare braucht ein Kontinent, sonst wird er nicht angeboten
const MAX_DIST = 6;        // Start und Ziel liegen höchstens so viele Schritte auseinander

// Gebiete ohne eigenen Staat zwischen zwei Ländern: Wer darüber hinweg springt, soll erfahren, warum es nicht geht
const GAPS = { EH: 'die Westsahara' };

// Rolle eines Landes auf der Karte: Klasse und Art des Namensschilds
const ROLES = {
  start: { cls: 'is-target', label: '' },
  goal: { cls: 'is-goal', label: 'rt-goal' },
  been: { cls: 'is-right', label: 'right' },
  wrong: { cls: 'is-wrong', label: 'wrong' },
  way: { cls: 'is-pick', label: '' },
};
// Wichtigkeit der Schilder, aufsteigend – ganz oben steht immer das zuletzt genannte Land
const LABEL_ORDER = ['wrong', 'been', 'start', 'goal', 'way'];
const SHIFTS = [0, 19, -19, 38, -38];   // so weit darf ein Schild ausweichen, bevor es wegbleibt

const SMALL = new Set(['von', 'vom', 'nach', 'in', 'ins', 'im', 'der', 'die', 'das', 'dem', 'den']);

const SWATCH = '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#a9d3ea"/><path d="M0 9l7-3 6 2 6-3 7 1 8-2v20H0z" fill="#f3d29b"/><path d="M13 8l6-3 7 1 8-2v8l-8 3-6-1-4-3z" fill="#cfe1a9"/><path d="M15 13l6 1 8-3 5-1v14H17z" fill="#f2c0c7"/><path d="M13 8l2 5 2 11M15 13l6 1 8-3 5-1" fill="none" stroke="#85766a" stroke-width="1"/><path d="M5.5 18.5c5-1 7-7 12-7.5s6 0 9.5-4.5" fill="none" stroke="#2a2833" stroke-width="1.2" stroke-dasharray="2.5 2"/><circle cx="5.5" cy="18.5" r="2.4" fill="#d6246e" stroke="#fff" stroke-width="1"/><path d="M27.5 8V1.5" stroke="#2a2833" stroke-width="1.2"/><path d="M27.5 1.5h5l-1.4 1.6 1.4 1.6h-5z" fill="#2a2833"/></svg>';

export default function route(api) {
  const { map, sfx, C, COUNTRIES, CONTINENTS, $, esc, shuffle, nom, acc, inDat, pl, capFirst, unionBox, regionLabel } = api;
  const unit = n => (n === 1 ? 'Punkt' : 'Punkte');

  /* ---------- Landgrenzen als Graph ---------- */

  let net = null;   // { adj: ISO → Set der Nachbarn, dist: ISO → (ISO → Schritte) }
  function graph() {
    if (net) return net;
    const adj = new Map(COUNTRIES.map(c => [c.iso, api.neighborsOf(c.iso)]));
    const dist = new Map();
    for (const c of COUNTRIES) {
      const d = new Map([[c.iso, 0]]);
      const queue = [c.iso];
      for (let i = 0; i < queue.length; i++) {
        for (const n of adj.get(queue[i])) if (!d.has(n)) { d.set(n, d.get(queue[i]) + 1); queue.push(n); }
      }
      dist.set(c.iso, d);
    }
    return (net = { adj, dist });
  }

  // Start-Ziel-Paare einer Region, 3 bis 6 Schritte auseinander – Südamerika ist dafür zu klein, dort ab 2
  const pairCache = new Map();
  function pairsOf(region) {
    if (pairCache.has(region)) return pairCache.get(region);
    const { dist } = graph();
    const ids = COUNTRIES.filter(c => region === 'welt' || c.regions.includes(region)).map(c => c.iso);
    const within = min => {
      const out = [];
      for (let i = 0; i < ids.length; i++) {
        const di = dist.get(ids[i]);
        for (let k = i + 1; k < ids.length; k++) {
          const d = di.get(ids[k]);
          if (d >= min && d <= MAX_DIST) out.push([ids[i], ids[k], d]);
        }
      }
      return out;
    };
    let pairs = within(3);
    if (pairs.length < MIN_PAIRS) pairs = within(2);
    pairCache.set(region, pairs);
    return pairs;
  }

  /** Drei Reisen, kein Land zweimal als Start oder Ziel – die kürzeren zuerst. */
  function pickTrips(region) {
    const pairs = pairsOf(region);
    let best = [];
    for (let tries = 0; tries < 20 && best.length < TRIPS; tries++) {
      const used = new Set(), out = [];
      for (const [a, b, d] of shuffle(pairs)) {
        if (used.has(a) || used.has(b)) continue;
        used.add(a);
        used.add(b);
        out.push(Math.random() < 0.5 ? { s: a, t: b, d } : { s: b, t: a, d });
        if (out.length >= TRIPS) break;
      }
      if (out.length > best.length) best = out;
    }
    return best.sort((x, y) => x.d - y.d);
  }

  /** Ein kürzester Weg von Start zu Ziel – unter allen der mit den meisten schon besuchten Ländern. */
  function shortestWay(j) {
    const { adj, dist } = graph();
    const fromS = dist.get(j.s), toT = dist.get(j.t);
    const been = new Set(j.path);
    const best = new Map([[j.s, 0]]), prev = new Map();
    let layer = [j.s];
    for (let k = 1; k <= j.d; k++) {
      const next = [];
      for (const x of layer) {
        for (const y of adj.get(x)) {
          if (fromS.get(y) !== k || toT.get(y) !== j.d - k) continue;   // liegt nicht auf einem kürzesten Weg
          const v = best.get(x) + (been.has(y) ? 1 : 0);
          if (!best.has(y)) next.push(y);
          if (!best.has(y) || v > best.get(y)) { best.set(y, v); prev.set(y, x); }
        }
      }
      layer = next;
    }
    const way = [j.t];
    for (let k = 0; k < j.d && prev.has(way[0]); k++) way.unshift(prev.get(way[0]));   // höchstens d Schritte zurück
    return way;
  }

  // Gebiet ohne Staat, an das beide grenzen (Marokko – Westsahara – Mauretanien)
  function gapBetween(a, b) {
    const nb = map.neighborGraph();
    for (const x of nb.get(a) || []) if (GAPS[x] && nb.get(b)?.has(x)) return GAPS[x];
    return null;
  }

  /* ---------- Texte ---------- */

  // „von der Schweiz“, „vom Iran“, „von Portugal“ (Dativ wie bei inDat) · „nach Polen“, „in die Schweiz“, „ins Vereinigte Königreich“
  const fromText = c => { const d = inDat(c); return (d.startsWith('im ') ? 'vom ' : 'von ') + d.slice(3); };
  const toText = c => { const a = acc(c); return a === c.name ? 'nach ' + a : a.startsWith('das ') ? 'ins ' + a.slice(4) : 'in ' + a; };
  // nur den Namen hervorheben, nicht Präposition und Artikel
  function emName(phrase) {
    const w = phrase.split(' ');
    let i = 0;
    while (i < w.length - 1 && SMALL.has(w[i])) i++;
    return [...w.slice(0, i), `<em>${esc(w.slice(i).join(' '))}</em>`].join(' ');
  }
  const here = c => `Du bist ${inDat(c)}.`;
  const inSteps = n => (n === 1 ? 'In 1 Schritt' : `In ${n} Schritten`);
  const withErrors = n => (n === 1 ? 'mit 1 Fehler' : `mit ${n} Fehlern`);
  const wayText = way => way.map(code => C.get(code).name).join(' → ');

  /* ---------- Karte ---------- */

  function setRole(j, code, role) {
    const old = j.roles.get(code);
    if (old === role) return;
    if (old) map.setCountryClass(code, ROLES[old].cls, false);
    map.setCountryClass(code, ROLES[role].cls);
    j.roles.set(code, role);
  }

  // Schilder neu setzen, die wichtigen zuletzt (sie liegen oben)
  function labels(j) {
    map.clearOverlay();
    const rank = code => (code === j.focus ? LABEL_ORDER.length : LABEL_ORDER.indexOf(j.roles.get(code)));
    for (const code of [...j.roles.keys()].sort((a, b) => rank(a) - rank(b))) {
      map.labelCountry(code, (code === j.t ? 'Ziel: ' : '') + C.get(code).name, ROLES[j.roles.get(code)].label);
    }
    declutter();
  }

  // Kleine Länder liegen dicht, ihre Schilder stehen unter der Fläche und decken sich leicht gegenseitig zu:
  // Das weniger wichtige rückt eine Zeile nach unten oder oben, sonst bleibt es weg (wie im Entdecken-Modus) –
  // beim Heranzoomen kommt es wieder. Läuft nach jedem Zoomschritt, gleich nachdem die Karte die Schilder gesetzt hat.
  let live = null;
  function declutter() {
    if (!live || !api.alive(live)) return;
    const placed = [];
    const free = map.freeRect();   // ausweichen nur dorthin, wo man es sieht – nicht hinter die Spielkarte
    const items = map.overlayItems.filter(it => it.kind === 'label');
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], node = it.el.node();
      if (!it.rtBox) { const b = node.getBBox(); it.rtBox = [b.x - 4, b.y - 2, b.x + b.width + 4, b.y + b.height + 2]; }
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(node.getAttribute('transform') || '');
      if (!m) continue;
      const x = +m[1], y = +m[2], b = it.rtBox;
      let spot = null;
      for (const dy of SHIFTS) {
        const r = [x + b[0], y + dy + b[1], x + b[2], y + dy + b[3]];
        if (dy && (r[1] < free.y0 || r[3] > free.y1)) continue;
        if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) continue;
        spot = r;
        if (dy) node.setAttribute('transform', `translate(${x},${y + dy})`);
        break;
      }
      node.style.display = spot ? '' : 'none';
      if (spot) placed.push(spot);
    }
  }

  function fly(g, codes) {
    let box = null;
    for (const code of codes) { const b = map.countryBox(code); box = box ? unionBox(box, b) : b; }
    requestAnimationFrame(() => api.alive(g) && map.flyToBox(box, { pad: 1.3, minSize: 30 }));
  }
  const routeCodes = j => [j.s, j.t, ...j.path];

  /* ---------- Ablauf ---------- */

  function hud(g) {
    api.hud(g.trips.map((_, i) => {
      const r = g.rows[i];
      return `<i class="${r ? (r.pts === 10 ? 'r' : r.arrived ? 'm' : 'w') : i === g.i ? 'now' : ''}"></i>`;
    }).join(''), `<span class="long">Reise ${Math.min(g.i + 1, g.trips.length)} von ${g.trips.length}</span><span>${g.total} ${unit(g.total)}</span>`);
  }

  function trip(g) {
    if (!api.alive(g)) return;
    if (g.i >= g.trips.length) { finish(g); return; }
    const { s, t, d } = g.trips[g.i];
    const j = g.j = { s, t, d, cur: s, focus: s, path: [s], steps: 0, mistakes: 0, roles: new Map(), claims: new Set(), done: false };
    map.clear();
    setRole(j, s, 'start');
    setRole(j, t, 'goal');
    labels(j);
    hud(g);
    api.card(`<div class="rt-card"><div class="q-head"><h2 class="q-prompt">${capFirst(emName(fromText(C.get(s))))} ${emName(toText(C.get(t)))}</h2></div>
      <p class="hint rt-state" id="nb-state"></p>
      ${api.nameFormHtml({ placeholder: 'Nächstes Land eingeben …', label: 'Nächstes Land' })}
      <div class="below"><button class="chip-btn" type="button" data-gact="rt-giveup">Aufgeben</button>
        <span class="rt-meta"><span class="rt-steps" id="rt-steps"></span><span class="miss-dots" id="rt-dots"></span></span></div></div>`);
    $('#view-game').classList.add('asking');   // Vorschläge dürfen über die Karte hinausragen
    api.arm(g);
    say(g, `${here(C.get(s))} Welches Nachbarland bringt dich weiter?`);
    api.wireNameInput(code => guess(g, code));
    if (!matchMedia('(pointer: coarse)').matches) $('#nb-input').focus({ preventScroll: true });
    fly(g, [s, t]);
  }

  function say(g, text, bad = false) {
    const j = g.j, el = $('#nb-state');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('bad', bad);
    $('#rt-steps').textContent = `Schritte: ${j.steps}`;
    $('#rt-dots').innerHTML = Array.from({ length: MAX_MISTAKES }, (_, i) => `<i class="${i < j.mistakes ? 'on' : ''}" title="Fehler"></i>`).join('');
  }

  function guess(g, code) {
    const j = g.j;
    if (!api.alive(g) || !j || j.done || !C.has(code)) return;
    const cur = C.get(j.cur), c = C.get(code);
    if (code === j.cur) { say(g, 'Dort bist du gerade.'); return; }
    const via = api.extrasOf(j.cur).get(code);
    if (via) {
      say(g, `Über ${via} ${pl(cur, 'grenzt', 'grenzen')} ${nom(cur)} zwar an ${acc(c)} – für die Reise zählt aber nur das Kernland.`);
      return;
    }
    if (graph().adj.get(j.cur).has(code)) { move(g, code); return; }
    // Dieselbe falsche Behauptung vom selben Land aus kostet nicht noch einmal
    const no = `${capFirst(nom(c))} ${pl(c, 'grenzt', 'grenzen')} nicht an ${acc(cur)}`;
    const claim = j.cur + '>' + code;
    if (j.claims.has(claim)) { say(g, `${no} – das war schon falsch.`, true); return; }
    j.claims.add(claim);
    j.mistakes++;
    j.focus = code;
    sfx.buzz();
    // rot und beschriftet, damit man sieht, wo es liegt (Start, Ziel und Besuchtes sind schon zu sehen)
    if (!j.roles.has(code)) setRole(j, code, 'wrong');
    labels(j);
    const gap = gapBetween(j.cur, code);
    const text = gap ? `${no} – dazwischen liegt ${gap}.` : `${no}.`;
    if (j.mistakes >= MAX_MISTAKES) { endTrip(g, false, `${text} Das war der dritte Fehler.`); return; }
    say(g, text, true);
    fly(g, [...routeCodes(j), code]);
  }

  function move(g, code) {
    const j = g.j;
    j.steps++;
    j.path.push(code);
    j.cur = j.focus = code;
    if (j.roles.get(code) !== 'start') setRole(j, code, 'been');   // auch ein eben noch rotes Land wird grün
    labels(j);
    sfx.blip(j.steps);
    if (code === j.t) { endTrip(g, true); return; }
    say(g, `${here(C.get(code))} Weiter Richtung ${C.get(j.t).name}.`);
    fly(g, routeCodes(j));
  }

  /** Reise werten und abschließen (auch für „Beenden“ mitten in der Reise). */
  function closeTrip(g, arrived) {
    const j = g.j;
    j.done = true;
    const pts = arrived ? Math.max(1, 10 - 2 * (j.steps - j.d) - j.mistakes) : 0;
    g.total += pts;
    g.rows.push({ s: j.s, t: j.t, d: j.d, steps: j.steps, arrived, pts });
    return pts;
  }

  function endTrip(g, arrived, note = '') {
    const j = g.j;
    if (!api.alive(g) || !j || j.done) return;
    const pts = closeTrip(g, arrived);
    const extra = j.steps - j.d;
    let detail;
    if (arrived && !extra) {
      detail = `${inSteps(j.steps)} – kürzer geht es nicht.${j.mistakes ? ` Allerdings ${withErrors(j.mistakes)}.` : ''}`;
    } else {
      // kürzesten Weg zeigen: rosa, was nicht ohnehin grün ist (ein rotes Land auf dem Weg wird rosa)
      const way = shortestWay(j);
      for (const code of way) if (!j.roles.has(code) || j.roles.get(code) === 'wrong') setRole(j, code, 'way');
      labels(j);
      detail = arrived
        ? `${inSteps(j.steps)}${j.mistakes ? `, ${withErrors(j.mistakes)}` : ''}. Der kürzeste Weg hat ${j.d}: ${wayText(way)}.`
        : `${note ? note + ' ' : ''}Ein kürzester Weg: ${wayText(way)}.`;
    }
    hud(g);
    if (!arrived) sfx.wrong(); else if (pts === 10) sfx.correct(); else sfx.select();
    const last = g.i + 1 >= g.trips.length;
    api.card(`<div class="rt-card rt-done"><div class="result ${!arrived ? 'wrong' : pts === 10 ? 'right' : 'mid'}">${arrived ? `Angekommen ${esc(inDat(C.get(j.t)))}!` : 'Nicht angekommen'}<span class="pts">+${pts}</span></div>
      <p class="result-detail">${esc(detail)}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächste Reise'}</button></div></div>`);
    api.arm(g);
    api.focusNext();
    fly(g, [...j.roles.keys()]);
  }

  function finish(g) {
    if (!api.alive(g)) return;
    // Überblick: alle Starts und Ziele dieses Spiels
    map.clear();
    for (const r of g.rows) { map.setCountryClass(r.s, 'is-target'); map.setCountryClass(r.t, 'is-goal'); }
    map.showRegion(g.region);
    const where = g.region !== 'welt' ? ` – ${esc(regionLabel(g.region))}` : '';
    // Reise oben, Schritte darunter: lange Ländernamen brauchen die ganze Breite
    const rows = g.rows.map(r => `<li><span>${esc(C.get(r.s).name)} → ${esc(C.get(r.t).name)}<span class="res-km">${r.arrived
      ? `${r.steps} ${r.steps === 1 ? 'Schritt' : 'Schritte'} (kürzester Weg ${r.d})` : 'nicht angekommen'}</span></span><b>${r.pts}</b></li>`).join('');
    api.showResult({ g, key: g.key, score: g.total, title: `Reiseroute${where}`, big: g.total, unit: `von ${g.trips.length * 10} Punkten`,
      details: `<ul class="res-list rt-res">${rows}</ul>` });
  }

  return {
    id: 'route',
    name: 'Reiseroute',
    badge: 'neu',
    desc: 'Von Land zu Land: Finde den kürzesten Weg über die Grenzen.',
    how: [
      'Drei Reisen: Du startest in einem Land und sollst ein anderes erreichen – nur über Landgrenzen.',
      'Nenne Land für Land dein nächstes Nachbarland, bis du im Ziel ankommst. Tippfehler sind kein Problem.',
      // „Jeder Schritt mehr“ statt „jeder Umweg“: Ein Umweg von drei Schritten kostet auch dreimal
      'Der kürzeste Weg bringt 10 Punkte. Jeder Schritt mehr kostet 2 Punkte, jedes falsche Land 1 Punkt. Nach drei falschen Ländern ist die Reise vorbei.',
    ],
    swatch: SWATCH,
    regions: true,
    // Ozeanien hat keine Landgrenzen zwischen seinen Staaten – es fällt hier von selbst heraus
    regionList: () => [{ id: 'welt', label: regionLabel('welt') }, ...CONTINENTS.filter(r => pairsOf(r.id).length >= MIN_PAIRS)],
    key: region => 'route-' + region,
    unit,
    start(region) {
      if (pairsOf(region).length < MIN_PAIRS) region = 'welt';
      const g = live = api.begin({ id: 'route', key: 'route-' + region, region, trips: pickTrips(region), i: 0, total: 0, rows: [], j: null });
      map.zoom.on('zoom.rt', declutter);
      trip(g);
    },
    actions: {
      'rt-giveup'(g) { if (api.alive(g) && g.j && !g.j.done) endTrip(g, false); },
    },
    next(g) {
      if (!api.alive(g) || !g.j?.done) return;
      g.i++;
      trip(g);
    },
    finishEarly(g) {
      const j = g.j;
      if (j && !j.done && (j.steps || j.mistakes)) closeTrip(g, false);   // angefangene Reise zählt wie aufgegeben
      if (!g.rows.length) return false;
      finish(g);
      return true;
    },
    scoreSoFar: g => (g.rows.length ? g.total : null),
    cleanup() {
      map.zoom.on('zoom.rt', null);
      live = null;
      $('#view-game').classList.remove('asking');
    },
  };
}
