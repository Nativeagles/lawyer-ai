# lawyer-ai probe

Does a retrieval-first legal answerer emit only citations that can be checked?

Built 2026-08-18 to put a floor under the legal-AI app idea before building
anything real. Ten genuine consumer questions about US federal employment law
(FLSA overtime, FMLA leave), answered twice, both runs verified mechanically
against the actual regulations.

    npm run corpus    # rebuild from eCFR (247 sections, official, dated)
    npm run probe     # verify both arms, print the numbers

## The number

Live, `claude-opus-5`, adaptive thinking at high effort, 2026-08-18:

| arm | claims | verified | fabricated quotes |
| --- | ---: | ---: | ---: |
| closed-book (answer from memory) | 64 | **58%** | 27 |
| retrieval-gated (quote or drop) | 86 | **99%** | 1 |

**Zero fabricated citations in either arm.** Every section number the model
produced was a real section. What it got wrong was the words it put inside them
-- 42% of closed-book quotes are not present in the section cited. One was a
single word: it quoted 29 CFR 825.207 as "Generally, FMLA leave is unpaid" where
the text reads "Generally, FMLA leave is unpaid leave."

That is the failure mode worth naming, because it defeats the obvious defence.
A reader who spot-checks the citation lands on a real, on-topic regulation and
concludes the answer is sound. The citation layer is reliable; the quotation
layer is not; and only the second one is load-bearing.

The one dropped claim in the retrieval arm was not a hallucination -- the model
stitched two real, non-contiguous passages of 29 CFR 825.120 together with an
ellipsis. Ordinary quoting practice, correctly refused: a stitched quote is not
verbatim, so the verifier cannot confirm it and drops it.

(An earlier count of this run reported 7 fabricated citations. That was a bug in
`citeKey` -- it could not parse subsection-level cites like `29 CFR 825.104(a)`,
which are more precise, not wrong. Fixed; the real figure is zero.)

## The finding I was not looking for

**Verbatim-correct and legally wrong are not mutually exclusive.**

Question 5 asks the minimum salary for the executive exemption. The corpus says
$1,128 per week from 1 January 2025, and that quote verifies perfectly against
the official source. The figure that is actually enforced is $684, because the
2024 rule that set $1,128 was vacated nationwide in November 2024. eCFR carries
the codified text; it does not carry litigation status.

So citation integrity is necessary and **not sufficient**. A system can quote the
official government source word for word and still tell someone the wrong number.
The missing layer is currency -- is this provision in force? -- which is what
Shepardising does for cases, and it is the part that is not free. Any real
version of this needs a validity check, and that check is the actual moat the
incumbents hold.

## Retrieval failed once, and the gate held

Question 5 asks the minimum salary for the executive exemption. BM25 ranked
29 CFR 541.600 -- "Amount of salary required", the section that answers it --
**seventh**, past the k=4 cutoff, behind "Board, lodging or other facilities".

The model's response to being handed the wrong sections is the encouraging part:
it said the figure lives in 541.600 and that 541.600 was not among the sections
provided. It did not reach into memory for a number. That is the gate doing
exactly what it is for -- an honest gap instead of a confident fabrication.

Then it answered the adjacent question it *could* support, quoting the highly
compensated employee thresholds from 29 CFR 541.601 word for word: $132,964 from
July 2024, $151,164 from January 2025. Both quotes verify. Both figures come
from the vacated 2024 rule. The enforced HCE threshold is $107,432.

So the live run reproduced the currency problem on its own, by a different route
than the hand-authored run did, and did it while scoring 99% on citation
integrity. Two separate defects, and the verifier only catches one of them.

## Currency: what free data can and cannot tell you

The verifier proves a quote is really in the source. It cannot tell you the
source is still good law. `lib/currency.js` attacks the second defect.

Two links are needed. Measured 2026-08-18:

| link | source | result |
| --- | --- | --- |
| CFR part -> rules that amended it | Federal Register API | **precise, free** |
| rule -> the litigation challenging it | CourtListener | **not achievable** |

