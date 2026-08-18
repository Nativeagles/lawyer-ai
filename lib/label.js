'use strict';
// An independent labeller for the answer key.
//
// Every score in this project compares model output against labels I wrote by
// hand. Three times the model disagreed with those labels, I inspected, and I
// ruled for the model. That is circular: the author of the key is not a
// disinterested judge of the key. This asks something else.
//
// "Independent" here means blind to my key AND to the answering model's output,
// and run on a different model to decouple idiosyncrasies. It does NOT mean
// authoritative -- it is still an LLM, still Anthropic-family, and a real answer
// needs an employment lawyer. What it can do is tell me whether my inspections
// were reasoning or rationalising.
const MODEL = 'claude-sonnet-5';

const SCHEMA = {
  type: 'object',
  properties: {
    coverage: { type: 'string', enum: ['FULL', 'PARTIAL', 'NONE'] },
    reason: { type: 'string', description: 'One sentence. What the listed law does or does not settle here.' },
  },
  required: ['coverage', 'reason'],
  additionalProperties: false,
};

const SYSTEM = `You are auditing the SCOPE of a legal research corpus. You are not answering the question.

You will be given a worker's question and a manifest of every legal provision available — citation and subject only, not full text. Judge how much of that question the listed law can decide for a worker in California.

FULL — the listed provisions decide the question as asked, start to finish.
PARTIAL — they decide part of it, and something material sits outside them.
NONE — they do not decide it at all.

Two things to hold onto.

Read the question as asked, not as a topic. "Do I get paid for a break" is a question about payment; whether the worker is entitled to a break at all is a different question, and a corpus can settle one without the other.

Federal wage law is a floor and state law may require more, so where both are listed, ask which actually determines the outcome. Note also what is absent: discrimination, benefits eligibility, child labour, immigration, court procedure, remedies, and the right to be disciplined or fired are not wage-and-hour law and are not in this manifest.

Judge only from the manifest. Do not assume a provision exists because it ought to.`;

function fullBody(fed, state) {
  const f = fed.sections.map((s) => `### ${s.citation} — ${s.heading}\n${s.text}`).join('\n\n');
  const c = state.sections.map((s) => `### ${s.citation}\n${s.text}`).join('\n\n');
  return `## FEDERAL (29 CFR)\n\n${f}\n\n\n## CALIFORNIA (Labor Code)\n\n${c}`;
}

function manifest(fed, state) {
  const f = fed.sections.map((s) => `${s.citation} — ${s.heading}`).join('\n');
  const c = state.sections.map((s) => `${s.citation} — ${s.text.slice(0, 110).replace(/\s+/g, ' ')}...`).join('\n');
  return `## FEDERAL (29 CFR)\n${f}\n\n## CALIFORNIA (Labor Code)\n${c}`;
}

// The manifest-only labeller can only judge scope from citations and subjects.
// That is a real handicap and it biases toward PARTIAL: you cannot tell whether
// a section settles a question without reading it. FULLTEXT gives the labeller
// the same text the answering model had, so the comparison is like for like and
// any remaining disagreement is judgment rather than blindness.
async function label(question, { fed, state, client, samples = 3, fullText = false }) {
  const votes = [];
  for (let i = 0; i < samples; i++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 12000, // 4000 truncated a response mid-JSON on the first run
      system: [
        { type: 'text', text: fullText ? fullBody(fed, state) : manifest(fed, state), cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: fullText ? SYSTEM.replace('citation and subject only, not full text', 'in full') : SYSTEM },
      ],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: question }],
    });
    const b = res.content.find((x) => x.type === 'text');
    votes.push(JSON.parse(b.text));
  }
  const tally = {};
  for (const v of votes) tally[v.coverage] = (tally[v.coverage] || 0) + 1;
  const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return {
    question,
    coverage: winner[0],
    agreement: `${winner[1]}/${votes.length}`,
    unanimous: winner[1] === votes.length,
    votes: votes.map((v) => v.coverage),
    reasons: votes.map((v) => v.reason),
  };
}

module.exports = { label, MODEL, SYSTEM, manifest, fullBody };
