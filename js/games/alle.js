// Minispiel „Alle nennen“: Wie viele Länder eines Kontinents (oder der ganzen Welt) fallen dir ein, bevor die Zeit abläuft?
// Namen werden ohne Vorschläge getippt; jeder richtige zählt sofort und färbt das Land grün. Am Ende sieht man, was gefehlt hat.
import { norm } from '../search.js?v=16';

const MINUTES = { welt: 20, europa: 6, asien: 6, afrika: 7, nordamerika: 3, suedamerika: 2, ozeanien: 2 };
const WAIT_MS = 900;       // so lange ohne weiteres Tippen, wenn der Name noch länger werden kann (Niger → Nigeria)
const STREAK_MS = 10000;   // Treffer in diesem Abstand gelten als Serie: Der Ton steigt
const LIST_MAX = 80;       // so viele fehlende Länder nennt die Ergebnisseite

const compact = s => norm(s).replace(/ /g, '');
// „die Schweiz“, „der Iran“: Ein Artikel vorneweg gehört nicht zum Namen
const bare = s => String(s).replace(/^\s*(der|die|das|den|dem|des)\s+/i, '');

// Damerau-Levenshtein (optimal string alignment) mit Abbruch über max – dieselbe Rechnung wie in search.js
function dist(a, b, max) {
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[m];
}