The second one is the finding. A rule's own Federal Register citation appears
nowhere in CourtListener's free searchable text -- `"89 FR 32842"` and
`"89 Fed. Reg. 32,842"` both return zero results, in opinions and in RECAP
dockets alike. A rule cannot be joined to its own case by citation. The case
exists and is findable (State of Texas v. U.S. Dept of Labor, 4:24-cv-00499,
E.D. Tex.) -- but only if you already know to look for it.

Falling back to a keyword screen (agency + subject + filed after the rule)
fails badly. Run across three parts it flagged all three; on the two control
parts, **0 of 9 cases returned were on topic** -- CNN v. Perplexity, NYT v.
Microsoft, Uber v. New York City. It is reported but never sets the flag,
because a screen that marks every provision as contested marks none.

What does work is precise and late: when an agency publishes a rule
*implementing* a court judgment, the title says so, and that is detectable
exactly. It caught 29 CFR 541 with no false positives on the controls.

    29 CFR 541   OVERTURNED-AND-CORRECTED   91 FR 27833 (2026-05-15)
    29 CFR 825   NO-RELIABLE-SIGNAL
    29 CFR 778   NO-RELIABLE-SIGNAL

But note the dates. The rule was vacated **15 Nov 2024**. The agency published
the correction **15 May 2026**. This detector fires on the second date. It
closes the window; it cannot see inside it. For eighteen months the official
corpus said $1,128, the enforced figure was $684, and no free signal
distinguished them.

### Corpus freshness is itself a currency mechanism

Rebuilding the corpus at eCFR's latest issue and re-verifying every previously
generated answer, unchanged:

| arm | verified vs 2026-01-01 corpus | verified vs current corpus |
| --- | ---: | ---: |
| retrieval, hand-authored | 100% | 86% |
| retrieval, live model | 99% | 97% |

**Every claim that dropped was a vacated-rule claim.** Mine quoting $1,128 from
541.600; the model's quoting the $132,964 / $151,164 highly-compensated
thresholds from 541.601. Nothing else moved. The text those quotes relied on no
longer exists, so the quotes stop verifying -- automatically, with no legal
knowledge encoded anywhere.

That is a genuine and unplanned mitigation: **keep the corpus current and stale
claims self-destruct.** Any cached answer, any previously rendered page, any
stored citation reverts to unverifiable the moment the agency corrects the text.
It is worth more than it sounds, because it needs no Shepardising -- only a
rebuild.

It does not close the window. Inside those 18 months eCFR still carried $1,128,
so a perfectly current corpus would have verified it happily.

### How exposed is a real consumer question set?

Six consumer-facing parts (541, 778, 785, 531, 795, 825; 332 sections), 22
everyday questions about pay, hours, classification and leave. `npm run exposure`.

    2 of 12 employment parts swept carry a court-judgment correction   (17%)
    5 of 22 questions retrieve their TOP section from one              (23%)
    9 of 22 touch one anywhere in the top 4                            (41%)

**Contested provisions are over-represented in consumer questions, not
under-represented.** The two that flagged are the white-collar overtime
exemptions and the tip credit -- which is to say, "am I owed overtime" and "can
my manager take my tips", two of the highest-volume questions a working person
actually has. Rules get litigated precisely because they affect many people and
cost employers money, so the contested set and the popular set are the same set.
There is no routing around it by picking safer topics.

Read that 23% correctly: it is **risk exposure, not an error rate**. Both
corrections are published and the corpus is current, so today the answers are
right. It measures how often a consumer question sits on ground that has moved
before and can move again -- and during which the system would have been
confidently, verifiably wrong.

### The blind window is not one number

    29 CFR 531  tip credit     court 2024-10-29 -> corrected 2024-12-17     49 days
    29 CFR 541  overtime       court 2024-11-15 -> corrected 2026-05-15  ~18 months

Two orders of magnitude apart. Any product claim about freshness has to survive
the eighteen-month case, not the seven-week one.

