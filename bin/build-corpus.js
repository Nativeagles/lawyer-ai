'use strict';
const { build, latestIssueDate } = require('../lib/corpus');

// A pinned past date silently yields superseded law -- that is how the first
// run of this probe quoted salary figures a court had vacated. Default to the
// newest issue eCFR actually has.
(async () => {
  const asOf = process.argv[2] || (await latestIssueDate(29));
  console.log(`Building corpus from eCFR as of ${asOf}`);
  return build(asOf);
})()
  .then((c) => console.log(`\nCorpus: ${c.sections.length} sections -> data/corpus.json`))
  .catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
