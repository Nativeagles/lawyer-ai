'use strict';
// Builds a citable corpus from eCFR — the official, dated, machine-readable
// source. Every section keeps its verbatim text, because the whole point of
// this probe is that a quote can be checked back against the real words.
const fs = require('fs');
const path = require('path');

const CORPUS_PATH = path.join(__dirname, '..', 'data', 'corpus.json');

// The parts that carry the operative detail for the two questions consumers
// actually ask: am I owed overtime, and can I take leave.
const PARTS = [
  { title: 29, part: '541', label: 'FLSA white-collar exemptions' },
  { title: 29, part: '778', label: 'FLSA overtime computation' },
  { title: 29, part: '785', label: 'hours worked' },
  { title: 29, part: '531', label: 'wage payments and tip credit' },
  { title: 29, part: '795', label: 'employee or independent contractor' },
  { title: 29, part: '825', label: 'FMLA' },
];

function decode(s) {
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decode(s.replace(/<[^>]*>/g, ''));
}

// Collapse whitespace but keep the words exactly. Verbatim means verbatim.
function normalise(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function parsePart(xml, meta, asOf) {
  const sections = [];
  const re = /<DIV8\b([^>]*)>([\s\S]*?)<\/DIV8>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[2];
    const nMatch = /\bN="([^"]+)"/.exec(attrs);
    if (!nMatch) continue;
    const number = nMatch[1];
    const headMatch = /<HEAD>([\s\S]*?)<\/HEAD>/.exec(body);
    const heading = headMatch ? normalise(stripTags(headMatch[1])) : '';
    const paras = [];
    const pRe = /<P\b[^>]*>([\s\S]*?)<\/P>/g;
    let p;
    while ((p = pRe.exec(body))) {
      const t = normalise(stripTags(p[1]));
      if (t) paras.push(t);
    }
    if (!paras.length) continue;
    const citation = `${meta.title} CFR ${number}`;
    sections.push({
      id: citation,
      citation,
      heading: heading.replace(/^§\s*/, ''),
      part: meta.part,
      label: meta.label,
      url: `https://www.ecfr.gov/current/title-${meta.title}/part-${meta.part}/section-${number}`,
      asOf,
      text: paras.join('\n'),
    });
  }
  return sections;
}

async function fetchPart(meta, asOf) {
  const url = `https://www.ecfr.gov/api/versioner/v1/full/${asOf}/title-${meta.title}.xml?part=${meta.part}`;
  const res = await fetch(url, { headers: { 'user-agent': 'lawyer-ai-probe/0.1 (citation-integrity research)' } });
  if (!res.ok) throw new Error(`eCFR ${meta.title} CFR ${meta.part}: HTTP ${res.status}`);
  return parsePart(await res.text(), meta, asOf);
}

// A corpus is only as current as the date it was built for. Pinning this to a
// fixed past date is how the first run of this probe ended up quoting salary
// figures that a court had vacated 18 months earlier -- see notes in README.
// Not today's date -- eCFR only serves dates it has published an issue for, and
// 404s on the rest. Ask it which date it actually has.
async function latestIssueDate(title = 29) {
  const res = await fetch('https://www.ecfr.gov/api/versioner/v1/titles.json', {
    headers: { 'user-agent': 'lawyer-ai-probe/0.1 (citation-integrity research)' },
  });
  if (!res.ok) throw new Error(`eCFR titles: HTTP ${res.status}`);
  const t = (await res.json()).titles.find((x) => x.number === title);
  if (!t || !t.latest_issue_date) throw new Error(`no issue date for title ${title}`);
  return t.latest_issue_date;
}

async function build(asOf) {
  const all = [];
  for (const meta of PARTS) {
    const secs = await fetchPart(meta, asOf);
    process.stdout.write(`  ${meta.title} CFR ${meta.part} (${meta.label}): ${secs.length} sections\n`);
    all.push(...secs);
  }
  const corpus = { source: 'eCFR', asOf, builtFrom: PARTS, sections: all };
  fs.writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2));
  return corpus;
}

function load() {
  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error('No corpus. Run: npm run corpus');
  }
  return JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
}

module.exports = { build, load, normalise, latestIssueDate, PARTS, CORPUS_PATH };
