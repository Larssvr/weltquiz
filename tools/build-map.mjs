// Builds weltquiz/data/world.json (TopoJSON: countries, water, lakes) from Natural Earth.
import fs from 'fs';
import * as d3 from 'd3';
import { execFileSync } from 'child_process';

const RAW = '../raw/';
const OUT = '../data/';
const R_EARTH = 6371;
const km2 = g => d3.geoArea(g) * R_EARTH * R_EARTH;
fs.mkdirSync('build', { recursive: true });

const QUIZ = new Set(fs.readFileSync('../content/_list-europe.json','utf8') && [
  ...JSON.parse(fs.readFileSync('../content/_list-europe.json')),
  ...JSON.parse(fs.readFileSync('../content/_list-asia.json')),
  ...JSON.parse(fs.readFileSync('../content/_list-africa.json')),
  ...JSON.parse(fs.readFileSync('../content/_list-americas.json')),
  ...JSON.parse(fs.readFileSync('../content/_list-oceania.json')),
].map(x => x.iso));

// ---------- countries ----------
const src = JSON.parse(fs.readFileSync(RAW + 'ne_10m_admin_0_countries_deu.geojson'));
const NAME_FIX = { PGA: 'Spratly-Inseln', UM: 'Kleinere Amerikanische Überseeinseln', KY: 'Kaimaninseln', ESB: 'Dekelia (britische Militärbasis)', WSB: 'Akrotiri (britische Militärbasis)', BRT: 'Bir Tawil (von keinem Staat beansprucht)', SCR: 'Scarborough-Riff (umstritten)', EH: 'Westsahara (umstritten)', AQ: 'Antarktika', IOA: 'Weihnachtsinsel und Kokosinseln', GS: 'Südgeorgien', TF: 'Französische Süd- und Antarktisgebiete' };
const MERGE = { HKG: 'CN', MAC: 'CN', ALD: 'FI', USG: 'CU' };
const adminToIso = {};
for (const f of src.features) { const p = f.properties; if (QUIZ.has(p.ISO_A2_EH)) adminToIso[p.ADMIN] = p.ISO_A2_EH; }
adminToIso['Norway'] = 'NO'; adminToIso['France'] = 'FR';

function filterRings(geom, total) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const withArea = polys.map(p => ({ p, a: km2({ type: 'Polygon', coordinates: p }) }));
  withArea.sort((a, b) => b.a - a.a);
  const small = total < 6000;               // micro states & small island nations keep their islets
  const min = small ? 0.3 : 40;
  const keep = withArea.filter((x, i) => i === 0 || x.a >= min).map(x => x.p);
  return keep.length === 1 ? { type: 'Polygon', coordinates: keep[0] } : { type: 'MultiPolygon', coordinates: keep };
}

const countries = [];
const seen = new Set();
for (const f of src.features) {
  const p = f.properties;
  let code = MERGE[p.ADM0_A3] || p.ISO_A2_EH;
  if (p.ADM0_A3 === 'ATC' || p.ADM0_A3 === 'IOA' || p.ADM0_A3 === 'CSI') code = p.ADM0_A3; // Australian external territories share AU
  const quiz = QUIZ.has(code);
  if (!quiz && !/^[A-Z]{3}$/.test(code)) code = (p.ISO_A2_EH && p.ISO_A2_EH !== '-99') ? p.ISO_A2_EH : p.ADM0_A3;
  const total = km2(f.geometry);
  const props = { c: code };
  if (p.LABEL_X != null && !MERGE[p.ADM0_A3]) { props.lx = +(+p.LABEL_X).toFixed(2); props.ly = +(+p.LABEL_Y).toFixed(2); }
  if (!quiz) { props.t = 1; props.n = NAME_FIX[code] || p.NAME_DE; const s = adminToIso[p.SOVEREIGNT]; if (s && s !== code) props.s = s; }
  countries.push({ type: 'Feature', properties: props, geometry: filterRings(f.geometry, total) });
  if (quiz) seen.add(code);
}
const missing = [...QUIZ].filter(c => !seen.has(c));
console.log('countries features', countries.length, 'quiz', QUIZ.size, 'covered', seen.size, 'missing', missing, [...seen].filter(c=>!QUIZ.has(c)));
fs.writeFileSync('build/countries.json', JSON.stringify({ type: 'FeatureCollection', features: countries }));

// ---------- water (marine polys + lakes) ----------
const list = JSON.parse(fs.readFileSync('../content/_list-water.json'));
const marine = JSON.parse(fs.readFileSync(RAW + 'ne_10m_geography_marine_polys.geojson'));
const lakes10 = JSON.parse(fs.readFileSync(RAW + 'ne_10m_lakes.geojson'));
const lakes50 = JSON.parse(fs.readFileSync(RAW + 'ne_50m_lakes.geojson'));

