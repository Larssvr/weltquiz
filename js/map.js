// Weltkarte: Mercator, horizontal endlos (drei Kacheln), Zoom/Pan, Hervorhebungen, Klick-Erkennung.
/* global d3, topojson */

export const W = 1000;                       // Breite der Welt in Karteneinheiten
const LAT_TOP = 84, LAT_BOTTOM = -80;
const R = W / (2 * Math.PI);
const yOf = lat => -R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
const Y0 = yOf(LAT_TOP);
export const H = yOf(LAT_BOTTOM) - Y0;       // Höhe der Welt in Karteneinheiten

const PALETTE_SIZE = 6;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ausschnitte (lon/lat), die der automatische Zuschnitt schlecht trifft (Überseegebiete, Datumsgrenze).
const FOCUS_OVERRIDE = {
  US: [-125, 24, -66.5, 49.5], FR: [-5.2, 41.3, 9.6, 51.1], NL: [3.3, 50.7, 7.3, 53.6],
  NO: [4.5, 57.9, 31.2, 71.2], ES: [-9.4, 35.9, 4.4, 43.8], PT: [-9.6, 36.9, -6.1, 42.2],
  CL: [-76, -56, -66.4, -17.4], EC: [-81.2, -5.1, -75.1, 1.5], RU: [27, 41, 190, 78],
  FJ: [176.8, -19.3, 181, -15.6], KI: [169, -11.5, 210, 4.8], NZ: [166, -47.5, 178.7, -34.3],
  AU: [112.8, -43.8, 153.8, -10.6], DK: [8, 54.5, 15.3, 57.8], GB: [-8.3, 49.9, 1.9, 60.9],
  YE: [42.5, 12.5, 54, 19], IN: [68, 6.5, 97.5, 35.7], CO: [-79.1, -4.3, -66.8, 12.5],
  TV: [176, -10.8, 180, -5.6], MU: [57.2, -20.6, 57.9, -19.9], SC: [55.2, -4.9, 55.9, -4.2],
};

// Regionen für Rundenauswahl (lon/lat, lon darf über 180 hinausgehen)
export const REGION_BOX = {
  welt: [-170, -56, 190, 76],
  europa: [-24, 34, 45, 71],
  asien: [26, -10, 146, 55],
  afrika: [-19, -35, 52, 37],
  nordamerika: [-168, 7, -52, 72],
  suedamerika: [-82, -55, -34, 12.5],
  ozeanien: [112, -47, 190, 16],
};

export class WorldMap {
  constructor(container, topo) {
    this.container = container;
    this.topo = topo;
    this.projection = d3.geoMercator().scale(R).translate([W / 2, -Y0]).clipExtent([[0, 0], [W, H]]);
    this.path = d3.geoPath(this.projection).digits(2);
    this.transform = d3.zoomIdentity;
    this.onClick = null;
    this.labelMode = false;
    this.overlayItems = [];   // {x, y, el, kind}
    this._build();
  }

