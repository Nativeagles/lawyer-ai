'use strict';
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { load } = require('../lib/corpus');
const { ask, MODEL } = require('../lib/answer3');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const client = new Anthropic({ maxRetries: 5 });
const fed = load();
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'corpus-ca.json'), 'utf8'));
const set = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'near-miss-ca.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`v3: federal + California, jurisdiction as input. ${MODEL}`);
  console.log(`    ${fed.sections.length} federal sections (${fed.asOf}) + ${state.sections.length} CA sections (${state.retrieved})\n`);
  const out = [];
  let w = 0, r = 0, o = 0;
  for (const [i, item] of set.questions.entries()) {
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${set.questions.length} want ${item.expect.padEnd(7)} ... `);
    let a = null;
    for (let t = 1; t <= 5 && !a; t++) {
      try { a = await ask(item.q, { fed, state, stateName: 'California', client }); }
      catch (e) {
        const retryable = e.status === 529 || e.status === 429 || e.status >= 500;
        if (!retryable || t === 5) { console.log(`FAILED ${e.status}`); break; }
        process.stdout.write(`[${e.status} retry] `); await sleep(5000 * t);
      }
    }
    if (!a) { out.push({ ...item, failed: true, claims: [] }); continue; }
    w += a.usage.cacheWrite || 0; r += a.usage.cacheRead || 0; o += a.usage.output || 0;
    out.push({ ...item, question: item.q, ...a });
    console.log(`got ${String(a.coverage).padEnd(7)} ${String(a.governing).padEnd(7)} ${String(a.claims.length).padStart(2)} claims`);
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'answers-v3-ca.json'), JSON.stringify(out, null, 2));
  const cost = w / 1e6 * 6.25 + r / 1e6 * 0.5 + o / 1e6 * 25;
  console.log(`\ncache w/r ${w.toLocaleString()}/${r.toLocaleString()}  output ${o.toLocaleString()}   cost $${cost.toFixed(2)} ($${(cost / set.questions.length).toFixed(3)}/q)`);
})();
