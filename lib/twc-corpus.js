'use strict';
// Texas Workforce Commission guidance on the Texas Payday Law.
//
// This is NOT statute, and the distinction is load-bearing. The Texas Labor
// Code cannot be obtained (the Legislature serves it through a JavaScript app
// that returns no text), so the choice was between telling a Texan "I can't
// answer that" and telling them what the agency that administers the law
// publicly says. The second is more useful, provided nobody is misled about
// what it is: agency guidance, quotable and linkable, but a summary of the law
// rather than the law, and capable of being wrong or out of date in ways the
// statute is not.
//
// Everything from here is tagged sourceType 'guidance' so the model, the
// verifier and the page can all keep it distinct from 29 CFR.
const fs = require('fs');
const path = require('path');

const CORPUS_PATH = path.join(__dirname, '..', 'data', 'corpus-twc.json');
const URL = 'https://www.twc.texas.gov/programs/wage-and-hour/texas-payday-law';

// Headings whose content answers a worker's question. The appeals and
// withdrawal machinery is left out -- it is procedure for a claim already filed.
const KEEP = /payments subject|payday law facts|final wages|deductions|pay for meetings|paid breaks|premium pay|vacation pay|how to file a wage claim|information needed|why a claim could be denied|wage claim process/i;

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'");
}

function textOf(htmlFrag) {
  return decode(htmlFrag.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parse(html) {
  const m = /<main[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!m) throw new Error('TWC: no <main> region; page structure changed');
  const body = m[1];

  // Split on headings, keeping each heading with the prose that follows it.
  const parts = body.split(/(?=<h[2-4][^>]*>)/);
  const sections = [];
  for (const part of parts) {
    const h = /<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/.exec(part);
    if (!h) continue;
    const heading = textOf(h[2]);
    if (!heading || !KEEP.test(heading)) continue;
    const text = textOf(part.slice(h[0].length));
    if (text.length < 80) continue;
    sections.push({
      id: `TWC Payday Law — ${heading}`,
      citation: `TWC Payday Law — ${heading}`,
      heading,
      part: 'TWC',
      jurisdiction: 'TX',
      sourceType: 'guidance',
      url: `${URL}#${slug(heading)}`,
      text,
    });
  }
  return sections;
}

async function build() {
  const res = await fetch(URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) lawyer-ai-research/0.1', accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`TWC: HTTP ${res.status}`);
  const sections = parse(await res.text());
  if (!sections.length) throw new Error('TWC: parsed zero sections');
  const corpus = {
    source: 'Texas Workforce Commission',
    sourceType: 'guidance',
    jurisdiction: 'TX',
    name: 'Texas',
    url: URL,
    retrieved: new Date().toISOString().slice(0, 10),
    sections,
  };
  fs.writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2));
  return corpus;
}

function load() {
  if (!fs.existsSync(CORPUS_PATH)) return null;
  return JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
}

module.exports = { build, load, parse, CORPUS_PATH, URL };