  // ---------- Aufbau ----------
  _build() {
    const { topo } = this;
    const countries = topojson.feature(topo, topo.objects.countries).features;
    const water = topojson.feature(topo, topo.objects.water).features;
    const lakes = topojson.feature(topo, topo.objects.lakes).features;
    this.countryFeatures = countries;
    this.byCode = d3.group(countries, f => f.properties.c);
    this.waterFeatures = [...water.map(f => ({ f, lake: false })), ...lakes.map(f => ({ f, lake: true }))];
    this.byWater = new Map();
    for (const w of this.waterFeatures) {
      for (const id of (w.f.properties.w || '').split(' ').filter(Boolean)) {
        if (!this.byWater.has(id)) this.byWater.set(id, []);
        this.byWater.get(id).push(w);
      }
    }
    this._colorize(countries);

    const svg = this.svg = d3.select(this.container).append('svg')
      .attr('class', 'map-svg').attr('role', 'img').attr('aria-label', 'Weltkarte');
    this.viewport = svg.append('g').attr('class', 'viewport');
    const tile = this.tile = this.viewport.append('g').attr('id', 'tile0');
    tile.append('rect').attr('class', 'sea').attr('width', W).attr('height', H);
    tile.append('path').attr('class', 'graticule').attr('d', this.path(d3.geoGraticule().step([15, 15])()));
    this.waterSel = tile.append('g').attr('class', 'water-hl').selectAll('path')
      .data(this.waterFeatures.filter(w => !w.lake)).join('path').attr('d', w => this.path(w.f));
    this.landSel = tile.append('g').attr('class', 'land').selectAll('path')
      .data(countries).join('path')
      .attr('d', f => this.path(f))
      .attr('class', f => `c${f.properties.color}${f.properties.t ? ' terr' : ''}${f.properties.c === 'AQ' ? ' ice' : ''}`)
      .attr('data-c', f => f.properties.c);
    this.lakeSel = tile.append('g').attr('class', 'lakes').selectAll('path')
      .data(this.waterFeatures.filter(w => w.lake)).join('path').attr('d', w => this.path(w.f));
    const obj = topo.objects.countries;
    tile.append('path').attr('class', 'borders')
      .attr('d', this.path(topojson.mesh(topo, obj, (a, b) => a !== b && a.properties.c !== b.properties.c)));
    tile.append('path').attr('class', 'coast').attr('d', this.path(topojson.mesh(topo, obj, (a, b) => a === b)));
    this.hlLayer = tile.append('g').attr('class', 'hl-outlines');
    for (const dx of [-W, W]) this.viewport.append('use').attr('href', '#tile0').attr('x', dx);
    this.overlay = svg.append('g').attr('class', 'overlay');
    this.labelLayer = svg.append('g').attr('class', 'labels');

    // Projektionen für Klick-Erkennung und Zuschnitt vorberechnen
    this.hit = countries.map(f => {
      const rings = this._rings(f);
      return { f, c: f.properties.c, rings, box: ringsBox(rings) };
    });
    this.waterHit = this.waterFeatures.map(w => {
      const rings = this._rings(w.f);
      return { w, rings, box: ringsBox(rings) };
    });

    this.zoom = d3.zoom()
      .scaleExtent([0.3, 60])
      .constrain((t, extent) => this._constrain(t, extent))
      .on('zoom', e => this._onZoom(e.transform));
    svg.call(this.zoom).on('dblclick.zoom', null);
    svg.on('click', e => this._click(e));

    this._resize();
    new ResizeObserver(() => this._resize()).observe(this.container);
  }

  _rings(feature) {
    const rings = [];
    let cur = null;
    const ctx = {
      moveTo(x, y) { cur = [[x, y]]; rings.push(cur); },
      lineTo(x, y) { cur.push([x, y]); },
      closePath() {}, arc() {}, rect() {},
    };
    d3.geoPath(this.projection, ctx)(feature);
    return rings;
  }

  _colorize(features) {
    // Nachbarn bekommen verschiedene Pastellfarben; Überseegebiete die Farbe ihres Mutterlandes.
    const groupOf = f => f.properties.s || f.properties.c;
    const neighbors = topojson.neighbors(this.topo.objects.countries.geometries);
    const adj = new Map();
    features.forEach((f, i) => {
      const g = groupOf(f);
      if (!adj.has(g)) adj.set(g, new Set());
      for (const j of neighbors[i]) {
        const h = groupOf(features[j]);
        if (h !== g) adj.get(g).add(h);
      }
    });
    const order = [...adj.keys()].sort((a, b) => adj.get(b).size - adj.get(a).size || a.localeCompare(b));
    const color = new Map();
    const use = new Array(PALETTE_SIZE).fill(0);
    for (const g of order) {
      const taken = new Set([...adj.get(g)].map(h => color.get(h)));
      let best = -1;
      for (let c = 0; c < PALETTE_SIZE; c++) if (!taken.has(c) && (best < 0 || use[c] < use[best])) best = c;
      if (best < 0) best = 0;
      color.set(g, best); use[best]++;
    }
    for (const f of features) f.properties.color = color.get(groupOf(f));
  }

