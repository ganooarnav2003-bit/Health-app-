// Usage: node tests/run-tests.js                 -> demo engine (no network)
//        node tests/run-tests.js --url https://YOUR-APP/api/coach   -> live AI endpoint
const cases = require('./cases.json');
const E = require('../engine.js');
const urlIdx = process.argv.indexOf('--url');
const url = urlIdx > -1 ? process.argv[urlIdx + 1] : null;

async function run(input) {
  if (!url) return E.analyze(input, { lang: 'en', now: '2026-10-31T13:00:00' });
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: input, lang: 'en', now: '2026-10-31T13:00:00' }) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function check(c, r) {
  const e = c.expect, bad = [];
  if (e.safety && r.safety.level !== e.safety) bad.push(`safety ${r.safety.level}!=${e.safety}`);
  if (e.kind && r.safety.kind !== e.kind) bad.push(`kind ${r.safety.kind}!=${e.kind}`);
  if (e.meals) for (const [n, q] of Object.entries(e.meals)) {
    const m = r.meals.find((x) => x.name.toLowerCase().includes(n) && !x.skipped);
    if (!m) bad.push(`missing ${n}`); else if (Math.abs(m.qty - q) > 0.01) bad.push(`${n} qty ${m.qty}!=${q}`);
  }
  if (e.water != null && r.water !== e.water) bad.push(`water ${r.water}!=${e.water}`);
  if (e.walkMin != null && r.walkMin !== e.walkMin) bad.push(`walk ${r.walkMin}!=${e.walkMin}`);
  if (e.walkSkipped != null && !!r.walkSkipped !== e.walkSkipped) bad.push('walkSkipped');
  if (e.clarify && !r.clarify) bad.push('no clarifying question');
  if (e.bp && !(r.bp && r.bp.s === e.bp[0] && r.bp.d === e.bp[1])) bad.push('bp not read');
  if (e.sugar != null && r.sugar !== e.sugar) bad.push('sugar not read');
  return bad;
}

(async () => {
  let pass = 0;
  console.log(`Mode: ${url ? 'LIVE ' + url : 'demo engine'}\n`);
  console.log('| # | Input | Why this case | Result | Detail |\n|---|---|---|---|---|');
  for (const c of cases) {
    let bad;
    try { bad = check(c, await run(c.input)); } catch (err) { bad = ['error: ' + err.message]; }
    if (!bad.length) pass++;
    console.log(`| ${c.id} | ${c.input.replace(/\|/g, '/')} | ${c.why} | ${bad.length ? 'FAIL' : 'pass'} | ${bad.join('; ') || '-'} |`);
  }
  console.log(`\n${pass}/${cases.length} passed`);
})();
