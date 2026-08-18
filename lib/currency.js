'use strict';
// Is the provision we just quoted actually still in force?
//
// The verifier proves a quote is really in the source. It cannot tell you the
// source is still good law. These are two different defects and this file
// attacks the second one.
//
// What is achievable on free data, and what is not:
//   CFR part -> the rules that amended it   PRECISE  (Federal Register API)
//   rule -> the litigation challenging it   NOT PRECISE. The FR citation of a
//     rule does not appear anywhere in CourtListener's free searchable text, so
//     a rule cannot be joined to its own case by citation. What is left is a
//     keyword screen: agency + subject + filed after the rule.
//
// So this returns a WARNING, never a holding. It is built to over-flag: for a
// consumer product the useful output is "do not rely on this without checking",
// which a screen can support and an adjudication cannot.

const FR = 'https://www.federalregister.gov/api/v1/documents.json';
const CL = 'https://www.courtlistener.com/api/rest/v4/search/';
const UA = { 'user-agent': 'lawyer-ai-probe/0.1 (citation-currency research)' };

// These are public, unauthenticated, rate-limited endpoints. Back off, and
// cache to disk so a re-run costs nothing and the numbers stay reproducible.
const CACHE = require('path').join(__dirname, '..', 'data', 'currency-cache.json');
let cache = null;
function loadCache() {
  const fs = require('fs');
  if (cache) return cache;
  cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  return cache;
}
function saveCache() {
  require('fs').writeFileSync(CACHE, JSON.stringify(cache, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, { fresh = false } = {}) {
  const c = loadCache();
  if (!fresh && c[url]) return c[url];
  let wait = 2000;
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      const j = await res.json();
      c[url] = j;
      saveCache();
      return j;
    }
    if (res.status < 500 && res.status !== 429) {
      throw new Error(`${url.split('?')[0]}: HTTP ${res.status}`);
    }
    if (i === 5) throw new Error(`${url.split('?')[0]}: HTTP ${res.status} after 5 attempts`);
    await sleep(wait);
    wait *= 2;
  }
}

// Every final rule that has amended this CFR part, newest first.
async function amendingRules(title, part) {
  const q = new URLSearchParams();
  q.set('conditions[cfr][title]', String(title));
  q.set('conditions[cfr][part]', String(part));
  q.append('conditions[type][]', 'RULE');
  q.set('order', 'newest');
  q.set('per_page', '20');
  for (const f of ['citation', 'title', 'publication_date', 'document_number', 'agencies', 'html_url', 'abstract', 'action']) {
    q.append('fields[]', f);
  }
  const d = await getJSON(`${FR}?${q}`);
  return (d.results || []).map((r) => ({
    citation: r.citation,
    title: r.title,
    date: r.publication_date,
    docNumber: r.document_number,
    url: r.html_url,
    abstract: r.abstract || '',
    action: r.action || '',
    agencies: (r.agencies || []).map((a) => a.name).filter(Boolean),
  }));
}

// An agency conceding a court loss in the CFR itself.
//
// Read the ABSTRACT, not the title. Agencies title these in euphemism --
// 29 CFR 531's is "Restoration of Regulatory Language", which matches nothing
// court-shaped, while its abstract opens "a federal appeals court issued an
// order vacating regulatory text". Title-only matching missed it entirely and
// put this detector's recall at 1 of 2 on known cases.
// Tight on purpose. An earlier, looser version included "judicial" and flagged
// 29 CFR 795, whose abstract merely says the rule is "more consistent with
// judicial precedent" -- a rule citing case law, not obeying a vacatur. Match
// only language describing a court acting AGAINST a rule.
const JUDGMENT = /\b(vacat|enjoin|injunction|set aside|court order|judgments? of (?:the )?federal court|stayed by)/i;

// The abstract usually dates the ruling, which is what makes the blind window
// measurable rather than anecdotal.
function courtActedOn(text) {
  const near = /(?:on\s+)?(\w+ \d{1,2}, \d{4})[^.]{0,120}?(?:court|vacat)|(?:court|vacat)[^.]{0,120}?(?:on\s+)(\w+ \d{1,2}, \d{4})/i.exec(text || '');
  const raw = near && (near[1] || near[2]);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function judgmentRules(rules) {
  return rules
    .filter((r) => JUDGMENT.test(`${r.title} ${r.abstract}`))
    .map((r) => {
      const ruled = courtActedOn(r.abstract);
      return {
        ...r,
        courtActedOn: ruled,
        blindDays: ruled ? Math.round((new Date(r.date) - new Date(ruled)) / 86400000) : null,
      };
    });
}

// The screen. Deliberately loose -- see the header.
function subjectTerms(title) {
  const stop = new Set('and for the of in to under with a an from into on or'.split(' '));
  return title
    .replace(/[;,.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !stop.has(w.toLowerCase()))
    .slice(0, 5);
}

async function challenges(rule) {
  const agency = rule.agencies[0] || '';
  const terms = subjectTerms(rule.title);
  if (!agency || !terms.length) return [];
  const q = new URLSearchParams();
  q.set('q', `"${agency}" ${terms.join(' ')}`);
  q.set('type', 'r'); // RECAP dockets: district-court challenges live here
  q.set('filed_after', rule.date);
  q.set('order_by', 'dateFiled desc');
  const d = await getJSON(`${CL}?${q}`);
  return (d.results || []).slice(0, 5).map((r) => ({
    case: r.caseName,
    court: r.court_id,
    docket: r.docketNumber,
    filed: r.dateFiled,
    url: r.absolute_url ? `https://www.courtlistener.com${r.absolute_url}` : null,
  }));
}

// Measured 2026-08-18 on 29 CFR 541 / 825 / 778:
//   judgment-rule detector : 1 true positive, 0 false positives. PRECISE.
//   litigation screen      : fired on all three parts; on the two control
//                            parts every case returned was unrelated (CNN v.
//                            Perplexity, NYT v. Microsoft, Uber v. NYC).
//                            0 of 9 on topic. NOISE -- reported, never trusted.
async function check(title, part, { since = '2015-01-01', screen = true } = {}) {
  const rules = await amendingRules(title, part);
  const recent = rules.filter((r) => r.date >= since);
  const judgments = judgmentRules(rules);
  const newest = recent[0];
  const litigation = screen && newest ? await challenges(newest) : [];
  return {
    cfr: `${title} CFR ${part}`,
    rules: recent,
    judgments,
    newestRule: newest,
    litigation,
    // Only the precise signal sets the flag. The screen is advisory noise and
    // must not be allowed to mark every provision in the corpus as contested.
    status: judgments.length ? 'OVERTURNED-AND-CORRECTED' : 'NO-RELIABLE-SIGNAL',
    flag: judgments.length > 0,
  };
}

module.exports = { check, amendingRules, judgmentRules, challenges };
