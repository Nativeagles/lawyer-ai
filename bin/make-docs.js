'use strict';
// Generates the two review documents. Print-ready: Letter, generous margins,
// ruled space under every question so someone can answer on the page and hand
// it straight back.
const fs = require('fs');
const path = require('path');

// Set OWNER_NAME and OWNER_EMAIL in the environment; not hardcoded, because
// this repository is public and a name and address in it is an invitation.
const OWNER = process.env.OWNER_NAME || '[your name]';
const EMAIL = process.env.OWNER_EMAIL || '[your email]';
const DATE = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const CSS = `
@page { size: letter; margin: 0.8in 0.85in; }
* { box-sizing: border-box; }
body { font: 11.5pt/1.55 Georgia, 'Times New Roman', serif; color: #111; margin: 0; }
h1 { font-size: 19pt; margin: 0 0 .15in; line-height: 1.2; }
h2 { font-size: 12.5pt; margin: .3in 0 .1in; padding-bottom: .04in;
     border-bottom: 1.5px solid #111; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: .18in 0 .06in; page-break-after: avoid; }
p { margin: 0 0 .1in; }
.meta { font-size: 9.5pt; color: #444; margin-bottom: .28in;
        border-bottom: 1px solid #bbb; padding-bottom: .1in; }
.lead { font-size: 12pt; }
.box { border: 1px solid #999; padding: .12in .15in; margin: .14in 0;
       background: #fafafa; page-break-inside: avoid; }
.q { margin: .2in 0 0; page-break-inside: avoid; }
.q .num { font-weight: bold; }
.q .why { font-size: 9.5pt; color: #444; margin: .03in 0 .06in; font-style: italic; }
.rule { border-bottom: 1px solid #aaa; height: .28in; }
.rule.short { height: .26in; }
table { border-collapse: collapse; width: 100%; font-size: 10pt; margin: .1in 0; }
th, td { border: 1px solid #999; padding: .05in .07in; text-align: left; }
th { background: #eee; }
td.n { text-align: right; font-variant-numeric: tabular-nums; }
blockquote { margin: .06in 0; padding: .06in .1in; border-left: 3px solid #666;
             background: #f2f2f2; font-size: 10pt; font-style: italic; }
.cite { font-size: 9pt; color: #333; }
.tag { font-size: 8pt; text-transform: uppercase; letter-spacing: .04em;
       border: 1px solid #888; padding: 0 .04in; }
.pb { page-break-before: always; }
footer { margin-top: .3in; padding-top: .1in; border-top: 1px solid #bbb;
         font-size: 9pt; color: #444; }
ul { margin: .05in 0 .1in .2in; padding: 0; }
li { margin: .03in 0; }
`;

function q(n, text, why, lines = 3, short = false) {
  const rules = Array.from({ length: lines }, () => `<div class="rule${short ? ' short' : ''}"></div>`).join('');
  return `<div class="q"><p><span class="num">${n}.</span> ${text}</p>`
    + (why ? `<p class="why">${why}</p>` : '') + rules + `</div>`;
}

