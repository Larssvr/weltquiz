import { WorldMap, REGION_BOX, W } from './map.js?v=4';
import { Searcher } from './search.js?v=4';
import { setupSound, setSoundEnabled, sfx } from './sound.js?v=4';
import { COUNTRIES } from './data/countries.js?v=4';
import { WATER } from './data/water.js?v=4';
import { WORLD_FACTS } from './data/world-facts.js?v=4';
import { CITIES } from './data/cities.js?v=4';

/* ================= Daten ================= */

const C = new Map(COUNTRIES.map(c => [c.iso, c]));
const WB = new Map(WATER.map(w => [w.id, w]));

const REGIONS = [
  { id: 'welt', label: 'Welt' },
  { id: 'europa', label: 'Europa' },
  { id: 'asien', label: 'Asien' },
  { id: 'afrika', label: 'Afrika' },
  { id: 'nordamerika', label: 'Nord- & Mittelamerika' },
  { id: 'suedamerika', label: 'Südamerika' },
  { id: 'ozeanien', label: 'Ozeanien' },
];
const regionLabel = id => REGIONS.find(r => r.id === id)?.label || 'Welt';

const MODES = {
  laender: {
    title: 'Länder erkennen', desc: 'Welches Land ist markiert?',
    variantLabel: 'Wie willst du spielen?',
    variants: [
      { id: 'name', label: 'Land benennen', hint: 'Ein Land ist markiert, du schreibst den Namen.' },
      { id: 'find', label: 'Land finden', hint: 'Du bekommst den Namen und tippst auf die Karte.' },
    ],
    regions: true,
  },
  hauptstaedte: {
    title: 'Hauptstädte', desc: 'Welche Stadt gehört zu welchem Land?',
    variantLabel: 'Wie willst du spielen?',
    variants: [
      { id: 'capital', label: 'Hauptstadt nennen', hint: 'Du siehst das Land und schreibst die Hauptstadt.' },
      { id: 'country', label: 'Land zur Hauptstadt', hint: 'Du siehst die Hauptstadt und schreibst das Land.' },
    ],
    regions: true,
  },
  gewaesser: {
    title: 'Meere, Seen & Ozeane', desc: 'Welches Gewässer ist markiert?',
    variantLabel: 'Welche Gewässer?',
    variants: [
      { id: 'alle', label: 'Alle Gewässer' },
      { id: 'meere', label: 'Ozeane & Meere' },
      { id: 'seen', label: 'Seen' },
    ],
    regions: false,
  },
  flaggen: {
    title: 'Flaggen', desc: 'Zu welchem Land gehört die Flagge?',
    variantLabel: 'Wie willst du spielen?',
    variants: [
      { id: 'flag', label: 'Flagge erkennen', hint: 'Du siehst eine Flagge und schreibst das Land.' },
      { id: 'pick', label: 'Flagge auswählen', hint: 'Du siehst ein Land und wählst aus vier Flaggen.' },
    ],
    regions: true,
  },
};

// Flaggen, die sich zum Verwechseln ähneln – gute Ablenker für „Flagge auswählen“
const FLAG_GROUPS = [
  ['TD', 'RO', 'AD', 'MD'], ['ID', 'MC', 'PL', 'SG'], ['IE', 'CI', 'IT'], ['NL', 'LU', 'HR', 'PY', 'FR', 'RU'],
  ['AU', 'NZ', 'FJ', 'TV'], ['NO', 'IS', 'DK', 'FI', 'SE'], ['SN', 'ML', 'GN', 'CM'], ['RU', 'SK', 'SI', 'RS'],
  ['CO', 'EC', 'VE'], ['NE', 'IN', 'CI'], ['QA', 'BH'], ['AR', 'UY', 'SV', 'NI', 'HN', 'GT'],
  ['JO', 'PS', 'SD', 'KW', 'AE'], ['SY', 'IQ', 'EG', 'YE'], ['HT', 'LI'], ['BE', 'DE'], ['AT', 'LV', 'LB'],
  ['MY', 'US', 'LR'], ['CZ', 'PH', 'SS', 'BS'], ['GH', 'BO', 'ET', 'LT'], ['KP', 'KR'], ['CN', 'VN'],
  ['JP', 'BD', 'PW'], ['CH', 'TO', 'GE'], ['TN', 'TR'], ['PE', 'CA', 'LV'], ['MR', 'PK', 'DZ'], ['GW', 'BF', 'ST'],
  ['BA', 'XK', 'CY'], ['DO', 'DM'], ['CR', 'TH', 'CU'], ['UA', 'KZ', 'PW'], ['BY', 'MG', 'HU', 'BG'],
];

/* ================= Speicher ================= */

const KEY = 'weltquiz.v1';
const state = (() => {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* privat/blockiert */ }
  try {
    const s = JSON.parse(raw);
    if (s && typeof s === 'object' && s.stats) {
      // Sicherheitskopie des zuletzt gültigen Spielstands
      try { localStorage.setItem(KEY + '.backup', raw); } catch { /* voll/blockiert */ }
      return { sound: true, last: {}, factIdx: {}, round: null, player: null, bench: {}, dirty: {}, remote: null, ...s };
    }
  } catch { /* kaputter Eintrag: Sicherheitskopie bleibt unangetastet */ }
  return { stats: {}, sound: true, last: {}, factIdx: {}, round: null, player: null, bench: {}, dirty: {}, remote: null };
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* egal */ } };

function stat(mode, id) { return state.stats[mode]?.[id]; }
function levelIn(stats, mode, id) {
  const s = stats?.[mode]?.[id];
  if (!s || !s.n) return 0;
  if (s.s >= 2) return 3;
  if (s.s === 1) return 2;
  return 1;
}
function level(mode, id) { return levelIn(state.stats, mode, id); }
// Stufen: 0 = noch nie gefragt, 1 = zuletzt falsch, 2 = gewusst (zuletzt richtig), 3 = sicher (zweimal in Folge richtig)
const KNOWN = 2, SURE = 3;
function record(mode, id, ok, hinted) {
  const m = state.stats[mode] ||= {};
  const s = m[id] ||= { n: 0, c: 0, s: 0 };
  s.n++; s.t = Date.now();
  if (ok) { s.c++; if (!hinted) s.s++; } else s.s = 0;
  markDirty(mode, id);
  save();
}

/* ================= Hilfen ================= */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const flagUrl = iso => `flags/${iso.toLowerCase()}.svg`;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ICON_OK = '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="currentColor"/><path d="M8 14.5l4 4 8-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_NO = '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="currentColor"/><path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';

function nameOf(code, props) {
  return C.get(code)?.name || props?.n || code;
}

// Länder, die im Deutschen einen Artikel brauchen: [Nominativ, Dativ, Genitiv, Akkusativ (nur wenn abweichend)]
const ART = {
  TR: ['die Türkei', 'der Türkei', 'der Türkei'], CH: ['die Schweiz', 'der Schweiz', 'der Schweiz'],
  SK: ['die Slowakei', 'der Slowakei', 'der Slowakei'], UA: ['die Ukraine', 'der Ukraine', 'der Ukraine'],
  MN: ['die Mongolei', 'der Mongolei', 'der Mongolei'], CI: ['die Elfenbeinküste', 'der Elfenbeinküste', 'der Elfenbeinküste'],
  CF: ['die Zentralafrikanische Republik', 'der Zentralafrikanischen Republik', 'der Zentralafrikanischen Republik'],
  DO: ['die Dominikanische Republik', 'der Dominikanischen Republik', 'der Dominikanischen Republik'],
  CD: ['die Demokratische Republik Kongo', 'der Demokratischen Republik Kongo', 'der Demokratischen Republik Kongo'],
  CG: ['die Republik Kongo', 'der Republik Kongo', 'der Republik Kongo'], MD: ['die Republik Moldau', 'der Republik Moldau', 'der Republik Moldau'],
  VA: ['die Vatikanstadt', 'der Vatikanstadt', 'der Vatikanstadt'],
  IR: ['der Iran', 'dem Iran', 'des Iran', 'den Iran'], IQ: ['der Irak', 'dem Irak', 'des Irak', 'den Irak'],
  YE: ['der Jemen', 'dem Jemen', 'des Jemen', 'den Jemen'], LB: ['der Libanon', 'dem Libanon', 'des Libanon', 'den Libanon'],
  SD: ['der Sudan', 'dem Sudan', 'des Sudan', 'den Sudan'], SS: ['der Südsudan', 'dem Südsudan', 'des Südsudan', 'den Südsudan'],
  TD: ['der Tschad', 'dem Tschad', 'des Tschad', 'den Tschad'], NE: ['der Niger', 'dem Niger', 'des Niger', 'den Niger'],
  SN: ['der Senegal', 'dem Senegal', 'des Senegal', 'den Senegal'],
  GB: ['das Vereinigte Königreich', 'dem Vereinigten Königreich', 'des Vereinigten Königreichs'],
  US: ['die USA', 'den USA', 'der USA'], NL: ['die Niederlande', 'den Niederlanden', 'der Niederlande'],
  PH: ['die Philippinen', 'den Philippinen', 'der Philippinen'], MV: ['die Malediven', 'den Malediven', 'der Malediven'],
  SC: ['die Seychellen', 'den Seychellen', 'der Seychellen'], KM: ['die Komoren', 'den Komoren', 'der Komoren'],
  SB: ['die Salomonen', 'den Salomonen', 'der Salomonen'], MH: ['die Marshallinseln', 'den Marshallinseln', 'der Marshallinseln'],
  BS: ['die Bahamas', 'den Bahamas', 'der Bahamas'],
  AE: ['die Vereinigten Arabischen Emirate', 'den Vereinigten Arabischen Emiraten', 'der Vereinigten Arabischen Emirate'],
};
const art = (c, i) => c && ART[c.iso]?.[i];
const nom = c => art(c, 0) || c.name;                                  // „die Türkei“, „Deutschland“
const acc = c => art(c, 3) || art(c, 0) || c.name;                     // „den Iran“
const gen = c => art(c, 2) || 'von ' + c.name;                         // Hauptstadt „der Türkei“ / „von Deutschland“
const inDat = c => { const d = art(c, 1); return !d ? 'in ' + c.name : d.startsWith('dem ') ? 'im ' + d.slice(4) : 'in ' + d; };
const zuDat = c => { const d = art(c, 1); return !d ? 'zu ' + c.name : d.startsWith('der ') ? 'zur ' + d.slice(4) : d.startsWith('dem ') ? 'zum ' + d.slice(4) : 'zu ' + d; };
const capFirst = t => t.charAt(0).toUpperCase() + t.slice(1);
const PLURAL = new Set(['US', 'NL', 'PH', 'MV', 'SC', 'KM', 'SB', 'MH', 'BS', 'AE']);
const pl = (c, one, many) => (PLURAL.has(c.iso) ? many : one);
// Hebt nur den Namen hervor, nicht Artikel oder Präposition
const emph = (phrase, tag = 'em') => {
  const m = phrase.match(/^(der|die|das|dem|den|des|von|zu|zur|zum|im|in) (.+)$/);
  return m ? `${m[1]} <${tag}>${esc(m[2])}</${tag}>` : `<${tag}>${esc(phrase)}</${tag}>`;
};
function inRegion(c, region) { return region === 'welt' || c.regions.includes(region); }
function countriesIn(region) { return COUNTRIES.filter(c => inRegion(c, region)); }
function waterIn(variant) {
  if (variant === 'meere') return WATER.filter(w => w.group === 'meer');
  if (variant === 'seen') return WATER.filter(w => w.group === 'see');
  return WATER;
}
function capitalsOf(c) { return [c.capital, ...(c.otherCapitals || [])]; }
function letters(s) { return [...s.replace(/[^\p{L}]/gu, '')].length; }

