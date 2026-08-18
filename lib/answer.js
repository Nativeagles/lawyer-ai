'use strict';
// The answerer is pluggable on purpose. The verifier is the part that proves
// the claim, and it needs no model at all -- so the probe still produces a
// hard number on a machine with no API key.
const { buildIndex, search } = require('./retrieve');

const MODEL = 'claude-opus-5';

// Every claim must arrive already carrying its evidence. Asking for the quote
// in the same breath as the assertion is what makes verification possible.
const CLAIM_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One legal claim, in plain English, for a non-lawyer.' },
          cite: { type: 'string', description: 'The regulation section, e.g. "29 CFR 541.100".' },
          quote: { type: 'string', description: 'Verbatim words from that section that support the claim. At least 40 characters. Copy exactly; do not paraphrase.' },
        },
        required: ['text', 'cite', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['claims'],
  additionalProperties: false,
};

const CLOSED_BOOK = `You answer US employment law questions about the FLSA and FMLA.
For each claim, give the regulation citation and a verbatim quote from it.
Answer from your own knowledge of the regulations.`;

const RETRIEVAL_GATED = `You answer US employment law questions about the FLSA and FMLA.

You have been given the full text of the regulation sections below. These are
the ONLY sections you may cite. Every claim must quote the words that support
it, copied character for character from the text below -- never from memory,
never paraphrased, never reconstructed. If the sections below do not answer the
question, return no claims at all. An honest empty answer is correct; a claim
you cannot quote is not.`;

function packet(sections) {
  return sections
    .map((s) => `### ${s.citation} -- ${s.heading}\n${s.text}`)
    .join('\n\n');
}

async function ask(question, { corpus, retrieved, client }) {
  const closedBook = !retrieved;
  const system = closedBook ? CLOSED_BOOK : RETRIEVAL_GATED;
  const user = closedBook
    ? question
    : `${packet(retrieved)}\n\n---\n\nQuestion: ${question}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: CLAIM_SCHEMA } },
    messages: [{ role: 'user', content: user }],
  });

  const block = res.content.find((b) => b.type === 'text');
  return { question, ...JSON.parse(block.text) };
}

// k=20, not 4. Measured on the 22-question consumer set: the section that
// actually answers the question is in the top 4 only 55% of the time, and in
// the top 20 95% of the time. BM25 finds it and ranks it badly, and no weighting
// or length-normalisation setting tried moved precision@1 off ~36%. Since the
// model must quote verbatim from what it is given, handing it more candidates
// is close to free -- it cannot fabricate from the extra ones.
function retrieveFor(corpus, question, k = 20) {
  return search(buildIndex(corpus), question, k).map((r) => r.section);
}

module.exports = { ask, retrieveFor, packet, MODEL, CLAIM_SCHEMA };