function page(title, subtitle, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>
<h1>${title}</h1>
<p class="meta"><strong>${subtitle}</strong><br>
From ${OWNER} &nbsp;·&nbsp; ${EMAIL} &nbsp;·&nbsp; ${DATE}<br>
Please write directly on this page. Partial answers are welcome — even one is useful.</p>
${bodyHtml}
<footer>Prepared ${DATE}. Please return marked up, or reply to ${EMAIL}.</footer>
</body></html>`;
}

// ── Document 1: the legal tool ───────────────────────────────────────────────
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'samples.json'), 'utf8'));

function sampleHtml(s, i) {
  const label = { FULL: 'Says it answers the question', PARTIAL: 'Says it answers part of the question', NONE: 'Declines to answer' }[s.coverage];
  let h = `<h3>Sample ${i + 1} — “${s.question}”</h3>`
    + `<p class="cite"><span class="tag">${label}</span>`
    + (s.claims.length ? ` &nbsp; ${s.claims.length} point${s.claims.length > 1 ? 's' : ''}, each quoting a source` : '') + `</p>`;
  if (s.limits) h += `<p><strong>It told the reader:</strong> ${s.limits}</p>`;
  for (const c of s.claims) {
    h += `<div class="box"><p>${c.text}</p><blockquote>“${c.quote}”</blockquote>`
      + `<p class="cite">${c.cite}`
      + (c.sourceType === 'guidance' ? ` &nbsp;<span class="tag">agency guidance, not statute</span>` : '') + `</p></div>`;
  }
  if (!s.claims.length) h += `<div class="box"><p>No points were given. The tool said this is outside wage-and-hour law and named the law that does cover it.</p></div>`;
  return h;
}

const legal = page(
  'Would you check whether this is accurate — and whether I can legally offer it?',
  'A free tool that answers wage-and-hour questions using only the text of the law',
  `
<p class="lead">I have built a tool that answers questions about pay, hours and leave. It does not
give opinions. It reads the actual regulations, and every statement it makes has to quote the words
it comes from — the quote is checked against the official source automatically, and anything that
does not match exactly is thrown away before the reader sees it.</p>

<p>It holds the federal wage and hour regulations (29 CFR parts 541, 778, 785, 531, 795 and 825, as
published 4 August 2026) and, for Texas, the Texas Workforce Commission's published guidance on the
Payday Law. It has no Texas statutes, because the Legislature's website does not make them
available in a form software can read. When a question falls outside what it holds, it refuses and
names the body of law that governs instead.</p>

<p><strong>Nobody with legal training has looked at any of it.</strong> That is what I am asking for.
I cannot pay for this, so please treat it as a favour and answer only what is quick.</p>

<h2>Three real answers, exactly as it produced them</h2>
${samples.map(sampleHtml).join('')}

<div class="pb"></div>
<h2>What I would most like to know</h2>

${q(1, 'Are the three answers above correct?', 'Mark anything wrong directly on them. A cross in the margin is enough.', 3)}
${q(2, 'Would any of them lead someone to do the wrong thing — miss a deadline, waive something, not file a claim?', 'This worries me more than being merely incomplete.', 3)}
${q(3, 'Sample 2 quotes the Texas Workforce Commission rather than the Texas Labor Code, because I cannot obtain the statute. It is labelled “agency guidance, not statute.” Is that acceptable, and is the label enough?', '', 3)}
${q(4, 'For Texas, the tool treats federal law as the full answer on overtime, exemptions, hours worked and tips, and treats pay frequency, final paychecks and deductions as governed by Texas law. Is that split right?', '', 3)}
${q(5, 'If I make this freely available to the public in Texas, is that the unauthorised practice of law?', 'The single question that decides whether this exists at all.', 4)}
${q(6, 'If it is a problem, what would have to change? Different wording, a different disclaimer, refusing certain kinds of question, or is there no version of this that works?', '', 4)}
${q(7, 'What kind of question would you least want it to attempt?', 'I can make it refuse whole categories. I would rather know which ones from you than guess.', 3)}
${q(8, 'Anything else that made you wince.', '', 3)}
`);

// ── Document 2: the stock service ────────────────────────────────────────────
const stock = page(
  'Would you look at whether I can offer this — and whether the numbers mean anything?',
  'A stock watchlist service that publishes daily lists to subscribers and to linked brokerage accounts',
  `
<p class="lead">I run a service that screens roughly 600 US stocks each day and publishes four
watchlists. Subscribers can link a brokerage account so the lists are pushed into it as watchlists.
It does not place trades. There are currently two subscribers and I do not charge yet.</p>

<h2>What the numbers actually say</h2>

<p>Every strategy is measured against simply buying and holding the same universe over the same
period. Two years, 19 August 2024 to 18 August 2026, 501 trading days, before costs and taxes.</p>

<table>
<tr><th>Strategy</th><th>Total return</th><th>Annualised</th><th>Worst drawdown</th><th>Sharpe</th><th>Trades</th><th>Win rate</th></tr>
<tr><td><strong>Buy &amp; hold (benchmark)</strong></td><td class="n"><strong>37.3%</strong></td><td class="n"><strong>17.3%</strong></td><td class="n"><strong>19.0%</strong></td><td class="n"><strong>1.04</strong></td><td class="n">—</td><td class="n">—</td></tr>
<tr><td>technical-indicators</td><td class="n">25.1%</td><td class="n">11.9%</td><td class="n">26.1%</td><td class="n">0.64</td><td class="n">1,859</td><td class="n">47.4%</td></tr>
<tr><td>trendline-break</td><td class="n">18.0%</td><td class="n">8.7%</td><td class="n">13.3%</td><td class="n">0.68</td><td class="n">635</td><td class="n">42.8%</td></tr>
<tr><td>ma200-reclaim</td><td class="n">16.7%</td><td class="n">8.1%</td><td class="n">21.6%</td><td class="n">0.49</td><td class="n">1,736</td><td class="n">32.7%</td></tr>
<tr><td>candlestick-patterns</td><td class="n">−0.3%</td><td class="n">−0.1%</td><td class="n">23.7%</td><td class="n">0.06</td><td class="n">2,707</td><td class="n">44.6%</td></tr>
<tr><td>technical-signals <em>(withheld)</em></td><td class="n">−9.6%</td><td class="n">−5.0%</td><td class="n">33.5%</td><td class="n">−0.18</td><td class="n">2,934</td><td class="n">38.4%</td></tr>
</table>

<p><strong>Not one of them beats buying and holding, on return or on risk-adjusted return.</strong>
The last one measured worse than entering at random, so I stopped publishing it while continuing to
record it. I have also pre-registered several forward tests — the variants, minimum sample sizes and
pass criteria were fixed in writing before any results came in, so I cannot stop them at a flattering
moment.</p>

<div class="box"><p>I would rather be told this is not worth continuing than find out slowly. I am
not looking for encouragement.</p></div>

<div class="pb"></div>
<h2>What I would most like to know</h2>

<h3>Whether I am allowed to do this</h3>
${q(1, 'If I charge a subscription for daily stock watchlists, does that make me an investment adviser needing registration with the SEC or the Texas State Securities Board?', 'The question that decides whether this can ever earn anything.', 4)}
${q(2, 'Does pushing those lists into a subscriber’s own brokerage account change the answer, compared with just emailing them a list?', 'It is a watchlist, not an order. But it lands inside their account.', 4)}
${q(3, 'Is there a publisher’s exemption that covers a service like this, and what would I have to do to stay inside it?', '', 4)}
${q(4, 'Does giving it away free rather than charging change any of the above?', '', 3)}

<h3>Whether the measurement is honest</h3>
${q(5, 'Is an equal-weight buy-and-hold of the same universe the right benchmark, or am I flattering or punishing myself with that choice?', '', 3)}
${q(6, 'Two years and 501 trading days with no bear market in the window. How much weight can these figures carry?', '', 3)}
${q(7, 'Given nothing beats the benchmark, is there an honest thing to sell here at all — or is the honest conclusion that there is not?', 'I would genuinely rather hear no.', 4)}
${q(8, 'Anything in the table that looks wrong, or that you would want measured differently.', '', 3)}
`);

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'review-legal-tool.html'), legal);
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'review-stock-service.html'), stock);
console.log('docs/review-legal-tool.html');
console.log('docs/review-stock-service.html');
