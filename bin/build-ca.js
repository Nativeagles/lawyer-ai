'use strict';
const { build } = require('../lib/ca-corpus');
console.log('Building California Labor Code corpus from leginfo.legislature.ca.gov');
build()
  .then((c) => {
    const chars = c.sections.reduce((s, x) => s + x.text.length, 0);
    console.log(`\n${c.sections.length} sections, ${chars.toLocaleString()} chars (~${Math.round(chars / 4).toLocaleString()} tokens) -> data/corpus-ca.json`);
  })
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
