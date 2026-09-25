// Führt die Inhalte (content/*.json) mit Natural-Earth-Koordinaten zusammen → weltquiz/js/data/*.js
import fs from 'fs';

const CONTENT = '../content/';
const OUT = '../js/data/';
const read = f => { try { return JSON.parse(fs.readFileSync(CONTENT + f, 'utf8')); } catch { return null; } };

const lists = {
  europe: read('_list-europe.json'), asia: read('_list-asia.json'), africa: read('_list-africa.json'),
  americas: read('_list-americas.json'), oceania: read('_list-oceania.json'),
};
const SOUTH = new Set('AR BO BR CL CO EC GY PE PY SR UY VE'.split(' '));
const regionsFor = (iso, list) => {
  if (list === 'europe') return iso === 'RU' ? ['europa', 'asien'] : ['europa'];
  if (list === 'asia') return ['TR', 'CY'].includes(iso) ? ['asien', 'europa'] : ['asien'];
  if (list === 'africa') return ['afrika'];
  if (list === 'americas') return [SOUTH.has(iso) ? 'suedamerika' : 'nordamerika'];
  return ['ozeanien'];
};

// NE-Hauptstädte
const places = JSON.parse(fs.readFileSync('../raw/ne_10m_populated_places_simple.geojson')).features.map(f => f.properties);
const A3 = { KOS: 'XK', SOL: 'SO', PSX: 'PS' };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
const capRows = places.filter(p => /Admin-0/.test(p.featurecla) || p.adm0cap === 1);
const MANUAL = {
  'BI:Gitega': [-3.4264, 29.9306], 'KZ:Astana': [51.1694, 71.4491], 'NR:Yaren': [-0.5477, 166.9209],
  'PW:Ngerulmud': [7.5006, 134.6242], 'ME:Cetinje': [42.3906, 18.9142], 'PS:Ostjerusalem': [31.7833, 35.2333],
  'TZ:Dodoma': [-6.163, 35.7516], 'KI:Süd-Tarawa': [1.33, 173.02], 'LK:Sri Jayawardenepura Kotte': [6.9, 79.95],
  'BO:Sucre': [-19.0431, -65.2592], 'CI:Yamoussoukro': [6.8276, -5.2893], 'SZ:Lobamba': [-26.4667, 31.2],
  'IL:Jerusalem': [31.778, 35.207], 'BJ:Porto-Novo': [6.4969, 2.6289], 'ZA:Kapstadt': [-33.9249, 18.4241],
  'ZA:Bloemfontein': [-29.1211, 26.214], 'NL:Den Haag': [52.0705, 4.3007], 'MY:Putrajaya': [2.9264, 101.6964],
  'MM:Naypyidaw': [19.7633, 96.0785], 'ID:Nusantara': [-0.9734, 116.7061], 'GQ:Ciudad de la Paz': [1.5667, 10.6167],
};
function coords(iso, cap, isMain) {
  const m = MANUAL[`${iso}:${cap.name}`];
  if (m) return m;
  const names = [cap.name, ...(cap.aliases || [])].map(norm);
  const rows = capRows.filter(p => (A3[p.adm0_a3] || p.iso_a2) === iso);
  const hit = rows.find(p => [p.name, p.namealt, p.nameascii, p.namepar].some(n => n && names.includes(norm(n))));
  if (hit) return [hit.latitude, hit.longitude];
  if (isMain) {
    const main = rows.find(p => p.featurecla === 'Admin-0 capital');
    if (main) { console.warn('  fallback coords', iso, cap.name, '→', main.name); return [main.latitude, main.longitude]; }
  }
  console.warn('  NO coords', iso, cap.name);
  return null;
}

const ne = JSON.parse(fs.readFileSync('../raw/ne_50m_admin_0_countries.geojson')).features.map(f => f.properties);
const neBy = iso => ne.find(p => p.ISO_A2_EH === iso && p.ADM0_A3 !== 'ATC' && p.ADM0_A3 !== 'IOA');