/* ================= Suche ================= */

const countrySearch = new Searcher(COUNTRIES.map(c => ({ id: c.iso, label: c.name, terms: c.aliases })));
const capitalItems = [];
for (const c of COUNTRIES) capitalsOf(c).forEach((cap, i) => capitalItems.push({ id: `${c.iso}:${i}`, iso: c.iso, idx: i, label: cap.name, terms: cap.aliases || [], lat: cap.lat, lon: cap.lon }));
CITIES.forEach((city, i) => capitalItems.push({ id: `city:${i}`, iso: city.iso, city: true, label: city.name, terms: city.aliases || [], lat: city.lat, lon: city.lon }));
const capitalSearch = new Searcher(capitalItems);
const waterSearch = new Searcher(WATER.map(w => ({ id: w.id, label: w.name, terms: w.aliases })));

/* ================= Karte ================= */

let map = null;
let kbHeight = 0;

function insets() {
  const top = $('.topbar').getBoundingClientRect();
  const r = { top: Math.max(0, top.bottom - 4), left: 0, right: 0, bottom: 0 };
  for (const el of document.querySelectorAll('.panel:not([hidden]), .card:not([hidden])')) {
    const b = el.getBoundingClientRect();
    const dock = getComputedStyle(el).getPropertyValue('--dock').trim();
    if (dock === 'left') r.left = Math.max(r.left, b.right + 12);
    else if (dock === 'bottom') r.bottom = Math.max(r.bottom, window.innerHeight - b.top + 12);
    else if (dock === 'top') r.top = Math.max(r.top, b.bottom + 12);
  }
  r.bottom = Math.max(r.bottom, kbHeight + 8);
  return r;
}

function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    kbHeight = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kbHeight + 'px');
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

/* ================= Ansichten ================= */

const VIEWS = ['home', 'setup', 'quiz', 'summary', 'explore', 'facts', 'progress', 'player', 'duel'];
let view = 'home';

function show(v) {
  view = v;
  document.body.dataset.view = v;
  syncUpdateBar();
  for (const id of VIEWS) $('#view-' + id).hidden = id !== v;
  $('#hud').hidden = v !== 'quiz';
  $('#btn-quit').hidden = v !== 'quiz';
  map.onClick = null;
  map.lakeFirst = false;
  $('#map').classList.remove('pickable');
  if (v !== 'explore') map.setLabelMode(false, {});
}

function goHome() {
  round = null;
  map.clear();
  renderHome();
  show('home');
  map.showRegion('welt');
}

/* ---------- Start ---------- */

const SWATCH = {
  laender: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#a9d3ea"/><path d="M0 0h13l4 7-5 7 3 10H0z" fill="#f3d29b"/><path d="M13 0h21v11l-9 4-8-8z" fill="#cfe1a9"/><path d="M17 7l8 8 9-4v13H15l-3-10z" fill="#f2c0c7"/><path d="M13 0l4 7-5 7 3 10M17 7l8 8 9-4" fill="none" stroke="#85766a" stroke-width="1"/></svg>',
  hauptstaedte: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#f5e79b"/><path d="M17 5l2.1 4.6 5 .5-3.8 3.4 1.1 4.9-4.4-2.6-4.4 2.6 1.1-4.9-3.8-3.4 5-.5z" fill="#d6246e" stroke="#fff" stroke-width="1"/></svg>',
  gewaesser: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#86bddc"/><path d="M-2 7q4.5-3 9 0t9 0 9 0 9 0 9 0M-2 14q4.5-3 9 0t9 0 9 0 9 0 9 0M-2 21q4.5-3 9 0t9 0 9 0 9 0 9 0" fill="none" stroke="#e8f4fb" stroke-width="1.6"/></svg>',
  flaggen: '<svg viewBox="0 0 34 24"><rect width="34" height="8" fill="#2a2833"/><rect y="8" width="34" height="8" fill="#e0442a"/><rect y="16" width="34" height="8" fill="#f5c542"/></svg>',
  entdecken: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><circle cx="17" cy="12" r="8.5" fill="none" stroke="#2a2833" stroke-width="1.3"/><path d="M17 4.5l2.2 7.5-2.2 7.5-2.2-7.5z" fill="#d6246e"/><path d="M17 12l2.2 0-2.2 7.5z" fill="#2a2833"/></svg>',
  fakten: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#d8cbea"/><text x="17" y="18.5" text-anchor="middle" font-family="Spectral, Georgia, serif" font-style="italic" font-size="17" font-weight="500" fill="#2a2833">i</text></svg>',
  duell: '<svg viewBox="0 0 34 24"><rect width="17" height="24" fill="#7c5cf0"/><rect x="17" width="17" height="24" fill="#e0761b"/><path d="M11 7l12 10M23 7L11 17" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  resume: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#d6246e"/><path d="M13 6l10 6-10 6z" fill="#fff"/></svg>',
  fortschritt: '<svg viewBox="0 0 34 24"><rect width="34" height="24" fill="#fff"/><rect x="0" y="0" width="12" height="24" fill="#4fae68"/><rect x="12" y="0" width="9" height="24" fill="#b9e3a8"/><rect x="21" y="0" width="6" height="24" fill="#f3b3a1"/></svg>',
};

function masteredCount(mode) {
  const pool = mode === 'gewaesser' ? WATER.map(w => w.id) : COUNTRIES.map(c => c.iso);
  return [pool.filter(id => level(mode, id) >= KNOWN).length, pool.length];
}

let deck = null;
function factDeck() {
  if (deck) return deck;
  deck = [];
  for (const c of COUNTRIES) c.facts.forEach(t => deck.push({ text: t, iso: c.iso }));
  for (const w of WATER) w.facts.forEach(t => deck.push({ text: t, water: w.id }));
  for (const f of WORLD_FACTS) deck.push({ text: f.text, iso: f.focus || null, world: true });
  return deck;
}

function factOfTheDay() {
  const d = factDeck();
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5);
  return d[(day * 7919) % d.length];
}

function factSubject(f) {
  if (f.water) { const w = WB.get(f.water); return { label: w.name, flag: null, kind: w.kind }; }
  if (f.world && !f.iso) return { label: 'Rund um die Welt', flag: null };
  const c = C.get(f.iso);
  return { label: f.world ? `Rund um die Welt – ${c.name}` : c.name, flag: f.world ? null : c.iso };
}

function resumeRow() {
  const r = savedRound();
  if (!r) return '';
  const def = MODES[r.mode];
  const where = r.mode === 'gewaesser' ? '' : ` – ${regionLabel(r.region)}`;
  return `<li><button class="legend-row resume-row" data-act="resume" type="button">
    <span class="swatch">${SWATCH.resume}</span>
    <span><span class="name">Runde fortsetzen</span><span class="desc">${esc(def.title)}${esc(where)}: weiter mit Frage ${r.results.length + 1} von ${r.items.length}</span></span>
  </button></li>`;
}

function renderHome() {
  const rows = [
    ['laender', MODES.laender.title, MODES.laender.desc],
    ['hauptstaedte', MODES.hauptstaedte.title, MODES.hauptstaedte.desc],
    ['gewaesser', MODES.gewaesser.title, MODES.gewaesser.desc],
    ['flaggen', MODES.flaggen.title, MODES.flaggen.desc],
    ['entdecken', 'Entdecken', 'Frei auf der Karte stöbern'],
    ['fakten', 'Fakten', 'Überraschendes über die Welt'],
    ['duell', 'Duell', 'Emilia gegen Lars: wer weiß mehr?'],
    ['fortschritt', 'Fortschritt', 'Was du schon sicher weißt'],
  ];
  const fotd = factOfTheDay();
  const subj = factSubject(fotd);
  $('#view-home').innerHTML = `
    <h1 class="title">Weltquiz</h1>
    <p class="subtitle">Die Welt, Land für Land.</p>
    ${duelStrip()}
    <ul class="legend-list">
      ${resumeRow()}
      ${rows.map(([id, name, desc]) => {
        let count = '';
        if (MODES[id]) { const [m, n] = masteredCount(id); count = `<span class="count" title="gewusst">${m}/${n}</span>`; }
        return `<li><button class="legend-row" data-go="${id}" type="button">
          <span class="swatch">${SWATCH[id]}</span>
          <span><span class="name">${name}</span><span class="desc">${desc}</span></span>${count}
        </button></li>`;
      }).join('')}
    </ul>
    <div class="daily">
      <div class="daily-head">${subj.flag ? `<img src="${flagUrl(subj.flag)}" alt="">` : ''}Fakt des Tages: ${esc(subj.label)}</div>
      <p class="fact-text">${esc(fotd.text)}</p>
    </div>`;
}

