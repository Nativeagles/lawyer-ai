'use strict';
// Scores retrieval against a hand-built answer key. Quotation is verified by
// lib/verify.js; nothing until now checked whether the RIGHT sections were put
// in front of the model in the first place. A perfectly verified answer drawn
// from the wrong section is still a wrong answer.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { buildIndex, search } = require('../lib/retrieve');

const K = Number(process.argv[2] || 4);
const corpus = load();
const idx = buildIndex(corpus);
const { key } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'answer-key.json'), 'utf8'));

let p1 = 0, hitK = 0, mrr = 0;
const rows = [];
for (const [q, gold] of Object.entries(key)) {
  const hits = search(idx, q, K).map((r) => r.section.citation);
  const rank = hits.findIndex((c) => gold.includes(c));
  const top = gold.includes(hits[0]);
  if (top) p1++;
  if (rank >= 0) { hitK++; mrr += 1 / (rank + 1); }
  rows.push({ q, top, rank, got: hits[0], gold: gold[0], hits });
}

const n = rows.length;
for (const r of rows) {
  const mark = r.top ? ' hit ' : r.rank >= 0 ? `  @${r.rank + 1} ` : ' MISS';
  console.log(`${mark} got ${r.got.padEnd(15)} want ${r.gold.padEnd(15)} ${r.q.slice(0, 52)}`);
}
console.log(`\nprecision@1   ${p1}/${n}  ${(p1 / n * 100).toFixed(0)}%   correct section ranked first`);
console.log(`recall@${K}      ${hitK}/${n}  ${(hitK / n * 100).toFixed(0)}%   correct section anywhere in what the model saw`);
console.log(`MRR           ${(mrr / n).toFixed(3)}`);
console.log(`\n${n - hitK} question(s) where the answering section was never retrieved at all --`);
console.log(`the model cannot answer these correctly no matter how good it is.`);