const countries = [];
const problems = [];
for (const [list, arr] of Object.entries(lists)) {
  const content = read(`countries-${list}.json`);
  const byIso = new Map((content || []).map(c => [c.iso, c]));
  if (!content) console.warn(`(${list}: noch kein Inhalt – Platzhalter)`);
  for (const { iso } of arr) {
    let c = byIso.get(iso);
    if (!c) {
      const p = neBy(iso);
      const capRow = capRows.find(r => (A3[r.adm0_a3] || r.iso_a2) === iso && r.featurecla === 'Admin-0 capital');
      c = { iso, name: p?.NAME_DE || iso, aliases: [p?.NAME_EN].filter(Boolean), capital: { name: capRow?.name || '?', aliases: [] }, otherCapitals: [], capitalNote: '', languages: [], moreLanguages: false, currency: '', facts: [], placeholder: true };
    }
    const caps = [c.capital, ...(c.otherCapitals || [])];
    caps.forEach((cap, i) => {
      const xy = coords(iso, cap, i === 0);
      if (xy) { cap.lat = +xy[0].toFixed(3); cap.lon = +xy[1].toFixed(3); }
      cap.aliases = [...new Set((cap.aliases || []).filter(a => a && a !== cap.name))];
    });
    c.aliases = [...new Set((c.aliases || []).filter(a => a && a !== c.name))];
    // „St.“-Namen auch als „Saint/Sankt“ finden
    if (/^St\. /.test(c.name)) c.aliases.push(c.name.replace(/^St\. /, 'Saint '), c.name.replace(/^St\. /, 'Sankt '));
    if (c.facts?.length !== 3 && !c.placeholder) problems.push(`${iso}: ${c.facts?.length} Fakten`);
    countries.push({
      iso, name: c.name, aliases: c.aliases, capital: c.capital, otherCapitals: c.otherCapitals || [],
      capitalNote: c.capitalNote || '', languages: c.languages || [], moreLanguages: !!c.moreLanguages,
      currency: c.currency || '', facts: c.facts || [], regions: regionsFor(iso, list),
    });
  }
}

// Doppelte Namen/Aliase zwischen Ländern melden
const seen = new Map();
for (const c of countries) for (const n of [c.name, ...c.aliases]) {
  const k = norm(n);
  if (seen.has(k) && seen.get(k) !== c.iso) problems.push(`Alias „${n}“ bei ${c.iso} und ${seen.get(k)}`);
  else seen.set(k, c.iso);
}

// Gewässer
const wlist = read('_list-water.json');
const wcontent = read('water.json');
const wBy = new Map((wcontent || []).map(w => [w.id, w]));
if (!wcontent) console.warn('(water: noch kein Inhalt – Platzhalter)');
const water = wlist.map(x => {
  const w = wBy.get(x.id) || { id: x.id, name: x.de, aliases: [], kind: x.kind, borders: [], facts: [] };
  const kind = w.kind || x.kind;
  return { id: x.id, name: w.name, aliases: [...new Set((w.aliases || []).filter(a => a !== w.name))], kind,
    group: /^(See|Salzsee|Stausee)$/.test(kind) ? 'see' : 'meer', borders: w.borders || [], facts: w.facts || [] };
});

const world = read('world-facts.json') || [];