/* ---------- Einstellungen ---------- */

let setup = null;

function openSetup(mode) {
  const def = MODES[mode];
  const last = state.last[mode] || {};
  setup = {
    mode,
    variant: def.variants.some(v => v.id === last.variant) ? last.variant : def.variants[0].id,
    region: last.region || 'welt',
    count: last.count || 10,
  };
  renderSetup();
  show('setup');
  focusSetupRegion();
}

function poolSize(s) {
  if (s.mode === 'gewaesser') return waterIn(s.variant).length;
  return countriesIn(s.region).length;
}

function renderSetup() {
  const def = MODES[setup.mode];
  const n = poolSize(setup);
  const counts = [10, 20, 'alle'];
  $('#view-setup').innerHTML = `
    <button class="back" type="button" data-act="home">‹ Zurück</button>
    <h2 class="h2">${def.title}</h2>
    <div class="field">
      <p class="field-label">${def.variantLabel}</p>
      <div class="${def.variants[0].hint ? 'variant' : 'options'}">
        ${def.variants.map(v => `<button type="button" class="opt" data-variant="${v.id}" aria-pressed="${v.id === setup.variant}">${v.label}${v.hint ? `<small>${v.hint}</small>` : ''}</button>`).join('')}
      </div>
    </div>
    ${def.regions ? `<div class="field">
      <p class="field-label">Welche Region?</p>
      <div class="options">${REGIONS.map(r => `<button type="button" class="opt" data-region="${r.id}" aria-pressed="${r.id === setup.region}">${r.label}</button>`).join('')}</div>
    </div>` : ''}
    <div class="field">
      <p class="field-label">Wie viele Fragen?</p>
      <div class="options">${counts.map(c => `<button type="button" class="opt" data-count="${c}" aria-pressed="${String(c) === String(setup.count)}">${c === 'alle' ? `Alle <span class="n">${n}</span>` : c}</button>`).join('')}</div>
    </div>
    <div class="actions"><button class="btn primary wide" type="button" data-act="start">Runde starten</button></div>`;
}

function focusSetupRegion() {
  map.clear();
  if (setup.mode === 'gewaesser') {
    map.showRegion('welt');
    return;
  }
  if (setup.region !== 'welt') map.dimOutside(countriesIn(setup.region).map(c => c.iso));
  map.showRegion(setup.region);
}

/* ---------- Runde ---------- */

let round = null;
let q = null;           // aktuelle Frage

function buildPool(cfg) {
  if (cfg.mode === 'gewaesser') return waterIn(cfg.variant).map(w => w.id);
  return countriesIn(cfg.region).map(c => c.iso);
}

