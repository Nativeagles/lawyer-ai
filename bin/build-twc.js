'use strict';
const { build } = require('../lib/twc-corpus');
console.log('Fetching Texas Workforce Commission Payday Law guidance');
build()
  .then((c) => {
    const chars = c.sections.reduce((s, x) => s + x.text.length, 0);
    console.log(`\n${c.sections.length} sections, ${chars.toLocaleString()} chars (~${Math.round(chars / 4).toLocaleString()} tokens)`);
    c.sections.forEach((s) => console.log(`   ${s.heading.slice(0, 58).padEnd(58)} ${String(s.text.length).padStart(6)} chars`));
    console.log('\n-> data/corpus-twc.json   (tagged sourceType=guidance, NOT statute)');
  })
  .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
