'use strict';
// Runs an arm against the real model, then writes answers for the verifier.
// The retrieval arm ships four full regulation sections per question, so it is
// the request most likely to meet a 529 -- hence the backoff, which the SDK's
// two default retries were not enough for.
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { load } = require('../lib/corpus');
const { ask, retrieveFor, MODEL } = require('../lib/answer');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const client = new Anthropic({ maxRetries: 5 });
const corpus = load();
const QFILE = process.env.QUESTIONS || 'employment.json';
const K = Number(process.env.RETRIEVAL_K || 20);
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', QFILE), 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askWithBackoff(q, opts, attempts = 6) {
  let wait = 5000;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await ask(q, opts);
    } catch (e) {
      const retryable = e.status === 529 || e.status === 429 || e.status >= 500;
      if (!retryable || i === attempts) throw e;
      process.stdout.write(`[${e.status}, retry ${i} in ${Math.round(wait / 1000)}s] `);
      await sleep(wait + Math.floor(Math.random() * 2000));
      wait = Math.min(wait * 2, 60000);
    }
  }
}

async function arm(name, withRetrieval) {
  const out = [];
  for (const [i, q] of questions.entries()) {
    const retrieved = withRetrieval ? retrieveFor(corpus, q, K) : null;
    process.stdout.write(`  ${name} ${i + 1}/${questions.length} ... `);
    try {
      const a = await askWithBackoff(q, { corpus, retrieved, client });
      out.push(a);
      console.log(`${a.claims.length} claims`);
    } catch (e) {
      console.log(`FAILED: ${e.status} ${String(e.message).split('\n')[0].slice(0, 80)}`);
      out.push({ question: q, claims: [], failed: true });
    }
  }
  const tag = process.env.TAG ? `-${process.env.TAG}` : '';
  fs.writeFileSync(path.join(__dirname, '..', 'data', `answers-${name}-live${tag}.json`), JSON.stringify(out, null, 2));
  const ok = out.filter((a) => !a.failed).length;
  console.log(`\n  ${name}: ${ok}/${questions.length} answered\n`);
  return out;
}

(async () => {
  const which = process.argv[2];
  console.log(`Live run against ${MODEL}  questions=${QFILE}  k=${K}${which ? `  arm=${which}` : ''}\n`);
  if (!which || which === 'closed-book') await arm('closed-book', false);
  if (!which || which === 'retrieval') await arm('retrieval', true);
})();
