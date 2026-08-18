'use strict';
// Three judgments of the same 12 questions:
//   KEY   -- written by hand, by me, before the runs
//   MODEL -- the answering model's own coverage call (Opus 5, full text)
//   BLIND -- an independent labeller (Sonnet 5, manifest only, 3 votes),
//            which never saw either of the other two
//
// If BLIND sides with MODEL where KEY disagreed, my inspections were reasoning.
// If it sides with KEY, they were rationalising. Either way it is the first
// number here not produced by the person being marked.
const fs = require('fs');
const path = require('path');

const set = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'near-miss-ca.json'), 'utf8'));
const answers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'answers-v3-ca.json'), 'utf8'));
const LABELS = process.argv[2] || 'labels-independent.json';
const labels = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', LABELS), 'utf8'));

const byQ = (arr) => Object.fromEntries(arr.map((x) => [x.question, x]));
const A = byQ(answers), L = byQ(labels);

let km = 0, kb = 0, mb = 0, all3 = 0, n = 0, unanimous = 0;
const rows = [];
for (const item of set.questions) {
  const a = A[item.q], l = L[item.q];
  if (!a || !l || !l.coverage) continue;
  n++;
  if (l.unanimous) unanimous++;
  const key = item.expect, model = a.coverage, blind = l.coverage;
  if (key === model) km++;
  if (key === blind) kb++;
  if (model === blind) mb++;
  if (key === model && model === blind) all3++;
  rows.push({ q: item.q, key, model, blind, agree: l.agreement, votes: l.votes });
}

console.log(`labels: ${LABELS}\n`);
console.log('KEY      MODEL    BLIND    votes    question');
console.log('-------  -------  -------  -------  --------------------------------------');
for (const r of rows) {
  const flag = r.key === r.model && r.model === r.blind ? ' ' : '*';
  console.log(`${r.key.padEnd(7)}  ${r.model.padEnd(7)}  ${r.blind.padEnd(7)}  ${r.agree.padEnd(7)}  ${flag} ${r.q.slice(0, 40)}`);
}
const pc = (x) => `${x}/${n}  ${(x / n * 100).toFixed(0)}%`;
console.log(`\npairwise agreement over ${n} questions`);
console.log(`  KEY   vs MODEL   ${pc(km)}`);
console.log(`  KEY   vs BLIND   ${pc(kb)}`);
console.log(`  MODEL vs BLIND   ${pc(mb)}`);
console.log(`  all three agree  ${pc(all3)}`);
console.log(`\nblind labeller unanimous on ${unanimous}/${n} (3/3 votes)`);

const split = rows.filter((r) => r.key !== r.model);
if (split.length) {
  console.log(`\nwhere KEY and MODEL disagreed, who did BLIND side with?`);
  let withModel = 0, withKey = 0, neither = 0;
  for (const r of split) {
    const side = r.blind === r.model ? 'MODEL' : r.blind === r.key ? 'KEY' : 'neither';
    if (side === 'MODEL') withModel++; else if (side === 'KEY') withKey++; else neither++;
    console.log(`  ${side.padEnd(7)} (key ${r.key}, model ${r.model}, blind ${r.blind})  ${r.q.slice(0, 40)}`);
  }
  console.log(`\n  sided with MODEL ${withModel}, with KEY ${withKey}, with neither ${neither}`);
}
