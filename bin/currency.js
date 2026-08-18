'use strict';
const { check } = require('../lib/currency');

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((s) => s.split('/'))
  : [['29', '541'], ['29', '825'], ['29', '778']];

(async () => {
  for (const [title, part] of targets) {
    const r = await check(title, part);
    console.log(`\n${r.cfr}   ${r.status}`);
    if (r.newestRule) console.log(`  newest rule   ${r.newestRule.date}  ${r.newestRule.citation}  ${r.newestRule.title.slice(0, 58)}`);
    for (const j of r.judgments) {
      console.log(`  RELIABLE      an agency rule implements a court judgment against this part:`);
      console.log(`                ${j.date}  ${j.citation}  ${j.url}`);
    }
    if (r.litigation.length) {
      console.log(`  (screen, unreliable — ${r.litigation.length} keyword hits, historically ~all off-topic:)`);
      for (const c of r.litigation.slice(0, 3)) console.log(`                ${c.filed} ${c.court} ${(c.case || '').slice(0, 46)}`);
    }
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
