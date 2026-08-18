'use strict';
// BM25 over sections. Deliberately boring and inspectable -- if the answer is
// wrong we need to know whether retrieval missed it or the model ignored it.
const STOP = new Set('a an and are as at be by for from has have if in into is it its of on or that the to was were will with which such any all not may must shall no'.split(' '));

function tokens(s) {
  return String(s).toLowerCase().match(/[a-z0-9.]+/g)?.filter((t) => t.length > 1 && !STOP.has(t)) || [];
}

function buildIndex(corpus) {
  const docs = corpus.sections.map((s) => {
    // The heading carries a lot of signal; weight it by repeating it.
    const toks = tokens(`${s.heading} ${s.heading} ${s.text}`);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    return { section: s, tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1);
  return { docs, df, avgLen, N: docs.length };
}

function search(idx, query, k = 6) {
  const k1 = 1.5, b = 0.75;
  const qt = tokens(query);
  const scored = idx.docs.map((d) => {
    let score = 0;
    for (const t of qt) {
      const f = d.tf.get(t);
      if (!f) continue;
      const n = idx.df.get(t) || 0;
      const idf = Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / idx.avgLen)));
    }
    return { section: d.section, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score).slice(0, k);
}

module.exports = { buildIndex, search, tokens };
