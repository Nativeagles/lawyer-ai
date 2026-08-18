'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { load } = require('./lib/corpus');
const { answer, MODEL } = require('./lib/app-answer');
const { index } = require('./lib/verify');
const jurisdictions = require('./lib/jurisdictions');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('No ANTHROPIC_API_KEY. Set it in .env or the environment.');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3100);
const client = new Anthropic({ maxRetries: 3 });
const fed = load();

// Every jurisdiction verifies against federal plus its own corpus, so a state
// citation is never mistaken for a fabrication.
const indexes = new Map();
for (const j of Object.values(jurisdictions.JURISDICTIONS)) {
  indexes.set(j.code, index(fed, ...jurisdictions.bodies(j)));
}

// Each question costs real money. Without a ceiling one loop or one bored
// visitor empties the account, so the cap is here rather than in a note.
const DAILY_CAP = Number(process.env.DAILY_QUESTION_CAP || 200);
const PER_IP_HOURLY = Number(process.env.PER_IP_HOURLY_CAP || 20);
const spend = { day: new Date().toDateString(), count: 0, ips: new Map() };

function allow(ip) {
  const today = new Date().toDateString();
  if (spend.day !== today) { spend.day = today; spend.count = 0; spend.ips.clear(); }
  if (spend.count >= DAILY_CAP) return { ok: false, why: 'This demo has answered its maximum number of questions for today. Try again tomorrow.' };
  const now = Date.now();
  const hits = (spend.ips.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= PER_IP_HOURLY) return { ok: false, why: 'You have asked a lot of questions in the last hour. Give it a little while.' };
  hits.push(now);
  spend.ips.set(ip, hits);
  spend.count++;
  return { ok: true };
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/api/jurisdictions') {
    return send(res, 200, { jurisdictions: jurisdictions.list(), model: MODEL, corpusAsOf: fed.asOf, federalSections: fed.sections.length });
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return send(res, 200, { ok: true, model: MODEL, asked: spend.count });
  }
  if (req.method !== 'POST' || url.pathname !== '/api/ask') return send(res, 404, { error: 'not found' });

  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 8000) req.destroy(); });
  req.on('end', async () => {
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad request' }); }
    const question = String(body.question || '').trim();
    if (question.length < 8) return send(res, 400, { error: 'Please write a bit more so I know what you are asking.' });
    if (question.length > 1200) return send(res, 400, { error: 'That is too long — try the shortest version of your question.' });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const gate = allow(ip);
    if (!gate.ok) return send(res, 429, { error: gate.why });

    const j = jurisdictions.get(body.jurisdiction);
    try {
      const started = Date.now();
      const out = await answer(question, { client, fed, jurisdiction: j, byKey: indexes.get(j.code) });
      // Questions are answered and forgotten. Nothing about them is written down.
      console.log(`[${new Date().toISOString()}] ${j.code} ${Date.now() - started}ms kept=${out.claims.length} dropped=${out.dropped}`);
      return send(res, 200, { ...out, jurisdiction: { code: j.code, label: j.name || 'Federal law only', notes: j.notes } });
    } catch (e) {
      console.error('ask failed:', e.status || '', String(e.message).slice(0, 200));
      return send(res, 502, { error: 'Something went wrong reaching the model. Please try again.' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`lawyer-ai on http://localhost:${PORT}`);
  console.log(`  model ${MODEL}, ${fed.sections.length} federal sections as of ${fed.asOf}`);
  console.log(`  jurisdictions: ${jurisdictions.list().map((x) => x.code + (x.hasStateLaw ? `(+${x.sections})` : '')).join(', ')}`);
  console.log(`  caps: ${DAILY_CAP}/day, ${PER_IP_HOURLY}/hour per visitor`);
});
