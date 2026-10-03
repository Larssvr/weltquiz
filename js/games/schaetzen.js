// Minispiel „Schätz mal“: Einwohner, Fläche und Entfernungen mit einem Regler schätzen.
// Bei Einwohnern und Fläche zählt der Faktor, um den man danebenliegt – so bekommt man ein Gefühl für Größenordnungen.
import { W } from '../map.js?v=19';

const STEPS = 1000;   // Auflösung des Reglers
const NUDGE = 5;      // „weniger“ und „mehr“: mindestens so viele Reglerschritte

// Einwohner und Fläche logarithmisch (jede Zehnerpotenz gleich breit), Entfernung linear
const SCALE = {
  pop: { min: 1e4, max: 2e9, log: true },
  area: { min: 100, max: 2e7, log: true },
  dist: { min: 0, max: 20000, log: false },
};

export default function (api) {
  const { map, C, COUNTRIES, NUMBERS, $, esc, fmt, nom, inDat, pl, capFirst, emph, shuffle, pick, hud, card, alive, arm, sfx, geo, areaText } = api;

  /* ---------- Zahlen ---------- */

  // So, wie man es sagt: „34 Mio.“, „1,3 Mrd.“, „450.000“ – api.popText schriebe „1,30 Mrd.“ und „1,0 Mio.“.
  // Zahl und Einheit geschützt verbunden, damit „km.“ nicht allein in der nächsten Zeile steht.
  const NB = '\u00a0';
  const num = (n, d) => n.toLocaleString('de-DE', { maximumFractionDigits: d });
  const popText = n => (n >= 9.995e8 ? `${num(n / 1e9, 2)}${NB}Mrd.` : n >= 1e6 ? `${num(n / 1e6, n >= 1e7 ? 0 : 1)}${NB}Mio.` : fmt(n));
  const km2Text = n => areaText(n).replace(' ', NB);
  const kmText = n => `${fmt(n)}${NB}km`;
  const valueText = (kind, n) => (kind === 'pop' ? popText(n) : kind === 'area' ? km2Text(n) : kmText(n));
  const sig2 = n => { const f = 10 ** (Math.floor(Math.log10(n)) - 1); return Math.round(n / f) * f; };   // 34.271.000 → 34.000.000
  // „3,6-mal“, „4-mal“, „27-mal“, „1.700-mal“: unter 10 mit einer Nachkommastelle, darüber zwei gültige Ziffern
  const times = r => (r < 9.95 ? num(r, 1) : fmt(sig2(r)));
  const km10 = t => Math.round(t / 10) * 10;   // wahre Entfernung, wie sie im Text steht

  /** Reglerstellung → Schätzung, gerundet wie angezeigt: Gezeigt, gewertet und im Ergebnis genannt wird dieselbe Zahl. */
  function valueAt(kind, v) {
    const s = SCALE[kind];
    if (!s.log) return Math.round(s.max * v / STEPS / 50) * 50;
    return sig2(s.min * (s.max / s.min) ** (v / STEPS));
  }

  /** Lage einer Zahl auf dem Regler (0 bis 1). */
  function posOf(kind, n) {
    const s = SCALE[kind];
    const p = s.log ? Math.log(n / s.min) / Math.log(s.max / s.min) : n / s.max;
    return Math.min(1, Math.max(0, p));
  }

  function points(kind, g, t) {
    if (kind === 'dist') {
      const e = Math.abs(g - t), tol = Math.max(100, 0.03 * t);
      return e <= tol ? 1000 : Math.round(1000 * Math.max(0, 1 - (e - tol) / (0.5 * t + 400)));
    }
    const r = Math.max(g / t, t / g);
    return r <= 1.1 ? 1000 : Math.round(1000 * Math.max(0, 1 - Math.log(r / 1.1) / Math.log(4)));
  }

  /* ---------- Fragen ---------- */

  const pool = kind => COUNTRIES.filter(c => c.iso !== 'DE' && NUMBERS[c.iso]?.[kind] >= (kind === 'pop' ? 50000 : 300));
  const capKm = (a, b) => geo.km([a.capital.lon, a.capital.lat], [b.capital.lon, b.capital.lat]);

  // Zwei Hauptstädte 300 bis 18.000 km auseinander – in etwa jedem zweiten Spiel ab Berlin
  function distQuestion() {
    const others = COUNTRIES.filter(c => c.iso !== 'DE' && c.capital?.lat != null);
    const fromBerlin = Math.random() < 0.5;
    for (let tries = 0; tries < 300; tries++) {
      const a = fromBerlin ? C.get('DE') : pick(others), b = pick(others);
      const t = a === b ? 0 : capKm(a, b);
      if (t >= 300 && t <= 18000) return { kind: 'dist', a, b, t };
    }
    const a = C.get('DE'), b = C.get('PE');
    return { kind: 'dist', a, b, t: capKm(a, b) };
  }

  // Zweimal Einwohner, zweimal Fläche, einmal Entfernung, gemischt – jedes Land kommt nur einmal vor
  function questions() {
    const d = distQuestion();
    const used = new Set([d.a.iso, d.b.iso]);
    const qs = [d];
    for (const kind of ['pop', 'pop', 'area', 'area']) {
      const c = pick(pool(kind).filter(x => !used.has(x.iso)));
      used.add(c.iso);
      qs.push({ kind, c, t: NUMBERS[c.iso][kind] });
    }
    return shuffle(qs);
  }

  /* ---------- Texte ---------- */

  // Nur den Namen hervorheben, nicht Präposition und Artikel: „in der <em>Schweiz</em>“
  const em = phrase => { const m = phrase.match(/^(in|im) (.+)$/); return m ? `${m[1]} ${emph(m[2])}` : emph(phrase); };

  function promptHtml(q) {
    if (q.kind === 'pop') return `Wie viele Menschen leben ${em(inDat(q.c))}?`;
    if (q.kind === 'area') return `Wie groß ${pl(q.c, 'ist', 'sind')} ${emph(nom(q.c))}?`;
    return `Wie weit ist es von <em>${esc(q.a.capital.name)}</em> nach <em>${esc(q.b.capital.name)}</em>?`;
  }

  function reference(kind) {
    if (kind === 'pop') return `Zum Vergleich: In Deutschland leben ${popText(NUMBERS.DE.pop)} Menschen.`;
    if (kind === 'area') return `Zum Vergleich: Deutschland ist ${km2Text(NUMBERS.DE.area)} groß.`;
    return `Zum Vergleich: Von Hamburg nach München sind es rund ${kmText(610)} Luftlinie.`;
  }

  function verdict(q, g, pts) {
    if (pts >= 1000) return 'Volltreffer!';
    if (q.kind === 'dist') {
      // mit der Entfernung, die im Text steht – dann geht die Rechnung für den Spieler auf
      const t = km10(q.t);
      return `${kmText(Math.abs(g - t))} ${g > t ? 'zu weit' : 'zu kurz'}`;
    }
    const high = g > q.t, r = high ? g / q.t : q.t / g;
    const how = high ? 'zu hoch' : 'zu niedrig';
    if (r < 1.5) return `${Math.round(high ? (g / q.t - 1) * 100 : (1 - g / q.t) * 100)}${NB}% ${how}`;
    return `${times(r)}-mal ${how}`;
  }

  function detailHtml(q, g) {
    let s;
    if (q.kind === 'pop') s = `${esc(capFirst(inDat(q.c)))} leben rund <b>${esc(popText(q.t))}</b> Menschen – du hast ${esc(popText(g))} geschätzt.`;
    else if (q.kind === 'area') s = `${esc(capFirst(nom(q.c)))} ${pl(q.c, 'ist', 'sind')} <b>${esc(km2Text(q.t))}</b> groß – deine Schätzung: ${esc(km2Text(g))}.`;
    else s = `Von ${esc(q.a.capital.name)} nach ${esc(q.b.capital.name)} sind es <b>${kmText(km10(q.t))}</b> Luftlinie – deine Schätzung: ${kmText(g)}.`;
    return s.replace(/\.\.$/, '.');   // „… 53 Mio.“ am Satzende nicht doppelt punkten
  }

  // Vergleich mit Deutschland, erst ab 15 % Unterschied
  function compareNote(q) {
    if (q.kind === 'dist') return '';
    const de = NUMBERS.DE[q.kind];
    const r = Math.max(q.t / de, de / q.t);
    if (r < 1.15) return '';
    const x = times(r);
    if (q.kind === 'area') return q.t > de ? `Das ist rund ${x}-mal so groß wie Deutschland.` : `Deutschland ist rund ${x}-mal so groß.`;
    return q.t > de ? `Das sind rund ${x}-mal so viele wie in Deutschland.` : `In Deutschland leben rund ${x}-mal so viele.`;
  }

  const rowLabel = q => (q.kind === 'dist' ? `${q.a.capital.name} – ${q.b.capital.name}` : `${q.c.name} · ${q.kind === 'pop' ? 'Einwohner' : 'Fläche'}`);

  /* ---------- Spielkarte ---------- */

  /** Regler mit Skalenenden. Nach der Antwort (after) gesperrt, mit Marke für den richtigen Wert und der Abweichung farbig. */
  function scaleHtml(q, after = null) {
    const s = SCALE[q.kind];
    let extra = '', mark = '';
    if (after) {
      const pg = posOf(q.kind, after.guess), pt = posOf(q.kind, q.t);
      extra = ` disabled aria-valuetext="${esc(valueText(q.kind, after.guess))}" style="--a:${Math.min(pg, pt).toFixed(4)};--b:${Math.max(pg, pt).toFixed(4)}"`;
      // Beschriftung an den Enden nach innen, damit sie nicht aus der Karte ragt
      mark = `<span class="est-mark${pt < 0.08 ? ' l' : pt > 0.92 ? ' r' : ''}" style="--p:${pt.toFixed(4)}"><b>richtig</b></span>`;
    }
    return `<div class="est-scale${after ? ` done ${after.cls}` : ''}">
        ${after ? '' : '<output class="est-val" id="est-val" for="est-range" aria-hidden="true"></output>'}
        <div class="est-track">
          <input class="est-range" id="est-range" type="range" min="0" max="${STEPS}" step="1" value="${q.v}" aria-label="Deine Schätzung"${extra}>
          ${mark}
        </div>
        <div class="est-ends" aria-hidden="true"><span>${esc(valueText(q.kind, s.min))}</span><span>${esc(valueText(q.kind, s.max))}</span></div>
      </div>`;
  }

  function hudOf(g) {
    const segs = g.qs.map((_, i) => {
      const r = g.results[i];
      return `<i class="${r ? (r.pts >= 700 ? 'r' : r.pts >= 250 ? 'm' : 'w') : i === g.i ? 'now' : ''}"></i>`;
    }).join('');
    hud(segs, `<span class="long">Frage ${Math.min(g.i + 1, g.qs.length)} von ${g.qs.length}</span><span>${fmt(g.total)} ${g.total === 1 ? 'Punkt' : 'Punkte'}</span>`);
  }

  // Beide Hauptstädte in Karteneinheiten; die zweite auf der Seite der ersten (über die Datumsgrenze der kürzere Weg)
  function capitalsXY(q) {
    const a = map.projection([q.a.capital.lon, q.a.capital.lat]), b = map.projection([q.b.capital.lon, q.b.capital.lat]);
    let bx = b[0];
    while (bx - a[0] > W / 2) bx -= W;
    while (a[0] - bx > W / 2) bx += W;
    return [a, [bx, b[1]]];
  }

  /**
   * Ausschnitt um beide Hauptstädte. Ihre Namen stehen mittig über den Sternen (#map.est-dist): Links und rechts
   * braucht es die halbe Namensbreite als Rand – auf schmalen Bildschirmen etwas mehr als das übliche pad 1.5.
   */
  function distView(q) {
    const [a, b] = capitalsXY(q);
    const box = [[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]];
    const r = map.freeRect();
    const half = Math.max(q.a.capital.name.length, q.b.capital.name.length) * 3.8 + 12;   // px, Barlow Condensed 16 px
    const pad = Math.min(2.4, Math.max(1.5, 1 / Math.max(0.4, 1 - 2 * half / (r.x1 - r.x0))));
    return { box, pad };
  }

  function question(g) {
    if (!alive(g)) return;
    if (g.i >= g.qs.length) { finish(g); return; }
    const q = g.qs[g.i], i = g.i;
    // Startstellung zufällig zwischen 30 und 70 % – sie verrät nichts über die Antwort
    q.v = Math.round(STEPS * (0.3 + 0.4 * Math.random()));
    q.moved = false;
    card(`<h2 class="q-prompt">${promptHtml(q)}</h2>
      ${q.kind === 'dist' ? '<p class="hint est-sub">Luftlinie zwischen den Hauptstädten</p>' : ''}
      ${scaleHtml(q)}
      <p class="hint est-ref">${esc(reference(q.kind))}</p>
      <div class="est-row">
        <button class="chip-btn est-step" type="button" data-gact="est-less">‹ weniger</button>
        <button class="chip-btn est-step" type="button" data-gact="est-more">mehr ›</button>
        <button class="btn primary ok" type="button" data-gact="est-ok" data-enter disabled>OK</button>
      </div>`);
    arm(g);
    hudOf(g);
    wire(g, q);
    if (!matchMedia('(pointer: coarse)').matches) $('#est-range').focus({ preventScroll: true });

    map.clear();
    $('#map').classList.toggle('est-dist', q.kind === 'dist');
    if (q.kind === 'dist') {
      map.pin(q.a.capital.lon, q.a.capital.lat, q.a.capital.name, 'capital');
      map.pin(q.b.capital.lon, q.b.capital.lat, q.b.capital.name, 'capital');
      const { box, pad } = distView(q);
      requestAnimationFrame(() => alive(g) && g.i === i && map.flyToBox(box, { pad, minSize: 40 }));
    } else {
      map.setCountryClass(q.c.iso, 'is-target');
      map.labelCountry(q.c.iso, q.c.name, '');
      requestAnimationFrame(() => alive(g) && g.i === i && map.flyToCountry(q.c.iso));
    }
  }

  function wire(g, q) {
    const range = $('#est-range');
    range.addEventListener('input', () => {
      if (alive(g) && !q.answered) setValue(q, +range.value);
    });
    range.addEventListener('keydown', e => {
      if (!alive(g) || q.answered) return;
      // Enter bestätigt (die allgemeine Enter-Taste übergeht Eingabefelder) – über den Knopf, also mit denselben Sperren
      if (e.key === 'Enter') { e.preventDefault(); $('#view-game [data-gact="est-ok"]')?.click(); return; }
      // Pfeiltasten: jeder Druck ändert die gezeigte Zahl (ein Reglerschritt allein ist oft kleiner als die Rundung)
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (dir) { e.preventDefault(); nudge(g, dir, 1); }
    });
    // „weniger“/„mehr“ per Maus nehmen dem Regler nicht den Fokus – Enter bestätigt danach weiterhin
    for (const b of $('#view-game').querySelectorAll('.est-step')) b.addEventListener('mousedown', e => e.preventDefault());
    showValue(q);
  }

  function setValue(q, v) {
    q.v = v;
    q.moved = true;
    showValue(q);
  }

  function showValue(q) {
    const range = $('#est-range'), out = $('#est-val');
    if (!range || !out) return;
    const t = valueText(q.kind, valueAt(q.kind, q.v));
    if (+range.value !== q.v) range.value = String(q.v);
    out.textContent = t;
    range.setAttribute('aria-valuetext', t);
    $('#view-game [data-gact="est-ok"]').disabled = !q.moved;
    // an den Enden nur abgeblendet, nicht gesperrt: Ein gesperrter Knopf verlöre den Fokus, und Enter würde bestätigen
    $('#view-game [data-gact="est-less"]').setAttribute('aria-disabled', String(q.v <= 0));
    $('#view-game [data-gact="est-more"]').setAttribute('aria-disabled', String(q.v >= STEPS));
  }

  /** Feinschritt: mindestens min Reglerschritte – und so weit, bis sich die gezeigte Zahl ändert. */
  function nudge(g, dir, min = NUDGE) {
    const q = g.qs[g.i];
    if (!alive(g) || !q || q.answered) return;
    const was = valueAt(q.kind, q.v);
    let v = q.v + dir * min;
    while (v > 0 && v < STEPS && valueAt(q.kind, v) === was) v += dir;
    v = Math.max(0, Math.min(STEPS, v));
    if (v !== q.v) setValue(q, v);
  }

  function answer(g) {
    const q = g.qs[g.i];
    if (!alive(g) || !q || q.answered || !q.moved) return;
    q.answered = true;
    const i = g.i;
    const guess = valueAt(q.kind, q.v);
    const pts = points(q.kind, guess, q.t);
    const said = verdict(q, guess, pts);
    const cls = pts >= 700 ? 'right' : pts >= 250 ? 'mid' : 'wrong';
    g.total += pts;
    g.results.push({ label: rowLabel(q), verdict: said.replace(/!$/, ''), pts });
    hudOf(g);
    if (pts >= 700) sfx.correct(); else if (pts >= 250) sfx.hint(); else sfx.wrong();

    q.v = Math.round(STEPS * posOf(q.kind, guess));   // Knopf genau auf die gewertete Zahl
    const note = compareNote(q);
    const last = g.i + 1 >= g.qs.length;
    card(`<div class="result ${cls}">${esc(said)}<span class="pts">+${fmt(pts)}</span></div>
      ${scaleHtml(q, { guess, cls })}
      <p class="result-detail">${detailHtml(q, guess)}</p>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächste Frage'}</button></div>`);
    arm(g);
    api.focusNext();

    if (q.kind === 'dist') {
      const [a, b] = capitalsXY(q);
      map.line([q.a.capital.lon, q.a.capital.lat], [q.b.capital.lon, q.b.capital.lat]);
      map.labelAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, `${fmt(km10(q.t))} km`, 'dist');
    }
    // Die Karte mit der Auflösung ist anders hoch als die Frage: Ausschnitt neu einpassen
    requestAnimationFrame(() => alive(g) && g.i === i && map.refit());
  }

  function finish(g) {
    if (!alive(g)) return;
    map.clear();
    map.showRegion('welt');
    const details = `<ul class="res-list est-res">${g.results.map(r => `<li><span>${esc(r.label)}</span><span class="res-km">${esc(r.verdict)}</span><b>${fmt(r.pts)}</b></li>`).join('')}</ul>`;
    api.showResult({ g, key: 'schaetzen', score: g.total, title: 'Schätz mal', big: fmt(g.total), unit: 'von 5.000 Punkten', details });
  }

  return {
    id: 'schaetzen',
    name: 'Schätz mal',
    badge: 'neu',
    desc: 'Einwohner, Fläche, Entfernung – wer schätzt am besten?',
    how: [
      'Fünf Fragen: Wie viele Menschen leben dort? Wie groß ist das Land? Wie weit ist es von Hauptstadt zu Hauptstadt?',
      'Stell den Regler auf deine Schätzung und bestätige mit OK.',
      'Je näher, desto mehr Punkte – bis zu 1000 pro Frage. Bei Einwohnern und Fläche zählt, um welchen Faktor du danebenliegst.',
    ],
    swatch: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#f5e79b"/><rect x="3" y="12.5" width="28" height="8" fill="#fff" stroke="#2a2833" stroke-width="1.2"/><path d="M7 12.5v3.5M11 12.5v2M15 12.5v3.5M19 12.5v2M23 12.5v3.5M27 12.5v2" stroke="#2a2833" stroke-width="1"/><path d="M19 10.5l-3-5h6z" fill="#d6246e" stroke="#2a2833" stroke-width="1" stroke-linejoin="round"/></svg>',
    key: () => 'schaetzen',
    unit: () => 'Punkte',
    start() {
      const g = api.begin({ id: 'schaetzen', key: 'schaetzen', qs: questions(), i: 0, total: 0, results: [] });
      $('#view-game').classList.add('est-card');   // flache Bildschirme: Spielkarte links (css/games/schaetzen.css)
      question(g);
    },
    actions: {
      'est-ok': g => answer(g),
      'est-less': g => nudge(g, -1),
      'est-more': g => nudge(g, 1),
    },
    next(g) {
      if (!alive(g) || !g.qs[g.i]?.answered) return;
      g.i++;
      question(g);
    },
    finishEarly(g) {
      if (!g.results.length) return false;
      finish(g);
      return true;
    },
    scoreSoFar: g => (g.results.length ? g.total : null),
    cleanup() {
      $('#map').classList.remove('est-dist');
      $('#view-game').classList.remove('est-card');
    },
  };
}
