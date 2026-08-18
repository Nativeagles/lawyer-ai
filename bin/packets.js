'use strict';
// Dumps the exact retrieval packet each question would get, so answers can be
// authored (or audited) against the same text the model would see.
const fs = require('fs');
const path = require('path');
const { load } = require('../lib/corpus');
const { retrieveFor, packet } = require('../lib/answer');

const corpus = load();
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'questions', 'employment.json'), 'utf8'));
const k = Number(process.argv[2] || 4);
const out = questions.map((q, i) => {
  const sections = retrieveFor(corpus, q, k);
  return `=== Q${i + 1}: ${q}\n${packet(sections)}`;
}).join('\n\n');
fs.writeFileSync(path.join(__dirname, '..', 'data', 'packets.txt'), out);
console.log(`Wrote data/packets.txt (${out.length} chars, k=${k})`);