  // ---------- Zoom ----------
  _resize() {
    const r = this.container.getBoundingClientRect();
    const vw = Math.max(1, r.width), vh = Math.max(1, r.height);
    if (this._initialized && vw === this.vw && vh === this.vh) return;   // nichts geändert: laufende Flüge nicht abbrechen
    this.vw = vw; this.vh = vh;
    this.svg.attr('viewBox', null).attr('width', this.vw).attr('height', this.vh);
    this.kMin = Math.max(Math.min(this.vh / H, this.vw / W) * 0.98, this.vw / (2 * W));
    this.zoom.extent([[0, 0], [this.vw, this.vh]]).scaleExtent([this.kMin, 60]);
    if (!this._initialized) {
      this._initialized = true;
      this.showRegion('welt', { duration: 0 });
    } else {
      this.svg.call(this.zoom.transform, this._constrain(this.transform, [[0, 0], [this.vw, this.vh]]));
    }
  }

  _constrain(t, extent) {
    const vw = extent[1][0] - extent[0][0], vh = extent[1][1] - extent[0][1];
    const k = t.k;
    let ty = t.y;
    const worldH = H * k;
    if (worldH <= vh) ty = Math.min(Math.max(ty, 0), vh - worldH);
    else ty = Math.min(0, Math.max(vh - worldH, ty));
    let tx = t.x;
    const cx = (vw / 2 - tx) / k;
    const shift = Math.floor(cx / W);
    tx += shift * W * k;
    return d3.zoomIdentity.translate(tx, ty).scale(k);
  }

  _onZoom(t) {
    this.transform = t;
    this.viewport.attr('transform', t);
    this._placeOverlay();
    if (this.labelMode) this._scheduleLabels();
  }

  /** Fliegt so, dass box (Karteneinheiten) in das Rechteck rect (Bildschirm) passt. */
  flyToBox(box, { rect, pad = 1.35, minSize = 26, maxK = 40, duration } = {}) {
    rect = rect || this.freeRect();
    let [[x0, y0], [x1, y1]] = box;
    let bw = x1 - x0, bh = y1 - y0;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    bw = Math.max(bw, minSize); bh = Math.max(bh, minSize * 0.62);
    const rw = rect.x1 - rect.x0, rh = rect.y1 - rect.y0;
    let k = Math.min(rw / (bw * pad), rh / (bh * pad));
    k = Math.max(this.kMin, Math.min(maxK, k));
    // nächstgelegene Kopie wählen, damit der Flug den kurzen Weg nimmt
    const cur = this.transform;
    const curCx = (this.vw / 2 - cur.x) / cur.k;
    let tcx = cx;
    while (tcx - curCx > W / 2) tcx -= W;
    while (curCx - tcx > W / 2) tcx += W;
    const rcx = (rect.x0 + rect.x1) / 2, rcy = (rect.y0 + rect.y1) / 2;
    let t = d3.zoomIdentity.translate(rcx - tcx * k, rcy - cy * k).scale(k);
    // vertikal begrenzen, horizontal nicht normalisieren (sonst springt die Animation)
    const worldH = H * k;
    let ty = t.y;
    if (worldH <= this.vh) ty = Math.min(Math.max(ty, 0), this.vh - worldH); else ty = Math.min(0, Math.max(this.vh - worldH, ty));
    t = d3.zoomIdentity.translate(t.x, ty).scale(k);
    return this._go(t, duration);
  }

  _go(t, duration) {
    const d = REDUCED_MOTION ? 0 : duration ?? this._durationTo(t);
    this.svg.interrupt();
    if (!d) {
      this.svg.call(this.zoom.transform, t);
      return Promise.resolve();
    }
    return new Promise(resolve => {
      this.svg.transition().duration(d).ease(d3.easeCubicInOut)
        .call(this.zoom.transform, t)
        .on('end interrupt', () => {
          this.svg.call(this.zoom.transform, this._constrain(this.transform, [[0, 0], [this.vw, this.vh]]));
          resolve();
        });
    });
  }

