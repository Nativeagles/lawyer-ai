'use strict';
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { load } = require('../lib/corpus');
const { label, MODEL } = require('../lib/label');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const client = new Anthropic({ maxRetries: 5 });
const fed = load();
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'corpus-ca.json'), 'utf8'));
const set = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'near-miss-ca.json'), 'utf8'));

const FULLTEXT = process.env.FULLTEXT === '1';

(async () => {
  console.log(`Independent labelling with ${MODEL}, 3 blind votes per question. ${FULLTEXT ? 'FULL TEXT' : 'manifest only'}`);
  console.log(`Blind to: the hand-written key, and the answering model's output.\n`);
  const out = [];
  for (const [i, item] of set.questions.entries()) {
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${set.questions.length} ... `);
    try {
      const r = await label(item.q, { fed, state, client, fullText: FULLTEXT });
      out.push(r);
      console.log(`${r.coverage.padEnd(7)} ${r.agreement}${r.unanimous ? '' : '  [split: ' + r.votes.join(',') + ']'}`);
    } catch (e) {
      console.log(`FAILED ${e.status || ''} ${String(e.message).slice(0, 60)}`);
      out.push({ question: item.q, coverage: null });
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', FULLTEXT ? 'labels-independent-fulltext.json' : 'labels-independent.json'), JSON.stringify(out, null, 2));
  console.log(`\nwrote data/labels-independent${FULLTEXT ? '-fulltext' : ''}.json`);
})();