// Bekannte Städte, die keine Hauptstadt sind (oder es früher waren) – Stolperfallen im Hauptstadt-Quiz
const CITY_LIST = [
  ['AU', 'Sydney'], ['AU', 'Melbourne'], ['NZ', 'Auckland'], ['TR', 'Istanbul', ['Konstantinopel', 'Stambul']], ['TR', 'Izmir'],
  ['BR', 'Rio de Janeiro', ['Rio']], ['BR', 'São Paulo', ['Sao Paulo']], ['BR', 'Salvador'],
  ['US', 'New York', ['New York City', 'NYC']], ['US', 'Los Angeles'], ['US', 'Chicago'], ['US', 'Miami'], ['US', 'San Francisco'],
  ['CA', 'Toronto'], ['CA', 'Montreal', ['Montréal']], ['CA', 'Vancouver'],
  ['CH', 'Zürich', ['Zurich']], ['CH', 'Genf', ['Geneva', 'Genève']], ['CH', 'Basel'],
  ['IT', 'Mailand', ['Milan', 'Milano']], ['IT', 'Neapel', ['Naples', 'Napoli']], ['IT', 'Venedig', ['Venice', 'Venezia']], ['IT', 'Florenz', ['Florence', 'Firenze']],
  ['ES', 'Barcelona'], ['ES', 'Sevilla', ['Seville']], ['FR', 'Marseille'], ['FR', 'Lyon'], ['FR', 'Nizza', ['Nice']],
  ['DE', 'München', ['Munich']], ['DE', 'Hamburg'], ['DE', 'Frankfurt am Main', ['Frankfurt']], ['DE', 'Bonn'],
  ['AT', 'Salzburg'], ['BE', 'Antwerpen', ['Antwerp']], ['NL', 'Rotterdam'], ['SE', 'Göteborg', ['Gothenburg']], ['NO', 'Bergen'],
  ['GB', 'Edinburgh'], ['GB', 'Manchester'], ['GB', 'Glasgow'], ['GB', 'Liverpool'], ['PT', 'Porto'], ['PL', 'Krakau', ['Kraków', 'Krakow', 'Cracow']],
  ['PL', 'Danzig', ['Gdańsk', 'Gdansk']], ['GR', 'Thessaloniki'], ['HR', 'Dubrovnik'], ['RU', 'Sankt Petersburg', ['St. Petersburg', 'Saint Petersburg', 'Leningrad']],
  ['UA', 'Odessa', ['Odesa']], ['MC', 'Monte-Carlo', ['Monte Carlo']],
  ['MA', 'Casablanca'], ['MA', 'Marrakesch', ['Marrakech', 'Marrakesh']], ['NG', 'Lagos'], ['ZA', 'Johannesburg'], ['ZA', 'Durban'],
  ['EG', 'Alexandria'], ['TZ', 'Dar es Salaam'], ['ML', 'Timbuktu', ['Tombouctou']], ['KE', 'Mombasa'],
  ['KZ', 'Almaty', ['Alma-Ata']], ['UZ', 'Samarkand'], ['PK', 'Karatschi', ['Karachi']], ['PK', 'Lahore'],
  ['IN', 'Mumbai', ['Bombay']], ['IN', 'Kalkutta', ['Kolkata', 'Calcutta']], ['IN', 'Bangalore', ['Bengaluru']],
  ['CN', 'Shanghai'], ['CN', 'Hongkong', ['Hong Kong']], ['JP', 'Osaka'], ['JP', 'Kyoto'], ['KR', 'Busan', ['Pusan']],
  ['AE', 'Dubai'], ['SA', 'Dschidda', ['Jeddah', 'Jidda']], ['SA', 'Mekka', ['Mecca', 'Makkah']], ['IL', 'Tel Aviv'], ['SY', 'Aleppo'],
  ['VN', 'Ho-Chi-Minh-Stadt', ['Ho Chi Minh City', 'Saigon', 'Saigun']], ['MM', 'Rangun', ['Yangon', 'Rangoon']], ['MM', 'Mandalay'],
  ['EC', 'Guayaquil'], ['CO', 'Medellín', ['Medellin']], ['CL', 'Valparaíso', ['Valparaiso']], ['PE', 'Cusco', ['Cuzco']], ['BO', 'Santa Cruz de la Sierra', ['Santa Cruz']],
];
const allPlaces = places;
const cityOut = [];
for (const [iso, name, aliases = []] of CITY_LIST) {
  const keys = [name, ...aliases].map(norm);
  const cands = allPlaces.filter(p => (A3[p.adm0_a3] || p.iso_a2) === iso && [p.name, p.namealt, p.nameascii, p.namepar].some(n => n && keys.includes(norm(n))));
  cands.sort((a, b) => (b.pop_max || 0) - (a.pop_max || 0));
  const CITY_XY = { 'CN:Hongkong': [22.302, 114.177], 'MC:Monte-Carlo': [43.74, 7.427] };
  const hit = cands[0] || (CITY_XY[`${iso}:${name}`] && { latitude: CITY_XY[`${iso}:${name}`][0], longitude: CITY_XY[`${iso}:${name}`][1] });
  if (!hit) console.warn('  Stadt ohne Koordinaten:', iso, name);
  // Nicht aufnehmen, wenn die Stadt bereits als (weitere) Hauptstadt geführt wird
  const c = countries.find(x => x.iso === iso);
  if (c && [c.capital, ...c.otherCapitals].some(cap => [cap.name, ...(cap.aliases || [])].map(norm).some(n => keys.includes(n)))) continue;
  cityOut.push({ iso, name, aliases, lat: hit ? +hit.latitude.toFixed(3) : null, lon: hit ? +hit.longitude.toFixed(3) : null });
}

fs.mkdirSync(OUT, { recursive: true });
const js = (name, data) => `// Automatisch erzeugt aus content/ – nicht von Hand bearbeiten.\nexport const ${name} = ${JSON.stringify(data)};\n`;
fs.writeFileSync(OUT + 'countries.js', js('COUNTRIES', countries));
fs.writeFileSync(OUT + 'water.js', js('WATER', water));
fs.writeFileSync(OUT + 'world-facts.js', js('WORLD_FACTS', world));
fs.writeFileSync(OUT + 'cities.js', js('CITIES', cityOut));
console.log('Stolperstädte', cityOut.length); console.log('Länder', countries.length, 'davon Platzhalter', countries.filter(c => !c.facts.length).length, '| Gewässer', water.length, '| Weltfakten', world.length);
if (problems.length) console.log('Hinweise:\n  ' + problems.join('\n  '));