### Building the detector taught more than running it

Two failures worth keeping, because both were silent:

**Recall.** Matching rule *titles* missed 29 CFR 531 entirely -- its title is
"Restoration of Regulatory Language", which contains nothing court-shaped, while
its abstract opens "a federal appeals court issued an order vacating regulatory
text". Agencies describe losing in euphemism. Read abstracts.

**Precision.** Loosening the pattern to catch that then flagged 29 CFR 795,
whose abstract says only that the rule is "more consistent with judicial
precedent" -- citing case law, not obeying it. The word `judicial` had to go.

Final: 7 of 7 on the parts whose status I could check by hand, 2 true positives,
0 false positives. Small set, my own labels -- a sanity check, not a validation.

**That remaining gap is the moat.** It is precisely what Shepardising sells, it is the
reason the incumbents can charge, and it is not closed by a better model or a
stricter verifier.

## Retrieval was the real bottleneck all along

`npm run eval` scores retrieval against a hand-built answer key
(`questions/answer-key.json`, grounded in actual corpus headings, deliberately
generous -- every section that fairly answers a question is accepted).

    precision@1   8/22   36%
    recall@4     12/22   55%
    recall@20    21/22   95%
    recall@50    22/22  100%

So the answering section is reachable essentially always, and ranked first about
a third of the time. **That is a ranking failure, not a matching failure**, and
it is much larger than the currency risk: at k=4, *ten of twenty-two questions
never put the answering section in front of the model at all*. No model can
answer those, and the verifier cannot save them -- it will happily confirm a
perfectly accurate quote from a section that does not address the question.

Tuning BM25 does not fix it. Sweeping heading weight (1x-16x) against length
normalisation (b = 0, 0.3, 0.75), precision@1 never left 32-36%:

    headingWeight  b     P@1    R@4    R@10   MRR
    2              0.75    36%     55%     77%   0.461
    8              0.75    36%     59%     77%   0.470
    16             0.75    36%     59%     82%   0.488
    16             0.3     32%     55%     86%   0.449

The gap between "can my manager take a share of my tips" and regulatory prose is
not a term-weighting problem. Raising k is what works, and since the model may
only quote what it is handed, extra candidates cost tokens and cannot cost
correctness. k is now 20 (55% -> 95% recall, ~$0.08/question of input).

### Confirmed end to end: retrieval quality *is* answer quality

Same 22 consumer questions, same model, same prompt. The only change is how many
candidate sections the model is handed. `npm run answer-eval`.

    run    Qs  claims  verified  on-target  grounded Qs  silent Qs
    k=4    22     171       99%        51%        12/22          0
    k=20   22     256       98%        57%        21/22          0

*grounded* = the answer contains at least one verified claim citing a section
the answer key accepts. It goes **55% -> 95%**, tracking recall@4 -> recall@20
exactly. Retrieval quality converts into answer quality almost one for one, and
one line of configuration bought the whole gain.

Two things that do not move are more interesting than the one that does.

**Verification stays ~99% in both arms while grounding nearly doubles.** The
verifier cannot see the difference between the good run and the bad one. At k=4
it certified 171 claims as accurately quoted while fewer than half rested on a
section that answers the question. A quote checker measures honesty about
sources, not relevance of sources, and those come apart completely.

**Silent questions: zero, in both arms.** Handed the wrong sections on ten of
twenty-two questions, the model answered all twenty-two anyway -- fluently,
with verbatim-verified citations, from whatever it was given. It never said "the
law that answers this is not in what you sent me." It is capable of that (it did
exactly that on the earlier employment set when the salary section was missing),
but it is clearly not the default.

So the gate stops fabricated *quotes*, and does nothing about confidently
sourced irrelevance. Grounding has to be checked separately, and something has
to make declining the easy path -- otherwise the 5% of questions that survive
good retrieval get answered with the same confidence as the 95%.

## v2: no retrieval, and declining made easy

