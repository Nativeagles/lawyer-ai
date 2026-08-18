'use strict';
// v2. Three changes from lib/answer.js, each answering a measured defect:
//
//  1. No retrieval. The whole corpus goes in the prompt, prompt-cached. At this
//     scale (~190k tokens) that costs about the same as top-20 retrieval and
//     takes recall from 95% to 100% by construction. Removes the largest
//     measured defect rather than tuning it.
//  2. Declining is made the easy path. Measured on 44 answers, the model never
//     once said the answering law was absent -- it answered every question from
//     whatever it was handed. The instruction below names that as the expected,
//     correct outcome rather than a failure.
//  3. Every claim still carries a verbatim quote, because that part works.
const MODEL = 'claude-opus-5';

// Per-model request shape. Haiku 4.5 predates adaptive thinking and rejects the
// effort parameter, so it needs the older explicit budget instead. Getting this
// wrong reads as "the cheap model failed" when in fact the request was invalid.
function tuning(model) {
  if (/haiku/.test(model)) {
    return { thinking: { type: 'enabled', budget_tokens: 4000 } }; // must be < max_tokens
  }
  return { thinking: { type: 'adaptive' }, effort: 'high' };
}

const SCHEMA = {
  type: 'object',
  properties: {
    // Three states, not two. A binary answerable flag scored 0/5 on questions
    // with a real federal component under a state-law overlay: having no way to
    // say "partly", the model said "fully" every time and dropped the caveat.
    // Partial coverage is the common case in real questions, not an edge case.
    coverage: { type: 'string', enum: ['FULL', 'PARTIAL', 'NONE'], description: 'FULL: these regulations decide the whole question. PARTIAL: they decide part of it, and some other body of law decides the rest or can override. NONE: they do not decide it at all.' },
    limits: { type: 'string', description: 'Required unless coverage is FULL. One plain sentence naming what these regulations cannot decide here and which body of law does. Empty string only when coverage is FULL.' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One legal claim in plain English, for a non-lawyer.' },
          cite: { type: 'string', description: 'The section, e.g. "29 CFR 541.100".' },
          quote: { type: 'string', description: 'At least 40 characters copied exactly from that section. Never paraphrase or stitch passages together.' },
        },
        required: ['text', 'cite', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['answerable', 'scope_note', 'claims'],
  additionalProperties: false,
};

const SYSTEM = `You answer questions about US federal wage, hour and leave law for people who are not lawyers.

Below is the complete text of every regulation available to you: 29 CFR parts 541, 778, 785, 531, 795 and 825. There is nothing else. You have no other source.

Two rules, and the second matters as much as the first.

RULE 1 — Quote or say nothing.
Every claim carries a verbatim quote from a section below, copied character for character. Never paraphrase into the quote field, never join two separate passages with an ellipsis, never reconstruct wording from memory. A claim you cannot quote must not be made.

RULE 2 — Say how much of the question you actually decided.
These regulations cover federal minimum wage, overtime, hours worked, tips and deductions, employee-or-contractor status, and FMLA leave. They cover nothing else. Not discrimination, wrongful termination, unemployment, workers' compensation, non-competes, privacy, paid sick leave, plant closings, pay frequency, final-paycheck timing, child labour, benefits eligibility, housing, family law, immigration — and not the law of any state.

Set coverage to one of three values, and be honest about which.

FULL — these regulations decide the whole question. Return claims, leave limits empty.

PARTIAL — they decide part of it. Return claims for the part they decide, and in limits name what they cannot decide and who does. **This is the most common case for a real question and the easiest one to get wrong.** Federal law here sets a floor, not a ceiling: a state may require more, and where it does, the state rule governs the person asking. If the answer could change once their state's law is considered, coverage is PARTIAL, however completely these regulations settle the federal half. Answering the federal half as though it settled everything is the specific failure to avoid — it produces a confident, perfectly cited answer that is wrong for the person reading it.

NONE — they do not decide it at all. Return no claims and name in limits the body of law that does.

The trap: these regulations will often contain something that *sounds* adjacent. Adjacent is not responsive. Before citing a section, ask whether it decides the question actually asked. Sharing vocabulary with the question is not deciding it.`;

function corpusBlock(corpus) {
  return corpus.sections
    .map((s) => `### ${s.citation} — ${s.heading}\n${s.text}`)
    .join('\n\n');
}

async function ask(question, { corpus, client, model = MODEL }) {
  const t = tuning(model);
  const res = await client.messages.create({
    model,
    max_tokens: 16000,
    system: [
      { type: 'text', text: SYSTEM },
      // Stable across every question, so it caches. The question goes in the
      // user turn, after the breakpoint, where it invalidates nothing.
      { type: 'text', text: corpusBlock(corpus), cache_control: { type: 'ephemeral', ttl: '1h' } },
    ],
    thinking: t.thinking,
    output_config: t.effort
      ? { effort: t.effort, format: { type: 'json_schema', schema: SCHEMA } }
      : { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: question }],
  });
  const block = res.content.find((b) => b.type === 'text');
  return {
    question,
    model,
    ...JSON.parse(block.text),
    usage: {
      cacheWrite: res.usage.cache_creation_input_tokens,
      cacheRead: res.usage.cache_read_input_tokens,
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
    },
  };
}

module.exports = { ask, SYSTEM, SCHEMA, MODEL, corpusBlock, tuning };
