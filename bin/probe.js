'use strict';
// Two arms over the same ten questions:
//   closed-book  -- answer from the model's memory of the regulations
//   retrieval    -- answer only from retrieved section text, quoting verbatim
// Both are verified against the real corpus. The gap between them is the claim.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { verifyAnswer, index, VERDICT } = require('../lib/verify');

const ARMS = [
  { key: 'closed-book', file: 'answers-closed-book.json', label: 'Closed-book (answer from memory)' },
  { key: 'retrieval', file: 'answers-retrieval.json', label: 'Retrieval-gated (quote or drop)' },
  { key: 'closed-book-LIVE', file: 'answers-closed-book-live.json', label: 'Closed-book, live model' },
  { key: 'retrieval-LIVE', file: 'answers-retrieval-live.json', label: 'Retrieval-gated, live model' },
];

function pct(n, d) {
  return d === 0 ? '  n/a' : `${((n / d) * 100).toFixed(0).padStart(4)}%`;
}

function runArm(arm, corpus, byKey) {
  const p = path.join(__dirname, '..', 'data', arm.file);
  if (!fs.existsSync(p)) return null;
  const answers = JSON.parse(fs.readFileSync(p, 'utf8'));
  const results = answers.map((a) => verifyAnswer(a, corpus, byKey));
  const claims = results.flatMap((r) => r.claims);
  const tally = {};
  for (const c of claims) tally[c.verdict] = (tally[c.verdict] || 0) + 1;
  return { arm, results, claims, tally };
}

function main() {
  const corpus = load();
  const byKey = index(corpus);
  console.log(`Corpus: ${corpus.sections.length} sections of ${corpus.source}, as of ${corpus.asOf}`);
  console.log(`         ${corpus.builtFrom.map((p) => `${p.title} CFR ${p.part}`).join(', ')}\n`);

  const arms = ARMS.map((a) => runArm(a, corpus, byKey)).filter(Boolean);
  if (!arms.length) { console.error('No answer files in data/. Nothing to verify.'); process.exit(1); }

  console.log('arm                claims  verified  fabricated cite  fabricated quote  short');
  console.log('-----------------  ------  --------  ---------------  ----------------  -----');
  for (const a of arms) {
    const t = a.tally;
    const n = a.claims.length;
    console.log(
      `${a.arm.key.padEnd(17)}  ${String(n).padStart(6)}  ` +
      `${pct(t[VERDICT.VERIFIED] || 0, n)}    ` +
      `${String(t[VERDICT.FABRICATED_CITATION] || 0).padStart(15)}  ` +
      `${String(t[VERDICT.FABRICATED_QUOTE] || 0).padStart(16)}  ` +
      `${String(t[VERDICT.QUOTE_TOO_SHORT] || 0).padStart(5)}`
    );
  }

  for (const a of arms) {
    const bad = a.claims.filter((c) => c.verdict !== VERDICT.VERIFIED);
    if (!bad.length) continue;
    console.log(`\n${a.arm.label} -- every claim that would NOT reach the user:`);
    for (const c of bad) {
      console.log(`  [${c.verdict}] ${c.cite || '(no citation)'}`);
      console.log(`      claim: ${c.text.slice(0, 96)}`);
      console.log(`      quote: "${(c.quote || '').slice(0, 96)}"`);
    }
  }

  const ret = arms.find((a) => a.arm.key === 'retrieval');
  if (ret) {
    console.log(`\nWhat a user would actually see from the retrieval-gated arm:\n`);
    for (const r of ret.results.slice(0, 2)) {
      console.log(`Q: ${r.question}`);
      for (const c of r.verified) {
        console.log(`   ${c.text}`);
        console.log(`   ${c.cite} (${c.heading}) -- ${c.url}`);
        console.log(`   "${c.quote.slice(0, 150)}${c.quote.length > 150 ? '...' : ''}"\n`);
      }
      if (!r.verified.length) console.log('   (nothing verifiable -- nothing shown)\n');
    }
  }
}

main();
