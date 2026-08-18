'use strict';
// The answerer the app uses. Everything measured in this project, assembled:
//   claude-sonnet-5   -- identical to Opus on every checkable metric, 56% cost
//   whole corpus      -- no retrieval; retrieval cost 45% of answers their law
//   verbatim quotes   -- verified server-side, unverified claims never sent
//   jurisdiction      -- an input, because federal law is only a floor
const { verifyAnswer, index, VERDICT } = require('./verify');

const MODEL = process.env.ANSWER_MODEL || 'claude-sonnet-5';

const SCHEMA = {
  type: 'object',
  properties: {
    coverage: { type: 'string', enum: ['FULL', 'PARTIAL', 'NONE'] },
    governing: { type: 'string', enum: ['FEDERAL', 'STATE', 'BOTH', 'NEITHER'] },
    limits: { type: 'string', description: 'Required unless coverage is FULL. One plain sentence naming what the law here cannot decide and which body of law does.' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One point in plain English, for someone who is not a lawyer.' },
          cite: { type: 'string', description: 'Exactly as it appears in the provision heading.' },
          quote: { type: 'string', description: 'At least 40 characters copied exactly. Never paraphrase or stitch passages.' },
        },
        required: ['text', 'cite', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['coverage', 'governing', 'limits', 'claims'],
  additionalProperties: false,
};

function corpusText(fed, j) {
  const out = [`## FEDERAL LAW — 29 CFR (statute text, as published ${fed.asOf})\n\n`
    + fed.sections.map((x) => `### ${x.citation} — ${x.heading}\n${x.text}`).join('\n\n')];

  if (j.corpus) {
    out.push(`## ${j.name.toUpperCase()} LAW — Labor Code (statute text, retrieved ${j.corpus.retrieved})\n\n`
      + j.corpus.sections.map((x) => `### ${x.citation}\n${x.text}`).join('\n\n'));
  }
  if (j.guidance) {
    out.push(`## ${j.name.toUpperCase()} — ${j.guidance.source} GUIDANCE (NOT statute text, retrieved ${j.guidance.retrieved})\n\n`
      + `This is what the agency that administers the law publishes about it. It is quotable and it is `
      + `authoritative about the agency's own practice, but it is a summary written by the agency, not the `
      + `text of the statute. Say so when you rely on it.\n\n`
      + j.guidance.sections.map((x) => `### ${x.citation}\n${x.text}`).join('\n\n'));
  }
  return out.join('\n\n\n');
}

function instructions(j) {
  const where = j.name ? `a worker in ${j.name}` : 'a worker in the United States';

  let rule2;
  if (j.corpus) {
    rule2 = `RULE 2 — Federal law is a floor, not the answer.
Where federal and ${j.name} law both apply and differ, the rule more favourable to the employee governs, and that is usually the state one. Work out which actually decides this worker's outcome and say so in \`governing\`. Reporting the federal position as the answer when ${j.name} law gives this worker more is the specific failure to avoid.`;
  } else if (j.guidance) {
    rule2 = `RULE 2 — You have federal statute plus ${j.name} agency guidance, and they are not the same kind of thing.

For these subjects, federal law genuinely is the answer in ${j.name}, and you may answer FULL from 29 CFR:
${j.federalIsTheAnswerFor.map((x) => `  - ${x}`).join('\n')}

${j.notes}

For pay frequency, final paychecks, permitted deductions and wage claims, ${j.name} law governs and you do NOT have its text. What you have is the ${j.guidance.source}'s published guidance on it. You may quote that and it is genuinely useful — it is the agency that administers the law. But when a point rests on it, say plainly in that point that this is what the agency says rather than the words of the statute, and set coverage to PARTIAL rather than FULL. The reader should know they are getting a reliable summary, not the law itself.

Still absent entirely: the Texas Minimum Wage Act, and the Labor Code text behind any of the above.`;
  } else if (j.name) {
    // A state with no corpus. Being specific about what is missing is the
    // difference between a useful limitation and a useless disclaimer.
    rule2 = `RULE 2 — You have federal law only. No ${j.name} statutes are loaded.

For these subjects, federal law genuinely is the answer in ${j.name}, and you may answer FULL:
${j.federalIsTheAnswerFor.map((x) => `  - ${x}`).join('\n')}

${j.notes}

But ${j.name} law, which you do NOT have, governs:
${j.gaps.map((x) => `  - ${x}`).join('\n')}

If the question turns on any of those, do not answer it from federal law. Set coverage NONE or PARTIAL and name the ${j.name} law that governs it, so the reader knows exactly where to go.`;
  } else {
    rule2 = `RULE 2 — Federal law is only a floor.
No state law is loaded. Federal law sets a minimum and almost every state adds to it, so for most questions you can give the federal position but not this worker's answer. Say so: coverage PARTIAL, governing FEDERAL, and name the state law gap in \`limits\`.`;
  }

  return `You answer wage, hour and leave questions for ${where}, for a reader who is not a lawyer.

Above is the complete text of the law available to you. There is nothing else.

RULE 1 — Quote or say nothing.
Every point carries a verbatim quote from a provision above, copied character for character. Never paraphrase into the quote field, never join separate passages with an ellipsis, never reconstruct wording from memory. A point you cannot quote must not be made. Quotes are checked automatically before the reader sees them and anything that does not match is discarded — so a fabricated quote costs the reader your point.

${rule2}

RULE 3 — Say how much you actually decided.
FULL — the provisions above decide the question for this worker; leave limits empty.
PARTIAL — they decide part; give the points they support and name the rest in limits.
NONE — they do not decide it; no points, and name in limits the body of law that does.

If coverage is NONE then governing must be NEITHER — nothing can govern a question this law does not decide.

Wage and hour law does not cover discrimination, wrongful dismissal, unemployment, workers' compensation, benefits eligibility, non-competes, child labour, immigration status, court procedure or remedies. When a question turns on one of those, say so plainly and name it.

The trap: these provisions often contain something that merely *sounds* adjacent. Adjacent is not responsive. Before citing a provision, ask whether it decides the question actually asked.

Write for someone worried about their job and their money. Short sentences. Explain any legal term you use.`;
}

async function answer(question, { client, fed, jurisdiction, byKey }) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      // Corpus first so it stays cached when the instructions are edited.
      { type: 'text', text: corpusText(fed, jurisdiction) },
      { type: 'text', text: instructions(jurisdiction), cache_control: { type: 'ephemeral', ttl: '1h' } },
    ],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: question }],
  });

  const block = res.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(block.text);

  // Nothing unverified reaches the reader. This is the whole design.
  const checked = verifyAnswer({ question, claims: parsed.claims || [] }, fed, byKey);
  const kept = checked.claims.filter((c) => c.verdict === VERDICT.VERIFIED);
  const dropped = checked.claims.length - kept.length;

  return {
    coverage: dropped === kept.length && kept.length === 0 && parsed.coverage !== 'NONE' ? 'NONE' : parsed.coverage,
    governing: kept.length === 0 && parsed.coverage === 'NONE' ? 'NEITHER' : parsed.governing,
    limits: parsed.limits || '',
    claims: kept.map((c) => ({
      text: c.text, cite: c.cite, quote: c.quote, url: c.url, heading: c.heading,
      // Let the page mark guidance visually rather than trusting prose to do it.
      sourceType: /TWC|Texas Workforce/i.test(c.cite || '') ? 'guidance' : 'statute',
    })),
    dropped,
    model: MODEL,
    usage: {
      cacheRead: res.usage.cache_read_input_tokens,
      cacheWrite: res.usage.cache_creation_input_tokens,
      output: res.usage.output_tokens,
    },
  };
}

module.exports = { answer, MODEL, index, corpusText, instructions };
