// Geometrie für Minispiele: Entfernungen zwischen Ländern und Orten, Mittelpunkte, Himmelsrichtungen.
// Reine Funktionen über der Weltkarte (WorldMap aus js/map.js). Karteneinheiten sind Mercator: Die Welt ist W breit
// und wiederholt sich waagerecht – Länder an der Datumsgrenze reichen deshalb auch über x < 0 oder x > W hinaus.
import { W } from '../map.js?v=18';

const R = 6371;   // Erdradius in km

export const WINDS = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

/** Entfernung zweier Orte [lon, lat] in km (Großkreis). */
export function km([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Zwischenspeicher je Karte und Art (Ringe, Punkte, Entfernungen)
const caches = new WeakMap();
function store(map, kind) {
  let m = caches.get(map);
  if (!m) caches.set(map, (m = {}));
  return (m[kind] ||= new Map());
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

/**
 * Kernland eines Landes als Ringe in Karteneinheiten. Dazu gehört, was im Kamerarahmen map.countryBox(code)
 * samt kleinem Rand liegt (wie beim Umriss, map.silhouette), und jeder Ring mit mindestens einem Viertel der
 * Fläche des größten – Alaska zählt zu den USA, auch wenn die Kamera es ausspart. Kleine ferne Gebiete
 * (Französisch-Guayana, Kanaren, Hawaii, Andamanen) zählen nicht. Ringe jenseits der Datumsgrenze liegen in der
 * Weltkopie neben dem Rest des Landes (x kann unter 0 oder über W liegen).
 */
export function coreRings(map, code) {
  const memo = store(map, 'rings');
  if (memo.has(code)) return memo.get(code);
  const focus = map.countryBox(code);
  const pad = Math.max(focus[1][0] - focus[0][0], focus[1][1] - focus[0][1]) * 0.15;
  const fx = (focus[0][0] + focus[1][0]) / 2;
  const pieces = [];
  for (const h of map.hit) {
    if (h.c === code) h.rings.forEach((r, i) => pieces.push({ r, b: h.ringBoxes[i], a: Math.abs(ringArea(r)) }));
  }
  const big = Math.max(0, ...pieces.map(p => p.a)) * 0.25;
  const rings = [];
  for (const { r, b, a } of pieces) {
    let dx = [0, -W, W].find(d => b[1][0] + d >= focus[0][0] - pad && b[0][0] + d <= focus[1][0] + pad
      && b[1][1] >= focus[0][1] - pad && b[0][1] <= focus[1][1] + pad);
    if (dx == null) {
      if (a < big) continue;
      dx = Math.round((fx - (b[0][0] + b[1][0]) / 2) / W) * W;   // großer Landesteil abseits: neben das Kernland
    }
    rings.push(dx ? r.map(([x, y]) => [x + dx, y]) : r);
  }
  memo.set(code, rings);
  return rings;
}

/** Punkte [lon, lat] der Kernringe, ausgedünnt auf etwa 400 je Land: jeder k-te Punkt, je Ring aber mindestens 8. */
export function corePoints(map, code) {
  const memo = store(map, 'points');
  if (memo.has(code)) return memo.get(code);
  const rings = coreRings(map, code);
  const k = Math.max(1, Math.ceil(rings.reduce((n, r) => n + r.length, 0) / 400));
  const pts = [];
  for (const r of rings) {
    const step = Math.max(1, Math.min(k, Math.floor(r.length / 8)));
    for (let i = 0; i < r.length; i += step) pts.push(map.projection.invert(r[i]));
  }
  memo.set(code, pts);
  return pts;
}

// Kernpunkte als Einheitsvektoren: Der kürzeste Abstand lässt sich so ohne Winkelfunktionen suchen
function vectors(map, code) {
  const memo = store(map, 'vectors');
  if (!memo.has(code)) {
    const r = Math.PI / 180;
    memo.set(code, corePoints(map, code).map(([lon, lat]) => [Math.cos(lat * r) * Math.cos(lon * r), Math.cos(lat * r) * Math.sin(lon * r), Math.sin(lat * r)]));
  }
  return memo.get(code);
}

/**
 * Entfernung zweier Länder in km: 0 für dasselbe Land und für Nachbarn mit gemeinsamer Grenze laut
 * map.neighborGraph(), sonst der kürzeste Abstand ihrer Kernpunkte (corePoints). Unbekannter Code: Infinity.
 */
export function betweenKm(map, a, b) {
  if (a === b) return 0;
  const graph = map.neighborGraph();
  if (graph.get(a)?.has(b) || graph.get(b)?.has(a)) return 0;
  const memo = store(map, 'between');
  const key = a < b ? a + '|' + b : b + '|' + a;
  if (memo.has(key)) return memo.get(key);
  const A = vectors(map, a), B = vectors(map, b);
  let best = Infinity;   // Quadrat der Sehne durch die Erdkugel
  for (const [ax, ay, az] of A) {
    for (const [bx, by, bz] of B) {
      const d = (ax - bx) * (ax - bx) + (ay - by) * (ay - by) + (az - bz) * (az - bz);
      if (d < best) best = d;
    }
  }
  const out = best === Infinity ? Infinity : 2 * R * Math.asin(Math.min(1, Math.sqrt(best) / 2));
  memo.set(key, out);
  return out;
}

/**
 * Entfernung eines Ortes [lon, lat] zu einem Land: { km, nearest: [lon, lat] }. Liegt der Ort im Land (auch in
 * einem fernen Landesteil), ist km 0 und nearest der Ort selbst. Sonst zählt der nächste Punkt auf dem Rand des
 * Kernlands – gesucht auf jeder Strecke der Kernringe, nicht nur an den Eckpunkten: An langen geraden Grenzen
 * (Ägypten–Libyen, 49. Breitengrad) lägen die sonst weit weg. Unbekannter Code: { km: Infinity, nearest: null }.
 */
export function toCountryKm(map, point, code) {
  const p = map.projection(point);
  const px = ((p[0] % W) + W) % W, py = p[1];
  if (map.hitTest(px, py, 0, { water: false })?.code === code) return { km: 0, nearest: [point[0], point[1]] };
  let best = { km: Infinity, nearest: null };
  for (const r of coreRings(map, code)) {
    for (let i = 0, n = r.length; i < n; i++) {
      let [ax, ay] = r[i], [bx, by] = r[(i + 1) % n];
      // die Kopie der Strecke, die dem Ort am nächsten liegt (Datumsgrenze)
      const dx = Math.round((px - (ax + bx) / 2) / W) * W;
      ax += dx; bx += dx;
      const vx = bx - ax, vy = by - ay, len = vx * vx + vy * vy;
      const t = len ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len)) : 0;
      const q = map.projection.invert([ax + t * vx, ay + t * vy]);
      const d = km(point, q);
      if (d < best.km) best = { km: d, nearest: q };
    }
  }
  return best;
}

/** Mitte des Kamerarahmens eines Landes (map.countryBox) als [lon, lat]. */
export function centerOf(map, code) {
  const [[x0, y0], [x1, y1]] = map.countryBox(code);
  return map.projection.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
}

/**
 * Himmelsrichtung von einem Land zum anderen, so wie sie auf dieser Karte aussieht (Mercator, oben ist Norden),
 * von Mitte zu Mitte der Kamerarahmen und über den kürzeren Weg um die Erde: 0–7 für Norden, Nordosten, Osten,
 * Südosten, Süden, Südwesten, Westen, Nordwesten – Index in WINDS und ARROWS. null, wenn die Mitten zusammenfallen.
 */
export function direction(map, fromCode, toCode) {
  const mid = code => { const [[x0, y0], [x1, y1]] = map.countryBox(code); return [(x0 + x1) / 2, (y0 + y1) / 2]; };
  const [ax, ay] = mid(fromCode), [bx, by] = mid(toCode);
  let dx = bx - ax;
  dx -= Math.round(dx / W) * W;
  const dy = by - ay;
  if (!dx && !dy) return null;
  return ((Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) % 8) + 8) % 8;   // atan2(dx, -dy): 0 = oben, im Uhrzeigersinn
}
