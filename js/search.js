// Tippfehler-tolerante Suche: findet Einträge auch mit fehlenden Akzenten, Bindestrichen,
// Apostrophen, ae/oe/ue statt Umlauten und ein bis drei Buchstabendrehern.

export function norm(s) {
  return String(s).toLowerCase()
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/\bsankt\b|\bsaint\b|\bst\b\.?/g, 'st')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

const compact = s => s.replace(/ /g, '');

// Damerau-Levenshtein (optimal string alignment), mit Abbruch über max
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

const allowed = len => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3);

/**
 * items: [{ id, label, terms: [string] }]  – label wird angezeigt, terms sind alle Schreibweisen.
 */
export class Searcher {
  constructor(items) {
    this.items = items.map(it => ({
      ...it,
      keys: [...new Set([it.label, ...(it.terms || [])])].map(t => {
        const n = norm(t);
        return { raw: t, n, c: compact(n), words: n.split(' ') };
      }),
    }));
  }

  /** Liefert [{ item, score, via }] – via ist die Schreibweise, über die gefunden wurde (falls nicht label). */
  search(query, limit = 7) {
    const qn = norm(query);
    const q = compact(qn);
    if (!q) return [];
    const max = allowed(q.length);
    const out = [];
    for (const it of this.items) {
      let best = 0, via = null;
      for (const k of it.keys) {
        let s = 0;
        if (k.c === q) s = 1000;
        else if (k.c.startsWith(q)) s = 900 - Math.min(80, k.c.length - q.length);
        else if (k.words.some(w => w.startsWith(q)) || k.words.some((w, i) => compact(k.words.slice(i).join(' ')).startsWith(q))) s = 820 - Math.min(80, k.c.length - q.length);
        else if (q.length >= 3 && k.c.includes(q)) s = 700 - Math.min(80, k.c.length - q.length);
        else if (max > 0) {
          const d = Math.min(
            dist(q, k.c, max),
            dist(q, k.c.slice(0, q.length), max),
            dist(q, k.c.slice(0, q.length + 1), max),
            ...k.words.map(w => dist(q, w, max)),
            ...k.words.map(w => dist(q, w.slice(0, q.length), max)));
          if (d <= max) s = 600 - d * 90 - Math.min(40, Math.abs(k.c.length - q.length));
        }
        if (s > best) { best = s; via = k.raw; }
      }
      if (best > 0) out.push({ item: it, score: best, via: via === it.label ? null : via });
    }
    out.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, 'de'));
    return out.slice(0, limit);
  }

  /** Eindeutiger Treffer, wenn die Eingabe genau einer Schreibweise entspricht. */
  exact(query) {
    const q = compact(norm(query));
    const hits = this.items.filter(it => it.keys.some(k => k.c === q));
    return hits.length === 1 ? hits[0] : null;
  }
}
