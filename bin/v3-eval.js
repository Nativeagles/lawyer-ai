'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { verifyAnswer, index, VERDICT } = require('../lib/verify');

const fed = load();
const ca = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'corpus-ca.json'), 'utf8'));
const byKey = index(fed, ca);
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'answers-v3-ca.json'), 'utf8'));

let ok = 0, govOk = 0, claims = 0, verified = 0, fedCites = 0, stateCites = 0;
const rows = [];
for (const a of answers) {
  const r = verifyAnswer(a, fed, byKey);
  const good = r.claims.filter((c) => c.verdict === VERDICT.VERIFIED);
  claims += r.claims.length;
  verified += good.length;
  for (const c of good) (/Lab\. Code/.test(c.cite) ? stateCites++ : fedCites++);
  const match = a.coverage === a.expect;
  const gmatch = a.governing === a.governing_expected || a.governing === a.governingExpected || a.governing === a.governingWant || a.governing === a['governing'] && a.expect !== undefined;
  if (match) ok++;
  rows.push({ q: a.question, want: a.expect, got: a.coverage, gov: a.governing, govWant: a.governingExpected || a.governing_expected || a.governingWant, claims: r.claims.length, bad: r.claims.length - good.length, limits: a.limits || '' });
}
console.log('want     got      governing  claims  question');
console.log('-------  -------  ---------  ------  ------------------------------------------');
for (const r of rows) {
  console.log(`${r.want.padEnd(7)}  ${String(r.got).padEnd(7)}  ${String(r.gov).padEnd(9)}  ${String(r.claims).padStart(6)}  ${r.got === r.want ? ' ' : '*'} ${r.q.slice(0, 44)}`);
}
console.log(`\ncoverage matched expectation  ${ok}/${rows.length}  ${(ok / rows.length * 100).toFixed(0)}%`);
console.log(`claims verified               ${claims ? (verified / claims * 100).toFixed(0) : 0}%  (${verified}/${claims})`);
console.log(`citations                     ${fedCites} federal, ${stateCites} California`);
const mismatch = rows.filter((r) => r.got !== r.want);
if (mismatch.length) {
  console.log('\nmismatches — inspect before believing the key:');
  for (const r of mismatch) {
    console.log(`  want ${r.want}, got ${r.got}: ${r.q.slice(0, 54)}`);
    if (r.limits) console.log(`     limits: "${r.limits.slice(0, 118)}"`);
  }
}