  _durationTo(t) {
    const a = this.transform;
    const p = [this.vw / 2, this.vh / 2];
    const i = d3.interpolateZoom(
      [...a.invert(p), this.vw / a.k],
      [...t.invert(p), this.vw / t.k]);
    return Math.max(450, Math.min(1400, i.duration * 0.7));
  }

  /** Bildschirmbereich, der nicht von Panels verdeckt wird. */
  freeRect() {
    const r = { x0: 0, y0: 0, x1: this.vw, y1: this.vh };
    if (this.getInsets) {
      const ins = this.getInsets();
      r.x0 += ins.left || 0; r.x1 -= ins.right || 0; r.y0 += ins.top || 0; r.y1 -= ins.bottom || 0;
      if (r.x1 - r.x0 < 120) { r.x0 = 0; r.x1 = this.vw; }
      if (r.y1 - r.y0 < 120) { r.y0 = 0; r.y1 = this.vh; }
    }
    return r;
  }

  /** Schiebt die Karte nur, wenn der Mittelpunkt von box hinter einem Panel liegt (Zoom bleibt). */
  ensureVisible(box) {
    const rect = this.freeRect();
    const t = this.transform;
    const cxW = (box[0][0] + box[1][0]) / 2, cyW = (box[0][1] + box[1][1]) / 2;
    const curCx = (this.vw / 2 - t.x) / t.k;
    let x = cxW;
    while (x - curCx > W / 2) x -= W;
    while (curCx - x > W / 2) x += W;
    const [sx, sy] = t.apply([x, cyW]);
    const m = 30;
    if (sx > rect.x0 + m && sx < rect.x1 - m && sy > rect.y0 + m && sy < rect.y1 - m) return Promise.resolve();
    const rcx = (rect.x0 + rect.x1) / 2, rcy = (rect.y0 + rect.y1) / 2;
    let nt = d3.zoomIdentity.translate(t.x + (rcx - sx), t.y + (rcy - sy)).scale(t.k);
    const worldH = H * t.k;
    let ty = nt.y;
    if (worldH <= this.vh) ty = Math.min(Math.max(ty, 0), this.vh - worldH); else ty = Math.min(0, Math.max(this.vh - worldH, ty));
    nt = d3.zoomIdentity.translate(nt.x, ty).scale(t.k);
    return this._go(nt, 500);
  }

  lonLatBox([lon0, lat0, lon1, lat1]) {
    const x0 = (lon0 + 180) / 360 * W, x1 = (lon1 + 180) / 360 * W;
    const y0 = yOf(Math.min(lat1, LAT_TOP)) - Y0, y1 = yOf(Math.max(lat0, LAT_BOTTOM)) - Y0;
    return [[x0, y0], [x1, y1]];
  }

  showRegion(region, opts = {}) {
    return this.flyToBox(this.lonLatBox(REGION_BOX[region] || REGION_BOX.welt), { pad: 1.02, minSize: 10, ...opts });
  }

  // ---------- Zuschnitt auf Ziele ----------
  _pieces(hits) {
    const pieces = [];
    for (const h of hits) {
      // Jeder Ring ist ein Stück; Löcher liegen innerhalb ihres Stücks und ändern den Ausschnitt nicht.
      for (const ring of h.rings) {
        const box = ringsBox([ring]);
        pieces.push({ a: Math.abs(ringArea(ring)), box, cx: (box[0][0] + box[1][0]) / 2, cy: (box[0][1] + box[1][1]) / 2 });
      }
    }
    return pieces;
  }

  focusBox(pieces) {
    if (!pieces.length) return [[0, 0], [W, H]];
    pieces.sort((a, b) => b.a - a.a);
    const main = pieces[0];
    const diag = Math.hypot(main.box[1][0] - main.box[0][0], main.box[1][1] - main.box[0][1]);
    const thr = Math.max(22, Math.min(150, diag * 1.2));
    let [[x0, y0], [x1, y1]] = main.box;
    for (const p of pieces.slice(1)) {
      let dx = p.cx - main.cx;
      const shift = Math.abs(dx) > W / 2 ? -Math.sign(dx) * W : 0;
      dx += shift;
      const d = Math.hypot(dx, p.cy - main.cy);
      if (d <= thr || (p.a >= main.a * 0.25 && d <= 320)) {
        x0 = Math.min(x0, p.box[0][0] + shift); x1 = Math.max(x1, p.box[1][0] + shift);
        y0 = Math.min(y0, p.box[0][1]); y1 = Math.max(y1, p.box[1][1]);
      }
    }
    return [[x0, y0], [x1, y1]];
  }