export default function (api) {
  const { map, sfx, C, COUNTRIES, $, esc, nom, acc, gen, pl, capFirst, alive } = api;
  const items = api.countrySearch.items;   // je Land { id, label, keys: [{ raw, c }] } – keys[0] ist der Hauptname

  const minutes = region => MINUTES[region] || 6;
  const poolOf = region => (region === 'welt' ? COUNTRIES.map(c => c.iso) : api.regionCodes(region));
  const where = region => (region === 'welt' ? 'der Welt' : 'in ' + api.placeLabel(region));

  // Gebiete auf der Karte, die keine Staaten sind (Grönland, Puerto Rico, Westsahara …)
  let areas = null;
  const areasOf = () => (areas ||= map.countryFeatures.filter(f => !C.has(f.properties.c))
    .map(f => ({ code: f.properties.c, s: f.properties.s, name: f.properties.n.replace(/\s*\(.*\)$/, '') })));

  /* ---------- Ablauf ---------- */

  function start(region) {
    const pool = poolOf(region);
    const g = api.begin({ id: 'alle', key: 'alle-' + region, region, pool: new Set(pool), found: new Set(),
      ms: minutes(region) * 60000, streak: 0, lastAt: 0, wait: null, over: false });
    // Die Karte wird nie neu aufgebaut: Das Feld behält den Fokus, die Handytastatur bleibt offen
    api.card(`<div class="g-row all-head">
        <h2 class="q-prompt">Länder ${esc(where(region))}</h2>
        <span class="all-count" id="all-count">${countHtml(g)}</span>
      </div>
      <form class="answer" id="all-form" autocomplete="off">
        <input id="all-input" type="text" placeholder="Land eingeben …" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Land">
        <button class="btn primary ok" type="submit" data-enter disabled>OK</button>
      </form>
      <div class="all-foot">
        <p class="hint all-state" id="all-state">Die Zeit läuft, sobald du tippst.</p>
        <div class="below"><button class="chip-btn" type="button" data-gact="all-done">Mehr fallen mir nicht ein</button></div>
      </div>`);
    api.arm(g);
    wire(g);
    hudAll(g);
    // Farbig ist nur, was man nennen kann: Gebiete wie Grönland oder Puerto Rico werden grau wie der Rest der Welt
    map.dimOutside(pool);
    for (const a of areasOf()) if (a.s && g.pool.has(a.s)) map.setCountryClass(a.code, 'is-out');
    // erst jetzt der Ausschnitt: Er richtet sich nach der Höhe der Spielkarte. Danach bleibt die Kamera stehen.
    map.showRegion(region);
    // noch im Klick auf „Los geht's“ – nur so geht auf dem Handy die Tastatur auf
    $('#all-input').focus({ preventScroll: true });
  }

  function wire(g) {
    const input = $('#all-input'), form = $('#all-form');
    input.addEventListener('input', () => typed(g));
    form.addEventListener('submit', e => { e.preventDefault(); submitted(g); });
    // OK antippen nimmt dem Feld nicht den Fokus – die Tastatur bleibt offen
    form.querySelector('.ok').addEventListener('mousedown', e => e.preventDefault());
    input.addEventListener('focus', () => setTimeout(() => window.scrollTo(0, 0), 60));
    // Am Rechner: Wer nach einem Klick auf die Karte einfach weitertippt, schreibt wieder ins Feld
    g.onKey = e => {
      if (!alive(g) || g.over || e.ctrlKey || e.metaKey || e.altKey || !/^\p{L}$/u.test(e.key)) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      input.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', g.onKey);
  }

  const countHtml = g => `<b>${g.found.size}</b> von ${g.pool.size}`;
  const say = html => { $('#all-state').innerHTML = html; };

  function hudAll(g) {
    const left = g.left ?? g.ms;
    const sec = Math.ceil(left / 1000);
    if (g.left != null && left <= 5000 && sec > 0 && sec !== g.lastTick) { g.lastTick = sec; sfx.tick(); }
    api.hud(`<i class="time${sec <= 10 ? ' low' : ''}" style="width:${(left / g.ms * 100).toFixed(1)}%"></i>`,
      `<span>${g.found.size} von ${g.pool.size}</span><span class="clock">${api.clockText(left)}</span>`);
  }

  /** Die Uhr läuft ab dem ersten Buchstaben. */
  function run(g) {
    if (g.left != null) return;
    api.clock(g, g.ms, () => hudAll(g), () => finish(g));
    say('Die Zeit läuft.');
  }

  function clearField() {
    const input = $('#all-input');
    input.value = '';
    input.classList.remove('chosen', 'all-shake');
    $('#all-form .ok').disabled = true;
  }

  function cancelWait(g) {
    if (!g.wait) return;
    clearTimeout(g.wait.timer);
    g.wait = null;
    $('#all-input').classList.remove('chosen');
  }

  /**
   * Kann der getippte Name noch länger werden? Dann kurz abwarten statt zuzugreifen:
   * ein anderes, noch fehlendes Land des Kontinents (Niger → Nigeria, Guinea → Guinea-Bissau) oder das Land selbst
   * (Belgie → Belgien, Brasil → Brasilien, Antigua → Antigua und Barbuda) – sonst landet der Rest des Namens im leeren Feld.
   * Steht der Hauptname schon da, zählt er sofort; gewartet wird dann nur noch auf eine kurze Endung (Kap Verde → Kapverden),
   * nicht auf „Italienische Republik“.
   */
  function canGrow(g, hit, q) {
    const isLabel = q === hit.keys[0].c;
    return items.some(it => (it === hit || (g.pool.has(it.id) && !g.found.has(it.id)))
      && it.keys.some(k => k.c.length > q.length && k.c.startsWith(q) && (it !== hit || !isLabel || k.c.length - q.length <= 3)));
  }

  function typed(g) {
    if (!alive(g) || g.over) return;
    const input = $('#all-input');
    cancelWait(g);
    input.classList.remove('all-shake');
    $('#all-form .ok').disabled = !input.value.trim();
    if (!input.value.trim()) return;
    run(g);
    const text = bare(input.value);
    const q = compact(text);
    const hit = q && api.countrySearch.exact(text);
    if (!hit) return;
    // kurze Abkürzungen (UK, US, VAE) erst mit Enter – sonst schnappt sich „Uk…“ das Vereinigte Königreich statt der Ukraine
    if (q.length < 4 && q !== hit.keys[0].c) return;
    if (canGrow(g, hit, q)) {
      const timer = setTimeout(() => { if (alive(g) && !g.over && g.wait?.timer === timer) resolve(g, hit); }, WAIT_MS);
      g.wait = { hit, timer };
      input.classList.add('chosen');
      return;
    }
    resolve(g, hit);
  }

  /** Enter oder OK: Was das Tippen offen lässt – Abkürzung, abgewarteter Name, Tippfehler, mehrdeutiger Name. */
  function submitted(g) {
    if (!alive(g) || g.over) return;
    const input = $('#all-input');
    input.focus({ preventScroll: true });
    cancelWait(g);
    const text = bare(input.value);
    const q = compact(text);
    if (!q) return;
    run(g);
    const hit = api.countrySearch.exact(text);
    if (hit) { resolve(g, hit); return; }
    const twins = items.filter(it => it.keys.some(k => k.c === q));
    if (twins.length > 1) { twice(g, twins, q); return; }
    // „Grönland“: kein Tippfehler, sondern kein Staat – das sagen statt „nicht erkannt“
    const area = areasOf().find(a => compact(a.name) === q);
    if (area) {
      g.streak = 0;
      clearField();
      const owner = C.get(area.s);
      say(esc(`${area.name} – ${owner ? `ein Gebiet ${gen(owner)}, ` : ''}kein eigenes Land.`));
      return;
    }
    const near = typo(q);
    if (near.list.length === 1) { resolve(g, near.list[0]); return; }
    if (near.shared) { twice(g, near.list, near.shared); return; }
    g.streak = 0;
    say(esc('Kein Land erkannt – anders schreiben?'));
    input.classList.remove('all-shake');
    void input.offsetWidth;   // Wackeln neu starten
    input.classList.add('all-shake');
  }

  /**
   * Tippfehler: ab 5 Buchstaben einer daneben, ab 9 zwei – es zählt das eine Land, das am nächsten liegt.
   * Nie bloß angefangene Namen („Deut“). Liegen mehrere gleich nah, wird nicht geraten; teilen sie sich
   * dieselbe Schreibweise („Kongo“), sagt shared welche.
   */
  function typo(q) {
    const max = q.length >= 9 ? 2 : q.length >= 5 ? 1 : 0;
    let best = max + 1, list = [];
    if (!max) return { list };
    for (const it of items) {
      let d = max + 1;
      for (const k of it.keys) d = Math.min(d, dist(q, k.c, max));
      if (d < best) { best = d; list = [it]; } else if (d === best && d <= max) list.push(it);
    }
    const shared = list.length > 1 && list[0].keys.find(k => dist(q, k.c, max) === best && list.every(it => it.keys.some(x => x.c === k.c)))?.c;
    return { list, shared };
  }

  /** „Kongo“ gibt es zweimal – nicht raten. Der Text bleibt stehen und lässt sich ergänzen („Kongo-Brazzaville“). */
  function twice(g, list, c) {
    g.streak = 0;
    const raw = list[0].keys.find(k => k.c === c)?.raw || c;
    const names = list.map(it => it.label).sort((a, b) => a.localeCompare(b, 'de'));
    say(esc(`„${raw}“ gibt es ${names.length === 2 ? 'zweimal' : names.length + '-mal'}: ${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}.`));
  }

  /** Ein erkannter Name: zählt, war schon da oder gehört nicht hierher. Falsches kostet nie etwas. */
  function resolve(g, it) {
    cancelWait(g);
    clearField();
    const c = C.get(it.id);
    if (!g.pool.has(it.id)) {
      g.streak = 0;
      sfx.select();
      say(esc(`${capFirst(nom(c))} ${pl(c, 'gehört', 'gehören')} nicht zu ${api.placeLabel(g.region)}.`));
    } else if (g.found.has(it.id)) {
      g.streak = 0;
      sfx.select();
      say(esc(`${capFirst(acc(c))} hast du schon.`));
    } else {
      accept(g, it.id);
    }
  }

  function accept(g, iso) {
    const now = performance.now();
    g.found.add(iso);
    g.streak = now - g.lastAt < STREAK_MS ? g.streak + 1 : 1;
    g.lastAt = now;
    map.setCountryClass(iso, 'is-right');
    sfx.blip(g.streak);
    const name = C.get(iso).name;
    $('#all-count').innerHTML = countHtml(g);
    say(`Zuletzt: <b>${esc(name)}</b>`);
    labelLatest(iso, name);   // nach der Zustandszeile: Sie bestimmt die Höhe der Spielkarte
    hudAll(g);
    if (g.found.size >= g.pool.size) finish(g);
  }

  /**
   * Nur das zuletzt genannte Land beschriften. Unter kleinen Ländern steht das Schild sonst unter der Fläche – die Kamera
   * fliegt hier aber nicht hin, und am unteren Rand verschwände es hinter Spielkarte oder Tastatur (Karibik). Dann darüber.
   */
  function labelLatest(iso, name) {
    map.clearOverlay();
    const box = map.countryBox(iso), t = map.transform;
    const small = Math.max(box[1][0] - box[0][0], box[1][1] - box[0][1]) * t.k < 80;
    const floor = map.vh - (map.getInsets?.().bottom || 0);   // Oberkante der unten angedockten Spielkarte oder der Tastatur
    if (!small || t.applyY(box[1][1]) + 26 < floor) { map.labelCountry(iso, name, 'right'); return; }
    const f = map.countryFeatures.find(f => f.properties.c === iso && f.properties.lx != null);
    const x = f ? map.projection([f.properties.lx, f.properties.ly])[0] : (box[0][0] + box[1][0]) / 2;
    map.labelAt(x, box[0][1] - 14 / t.k, name, 'right');
  }

  /** Ein Name, der gerade noch abgewartet wird (Niger), zählt auch, wenn das Spiel jetzt endet. */
  function settle(g) {
    if (g.wait) resolve(g, g.wait.hit);
  }

  function finish(g) {
    if (!alive(g) || g.over) return;
    settle(g);
    if (!alive(g) || g.over) return;   // der abgewartete Name war der letzte
    g.over = true;
    clearInterval(g.clock);
    map.clearOverlay();
    const missed = [...g.pool].filter(iso => !g.found.has(iso));
    for (const iso of missed) map.setCountryClass(iso, 'is-wrong');
    const n = g.pool.size, score = g.found.size;
    let details;
    if (!missed.length) {
      details = `<p class="lead">Alle ${n} geschafft – noch ${api.clockText(g.left ?? g.ms)} auf der Uhr.</p>`;
      // bei einem neuen Rekord spielt die Ergebnisseite ihre eigene Fanfare
      if (score <= (api.bestOf(null, g.key) ?? 0)) sfx.fanfare(1);
    } else {
      const names = missed.map(iso => C.get(iso).name).sort((a, b) => a.localeCompare(b, 'de'));
      const more = names.length - LIST_MAX;
      details = `<p class="field-label" style="margin-top:14px">${names.length === 1 ? 'Nur dieses Land hat gefehlt' : `Diese haben gefehlt (${names.length})`}</p>
        <p class="name-list">${names.slice(0, LIST_MAX).map(esc).join(', ')}${more > 0 ? ` und ${more} weitere` : ''}</p>
        <p class="hint" style="margin-top:6px">Auf der Karte rot.</p>`;
    }
    api.showResult({ g, key: g.key, score, title: `Alle nennen – ${esc(api.placeLabel(g.region))}`, big: score, unit: `von ${n} Ländern`, details });
  }

  return {
    id: 'alle',
    name: 'Alle nennen',
    badge: 'neu',
    desc: 'Wie viele Länder fallen dir ein, bevor die Zeit abläuft?',
    how: region => [
      `Nenne alle ${poolOf(region).length} Länder ${esc(where(region))} – in beliebiger Reihenfolge. Du hast ${minutes(region)} Minuten.`,
      'Einfach tippen: Sobald ein Name stimmt, zählt er und das Land wird grün. Bei einem kleinen Tippfehler hilft die Enter-Taste.',
      'Die Zeit läuft ab dem ersten Buchstaben. Am Ende siehst du, welche Länder gefehlt haben.',
    ],
    swatch: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><g transform="translate(-.7 0)"><circle cx="25" cy="12" r="7.5" fill="#a9d3ea" stroke="#2a2833" stroke-width="1.2"/><path d="M19.6 9.6l2.4-2.5 3 .4 1 2.6-2 2 .5 3-2.4 1-1.6-2.6z" fill="#1f9d57"/><path d="M27 8.4l2.6.6.9 3-2 2.4-1.6-1.6z" fill="#1f9d57"/><path d="M25.6 16.3l2.6-.7.5 1.6-2.3 1.2z" fill="#f3d29b"/></g><path d="M2.6 6.6l1.8 1.8 3.2-3.6M2.6 12.6l1.8 1.8 3.2-3.6" fill="none" stroke="#1f9d57" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="16.6" width="3.6" height="3.6" fill="none" stroke="#2a2833" stroke-width="1"/><path d="M10 7h5.5M10 13h5.5M10 18.4h5.5" stroke="#2a2833" stroke-width="1.4"/></svg>',
    regions: true,
    key: region => 'alle-' + region,
    unit: n => (n === 1 ? 'Land' : 'Länder'),
    start,
    actions: { 'all-done': g => finish(g) },
    finishEarly(g) {
      settle(g);
      if (!alive(g)) return true;   // der abgewartete Name war der letzte: Das Ergebnis steht schon da
      if (!g.found.size) return false;
      finish(g);
      return true;
    },
    scoreSoFar: g => g.found.size + (g.wait && g.pool.has(g.wait.hit.id) && !g.found.has(g.wait.hit.id) ? 1 : 0) || null,
    cleanup(g) {
      g.over = true;
      if (g.wait) { clearTimeout(g.wait.timer); g.wait = null; }
      if (g.onKey) document.removeEventListener('keydown', g.onKey);
    },
  };
}
