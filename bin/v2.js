'use strict';
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { load } = require('../lib/corpus');
const { ask, MODEL } = require('../lib/answer2');
const RUN_MODEL = process.env.MODEL || MODEL;

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const client = new Anthropic({ maxRetries: 5 });
const corpus = load();
const q = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', f), 'utf8'));
const SET = process.env.SET || 'default';
const items = SET === 'near-miss'
  ? q('near-miss.json').questions.map((x) => ({ question: x.q, expect: x.expect, why: x.why }))
  : [
      ...q('consumer-set.json').map((question) => ({ question, inScope: true })),
      ...q('out-of-scope.json').map((question) => ({ question, inScope: false })),
    ];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`v2: whole corpus in context, no retrieval. ${RUN_MODEL}, ${corpus.sections.length} sections as of ${corpus.asOf}\n`);
  const out = [];
  let spent = { write: 0, read: 0, output: 0 };
  for (const [i, item] of items.entries()) {
    const tag = item.expect || (item.inScope ? 'in ' : 'OUT');
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${items.length} ${tag.padEnd(7)} ... `);
    let a = null;
    for (let attempt = 1; attempt <= 5 && !a; attempt++) {
      try {
        a = await ask(item.question, { corpus, client, model: RUN_MODEL });
      } catch (e) {
        const retryable = e.status === 529 || e.status === 429 || e.status >= 500;
        if (!retryable || attempt === 5) { console.log(`FAILED ${e.status}`); break; }
        process.stdout.write(`[${e.status} retry ${attempt}] `);
        await sleep(5000 * attempt);
      }
    }
    if (!a) { out.push({ ...item, failed: true, claims: [] }); continue; }
    spent.write += a.usage.cacheWrite || 0;
    spent.read += a.usage.cacheRead || 0;
    spent.output += a.usage.output || 0;
    out.push({ ...item, ...a });
    console.log(`${String(a.coverage).padEnd(8)} ${String(a.claims.length).padStart(2)} claims  (cache r/w ${a.usage.cacheRead}/${a.usage.cacheWrite})`);
  }
  const slug = RUN_MODEL.replace(/[^a-z0-9]+/gi, '-');
  const file = SET === 'near-miss' ? `answers-v2-near-miss-${slug}.json` : `answers-v2-${slug}.json`;
  fs.writeFileSync(path.join(__dirname, '..', 'data', file), JSON.stringify(out, null, 2));
  const cost = spent.write / 1e6 * 5 * 1.25 + spent.read / 1e6 * 5 * 0.1 + spent.output / 1e6 * 25;
  console.log(`\ncache write ${spent.write.toLocaleString()}  read ${spent.read.toLocaleString()}  output ${spent.output.toLocaleString()}`);
  console.log(`actual cost: $${cost.toFixed(2)}  ($${(cost / items.length).toFixed(3)}/question)`);
})();