  countryBox(code) {
    if (FOCUS_OVERRIDE[code]) return this.lonLatBox(FOCUS_OVERRIDE[code]);
    return this.focusBox(this._pieces(this.hit.filter(h => h.c === code)));
  }

  waterBox(id) {
    const hits = this.waterHit.filter(h => (this.byWater.get(id) || []).includes(h.w));
    return this.focusBox(this._pieces(hits));
  }

  flyToCountry(code, opts = {}) {
    const box = this.countryBox(code);
    return this.flyToBox(box, { pad: 1.9, minSize: 30, ...opts });
  }

  flyToWater(id, opts = {}) {
    const box = this.waterBox(id);
    const big = (box[1][0] - box[0][0]) > 300;
    const lake = (this.byWater.get(id) || []).every(w => w.lake);
    return this.flyToBox(box, { pad: big ? 1.08 : 1.7, minSize: lake ? 16 : 34, ...opts });
  }

  flyToPoint(lon, lat, opts = {}) {
    const [x, y] = this.projection([lon, lat]);
    const s = opts.size || 60;
    return this.flyToBox([[x - s / 2, y - s * 0.31], [x + s / 2, y + s * 0.31]], { pad: 1, minSize: 10, ...opts });
  }

  // ---------- Hervorhebungen ----------
  clear() {
    this.landSel.classed('is-target is-right is-wrong is-pick is-out is-hover', false)
      .classed('m0 m1 m2 m3', false);
    this.waterSel.classed('is-target is-right is-wrong', false);
    this.lakeSel.classed('is-target is-right is-wrong', false);
    this.overlay.selectAll('*').remove();
    this.overlayItems = [];
    this.svg.classed('mastery', false);
  }

  setCountryClass(code, cls, on = true) {
    this.landSel.filter(f => f.properties.c === code).classed(cls, on).raise();
  }

  dimOutside(codes) {
    const keep = codes ? new Set(codes) : null;
    this.landSel.classed('is-out', f => !!keep && !keep.has(f.properties.c) && !keep.has(f.properties.s));
  }

  setWaterClass(id, cls, on = true) {
    const set = new Set(this.byWater.get(id) || []);
    this.waterSel.filter(w => set.has(w)).classed(cls, on);
    this.lakeSel.filter(w => set.has(w)).classed(cls, on);
  }

  setMastery(levels) {
    this.svg.classed('mastery', true);
    this.landSel.each(function (f) {
      const lv = levels[f.properties.c];
      const el = d3.select(this);
      el.classed('m0 m1 m2 m3', false);
      if (lv != null) el.classed('m' + lv, true);
    });
  }

  /** Pulsierender Ring um ein kleines Ziel (nur wenn es auf dem Bildschirm winzig ist). */
  ringFor(box, { force = false } = {}) {
    const [[x0, y0], [x1, y1]] = box;
    const x = (x0 + x1) / 2, y = (y0 + y1) / 2;
    const g = this.overlay.append('g').attr('class', 'ring');
    g.append('circle').attr('r', 17).attr('class', 'ring-pulse');
    g.append('circle').attr('r', 17).attr('class', 'ring-line');
    this.overlayItems.push({ x, y, el: g, kind: 'ring', box, force });
    this._placeOverlay();
  }