function pickItems(pool, count, mode) {
  if (count === 'alle' || count >= pool.length) return shuffle(pool);
  const weight = id => {
    const s = stat(mode, id);
    if (!s || !s.n) return 3;
    if (s.s === 0) return 5;
    if (s.s === 1) return 2.5;
    const age = (Date.now() - (s.t || 0)) / 864e5;
    return Math.min(1.5, 0.3 + age * 0.08);
  };
  return pool
    .map(id => ({ id, key: Math.pow(Math.random(), 1 / weight(id)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map(x => x.id);
}

function startRound(cfg, items) {
  items = items || pickItems(buildPool(cfg), cfg.count, cfg.mode);
  round = { ...cfg, items, i: 0, results: [], streak: 0, best: 0 };
  state.last[cfg.mode] = { variant: cfg.variant, region: cfg.region, count: cfg.count };
  persistRound();
  show('quiz');
  nextQuestion();
}

// Die laufende Runde wird mitgespeichert – nach einem Neuladen geht es an derselben Stelle weiter.
function persistRound() {
  if (!round) return;
  const { mode, variant, region, count, items, i, results, streak, best } = round;
  state.round = { mode, variant, region, count, items, i, results, streak, best, t: Date.now() };
  save();
}

function savedRound() {
  const r = state.round;
  if (!r || !Array.isArray(r.items) || !Array.isArray(r.results) || !MODES[r.mode]) return null;
  const known = id => (r.mode === 'gewaesser' ? WB.has(id) : C.has(id));
  if (!r.items.length || !r.items.every(known) || r.results.length >= r.items.length) return null;
  return r;
}

function resumeRound() {
  const r = savedRound();
  if (!r) { state.round = null; save(); renderHome(); return; }
  round = { ...r, streak: r.streak || 0, best: r.best || 0 };
  round.i = Math.max(r.i || 0, r.results.length);
  show('quiz');
  nextQuestion();
}

function renderHud() {
  const n = round.items.length;
  const done = round.results.length;
  const bar = $('#scalebar');
  if (n <= 30) {
    bar.innerHTML = round.items.map((_, i) => {
      const r = round.results[i];
      return `<i class="${r ? (r.ok ? 'r' : 'w') : i === round.i ? 'now' : ''}"></i>`;
    }).join('');
  } else {
    const right = round.results.filter(r => r.ok).length;
    bar.innerHTML = `<i class="r" style="flex:${right}"></i><i class="w" style="flex:${done - right}"></i><i style="flex:${n - done}"></i>`;
  }
  const cur = Math.min(round.i + 1, n);
  const streak = round.streak >= 3 ? `<span class="streak">${round.streak} in Folge</span>` : '';
  $('#hud-text').innerHTML = `<span class="long">Frage ${cur} von ${n}</span><span class="short">${cur}/${n}</span>${streak}`;
}

function nextQuestion() {
  if (round.i >= round.items.length) return finishRound();
  sfx.whoosh();
  const id = round.items[round.i];
  const { mode, variant } = round;
  q = { id, mode, variant, answered: false, hinted: false, pick: null };
  map.clear();
  if (mode !== 'gewaesser' && round.region !== 'welt') map.dimOutside(countriesIn(round.region).map(c => c.iso));
  renderHud();

  if (mode === 'laender' && variant === 'name') {
    const c = C.get(id);
    textQuestion({ prompt: 'Welches Land ist markiert?', placeholder: 'Land eingeben …', searcher: countrySearch, answer: c.name, emptyText: 'Kein Land gefunden – anders schreiben?' });
    map.setCountryClass(id, 'is-target');
    flyCountry(id, true);
  } else if (mode === 'laender' && variant === 'find') {
    const c = C.get(id);
    findQuestion(c);
    map.showRegion(round.region);
  } else if (mode === 'hauptstaedte' && variant === 'capital') {
    const c = C.get(id);
    textQuestion({ prompt: `Wie heißt die Hauptstadt ${emph(gen(c))}?`, placeholder: 'Stadt eingeben …', searcher: capitalSearch, answer: c.capital.name, emptyText: 'Keine Stadt gefunden – anders schreiben?' });
    map.setCountryClass(id, 'is-target');
    flyCountry(id, true);
  } else if (mode === 'hauptstaedte' && variant === 'country') {
    const c = C.get(id);
    textQuestion({ prompt: `Zu welchem Land gehört die Hauptstadt <em>${esc(c.capital.name)}</em>?`, placeholder: 'Land eingeben …', searcher: countrySearch, answer: c.name, emptyText: 'Kein Land gefunden – anders schreiben?' });
    if (c.capital.lat != null) {
      map.pin(c.capital.lon, c.capital.lat, '', 'target');
      map.flyToPoint(c.capital.lon, c.capital.lat, { size: 150 });
    } else {
      map.setCountryClass(id, 'is-target'); flyCountry(id, true);
    }
  } else if (mode === 'gewaesser') {
    const w = WB.get(id);
    textQuestion({ prompt: 'Wie heißt dieses Gewässer?', placeholder: 'Meer, See oder Ozean eingeben …', searcher: waterSearch, answer: w.name, emptyText: 'Kein Gewässer gefunden – anders schreiben?' });
    map.setWaterClass(id, 'is-target');
    const box = map.waterBox(id);
    map.flyToWater(id).then(() => { if (q && q.id === id && !q.answered) map.ringFor(box); });
  } else if (mode === 'flaggen' && variant === 'flag') {
    textQuestion({ prompt: 'Zu welchem Land gehört diese Flagge?', placeholder: 'Land eingeben …', searcher: countrySearch, answer: C.get(id).name, bigFlag: id, emptyText: 'Kein Land gefunden – anders schreiben?' });
    map.showRegion(round.region);
  } else if (mode === 'flaggen' && variant === 'pick') {
    flagPickQuestion(C.get(id));
    map.setCountryClass(id, 'is-target');
    flyCountry(id, true);
  }
}

function flyCountry(code, ring) {
  return map.flyToCountry(code).then(() => { if (ring && q && q.id === code && !q.answered) map.ringsForCountry(code); });
}

/* ----- Text-Frage mit Vorschlagsliste ----- */

function textQuestion({ prompt, placeholder, searcher, answer, bigFlag, emptyText }) {
  q.searcher = searcher;
  q.emptyText = emptyText || 'Nichts gefunden – anders schreiben?';
  q.answerText = answer;
  $('#view-quiz').innerHTML = `
    ${bigFlag ? `<img class="flag-big" src="${flagUrl(bigFlag)}" alt="Gesuchte Flagge">` : ''}
    <div class="q-head">
      <h2 class="q-prompt">${prompt}</h2>
      <div class="q-tools"><button class="chip-btn" type="button" data-act="hint">Tipp</button></div>
    </div>
    <p class="hint" id="hint" hidden></p>
    <form class="answer" id="answer-form" autocomplete="off">
      <input id="answer" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="suggest"
        placeholder="${esc(placeholder)}" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Antwort">
      <button class="btn primary ok" type="submit" disabled>OK</button>
      <ul class="suggest" id="suggest" role="listbox" hidden></ul>
    </form>
    <div class="below"><button class="chip-btn" type="button" data-act="skip">Weiß ich nicht</button></div>`;
  wireCombobox();
  const input = $('#answer');
  if (!matchMedia('(pointer: coarse)').matches || document.activeElement?.dataset?.act === 'next') input.focus({ preventScroll: true });
}

function wireCombobox() {
  const input = $('#answer'), list = $('#suggest'), ok = $('#answer-form .ok');
  let results = [], active = -1;

  const choose = r => {
    q.chosen = r.item;
    input.value = r.item.label;
    input.classList.add('chosen');
    ok.disabled = false;
    close();
  };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
  const render = () => {
    if (!input.value.trim()) { close(); return; }
    if (!results.length) {
      list.innerHTML = `<li class="empty" role="option" aria-disabled="true">${esc(q.emptyText)}</li>`;
    } else {
      list.innerHTML = results.map((r, i) => `<li id="s${i}" role="option" data-i="${i}" aria-selected="${i === active}"><b>${esc(r.item.label)}</b>${r.via ? `<span class="via">${esc(r.via)}</span>` : ''}</li>`).join('');
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', 's' + active);
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    q.chosen = null;
    input.classList.remove('chosen');
    ok.disabled = true;
    results = q.searcher.search(input.value);
    active = results.length ? 0 : -1;
    const exact = q.searcher.exact(input.value);
    if (exact) { q.chosen = exact; ok.disabled = false; active = results.findIndex(r => r.item === exact); }
    render();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; render(); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Escape') { close(); }
    else if (e.key === 'Enter') {
      e.stopPropagation();   // sonst springt der globale Enter-Handler direkt zur nächsten Frage
      if (!list.hidden && active >= 0 && results[active] && results[active].item !== q.chosen) { e.preventDefault(); choose(results[active]); sfx.select(); }
      else if (!list.hidden && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]); submitText(); }
    }
  });
  list.addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-i]');
    if (!li) return;
    e.preventDefault();
    choose(results[+li.dataset.i]);
    sfx.select();
    input.focus({ preventScroll: true });
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('focus', () => { if (input.value && !q.chosen) render(); setTimeout(() => window.scrollTo(0, 0), 60); });
  $('#answer-form').addEventListener('submit', e => { e.preventDefault(); submitText(); });
}

function submitText() {
  if (!q || q.answered || !q.chosen) return;
  const { mode, variant, id } = q;
  let ok;
  let pickId = q.chosen.id;
  if (mode === 'hauptstaedte' && variant === 'capital') ok = q.chosen.iso === id && !q.chosen.city;
  else ok = pickId === id;
  answer(ok, q.chosen);
}

/* ----- Land finden (Tippen auf Karte) ----- */

function findQuestion(c) {
  $('#view-quiz').innerHTML = `
    <div class="q-head">
      <h2 class="q-prompt">Wo liegt ${emph(nom(c))}?</h2>
      <div class="q-tools"><button class="chip-btn" type="button" data-act="hint">Tipp</button></div>
    </div>
    <p class="hint" id="find-state">Tippe auf der Karte auf das Land und bestätige mit OK.</p>
    <div class="below">
      <button class="chip-btn" type="button" data-act="skip">Weiß ich nicht</button>
      <button class="btn primary ok" type="button" data-act="confirm-pick" disabled>OK</button>
    </div>`;
  $('#map').classList.add('pickable');
  map.onClick = hit => {
    if (!q || q.answered || !hit || hit.type !== 'country' || hit.code === 'AQ') return;
    if (q.pick) map.setCountryClass(q.pick.code, 'is-pick', false);
    q.pick = { code: hit.code, props: hit.props };
    map.setCountryClass(hit.code, 'is-pick', true);
    sfx.select();
    $('#find-state').textContent = 'Auswahl getroffen. Passt? Dann OK – oder tippe ein anderes Land an.';
    $('[data-act="confirm-pick"]').disabled = false;
  };
}

/* ----- Flagge auswählen ----- */

function flagOptions(iso) {
  const out = new Set([iso]);
  const groups = FLAG_GROUPS.filter(g => g.includes(iso));
  for (const g of shuffle(groups.flat())) { if (out.size >= 3) break; if (g !== iso && C.has(g)) out.add(g); }
  const c = C.get(iso);
  const sameRegion = shuffle(COUNTRIES.filter(x => x.iso !== iso && x.regions.some(r => c.regions.includes(r))));
  for (const x of sameRegion) { if (out.size >= 4) break; out.add(x.iso); }
  for (const x of shuffle(COUNTRIES)) { if (out.size >= 4) break; out.add(x.iso); }
  return shuffle([...out]);
}

function flagPickQuestion(c) {
  const opts = flagOptions(c.iso);
  $('#view-quiz').innerHTML = `
    <div class="q-head"><h2 class="q-prompt">Welche Flagge gehört ${emph(zuDat(c))}?</h2></div>
    <div class="flag-grid" id="flag-grid">
      ${opts.map((iso, i) => `<button class="flag-opt" type="button" data-flag="${iso}" aria-label="Flagge ${i + 1}"><img src="${flagUrl(iso)}" alt=""></button>`).join('')}
    </div>
    <div class="below"><button class="chip-btn" type="button" data-act="skip">Weiß ich nicht</button></div>`;
}

/* ----- Auswertung einer Antwort ----- */

function answer(ok, chosen) {
  if (q.answered) return;
  q.answered = true;
  const { mode, variant, id } = q;
  record(mode, id, ok, q.hinted);
  if (ok) sfx.correct(); else sfx.wrong();
  round.results.push({ id, ok, chosen: chosen ? chosenLabel(chosen) : null });
  round.streak = ok ? round.streak + 1 : 0;
  round.best = Math.max(round.best, round.streak);
  const streakNow = round.streak;
  if (ok && (streakNow === 3 || streakNow === 5 || (streakNow >= 10 && streakNow % 5 === 0))) setTimeout(() => sfx.streak(streakNow), 450);
  persistRound();
  renderHud();
  map.onClick = null;
  $('#map').classList.remove('pickable');
  map.overlay.selectAll('.ring, .pin.target').remove();
  map.overlayItems = map.overlayItems.filter(it => it.kind !== 'ring' && !it.el.classed('target'));

  // Karte: richtige Lösung grün, falsche Wahl rot. Der Kamera-Schwenk folgt, wenn die Karte ihre neue Höhe hat.
  let detail = '', note = '', fact = '', fly = null;
  if (mode === 'gewaesser') {
    const w = WB.get(id);
    map.setWaterClass(id, 'is-target', false);
    map.setWaterClass(id, 'is-right');
    map.labelWater(id, w.name, 'water right');
    if (!ok && chosen) {
      map.setWaterClass(chosen.id, 'is-wrong');
      map.labelWater(chosen.id, WB.get(chosen.id).name, 'water wrong');
    }
    detail = ok ? `Genau: <b>${esc(w.name)}</b> <span class="kind">(${esc(w.kind)})</span>`
      : `Gesucht war: <b>${esc(w.name)}</b> <span class="kind">(${esc(w.kind)})</span>${chosen ? `. Deine Antwort: ${esc(chosen.label)}.` : ''}`;
    fact = nextFact('w:' + id, w.facts);
    const tb = map.waterBox(id);
    if (!ok && chosen) {
      const u = unionBox(tb, map.waterBox(chosen.id));
      fly = (u[1][0] - u[0][0] < 420 && u[1][1] - u[0][1] < 330) ? () => map.flyToBox(u, { pad: 1.25, minSize: 30 }) : () => map.flyToWater(id);
    } else fly = () => map.flyToWater(id);
  } else {
    const c = C.get(id);
    map.setCountryClass(id, 'is-target', false);
    map.setCountryClass(id, 'is-pick', false);
    map.setCountryClass(id, 'is-right');
    map.labelCountry(id, c.name, 'right');
    let wrongCode = null;
    if (!ok) {
      if (mode === 'laender' && variant === 'find' && q.pick) wrongCode = q.pick.code;
      else if (mode === 'hauptstaedte' && variant === 'capital') wrongCode = null;
      else if (chosen && C.has(chosen.id)) wrongCode = chosen.id;
    }
    if (wrongCode && wrongCode !== id) {
      map.setCountryClass(wrongCode, 'is-pick', false);
      map.setCountryClass(wrongCode, 'is-wrong');
      map.labelCountry(wrongCode, nameOf(wrongCode, q.pick?.props), 'wrong');
    }
    let extraBox = null;
    if (mode === 'hauptstaedte') {
      capitalsOf(c).forEach(cap => { if (cap.lat != null) map.pin(cap.lon, cap.lat, cap.name, 'right'); });
      if (!ok && variant === 'capital' && chosen) {
        if (chosen.lat != null) {
          map.pin(chosen.lon, chosen.lat, chosen.label, 'wrong');
          const [x, y] = map.projection([chosen.lon, chosen.lat]);
          extraBox = [[x - 4, y - 4], [x + 4, y + 4]];
        }
      }
      if (variant === 'capital') {
        const other = chosen && C.get(chosen.iso);
        if (ok && chosen.idx === 0) detail = `<b>${esc(chosen.label)}</b> ist die Hauptstadt ${esc(gen(c))}.`;
        else if (ok) detail = `<b>${esc(chosen.label)}</b> zählt als richtig (${esc(capitalsOf(c)[chosen.idx].role || 'Regierungssitz')}). Als Hauptstadt gilt ${esc(c.capital.name)}.`;
        else if (!chosen) detail = `Die Hauptstadt ${esc(gen(c))} ist <b>${esc(c.capital.name)}</b>.`;
        else if (chosen.city && chosen.iso === id) detail = `${esc(chosen.label)} liegt zwar ${esc(inDat(c))}, ist aber nicht die Hauptstadt. Die heißt <b>${esc(c.capital.name)}</b>.`;
        else if (chosen.city) detail = `Die Hauptstadt ${esc(gen(c))} ist <b>${esc(c.capital.name)}</b>. ${esc(chosen.label)} liegt ${esc(inDat(other))} und ist dort keine Hauptstadt.`;
        else detail = `Die Hauptstadt ${esc(gen(c))} ist <b>${esc(c.capital.name)}</b> – ${esc(chosen.label)} ist die Hauptstadt ${esc(gen(other))}.`;
      } else {
        const picked = chosen && C.get(chosen.id);
        detail = ok ? `${esc(c.capital.name)} ist die Hauptstadt ${emph(gen(c), 'b')}.`
          : `${esc(c.capital.name)} ist die Hauptstadt ${emph(gen(c), 'b')}${picked ? ` – nicht ${esc(gen(picked))}` : ''}.`;
      }
      note = c.capitalNote || '';
    } else if (mode === 'laender' && variant === 'find') {
      const tapped = wrongCode && (C.get(wrongCode) ? acc(C.get(wrongCode)) : nameOf(wrongCode, q.pick?.props));
      detail = ok ? `Genau, hier ${pl(c, 'liegt', 'liegen')} ${emph(nom(c), 'b')}.` : `${esc(capFirst(nom(c)))} ${pl(c, 'ist', 'sind')} grün markiert${tapped ? ` – du hast ${esc(tapped)} angetippt` : ''}.`;
    } else if (mode === 'flaggen' && variant === 'pick') {
      const pc = chosen && C.get(chosen.id);
      detail = ok ? `Das ist die Flagge ${emph(gen(c), 'b')}.` : `Grün umrandet ist die Flagge ${emph(gen(c), 'b')}${pc ? ` – du hast die Flagge ${esc(gen(pc))} gewählt` : ''}.`;
    } else if (mode === 'flaggen') {
      const pc = chosen && C.get(chosen.id);
      detail = `Das ist die Flagge ${emph(gen(c), 'b')}${!ok && pc ? ` – du hast ${esc(acc(pc))} gewählt` : ''}.`;
    } else {
      const pc = chosen && C.get(chosen.id);
      detail = ok ? `Das ${pl(c, 'ist', 'sind')} ${emph(nom(c), 'b')}.` : `Gesucht ${pl(c, 'war', 'waren')} ${emph(nom(c), 'b')}${pc ? ` – du hast ${esc(acc(pc))} gewählt` : ''}.`;
    }
    fact = nextFact('c:' + id, c.facts);
    const tb = map.countryBox(id);
    const other = extraBox || (wrongCode && wrongCode !== id && wrongCode !== 'AQ' ? map.countryBox(wrongCode) : null);
    if (other) {
      const u = unionBox(tb, other);
      fly = (u[1][0] - u[0][0] < 300 && u[1][1] - u[0][1] < 220) ? () => map.flyToBox(u, { pad: 1.35, minSize: 30 }) : () => map.flyToCountry(id);
    } else fly = () => map.flyToCountry(id);
  }

  detail = detail.replace(/\.(<\/b>)?\.$/, '.$1');   // „D.C.“ nicht doppelt punkten
  const body = `
    <div class="result ${ok ? 'right' : 'wrong'}">${ok ? ICON_OK : ICON_NO}${ok ? (q.hinted ? 'Richtig – mit Tipp' : 'Richtig!') : 'Falsch'}</div>
    <p class="result-detail">${detail}</p>
    ${note ? `<p class="note">${esc(note)}</p>` : ''}
    ${fact ? `<div class="fact"><div class="fact-head">Wusstest du?</div><p class="fact-text">${esc(fact)}</p></div>` : ''}
    <div class="next-row"><button class="btn primary" type="button" data-act="next">${round.i + 1 >= round.items.length ? 'Zur Auswertung' : 'Weiter'}</button></div>`;

  const card = $('#view-quiz');
  if (mode === 'flaggen' && variant === 'pick') {
    const grid = card.querySelector('.flag-grid');
    grid.classList.add('answered');
    grid.querySelectorAll('.flag-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.flag === id) b.classList.add('is-right');
      else if (chosen && b.dataset.flag === chosen.id) b.classList.add('is-wrong');
      b.insertAdjacentHTML('beforeend', `<span class="cap">${esc(C.get(b.dataset.flag).name)}</span>`);
    });
    card.querySelector('.below')?.remove();
    card.insertAdjacentHTML('beforeend', `<div class="fb">${body}</div>`);
  } else {
    const keepFlag = card.querySelector('.flag-big');
    card.innerHTML = (keepFlag ? keepFlag.outerHTML : '') + body;
  }
  card.querySelector('[data-act="next"]').focus({ preventScroll: true });
  requestAnimationFrame(() => fly && fly());
}

