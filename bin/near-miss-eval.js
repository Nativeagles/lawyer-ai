'use strict';
// The near-miss test. Every question here has a real federal component the
// corpus covers and a component it does not. Three behaviours are correct in
// three different situations, so a binary answer/decline flag is under test as
// much as the model is.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { verifyAnswer, index, VERDICT } = require('../lib/verify');

const corpus = load();
const byKey = index(corpus);
const FILE = process.argv[2] || 'answers-v2-near-miss.json';
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', FILE), 'utf8'));

// Accepts both shapes: the binary answerable/scope_note of the first run and
// the three-state coverage/limits that replaced it, so the two are comparable.
function behaviour(a) {
  const claims = (a.claims || []).length;
  if (a.coverage) return a.coverage === 'NONE' ? 'DECLINE' : a.coverage;
  const note = (a.scope_note || '').trim().length > 0;
  if (a.answerable === false && claims === 0) return 'DECLINE';
  if (a.answerable === true && claims > 0 && note) return 'PARTIAL';
  if (a.answerable === true && claims > 0 && !note) return 'FULL';
  return 'ODD';
}

let ok = 0, claims = 0, verified = 0;
const rows = [];
for (const a of answers) {
  const got = behaviour(a);
  const r = verifyAnswer(a, corpus, byKey);
  claims += r.claims.length;
  verified += r.claims.filter((c) => c.verdict === VERDICT.VERIFIED).length;
  const match = got === a.expect;
  if (match) ok++;
  rows.push({ q: a.question, expect: a.expect, got, match, claims: (a.claims || []).length, note: a.limits || a.scope_note || '' });
}

console.log('expect   got      claims  question');
console.log('-------  -------  ------  --------------------------------------------------');
for (const r of rows) {
  console.log(`${r.expect.padEnd(7)}  ${r.got.padEnd(7)}  ${String(r.claims).padStart(6)}  ${r.match ? ' ' : '*'} ${r.q.slice(0, 56)}`);
}
console.log(`\nbehaviour matched expectation   ${ok}/${rows.length}  ${(ok / rows.length * 100).toFixed(0)}%`);
console.log(`claims verified                 ${claims ? (verified / claims * 100).toFixed(0) : 0}%  (${verified}/${claims})`);

const byCat = {};
for (const r of rows) {
  byCat[r.expect] = byCat[r.expect] || { n: 0, ok: 0 };
  byCat[r.expect].n++; if (r.match) byCat[r.expect].ok++;
}
console.log('\nby expected behaviour:');
for (const [k, v] of Object.entries(byCat)) console.log(`  ${k.padEnd(8)} ${v.ok}/${v.n}`);

const wrong = rows.filter((r) => !r.match);
if (wrong.length) {
  console.log('\nmismatches:');
  for (const r of wrong) {
    console.log(`  expected ${r.expect}, got ${r.got}: ${r.q.slice(0, 60)}`);
    if (r.note) console.log(`     note: "${r.note.slice(0, 110)}"`);
  }
}
