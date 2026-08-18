'use strict';
// Cheaper-model comparison, scored ONLY on things checkable against the source.
// Coverage/PARTIAL judgments are deliberately excluded: the independent-labeller
// run showed those labels are unstable (three judges agreed 42% of the time, and
// one judge disagreed with itself on half), so scoring a model against them
// measures noise. What is left is checkable:
//   verified  -- is the quote actually in the cited provision
//   grounded  -- did it cite a provision the section-level key accepts
//   declined  -- did it refuse where the law genuinely is not present
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { verifyAnswer, index, VERDICT } = require('../lib/verify');

const { key } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'answer-key.json'), 'utf8'));
const corpus = load();
const byKey = index(corpus);
const PRICE = { 'claude-opus-5': [5, 25], 'claude-sonnet-5': [3, 15], 'claude-haiku-4-5': [1, 5] };

function score(file, label) {
  const p = path.join(__dirname, '..', 'data', file);
  if (!fs.existsSync(p)) return null;
  const answers = JSON.parse(fs.readFileSync(p, 'utf8'));
  const model = answers.find((a) => a.model)?.model || label;
  let claims = 0, verified = 0, grounded = 0, inN = 0, declined = 0, outN = 0, failed = 0;
  let w = 0, r = 0, o = 0;
  for (const a of answers) {
    if (a.failed) { failed++; continue; }
    if (a.usage) { w += a.usage.cacheWrite || 0; r += a.usage.cacheRead || 0; o += a.usage.output || 0; }
    const res = verifyAnswer(a, corpus, byKey);
    const good = res.claims.filter((c) => c.verdict === VERDICT.VERIFIED);
    claims += res.claims.length;
    verified += good.length;
    if (a.inScope) {
      inN++;
      const gold = key[a.question] || [];
      if (good.some((c) => gold.some((g) => c.cite && c.cite.startsWith(g)))) grounded++;
    } else {
      outN++;
      const said = a.coverage ? a.coverage === 'NONE' : a.answerable === false;
      if (said && (a.claims || []).length === 0) declined++;
    }
  }
  const [pin, pout] = PRICE[model] || PRICE['claude-opus-5'];
  const cost = w / 1e6 * pin * 1.25 + r / 1e6 * pin * 0.1 + o / 1e6 * pout;
  const n = answers.length;
  return { label, model, claims, verified, grounded, inN, declined, outN, failed, cost, perQ: cost / n };
}

const runs = [
  score('answers-v2.json', 'opus-5 (baseline)'),
  score('answers-v2-claude-sonnet-5.json', 'sonnet-5'),
  score('answers-v2-claude-haiku-4-5.json', 'haiku-4.5'),
].filter(Boolean);

console.log('model               verified   grounded    declined   failed   $/question   vs opus');
console.log('------------------  ---------  ----------  ---------  -------  -----------  -------');
const base = runs[0];
for (const r of runs) {
  const rel = base && r !== base ? `${(r.perQ / base.perQ * 100).toFixed(0)}%` : '—';
  console.log(
    `${r.label.padEnd(18)}  ${(r.verified / r.claims * 100).toFixed(0).padStart(7)}%  ` +
    `${String(r.grounded + '/' + r.inN).padStart(8)}  ${String(r.declined + '/' + r.outN).padStart(9)}  ` +
    `${String(r.failed).padStart(7)}  ${('$' + r.perQ.toFixed(3)).padStart(11)}  ${rel.padStart(7)}`
  );
}
console.log('\nverified = quote really is in the cited provision');
console.log('grounded = cites a provision the section-level key accepts (22 in-scope)');
console.log('declined = correctly refused where the law is absent (8 out-of-scope)');