function chosenLabel(ch) { return ch.label || ch.name || ''; }

function unionBox(a, b) {
  // b so verschieben, dass es neben a liegt (Datumsgrenze)
  let dx = ((b[0][0] + b[1][0]) - (a[0][0] + a[1][0])) / 2;
  const shift = Math.abs(dx) > W / 2 ? -Math.sign(dx) * W : 0;
  return [[Math.min(a[0][0], b[0][0] + shift), Math.min(a[0][1], b[0][1])], [Math.max(a[1][0], b[1][0] + shift), Math.max(a[1][1], b[1][1])]];
}

function nextFact(key, facts) {
  if (!facts || !facts.length) return '';
  const i = (state.factIdx[key] ?? -1) + 1;
  state.factIdx[key] = i % facts.length;
  save();
  return facts[i % facts.length];
}

function useHint() {
  if (!q || q.answered) return;
  q.hinted = true;
  sfx.hint();
  if (q.mode === 'laender' && q.variant === 'find') {
    const b = map.countryBox(q.id);
    const cx = (b[0][0] + b[1][0]) / 2 + (Math.random() - 0.5) * 30, cy = (b[0][1] + b[1][1]) / 2 + (Math.random() - 0.5) * 20;
    const s = Math.max(110, (b[1][0] - b[0][0]) * 3.2);
    map.flyToBox([[cx - s / 2, cy - s * 0.3], [cx + s / 2, cy + s * 0.3]], { pad: 1, minSize: 10 });
    $('#find-state').textContent = 'Tipp: Das Land liegt in diesem Ausschnitt.';
    return;
  }
  const a = q.answerText || '';
  const el = $('#hint');
  el.hidden = false;
  el.textContent = `Tipp: beginnt mit „${a.charAt(0)}“ und hat ${letters(a)} Buchstaben.`;
  $('#answer')?.focus({ preventScroll: true });
}

function skip() {
  if (!q || q.answered) return;
  answer(false, null);
}

function next() {
  if (!round) return;
  round.i++;
  persistRound();
  nextQuestion();
}

/* ---------- Auswertung ---------- */

