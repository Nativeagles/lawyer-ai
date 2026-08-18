'use strict';
// How much of a realistic consumer question set actually lands on a provision
// whose governing rule has been overturned in court? Retrieval decides which
// sections answer a question; the currency check decides which parts are
// contested. Intersect them.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { buildIndex, search } = require('../lib/retrieve');
const { check } = require('../lib/currency');

(async () => {
  const corpus = load();
  const idx = buildIndex(corpus);
  const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'consumer-set.json'), 'utf8'));
  const parts = [...new Set(corpus.sections.map((s) => s.part))];

  const contested = {};
  for (const p of parts) {
    const r = await check('29', p, { screen: false });
    contested[p] = r.flag ? r.judgments[0] : null;
  }
  console.log(`Corpus ${corpus.sections.length} sections, as of ${corpus.asOf}`);
  console.log(`Contested parts: ${parts.filter((p) => contested[p]).map((p) => '29 CFR ' + p).join(', ') || 'none'}\n`);

  let exposed = 0;
  const rows = [];
  for (const q of questions) {
    const K = 20;
    const hits = search(idx, q, K).map((r) => r.section);
    const hitParts = [...new Set(hits.map((s) => s.part))];
    const bad = hitParts.filter((p) => contested[p]);
    // Exposed only if a contested part supplies the TOP result -- the section
    // most likely to carry the answer. Counting any hit in the top 4 would
    // overstate it, since a stray retrieval does not mean the answer rests there.
    const topContested = Boolean(contested[hits[0].part]);
    if (topContested) exposed++;
    rows.push({ q, top: hits[0].citation, topPart: hits[0].part, topContested, anyContested: bad.length > 0 });
  }

  for (const r of rows) {
    console.log(`${r.topContested ? 'EXPOSED ' : '   ok   '} ${r.top.padEnd(15)} ${r.q.slice(0, 66)}`);
  }
  const any = rows.filter((r) => r.anyContested).length;
  console.log(`\n${exposed}/${rows.length} questions (${(exposed / rows.length * 100).toFixed(0)}%) have their TOP section in a contested part`);
  console.log(`${any}/${rows.length} (${(any / rows.length * 100).toFixed(0)}%) touch a contested part anywhere in the top ${20}`);
})();
