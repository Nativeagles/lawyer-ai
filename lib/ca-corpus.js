'use strict';
// California Labor Code, from the Legislature's own site.
//
// Chosen because California diverges from federal law on nearly every question
// this project has touched: daily overtime and double time (510), a much higher
// exemption salary floor (515), a flat ban on employers sharing in tips (351),
// mandatory meal and rest periods (512, 226.7), semi-monthly pay (204),
// waiting-time penalties on final pay (201-203), employer-paid expenses (2802),
// and the ABC test for contractor status (2775). Federal law is a floor; this
// is where the floor stops being the answer.
const fs = require('fs');
const path = require('path');

const CORPUS_PATH = path.join(__dirname, '..', 'data', 'corpus-ca.json');
const BASE = 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml';

const SECTIONS = {
  'payment of wages': ['200', '201', '202', '203', '204', '206', '221', '223', '224', '226', '226.7'],
  'gratuities': ['350', '351', '353', '356'],
  'working hours and overtime': ['500', '510', '511', '512', '513', '514', '515', '516', '551', '552', '554'],
  'minimum wage': ['1182.12', '1194', '1194.2', '1197', '1197.1', '1198'],
  'expenses': ['2802'],
  'employee or independent contractor': ['2775', '2776', '2778', '2781'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extract(html, num) {
  const i = html.indexOf('id="codeLawSectionNoHead"');
  if (i < 0) return null;
  let seg = html.slice(i, i + 120000);
  // The statute begins at its own number and runs to the enacting history note.
  seg = seg.replace(/<[^>]+>/g, ' ');
  seg = seg
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  seg = seg.replace(/\s+/g, ' ').trim();
  const start = seg.indexOf(`${num}.`);
  if (start < 0) return null;
  let body = seg.slice(start);
  // Drop the trailing legislative history, which is not operative text.
  const cut = body.search(/\(\s*Amended by Stats|\(\s*Added by Stats|\(\s*Repealed|\(\s*Enacted by/);
  if (cut > 80) body = body.slice(0, cut);
  return body.trim();
}

async function fetchSection(num) {
  const url = `${BASE}?lawCode=LAB&sectionNum=${encodeURIComponent(num)}`;
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) lawyer-ai-research/0.1', accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`LAB ${num}: HTTP ${res.status}`);
  const text = extract(await res.text(), num);
  if (!text || text.length < 60) throw new Error(`LAB ${num}: no usable text`);
  return {
    id: `Cal. Lab. Code § ${num}`,
    citation: `Cal. Lab. Code § ${num}`,
    heading: '',
    part: 'LAB',
    jurisdiction: 'CA',
    url: `${BASE}?lawCode=LAB&sectionNum=${num}`,
    text,
  };
}

// Some sections -- 226.7 is the one found here -- return an empty result from
// the per-section URL while appearing normally in their chapter listing. Rather
// than lose them, fall back to the chapter and cut the section out of it.
const FALLBACK_CHAPTERS = [
  'https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=LAB&division=2.&title=&part=1.&chapter=1.&article=1.',
];
const chapterCache = new Map();

async function chapterText(url) {
  if (chapterCache.has(url)) return chapterCache.get(url);
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) lawyer-ai-research/0.1' } });
  if (!res.ok) throw new Error(`chapter: HTTP ${res.status}`);
  let t = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
  chapterCache.set(url, t);
  return t;
}

async function fromChapter(num) {
  for (const url of FALLBACK_CHAPTERS) {
    const t = await chapterText(url);
    const start = t.indexOf(`${num}. (`);
    if (start < 0) continue;
    let end = t.search(new RegExp(`\\(\\s*(?:Amended|Added|Repealed)[^)]{0,160}\\)`, 'g'));
    const after = t.slice(start);
    const m = /\(\s*(?:Amended|Added|Repealed)[^)]{0,200}\)/.exec(after);
    const body = (m ? after.slice(0, m.index) : after.slice(0, 6000)).trim();
    if (body.length > 60) {
      return {
        id: `Cal. Lab. Code § ${num}`,
        citation: `Cal. Lab. Code § ${num}`,
        heading: '',
        part: 'LAB',
        jurisdiction: 'CA',
        url: `${BASE}?lawCode=LAB&sectionNum=${num}`,
        text: body,
      };
    }
  }
  return null;
}

async function build() {
  const sections = [];
  for (const [label, nums] of Object.entries(SECTIONS)) {
    process.stdout.write(`  ${label}: `);
    for (const n of nums) {
      try {
        const s = await fetchSection(n);
        s.label = label;
        sections.push(s);
        process.stdout.write(`${n} `);
      } catch (e) {
        try {
          const s2 = await fromChapter(n);
          if (s2) { s2.label = label; sections.push(s2); process.stdout.write(`${n}* `); }
          else process.stdout.write(`[${n} FAILED] `);
        } catch (e2) { process.stdout.write(`[${n} FAILED] `); }
      }
      await sleep(700); // this is a public site being scraped; do not hammer it
    }
    process.stdout.write('\n');
  }
  const corpus = {
    source: 'California Legislative Information (leginfo.legislature.ca.gov)',
    jurisdiction: 'CA',
    retrieved: new Date().toISOString().slice(0, 10),
    sections,
  };
  fs.writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2));
  return corpus;
}

function load() {
  if (!fs.existsSync(CORPUS_PATH)) throw new Error('No CA corpus. Run: npm run corpus:ca');
  return JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
}

module.exports = { build, load, SECTIONS, CORPUS_PATH };
