'use strict';
// v3: jurisdiction is an input, not a caveat.
//
// The near-miss test showed PARTIAL is the correct answer to almost any US
// employment question when only federal law is loaded, because federal law is a
// floor and every state builds on it. A flag that is right almost every time
// carries no information, and "check your state" appended to every answer is
// noise. So the state goes in the prompt instead.
const MODEL = 'claude-opus-5';

const SCHEMA = {
  type: 'object',
  properties: {
    coverage: { type: 'string', enum: ['FULL', 'PARTIAL', 'NONE'], description: 'FULL: the law provided decides the whole question for this worker. PARTIAL: it decides part, and some other body of law decides the rest. NONE: it does not decide it at all.' },
    governing: { type: 'string', enum: ['FEDERAL', 'STATE', 'BOTH', 'NEITHER'], description: 'Which body of law actually determines the outcome for this worker. Where both apply and they differ, the one more favourable to the employee governs, so say which that is. If coverage is NONE this must be NEITHER — nothing can govern a question the provided law does not decide.' },
    limits: { type: 'string', description: 'Required unless coverage is FULL. One plain sentence naming what the law provided cannot decide and which body of law does.' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One legal claim in plain English, for a non-lawyer.' },
          cite: { type: 'string', description: 'Exactly as it appears in the heading of the provision, e.g. "29 CFR 541.100" or "Cal. Lab. Code § 510".' },
          quote: { type: 'string', description: 'At least 40 characters copied exactly from that provision. Never paraphrase or stitch passages together.' },
        },
        required: ['text', 'cite', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['coverage', 'governing', 'limits', 'claims'],
  additionalProperties: false,
};

function systemFor(state) {
  return `You answer wage, hour and leave questions for a worker in ${state}, for a reader who is not a lawyer.

Below is the complete text of the law available to you: the federal regulations (29 CFR parts 541, 778, 785, 531, 795, 825) and the ${state} Labor Code sections that govern wages, hours, overtime, gratuities, meal and rest periods, expenses and contractor status. There is nothing else.

RULE 1 — Quote or say nothing.
Every claim carries a verbatim quote from a provision below, copied character for character. Never paraphrase into the quote field, never join separate passages with an ellipsis, never reconstruct wording from memory. A claim you cannot quote must not be made.

RULE 2 — Federal law is a floor, not the answer.
Where federal and ${state} law both apply and differ, **the rule more favourable to the employee governs**, and that is usually the state one. Do not report the federal position as the answer when ${state} law gives this worker more. Work out which actually decides the outcome and say so in \`governing\`. Answering "you are exempt under federal law" to someone ${state} law protects is the specific failure to avoid.

RULE 3 — Say how much you actually decided.
FULL — the provisions below decide the question for this worker. Leave limits empty.
PARTIAL — they decide part of it. Give claims for that part and name the rest in limits.
NONE — they do not decide it. No claims; name in limits the body of law that does.

Now that ${state} law is in front of you, many questions that federal law alone could only half answer are fully answerable. Do not reach for PARTIAL out of caution — use it when something genuinely material sits outside both bodies of law, such as discrimination, benefits eligibility, immigration, child labour, or court procedure and remedies.

The trap: these provisions will often contain something that sounds adjacent. Adjacent is not responsive. Before citing, ask whether it decides the question actually asked.`;
}

function block(fed, state) {
  const f = fed.sections.map((s) => `### ${s.citation} — ${s.heading}\n${s.text}`).join('\n\n');
  const c = state.sections.map((s) => `### ${s.citation}\n${s.text}`).join('\n\n');
  return `## FEDERAL LAW (29 CFR, as of ${fed.asOf})\n\n${f}\n\n\n## ${state.jurisdiction} STATE LAW (Labor Code, retrieved ${state.retrieved})\n\n${c}`;
}

// JSON Schema can require each field independently but cannot say "if coverage
// is NONE then governing must be NEITHER". So the incoherent combinations get
// checked here. Found in the wild: coverage NONE returned alongside governing
// STATE -- if no provision decides a question, nothing governs it.
function validate(a) {
  const v = [];
  const n = (a.claims || []).length;
  if (a.coverage === 'NONE') {
    if (a.governing !== 'NEITHER') v.push(`coverage NONE but governing ${a.governing}; nothing decides it, so nothing governs it`);
    if (n > 0) v.push(`coverage NONE but ${n} claims returned`);
    if (!(a.limits || '').trim()) v.push('coverage NONE but no limits given; the reader is told nothing about where to go');
  }
  if (a.coverage === 'FULL' && (a.limits || '').trim()) v.push('coverage FULL but limits non-empty; say PARTIAL or drop the caveat');
  if (a.coverage === 'PARTIAL' && !(a.limits || '').trim()) v.push('coverage PARTIAL but no limits given');
  if (a.coverage !== 'NONE' && n === 0) v.push(`coverage ${a.coverage} but no claims returned`);
  if (a.governing === 'NEITHER' && n > 0 && a.coverage !== 'NONE') v.push('governing NEITHER but claims returned');
  return v;
}

async function ask(question, { fed, state, stateName, client }) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [
      // Corpus first, instructions second. The corpus is the stable, expensive
      // half; putting it ahead of the breakpoint means editing the instructions
      // no longer invalidates 250k tokens of cache.
      { type: 'text', text: block(fed, state) },
      { type: 'text', text: systemFor(stateName), cache_control: { type: 'ephemeral', ttl: '1h' } },
    ],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: question }],
  });
  const b = res.content.find((x) => x.type === 'text');
  const parsed = JSON.parse(b.text);
  const violations = validate(parsed);
  return {
    question,
    ...parsed,
    violations,
    usage: { cacheWrite: res.usage.cache_creation_input_tokens, cacheRead: res.usage.cache_read_input_tokens, output: res.usage.output_tokens },
  };
}

module.exports = { ask, validate, SCHEMA, MODEL, systemFor, block };
