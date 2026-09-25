// Soundeffekte, komplett im Browser synthetisiert (keine Audiodateien).
// Browser erlauben Ton erst nach einer Berührung oder Taste – deshalb „wecken“ wir das Audio beim ersten Tippen.

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, out = null, verb = null;
let isEnabled = () => true;
let silentEl = null;

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export function setupSound(enabledFn) {
  isEnabled = enabledFn;
  const unlock = () => { if (isEnabled()) wake(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

/** Beim Einschalten sofort hörbar machen, beim Ausschalten andere Audio-Apps wieder in Ruhe lassen. */
export function setSoundEnabled(on) {
  if (on) { wake(); return; }
  try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* egal */ }
  if (silentEl) { silentEl.pause(); silentEl = null; }
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

function wake() {
  if (!AC) return false;
  try {
    if (!ctx) {
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      out = ctx.createGain();
      out.gain.value = 0.95;
      out.connect(comp).connect(ctx.destination);
      verb = ctx.createConvolver();
      verb.buffer = impulse(1.6, 3);
      const wet = ctx.createGain();
      wet.gain.value = 0.3;
      verb.connect(wet).connect(out);
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    // iPhone im Lautlos-Modus: Web Audio wäre sonst stumm
    if (navigator.audioSession) {
      if (navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } else if (isIOS() && !silentEl) {
      silentEl = new Audio(silentWav());
      silentEl.loop = true;
      silentEl.setAttribute('x-webkit-airplay', 'deny');
      silentEl.play().catch(() => { silentEl = null; });
    }
  } catch { return false; }
  return true;
}

function ready() { return isEnabled() && wake() && ctx; }

function impulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function silentWav() {
  // 0,1 s Stille als 8-Bit-WAV
  const n = 800, bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const s = (o, t) => [...t].forEach((c, i) => bytes[o + i] = c.charCodeAt(0));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  s(36, 'data'); v.setUint32(40, n, true); bytes.fill(128, 44);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

/* ---------- Bausteine ---------- */

function connect(node, send) {
  node.connect(out);
  if (send) { const s = ctx.createGain(); s.gain.value = send; node.connect(s).connect(verb); }
}

function tone({ f, t = 0, d = 0.3, type = 'sine', g = 0.2, a = 0.005, bend = 0, send = 0.3, filter = null }) {
  const t0 = ctx.currentTime + 0.015 + t;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (bend) o.frequency.exponentialRampToValueAtTime(f * bend, t0 + d);
  let node = o;
  if (filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = filter.type || 'lowpass';
    fl.frequency.setValueAtTime(filter.f, t0);
    if (filter.to) fl.frequency.exponentialRampToValueAtTime(filter.to, t0 + d);
    fl.Q.value = filter.q || 0.8;
    node.connect(fl);
    node = fl;
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  node.connect(env);
  connect(env, send);
  o.start(t0);
  o.stop(t0 + d + 0.05);
}

function noise({ t = 0, d = 0.2, g = 0.08, type = 'highpass', f = 4000, to = 0, q = 0.8, send = 0.2 }) {
  const t0 = ctx.currentTime + 0.015 + t;
  const len = Math.ceil(ctx.sampleRate * d);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t0);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + d);
  fl.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.04, d / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(fl).connect(env);
  connect(env, send);
  src.start(t0);
  src.stop(t0 + d + 0.05);
}

// Glockenton: Grundton plus leicht verstimmte Obertöne
function bell(f, t, d = 0.8, g = 0.14) {
  tone({ f, t, d, g, type: 'sine', send: 0.35 });
  tone({ f: f * 2.005, t, d: d * 0.55, g: g * 0.4, type: 'sine', send: 0.35 });
  tone({ f: f * 3.01, t, d: d * 0.3, g: g * 0.15, type: 'triangle', send: 0.25 });
}

/* ---------- Effekte ---------- */

export const sfx = {
  /** Richtig: helles Glocken-Arpeggio mit Funkeln */
  correct() {
    if (!ready()) return;
    [1046.5, 1318.5, 1568].forEach((f, i) => bell(f, i * 0.07, 0.6, 0.13));
    bell(2093, 0.21, 1.1, 0.11);
    noise({ t: 0.2, d: 0.45, g: 0.035, f: 7000, send: 0.6 });
  },
  /** Falsch: freundliches „Wah-wah“ nach unten */
  wrong() {
    if (!ready()) return;
    tone({ f: 330, d: 0.2, type: 'sawtooth', g: 0.12, bend: 0.93, filter: { f: 1500, to: 600 }, send: 0.15 });
    tone({ f: 247, t: 0.19, d: 0.45, type: 'sawtooth', g: 0.13, bend: 0.88, filter: { f: 1200, to: 280 }, send: 0.15 });
    tone({ f: 123.5, t: 0.19, d: 0.45, type: 'sine', g: 0.12, bend: 0.88, send: 0 });
  },
  /** Serie (3, 5, 10 … richtig in Folge): kleine Fanfare, je länger die Serie, desto strahlender */
  streak(n) {
    if (!ready()) return;
    [784, 1046.5, 1318.5, 1568].forEach((f, i) => tone({ f, t: i * 0.065, d: 0.16, type: 'triangle', g: 0.1, send: 0.25 }));
    [1046.5, 1318.5, 1568, 2093].forEach(f => tone({ f, t: 0.28, d: 0.9, type: 'triangle', g: 0.055, send: 0.45 }));
    noise({ t: 0.28, d: 0.5, g: 0.04, f: 6000, send: 0.5 });
    if (n >= 10) tone({ f: 2093, t: 0.3, d: 0.8, type: 'sine', g: 0.05, bend: 2, send: 0.6 });
  },
  /** Rundenende: Fanfare je nach Ergebnis */
  fanfare(ratio) {
    if (!ready()) return;
    if (ratio >= 0.8) {
      [[523.25, 0], [659.25, 0.12], [783.99, 0.24]].forEach(([f, t]) => tone({ f, t, d: 0.2, type: 'triangle', g: 0.12, send: 0.3 }));
      [523.25, 659.25, 783.99, 1046.5].forEach(f => tone({ f, t: 0.38, d: 1.5, type: 'triangle', g: 0.07, send: 0.5 }));
      tone({ f: 130.8, t: 0.38, d: 1.2, type: 'sine', g: 0.12, send: 0.2 });
      noise({ t: 0.38, d: 0.9, g: 0.05, f: 5000, send: 0.6 });
    } else if (ratio >= 0.5) {
      [659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.12, 0.9, 0.12));
    } else {
      tone({ f: 523.25, d: 0.3, type: 'triangle', g: 0.1, send: 0.3 });
      tone({ f: 659.25, t: 0.22, d: 0.7, type: 'triangle', g: 0.1, send: 0.35 });
    }
  },
  /** Auswahl (Vorschlag angeklickt, Land angetippt) */
  select() {
    if (!ready()) return;
    tone({ f: 880, d: 0.07, type: 'sine', g: 0.07, bend: 1.5, send: 0.05 });
  },
  /** Tipp */
  hint() {
    if (!ready()) return;
    tone({ f: 660, d: 0.35, type: 'sine', g: 0.07, bend: 1.5, send: 0.4 });
    tone({ f: 1320, t: 0.08, d: 0.3, type: 'sine', g: 0.035, send: 0.4 });
  },
  /** Neue Frage: leises Rauschen, während die Karte fliegt */
  whoosh() {
    if (!ready()) return;
    noise({ d: 0.6, g: 0.03, type: 'bandpass', f: 350, to: 2400, q: 1.1, send: 0.1 });
  },
};