`lib/answer2.js`, `npm run v2`. Three changes, each answering a measured defect:
the whole corpus goes in the prompt (prompt-cached) so retrieval is deleted
rather than tuned; the system prompt names declining as a correct outcome rather
than a failure; quotes stay mandatory, because that part worked.

Scored on 22 questions the corpus answers plus 8 it cannot (`npm run v2-eval`):

    IN SCOPE   (22)   verified 98%   GROUNDED 22/22 = 100%   wrongly declined 0
    OUT OF SCOPE (8)  correctly DECLINED 8/8 = 100%          answered anyway 0

Grounding across the three architectures, same questions, same model:

    k=4 retrieval    55%
    k=20 retrieval   95%
    no retrieval    100%

And the failure the earlier runs could not even express -- an out-of-scope
question answered fluently from adjacent law -- went to zero. The declines route
correctly rather than shrugging: eviction to state landlord-tenant law, race
discrimination to Title VII, paid sick leave to state and local statutes.

**Cost, measured rather than estimated -- and my earlier estimate was wrong.**

    cache write   233,511 tokens        actual total   $5.88 / 30 questions
    cache read  6,771,819 tokens        per question   $0.196
    output         41,405 tokens

I had estimated $0.095/question by dividing characters by four. The corpus
tokenizes to 233k, not 190k, so the real figure is about **2.3x top-20
retrieval, not cost-neutral**. That changes the trade but not the conclusion:
twenty cents a question buys 100% grounding and 100% correct declines, and for a
subscription product that is not the binding constraint.

The narrowness argument survives and gets sharper. 233k tokens is federal wage,
hour and leave law and nothing else. Add state law, or case law, or the rest of
Title 29, and the window is gone along with this whole design.

## The near-miss test, which broke it

12 questions where declining and answering are both partly defensible: a real
federal component this corpus covers, under a state-law overlay it does not.
`SET=near-miss npm run v2` then `npm run near-miss-eval`.

**With the original binary answerable flag: 6/12, and 0/5 on partials.** Having
no way to say "partly", it said "fully" every time. The dangerous one: *salaried
manager in California on $70,000* -- answered complete, 8 verified claims, no
mention of state law. Federal says exempt; California's threshold is far higher.
A confident, perfectly cited answer that is wrong for the person asking. And
*paid every two weeks* -- pure state law -- drew four claims, walking straight
into the "adjacent is not responsive" trap the prompt explicitly warned against.

The cause was structural. A binary flag cannot express "I answered the federal
half and state law may override it", so the schema became three-state --
FULL / PARTIAL / NONE, with a required `limits` sentence unless FULL.

**After: 7/12, and 5/5 on partials.** The target defect is fixed. But FULL went
3/3 to 0/3, and that is where it gets interesting.

### The answer key was wrong, not the model

The three "failed" FULL questions came back PARTIAL with these limits:

    tips pooled       "...cannot decide whether your state's wage law bans tip
                       pooling with [back of house]"
    coffee break      "...do not decide wh[ether breaks must be given at all]"
    Saturday training "...cannot decide [what your state requires]"

All three are correct. Federal wage law is a **floor**; states routinely require
more. California does restrict tip pooling. Federal law mandates no rest breaks
whatsoever -- several states do. Those questions sit squarely in the corpus,
which is not the same as being *settled* by it, and that is the distinction the
key got wrong. Same for hours-cut-to-lose-benefits, where the model noted these
rules decide it only when the cut interferes with FMLA rights -- a sharper read
than the flat DECLINE the key expected.

On inspection the model beats the key on four of five mismatches. **The weakest
component in this evaluation is the part written by hand**, which is worth
stating plainly given every score in this README rests on one.

### What that implies for the product

If PARTIAL is the correct answer to almost everything, a three-state flag
carries almost no information, and "check your state" appended to every answer
is noise a reader learns to skip.

So jurisdiction is not a caveat to append. **It is an input to collect before
answering.** That also reshapes the corpus question: federal is 233k tokens and
one state's wage code on top still fits the window comfortably; fifty states do
not. The argument for narrowness arrives a third time, now with a specific
shape -- one body of federal law plus one state, chosen per user.