  pin(lon, lat, text, kind = 'capital') {
    const [x, y] = this.projection([lon, lat]);
    const g = this.overlay.append('g').attr('class', 'pin ' + kind);
    g.append('path').attr('d', d3.symbol(d3.symbolStar, 150)()).attr('class', 'pin-star');
    if (text) {
      g.append('text').attr('class', 'pin-label halo').attr('x', 11).attr('y', 4).text(text);
      g.append('text').attr('class', 'pin-label').attr('x', 11).attr('y', 4).text(text);
    }
    this.overlayItems.push({ x, y, el: g, kind: 'pin' });
    this._placeOverlay();
  }

  labelAt(x, y, text, kind = 'country') {
    const g = this.overlay.append('g').attr('class', 'maplabel ' + kind);
    g.append('text').attr('class', 'halo').attr('text-anchor', 'middle').attr('dy', '0.35em').text(text);
    g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').text(text);
    this.overlayItems.push({ x, y, el: g, kind: 'label' });
    this._placeOverlay();
  }

  labelCountry(code, text, kind) {
    const f = this.countryFeatures.find(f => f.properties.c === code && f.properties.lx != null);
    let x, y;
    if (f) [x, y] = this.projection([f.properties.lx, f.properties.ly]);
    else { const b = this.countryBox(code); x = (b[0][0] + b[1][0]) / 2; y = (b[0][1] + b[1][1]) / 2; }
    this.labelAt(x, y, text, kind);
  }

  labelWater(id, text, kind) {
    const hits = this.waterHit.filter(h => (this.byWater.get(id) || []).includes(h.w));
    const pieces = this._pieces(hits).sort((a, b) => b.a - a.a);
    if (!pieces.length) return;
    const p = pieces[0];
    const inner = WATER_LABEL[id];
    const [x, y] = inner ? this.projection(inner) : [p.cx, p.cy];
    this.labelAt(x, y, text, kind);
  }

  _placeOverlay() {
    const t = this.transform;
    const cx = (this.vw / 2 - t.x) / t.k;
    for (const it of this.overlayItems) {
      let x = it.x;
      while (x - cx > W / 2) x -= W;
      while (cx - x > W / 2) x += W;
      const [sx, sy] = t.apply([x, it.y]);
      if (it.kind === 'ring' && it.box && !it.force) {
        const s = Math.max(it.box[1][0] - it.box[0][0], it.box[1][1] - it.box[0][1]) * t.k;
        it.el.attr('display', s < 16 ? null : 'none');
        it.el.select('.ring-line').attr('r', Math.max(15, s / 2 + 8));
        it.el.select('.ring-pulse').attr('r', Math.max(15, s / 2 + 8));
      }
      it.el.attr('transform', `translate(${sx.toFixed(1)},${sy.toFixed(1)})`);
    }
  }

  // ---------- Beschriftung aller Länder (Entdecken-Modus) ----------
  setLabelMode(on, names) {
    this.labelMode = on;
    this.labelNames = names;
    this.labelLayer.selectAll('*').remove();
    if (on) {
      // je Land ein Etikett: am Label-Punkt des flächengrößten Teilgebiets
      const best = new Map();
      for (const h of this.hit) {
        const p = h.f.properties;
        if (p.lx == null || !names[p.c]) continue;
        const a = (h.box[1][0] - h.box[0][0]) * (h.box[1][1] - h.box[0][1]);
        if (!best.has(p.c) || best.get(p.c).a < a) best.set(p.c, { p, a });
      }
      this._labelData = [...best.values()].map(({ p }) => {
        const [x, y] = this.projection([p.lx, p.ly]);
        const b = this.countryBox(p.c);
        return { x, y, text: names[p.c], size: Math.max(b[1][0] - b[0][0], (b[1][1] - b[0][1]) * 1.4) };
      }).sort((a, b) => b.size - a.size);
      this._scheduleLabels();
    }
  }

  _scheduleLabels() {
    if (this._labelRaf) return;
    this._labelRaf = requestAnimationFrame(() => { this._labelRaf = null; this._drawLabels(); });
  }

