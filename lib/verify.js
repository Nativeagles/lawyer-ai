'use strict';
// The claim under test: a legal answer may only assert what it can quote.
//
// Every claim arrives as {text, cite, quote}. This checks the quote is really
// in the cited section, word for word. A claim that fails is not flagged for
// the reader to weigh up -- it is dropped before rendering. That is the whole
// difference between "we measured our hallucination rate" and "a fabricated
// citation cannot reach the user".
const { normalise } = require('./corpus');

const MIN_QUOTE_CHARS = 40; // a four-word quote matches half the corpus

const VERDICT = {
  VERIFIED: 'VERIFIED',
  FABRICATED_CITATION: 'FABRICATED_CITATION', // cite names a section that does not exist
  FABRICATED_QUOTE: 'FABRICATED_QUOTE',       // section is real, the words are not in it
  QUOTE_TOO_SHORT: 'QUOTE_TOO_SHORT',         // unfalsifiable, so not accepted
  NO_CITATION: 'NO_CITATION',                 // bare assertion
};

// Two citation systems now. Compare each on its bones so that a difference of
// punctuation, an abbreviation, or a subsection suffix never reads as a
// fabrication -- being more precise is not being wrong.
function citeKey(cite) {
  const raw = String(cite || '').trim();
  // Agency guidance is cited by its heading, not a section number.
  if (/TWC|Texas Workforce/i.test(raw)) {
    const tail = raw.replace(/.*?(?:payday law)?\s*[—:-]\s*/i, '').trim() || raw;
    return `TWC:${tail.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  }
  // California: "Cal. Lab. Code § 510", "Labor Code 510", "Lab Code sec. 226.7"
  if (/lab(?:or)?\.?\s*code/i.test(raw)) {
    const m = /(\d+(?:\.\d+)?)/.exec(raw.replace(/lab(?:or)?\.?\s*code/i, ''));
    return m ? `Cal. Lab. Code § ${m[1]}` : null; // same rule: section, ignore the rest
  }
  return cfrKey(raw);
}

// Anchored on the section number, NOT on the end of the string. Three separate
// bugs came from trying to enumerate the legal suffixes -- "(a)", then "(a)(1)",
// then ranges "(b)-(c)", lists "(a), (b)" and compound cites. Every one of those
// is a MORE precise citation than a bare section, and every one was being scored
// as a fabrication. Take the section and ignore whatever follows it.
function cfrKey(cite) {
  const m = /(\d+)\s*(?:C\.?F\.?R\.?|CFR)\s*(?:§+\s*)?(\d+\.\d+)/i.exec(String(cite || ''));
  return m ? `${m[1]} CFR ${m[2]}` : null;
}

function index(...corpora) {
  const byKey = new Map();
  for (const corpus of corpora.flat()) {
    for (const s of corpus.sections) {
      const k = citeKey(s.citation);
      if (k) byKey.set(k, s);
    }
  }
  return byKey;
}

function verifyClaim(claim, byKey) {
  const out = { ...claim };
  if (!claim.cite) { out.verdict = VERDICT.NO_CITATION; return out; }

  const key = citeKey(claim.cite);
  const section = key ? byKey.get(key) : null;
  if (!section) { out.verdict = VERDICT.FABRICATED_CITATION; return out; }

  out.url = section.url;
  out.heading = section.heading;
  out.asOf = section.asOf;

  const quote = normalise(claim.quote || '');
  if (quote.length < MIN_QUOTE_CHARS) { out.verdict = VERDICT.QUOTE_TOO_SHORT; return out; }

  // Verbatim, modulo whitespace and the quote marks that get mangled in transit.
  const flatten = (s) => normalise(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  out.verdict = flatten(section.text).includes(flatten(quote))
    ? VERDICT.VERIFIED
    : VERDICT.FABRICATED_QUOTE;
  return out;
}

function verifyAnswer(answer, corpus, byKeyMaybe) {
  const byKey = byKeyMaybe || index(corpus);
  const claims = (answer.claims || []).map((c) => verifyClaim(c, byKey));
  const verified = claims.filter((c) => c.verdict === VERDICT.VERIFIED);
  return {
    question: answer.question,
    claims,
    verified,
    dropped: claims.filter((c) => c.verdict !== VERDICT.VERIFIED),
    total: claims.length,
    verifiedCount: verified.length,
  };
}

module.exports = { verifyAnswer, verifyClaim, index, citeKey, VERDICT, MIN_QUOTE_CHARS };