## v3: jurisdiction as an input

`lib/answer3.js`, `npm run corpus:ca` then `npm run v3` / `npm run v3-eval`.

The near-miss result said PARTIAL is correct for almost any US employment
question when only federal law is loaded, so the state stops being a caveat and
becomes an input. 37 sections of the California Labor Code -- the ones that
actually diverge: daily overtime and double time (510), the exempt salary floor
at twice state minimum wage (515), a flat bar on employers taking gratuities
(351), meal periods (512) and break premiums (226.7), semi-monthly pay (204),
waiting-time penalties (201-203), employer-paid expenses (2802), and the ABC
test (2775). ~24k tokens on top of the federal 233k; still comfortably inside
the window.

Same 12 near-miss questions, now asked for a California worker:

    coverage matched expectation   9/12   75%   (was 58% federal-only)
    claims verified               100%          (79/79)
    citations                      25 federal, 54 California

The California manager on $70,000 flipped exactly as the state threshold
predicts: FULL, governing STATE, 9 claims. *Paid every two weeks* and *final
paycheck* went from questions federal law could only decline to questions state
law answers outright. Child labour stayed correctly NONE.

**All three mismatches were the answer key, not the model** -- again. On
twelve-hour shifts it distinguished the pay consequences it can decide from the
discipline question it cannot; on tip pooling it noticed that section 351 bars
the employer taking tips without settling whether back-of-house may share, which
is case law and DLSE territory; and on the coffee break the key had quietly
answered a different question (entitlement to a break) than the user asked
(payment for one). On inspection it is 12 of 12.

**That is a weak result and it should be read as one.** The key is hand-written,
the model disagreed with it, and the same person who wrote the key then ruled in
the model's favour three times running. Every score in this README rests on
labels of that kind. An independent labeller is the missing piece, not a
larger question set.

**One real bug, found by the scorer rather than reasoned about:** the child
labour question returned `coverage: NONE` with `governing: STATE`. If no
provision decides a question, nothing governs it -- those two fields can
contradict each other and nothing currently stops them.

**Cost is now the constraint.** $0.328/question, up from $0.196 federal-only and
$0.084 for top-20 retrieval. At a $20/month subscription that is roughly 60
questions before gross margin disappears, which is a product decision -- cheaper
model for routing, cheaper tier for simple questions, or a lower effort setting
-- and not something better prompting fixes.

## The independent labeller, which invalidated some of my own numbers

Every score above compares model output to labels I wrote. Three times the model
disagreed with those labels, I inspected, and I ruled for the model. The author
of a key is not a disinterested judge of it, so `lib/label.js` asks something
else: a different model (Sonnet 5), three votes per question, blind to both the
key and the answering model's output.

Run twice -- once seeing only a manifest of citations and subjects, once seeing
the same full text the answering model had.

    where KEY and MODEL disagreed, BLIND sided with:
      manifest only    KEY 3, MODEL 0
      full text        KEY 1, MODEL 2

So the manifest version was handicapped, not merely cautious: you cannot tell
whether a section settles a question without reading it, and that biases toward
PARTIAL. Worth knowing before trusting any cheap scope check.

**The agreement matrix is the actual result:**

    KEY   vs MODEL   9/12   75%
    KEY   vs BLIND   6/12   50%
    MODEL vs BLIND   7/12   58%
    all three agree  5/12   42%

    blind labeller unanimous with ITSELF   6/12

Nobody agrees with anybody, and the labeller contradicts itself on half the
questions -- three identical calls, different answers. **The FULL/PARTIAL/NONE
judgment is not a fact to be measured against.** It is a judgment call on which
competent judges, including one judge run three times, split about evenly.

Which means my earlier "12 of 12 on inspection" was neither vindicated nor
refuted; there is no ground truth at that resolution to be right about. And it
means every coverage-based score in this README -- the 58%, the 75%, the 12/12
-- measures agreement with one opinion and was reported as though it measured
correctness. That is a mistake in this document, not just an open question.