function finishRound() {
  const r = round;
  const right = r.results.filter(x => x.ok).length;
  const n = r.results.length;
  state.round = null;
  save();
  if (n) sfx.fanfare(right / n);
  const missed = r.results.filter(x => !x.ok);
  const def = MODES[r.mode];
  const variantLabel = def.variants.find(v => v.id === r.variant)?.label;
  const sub = r.mode === 'gewaesser' ? variantLabel : `${variantLabel} – ${regionLabel(r.region)}`;
  const nameFor = id => r.mode === 'gewaesser' ? WB.get(id).name
    : r.mode === 'hauptstaedte' && r.variant === 'capital' ? `${C.get(id).capital.name} (${C.get(id).name})`
    : r.mode === 'hauptstaedte' ? `${C.get(id).name} (${C.get(id).capital.name})` : C.get(id).name;
  const verdict = n === 0 ? '' : right === n ? 'Alles richtig. Stark!' : right / n >= 0.8 ? 'Richtig gut.' : right / n >= 0.5 ? 'Solide – die Fehler unten lohnen einen zweiten Blick.' : 'Wiederhol die Fehler gleich noch einmal – so bleibt es hängen.';
  $('#view-summary').innerHTML = `
    <button class="back" type="button" data-act="home">‹ Zum Start</button>
    <h2 class="h2">Runde geschafft</h2>
    <p class="lead">${esc(def.title)}: ${esc(sub)}</p>
    <div class="big-score">${right}<small> von ${n} richtig</small></div>
    <div class="scalebar summary-bar">${n <= 30 ? r.results.map(x => `<i class="${x.ok ? 'r' : 'w'}"></i>`).join('') : `<i class="r" style="flex:${right}"></i><i class="w" style="flex:${n - right}"></i>`}</div>
    <p>${verdict}${r.best >= 3 ? ` Längste Serie: ${r.best} am Stück.` : ''}</p>
    ${missed.length ? `<p class="field-label" style="margin-top:14px">Zum Wiederholen</p>
      <ul class="miss-list">${missed.map(x => `<li><span>${esc(nameFor(x.id))}</span>${x.chosen ? `<span class="yours">${esc(x.chosen)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    <div class="actions">
      ${missed.length ? '<button class="btn primary" type="button" data-act="retry">Fehler wiederholen</button>' : ''}
      <button class="btn ${missed.length ? '' : 'primary'}" type="button" data-act="again">Neue Runde</button>
    </div>`;
  show('summary');
  // Ergebniskarte
  map.clear();
  if (r.mode === 'gewaesser') {
    for (const x of r.results) map.setWaterClass(x.id, x.ok ? 'is-right' : 'is-wrong');
    map.showRegion('welt');
  } else {
    if (r.region !== 'welt') map.dimOutside(countriesIn(r.region).map(c => c.iso));
    for (const x of r.results) map.setCountryClass(x.id, x.ok ? 'is-right' : 'is-wrong');
    map.showRegion(r.region);
  }
}

/* ---------- Entdecken ---------- */

let explorePick = null;

function openExplore() {
  show('explore');
  map.clear();
  $('#view-explore').innerHTML = `
    <div class="explore-bar">
      <h2 class="q-prompt" style="margin:0">Entdecken</h2>
      <label class="toggle"><input type="checkbox" id="labels-toggle"> Namen zeigen</label>
    </div>
    <div id="explore-info"><p class="hint" style="margin:8px 0 0">Tippe auf ein Land, ein Meer oder einen See.</p></div>
    <div class="below"><button class="chip-btn" type="button" data-act="home">‹ Zurück zum Start</button></div>`;
  $('#labels-toggle').addEventListener('change', e => {
    map.setLabelMode(e.target.checked, Object.fromEntries(COUNTRIES.map(c => [c.iso, c.name])));
  });
  $('#map').classList.add('pickable');
  map.onClick = hit => exploreHit(hit);
  map.lakeFirst = true;
  explorePick = null;
  map.showRegion('welt');
}

function exploreHit(hit) {
  if (explorePick) {
    if (explorePick.type === 'country') map.setCountryClass(explorePick.code, 'is-target', false);
    else explorePick.ids.forEach(id => map.setWaterClass(id, 'is-target', false));
  }
  explorePick = hit;
  const box = $('#explore-info');
  if (!hit) { box.innerHTML = '<p class="hint" style="margin:8px 0 0">Tippe auf ein Land, ein Meer oder einen See.</p>'; return; }
  if (hit.type === 'country') {
    map.setCountryClass(hit.code, 'is-target', true);
    requestAnimationFrame(() => map.ensureVisible(map.countryBox(hit.code)));
    const c = C.get(hit.code);
    if (!c) {
      const owner = hit.props.s && C.get(hit.props.s);
      box.innerHTML = `<div class="card-scroll"><h3 class="q-prompt" style="margin:10px 0 4px">${esc(hit.props.n || hit.code)}</h3>
        <p class="hint" style="margin:0">${owner ? `Gehört ${esc(zuDat(owner))} – kein eigener Staat.` : hit.code === 'AQ' ? 'Ein Kontinent ohne Staat: Antarktika wird durch den Antarktisvertrag gemeinsam verwaltet.' : 'Kein eigenständiger, allgemein anerkannter Staat.'}</p></div>`;
      return;
    }
    const caps = capitalsOf(c);
    box.innerHTML = `<div class="card-scroll">
      <div class="info-head" style="margin-top:10px"><img src="${flagUrl(c.iso)}" alt="Flagge von ${esc(c.name)}"><h3 class="q-prompt" style="margin:0">${esc(c.name)}</h3></div>
      <dl class="info-grid">
        <dt>Hauptstadt</dt><dd>${esc(caps[0].name)}${caps.length > 1 ? ` <span style="font-weight:400">(außerdem ${caps.slice(1).map(x => esc(x.name)).join(', ')})</span>` : ''}</dd>
        <dt>Sprache${c.languages.length > 1 ? 'n' : ''}</dt><dd>${esc(c.languages.join(', '))}${c.moreLanguages ? ' u. a.' : ''}</dd>
        <dt>Währung</dt><dd>${esc(c.currency)}</dd>
        <dt>Kontinent</dt><dd>${esc(c.regions.map(regionLabel).join(', '))}</dd>
      </dl>
      ${c.capitalNote ? `<p class="note">${esc(c.capitalNote)}</p>` : ''}
      <div class="fact"><div class="fact-head">Wusstest du?</div><ul class="facts-list">${c.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></div>`;
  } else {
    // bei geteilten Flächen (z. B. Bottnischer Meerbusen als Teil der Ostsee) das speziellere Gewässer zeigen
    const ids = hit.ids.filter(id => WB.has(id));
    const main = WB.get(ids[ids.length - 1]);
    if (!main) return;
    const partOf = ids.length > 1 ? WB.get(ids[0]) : null;
    hit.ids = [main.id];
    map.setWaterClass(main.id, 'is-target', true);
    requestAnimationFrame(() => map.ensureVisible(map.waterBox(main.id)));
    const anr = (main.borders || []).filter(i => C.has(i)).map(i => C.get(i).name);
    box.innerHTML = `<div class="card-scroll">
      <h3 class="q-prompt" style="margin:10px 0 0">${esc(main.name)}</h3>
      <div class="kind">${esc(main.kind || '')}${partOf ? `, Teil der ${esc(partOf.name)}` : ''}</div>
      ${anr.length ? `<dl class="info-grid"><dt>Anrainer</dt><dd>${esc(anr.join(', '))}</dd></dl>` : ''}
      <div class="fact"><div class="fact-head">Wusstest du?</div><ul class="facts-list">${main.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div></div>`;
  }
}

/* ---------- Fakten ---------- */

let factOrder = null, factPos = 0;

function openFacts() {
  show('facts');
  if (!factOrder) { factOrder = shuffle(factDeck()); factPos = 0; }
  renderFact();
}

function renderFact() {
  const f = factOrder[factPos % factOrder.length];
  const subj = factSubject(f);
  map.clear();
  $('#view-facts').innerHTML = `
    <div class="info-head">${subj.flag ? `<img src="${flagUrl(subj.flag)}" alt="" style="height:30px">` : ''}<h2 class="q-prompt" style="margin:0">${esc(subj.label)}</h2></div>
    ${subj.kind ? `<div class="kind">${esc(subj.kind)}</div>` : ''}
    <p class="fact-text" style="font-size:20px;margin-top:10px">${esc(f.text)}</p>
    <div class="next-row">
      <button class="btn" type="button" data-act="home">Zurück</button>
      <button class="btn primary" type="button" data-act="next-fact">Nächster Fakt</button>
    </div>`;
  if (f.water) { map.setWaterClass(f.water, 'is-target'); map.flyToWater(f.water); }
  else if (f.iso) { map.setCountryClass(f.iso, 'is-target'); map.flyToCountry(f.iso).then(() => map.ringsForCountry(f.iso)); }
  else map.showRegion('welt');
  $('[data-act="next-fact"]').focus({ preventScroll: true });
}

/* ---------- Fortschritt ---------- */

let progressMode = 'laender';
let progressPlayer = null;

function openProgress(player) {
  progressPlayer = player || state.player;
  show('progress');
  renderProgress();
}

function renderProgress() {
  const m = progressMode;
  const pid = progressPlayer || state.player;
  const own = !pid || pid === state.player;
  const stats = statsOf(pid);
  const level = (mode, id) => levelIn(stats, mode, id);
  const tabs = [['laender', 'Länder'], ['hauptstaedte', 'Hauptstädte'], ['flaggen', 'Flaggen'], ['gewaesser', 'Gewässer']];
  let rows;
  if (m === 'gewaesser') {
    rows = [['Ozeane & Meere', WATER.filter(w => w.group === 'meer').map(w => w.id)], ['Seen', WATER.filter(w => w.group === 'see').map(w => w.id)]];
  } else {
    rows = REGIONS.filter(r => r.id !== 'welt').map(r => [r.label, countriesIn(r.id).map(c => c.iso)]);
    rows.unshift(['Ganze Welt', COUNTRIES.map(c => c.iso)]);
  }
  $('#view-progress').innerHTML = `
    <button class="back" type="button" data-act="home">‹ Zurück</button>
    <h2 class="h2">${own ? 'Dein Fortschritt' : `Fortschritt von ${esc(playerName(pid))}`}</h2>
    <p class="lead">Hellgrün: zuletzt richtig gewusst. Dunkelgrün: sicher, zweimal hintereinander richtig.</p>
    ${state.player ? `<div class="options who-tabs" style="margin-top:14px">${PLAYERS.map(p => `<button type="button" class="opt p-${p.id}" data-pplayer="${p.id}" aria-pressed="${p.id === pid}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="options" style="margin-top:10px">${tabs.map(([id, l]) => `<button type="button" class="opt" data-pmode="${id}" aria-pressed="${id === m}">${l}</button>`).join('')}</div>
    <div class="progress-rows">${rows.map(([label, ids]) => {
      const lv = [0, 0, 0, 0];
      ids.forEach(id => lv[level(m, id)]++);
      const n = ids.length;
      return `<div class="progress-row"><div class="top"><span>${esc(label)}</span><span>${lv[2] + lv[3]} von ${n} gewusst</span></div>
        <div class="meter"><i class="m3" style="width:${lv[3] / n * 100}%"></i><i class="m2" style="width:${lv[2] / n * 100}%"></i><i class="m1" style="width:${lv[1] / n * 100}%"></i></div></div>`;
    }).join('')}</div>
    <div class="key"><span><i style="background:#4fae68"></i>sicher</span><span><i style="background:#b9e3a8"></i>gewusst</span><span><i style="background:#f3b3a1"></i>zuletzt falsch</span><span><i style="background:#e9e5de"></i>noch nicht gefragt</span></div>
    ${!own && !state.remote ? '<p class="hint" style="margin-top:12px">Der Stand von ' + esc(playerName(pid)) + ' wird gerade geladen …</p>' : ''}`;
  map.clear();
  if (m === 'gewaesser') {
    for (const w of WATER) { const l = level(m, w.id); if (l >= KNOWN) map.setWaterClass(w.id, 'is-right'); else if (l === 1) map.setWaterClass(w.id, 'is-wrong'); }
  } else {
    map.setMastery(Object.fromEntries(COUNTRIES.map(c => [c.iso, level(m, c.iso)])));
  }
  map.showRegion('welt');
}

/* ================= Spieler, Online-Speicher und Duell ================= */

// Lokal lässt sich zum Testen ein anderer Server angeben (?api=…), damit echte Spielstände unberührt bleiben.
const API = (location.hostname === 'localhost' && new URLSearchParams(location.search).get('api')) || 'https://weltquiz-api-production.up.railway.app';
const PLAYERS = [{ id: 'emilia', name: 'Emilia' }, { id: 'lars', name: 'Lars' }];
const playerName = id => PLAYERS.find(p => p.id === id)?.name || id;
const otherPlayer = id => PLAYERS.find(p => p.id !== id)?.id;
const sync = { online: null, pushing: false, retry: null, pushTimer: null };

function statsOf(pid) {
  if (!pid || pid === state.player) return state.stats;
  return state.remote?.players?.[pid]?.stats || state.bench?.[pid]?.stats || {};
}

function markDirty(mode, id) {
  if (!state.player) return;
  (state.dirty[mode] ||= {})[id] = 1;
  clearTimeout(sync.pushTimer);
  sync.pushTimer = setTimeout(() => push(), 1200);
}

function mergeItem(a, b) {
  if (!a) return b ? { n: b.n || 0, c: b.c || 0, s: b.s || 0, t: b.t || 0 } : a;
  if (!b) return a;
  const latest = (b.t || 0) > (a.t || 0) ? b : a;
  return { n: Math.max(a.n || 0, b.n || 0), c: Math.max(a.c || 0, b.c || 0), s: latest.s || 0, t: Math.max(a.t || 0, b.t || 0) };
}
const sameItem = (a, b) => a && b && a.n === b.n && a.c === b.c && a.s === b.s && a.t === b.t;

/** Online-Stand eines Spielers in den lokalen Stand einarbeiten (für mehrere Geräte). */
function mergeRemoteIntoLocal(remote) {
  if (!remote) return false;
  let changed = false;
  for (const [mode, items] of Object.entries(remote)) {
    if (!MODES[mode] || !items) continue;
    const m = state.stats[mode] ||= {};
    for (const [id, r] of Object.entries(items)) {
      const merged = mergeItem(m[id], r);
      if (!sameItem(m[id], merged)) { m[id] = merged; changed = true; }
      if (!sameItem(merged, r)) (state.dirty[mode] ||= {})[id] = 1;   // lokal neuer: nachschieben
    }
  }
  return changed;
}

async function push(opts = {}) {
  const player = state.player;
  if (!player || sync.pushing) return;
  const payload = {};
  let count = 0;
  for (const [mode, ids] of Object.entries(state.dirty || {})) {
    for (const id of Object.keys(ids)) {
      const v = state.stats[mode]?.[id];
      if (v) { (payload[mode] ||= {})[id] = v; count++; }
    }
  }
  if (!count) { state.dirty = {}; return; }
  const sending = state.dirty;
  state.dirty = {};
  sync.pushing = true;
  try {
    const body = JSON.stringify({ stats: payload });
    const res = await fetch(`${API}/api/players/${player}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      keepalive: !!opts.keepalive && body.length < 60000,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    sync.online = true;
    if (state.player === player) {
      state.remote ||= { players: {} };
      state.remote.players[player] = { ...(state.remote.players[player] || {}), name: playerName(player), stats: data.stats, updatedAt: data.updatedAt };
      if (mergeRemoteIntoLocal(data.stats)) onRemoteUpdate();
    }
  } catch {
    // Warteschlange behalten und später erneut versuchen
    const target = state.player === player ? state.dirty : ((state.bench[player] ||= { stats: {} }).dirty ||= {});
    for (const [mode, ids] of Object.entries(sending)) for (const id of Object.keys(ids)) (target[mode] ||= {})[id] = 1;
    sync.online = false;
    clearTimeout(sync.retry);
    sync.retry = setTimeout(() => push(), 20000);
  } finally {
    sync.pushing = false;
    save();
    // was während der Übertragung dazukam, gleich hinterherschicken
    if (sync.online && Object.keys(state.dirty || {}).length) {
      clearTimeout(sync.pushTimer);
      sync.pushTimer = setTimeout(() => push(), 1200);
    }
  }
}

async function pull() {
  try {
    const res = await fetch(`${API}/api/state`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.remote = { players: data.players, fetchedAt: Date.now() };
    sync.online = true;
    if (state.player && data.players[state.player]) mergeRemoteIntoLocal(data.players[state.player].stats);
    save();
    onRemoteUpdate();
    if (Object.keys(state.dirty || {}).length) push();
  } catch {
    sync.online = false;
  }
}

let remoteSig = '';
function onRemoteUpdate() {
  // nur neu zeichnen, wenn sich Zahlen geändert haben – und dabei die Scrollposition behalten
  const sig = JSON.stringify(duelScores().map(p => [p.sc.total, p.sc.sure, p.sc.answers, p.sc.last]));
  if (sig === remoteSig) return;
  remoteSig = sig;
  const redraw = (el, fn) => { const top = el.scrollTop; fn(); el.scrollTop = top; };
  if (view === 'home') redraw($('#view-home'), renderHome);
  else if (view === 'duel') redraw($('#view-duel'), () => renderDuel(false));
}

/* ---------- Updates ohne Unterbrechung ---------- */

// Neue Versionen werden erkannt und nur zwischen den Runden geladen – nie mitten in einer Frage.
const APP_VERSION = 4;
let updateReady = false;

async function checkUpdate() {
  try {
    const res = await fetch('version.json?cb=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();
    if (+v > APP_VERSION) { updateReady = true; syncUpdateBar(); }
  } catch { /* offline */ }
}

function syncUpdateBar() {
  const bar = $('#update-bar');
  if (bar) bar.hidden = !(updateReady && view !== 'quiz');
}

function applyUpdateIfIdle() {
  if (updateReady && view !== 'quiz') { push({ keepalive: true }); location.reload(); }
}

function startSync() {
  pull();
  setInterval(() => { if (document.visibilityState === 'visible') pull(); }, 45000);
  setInterval(checkUpdate, 120000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') push({ keepalive: true });
    else { applyUpdateIfIdle(); pull(); checkUpdate(); }
  });
  window.addEventListener('online', () => { push(); pull(); });
}

/* ---------- Spielerwahl ---------- */

function renderPlayerChip() {
  const chip = $('#btn-player');
  chip.hidden = !state.player;
  chip.className = 'player-chip p-' + (state.player || '');
  chip.innerHTML = state.player ? `<i aria-hidden="true"></i>${esc(playerName(state.player))}` : '';
  chip.setAttribute('aria-label', state.player ? `Spielerin/Spieler: ${playerName(state.player)} – wechseln` : '');
}

function localLearned() {
  return Object.keys(MODES).reduce((sum, mode) => sum + masteredCount(mode)[0], 0);
}

function openChooser(canGoBack) {
  const learned = localLearned();
  const answered = Object.values(state.stats).reduce((n, items) => n + Object.keys(items || {}).length, 0);
  $('#view-player').innerHTML = `
    ${canGoBack && state.player ? '<button class="back" type="button" data-act="home">‹ Zurück</button>' : ''}
    <h1 class="title">Weltquiz</h1>
    <p class="subtitle">${state.player ? 'Wer spielt jetzt?' : 'Wer spielt?'}</p>
    <div class="who">
      ${PLAYERS.map(p => `<button type="button" class="who-btn p-${p.id}" data-player="${p.id}"${p.id === state.player ? ' aria-pressed="true"' : ''}>${esc(p.name)}</button>`).join('')}
    </div>
    ${!state.player && answered ? `<p class="hint who-note">Auf diesem Gerät wurde schon gespielt (${learned} gewusst). Dieser Fortschritt gehört dann zu dem Namen, den du antippst.</p>` : ''}
    <p class="hint who-note">Euer Fortschritt wird online gespeichert. So seid ihr auf jedem Gerät auf dem gleichen Stand und seht euch gegenseitig im Duell.</p>`;
  show('player');
  map.showRegion('welt');
}

function choosePlayer(id) {
  if (!PLAYERS.some(p => p.id === id)) return;
  if (state.player && state.player !== id) {
    // anderen Spieler auf dem Gerät parken
    state.bench[state.player] = { stats: state.stats, round: state.round, dirty: state.dirty };
    const b = state.bench[id] || {};
    state.stats = b.stats || {};
    state.round = b.round || null;
    state.dirty = b.dirty || {};
    delete state.bench[id];
  } else if (!state.player) {
    // erste Wahl: alles, was auf diesem Gerät schon gespielt wurde, gehört jetzt diesem Spieler
    const answered = Object.values(state.stats).reduce((n, items) => n + Object.keys(items || {}).length, 0);
    if (answered && !confirm(`Der bisherige Fortschritt auf diesem Gerät (${localLearned()} gewusst) gehört dann ${playerName(id)}. Stimmt das?`)) return;
    for (const [mode, items] of Object.entries(state.stats)) for (const item of Object.keys(items || {})) (state.dirty[mode] ||= {})[item] = 1;
  }
  state.player = id;
  if (state.remote?.players?.[id]) mergeRemoteIntoLocal(state.remote.players[id].stats);
  save();
  renderPlayerChip();
  goHome();
  push();
  pull();
}

/* ---------- Duell ---------- */

let duelMode = 'laender';

function scoreOf(stats) {
  const per = {};
  let total = 0, sure = 0, answers = 0, correct = 0, last = 0;
  for (const mode of Object.keys(MODES)) {
    const ids = mode === 'gewaesser' ? WATER.map(w => w.id) : COUNTRIES.map(c => c.iso);
    per[mode] = ids.filter(id => levelIn(stats, mode, id) >= KNOWN).length;
    sure += ids.filter(id => levelIn(stats, mode, id) === SURE).length;
    total += per[mode];
    for (const v of Object.values(stats?.[mode] || {})) {
      answers += v.n || 0; correct += v.c || 0;
      if ((v.t || 0) > last) last = v.t;
    }
  }
  return { per, total, sure, answers, correct, last };
}

function ago(t) {
  if (!t) return 'noch nie';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

function duelScores() {
  return PLAYERS.map(p => ({ ...p, sc: scoreOf(statsOf(p.id)) }));
}

function duelStrip() {
  if (!state.player) return '';
  const [a, b] = duelScores();
  const fa = a.sc.total || (b.sc.total ? 0 : 1), fb = b.sc.total || (a.sc.total ? 0 : 1);
  return `<button class="duel-strip" type="button" data-go="duell" aria-label="Duell: ${esc(a.name)} ${a.sc.total}, ${esc(b.name)} ${b.sc.total}">
    <span class="ds-name p-${a.id}">${esc(a.name)} <b>${a.sc.total}</b></span>
    <span class="ds-bar"><i class="p-${a.id}" style="flex:${fa}"></i><i class="p-${b.id}" style="flex:${fb}"></i></span>
    <span class="ds-name p-${b.id}"><b>${b.sc.total}</b> ${esc(b.name)}</span>
  </button>`;
}

function openDuel() {
  show('duel');
  renderDuel(true);
  pull();
}

function renderDuel(withMap = true) {
  const [a, b] = duelScores();
  const lead = a.sc.total === b.sc.total ? null : (a.sc.total > b.sc.total ? a : b);
  const diff = Math.abs(a.sc.total - b.sc.total);
  const verdict = !a.sc.total && !b.sc.total ? 'Noch hat niemand etwas gewusst. Wer fängt an?'
    : !lead ? 'Gleichstand!' : `${esc(lead.name)} liegt ${diff} vorne.`;
  const pct = sc => (sc.answers ? Math.round(sc.correct / sc.answers * 100) + ' %' : '–');
  const tabs = [['laender', 'Länder'], ['hauptstaedte', 'Hauptstädte'], ['flaggen', 'Flaggen'], ['gewaesser', 'Gewässer']];
  const total = mode => (mode === 'gewaesser' ? WATER.length : COUNTRIES.length);
  $('#view-duel').innerHTML = `
    <button class="back" type="button" data-act="home">‹ Zurück</button>
    <h2 class="h2">Duell</h2>
    <p class="lead">Gezählt wird, was du gerade weißt: die letzte Antwort war richtig. Eine falsche Antwort zieht es wieder ab.</p>
    <div class="duel-head">
      ${[a, b].map(p => `<div class="duel-side p-${p.id}${lead && lead.id === p.id ? ' lead' : ''}">
        <span class="duel-name">${esc(p.name)}${p.id === state.player ? ' <small>(du)</small>' : ''}</span>
        <span class="duel-total">${p.sc.total}</span>
        <span class="duel-sub">gewusst</span></div>`).join('<span class="duel-vs">gegen</span>')}
    </div>
    <p class="duel-verdict">${verdict}</p>
    <div class="duel-rows">
      ${tabs.map(([mode, label]) => `<div class="duel-row">
        <span class="duel-mode">${label}</span>
        <span class="duel-num p-${a.id}">${a.sc.per[mode]}</span>
        <span class="duel-bars" title="von ${total(mode)}"><i class="p-${a.id}" style="width:${a.sc.per[mode] / Math.max(1, a.sc.per[mode], b.sc.per[mode]) * 100}%"></i><i class="p-${b.id}" style="width:${b.sc.per[mode] / Math.max(1, a.sc.per[mode], b.sc.per[mode]) * 100}%"></i></span>
        <span class="duel-num p-${b.id}">${b.sc.per[mode]}</span>
      </div>`).join('')}
    </div>
    <dl class="duel-stats">
      <dt>Davon sicher</dt><dd>${a.sc.sure}</dd><dd>${b.sc.sure}</dd>
      <dt>Antworten</dt><dd>${a.sc.answers}</dd><dd>${b.sc.answers}</dd>
      <dt>Trefferquote</dt><dd>${pct(a.sc)}</dd><dd>${pct(b.sc)}</dd>
      <dt>Zuletzt gespielt</dt><dd>${ago(a.sc.last)}</dd><dd>${ago(b.sc.last)}</dd>
    </dl>
    <p class="field-label" style="margin-top:16px">Wer kann was? Auf der Karte:</p>
    <div class="options">${tabs.map(([id, l]) => `<button type="button" class="opt" data-dmode="${id}" aria-pressed="${id === duelMode}">${l}</button>`).join('')}</div>
    <div class="key"><span><i class="k-a"></i>nur ${esc(a.name)}</span><span><i class="k-b"></i>nur ${esc(b.name)}</span><span><i style="background:#86c895"></i>beide</span><span><i style="background:#e9e5de"></i>noch keiner</span></div>
    <div class="actions">${PLAYERS.map(p => `<button class="btn" type="button" data-pplayer-open="${p.id}">Karte von ${esc(p.name)}</button>`).join('')}</div>
    ${sync.online === false ? '<p class="hint" style="margin-top:10px">Gerade offline – der Stand wird nachgeholt, sobald wieder Internet da ist.</p>' : ''}`;
  $('#view-duel').querySelectorAll('[data-pplayer-open]').forEach(btn => btn.addEventListener('click', () => openProgress(btn.dataset.pplayerOpen)));
  // Vergleichskarte
  const mode = duelMode;
  const sa = statsOf(a.id), sb = statsOf(b.id);
  const cls = id => {
    const la = levelIn(sa, mode, id) >= KNOWN, lb = levelIn(sb, mode, id) >= KNOWN;
    return la && lb ? 'ab' : la ? 'a' : lb ? 'b' : null;
  };
  map.clear();
  if (mode === 'gewaesser') {
    for (const w of WATER) { const k = cls(w.id); if (k) map.setWaterClass(w.id, 'cmp-' + k); }
  } else {
    map.setCompare(Object.fromEntries(COUNTRIES.map(c => [c.iso, cls(c.iso)])));
  }
  if (withMap) map.showRegion('welt');
}

/* ================= Ereignisse ================= */

function wire() {
  document.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.go) {
      const g = t.dataset.go;
      if (MODES[g]) openSetup(g);
      else if (g === 'entdecken') openExplore();
      else if (g === 'fakten') openFacts();
      else if (g === 'fortschritt') openProgress();
      else if (g === 'duell') openDuel();
      return;
    }
    if (t.dataset.variant) { setup.variant = t.dataset.variant; renderSetup(); if (setup.mode === 'gewaesser') focusSetupRegion(); return; }
    if (t.dataset.region) { setup.region = t.dataset.region; renderSetup(); focusSetupRegion(); return; }
    if (t.dataset.count) { setup.count = t.dataset.count === 'alle' ? 'alle' : +t.dataset.count; renderSetup(); return; }
    if (t.dataset.flag && q && !q.answered) {
      const ok = t.dataset.flag === q.id;
      answer(ok, { id: t.dataset.flag, label: C.get(t.dataset.flag).name });
      return;
    }
    if (t.dataset.pmode) { progressMode = t.dataset.pmode; renderProgress(); return; }
    if (t.dataset.pplayer) { progressPlayer = t.dataset.pplayer; renderProgress(); return; }
    if (t.dataset.dmode) { duelMode = t.dataset.dmode; renderDuel(); return; }
    if (t.dataset.player) { choosePlayer(t.dataset.player); return; }
    switch (t.dataset.act) {
      case 'home': goHome(); break;
      case 'resume': resumeRound(); break;
      case 'start': startRound({ ...setup }); break;
      case 'hint': useHint(); break;
      case 'skip': skip(); break;
      case 'next': next(); break;
      case 'confirm-pick':
        if (q && q.pick && !q.answered) answer(q.pick.code === q.id, { id: q.pick.code, label: nameOf(q.pick.code, q.pick.props) });
        break;
      case 'retry': {
        const missed = round.results.filter(x => !x.ok).map(x => x.id);
        startRound({ mode: round.mode, variant: round.variant, region: round.region, count: missed.length }, shuffle(missed));
        break;
      }
      case 'again': openSetup(round.mode); break;
      case 'next-fact': factPos++; renderFact(); break;
      case 'switch-player': openChooser(true); break;
    }
  });

  $('#brand').addEventListener('click', goHome);
  $('#btn-player').addEventListener('click', () => openChooser(true));
  $('#btn-update').addEventListener('click', () => { push({ keepalive: true }); location.reload(); });
  $('#btn-quit').addEventListener('click', () => {
    if (round && round.results.length) finishRound(); else goHome();
  });
  const snd = $('#btn-sound');
  const syncSound = () => snd.setAttribute('aria-pressed', String(!!state.sound));
  syncSound();
  snd.addEventListener('click', () => {
    state.sound = !state.sound;
    save();
    syncSound();
    setSoundEnabled(state.sound);
    if (state.sound) sfx.correct();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.closest?.('input, button, textarea, select, label')) return;
    if (view === 'quiz' && q?.answered) { e.preventDefault(); next(); }
    else if (view === 'facts') { factPos++; renderFact(); }
  });
}

/* ================= Start ================= */

async function main() {
  watchKeyboard();
  setupSound(() => !!state.sound);
  let topo;
  try {
    const res = await fetch('data/world.json?v=3');
    if (!res.ok) throw new Error(res.status);
    topo = await res.json();
  } catch (err) {
    $('#view-home').innerHTML = '<h1 class="title">Weltquiz</h1><p class="lead">Die Weltkarte konnte nicht geladen werden. Prüf die Internetverbindung und lade die Seite neu.</p>';
    return;
  }
  map = new WorldMap($('#map'), topo);
  map.getInsets = insets;
  wire();
  renderPlayerChip();
  if (state.player) { renderHome(); show('home'); } else openChooser(false);
  map.showRegion('welt', { duration: 0 });
  startSync();
  if (new URLSearchParams(location.search).has('debug')) window.__wq = { startRound, openExplore, openFacts, openProgress, openDuel, choosePlayer, pull, push, checkUpdate, map, state };
}

main();
