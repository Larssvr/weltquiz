// Lädt die benötigten Natural-Earth-Rohdaten nach tools/../raw/
import fs from 'fs';
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FILES = ['ne_10m_admin_0_countries_deu', 'ne_50m_admin_0_countries', 'ne_10m_geography_marine_polys', 'ne_10m_lakes', 'ne_50m_lakes', 'ne_10m_populated_places_simple'];
fs.mkdirSync('../raw', { recursive: true });
for (const f of FILES) {
  const res = await fetch(BASE + f + '.geojson');
  if (!res.ok) throw new Error(f + ': ' + res.status);
  fs.writeFileSync(`../raw/${f}.geojson`, Buffer.from(await res.arrayBuffer()));
  console.log('ok', f);
}