**What survives is everything checkable against text**: claims verified
(100%, 79/79), grounding against a section-level key, recall@k, the currency
detector's 7/7. Those are facts about whether words appear in a source.

**So: coverage is a good product feature and a bad metric.** Telling a reader
"your state decides this" is worth having. Scoring the system on whether it said
FULL or PARTIAL is scoring noise.

## Which model, measured only on what is checkable

Same corpus, same 30 questions, same prompt; only the model changes.
`MODEL=claude-sonnet-5 npm run v2` then `npm run model-compare`.

    model         claims  verified  grounded  declined  $/question  vs opus
    opus-5           183       98%     22/22       8/8      $0.196       —
    sonnet-5          94       98%     22/22       8/8      $0.111     56%
    haiku-4.5         63       76%     20/22       8/8      $0.028     14%

Coverage/PARTIAL judgments are deliberately not scored here -- the labeller run
showed those labels do not hold still, so scoring against them measures noise.
These three measure whether a quote is really in the cited provision, whether
the deciding provision was cited, and whether the model refused where the law is
genuinely absent.

**Sonnet 5 is a drop-in replacement.** Identical on every checkable metric at
56% of the cost, and lower still on introductory pricing through 2026-08-31. On
this evidence there is no reason to run Opus for this task.

**Haiku fails on the one thing that matters** -- 24% of its quotes are not in
the provision it cites. Not a licence issue or a context issue: the corpus
tokenizes to 169k for Haiku (older tokenizer) against 233k for the other two, so
it fits its 200k window with room to spare. It simply fabricates quotes.

### But notice how it fails

Every one of those bad quotes is caught and dropped. A user of the Haiku
configuration is never shown a fabricated quote -- they are shown **fewer
claims** (63 against Sonnet's 94 and Opus's 183). With a hard verifier in front
of it, a weaker model degrades in *completeness* rather than in *correctness*.

That is the strongest architectural argument in this whole project. The
verifier is not merely a quality check on a good model; it is what makes a
cheaper model safe to use, converting a truthfulness problem into a coverage
problem. Coverage is a problem you can see, price, and route around. Truthfulness
is not.

**A third instance of the same bug, worth recording as a pattern.** Haiku's five
"fabricated citations" were all my parser failing on `(a)(1)-(2)`, `(a), (b)`,
`(b)-(c)` and compound cites -- every one a *more* precise citation than a bare
section. The parser is now anchored on the section number and ignores whatever
follows, rather than trying to enumerate legal suffixes, which is what it should
have done the first time. Fixing it did not change any headline: those claims
reclassified from bad-citation to bad-quote, because the words were wrong too.

## The app

    npm start        # http://localhost:3100

Everything measured above, assembled into something a person can use: pick where
you work, ask a question, get points that each carry the exact words of the law
and a link to the official source. `server.js`, `public/index.html`,
`lib/app-answer.js`, `lib/jurisdictions.js`.

- **Sonnet 5**, because it matched Opus on every checkable metric at 56% of cost.
- **No retrieval** — the whole corpus goes in, prompt-cached.
- **Verified server-side.** Unverified claims are dropped before the response is
  written, and the reader is told how many were dropped. A fabricated quote
  cannot reach the page.
- **Jurisdiction is a field, not a caveat.**
- **Spend caps** in code (200/day, 20/hour per visitor), because each question
  costs real money and a loop would empty the account.
- Questions are answered and forgotten. Nothing is written down.

### Texas, and states we do not hold

A state is either a corpus or a **declared gap**. California is a corpus.
Texas is a gap, because its statutes cannot be obtained: the Legislature serves
them through a JavaScript app that returns no text to a fetch, Justia refuses
automated requests, public.law exposes no section pages, and the Administrative
Code search returns nothing. Every route was tried.

