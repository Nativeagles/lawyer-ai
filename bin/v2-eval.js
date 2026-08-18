'use strict';
// Scores v2 on both halves of the job:
//   in-scope    -- does it answer, grounded in a section that answers the question
//   out-of-scope-- does it decline, instead of citing something adjacent
// A system that scores well on one and badly on the other is not usable.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { verifyAnswer, index, VERDICT } = require('../lib/verify');

const { key } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'answer-key.json'), 'utf8'));
const corpus = load();
const byKey = index(corpus);
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'answers-v2.json'), 'utf8'));

const inScope = answers.filter((a) => a.inScope);
const outScope = answers.filter((a) => !a.inScope);

let claims = 0, verified = 0, onTarget = 0, grounded = 0, wronglyDeclined = 0;
const misses = [];
for (const a of inScope) {
  const gold = key[a.question] || [];
  const r = verifyAnswer(a, corpus, byKey);
  const good = r.claims.filter((c) => c.verdict === VERDICT.VERIFIED);
  const hits = good.filter((c) => gold.some((g) => c.cite && c.cite.startsWith(g)));
  claims += r.claims.length; verified += good.length; onTarget += hits.length;
  if (hits.length) grounded++; else misses.push({ q: a.question, cited: [...new Set(good.map((c) => c.cite))].slice(0, 3), gold: gold[0] });
  if (a.answerable === false) wronglyDeclined++;
}

let declined = 0, leaked = 0;
const leaks = [];
for (const a of outScope) {
  if (a.answerable === false && (a.claims || []).length === 0) declined++;
  else { leaked++; leaks.push({ q: a.question, claims: (a.claims || []).length, cite: "" }); }
}

console.log(`IN SCOPE  (${inScope.length} questions the corpus does answer)`);
console.log(`  claims                 ${claims}`);
console.log(`  verified               ${(verified / claims * 100).toFixed(0)}%`);
console.log(`  on-target claims       ${(onTarget / verified * 100).toFixed(0)}%`);
console.log(`  GROUNDED questions     ${grounded}/${inScope.length}  ${(grounded / inScope.length * 100).toFixed(0)}%`);
console.log(`  wrongly declined       ${wronglyDeclined}`);
console.log(`\nOUT OF SCOPE  (${outScope.length} questions the corpus cannot answer)`);
console.log(`  correctly DECLINED     ${declined}/${outScope.length}  ${(declined / outScope.length * 100).toFixed(0)}%`);
console.log(`  answered anyway        ${leaked}`);
if (misses.length) {
  console.log(`\nin-scope questions with no grounded claim:`);
  misses.forEach((m) => console.log(`  want ${m.gold.padEnd(15)} got ${m.cited.join(', ').slice(0, 46).padEnd(46)} ${m.q.slice(0, 44)}`));
}
if (leaks.length) {
  console.log(`\nout-of-scope questions answered instead of declined:`);
  leaks.forEach((l) => console.log(`  ${l.claims} claims  ${l.q.slice(0, 66)}`));
}
console.log(`\nscope notes returned on declines:`);
outScope.filter((a) => a.scope_note).slice(0, 4).forEach((a) => console.log(`  "${a.scope_note.slice(0, 96)}"`));
