'use strict';
// Three different things can go wrong, and only the first has been measured:
//   1. the quote is not in the cited section        -> lib/verify.js catches it
//   2. the cited section does not answer the question -> nothing caught it
//   3. the section is no longer good law             -> lib/currency.js, partly
//
// This scores (2): of the claims that VERIFY, how many rest on a section the
// answer key says actually answers the question. A verified claim from the
// wrong section is a confidently sourced irrelevance, and it is invisible to
// every check written before this one.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { verifyAnswer, index, VERDICT } = require('../lib/verify');

const { key } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'answer-key.json'), 'utf8'));
const corpus = load();
const byKey = index(corpus);

function score(file) {
  const p = path.join(__dirname, '..', 'data', file);
  if (!fs.existsSync(p)) return null;
  const answers = JSON.parse(fs.readFileSync(p, 'utf8'));
  let claims = 0, verified = 0, onTarget = 0, answeredQs = 0, groundedQs = 0, silentQs = 0;
  const rows = [];
  for (const a of answers) {
    const gold = key[a.question];
    if (!gold) continue;
    const r = verifyAnswer(a, corpus, byKey);
    const good = r.claims.filter((c) => c.verdict === VERDICT.VERIFIED);
    const hits = good.filter((c) => gold.some((g) => c.cite && c.cite.startsWith(g)));
    claims += r.claims.length;
    verified += good.length;
    onTarget += hits.length;
    if (good.length) answeredQs++; else silentQs++;
    if (hits.length) groundedQs++;
    rows.push({ q: a.question, verified: good.length, onTarget: hits.length });
  }
  const n = rows.length;
  return { file, n, claims, verified, onTarget, answeredQs, groundedQs, silentQs, rows };
}

const files = process.argv.slice(2);
const results = files.map(score).filter(Boolean);
console.log('run                          Qs  claims  verified  on-target  grounded Qs  silent Qs');
console.log('---------------------------  --  ------  --------  ---------  -----------  ---------');
for (const r of results) {
  console.log(
    `${r.file.replace('answers-retrieval-live-', 'k=').replace('.json', '').padEnd(27)}  ${String(r.n).padStart(2)}  ` +
    `${String(r.claims).padStart(6)}  ${(r.verified / r.claims * 100).toFixed(0).padStart(7)}%  ` +
    `${(r.onTarget / r.verified * 100).toFixed(0).padStart(8)}%  ` +
    `${String(r.groundedQs + '/' + r.n).padStart(11)}  ${String(r.silentQs).padStart(9)}`
  );
}
console.log('\ngrounded Qs = at least one verified claim citing a section the key accepts');
console.log('silent Qs   = model produced no verifiable claim at all (an honest gap)');
