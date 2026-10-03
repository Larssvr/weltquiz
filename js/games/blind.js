// Minispiel „Ohne Grenzen“: Die Karte zeigt nur Land und Meer. Wo liegt das Land? Punkt setzen, bestätigen – dann wird
// aufgedeckt. Bedienung wie beim Städte-Pin (js/games.js), Stile in css/games/blind.css (Klasse blind an #map).
import { W, REGION_BOX } from '../map.js?v=15';

const FULL = 25;     // bis so viele km neben der Grenze volle Punkte – trifft auch Inselstaaten, die man kaum sieht
const DECAY = 600;   // danach weniger: 600 km daneben gibt noch rund ein Drittel

export default function (api) {
  const { map, C, COUNTRIES, $, esc, nom, inDat, pl, capFirst, emph, unionBox, fmt, sfx, geo } = api;

  const points = km => (km == null ? 0 : km <= FULL ? 1000 : Math.round(1000 * Math.exp(-(km - FULL) / DECAY)));
  const zuDat = c => inDat(c).replace(/^im /, 'zum ').replace(/^in der /, 'zur ').replace(/^in /, 'zu ');   // „zum Vereinigten Königreich“
  // fett nur der Name – auch hinter Präposition und Artikel („in der <b>Zentralafrikanischen Republik</b>“)
  const bold = phrase => {
    const [, pre, name] = phrase.match(/^((?:in |im |zu |zum |zur )?(?:der |die |das |dem |den |des )?)(.+)$/);
    return `${pre}<b>${esc(name)}</b>`;
  };
  // Französisch-Guayana ist auf der Karte ein Teil Frankreichs
  const inGuiana = ([lon, lat]) => lon > -55 && lon < -51 && lat > 1.5 && lat < 6.5;

  /**
   * Was auf einem Kontinent farbig bleibt: seine Länder – und was mitten in ihm liegt, ohne zu einem seiner Staaten zu
   * gehören. Grau abgesetzt verrieten Westsahara und Bir Tawil die Grenzen ihrer Nachbarn, die britischen Basen auf Zypern
   * die Lage Zyperns und Französisch-Guayana (eine Fläche mit Frankreich) die Grenzen von Suriname und Brasilien.
   */
  function shownCodes(region) {
    const keep = new Set(api.regionCodes(region));
    for (const [code, nb] of map.neighborGraph()) {
      if (!C.has(code) && [...nb].some(n => keep.has(n))) keep.add(code);
    }
    if (region === 'suedamerika') keep.add('FR');
    return [...keep];
  }

  function setBlind(on) {
    const el = $('#map');
    el.classList.toggle('blind', on);
    el.classList.toggle('bl-reveal', !on);
  }

  /** Karte des Spiels: die Region, alles andere grau. */
  function regionView(g) {
    map.clear();
    if (g.shown) map.dimOutside(g.shown);
  }

  function start(region) {
    const pool = region === 'welt' ? COUNTRIES.map(c => c.iso) : api.regionCodes(region);
    const g = api.begin({
      id: 'blind', key: 'blind-' + region, region, shown: region === 'welt' ? null : shownCodes(region),
      targets: api.shuffle(pool).slice(0, 5), i: 0, total: 0, results: [], answered: -1, guess: null,
    });
    question(g);
  }

  function hud(g) {
    const segs = g.targets.map((_, i) => {
      const r = g.results[i];
      return `<i class="${r ? (r.pts >= 700 ? 'r' : r.pts >= 250 ? 'm' : 'w') : i === g.i ? 'now' : ''}"></i>`;
    }).join('');
    api.hud(segs, `<span class="long">Land ${Math.min(g.i + 1, 5)} von 5</span><span>${fmt(g.total)} Punkte</span>`);
  }

  function question(g) {
    if (!api.alive(g)) return;
    const c = C.get(g.targets[g.i]);
    g.guess = null;
    // erst die Karte des Spiels zeigen, dann den Ausschnitt wählen – er richtet sich nach ihrer Höhe
    api.card(`<div class="q-head"><h2 class="q-prompt">Wo ${pl(c, 'liegt', 'liegen')} ${emph(nom(c))}?</h2></div>
      <p class="hint" id="bl-state">Tippe auf die Karte, wo du das Land vermutest. Zum genauen Zielen heranzoomen.</p>
      <div class="below">
        <button class="chip-btn" type="button" data-gact="bl-skip">Keine Ahnung</button>
        <button class="btn primary ok" type="button" data-gact="bl-ok" data-enter disabled>OK</button>
      </div>`);
    api.arm(g);
    hud(g);
    // alles in einem Zug: Zwischen zwei Fragen darf kein Bild mit Grenzen zu sehen sein
    regionView(g);
    setBlind(true);
    map.showRegion(g.region);
    map.hitOptions = null;
    map.onClick = (hit, e, xy) => place(g, xy);
    api.pickable(true);
  }

  function place(g, xy) {
    if (!api.alive(g) || g.answered === g.i || !xy) return;
    const ll = map.lonLatAt(xy);
    if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
    g.guess = ll;
    map.guessPin(ll[0], ll[1]);
    sfx.select();
    const state = $('#bl-state'), ok = $('[data-gact="bl-ok"]');
    if (state) state.textContent = 'Gesetzt. Passt? Dann OK – oder tippe woanders hin.';
    if (ok) ok.disabled = false;
  }

  /** Wo ist der Punkt gelandet? Ein Satz für die Auflösung. */
  function landing(c, guess, km) {
    const name = bold(nom(c));
    if (!guess) return `${capFirst(name)} ${pl(c, 'liegt', 'liegen')} hier.`;
    const p = map.projection(guess);
    const hit = map.hitTest(((p[0] % W) + W) % W, p[1], 0, { water: false });
    if (hit?.code === c.iso) return `Genau – hier ${pl(c, 'liegt', 'liegen')} ${name}.`;
    // knapp daneben zählt voll – das soll man auch erfahren
    const near = text => `Dein Punkt liegt knapp ${text} – bis ${FULL} km zählt das voll.`;
    if (!hit) return km <= FULL ? near('vor der Küste') : 'Dein Punkt liegt im Wasser.';
    const other = C.get(hit.code);
    if (other) {
      // „in Frankreich“ verwirrte mitten in Südamerika
      const guiana = hit.code === 'FR' && inGuiana(guess);
      const there = bold(guiana ? 'in Französisch-Guayana' : inDat(other));
      if (km <= FULL) return near(`hinter der Grenze, ${there}`);
      return `Dein Punkt liegt ${there}${guiana ? ' – das gehört zu Frankreich' : ''}.`;
    }
    // Gebiet, das kein eigenes Land im Quiz ist: Grönland, Westsahara, Antarktika …
    const n = api.nameOf(hit.code, hit.props);
    if (km <= FULL) return near(`hinter der Grenze, hier: <b>${esc(n)}</b>`);
    const owner = C.get(hit.props?.s);
    return `Dein Punkt liegt hier: <b>${esc(n)}</b>${owner && !n.includes('(') ? ` – gehört ${zuDat(owner)}` : ''}.`;
  }

  /**
   * Wo map.labelCountry den Namen eines Landes hinsetzt – bei Zoom k, in Karteneinheiten: an seinen Labelpunkt, bei
   * kleinen Ländern unter das Land. w und h: ungefähre Größe des Schilds in Pixeln.
   */
  function namePlace(iso, k) {
    const f = map.countryFeatures.find(f => f.properties.c === iso && f.properties.lx != null);
    const b = map.countryBox(iso);
    let [x, y] = f ? map.projection([f.properties.lx, f.properties.ly]) : [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
    const small = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) * k < 80;
    if (small) y = b[1][1] + 14 / k;
    return { x, y, b, small, w: C.get(iso).name.length * 9 + 10, h: 20 };
  }

  // Abstand zweier Punkte der Karte in Pixeln bei Zoom k (waagerecht über den kurzen Weg)
  const gapPx = (a, b, k) => [Math.abs(a.x - b.x - Math.round((a.x - b.x) / W) * W) * k, Math.abs(a.y - b.y) * k];

  /** Name des Ziellands, wenn die Kamera steht – an seinem gewohnten Platz, aber nie über dem eigenen Punkt. */
  function nameLabel(c, guess, km, ringed) {
    const k = map.transform.k, gap = ringed ? 32 : 22;   // mit Ring weiter weg, sonst steht der Name im Ring
    if (!guess) { map.labelCountry(c.iso, c.name, 'right'); return; }
    const [x, y] = map.projection(guess);
    // Treffer: Der Punkt sitzt mitten im Land, genau dort, wo der Name stünde – der Name kommt unter den Punkt
    if (km === 0 || (km <= FULL && ringed)) { map.labelAt(x, y + (gap + 2) / k, c.name, 'right'); return; }
    const p = namePlace(c.iso, k);
    const [dx, dy] = gapPx({ x, y }, p, k);
    if (dx < p.w / 2 + 12 && dy < p.h / 2 + 12) {
      // der Punkt säße auf dem Namen: kleines Land – Name darüber, großes – Name neben den Punkt, vom Punkt weg
      if (p.small) map.labelAt((p.b[0][0] + p.b[1][0]) / 2, p.b[0][1] - gap / k, c.name, 'right');
      else map.labelAt(x + Math.sign(p.x - x - Math.round((p.x - x) / W) * W || -1) * (p.w / 2 + 14) / k, y, c.name, 'right');
      return;
    }
    map.labelCountry(c.iso, c.name, 'right');
  }

  /** Namen auf der Ergebniskarte: Stoßen zwei Schilder zusammen, rückt das untere über sein Land oder darunter. */
  function resultLabels(g) {
    // Zoom, den die Ergebnisseite gleich einnimmt (map.showRegion in den freien Bereich neben dem Panel)
    const rect = map.freeRect(), [[x0, y0], [x1, y1]] = map.lonLatBox(REGION_BOX[g.region]);
    const k = Math.max(map.kMin, Math.min(40, (rect.x1 - rect.x0) / ((x1 - x0) * 1.02), (rect.y1 - rect.y0) / ((y1 - y0) * 1.02)));
    const placed = [];
    const clash = q => placed.some(o => { const [dx, dy] = gapPx(q, o, k); return dx < (q.w + o.w) / 2 + 4 && dy < (q.h + o.h) / 2 + 1; });
    const items = g.results.map(r => ({ iso: r.iso, p: namePlace(r.iso, k) })).sort((a, b) => a.p.y - b.p.y);
    for (const { iso, p } of items) {
      const step = (p.h + 3) / k;
      const tries = [p, { ...p, y: p.small ? p.b[0][1] - 14 / k : p.y - step }, ...[1, 2, 3].map(n => ({ ...p, y: p.y + n * step }))];
      const q = tries.find(t => !clash(t)) || p;
      placed.push(q);
      if (q === p) map.labelCountry(iso, C.get(iso).name, 'right');   // rückt beim Zoomen selbst zurecht
      else map.labelAt(q.x, q.y, C.get(iso).name, 'right');
    }
  }

  function answer(g, skipped = false) {
    if (!api.alive(g) || g.answered === g.i || (!skipped && !g.guess)) return;
    g.answered = g.i;
    const i = g.i, iso = g.targets[i], c = C.get(iso);
    const guess = skipped ? null : g.guess;
    const { km: exact, nearest } = guess ? geo.toCountryKm(map, guess, iso) : { km: null, nearest: null };
    // gerundet wie in der Anzeige – sonst stünde „25 km daneben“ neben vollen Punkten
    const km = exact == null ? null : Math.round(exact);
    const pts = points(km);
    const full = km != null && km <= FULL;
    g.total += pts;
    g.results.push({ iso, km, pts, full });
    api.pickable(false);
    hud(g);
    if (pts >= 700) sfx.correct(); else if (pts >= 250) sfx.hint(); else sfx.wrong();

    // aufdecken: Farben und Grenzen kommen zurück, das Land wird grün
    if (skipped) map.clearOverlay();   // ein gesetzter, aber nicht bestätigter Punkt zählt nicht
    setBlind(false);
    map.setCountryClass(iso, 'is-right');
    let box = map.countryBox(iso), mid = null;
    if (guess) {
      const a = map.projection(guess);
      box = unionBox(box, [a, a]);
      if (!full && nearest) {
        // Strecke zum nächsten Punkt der Grenze, auf dem kurzen Weg (auch über die Datumsgrenze)
        map.line(guess, nearest);
        const t = map.projection(nearest);
        box = unionBox(box, [t, t]);
        let bx = t[0];
        while (bx - a[0] > W / 2) bx -= W;
        while (a[0] - bx > W / 2) bx += W;
        mid = { x: (a[0] + bx) / 2, y: (a[1] + t[1]) / 2, len: Math.hypot(a[0] - bx, a[1] - t[1]) };
      }
    }
    requestAnimationFrame(() => {
      if (!api.alive(g)) return;
      const flight = guess ? map.flyToBox(box, { pad: 1.5, minSize: 30 }) : map.flyToCountry(iso);
      flight.then(() => {
        if (!api.alive(g) || g.i !== i) return;
        const k = map.transform.k;
        const tiny = map.shownArea(iso) * k * k < 150;   // Insel- und Zwergstaaten, die man so kaum sieht
        nameLabel(c, guess, km, tiny);
        // Entfernung an die Strecke – erst wenn die Kamera steht, und nur wenn das Schild die Strecke nicht ganz verdeckt
        if (mid && mid.len * k >= 120) map.labelAt(mid.x, mid.y, `${fmt(km)} km`, 'dist');
        if (tiny) map.ringsForCountry(iso);   // Ringe zeigen, wo sie liegen
        const dot = $('#map .overlay .guess');
        dot?.parentNode.appendChild(dot);   // der eigene Punkt bleibt immer sichtbar
      });
    });

    const verdict = km == null ? 'Kein Tipp – 0 Punkte.' : full ? 'Volltreffer!' : `${fmt(km)} km daneben`;
    const last = i + 1 >= g.targets.length;
    api.card(`<div class="result ${pts >= 700 ? 'right' : pts >= 250 ? 'mid' : 'wrong'}">${verdict}<span class="pts">+${fmt(pts)}</span></div>
      <p class="result-detail">${landing(c, guess, km)}</p>
      <div class="next-row"><button class="btn primary" type="button" data-gact="next">${last ? 'Zum Ergebnis' : 'Nächstes Land'}</button></div>`);
    api.arm(g);
    api.focusNext();
  }

  function next(g) {
    if (!api.alive(g) || g.answered !== g.i) return;
    g.i++;
    if (g.i >= g.targets.length) finish(g); else question(g);
  }

  function finish(g) {
    if (!api.alive(g)) return;
    api.pickable(false);
    setBlind(false);
    // alle Länder auf einer Karte
    regionView(g);
    for (const r of g.results) map.setCountryClass(r.iso, 'is-right');
    map.showRegion(g.region);
    const rows = g.results.map(r => `<li><span>${esc(C.get(r.iso).name)}</span><span class="res-km">${r.km == null ? 'kein Tipp' : r.full ? 'Volltreffer' : fmt(r.km) + ' km'}</span><b>${fmt(r.pts)}</b></li>`).join('');
    api.showResult({
      g, key: g.key, score: g.total, title: `Ohne Grenzen – ${esc(api.placeLabel(g.region))}`, big: fmt(g.total), unit: 'von 5.000 Punkten',
      details: `<ul class="res-list">${rows}</ul>`,
    });
    resultLabels(g);   // erst jetzt steht das Panel – der Zoom der Ergebniskarte hängt davon ab
  }

  return {
    id: 'blind', name: 'Ohne Grenzen', badge: 'neu',
    desc: 'Die Karte zeigt keine Grenzen mehr. Wo liegt das Land?',
    how: () => [
      'Fünf Länder. Die Karte zeigt nur noch Land und Meer – keine Grenzen, keine Farben.',
      'Setz deinen Punkt dorthin, wo das Land liegt, und bestätige mit OK. Heranzoomen hilft beim Zielen.',
      'Liegt dein Punkt im Land, gibt es 1000 Punkte. Daneben zählt die Entfernung bis zur Grenze. Rekorde gibt es je Region.',
    ],
    swatch: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#a9d3ea"/><path d="M-1 5l6-2 5 2 4-2.5 5 1.5 2.5 3.5-2 3 3.5 2.5 5-1.5 4 2.5 3 1V25H-1z" fill="#ecdcb4" stroke="#5f9ec4" stroke-width=".9" stroke-linejoin="round"/><path d="M27 4.5l2.5-1 2 1.5-1.5 2-2.5-.5z" fill="#ecdcb4" stroke="#5f9ec4" stroke-width=".8" stroke-linejoin="round"/><circle cx="12" cy="14" r="2.7" fill="#2a2833" stroke="#fff" stroke-width="1.3"/></svg>',
    regions: true,
    key: region => 'blind-' + region,
    unit: () => 'Punkte',
    start,
    actions: {
      'bl-ok': g => answer(g),
      'bl-skip': g => answer(g, true),
    },
    next,
    finishEarly(g) {
      if (!g.results.length) return false;
      finish(g);
      return true;
    },
    scoreSoFar: g => (g.results.length ? g.total : null),
    // läuft bei jedem Spielende: Die App darf nie mit blinder Karte zurückbleiben
    cleanup() {
      $('#map').classList.remove('blind', 'bl-reveal');
    },
  };
}