const byMarine = {}, byLake = {};
for (const w of list) {
  for (const n of w.marine || []) (byMarine[n] ||= []).push(w.id);
  for (const n of w.lakes || []) (byLake[n] ||= []).push(w.id);
}
const water = [];
const foundMarine = new Set();
for (const f of marine.features) {
  const ids = byMarine[f.properties.name];
  if (!ids) continue;
  foundMarine.add(f.properties.name);
  water.push({ type: 'Feature', properties: { w: ids.join(' ') }, geometry: f.geometry });
}
const lakeOut = [];
const foundLake = new Set();
for (const f of lakes10.features) {
  const ids = byLake[f.properties.name];
  if (!ids) continue;
  if (foundLake.has(f.properties.name) && f.properties.name === 'Dead Sea') continue; // two Dead Sea parts: keep both? keep first only if duplicate outline
  foundLake.add(f.properties.name);
  lakeOut.push({ type: 'Feature', properties: { w: ids.join(' ') }, geometry: f.geometry });
}
// background lakes (not quizzed) so the map looks right, from 50m
const quizLakeNames = new Set(Object.keys(byLake));
let bg = 0;
for (const f of lakes50.features) {
  const p = f.properties;
  if (quizLakeNames.has(p.name)) continue;
  if (p.scalerank > 1) continue;
  if (km2(f.geometry) < 900) continue;
  lakeOut.push({ type: 'Feature', properties: { w: '' }, geometry: f.geometry }); bg++;
}
const missM = Object.keys(byMarine).filter(n => !foundMarine.has(n));
const missL = Object.keys(byLake).filter(n => !foundLake.has(n));
console.log('water features', water.length, 'missing marine', missM, '| lakes', lakeOut.length, '(bg', bg + ')', 'missing lakes', missL);
fs.writeFileSync('build/water.json', JSON.stringify({ type: 'FeatureCollection', features: water }));
fs.writeFileSync('build/lakes.json', JSON.stringify({ type: 'FeatureCollection', features: lakeOut }));

fs.mkdirSync(OUT, { recursive: true });
const pct = { countries: process.argv[2] || '7%', water: process.argv[3] || '3%', lakes: process.argv[4] || '10%' };
const layers = {};
for (const name of ['countries', 'water', 'lakes']) {
  // Länder vorher in Einzelinseln zerlegen, sonst behält keep-shapes nur die größte Insel je Land
  const explode = name === 'countries' ? ['-explode'] : [];
  execFileSync('npx', ['mapshaper', '-i', `build/${name}.json`, ...explode, '-simplify', 'visvalingam', 'weighted', 'keep-shapes', 'percentage=' + pct[name],
    '-o', 'format=geojson', 'precision=0.0001', `build/${name}-s.json`], { stdio: 'inherit' });
  layers[name] = JSON.parse(fs.readFileSync(`build/${name}-s.json`));
  if (name === 'countries') {
    // Teile wieder zu einem Feature je Ländercode zusammenfügen
    const groups = new Map();
    for (const f of layers[name].features) {
      if (!f.geometry) continue;
      const c = f.properties.c;
      if (!groups.has(c)) groups.set(c, { type: 'Feature', properties: { ...f.properties }, polys: [] });
      const g = groups.get(c);
      if (g.properties.lx == null && f.properties.lx != null) Object.assign(g.properties, f.properties);
      if (f.geometry.type === 'Polygon') g.polys.push(f.geometry.coordinates); else g.polys.push(...f.geometry.coordinates);
    }
    layers[name].features = [...groups.values()].map(g => ({ type: 'Feature', properties: g.properties,
      geometry: g.polys.length === 1 ? { type: 'Polygon', coordinates: g.polys[0] } : { type: 'MultiPolygon', coordinates: g.polys } }));
  }
  // d3-geo erwartet Außenringe im Uhrzeigersinn: Polygone, die „größer als eine Halbkugel“ sind, umdrehen
  let flipped = 0;
  for (const f of layers[name].features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const rings of polys) {
      if (d3.geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI) { rings.forEach(r => r.reverse()); flipped++; }
    }
  }
  console.log(name, 'umgedrehte Polygone:', flipped);
}
const { topology } = await import('topojson-server');
const topo = topology(layers, 1e5);
fs.writeFileSync(OUT + 'world.json', JSON.stringify(topo));
const size = fs.statSync(OUT + 'world.json').size;
console.log('world.json', (size / 1024).toFixed(0) + ' KB', Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.features.length])));