  _drawLabels() {
    const t = this.transform;
    const cx = (this.vw / 2 - t.x) / t.k;
    const placed = [];
    const out = [];
    for (const d of this._labelData || []) {
      const w = d.text.length * 6.4 + 6;
      if (d.size * t.k < w * 0.8) continue;
      let x = d.x;
      while (x - cx > W / 2) x -= W;
      while (cx - x > W / 2) x += W;
      const [sx, sy] = t.apply([x, d.y]);
      if (sx < -60 || sx > this.vw + 60 || sy < -20 || sy > this.vh + 20) continue;
      const r = [sx - w / 2, sy - 8, sx + w / 2, sy + 8];
      if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) continue;
      placed.push(r);
      out.push({ sx, sy, text: d.text });
    }
    const g = this.labelLayer.selectAll('g.l').data(out, d => d.text)
      .join(enter => {
        const e = enter.append('g').attr('class', 'l maplabel small');
        e.append('text').attr('class', 'halo').attr('text-anchor', 'middle').attr('dy', '0.35em');
        e.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em');
        return e;
      });
    g.attr('transform', d => `translate(${d.sx.toFixed(1)},${d.sy.toFixed(1)})`);
    g.selectAll('text').text(d => d.text);
  }

  // ---------- Klicks ----------
  _click(e) {
    if (!this.onClick || e.defaultPrevented) return;
    const [sx, sy] = d3.pointer(e, this.svg.node());
    let [x, y] = this.transform.invert([sx, sy]);
    x = ((x % W) + W) % W;
    const tol = 14 / this.transform.k;
    this.onClick(this.lakeFirst ? this.hitTestLakeFirst(x, y, tol) : this.hitTest(x, y, tol), e);
  }

  hitTest(x, y, tol) {
    for (const h of this.hit) {
      const [[x0, y0], [x1, y1]] = h.box;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (pointInRings(x, y, h.rings)) return { type: 'country', code: h.c, props: h.f.properties };
    }
    // Wasser: Seen zuerst (liegen über Land), dann Meere
    const lakes = this.waterHit.filter(h => h.w.lake);
    const seas = this.waterHit.filter(h => !h.w.lake);
    for (const list of [lakes, seas]) {
      for (const h of list) {
        const [[x0, y0], [x1, y1]] = h.box;
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (pointInRings(x, y, h.rings)) {
          const ids = (h.w.f.properties.w || '').split(' ').filter(Boolean);
          if (ids.length) return { type: 'water', ids };
        }
      }
    }
    // kleine Länder in der Nähe (Toleranz in Karteneinheiten)
    let best = null, bestD = Infinity;
    for (const h of this.hit) {
      const [[x0, y0], [x1, y1]] = h.box;
      const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      const d = Math.hypot(dx, dy);
      if (d < tol && d < bestD) { best = h; bestD = d; }
    }
    if (best) return { type: 'country', code: best.c, props: best.f.properties };
    return null;
  }

  // Klick-Erkennung prüft auch Seen, die über Land liegen: Land hat Vorrang,
  // außer der Punkt liegt in einem Quiz-See.
  hitTestLakeFirst(x, y, tol) {
    for (const h of this.waterHit.filter(h => h.w.lake)) {
      const [[x0, y0], [x1, y1]] = h.box;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (pointInRings(x, y, h.rings)) {
        const ids = (h.w.f.properties.w || '').split(' ').filter(Boolean);
        if (ids.length) return { type: 'water', ids };
      }
    }
    return this.hitTest(x, y, tol);
  }
}

// Label-Punkte für Gewässer, deren Schwerpunkt ungünstig liegt (lon, lat)
const WATER_LABEL = {
  pazifik: [-150, 5], atlantik: [-35, 20], indik: [78, -22], arktis: [-10, 83], suedpolarmeer: [60, -62],
  mittelmeer: [18, 35], ostsee: [19, 57], karibik: [-75, 15], golfvonmexiko: [-90, 25.5],
  suedchinesisch: [114, 13], rotesmeer: [38, 21], persischergolf: [51.5, 27], japanischesmeer: [135, 40],
};

function ringsBox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [[x0, y0], [x1, y1]];
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

function pointInRings(x, y, rings) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, n = r.length, j = n - 1; i < n; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
  }
  return inside;
}