That matters less in Texas than almost anywhere, and the tool says why. Texas
adds no daily overtime, no mandated breaks and no salary threshold above the
federal one, so for most questions federal law is the whole answer. What Texas
*does* govern is enumerated to the model and to the reader: the Payday Law
(ch. 61) and the Minimum Wage Act (ch. 62).

### Filling the Texas gap with agency guidance

`npm run corpus:twc`. The Labor Code text is unobtainable, but the **Texas
Workforce Commission** — the agency that administers the Payday Law — publishes
its own guidance, and that page is open. 12 sections, ~2.2k tokens, tagged
`sourceType: guidance` end to end: the model is told it is a summary written by
the agency rather than the words of the statute, the verifier indexes it
separately, and the page marks every point drawn from it.

This is a real distinction, not a disclaimer. Agency guidance is authoritative
about the agency's own practice and can still be wrong or dated about the law.
Presenting it as statute would be the same error as quoting a vacated rule.

The two questions that previously got an honest refusal now get answers:

    "how long for my final paycheck?"   PARTIAL / STATE   3 points, all guidance
      -> next regular payday after quitting (six days if fired), plus the
         180-day deadline to file a wage claim

    "can my boss pay me once a month?"  PARTIAL / STATE   2 guidance + 1 statute
      -> exempt employees monthly, everyone else twice monthly (TWC), and
         whether you are exempt is a federal question (29 CFR 541.100)

The second is the one worth looking at: it chains a state agency rule to the
federal test the rule depends on, and labels each half by what kind of source it
came from. Neither corpus answers that question alone.

Tested live against the running server:

    "salary means no overtime, right?"       FULL / FEDERAL  5 points, 0 dropped
    "how long for my final paycheck?"        PARTIAL / STATE -> TWC guidance
    "can my boss pay me once a month?"       PARTIAL / STATE -> TWC + 29 CFR
    "fired after telling him I was pregnant" NONE / NEITHER  -> Title VII / PDA
    (California) "I worked a 13 hour shift"  PARTIAL / STATE -> Cal. Lab. Code 510

The second and third are the point. A tool that answered those from federal law
would be confidently wrong; one that shrugged would be useless. Naming the
statute and the agency is neither.

### What is still unproven

- The near-miss set is 12 questions and its labels are not merely imperfect but
  unstable -- see the agreement matrix above. A larger set of the same kind of
  label would buy precision on a quantity that does not hold still.
- Nothing here tests a state corpus, which the finding above says is required.
- 64% of verified claims are on-target, so a third still cite adjacent sections.
  Every question gets the right law, plus surrounding context the reader did not
  ask for.
- One domain, federal only, 30 questions, one model, one run.

## Shape

- `lib/corpus.js`   eCFR -> 247 sections, verbatim text, official URL, as-of date
- `lib/retrieve.js` BM25. Deliberately boring, so a bad answer can be traced to
                    retrieval missing it rather than the model ignoring it
- `lib/verify.js`   the part that matters. A claim is {text, cite, quote}; the
                    quote must appear in the cited section word for word, or the
                    claim is dropped. Needs no model, so it is testable alone
- `lib/answer.js`   pluggable. Uses ANTHROPIC_API_KEY if present (claude-opus-5,
                    adaptive thinking, structured outputs). Absent a key, the
                    probe verifies pre-authored answers from `data/`

## Why federal employment law, not tenancy

Tenancy was the first choice -- highest consumer volume. Texas has locked its
statutes behind a JavaScript app and Justia blocks scrapers, so state statutes
turned out to be the ragged edge as predicted. Federal employment law is the
same narrow-statutory-consumer shape with an official machine-readable corpus,
and it is the exact domain where a purpose-built tool scored 83% against
Westlaw's 58% and Lexis's 64% in Stanford's LaborBench study.

## Not done

- Currency: the detector only fires once the agency concedes. Nothing free
  covers the window between the ruling and the correction -- 18 months here
- Retrieval is the weak link now, not quotation: BM25 missed the one section
  that answered Q5. Verified-but-incomplete is the next failure to attack
- One domain, federal only
