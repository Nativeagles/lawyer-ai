'use strict';
// A state is either a corpus we hold, or a specific declared gap.
//
// California's Labor Code is obtainable and loaded. Texas's is not: the
// Legislature serves its statutes through a JavaScript app that returns no text
// to a fetch, Justia refuses automated requests, and public.law does not expose
// section pages. Rather than pretend, or quietly answer Texas questions with
// federal law alone, the gap is named to the reader in the terms that matter to
// them -- which is possible here because Texas adds little to federal wage and
// hour law, and what it adds is enumerable.
const fs = require('fs');
const path = require('path');

function loadTWC() {
  const p = path.join(__dirname, '..', 'data', 'corpus-twc.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadCA() {
  const p = path.join(__dirname, '..', 'data', 'corpus-ca.json');
  if (!fs.existsSync(p)) return null;
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  c.name = 'California';
  return c;
}

const JURISDICTIONS = {
  TX: {
    code: 'TX',
    name: 'Texas',
    corpus: null,          // the Labor Code itself cannot be obtained
    guidance: loadTWC(),   // what the agency administering it publishes
    // Stated positively where federal law really is the answer, because in
    // Texas it usually is -- that is the useful half of this message.
    federalIsTheAnswerFor: [
      'the minimum wage (Texas adopts the federal rate)',
      'overtime after 40 hours in a week',
      'which hours count as work — travel, on-call, training, breaks',
      'whether you are exempt from overtime',
      'tips and tip credits',
      'employee or independent contractor status',
      'FMLA leave',
    ],
    gaps: [
      'the text of the Texas Labor Code itself — for Payday Law questions you have the Texas Workforce Commission’s own published guidance instead, which is the agency that administers it, but that is a summary rather than the statute',
      'the Texas Minimum Wage Act (Labor Code ch. 62)',
    ],
    notes: 'Texas sets no daily overtime, requires no meal or rest breaks, and adds no salary threshold above the federal one — so for those questions federal law is the whole answer.',
  },
  CA: {
    code: 'CA',
    name: 'California',
    corpus: loadCA(),
    guidance: null,
    federalIsTheAnswerFor: [],
    gaps: [
      'the IWC Wage Orders, which create California’s rest-break entitlement and industry-specific rules',
      'California case law and DLSE opinion letters',
    ],
    notes: 'California overrides federal law on most wage and hour questions, so the state provisions usually decide the outcome.',
  },
  US: {
    code: 'US',
    name: null,
    corpus: null,
    guidance: null,
    federalIsTheAnswerFor: [],
    gaps: ['every state’s own wage and hour law, which usually adds to the federal floor'],
    notes: 'Federal law is a minimum. Almost every state requires more, so this gives you the floor rather than your answer.',
  },
};

function get(code) {
  return JURISDICTIONS[String(code || 'US').toUpperCase()] || JURISDICTIONS.US;
}

function list() {
  return Object.values(JURISDICTIONS).map((j) => ({
    code: j.code,
    label: j.name || 'Federal law only',
    hasStateLaw: Boolean(j.corpus),
    hasGuidance: Boolean(j.guidance),
    sections: (j.corpus ? j.corpus.sections.length : 0) + (j.guidance ? j.guidance.sections.length : 0),
    sourceNote: j.corpus ? 'state statutes' : j.guidance ? 'state agency guidance (not statute)' : null,
  }));
}

// Everything a jurisdiction puts in front of the model, statute and guidance.
function bodies(j) {
  return [j.corpus, j.guidance].filter(Boolean);
}

module.exports = { get, list, bodies, JURISDICTIONS };
